import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {delete_task} from "@/services/note.ts";

export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILD'

export interface AudioMeta {
    cover_url: string
    duration: number
    file_path: string
    platform: string
    raw_info: any
    title: string
    video_id: string
}

export interface Segment {
    start: number
    end: number
    text: string
}

export interface Transcript {
    full_text: string
    language: string
    raw: any
    segments: Segment[]
}

export interface Task {
    id: string
    markdown: string
    transcript: Transcript
    status: TaskStatus
    audioMeta: AudioMeta
    createdAt: string
}

interface TaskStore {
    tasks: Task[]
    currentTaskId: string | null
    addPendingTask: (taskId: string, platform: string, fileName?: string) => void
    updateTaskContent: (id: string, data: Partial<Omit<Task, "id" | "createdAt">>) => void
    removeTask: (id: string) => void
    clearTasks: () => void
    setCurrentTask: (taskId: string | null) => void
    getCurrentTask: () => Task | null
}

export const useTaskStore = create<TaskStore>()(
    persist(
        (set,get) => ({
            tasks: [],
            currentTaskId: null,

            addPendingTask: (taskId: string, platform: string, fileName?: string) =>
                set((state) => ({
                    tasks: [
                        {
                            id: taskId,
                            status: "PENDING",
                            markdown: "",
                            platform: platform,
                            transcript: {
                                full_text: "",
                                language: "",
                                raw: null,
                                segments: [],
                            },
                            createdAt: new Date().toISOString(),
                            audioMeta: {
                                cover_url: "",
                                duration: 0,
                                file_path: "",
                                platform: platform,
                                raw_info: null,
                                title: platform === 'local' && fileName ? fileName : "加载中...",
                                video_id: platform === 'local' ? taskId : "",
                            },
                        },
                        ...state.tasks,
                    ],
                })),

            updateTaskContent: (id, data) =>
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id ? { ...task, ...data } : task
                    ),
                })),
            getCurrentTask: () => {
                const currentTaskId = get().currentTaskId
                return get().tasks.find((task) => task.id === currentTaskId) || null
            },
            removeTask: async (id) => {
                const task = get().tasks.find((t) => t.id === id)
                const isLocal = task?.platform === 'local';

                // 更新 Zustand 状态
                set((state) => ({
                    tasks: state.tasks.filter((task) => task.id !== id),
                    currentTaskId: state.currentTaskId === id ? null : state.currentTaskId,
                }))

                // 调用后端删除接口（如果找到了任务且不是本地文件）
                // 本地文件可能不需要后端删除，或者需要不同的逻辑
                if (task && !isLocal) {
                    await delete_task({
                        video_id: task.audioMeta.video_id,
                        platform: task.platform,
                    })
                } else if (task && isLocal) {
                    // TODO: Add logic for deleting local file tasks if needed
                    console.log("本地文件任务删除（前端状态已更新）:", id);
                    // Optionally call a different backend endpoint for local files
                     await delete_task({
                        video_id: task.id, // Assuming task ID is used for local files
                        platform: task.platform,
                    })
                }
            },

            clearTasks: () => set({ tasks: [], currentTaskId: null }),

            setCurrentTask: (taskId) => set({ currentTaskId: taskId }),
        }),
        {
            name: 'task-storage',
        }
    )
)
