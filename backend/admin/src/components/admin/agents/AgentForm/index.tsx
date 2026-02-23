'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/components/ui/use-toast';
import { Agent } from '@/types';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { useAgents } from '@/hooks/useAgents';
import { agentFormSchema, AgentFormValues } from './schema';
import BasicInfo from './BasicInfo';
import SystemPrompt from './SystemPrompt';
import Parameters from './Parameters';
import Tools from './Tools';
import LeaderConfig from './LeaderConfig';
import { Form } from '@/components/ui/form';

interface AgentFormProps {
  initialValues?: Agent | null;
  onSubmit: (values: Partial<Agent>) => Promise<void>;
  loading?: boolean;
  onFormInstanceReady?: (instance: any) => void;
  twoColumn?: boolean;
}

const Section = ({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) => (
  <div className={`mb-8 ${className || ''}`}>
    <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
    {children}
  </div>
);

export default function AgentForm({ 
  initialValues, 
  onSubmit, 
  loading = false, 
  onFormInstanceReady, 
  twoColumn = false 
}: AgentFormProps) {
  const { activeProviders, isLoading: providersLoading } = useLLMProviders();
  const { agents: availableAgents } = useAgents();
  const { toast } = useToast();
  const isFormInitialized = useRef(false);

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema) as unknown as any,
    defaultValues: {
      name: '',
      description: '',
      provider_id: '',
      model: '',
      system_prompt: '',
      temperature: 0.7,
      context_window: 4096,
      thinking_mode: false,
      tools_enabled: false,
      tools: [],
      input_credit_per_1k: 0,
      output_credit_per_1k: 0,
      is_leader: false,
      coordination_modes: [],
      member_agent_ids: [],
      max_subtasks: 10,
      enable_auto_review: true,
    },
  });

  // Expose form instance
  useEffect(() => {
    if (onFormInstanceReady) {
      onFormInstanceReady(form); // expose react-hook-form methods
    }
  }, [form, onFormInstanceReady]);

  // Initialize form
  useEffect(() => {
    console.log('[AgentForm] Initializing with:', initialValues);
    if (initialValues) {
      const hasTools = !!(initialValues.tools && initialValues.tools.length > 0);
      const formData = {
        name: initialValues.name || '',
        description: initialValues.description || '',
        provider_id: initialValues.provider_id || '',
        model: initialValues.model || '',
        system_prompt: initialValues.system_prompt || '',
        temperature: Number(initialValues.temperature) || 0.7,
        context_window: Number(initialValues.context_window) || 4096,
        thinking_mode: Boolean(initialValues.thinking_mode),
        tools_enabled: hasTools,
        tools: initialValues.tools || [],
        input_credit_per_1k: Number(initialValues.input_credit_per_1k) || 0,
        output_credit_per_1k: Number(initialValues.output_credit_per_1k) || 0,
        is_leader: Boolean(initialValues.is_leader),
        coordination_modes: initialValues.coordination_modes || [],
        member_agent_ids: initialValues.member_agent_ids || [],
        max_subtasks: Number(initialValues.max_subtasks) || 10,
        enable_auto_review: initialValues.enable_auto_review !== false,
      };
      console.log('[AgentForm] Resetting form with:', formData);
      
      // 在 reset 之前设置为 false，防止 reset 触发的 onValueChange 重置 model
      isFormInitialized.current = false;
      
      // 使用 setTimeout 确保在下一个事件循环中执行
      setTimeout(() => {
        form.reset(formData);
        // 延迟标记初始化完成，确保 reset 引起的渲染完成
        setTimeout(() => {
          isFormInitialized.current = true;
          console.log('[AgentForm] Initialization complete');
        }, 50);
      }, 0);
    } else if (initialValues === null) {
      // 只有当 initialValues 为 null 时才重置为空
      form.reset({
        name: '',
        description: '',
        provider_id: '',
        model: '',
        system_prompt: '',
        temperature: 0.7,
        context_window: 4096,
        thinking_mode: false,
        tools_enabled: false,
        tools: [],
        input_credit_per_1k: 0,
        output_credit_per_1k: 0,
        is_leader: false,
        coordination_modes: [],
        member_agent_ids: [],
        max_subtasks: 10,
        enable_auto_review: true,
      });
      isFormInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]); // 只依赖 initialValues

  const handleFinish = async (values: AgentFormValues) => {
    try {
      const { tools_enabled, ...rest } = values;
      const payload: Partial<Agent> = {
        ...rest,
        tools: tools_enabled ? values.tools : [],
      };
      
      await onSubmit(payload);
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        variant: "destructive",
        title: "提交失败",
        description: "请重试",
      });
    }
  };

  const formContent = (
    <>
      {twoColumn ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 xl:col-span-8">
            <Section title="基础信息">
              <BasicInfo 
                providers={activeProviders || []} 
                loading={providersLoading || loading}
                isFormInitialized={isFormInitialized}
              />
            </Section>
            <div className="h-px bg-border my-8"></div>
            <Section title="系统设定">
               <SystemPrompt disabled={loading} />
            </Section>
          </div>
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto space-y-6 pb-4">
              <Section title="参数设置">
                <Parameters disabled={loading} />
              </Section>
              <Section title="工具能力">
                <Tools disabled={loading} />
              </Section>
              <Section title="协作配置" className="mb-0">
                <LeaderConfig disabled={loading} availableAgents={availableAgents || []} />
              </Section>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
            <BasicInfo 
              providers={activeProviders || []} 
              loading={providersLoading || loading}
              isFormInitialized={isFormInitialized}
            />
            
            <div className="h-px bg-border"></div>
            
            <SystemPrompt disabled={loading} />
            
            <div className="h-px bg-border"></div>

            <Parameters disabled={loading} />

            <div className="h-px bg-border"></div>

            <Tools disabled={loading} />

            <div className="h-px bg-border"></div>

            <LeaderConfig disabled={loading} availableAgents={availableAgents || []} />
        </div>
      )}
    </>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFinish)} className="space-y-8">
        {formContent}
      </form>
    </Form>
  );
}
