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
import NodeTypes from './NodeTypes';
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

const defaultGeminiConfig = {
  thinking_level: null,
  media_resolution: null,
  image_generation_enabled: false,
  image_config: {
    aspect_ratio: null,
    image_size: null,
    output_format: null,
    batch_count: null,
    max_person_images: null,
    max_object_images: null,
  },
  google_search_enabled: false,
  google_image_search_enabled: false,
};

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
      agent_type: 'text' as const,
      system_prompt: '',
      temperature: 0.7,
      context_window: 4096,
      thinking_mode: false,
      tools_enabled: false,
      tools: [],
      target_node_types: [],
      input_credit_per_1m: 0,
      output_credit_per_1m: 0,
      image_output_credit_per_1m: 0,
      search_credit_per_query: 0,
      video_input_image_credit: 0,
      video_input_second_credit: 0,
      video_output_480p_credit: 0,
      video_output_720p_credit: 0,
      is_leader: false,
      coordination_modes: [],
      member_agent_ids: [],
      max_subtasks: 10,
      enable_auto_review: true,
      gemini_config: defaultGeminiConfig,
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
      const formData = {
        name: initialValues.name || '',
        description: initialValues.description || '',
        provider_id: initialValues.provider_id || '',
        model: initialValues.model || '',
        agent_type: (initialValues.agent_type || 'text') as 'text' | 'image' | 'multimodal' | 'video',
        system_prompt: initialValues.system_prompt || '',
        temperature: Number(initialValues.temperature) || 0.7,
        context_window: Number(initialValues.context_window) || 4096,
        thinking_mode: Boolean(initialValues.thinking_mode),
        tools_enabled: hasTools,
        tools: initialValues.tools || [],
        target_node_types: initialValues.target_node_types || [],
        input_credit_per_1m: Number(initialValues.input_credit_per_1m) || 0,
        output_credit_per_1m: Number(initialValues.output_credit_per_1m) || 0,
        image_output_credit_per_1m: Number(initialValues.image_output_credit_per_1m) || 0,
        search_credit_per_query: Number(initialValues.search_credit_per_query) || 0,
        video_input_image_credit: Number(initialValues.video_input_image_credit) || 0,
        video_input_second_credit: Number(initialValues.video_input_second_credit) || 0,
        video_output_480p_credit: Number(initialValues.video_output_480p_credit) || 0,
        video_output_720p_credit: Number(initialValues.video_output_720p_credit) || 0,
        is_leader: Boolean(initialValues.is_leader),
        coordination_modes: initialValues.coordination_modes || [],
        member_agent_ids: initialValues.member_agent_ids || [],
        max_subtasks: Number(initialValues.max_subtasks) || 10,
        enable_auto_review: initialValues.enable_auto_review !== false,
        gemini_config: initialValues.gemini_config || defaultGeminiConfig,
      };
      
      // 在 reset 之前设置为 false，防止 reset 触发的 onValueChange 重置 model
      isFormInitialized.current = false;
      
      // 使用 setTimeout 确保在下一个事件循环中执行
      setTimeout(() => {
        form.reset(formData);
        // 延迟标记初始化完成，确保 reset 引起的渲染完成
        setTimeout(() => {
          isFormInitialized.current = true;
        }, 50);
      }, 0);
    } else if (initialValues === null) {
      // 只有当 initialValues 为 null 时才重置为空
      form.reset({
        name: '',
        description: '',
        provider_id: '',
        model: '',
        agent_type: 'text' as const,
        system_prompt: '',
        temperature: 0.7,
        context_window: 4096,
        thinking_mode: false,
        tools_enabled: false,
        tools: [],
        target_node_types: [],
        input_credit_per_1m: 0,
        output_credit_per_1m: 0,
        is_leader: false,
        coordination_modes: [],
        member_agent_ids: [],
        max_subtasks: 10,
        enable_auto_review: true,
        gemini_config: defaultGeminiConfig,
      });
      isFormInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]); // 只依赖 initialValues

  const agentType = form.watch('agent_type') as 'text' | 'image' | 'multimodal' | 'video';

  // 字段名映射表（避免 if-else，直接查表显示中文名）
  const FIELD_LABELS: Record<string, string> = {
    name: '名称', description: '描述', provider_id: '供应商', model: '模型',
    system_prompt: '系统提示词', temperature: '温度', context_window: '上下文窗口',
    tools: '工具', coordination_modes: '协作方式', gemini_config: 'Gemini 配置',
  };

  const handleInvalid = (errors: Record<string, any>) => {
    console.error('Form validation errors:', errors);
    const fields = Object.keys(errors).map(k => FIELD_LABELS[k] || k);
    toast({
      variant: "destructive",
      title: "请检查以下字段",
      description: fields.join('、'),
    });
  };

  const handleFinish = async (values: AgentFormValues) => {
    try {
      const { tools_enabled, gemini_config, ...rest } = values;
      
      // Clean up gemini_config
      let cleanedGeminiConfig = undefined;
      if (gemini_config) {
        const imageConfig = gemini_config.image_generation_enabled && gemini_config.image_config ? {
            aspect_ratio: gemini_config.image_config.aspect_ratio || null,
            image_size: gemini_config.image_config.image_size || null,
            output_format: gemini_config.image_config.output_format || null,
            batch_count: gemini_config.image_config.batch_count || null,
            max_person_images: gemini_config.image_config.max_person_images || null,
            max_object_images: gemini_config.image_config.max_object_images || null,
        } : null;

        cleanedGeminiConfig = {
          thinking_level: gemini_config.thinking_level || null,
          media_resolution: gemini_config.media_resolution || null,
          image_generation_enabled: gemini_config.image_generation_enabled || false,
          google_search_enabled: gemini_config.google_search_enabled || false,
          google_image_search_enabled: gemini_config.google_image_search_enabled || false,
          image_config: imageConfig
        };
      }

      const payload: Partial<Agent> = {
        ...rest,
        tools: tools_enabled ? values.tools : [],
        gemini_config: cleanedGeminiConfig,
      };
      
      console.log('Submitting payload:', JSON.stringify(payload, null, 2));
      await onSubmit(payload);
    } catch (error: any) {
      console.error('Form submission error:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      toast({
        variant: "destructive",
        title: "提交失败",
        description: error.response?.data?.detail ? JSON.stringify(error.response.data.detail) : "请重试",
      });
    }
  };

  const formContent = (
    <>
      {twoColumn ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 xl:col-span-7">
            <Section title="基础信息">
              <BasicInfo 
                providers={activeProviders || []} 
                loading={providersLoading || loading}
                isFormInitialized={isFormInitialized}
              />
            </Section>
            <div className="h-px bg-border my-8"></div>
            <Section title="系统设定">
               <SystemPrompt disabled={loading} agentType={agentType} />
            </Section>
          </div>
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto space-y-6 pb-4">
              <Section title="参数设置">
                <Parameters disabled={loading} providers={activeProviders || []} />
              </Section>
              <Section title="能力">
                <Tools disabled={loading} />
              </Section>
              <Section title="画布节点控制">
                <NodeTypes disabled={loading} />
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
            
            <SystemPrompt disabled={loading} agentType={agentType} />
            
            <div className="h-px bg-border"></div>

            <Parameters disabled={loading} providers={activeProviders || []} />

            <div className="h-px bg-border"></div>

            <Tools disabled={loading} />

            <div className="h-px bg-border"></div>

            <NodeTypes disabled={loading} />

            <div className="h-px bg-border"></div>

            <LeaderConfig disabled={loading} availableAgents={availableAgents || []} />
        </div>
      )}
    </>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFinish, handleInvalid)} className="space-y-8">
        {formContent}
      </form>
    </Form>
  );
}
