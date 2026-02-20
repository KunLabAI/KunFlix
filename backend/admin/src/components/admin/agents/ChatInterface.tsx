'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Layout, Button, Input, message, Spin, Empty, Typography } from 'antd';
import { SendOutlined, PlusOutlined, DeleteOutlined, RobotOutlined, UserOutlined, MoreOutlined } from '@ant-design/icons';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Text } = Typography;

interface ChatInterfaceProps {
  agentId: number;
}

interface ChatSession {
  id: number;
  title: string;
  agent_id: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

export default function ChatInterface({ agentId }: ChatInterfaceProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        .catch(err => message.error("Failed to load messages"));
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
      message.error("Failed to create chat");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await api.delete(`/chats/${id}`);
      mutate(`/chats/?agent_id=${agentId}`);
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      message.error("Failed to delete chat");
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
      
      const response = await fetch(`${baseURL}/chats/${selectedSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="flex h-full bg-white">
      {/* Sidebar - Session List */}
      <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/30">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">对话历史</span>
          <Button 
            type="text" 
            size="small" 
            icon={<PlusOutlined />} 
            onClick={handleCreateSession}
            className="text-blue-600 hover:bg-blue-50"
          >
            新对话
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessionsLoading ? (
             <div className="p-5 text-center"><Spin size="small" /></div>
          ) : (
            <>
              {sessions?.map((item: ChatSession) => (
                <div 
                  key={item.id}
                  onClick={() => setSelectedSessionId(item.id)}
                  className={`
                    cursor-pointer px-3 py-2.5 rounded-lg text-sm transition-all group flex items-center justify-between
                    ${selectedSessionId === item.id 
                      ? 'bg-white shadow-sm text-gray-900 font-medium' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
                  `}
                >
                  <span className="truncate flex-1">{item.title}</span>
                  {selectedSessionId === item.id && (
                    <Button 
                      type="text" 
                      size="small" 
                      icon={<DeleteOutlined />} 
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      onClick={(e) => handleDeleteSession(e, item.id)}
                    />
                  )}
                </div>
              ))}
              {(!sessions || sessions.length === 0) && (
                <div className="text-center text-gray-400 text-xs py-8">无历史记录</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {selectedSessionId ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-300">
                  <RobotOutlined className="text-4xl mb-4 opacity-20" />
                  <p>开始一个新的对话</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <div key={index} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 mt-1">
                      <RobotOutlined />
                    </div>
                  )}
                  
                  <div className={`
                    max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed
                    ${msg.role === 'user' 
                      ? 'bg-black text-white rounded-tr-sm' 
                      : 'bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100'}
                  `}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:bg-gray-800 prose-pre:text-gray-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0 mt-1">
                      <UserOutlined />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-100 bg-white">
               <div className="relative max-w-4xl mx-auto">
                 <Input.TextArea 
                   value={inputValue}
                   onChange={(e) => setInputValue(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder="输入消息..."
                   autoSize={{ minRows: 1, maxRows: 6 }}
                   className="resize-none !pr-12 !pl-4 !py-3 !rounded-2xl !bg-gray-50 !border-gray-200 focus:!bg-white focus:!border-gray-300 focus:!shadow-sm text-base"
                   style={{ scrollbarWidth: 'none' }}
                 />
                 <div className="absolute right-2 bottom-2">
                   <Button 
                     type="primary" 
                     shape="circle"
                     icon={<SendOutlined />} 
                     onClick={handleSendMessage}
                     loading={isStreaming}
                     className="bg-black hover:!bg-gray-800 border-none shadow-none"
                     disabled={!inputValue.trim()}
                   />
                 </div>
               </div>
               <div className="text-center mt-2">
                 <span className="text-[10px] text-gray-400">AI 可能会生成不准确的信息，请核对重要事实。</span>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/30">
            <Empty description="选择或创建一个对话开始" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}
      </div>
    </div>
  );
}
