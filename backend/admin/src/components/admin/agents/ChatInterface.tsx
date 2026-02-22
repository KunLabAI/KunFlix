'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Trash2, Bot, User, MoreHorizontal, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
      
      setMessages(prev => [...prev, assistantMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        assistantMsg.content += chunk;
        
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { ...assistantMsg };
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
    <div className="flex h-full bg-background">
      {/* Sidebar - Session List */}
      <div className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">对话历史</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCreateSession}
            className="h-8 w-8 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
               <div className="p-5 text-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <>
                {sessions?.map((item: ChatSession) => (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedSessionId(item.id)}
                    className={cn(
                      "cursor-pointer px-3 py-2.5 rounded-lg text-sm transition-all group flex items-center justify-between",
                      selectedSessionId === item.id 
                        ? "bg-background shadow-sm text-foreground font-medium" 
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <span className="truncate flex-1">{item.title}</span>
                    {selectedSessionId === item.id && (
                      <Button 
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDeleteSession(e, item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {(!sessions || sessions.length === 0) && (
                  <div className="text-center text-muted-foreground text-xs py-8">无历史记录</div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {selectedSessionId ? (
          <>
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6 max-w-3xl mx-auto">
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
                      "max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-primary text-primary-foreground rounded-tr-sm" 
                        : "bg-muted text-foreground rounded-tl-sm"
                    )}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
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
                   className="min-h-[60px] pr-12 resize-none rounded-xl bg-muted/50 border-muted focus:bg-background transition-colors"
                 />
                 <div className="absolute right-2 bottom-3">
                   <Button 
                     size="icon"
                     onClick={handleSendMessage}
                     disabled={!inputValue.trim() || isStreaming}
                     className="h-8 w-8 rounded-lg"
                   >
                     {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                   </Button>
                 </div>
               </div>
               <div className="text-center mt-2">
                 <span className="text-[10px] text-muted-foreground">AI 可能会生成不准确的信息，请核对重要事实。</span>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
            <div className="flex flex-col items-center gap-2">
              <Bot className="h-12 w-12 opacity-20" />
              <p>选择或创建一个对话开始</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
