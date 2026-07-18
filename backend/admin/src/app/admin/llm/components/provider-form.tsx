'use client';

import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { Plug, Save, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { createFormSchema, FormValues, LLMProvider } from '../schema';
import { FormStepper, StepMeta } from './wizard/form-stepper';
import { StepBasic } from './wizard/step-basic';
import { StepConnection } from './wizard/step-connection';
import { StepModels } from './wizard/step-models';

interface ProviderFormProps {
  initialData?: LLMProvider;
}

// 步骤注册表：key 对应 i18n llm.form.steps.* 与步骤内容组件，fields 用于分步校验门控
const STEP_DEFINITIONS: { key: string; fields: (keyof FormValues)[] }[] = [
  { key: 'basic', fields: ['name', 'provider_type'] },
  { key: 'connection', fields: ['base_url', 'api_key', 'config_json'] },
  { key: 'models', fields: ['models'] },
];

export function ProviderForm({ initialData }: ProviderFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  // 编辑模式默认开放全部步骤跳转；创建模式仅开放已访问步骤
  const [visitedSteps, setVisitedSteps] = useState<number[]>(() =>
    initialData ? STEP_DEFINITIONS.map((_, i) => i) : [0]
  );
  const [modelCosts, setModelCosts] = useState<Record<string, Record<string, number>>>(initialData?.model_costs || {});

  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      provider_type: initialData?.provider_type || "",
      tags: initialData?.tags || [],
      models: initialData?.models.map(m => {
        const meta = initialData?.model_metadata?.[m];
        return { value: m, type: meta?.model_type || "", display_name: meta?.display_name || "" };
      }) || [{ value: "", type: "", display_name: "" }],
      base_url: initialData?.base_url || "",
      api_key: initialData?.api_key || "",
      config_json: initialData?.config_json && typeof initialData.config_json === 'object' ? JSON.stringify(initialData.config_json, null, 2) : (initialData?.config_json || "{}"),
    },
  });

  const steps: StepMeta[] = STEP_DEFINITIONS.map((def) => ({
    key: def.key,
    title: t(`llm.form.steps.${def.key}.title`),
    description: t(`llm.form.steps.${def.key}.description`),
  }));

  const goToStep = (index: number) => {
    setVisitedSteps((prev) => (prev.includes(index) ? prev : [...prev, index]));
    setCurrentStep(index);
  };

  const handleNext = async () => {
    const valid = await form.trigger(STEP_DEFINITIONS[currentStep].fields as any);
    valid && goToStep(currentStep + 1);
  };

  const handlePrev = () => goToStep(currentStep - 1);

  const handleStepClick = (index: number) => {
    visitedSteps.includes(index) && setCurrentStep(index);
  };

  // 校验失败时跳转到首个包含错误字段的步骤，使错误信息可见
  const goToFirstErrorStep = () => {
    const errorKeys = Object.keys(form.formState.errors);
    const stepIndex = STEP_DEFINITIONS.findIndex((def) => def.fields.some((f) => errorKeys.includes(f)));
    stepIndex >= 0 && goToStep(stepIndex);
  };

  const handleTestConnection = async () => {
    try {
      const values = await form.trigger();
      if (!values) {
        goToFirstErrorStep();
        return;
      }

      const data = form.getValues();
      if (!data.models || data.models.length === 0 || !data.models[0].value) {
        toast({
          variant: "destructive",
          title: t('llm.form.toast.selectModelForTest'),
        });
        return;
      }

      setIsTesting(true);
      const testModel = data.models[0].value;

      const payload = {
        provider_type: data.provider_type,
        api_key: data.api_key,
        base_url: data.base_url,
        model: testModel,
        config_json: JSON.parse(data.config_json || '{}')
      };

      const res = await api.post('/admin/llm-providers/test-connection', payload);

      if (res.data.success) {
        toast({
          title: t('llm.form.toast.testSuccess'),
          description: t('llm.form.toast.testSuccessDesc', { response: res.data.response }),
        });
      } else {
        toast({
          variant: "destructive",
          title: t('llm.form.toast.testFailed'),
          description: res.data.message,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t('llm.form.toast.testError'),
        description: err.message || t('llm.form.toast.unknownError'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSaving(true);
    try {
      const modelNames = values.models.map(m => m.value);
      const cleanedCosts: Record<string, Record<string, number>> = {};
      modelNames.forEach(name => {
        if (modelCosts[name]) {
          cleanedCosts[name] = modelCosts[name];
        }
      });

      const configJsonObj = JSON.parse(values.config_json || '{}');

      const modelMetadata: Record<string, { model_type?: string; display_name?: string }> = {};
      values.models.forEach(m => {
        const entry: { model_type?: string; display_name?: string } = {};
        if (m.type) entry.model_type = m.type;
        if (m.display_name) entry.display_name = m.display_name;
        if (Object.keys(entry).length > 0) {
          modelMetadata[m.value] = entry;
        }
      });

      const submitValues = {
        ...values,
        models: modelNames,
        config_json: configJsonObj,
        model_costs: cleanedCosts,
        model_metadata: modelMetadata,
        is_active: true,
        is_default: false,
      };

      if (initialData) {
        await api.put(`/admin/llm-providers/${initialData.id}`, submitValues);
        toast({ title: t('llm.form.toast.updateSuccess') });
      } else {
        await api.post('/admin/llm-providers', submitValues);
        toast({ title: t('llm.form.toast.createSuccess') });
      }
      mutate('/admin/llm-providers/');
      router.push('/admin/llm');
    } catch {
      toast({
        variant: "destructive",
        title: t('llm.form.toast.submitFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    form.handleSubmit(onSubmit as any, goToFirstErrorStep)();
  };

  // 步骤头部右侧的圆形图标操作组：上一步 / 下一步 / 测试连接 / 保存，hover 时显示 tooltip
  const renderStepActions = (stepIndex: number) => {
    const isLast = stepIndex === STEP_DEFINITIONS.length - 1;
    return (
      <div className="flex items-center gap-1">
        {stepIndex > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('llm.form.wizard.prev')}</TooltipContent>
          </Tooltip>
        )}
        {isLast && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={handleTestConnection} disabled={isTesting}>
                {isTesting ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Plug className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('llm.form.testConnection')}</TooltipContent>
          </Tooltip>
        )}
        {isLast ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" className="rounded-full" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Save className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('llm.form.save')}</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" className="rounded-full" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('llm.form.wizard.next')}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  // 步骤内容注册表：按当前步骤索引渲染，避免条件分支
  const stepContents = [
    <StepBasic key="basic" form={form} actions={renderStepActions(0)} />,
    <StepConnection key="connection" form={form} actions={renderStepActions(1)} />,
    <StepModels key="models" form={form} modelCosts={modelCosts} setModelCosts={setModelCosts} actions={renderStepActions(2)} />,
  ];

  return (
    <TooltipProvider delayDuration={200}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button type="button" variant="ghost" size="icon" onClick={() => router.back()} title={t('llm.form.back')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight truncate">{initialData ? t('llm.form.editTitle') : t('llm.form.createTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('llm.form.subtitle')}</p>
        </div>
        {initialData && (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">{t('llm.form.idLabel', { id: initialData.id })}</span>
        )}
      </div>

      {/* Stepper */}
      <FormStepper steps={steps} currentStep={currentStep} visitedSteps={visitedSteps} onStepClick={handleStepClick} />

      {/* Step Content */}
      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          {stepContents[currentStep]}
        </form>
      </Form>
    </TooltipProvider>
  );
}
