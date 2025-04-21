import os
import requests
import json
from typing import List
from datetime import timedelta
from requests.cookies import RequestsCookieJar # <--- 添加这一行导入

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
        self.auth_endpoint = "api/auth/github" # 定义你的认证接口路径
        # 1. 使用 requests.Session 管理 Cookie
        self.session = requests.Session()
        initial_cookies_str = os.getenv("CUSTOM_MODEL_COOKIES", "")
        self.session.cookies = self.parse_cookie_string_to_jar(initial_cookies_str)

        self.model = os.getenv("CUSTOM_MODEL", "gpt4.1")
        self.temperature = 0.7
        self.top_p = 1.0
        self.max_tokens = 2048
        self.screenshot = False
        self.link = False
        # cookies占位
        self.cookies = os.getenv("CUSTOM_MODEL_COOKIES","")  
        self.auth_url = self.api_base_url + self.auth_endpoint
        self.gpt_url = self.api_base_url + self.api_endpoint

    def _format_time(self, seconds: float) -> str:
        seconds = max(0, seconds)
        return str(timedelta(seconds=int(seconds)))[2:]

    def _build_segment_text(self, segments: List[TranscriptSegment]) -> str:
        return "\n".join(
            f"{self._format_time(seg.start)} - {seg.text.strip()}"
            for seg in segments
        )
    def parse_cookie_string_to_jar(self, cookie_str: str) -> RequestsCookieJar:
        """将 Cookie 字符串解析为 RequestsCookieJar"""
        jar = RequestsCookieJar()
        if not cookie_str:
            return jar
        for item in cookie_str.split(";"):
            item = item.strip()
            if "=" in item:
                name, value = item.split("=", 1)
                # 注意：更严谨的解析可能需要处理 domain 和 path，但对于简单场景 set 即可
                jar.set(name, value)
        return jar
    def _perform_auth(self):
        """执行认证请求"""
        logger.info(f"检测到认证可能失效，尝试通过 {self.auth_url} 重新认证...")
        try:
            # 5. 使用同一个 session 请求认证接口
            # 根据你的 /auth 接口要求，可能需要添加 headers, data 或 json 参数
            # 需要请求参数github_token
            github_token = os.getenv("GITHUB_TOKEN")
            json  ={
                "token": github_token,
            }
            auth_response = self.session.post(self.auth_url,json=json, timeout=60) # 或者 GET 等
            auth_response.raise_for_status() # 检查 HTTP 错误

            # Session 会自动处理 Set-Cookie，无需手动操作
            logger.info("认证请求成功，Session Cookie 已自动更新。")
            # 可选：记录新的 Cookie (注意敏感信息)
            # logger.debug(f"更新后的 Cookies: {self.session.cookies.get_dict()}")
            # 可选：如果需要，更新 .env 文件中的值（通常不推荐在运行时修改 .env）
            # os.environ["CUSTOM_MODEL_COOKIES"] = self.get_cookie_string_from_jar()
            return True # 表示认证成功

        except requests.exceptions.RequestException as e:
            logger.error(f"认证请求失败: {e}")
            # 可以选择抛出异常或返回 False
            # raise RuntimeError("认证失败，无法继续。") from e
            return False # 表示认证失败

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
            "🎬 Transcript Segments R(Format: Start Time - Text):\n\n---\n{segment_text}\n---", ""
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
    def summarize(self, source: GPTSource, retry_attempt=0) -> str:
        # 7. 限制重试次数
        max_retries = 1
        if retry_attempt > max_retries:
            logger.error(f"尝试 {max_retries} 次认证后仍然失败。")
            raise RuntimeError(f"尝试 {max_retries} 次认证后仍然失败。")

        self.screenshot = source.screenshot
        self.link = getattr(source, "link", False)
        source.segment = self.ensure_segments_type(source.segment)
        messages = self.create_messages(source.segment, source.title, source.tags)

        payload = {
            "messages": messages, "model": self.model, "temperature": self.temperature,
            "top_p": self.top_p, "max_tokens": self.max_tokens
        }
        headers = { "Content-Type": "application/json", "Accept": "text/event-stream" }

        logger.info(f"请求 Custom GPT: {self.gpt_url} (尝试次数 {retry_attempt + 1})")
        response = None # 初始化 response 变量
        try:
            # 3. 使用 session 发起请求
            response = self.session.post(
                self.gpt_url,
                headers=headers,
                json=payload,
                stream=True,
                timeout=120
            )

            # 检查其他非 200 的 HTTP 错误
            if response.status_code != 200:
                 logger.error(f"请求失败，非预期状态码: {response.status_code}")
                 response.raise_for_status() # 这会触发下面的 RequestException

        except requests.exceptions.RequestException as e:
            # 处理请求本身发生的错误 (连接错误、超时等) 或 raise_for_status() 抛出的错误
            logger.error(f"Custom GPT API 请求失败: {e}")
            if response: # 如果有响应对象，尝试关闭
                response.close()
            # 对于非 200 的 HTTP 错误或连接错误，直接抛出
            raise RuntimeError(f"Custom GPT API 请求失败: {e}") from e


        # --- 处理 200 OK 的流式响应 ---
        full_text = ""
        first_chunk_processed = False
        auth_error_detected = False # 新增标记，用于判断是否因认证错误退出循环
        stream_iterator = None # 初始化迭代器变量

        try:
            stream_iterator = response.iter_lines(decode_unicode=True)
            for line in stream_iterator:
                if not line:
                    continue
                if line.startswith("data: "):
                    data = line[6:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)

                        # *** 主要改动：在处理第一块数据时检查特定错误 ***
                        if not first_chunk_processed:
                            first_chunk_processed = True # 标记已处理第一块
                            error_message = parsed.get("error")
                            if isinstance(error_message, str) and "No valid token available" in error_message:
                                logger.warning("在响应流的第一块数据中检测到认证错误 'No valid token available'。")
                                auth_error_detected = True # 设置标记
                                break # 检测到错误，跳出流处理循环
                        # *** 检查结束 ***

                        # 正常处理逻辑 (仅在未检测到认证错误时执行)
                        if not auth_error_detected:
                            if parsed.get("choices") and parsed["choices"][0].get("delta") and parsed["choices"][0]["delta"].get("content"):
                                content = parsed["choices"][0]["delta"]["content"]
                                full_text += content
                            # 可选：处理流中可能出现的其他错误消息
                            elif "error" in parsed:
                                 logger.error(f"流中收到错误消息: {parsed['error']}")
                                 # 根据需要决定是否中断或继续

                    except json.JSONDecodeError:
                        logger.warning(f"跳过无效的 JSON 数据块: {data}")
                        continue
                    except Exception as parse_err: # 捕获其他可能的解析错误
                         logger.error(f"处理流数据块时出错: {parse_err} - 数据: {data}")
                         continue # 跳过有问题的数据块

        except Exception as stream_err:
             logger.error(f"读取响应流时出错: {stream_err}")
             # 如果流读取出错，直接抛出异常
             raise RuntimeError(f"读取响应流时出错: {stream_err}") from stream_err
        finally:
             # 确保关闭响应，释放连接
             if response:
                 response.close()

        # --- 在流处理结束后，检查是否因为认证错误退出 ---
        if auth_error_detected:
            logger.info("尝试重新认证...")
            if self._perform_auth():
                logger.info("重新认证成功，重试请求...")
                return self.summarize(source, retry_attempt + 1) # 6. 重试
            else:
                logger.error("重新认证失败。")
                raise RuntimeError("认证失败，无法完成请求。")

        # 如果一切正常（没有检测到需要重试的认证错误），返回结果
        logger.info("请求处理完成，返回结果。")
        return full_text.strip()