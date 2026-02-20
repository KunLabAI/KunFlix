'use client';

import React, { useState } from 'react';
import { Layout, message, Result, Button, Spin, Row, Col, Typography, Breadcrumb, Tabs } from 'antd';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeftOutlined, SaveOutlined, RobotOutlined, MessageOutlined, SettingOutlined } from '@ant-design/icons';
import AgentForm from '@/components/admin/agents/AgentForm';
import { useAgent, useCreateAgent, useUpdateAgent } from '@/hooks/useAgents';
import { Agent } from '@/types';
import dynamic from 'next/dynamic';

const { Title, Text } = Typography;

const ChatInterface = dynamic(() => import('@/components/admin/agents/ChatInterface'), {
  loading: () => <div className="h-full flex items-center justify-center bg-gray-50"><Spin /></div>,
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
  
  const [formInstance, setFormInstance] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: Partial<Agent>) => {
    setSaving(true);
    try {
      if (isNew) {
        const res = await createAgent(values);
        message.success('创建成功');
        router.replace(`/admin/agents/${res.data.id}`);
      } else {
        await updateAgent(Number(id), values);
        message.success('更新成功');
        mutate();
      }
    } catch (err: any) {
      console.error(err);
      message.error(err.response?.data?.detail || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (formInstance) {
      formInstance.submit();
    }
  };

  if (isLoading && !isNew) {
    return <div className="h-screen flex items-center justify-center"><Spin size="large" /></div>;
  }

  if (error && !isNew) {
    return (
      <Result
        status="404"
        title="Agent Not Found"
        subTitle="Sorry, the agent you visited does not exist."
        extra={<Button type="primary" onClick={() => router.push('/admin/agents')}>Back Home</Button>}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />} 
            onClick={() => router.push('/admin/agents')}
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-50"
          />
          <div className="h-6 w-[1px] bg-gray-200 mx-1"></div>
          <div className="flex flex-col">
            <span className="font-semibold text-gray-900 text-base leading-tight">
              {isNew ? '创建新智能体' : agent?.name || 'Loading...'}
            </span>
            {!isNew && <span className="text-xs text-gray-400">ID: {id}</span>}
          </div>
        </div>
        
        <div className="flex gap-3">
            <Button onClick={() => router.push('/admin/agents')} className="rounded-lg border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900">
              取消
            </Button>
            <Button 
              type="primary" 
              icon={<SaveOutlined />} 
              onClick={handleSave} 
              loading={saving}
              className="rounded-lg shadow-none bg-black hover:!bg-gray-800 border-none px-6"
            >
              保存
            </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {isNew ? (
          <div className="h-full overflow-y-auto bg-gray-50/50">
            <div className="max-w-4xl mx-auto py-12 px-6">
              <div className="mb-8">
                <Title level={3} className="!mb-2">开始配置</Title>
                <Text className="text-gray-500">配置智能体的基础信息、模型参数及系统提示词。</Text>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                 <AgentForm onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} twoColumn={true} />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col lg:flex-row">
            {/* Left Panel: Configuration */}
            <div className="flex-1 lg:w-1/2 lg:flex-none xl:w-[45%] h-full overflow-y-auto border-r border-gray-100 bg-white">
              <div className="p-6 lg:p-8 max-w-3xl mx-auto">
                 <div className="flex items-center gap-2 mb-6 text-gray-900 font-medium">
                   <SettingOutlined />
                   <span>配置</span>
                 </div>
                 <AgentForm initialValues={agent} onSubmit={handleSubmit} onFormInstanceReady={setFormInstance} />
              </div>
            </div>

            {/* Right Panel: Chat Preview */}
            <div className="flex-1 h-full bg-gray-50 flex flex-col overflow-hidden relative">
              <div className="absolute top-4 right-4 z-10">
                 {/* Optional: Add controls for chat here */}
              </div>
              <div className="flex-1 p-4 lg:p-6 h-full">
                <div className="h-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="h-12 border-b border-gray-50 flex items-center px-4 bg-white shrink-0">
                    <span className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <MessageOutlined />
                      预览对话
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <ChatInterface agentId={Number(id)} />
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
