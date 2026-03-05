'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Trash2, Bot, User, MoreHorizontal, Loader2, MessageSquare, ChevronDown, ImagePlus, X, Video, Clock, Film } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgent } from '@/hooks/useAgents';
import MultiAgentSteps, { type AgentStep, type MultiAgentData } from './MultiAgentSteps';
import type { VideoTaskResponse } from '@/types';

interface ChatInterfaceProps {
  agentId: string;
}

interface ChatSession {
  id: string;
  title: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
  created_at?: string;
  multi_agent?: MultiAgentData;
}

// 图片附件类型
interface ImageAttachment {
  id: string;
  dataUrl: string;
  name: string;
}

// ---------------------------------------------------------------------------
// 视频选项映射表（避免 if-else）
// ---------------------------------------------------------------------------
const VIDEO_MODE_OPTIONS = [
  { value: 'text_to_video', label: '文字生成视频', needsImage: false },
  { value: 'image_to_video', label: '图片生成视频', needsImage: true },
  { value: 'edit', label: '视频编辑', needsImage: true },
] as const;

const VIDEO_QUALITY_OPTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
] as const;

const VIDEO_ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '1:1', label: '1:1 方形' },
] as const;

const VIDEO_STYLE_OPTIONS = [] as const; // xAI API 不支持 mode 参数，保留定义避免类型引用报错

// 视频状态 → 显示标签/颜色映射
const VIDEO_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:    { label: '排队中',  variant: 'secondary' },
  processing: { label: '生成中',  variant: 'default' },
  completed:  { label: '已完成',  variant: 'outline' },
  failed:     { label: '失败',    variant: 'destructive' },
};

interface VideoConfig {
  duration: number;
  quality: string;
  aspect_ratio: string;
  mode: string;
  video_mode: string;
}

// 解析 __VIDEO_DONE__ 消息标记
const VIDEO_MSG_PREFIX = '__VIDEO_DONE__';
function parseVideoMessage(content: string): { taskId: string; videoUrl: string; quality: string; duration: number; cost: number } | null {
  if (!content.startsWith(VIDEO_MSG_PREFIX)) return null;
  const parts = content.slice(VIDEO_MSG_PREFIX.length).split('|');
  return parts.length >= 5
    ? { taskId: parts[0], videoUrl: parts[1], quality: parts[2], duration: parseFloat(parts[3]) || 0, cost: parseFloat(parts[4]) || 0 }
    : null;
}

// 提取助手消息中的图片URL
function extractImageUrl(content: string): string | null {
  const match = content.match(/!\[image\]\((\/api\/media\/[^)]+)\)/);
  return match ? match[1] : null;
}

export default function ChatInterface({ agentId }: ChatInterfaceProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // 获取 Agent 信息（判断 video 类型）
  const { agent } = useAgent(agentId);
  const isVideoAgent = agent?.agent_type === 'video';

  // 视频配置状态
  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    duration: 5,
    quality: '720p',
    aspect_ratio: '16:9',
    mode: 'normal',
    video_mode: 'text_to_video',
  });

  // 活跃视频任务轮询
  const [activeVideoTasks, setActiveVideoTasks] = useState<Map<string, VideoTaskResponse>>(new Map());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useSWR(
    agentId ? `/chats/?agent_id=${agentId}` : null,
    fetcher
  );

  // Auto select first session
  useEffect(() => {
    if (sessions && sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions]);

  // Fetch messages
  useEffect(() => {
    if (selectedSessionId) {
      setMessages([]);
      api.get(`/chats/${selectedSessionId}/messages`)
        .then(res => setMessages(res.data))
        .catch(err => toast({ variant: "destructive", title: "Failed to load messages" }));
    }
  }, [selectedSessionId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 280);
      textarea.style.height = `${newHeight}px`;
      
      if (textarea.scrollHeight > 280) {
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.overflowY = 'hidden';
      }
    }
  }, [inputValue]);

  // ---------------------------------------------------------------------------
  // 视频任务轮询
  // ---------------------------------------------------------------------------
  const pollVideoTask = useCallback(async (taskId: string) => {
    try {
      const res = await api.get(`/videos/${taskId}/status`);
      const task: VideoTaskResponse = res.data;
      setActiveVideoTasks(prev => {
        const next = new Map(prev);
        next.set(taskId, task);
        // 终态：移除活跃任务并插入完成消息
        const terminal = task.status === 'completed' || task.status === 'failed';
        terminal && next.delete(taskId);
        return next;
      });

      // 终态时更新消息列表中占位消息
      const terminal = task.status === 'completed' || task.status === 'failed';
      terminal && setMessages(prev => prev.map(msg => {
        const content = typeof msg.content === 'string' ? msg.content : '';
        return content === `__VIDEO_PENDING__${taskId}`
          ? {
              ...msg,
              content: task.status === 'completed' && task.video_url
                ? `${VIDEO_MSG_PREFIX}${taskId}|${task.video_url}|${task.quality}|${task.duration}|${task.credit_cost}`
                : `[视频生成失败] ${task.error_message || '未知错误'}`,
            }
          : msg;
      }));
    } catch (err) {
      console.error('Video poll error:', err);
    }
  }, []);

  useEffect(() => {
    // 清除上一次轮询
    pollingRef.current && clearInterval(pollingRef.current);

    const taskIds = Array.from(activeVideoTasks.keys());
    taskIds.length > 0 && (pollingRef.current = setInterval(() => {
      taskIds.forEach(id => pollVideoTask(id));
    }, 3000));

    return () => { pollingRef.current && clearInterval(pollingRef.current); };
  }, [activeVideoTasks.size, pollVideoTask]);

  // 清理轮询（组件卸载）
  useEffect(() => () => { pollingRef.current && clearInterval(pollingRef.current); }, []);

  // ---------------------------------------------------------------------------
  // 视频任务提交
  // ---------------------------------------------------------------------------
  const handleSendVideoTask = async () => {
    if (!inputValue.trim() || !selectedSessionId || isStreaming) return;

    const prompt = inputValue;
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsStreaming(true);

    try {
      // 如果需要图片但没有，提示用户
      const currentMode = VIDEO_MODE_OPTIONS.find(o => o.value === videoConfig.video_mode);
      const imageUrl = images.length > 0 ? images[0].dataUrl : editImageUrl;
      
      const body = {
        agent_id: agentId,
        session_id: selectedSessionId,
        video_mode: videoConfig.video_mode,
        prompt,
        image_url: currentMode?.needsImage ? imageUrl : undefined,
        config: {
          duration: videoConfig.duration,
          quality: videoConfig.quality,
          aspect_ratio: videoConfig.aspect_ratio,
        },
      };

      const res = await api.post('/videos/', body);
      const task: VideoTaskResponse = res.data;

      // 添加占位消息
      const placeholderMsg: ChatMessage = {
        role: 'assistant',
        content: `__VIDEO_PENDING__${task.id}`,
      };
      setMessages(prev => [...prev, placeholderMsg]);

      // 加入轮询队列
      setActiveVideoTasks(prev => {
        const next = new Map(prev);
        next.set(task.id, task);
        return next;
      });

      setImages([]);
      setEditImageUrl(null);

      toast({ title: '视频任务已提交', description: `任务 ID: ${task.id.slice(0, 8)}...` });

    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail || '提交失败';
      setMessages(prev => [...prev, { role: 'system', content: `[Error] ${detail}` }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCreateSession = async () => {
    if (!agentId) return;
    try {
      const res = await api.post('/chats/', {
        title: `New Chat ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
        agent_id: agentId
      });
      mutate(`/chats/?agent_id=${agentId}`);
      setSelectedSessionId(res.data.id);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create chat" });
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/chats/${id}`);
      mutate(`/chats/?agent_id=${agentId}`);
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete chat" });
    }
  };

  // 图片上传处理
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        dataUrl && setImages(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          dataUrl,
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });
    
    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && images.length === 0) || !selectedSessionId || isStreaming) return;

    // 构建消息内容：纯文本或多模态
    let content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
    
    if (editImageUrl) {
      // 编辑模式：注入指定图片 + 用户文本
      content = [
        { type: 'image_url' as const, image_url: { url: editImageUrl } },
        ...(inputValue.trim() ? [{ type: 'text' as const, text: inputValue }] : [])
      ];
    } else if (images.length > 0) {
      // 上传图片模式
      content = [
        ...images.map(img => ({ type: 'image_url' as const, image_url: { url: img.dataUrl } })),
        ...(inputValue.trim() ? [{ type: 'text' as const, text: inputValue }] : [])
      ];
    } else {
      // 纯文本模式
      content = inputValue;
    }

    const userMsg: ChatMessage = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setImages([]);
    setEditImageUrl(null);
    setIsStreaming(true);

    try {
      const baseURL = api.defaults.baseURL || '/api';
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`${baseURL}/chats/${selectedSessionId}/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ 
          role: 'user', 
          content: userMsg.content,
          edit_last_image: false  // 前端已直接注入图片，后端无需再处理
        })
      });

      if (!response.ok) throw new Error(response.statusText);
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg: ChatMessage = { role: 'assistant', content: '' };
      const isSSE = response.headers.get('content-type')?.includes('text/event-stream');
      
      setMessages(prev => [...prev, assistantMsg]);

      // SSE mode: collect structured multi-agent events
      // Plain text mode: stream text directly
      const stepMap = new Map<string, AgentStep>();
      const steps: AgentStep[] = [];
      let multiAgent: MultiAgentData | null = isSSE ? {
        steps,
        finalResult: '',
        totalTokens: { input: 0, output: 0 },
        creditCost: 0
      } : null;
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });

        // Plain text mode
        const updated = !isSSE ? (() => {
          assistantMsg.content += chunk;
          return true;
        })() : (() => {
          // SSE mode: parse events into structured data
          sseBuffer += chunk;
          const blocks = sseBuffer.split('\n\n');
          sseBuffer = blocks.pop() || '';
          
          for (const block of blocks) {
            const lines = block.split('\n');
            let eventType = '';
            let dataStr = '';
            for (const line of lines) {
              const eventMatch = line.match(/^event:\s*(.+)/);
              const dataMatch = line.match(/^data:\s*(.+)/);
              eventType = eventMatch ? eventMatch[1] : eventType;
              dataStr = dataMatch ? dataMatch[1] : dataStr;
            }
            try {
              const data = JSON.parse(dataStr);
              // Event handlers as lookup table
              const handlers: Record<string, () => void> = {
                subtask_created: () => {
                  const step: AgentStep = {
                    subtask_id: data.subtask_id,
                    agent_name: data.agent || '',
                    description: data.description || '',
                    status: 'pending',
                  };
                  stepMap.set(data.subtask_id, step);
                  steps.push(step);
                  assistantMsg.content = `正在协作... (${steps.length} 个智能体)`;
                },
                subtask_started: () => {
                  const step = stepMap.get(data.subtask_id);
                  step && (step.status = 'running', step.result = '');
                  assistantMsg.content = `协作中... (${data.agent_name || ''} 正在生成)`;
                },
                subtask_chunk: () => {
                  const step = stepMap.get(data.subtask_id);
                  step && (step.result = (step.result || '') + (data.chunk || ''));
                },
                subtask_completed: () => {
                  const step = stepMap.get(data.subtask_id);
                  const target: AgentStep = step || { subtask_id: data.subtask_id, agent_name: data.agent_name || '', description: data.description || '', status: 'completed' };
                  target.status = 'completed';
                  target.result = data.result;
                  target.tokens = data.tokens;
                  target.agent_name = data.agent_name || target.agent_name;
                  target.description = data.description || target.description;
                  const completed = steps.filter(s => s.status === 'completed').length;
                  assistantMsg.content = `协作中... (${completed}/${steps.length} 完成)`;
                },
                subtask_failed: () => {
                  const step = stepMap.get(data.subtask_id);
                  step && (step.status = 'failed', step.error = data.error);
                },
                task_completed: () => {
                  multiAgent!.finalResult = data.result || '';
                  multiAgent!.totalTokens = { input: data.total_input_tokens || 0, output: data.total_output_tokens || 0 };
                  multiAgent!.creditCost = data.total_credit_cost || 0;
                  assistantMsg.content = data.result || '';
                  assistantMsg.multi_agent = { ...multiAgent!, steps: [...steps] };
                },
                task_failed: () => {
                  assistantMsg.content = `[Error] ${data.error}`;
                },
              };
              handlers[eventType]?.();
            } catch {}
          }
          return true;
        })();
        
        setMessages(prev => {
          const newMsgs = [...prev];
          // In SSE mode, always attach multi_agent data for live rendering
          const updated = { ...assistantMsg };
          if (multiAgent) {
            updated.multi_agent = { ...multiAgent, steps: steps.map(s => ({ ...s })) };
          }
          newMsgs[newMsgs.length - 1] = updated;
          return newMsgs;
        });
      }
      
      mutate(`/chats/?agent_id=${agentId}`);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'system', content: 'Error: Failed to get response.' }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      isVideoAgent ? handleSendVideoTask() : handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="flex items-center gap-2 font-medium text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>预览对话</span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 min-w-[140px] justify-between font-normal text-xs px-3">
                <span className="truncate max-w-[100px]">
                  {sessions?.find((s: ChatSession) => s.id === selectedSessionId)?.title || "选择对话"}
                </span>
                <ChevronDown className="ml-2 h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              {sessionsLoading && <div className="p-2 text-xs text-center text-muted-foreground">Loading...</div>}
              {sessions?.map((item: ChatSession) => (
                <DropdownMenuItem 
                  key={item.id} 
                  onClick={() => setSelectedSessionId(item.id)}
                  className="justify-between text-xs cursor-pointer group"
                >
                  <span className={cn("truncate flex-1", selectedSessionId === item.id && "font-medium")}>{item.title}</span>
                  <div 
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(e, item.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </div>
                </DropdownMenuItem>
              ))}
              {(!sessions || sessions.length === 0) && (
                <div className="text-center text-muted-foreground text-xs py-2">无历史记录</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleCreateSession}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="新对话"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {selectedSessionId ? (
          <>
            <ScrollArea className="flex-1 p-4 md:p-6">
              <div className="space-y-6 max-w-3xl mx-auto pb-4">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-20">
                    <Bot className="h-12 w-12 mb-4 opacity-20" />
                    <p>开始一个新的对话</p>
                  </div>
                )}
                {messages.map((msg, index) => (
                  <div key={index} className={cn("flex gap-4", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <Avatar className="h-8 w-8 mt-1 border">
                        <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                      </Avatar>
                    )}
                    
                    <div className={cn(
                      "max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm",
                      msg.role === 'user' 
                        ? "bg-primary text-primary-foreground rounded-tr-sm" 
                        : "bg-muted/50 border text-foreground rounded-tl-sm"
                    )}>
                      {msg.role === 'assistant' ? (
                        msg.multi_agent ? (
                          <MultiAgentSteps {...msg.multi_agent} />
                        ) : (() => {
                          const text = typeof msg.content === 'string' ? msg.content : '';
                          // 视频完成消息
                          const videoData = parseVideoMessage(text);
                          if (videoData) {
                            return (
                              <div className="space-y-2">
                                <video
                                  src={videoData.videoUrl}
                                  controls
                                  className="rounded-lg max-w-full max-h-[360px]"
                                  preload="metadata"
                                />
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline" className="text-[10px]">{videoData.quality}</Badge>
                                  <span><Clock className="inline h-3 w-3 mr-0.5" />{videoData.duration}s</span>
                                  <span className="ml-auto">{videoData.cost.toFixed(4)} credits</span>
                                </div>
                              </div>
                            );
                          }
                          // 视频处理中占位
                          if (text.startsWith('__VIDEO_PENDING__')) {
                            const taskId = text.slice('__VIDEO_PENDING__'.length);
                            const task = activeVideoTasks.get(taskId);
                            const statusInfo = VIDEO_STATUS_MAP[task?.status || 'pending'] || VIDEO_STATUS_MAP.pending;
                            return (
                              <div className="flex items-center gap-3 py-2">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Film className="h-4 w-4" />
                                    <span className="font-medium">视频生成中</span>
                                    <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">任务已提交，正在等待 xAI 处理...</p>
                                </div>
                              </div>
                            );
                          }
                          // 普通文本/markdown
                          return (
                            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  img: ({node, src, alt, ...props}) => {
                                    const imgUrl = typeof src === 'string' ? src : '';
                                    return (
                                      <span className="relative inline-block group not-prose">
                                        <img 
                                          src={imgUrl} 
                                          alt={alt} 
                                          {...props} 
                                          className="rounded-lg max-w-full" 
                                        />
                                        {imgUrl.startsWith('/api/media/') && (
                                          <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem('access_token');
                                                  const response = await fetch(imgUrl, {
                                                    headers: { 'Authorization': token ? `Bearer ${token}` : '' }
                                                  });
                                                  const blob = await response.blob();
                                                  const reader = new FileReader();
                                                  reader.onloadend = () => {
                                                    const dataUrl = reader.result as string;
                                                    setEditImageUrl(dataUrl);
                                                    textareaRef.current?.focus();
                                                    toast({ 
                                                      title: "已选择此图进行编辑", 
                                                      description: "下一条消息将基于这张图片进行修改" 
                                                    });
                                                  };
                                                  reader.readAsDataURL(blob);
                                                } catch (err) {
                                                  toast({ 
                                                    variant: "destructive", 
                                                    title: "无法加载图片" 
                                                  });
                                                }
                                              }}
                                              disabled={isStreaming}
                                              className="h-7 text-xs shadow-lg"
                                            >
                                              <ImagePlus className="h-3 w-3 mr-1" />
                                              继续编辑
                                            </Button>
                                          </span>
                                        )}
                                      </span>
                                    );
                                  }
                                }}
                              >
                                {text}
                              </ReactMarkdown>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="space-y-2">
                          {/* 渲染用户消息：支持纯文本和多模态 */}
                          {typeof msg.content === 'string' ? (
                            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                          ) : (
                            <>
                              {/* 图片 */}
                              {msg.content.filter(p => p.type === 'image_url').length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {msg.content.filter(p => p.type === 'image_url').map((p, i) => (
                                    <img 
                                      key={i} 
                                      src={p.image_url?.url} 
                                      alt="uploaded" 
                                      className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                                    />
                                  ))}
                                </div>
                              )}
                              {/* 文本 */}
                              {msg.content.filter(p => p.type === 'text').map((p, i) => (
                                <div key={i} className="whitespace-pre-wrap break-words">{p.text}</div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <Avatar className="h-8 w-8 mt-1 border">
                        <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t bg-background">
               <div className="relative max-w-3xl mx-auto">
                 {/* 视频配置面板（仅视频 Agent 显示） */}
                 {isVideoAgent && (
                   <div className="mb-3 p-3 bg-muted/30 rounded-lg border space-y-3">
                     <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                       <Video className="h-3.5 w-3.5" />
                       <span>视频生成配置</span>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                       {/* 视频模式 */}
                       <div className="space-y-1">
                         <label className="text-[10px] text-muted-foreground">模式</label>
                         <Select value={videoConfig.video_mode} onValueChange={v => setVideoConfig(c => ({ ...c, video_mode: v }))}>
                           <SelectTrigger className="h-8 text-xs">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {VIDEO_MODE_OPTIONS.map(o => (
                               <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                       {/* 画质 */}
                       <div className="space-y-1">
                         <label className="text-[10px] text-muted-foreground">画质</label>
                         <Select value={videoConfig.quality} onValueChange={v => setVideoConfig(c => ({ ...c, quality: v }))}>
                           <SelectTrigger className="h-8 text-xs">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {VIDEO_QUALITY_OPTIONS.map(o => (
                               <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                       {/* 画面比例 */}
                       <div className="space-y-1">
                         <label className="text-[10px] text-muted-foreground">画面比例</label>
                         <Select value={videoConfig.aspect_ratio} onValueChange={v => setVideoConfig(c => ({ ...c, aspect_ratio: v }))}>
                           <SelectTrigger className="h-8 text-xs">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {VIDEO_ASPECT_OPTIONS.map(o => (
                               <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                     </div>
                     {/* 时长滑块 */}
                     <div className="space-y-1">
                       <div className="flex items-center justify-between">
                         <label className="text-[10px] text-muted-foreground">时长</label>
                         <span className="text-[10px] font-mono text-muted-foreground">{videoConfig.duration}s</span>
                       </div>
                       <Slider
                         value={[videoConfig.duration]}
                         onValueChange={([v]) => setVideoConfig(c => ({ ...c, duration: v }))}
                         min={1}
                         max={15}
                         step={1}
                         className="w-full"
                       />
                     </div>
                   </div>
                 )}

                 {/* 编辑模式提示 */}
                 {editImageUrl && (
                   <div className="flex items-center gap-2 mb-2 p-2 bg-primary/10 text-primary text-xs rounded-lg">
                     <ImagePlus className="h-3 w-3" />
                     <span>编辑模式：下一条消息将基于选中的图片进行修改</span>
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => setEditImageUrl(null)}
                       className="ml-auto h-5 w-5 p-0"
                     >
                       <X className="h-3 w-3" />
                     </Button>
                   </div>
                 )}
                 
                 {/* 图片预览区 */}
                 {images.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-3 p-2 bg-muted/30 rounded-lg">
                     {images.map(img => (
                       <div key={img.id} className="relative group">
                         <img src={img.dataUrl} alt={img.name} className="h-16 w-16 object-cover rounded-md" />
                         <button
                           onClick={() => removeImage(img.id)}
                           className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                         >
                           <X className="h-3 w-3" />
                         </button>
                       </div>
                     ))}
                   </div>
                 )}
                 
                 {/* 隐藏的文件输入 */}
                 <input
                   ref={fileInputRef}
                   type="file"
                   accept="image/*"
                   multiple
                   onChange={handleImageUpload}
                   className="hidden"
                 />
                 
                 <Textarea 
                   ref={textareaRef}
                   value={inputValue}
                   onChange={(e) => setInputValue(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder={isVideoAgent ? "描述你想要生成的视频..." : "输入消息..."}
                   rows={1}
                    className="min-h-[44px] max-h-[280px] pl-12 pr-12 resize-none rounded-xl bg-muted/30 border-muted focus:bg-background transition-colors overflow-y-auto py-3"
                  />
                 
                 {/* 图片上传按钮 */}
                 <div className="absolute left-2 bottom-[6px]">
                   <Button
                     type="button"
                     variant="ghost"
                     size="icon"
                     onClick={() => fileInputRef.current?.click()}
                     disabled={isStreaming}
                     className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                     title="上传图片"
                   >
                     <ImagePlus className="h-4 w-4" />
                   </Button>
                 </div>
                 
                 <div className="absolute right-2 bottom-[6px]">
                   <Button 
                     size="icon"
                     onClick={isVideoAgent ? handleSendVideoTask : handleSendMessage}
                     disabled={(!inputValue.trim() && images.length === 0) || isStreaming}
                     className="h-8 w-8 rounded-lg shadow-sm"
                   >
                     {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                   </Button>
                 </div>
               </div>
               <div className="text-center mt-2">
                 <span className="text-[10px] text-muted-foreground/60">AI 可能会生成不准确的信息，请核对重要事实。</span>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
            <div className="flex flex-col items-center gap-2">
              <Bot className="h-12 w-12 opacity-10" />
              <p className="text-sm">选择或创建一个对话开始</p>
              <Button variant="outline" size="sm" onClick={handleCreateSession} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                创建新对话
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
