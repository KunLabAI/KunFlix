'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { Agent } from '@/types';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { useAgents } from '@/hooks/useAgents';
import { formatApiError } from '@/lib/api-utils';
import { createAgentFormSchema, AgentFormValues } from './schema';
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

const defaultGeminiConfig = {
  thinking_level: null,
  media_resolution: null,
  google_search_enabled: false,
  google_image_search_enabled: false,
};

const defaultImageConfig = {
  image_generation_enabled: false,
  image_provider_id: null,
  image_model: null,
  image_config: {
    aspect_ratio: null,
    quality: null,
    batch_count: null,
    output_format: null,
  },
};

const defaultVideoConfig = {
  video_generation_enabled: false,
};

const defaultCompactionConfig = {
  enabled: false,
  provider_id: '',
  model: '',
  compact_ratio: 0.75,
  reserve_ratio: 0.15,
  tool_old_threshold: 500,
  tool_recent_n: 5,
  max_summary_tokens: 4096,
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
  const { t } = useTranslation();
  const isFormInitialized = useRef(false);

  const agentFormSchema = useMemo(() => createAgentFormSchema(t), [t]);

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
      image_config: defaultImageConfig,
      image_credit_per_image: 0,
      video_config: defaultVideoConfig,
      compaction_config: defaultCompactionConfig,
      max_tool_rounds: 100,
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
      const hasImageGen = !!initialValues.image_config?.image_generation_enabled;
      const hasVideoGen = !!(initialValues.video_config as any)?.video_generation_enabled;
      const hasCanvas = !!(initialValues.target_node_types && initialValues.target_node_types.length > 0);
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
        tools_enabled: hasTools || hasImageGen || hasVideoGen || hasCanvas,
        tools: initialValues.tools || [],
        target_node_types: (initialValues.target_node_types || []) as ("script" | "character" | "storyboard" | "video")[],
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
        image_config: initialValues.image_config || defaultImageConfig,
        image_credit_per_image: Number(initialValues.image_credit_per_image) || 0,
        video_config: (initialValues.video_config as any) || defaultVideoConfig,
        compaction_config: initialValues.compaction_config || defaultCompactionConfig,
        max_tool_rounds: Number(initialValues.max_tool_rounds) || 100,
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
        image_config: defaultImageConfig,
        image_credit_per_image: 0,
        video_config: defaultVideoConfig,
        compaction_config: defaultCompactionConfig,
        max_tool_rounds: 100,
      });
      isFormInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]); // 只依赖 initialValues

  const agentType = form.watch('agent_type') as 'text' | 'image' | 'multimodal' | 'video';

  // 字段名映射表（避免 if-else，直接查表显示字段名）
  const FIELD_LABELS: Record<string, string> = {
    name: t('agents.form.fieldLabels.name'),
    description: t('agents.form.fieldLabels.description'),
    provider_id: t('agents.form.fieldLabels.provider_id'),
    model: t('agents.form.fieldLabels.model'),
    system_prompt: t('agents.form.fieldLabels.system_prompt'),
    temperature: t('agents.form.fieldLabels.temperature'),
    context_window: t('agents.form.fieldLabels.context_window'),
    tools: t('agents.form.fieldLabels.tools'),
    coordination_modes: t('agents.form.fieldLabels.coordination_modes'),
    gemini_config: t('agents.form.fieldLabels.gemini_config'),
  };

  const handleInvalid = (errors: Record<string, any>) => {
    console.error('Form validation errors:', errors);
    const fields = Object.keys(errors).map(k => FIELD_LABELS[k] || k);
    toast({
      variant: "destructive",
      title: t('agents.form.invalidToastTitle'),
      description: fields.join(t('agents.form.invalidToastJoiner')),
    });
  };

  const handleFinish = async (values: AgentFormValues) => {
    try {
      const { tools_enabled, gemini_config, image_config, video_config, compaction_config, ...rest } = values;
      
      // Clean up gemini_config（仅保留思考、媒体、搜索字段）
      const cleanedGeminiConfig = gemini_config ? {
        thinking_level: gemini_config.thinking_level || null,
        media_resolution: gemini_config.media_resolution || null,
        google_search_enabled: gemini_config.google_search_enabled || false,
        google_image_search_enabled: gemini_config.google_image_search_enabled || false,
      } : undefined;

      // Clean up unified image_config
      const imgCfg = image_config?.image_generation_enabled && image_config.image_config ? {
        aspect_ratio: image_config.image_config.aspect_ratio || null,
        quality: image_config.image_config.quality || null,
        batch_count: image_config.image_config.batch_count || null,
        output_format: image_config.image_config.output_format || null,
      } : null;

      const cleanedImageConfig = image_config ? {
        image_generation_enabled: image_config.image_generation_enabled || false,
        image_provider_id: image_config.image_generation_enabled ? (image_config.image_provider_id || null) : null,
        image_model: image_config.image_generation_enabled ? (image_config.image_model || null) : null,
        image_config: imgCfg,
      } : undefined;

      // Clean up video_config
      const cleanedVideoConfig = {
        video_generation_enabled: video_config?.video_generation_enabled || false,
      };

      // Clean up compaction_config
      const cleanedCompactionConfig = compaction_config?.enabled ? {
        enabled: true,
        provider_id: compaction_config.provider_id || '',
        model: compaction_config.model || '',
        compact_ratio: compaction_config.compact_ratio ?? 0.75,
        reserve_ratio: compaction_config.reserve_ratio ?? 0.15,
        tool_old_threshold: compaction_config.tool_old_threshold ?? 500,
        tool_recent_n: compaction_config.tool_recent_n ?? 5,
        max_summary_tokens: compaction_config.max_summary_tokens ?? 4096,
      } : { enabled: false, compact_ratio: 0.75, reserve_ratio: 0.15, tool_old_threshold: 500, tool_recent_n: 5, max_summary_tokens: 4096 };

      const payload: Partial<Agent> = {
        ...rest,
        tools: tools_enabled ? values.tools : [],
        gemini_config: cleanedGeminiConfig,
        image_config: cleanedImageConfig,
        video_config: cleanedVideoConfig,
        compaction_config: cleanedCompactionConfig,
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
        title: t('agents.form.submitFailedTitle'),
        description: formatApiError(error, t('agents.form.submitFailedDesc')),
      });
    }
  };

  const formContent = (
    <>
      {twoColumn ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 xl:col-span-7">
            <Section title={t('agents.form.sections.basic')}>
              <BasicInfo 
                providers={activeProviders || []} 
                loading={providersLoading || loading}
                isFormInitialized={isFormInitialized}
              />
            </Section>
            <div className="h-px bg-border my-8"></div>
            <Section title={t('agents.form.sections.system')}>
               <SystemPrompt disabled={loading} />
            </Section>
          </div>
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="space-y-6 pb-4">
              <Section title={t('agents.form.sections.params')}>
                <Parameters disabled={loading} providers={activeProviders || []} />
              </Section>
              <Section title={t('agents.form.sections.capabilities')}>
                <Tools disabled={loading} />
              </Section>
              <Section title={t('agents.form.sections.leader')} className="mb-0">
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

            <Parameters disabled={loading} providers={activeProviders || []} />

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
      <form onSubmit={form.handleSubmit(handleFinish, handleInvalid)} className="space-y-8">
        {formContent}
      </form>
    </Form>
  );
}
