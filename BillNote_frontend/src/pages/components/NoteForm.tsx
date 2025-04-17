import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Clock, Upload, X, File as FileIcon, Files } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { generateNote, uploadFileAndGenerateNote } from "@/services/note.ts";
import { useTaskStore } from "@/store/taskStore";
import { useState, useRef, ChangeEvent } from "react"
import NoteHistory from "@/pages/components/NoteHistory.tsx";

// ✅ 定义表单 schema
const formSchema = z.object({
    video_url: z.string().url("请输入正确的视频链接").optional().or(z.literal('')),
    platform: z.string().nonempty("请选择平台"),
    quality: z.enum(["fast", "medium", "slow"], {
        required_error: "请选择音频质量",
    }),
    screenshot: z.boolean().optional(),
    link: z.boolean().optional(),
})

type NoteFormValues = z.infer<typeof formSchema>

const NoteForm = () => {
    const [selectedTaskId] = useState<string | null>(null)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tasks = useTaskStore((state) => state.tasks)
    const setCurrentTask = useTaskStore((state) => state.setCurrentTask)
    const currentTaskId = useTaskStore(state => state.currentTaskId)
    const form = useForm<NoteFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            video_url: "",
            platform: "bilibili",
            quality: "medium",
            screenshot: false,
            link: false,
        },
    })

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const allowedTypes = ['text/plain', 'audio/mpeg', 'video/mp4'];
            const validFiles = Array.from(files).filter(file => {
                 if (!allowedTypes.includes(file.type)) {
                    toast.error(`不支持的文件类型: ${file.name}. 只允许 txt, mp3, mp4.`);
                    return false;
                 }
                 return true;
            });

            if (validFiles.length > 0) {
                setSelectedFiles(prevFiles => [...prevFiles, ...validFiles]);
                form.setValue("video_url", "");
                form.setValue("platform", "local");
                form.clearErrors("video_url");
            }

             if (fileInputRef.current) {
                fileInputRef.current.value = "";
             }
        }
    };

    const removeFile = (indexToRemove: number) => {
        setSelectedFiles(prevFiles => {
            const newFiles = prevFiles.filter((_, index) => index !== indexToRemove);
            if (newFiles.length === 0) {
                 form.setValue("platform", "bilibili");
            }
            return newFiles;
        });
    };

    const clearAllFiles = () => {
        setSelectedFiles([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        form.setValue("platform", "bilibili");
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const isGenerating = form.formState.isSubmitting;

    const onSubmit = async (data: NoteFormValues) => {
        console.log("🎯 提交内容：", data)
        form.clearErrors();

        if (selectedFiles.length > 0) {
            let allSucceeded = true;
            const uploadPromises = selectedFiles.map(file =>
                uploadFileAndGenerateNote({
                    file: file,
                    quality: data.quality,
                    screenshot: data.screenshot,
                    link: data.link,
                }).catch(e => {
                    allSucceeded = false;
                    console.error(`上传文件 ${file.name} 失败:`, e);
                    return null;
                })
            );

            await Promise.allSettled(uploadPromises);

            if (allSucceeded) {
                 toast.success(`已提交 ${selectedFiles.length} 个文件的笔记生成任务。`);
                 clearAllFiles();
            } else {
                 toast.error("部分文件上传或处理失败，请检查历史记录。");
            }

        } else if (data.video_url) {
             if (data.platform === 'local') {
                toast.error("请选择哔哩哔哩或 Youtube 平台以使用视频链接。");
                form.setError("platform", { message: "请选择正确的平台" });
                return;
            }
            try {
                await generateNote({
                    video_url: data.video_url,
                    platform: data.platform,
                    quality: data.quality,
                    screenshot: data.screenshot,
                    link: data.link
                });
                form.reset();
            } catch (e) {
            }
        } else {
            form.setError("video_url", { message: "请输入视频链接或选择至少一个文件" });
            toast.error("请输入视频链接或选择至少一个文件");
        }
    }

    return (
        <div className="flex flex-col h-full">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between my-3">
                            <h2 className="block  ">视频链接或本地文件</h2>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-neutral-400 hover:text-primary cursor-pointer" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="text-xs ">输入视频链接，或上传本地 txt/mp3/mp4 文件 (可多选)</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        {selectedFiles.length === 0 ? (
                            <div className="flex gap-2">
                                <FormField
                                    control={form.control}
                                    name="platform"
                                    render={({ field }) => (
                                        <FormItem>
                                            <Select
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    if (value === 'local') {
                                                        triggerFileInput();
                                                    }
                                                }}
                                                value={field.value}
                                                disabled={selectedFiles.length > 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="w-32">
                                                        <SelectValue placeholder="选择平台" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="bilibili">哔哩哔哩</SelectItem>
                                                    <SelectItem value="youtube">Youtube</SelectItem>
                                                    <SelectItem value="local" disabled>本地文件</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="video_url"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormControl>
                                                <Input
                                                    placeholder="粘贴视频链接 (B站/Youtube)"
                                                    {...field}
                                                    disabled={selectedFiles.length > 0}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        ) : (
                            <div className="space-y-2 border rounded-md p-2 max-h-32 overflow-y-auto">
                                <div className="flex justify-between items-center mb-1">
                                     <span className="text-sm font-medium text-neutral-600 flex items-center gap-1">
                                         <Files className="h-4 w-4"/>
                                         已选择 {selectedFiles.length} 个文件
                                     </span>
                                     <Button variant="ghost" size="sm" onClick={clearAllFiles} className="text-xs h-auto px-2 py-1">
                                         全部清除
                                     </Button>
                                </div>
                                {selectedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between p-1 bg-muted/30 rounded text-xs">
                                        <div className="flex items-center gap-1 truncate">
                                            <FileIcon className="h-3 w-3 text-primary flex-shrink-0" />
                                            <span className="truncate" title={file.name}>{file.name}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => removeFile(index)} className="h-5 w-5 flex-shrink-0">
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".txt,.mp3,.mp4,text/plain,audio/mpeg,video/mp4"
                            multiple
                        />

                        <Button
                            type="button"
                            variant="outline"
                            onClick={triggerFileInput}
                            className="w-full flex items-center gap-2"
                            disabled={!!form.getValues("video_url")}
                        >
                            <Upload className="h-4 w-4" />
                            {selectedFiles.length > 0 ? "添加更多文件" : "上传本地文件 (txt/mp3/mp4)"}
                        </Button>
                        {form.formState.errors.video_url && !selectedFiles.length && (
                             <p className="text-sm text-destructive">{form.formState.errors.video_url.message}</p>
                        )}

                        <FormField
                            control={form.control}
                            name="quality"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex items-center justify-between my-3">
                                        <h2 className="block  ">处理质量</h2>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Info className="h-4 w-4 text-neutral-400 hover:text-primary cursor-pointer" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="text-xs max-w-[200px]">质量越高，处理时间越长（推荐中等）</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="选择质量" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="fast">快速</SelectItem>
                                            <SelectItem value="medium">中等（推荐）</SelectItem>
                                            <SelectItem value="slow">高质量</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="link"
                        render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        id="link"
                                        disabled={selectedFiles.length > 0}
                                    />
                                </FormControl>
                                <FormLabel
                                    htmlFor="link"
                                    className={`text-sm font-medium leading-none ${selectedFiles.length > 0 ? 'text-neutral-400 cursor-not-allowed' : ''}`}
                                >
                                    是否插入内容跳转链接 (仅支持在线视频)
                                </FormLabel>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="screenshot"
                        render={({ field }) => {
                            const hasTextOrAudio = selectedFiles.some(file =>
                                file.type === 'text/plain' || file.type === 'audio/mpeg'
                            );
                            const isDisabled = hasTextOrAudio;

                            return (
                                <FormItem className="flex items-center space-x-2">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            id="screenshot"
                                            disabled={isDisabled}
                                        />
                                    </FormControl>
                                    <FormLabel
                                        htmlFor="screenshot"
                                        className={`text-sm font-medium leading-none ${isDisabled ? 'text-neutral-400 cursor-not-allowed' : ''}`}
                                    >
                                        是否插入视频截图 (仅支持视频文件/链接)
                                    </FormLabel>
                                </FormItem>
                            );
                        }}
                    />

                    <Button
                        type="submit"
                        className="w-full bg-primary cursor-pointer"
                        disabled={isGenerating || (selectedFiles.length === 0 && !form.getValues("video_url"))}
                    >
                        {isGenerating ? "正在处理…" : "生成笔记"}
                    </Button>
                </form>
            </Form>

            {/* 修复：将 Clock 和 h2 放入同一个 div */}
            <div className="flex items-center gap-2 my-4">
                <Clock className="h-4 w-4 text-neutral-500" />
                <h2 className="text-base font-medium text-neutral-900">生成历史</h2>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
                <NoteHistory onSelect={setCurrentTask} selectedId={currentTaskId} />
            </div>

            <div className="mt-6 p-4 bg-primary-light rounded-lg">
                <h3 className="font-medium text-primary mb-2">功能介绍</h3>
                <ul className="text-sm space-y-2 text-neutral-600">
                    <li className="flex items-start gap-2">
                        <span className="text-primary font-bold">•</span>
                        <span>自动提取视频/音频/文本内容，生成结构化笔记</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-primary font-bold">•</span>
                        <span>支持 B站/YouTube 链接或本地 txt/mp3/mp4 文件 (可批量上传)</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-primary font-bold">•</span>
                        <span>一键复制笔记，支持Markdown格式</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-primary font-bold">•</span>
                        <span>可选择是否插入截图 (视频) 或跳转链接 (在线视频)</span>
                    </li>
                </ul>
            </div>
        </div>
    )
}

export default NoteForm
