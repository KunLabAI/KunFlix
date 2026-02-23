'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, MessageSquare, Settings } from 'lucide-react';
import AgentForm from '@/components/admin/agents/AgentForm';
import { useAgent, useCreateAgent, useUpdateAgent } from '@/hooks/useAgents';
import { Agent } from '@/types';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

const ChatInterface = dynamic(() => import('@/components/admin/agents/ChatInterface'), {
  loading: () => <div className="h-full flex items-center justify-center bg-muted/20">Loading...</div>,
  ssr: false
});

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const isNew = id === 'new';

  const { agent, error, isLoading, mutate } = useAgent(isNew ? '' : id);
  const { createAgent } = useCreateAgent();
  const { updateAgent } = useUpdateAgent();
  const { toast } = useToast();
  
  const [formInstance, setFormInstance] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: Partial<Agent>) => {
    setSaving(true);
    try {
      const action = isNew 
        ? createAgent(values).then(res => router.replace(`/admin/agents/${res.data.id}`))
        : updateAgent(id, values).then(() => mutate());
      await action;
      toast({ title: isNew ? '创建成功' : '更新成功' });
    } catch (err: any) {
      console.error(err);
      toast({ 
        variant: "destructive",
        title: '操作失败',
        description: err.response?.data?.detail || '未知错误'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    document.querySelector('form')?.requestSubmit();
  };

  // Loading state
  if (isLoading && !isNew) {
    return <div className="h-full flex items-center justify-center">Loading...</div>;
  }

  // Error state
  if (error && !isNew) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Agent Not Found</h1>
        <Button onClick={() => router.push('/admin/agents')}>Back Home</Button>
      </div>
    );
  }

  // New agent layout
  if (isNew) {
    return (
      <div className="h-full flex flex-col">
        <Header title="创建新智能体" saving={saving} onSave={handleSave} onBack={() => router.push('/admin/agents')} />
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="max-w-5xl mx-auto py-12 px-6">
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight mb-2">开始配置</h2>
              <p className="text-muted-foreground">配置智能体的基础信息、模型参数及系统提示词。</p>
            </div>
            <div className="bg-card rounded-xl border shadow-sm p-8">
              <AgentForm onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} twoColumn={true} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit agent layout
  return (
    <div className="h-full flex flex-col">
      <Header title={agent?.name} subtitle={`ID: ${id}`} saving={saving} onSave={handleSave} onBack={() => router.push('/admin/agents')} />
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden h-full">
        {/* Left: Configuration */}
        <div className="flex-1 lg:w-1/2 lg:flex-none xl:w-[45%] border-r flex flex-col min-h-0 h-full overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6 lg:p-8 max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-6 font-medium">
                <Settings className="h-5 w-5" />
                <span>配置</span>
              </div>
              <AgentForm initialValues={agent} onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} />
            </div>
          </ScrollArea>
        </div>
        {/* Right: Chat Preview */}
        <div className="flex-1 bg-muted/20 p-4 min-h-0">
          <div className="h-full bg-card rounded-xl border shadow-sm overflow-hidden flex flex-col">
            <div className="h-12 border-b flex items-center px-4 shrink-0">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                预览对话
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ChatInterface agentId={id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Extracted header component to reduce repetition
function Header({ title, subtitle, saving, onSave, onBack }: { 
  title?: string; 
  subtitle?: string; 
  saving: boolean; 
  onSave: () => void; 
  onBack: () => void;
}) {
  return (
    <div className="h-16 border-b flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-6 w-[1px] bg-border mx-1" />
        <div className="flex flex-col">
          <span className="font-semibold text-lg leading-tight">{title || 'Loading...'}</span>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>取消</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? '保存中...' : <><Save className="mr-2 h-4 w-4" /> 保存</>}
        </Button>
      </div>
    </div>
  );
}
