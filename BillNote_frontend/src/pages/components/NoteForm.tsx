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
import { Info, Clock, Upload, X, File as FileIcon } from "lucide-react"
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
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tasks = useTaskStore((state) => state.tasks)
    const setCurrentTask = useTaskStore((state) => state.setCurrentTask)
    const currentTaskId = useTaskStore(state => state.currentTaskId)
    tasks.find((t) => t.id === selectedTaskId);
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
        const file = event.target.files?.[0];
        if (file) {
            const allowedTypes = ['text/plain', 'audio/mpeg', 'video/mp4'];
            if (!allowedTypes.includes(file.type)) {
                toast.error("不支持的文件类型。请上传 txt, mp3 或 mp4 文件。");
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
                return;
            }

            setSelectedFile(file);
            form.setValue("video_url", "");
            form.setValue("platform", "local");
            form.clearErrors("video_url");
        }
    };

    const clearFile = () => {
        setSelectedFile(null);
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

        if (selectedFile) {
            await uploadFileAndGenerateNote({
                file: selectedFile,
                quality: data.quality,
                screenshot: data.screenshot,
                link: data.link,
            });
        } else if (data.video_url) {
            if (data.platform === 'local') {
                toast.error("请选择哔哩哔哩或 Youtube 平台以使用视频链接。");
                form.setError("platform", { message: "请选择正确的平台" });
                return;
            }
            await generateNote({
                video_url: data.video_url,
                platform: data.platform,
                quality: data.quality,
                screenshot: data.screenshot,
                link: data.link
            });
        } else {
            form.setError("video_url", { message: "请输入视频链接或选择一个文件" });
            toast.error("请输入视频链接或选择一个文件");
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
                                        <p className="text-xs ">输入视频链接，或上传本地 txt/mp3/mp4 文件</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        {!selectedFile ? (
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
                                                disabled={!!selectedFile}
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
                                                    disabled={!!selectedFile}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                                <div className="flex items-center gap-2 truncate">
                                    <FileIcon className="h-5 w-5 text-primary flex-shrink-0" />
                                    <span className="text-sm text-neutral-700 truncate" title={selectedFile.name}>
                                        {selectedFile.name}
                                    </span>
                                </div>
                                <Button variant="ghost" size="icon" onClick={clearFile} className="h-6 w-6">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}

                        <Input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".txt,.mp3,.mp4,text/plain,audio/mpeg,video/mp4"
                        />

                        {!selectedFile && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={triggerFileInput}
                                className="w-full flex items-center gap-2"
                            >
                                <Upload className="h-4 w-4" />
                                上传本地文件 (txt/mp3/mp4)
                            </Button>
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
                                        disabled={!!selectedFile}
                                    />
                                </FormControl>
                                <FormLabel
                                    htmlFor="link"
                                    className={`text-sm font-medium leading-none ${selectedFile ? 'text-neutral-400 cursor-not-allowed' : ''}`}
                                >
                                    是否插入内容跳转链接 (仅支持在线视频)
                                </FormLabel>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="screenshot"
                        render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        id="screenshot"
                                        disabled={selectedFile?.type === 'text/plain' || selectedFile?.type === 'audio/mpeg'}
                                    />
                                </FormControl>
                                <FormLabel
                                    htmlFor="screenshot"
                                    className={`text-sm font-medium leading-none ${selectedFile?.type === 'text/plain' || selectedFile?.type === 'audio/mpeg' ? 'text-neutral-400 cursor-not-allowed' : ''}`}
                                >
                                    是否插入视频截图 (仅支持视频文件/链接)
                                </FormLabel>
                            </FormItem>
                        )}
                    />

                    <Button
                        type="submit"
                        className="w-full bg-primary cursor-pointer"
                        disabled={isGenerating}
                    >
                        {isGenerating ? "正在处理…" : "生成笔记"}
                    </Button>
                </form>
            </Form>

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
                        <span>支持 B站/YouTube 链接或本地 txt/mp3/mp4 文件</span>
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
