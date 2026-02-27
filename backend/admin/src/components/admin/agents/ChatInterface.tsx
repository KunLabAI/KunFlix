'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Trash2, Bot, User, MoreHorizontal, Loader2, MessageSquare, ChevronDown } from 'lucide-react';
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

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  multi_agent?: MultiAgentData;
}

export default function ChatInterface({ agentId }: ChatInterfaceProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedSessionId || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
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
        body: JSON.stringify({ role: 'user', content: userMsg.content })
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
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
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
                 <Textarea 
                   value={inputValue}
                   onChange={(e) => setInputValue(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder="输入消息..."
                   className="min-h-[60px] pr-12 resize-none rounded-xl bg-muted/30 border-muted focus:bg-background transition-colors"
                 />
                 <div className="absolute right-2 bottom-3">
                   <Button 
                     size="icon"
                     onClick={handleSendMessage}
                     disabled={!inputValue.trim() || isStreaming}
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
