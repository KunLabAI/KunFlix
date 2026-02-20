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
import { cn } from '@/lib/utils';

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
  
  // Use generic type for form instance from react-hook-form
  const [formInstance, setFormInstance] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: Partial<Agent>) => {
    setSaving(true);
    try {
      if (isNew) {
        const res = await createAgent(values);
        toast({ title: '创建成功' });
        router.replace(`/admin/agents/${res.data.id}`);
      } else {
        await updateAgent(id, values);
        toast({ title: '更新成功' });
        mutate();
      }
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
    if (formInstance) {
      // react-hook-form's handleSubmit is wrapped in our custom submit handler
      // We need to trigger the form submission.
      // Since we can't easily trigger the submit event on the form element from outside without a ref to the form element,
      // and here we only have the form hook methods (if exposed).
      // Actually, in `AgentForm` I exposed `form` instance via `onFormInstanceReady`.
      // So `formInstance` is the `UseFormReturn` object.
      // We can call `formInstance.handleSubmit(handleFinish)()` but `handleFinish` is defined inside `AgentForm`.
      // The best way is to use a hidden submit button and click it, or pass a ref to trigger submit.
      // Alternatively, the `AgentForm` can expose a submit function.
      
      // But `react-hook-form` handleSubmit returns a function that executes validation and then the callback.
      // Since `AgentForm` handles the submission logic, I should trigger the form submit event.
      // Or I can just click the hidden submit button if I add one, or use requestSubmit().
      
      // Let's assume AgentForm exposes the form instance.
      // Wait, standard react-hook-form doesn't expose a "submit now" method that runs the handler passed to <form onSubmit>.
      // The standard way is using a form id and <button form="form-id">.
      
      // I'll update `AgentForm` to accept an ID and use it.
      // Or I can just trigger a custom event.
      
      // For now, let's try to find the form element and submit it if possible, 
      // or simply add a hidden button in AgentForm controlled by a ref.
      // Actually, since I have the `form` instance, I can manually call `form.handleSubmit` 
      // BUT I need the `handleFinish` function which is inside the component.
      
      // Simpler approach: Add a hidden submit button in AgentForm and click it.
      const formElement = document.querySelector('form');
      if (formElement) {
        formElement.requestSubmit();
      }
    }
  };

  if (isLoading && !isNew) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error && !isNew) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Agent Not Found</h1>
        <Button onClick={() => router.push('/admin/agents')}>Back Home</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden animate-in fade-in">
      {/* Header */}
      <div className="h-16 border-b flex items-center justify-between px-6 bg-background shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push('/admin/agents')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-6 w-[1px] bg-border mx-1"></div>
          <div className="flex flex-col">
            <span className="font-semibold text-lg leading-tight">
              {isNew ? '创建新智能体' : agent?.name || 'Loading...'}
            </span>
            {!isNew && <span className="text-xs text-muted-foreground">ID: {id}</span>}
          </div>
        </div>
        
        <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/admin/agents')}>
              取消
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? '保存中...' : <><Save className="mr-2 h-4 w-4" /> 保存</>}
            </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {isNew ? (
          <div className="h-full overflow-y-auto bg-muted/20">
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
        ) : (
          <div className="h-full flex flex-col lg:flex-row">
            {/* Left Panel: Configuration */}
            <div className="flex-1 lg:w-1/2 lg:flex-none xl:w-[45%] h-full overflow-y-auto border-r bg-background">
              <div className="p-6 lg:p-8 max-w-3xl mx-auto">
                 <div className="flex items-center gap-2 mb-6 font-medium text-foreground">
                   <Settings className="h-5 w-5" />
                   <span>配置</span>
                 </div>
                 <AgentForm initialValues={agent} onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} />
              </div>
            </div>

            {/* Right Panel: Chat Preview */}
            <div className="flex-1 h-full bg-muted/20 flex flex-col overflow-hidden relative">
              <div className="absolute top-4 right-4 z-10">
                 {/* Optional: Add controls for chat here */}
              </div>
              <div className="flex-1 p-4 lg:p-6 h-full">
                <div className="h-full bg-card rounded-xl border shadow-sm overflow-hidden flex flex-col">
                  <div className="h-12 border-b flex items-center px-4 bg-card shrink-0">
                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      预览对话
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <ChatInterface agentId={id} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
