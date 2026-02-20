'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Form, Row, Col, Collapse, message } from 'antd';
import { Agent, AgentFormValues } from '@/types';
import { DEFAULT_AGENT_VALUES } from '@/constants/agent';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import BasicInfo from './BasicInfo';
import SystemPrompt from './SystemPrompt';
import Parameters from './Parameters';
import Tools from './Tools';

const { Panel } = Collapse;

interface AgentFormProps {
  initialValues?: Agent | null;
  onSubmit: (values: Partial<Agent>) => Promise<void>;
  loading?: boolean;
  onFormInstanceReady?: (instance: any) => void;
  twoColumn?: boolean;
}

const Section = ({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) => (
  <div className={`mb-8 ${className || ''}`}>
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
  const [form] = Form.useForm();
  const { activeProviders, isLoading: providersLoading } = useLLMProviders();
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [toolsEnabled, setToolsEnabled] = useState(false);

  // Expose form instance
  useEffect(() => {
    if (onFormInstanceReady) {
      onFormInstanceReady(form);
    }
  }, [form, onFormInstanceReady]);

  // Initialize form
  useEffect(() => {
    if (initialValues) {
      const hasTools = !!(initialValues.tools && initialValues.tools.length > 0);
      form.setFieldsValue({
        ...initialValues,
        tools_enabled: hasTools
      });
      setSelectedProviderId(initialValues.provider_id);
      setToolsEnabled(hasTools);
    } else {
      form.resetFields();
      form.setFieldsValue(DEFAULT_AGENT_VALUES);
      setSelectedProviderId(null);
      setToolsEnabled(false);
    }
  }, [initialValues, form]);

  const onProviderChange = useCallback((value: number) => {
    setSelectedProviderId(value);
    form.setFieldValue('model', undefined);
  }, [form]);

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
      message.error('提交失败，请重试');
    }
  };

  const formContent = (
    <>
      {twoColumn ? (
        <Row gutter={48}>
          <Col xs={24} lg={14} xl={16}>
            <Section title="基础信息">
              <BasicInfo 
                providers={activeProviders || []} 
                selectedProviderId={selectedProviderId}
                onProviderChange={onProviderChange}
                loading={providersLoading || loading}
              />
            </Section>
            <div className="h-px bg-gray-100 my-8"></div>
            <Section title="系统设定">
               <SystemPrompt disabled={loading} />
            </Section>
          </Col>
          <Col xs={24} lg={10} xl={8}>
            <div className="sticky top-0 space-y-6">
              <Section title="参数设置">
                <Parameters disabled={loading} />
              </Section>
              <Section title="工具能力" className="mb-0">
                <Tools 
                  toolsEnabled={toolsEnabled} 
                  onToolsEnabledChange={setToolsEnabled}
                  disabled={loading}
                />
              </Section>
            </div>
          </Col>
        </Row>
      ) : (
        <div className="space-y-8">
            <BasicInfo 
              providers={activeProviders || []} 
              selectedProviderId={selectedProviderId}
              onProviderChange={onProviderChange}
              loading={providersLoading || loading}
            />
            
            <div className="h-px bg-gray-100"></div>
            
            <SystemPrompt disabled={loading} />
            
            <div className="h-px bg-gray-100"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Parameters disabled={loading} />
               <Tools 
                toolsEnabled={toolsEnabled} 
                onToolsEnabledChange={setToolsEnabled}
                disabled={loading}
              />
            </div>
        </div>
      )}
    </>
  );

  return (
    <Form 
      form={form} 
      layout="vertical" 
      onFinish={handleFinish} 
      initialValues={initialValues || DEFAULT_AGENT_VALUES} 
      size="large"
      disabled={loading}
      requiredMark={false}
    >
      {formContent}
    </Form>
  );
}
