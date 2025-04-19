import os
import requests
import json
from typing import List
from datetime import timedelta

from app.gpt.base import GPT
from app.gpt.prompt import BASE_PROMPT, AI_SUM, SCREENSHOT, LINK
from app.models.gpt_model import GPTSource
from app.models.transcriber_model import TranscriptSegment
from app.utils.logger import get_logger

logger = get_logger(__name__)

class CustomGPT(GPT):
    def __init__(self):
        self.api_base_url = os.getenv("CUSTOM_API_BASE_URL", "http://localhost:3000")
        self.api_endpoint = "/api/chat/completions"
        self.model = os.getenv("CUSTOM_MODEL", "gpt4.1")
        self.temperature = 0.7
        self.top_p = 1.0
        self.max_tokens = 2048
        self.screenshot = False
        self.link = False
        # cookies占位
        self.cookies = os.getenv("CUSTOM_MODEL_COOKIES","")  

    def _format_time(self, seconds: float) -> str:
        seconds = max(0, seconds)
        return str(timedelta(seconds=int(seconds)))[2:]

    def _build_segment_text(self, segments: List[TranscriptSegment]) -> str:
        return "\n".join(
            f"{self._format_time(seg.start)} - {seg.text.strip()}"
            for seg in segments
        )

    def ensure_segments_type(self, segments) -> List[TranscriptSegment]:
        return [
            TranscriptSegment(**seg) if isinstance(seg, dict) else seg
            for seg in segments
        ]

    def create_messages(self, segments: List[TranscriptSegment], title: str, tags: str):
        system_content = BASE_PROMPT.format(
            video_title=title,
            segment_text="",  # 留空，实际内容放到user
            tags=tags
        )
        system_content = system_content.replace(
            "🎬 Transcript Segments (Format: Start Time - Text):\n\n---\n{segment_text}\n---", ""
        ).strip()
        if self.screenshot:
            system_content += "\n\n" + SCREENSHOT
        if self.link:
            system_content += "\n\n" + LINK

        user_content = f"🎬 Transcript Segments (Format: Start Time - Text):\n\n---\n{self._build_segment_text(segments)}\n---\n\n{AI_SUM}"
        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content}
        ]
        return messages
    def parse_cookie_string(self,cookie_str):
        cookies = {}
        for item in cookie_str.split(";"):
            if "=" in item:
                k, v = item.strip().split("=", 1)
                cookies[k] = v
        return cookies
    def summarize(self, source: GPTSource) -> str:
        self.screenshot = source.screenshot
        self.link = getattr(source, "link", False)
        source.segment = self.ensure_segments_type(source.segment)
        # source.segment类型
        messages = self.create_messages(source.segment, source.title, source.tags)

        payload = {
            "messages": messages,
            "model": self.model,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "max_tokens": self.max_tokens
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        }
        # cookies占位
        cookies = self.parse_cookie_string(self.cookies)

        url = self.api_base_url.rstrip("/") + self.api_endpoint
        logger.info(f"Requesting custom GPT: {url}")
        try:
            response = requests.post(url, headers=headers, json=payload, cookies=cookies, stream=True, timeout=120)
        except requests.exceptions.RequestException as e:
            logger.error(f"Custom GPT API request failed: {e}")
        if response.status_code != 200:
            logger.error(f"Custom GPT API error: {response.status_code} {response.text}")
            raise RuntimeError(f"Custom GPT API error: {response.status_code}")

        full_text = ""
        for line in response.iter_lines(decode_unicode=False):
            if not line:
                continue
            try:
                line = line.decode("utf-8")
            except UnicodeDecodeError:
                logger.warning(f"无法解码的行: {line}")
                continue
            # 处理数据行
            if line.startswith("data: "):
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                try:
                    parsed = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning(f"跳过不完整的JSON: {data}")
                    continue
                if parsed.get("choices") and parsed["choices"][0].get("delta") and parsed["choices"][0]["delta"].get("content"):
                    content = parsed["choices"][0]["delta"]["content"]
                    # 直接拼接，不做二次编码转换
                    full_text += content
        return full_text.strip()