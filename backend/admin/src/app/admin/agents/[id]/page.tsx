'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Settings } from 'lucide-react';
import AgentForm from '@/components/admin/agents/AgentForm';
import { useAgent, useCreateAgent, useUpdateAgent } from '@/hooks/useAgents';
import { Agent } from '@/types';
import { formatApiError } from '@/lib/api-utils';
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
  const { t } = useTranslation();
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
      toast({ title: isNew ? t('agents.toast.createSuccess') : t('agents.toast.updateSuccess') });
    } catch (err: any) {
      console.error(err);
      toast({ 
        variant: "destructive",
        title: t('agents.toast.submitFailed'),
        description: formatApiError(err, t('agents.toast.unknownError'))
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
    return <div className="h-full flex items-center justify-center">{t('agents.header.loading')}</div>;
  }

  // Error state
  if (error && !isNew) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">{t('agents.header.notFound')}</h1>
        <Button onClick={() => router.push('/admin/agents')}>{t('agents.header.backHome')}</Button>
      </div>
    );
  }

  // New agent layout
  if (isNew) {
    return (
      <div className="h-full flex flex-col">
        <Header title={t('agents.header.newAgent')} saving={saving} onSave={handleSave} onBack={() => router.push('/admin/agents')} />
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="max-w-7xl mx-auto py-12 px-6">
            <div className="bg-card rounded-xl border shadow-sm p-8">
              <AgentForm initialValues={null} onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} twoColumn={true} />
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
        <div className="flex-1 lg:flex-none xl:w-[30%] border-r flex flex-col min-h-0 h-full overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6  max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-6 font-medium">
                <Settings className="h-5 w-5" />
                <span>{t('agents.header.config')}</span>
              </div>
              <AgentForm initialValues={agent} onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} />
            </div>
          </ScrollArea>
        </div>
        {/* Right: Chat Preview */}
        <div className="flex-1 bg-muted/20 min-h-0">
          <div className="h-full bg-card overflow-hidden flex flex-col">
            <ChatInterface agentId={id} />
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
  const { t } = useTranslation();
  return (
    <div className="h-16 border-b flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-6 w-[1px] bg-border mx-1" />
        <div className="flex flex-col">
          <span className="font-semibold text-lg leading-tight">{title || t('agents.header.loading')}</span>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>{t('agents.header.cancel')}</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? t('agents.header.saving') : <><Save className="mr-2 h-4 w-4" /> {t('agents.header.save')}</>}
        </Button>
      </div>
    </div>
  );
}
