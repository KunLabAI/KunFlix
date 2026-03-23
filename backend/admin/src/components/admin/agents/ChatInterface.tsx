'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Trash2, Bot, User, MoreHorizontal, Loader2, MessageSquare, ChevronDown, ImagePlus, X, Zap, Terminal } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import MultiAgentSteps, { type AgentStep, type MultiAgentData } from './MultiAgentSteps';

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

interface SkillCall {
  skill_name: string;
  status: 'loading' | 'loaded';
}

interface ToolCall {
  tool_name: string;
  arguments?: Record<string, unknown>;
  status: 'executing' | 'completed';
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
  created_at?: string;
  skill_calls?: SkillCall[];
  tool_calls?: ToolCall[];
  multi_agent?: MultiAgentData;
}

// 图片附件类型
interface ImageAttachment {
  id: string;
  dataUrl: string;
  name: string;
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
      
      const doFetch = (authToken: string | null) => fetch(`${baseURL}/chats/${selectedSessionId}/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : '',
        },
        body: JSON.stringify({ 
          role: 'user', 
          content: userMsg.content,
          edit_last_image: false  // 前端已直接注入图片，后端无需再处理
        })
      });

      let response = await doFetch(localStorage.getItem('access_token'));

      // Token expired → refresh and retry once
      if (response.status === 401) {
        const refreshToken = localStorage.getItem('refresh_token');
        const refreshRes = refreshToken && await fetch(`${baseURL}/admin/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const refreshOk = refreshRes && refreshRes.ok;
        const newToken = refreshOk ? (await refreshRes.json()).access_token : null;
        newToken && localStorage.setItem('access_token', newToken);
        response = newToken ? await doFetch(newToken) : response;
      }

      if (!response.ok) throw new Error(response.statusText);
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg: ChatMessage = { role: 'assistant', content: '' };
      const isSSE = response.headers.get('content-type')?.includes('text/event-stream');
      
      setMessages(prev => [...prev, assistantMsg]);

      // SSE state
      const stepMap = new Map<string, AgentStep>();
      const steps: AgentStep[] = [];
      const skillCalls: SkillCall[] = [];
      const toolCalls: ToolCall[] = [];
      let multiAgent: MultiAgentData | null = null;
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });

        // Unified SSE parsing
        if (isSSE) {
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
              const handlers: Record<string, () => void> = {
                // Single agent events
                text: () => {
                  assistantMsg.content = (assistantMsg.content as string) + (data.chunk || '');
                },
                skill_call: () => {
                  skillCalls.push({ skill_name: data.skill_name, status: 'loading' });
                  assistantMsg.skill_calls = [...skillCalls];
                },
                skill_loaded: () => {
                  const sc = skillCalls.find(s => s.skill_name === data.skill_name);
                  sc && (sc.status = 'loaded');
                  assistantMsg.skill_calls = [...skillCalls];
                },
                tool_call: () => {
                  toolCalls.push({ tool_name: data.tool_name, arguments: data.arguments, status: 'executing' });
                  assistantMsg.tool_calls = [...toolCalls];
                },
                tool_result: () => {
                  const tc = toolCalls.find(t => t.tool_name === data.tool_name && t.status === 'executing');
                  tc && (tc.status = 'completed');
                  assistantMsg.tool_calls = [...toolCalls];
                },
                done: () => {},
                error: () => {
                  assistantMsg.content = (assistantMsg.content as string) + `\n\nError: ${data.message}`;
                },
                // Multi agent events
                subtask_created: () => {
                  multiAgent = multiAgent || { steps, finalResult: '', totalTokens: { input: 0, output: 0 }, creditCost: 0 };
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
        } else {
          // Fallback: plain text mode (non-SSE response)
          assistantMsg.content = (assistantMsg.content as string) + chunk;
        }
        
        setMessages(prev => {
          const updated = { ...assistantMsg };
          multiAgent && (updated.multi_agent = { ...multiAgent, steps: steps.map(s => ({ ...s })) });
          skillCalls.length && (updated.skill_calls = skillCalls.map(s => ({ ...s })));
          toolCalls.length && (updated.tool_calls = toolCalls.map(t => ({ ...t })));
          const newMsgs = [...prev];
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
      handleSendMessage();
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
                          return (
                            <div className="space-y-2">
                              {/* Skill call indicators */}
                              {msg.skill_calls?.map((sc, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                                  {sc.status === 'loading'
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Zap className="h-3 w-3" />}
                                  <span>
                                    {sc.status === 'loading' ? `正在加载技能: ${sc.skill_name}` : `已加载技能: ${sc.skill_name}`}
                                  </span>
                                </div>
                              ))}
                              {/* Tool call indicators */}
                              {msg.tool_calls?.map((tc, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                                  {tc.status === 'executing'
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Terminal className="h-3 w-3" />}
                                  <span>
                                    {tc.status === 'executing' ? `正在执行: ${tc.tool_name}` : `已完成: ${tc.tool_name}`}
                                  </span>
                                </div>
                              ))}
                              {/* Markdown content */}
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
                   placeholder="输入消息..."
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
                     onClick={handleSendMessage}
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
