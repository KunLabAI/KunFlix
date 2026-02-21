'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/components/ui/use-toast';
import { Agent } from '@/types';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { agentFormSchema, AgentFormValues } from './schema';
import BasicInfo from './BasicInfo';
import SystemPrompt from './SystemPrompt';
import Parameters from './Parameters';
import Tools from './Tools';
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
  const { toast } = useToast();

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
    if (initialValues) {
      const hasTools = !!(initialValues.tools && initialValues.tools.length > 0);
      form.reset({
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
      });
    } else {
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
      });
    }
  }, [initialValues, form]);

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
              />
            </Section>
            <div className="h-px bg-border my-8"></div>
            <Section title="系统设定">
               <SystemPrompt disabled={loading} />
            </Section>
          </div>
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-0 space-y-6">
              <Section title="参数设置">
                <Parameters disabled={loading} />
              </Section>
              <Section title="工具能力" className="mb-0">
                <Tools disabled={loading} />
              </Section>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
            <BasicInfo 
              providers={activeProviders || []} 
              loading={providersLoading || loading}
            />
            
            <div className="h-px bg-border"></div>
            
            <SystemPrompt disabled={loading} />
            
            <div className="h-px bg-border"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Parameters disabled={loading} />
               <Tools disabled={loading} />
            </div>
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
