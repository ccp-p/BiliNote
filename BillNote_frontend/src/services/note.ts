import request from "@/utils/request"
import toast from 'react-hot-toast'
import {useTaskStore} from "@/store/taskStore";

interface GenerateNotePayload {
    video_url: string
    platform: "bilibili" | "youtube"
    quality: "fast" | "medium" | "slow"
}

export const generateNote = async (data: {
    video_url: string;
    link: undefined | boolean;
    screenshot: undefined | boolean;
    platform: string;
    quality: string
}) => {
    try {
        const response = await request.post("/generate_note", data)

        if (response.data.code!=0){
            if (response.data.msg){
                toast.error(response.data.msg)

            }
            return null
        }
        toast.success("笔记生成任务已提交！")

        const taskId = response.data.data.task_id

        console.log('res',response)
        // 成功提示
        useTaskStore.getState().addPendingTask(taskId, data.platform)

        return response.data
    } catch (e: any) {
        console.error("❌ 请求出错", e)

        // 错误提示
        toast.error(
             "笔记生成失败，请稍后重试"
        )

        throw e // 抛出错误以便调用方处理
    }
}

// New function for file upload
export const uploadFileAndGenerateNote = async (data: {
    file: File;
    link: boolean | undefined;
    screenshot: boolean | undefined;
    quality: string; // Quality might still be relevant for processing
}) => {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('quality', data.quality);
    formData.append('screenshot', String(data.screenshot || false));
    formData.append('link', String(data.link || false)); // Link might not be applicable for local files, adjust as needed

    try {
        const response = await request.post("/upload_generate_note", formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        if (response.data.code != 0) {
            if (response.data.msg) {
                toast.error(response.data.msg);
            } else {
                toast.error("文件上传或笔记生成失败");
            }
            return null;
        }

        toast.success("文件上传成功，笔记生成任务已提交！");

        const taskId = response.data.data.task_id;
        const fileName = data.file.name; // Get filename

        console.log('Upload response', response);
        // Add pending task using the filename
        useTaskStore.getState().addPendingTask(taskId, 'local', fileName);

        return response.data;
    } catch (e: any) {
        console.error("❌ 文件上传请求出错", e);
        toast.error("文件上传失败，请稍后重试");
        throw e; // 抛出错误以便调用方处理
    }
};

export const delete_task = async ({video_id, platform}: { video_id: string, platform: string }) => { // Add type annotation
    try {
        const data={
            video_id,platform
        }
        const res = await request.post("/delete_task",
            data
        )

        if (res.data.code === 0) {
            toast.success("任务已成功删除")
            return res.data
        } else {
            toast.error(res.data.message || "删除失败")
            throw new Error(res.data.message || "删除失败")
        }
    } catch (e) {
        toast.error("请求异常，删除任务失败")
        console.error("❌ 删除任务失败:", e)
        throw e
    }
}

export const get_task_status=async (task_id:string)=>{
    try {
        const response = await request.get("/task_status/"+task_id)

        if (response.data.code==0 && response.data.status=='SUCCESS') {
            // toast.success("笔记生成成功")
        }
        console.log('res',response)
        // 成功提示

        return response.data
    }
    catch (e){
        console.error("❌ 请求出错", e)

        // 错误提示
        toast.error(
            "笔记生成失败，请稍后重试"
        )

        throw e // 抛出错误以便调用方处理
    }
}