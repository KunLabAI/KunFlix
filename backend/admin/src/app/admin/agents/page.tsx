'use client';

import React, { useState } from 'react';
import { Table, Button, Space, Input, Tag, Popconfirm, message, Tooltip, Card, Typography, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, AppstoreOutlined, BarsOutlined, RobotOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAgents, useDeleteAgent } from '@/hooks/useAgents';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { Agent } from '@/types';

const { Title, Text } = Typography;

export default function AgentsPage() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [messageApi, contextHolder] = message.useMessage();
  
  const { agents, isLoading, mutate } = useAgents(searchText, pagination.current, pagination.pageSize);
  const { providers } = useLLMProviders();
  const { deleteAgent } = useDeleteAgent();

  const handleDelete = async (id: number) => {
    try {
      await deleteAgent(id);
      messageApi.success('智能体删除成功');
      mutate();
    } catch (err: any) {
      messageApi.error(err.response?.data?.detail || '删除失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Agent) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 transition-transform hover:scale-110">
            <RobotOutlined className="text-xl" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-gray-900">{text}</span>
            <span className="text-xs text-gray-500 line-clamp-1 max-w-[200px]">{record.description}</span>
          </div>
        </div>
      ),
    },
    {
      title: '模型配置',
      key: 'model',
      render: (_: any, record: Agent) => {
        const provider = providers?.find((p) => p.id === record.provider_id);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">供应商</span>
              <Tag variant="filled" className="bg-gray-100 text-gray-600 m-0">{provider?.name || 'Unknown'}</Tag>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">模型</span>
              <span className="text-sm text-gray-700 font-medium">{record.model}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: '参数',
      key: 'params',
      render: (_: any, record: Agent) => (
        <Space size="small" orientation="vertical" className="w-full">
           <div className="flex justify-between text-xs w-32">
             <span className="text-gray-400">温度</span>
             <span className="font-mono text-gray-600">{record.temperature}</span>
           </div>
           <div className="flex justify-between text-xs w-32">
             <span className="text-gray-400">上下文</span>
             <span className="font-mono text-gray-600">{record.context_window / 1024}k</span>
           </div>
        </Space>
      ),
    },
    {
      title: '能力',
      dataIndex: 'tools',
      key: 'tools',
      render: (tools: string[]) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {tools && tools.length > 0 ? (
             tools.map(t => (
              <Tag key={t} variant="filled" color="blue" className="text-xs m-0">
                 {t}
               </Tag>
             ))
          ) : (
             <span className="text-gray-400 text-xs">无工具</span>
          )}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => <span className="text-gray-400 text-sm">{new Date(date).toLocaleDateString()}</span>,
      sorter: (a: Agent, b: Agent) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Agent) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="编辑">
            <Button type="text" shape="circle" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); router.push(`/admin/agents/${record.id}`); }} />
          </Tooltip>
          <Popconfirm 
            title="确认删除" 
            description="确定要删除这个智能体吗？此操作不可恢复。"
            onConfirm={(e) => { e?.stopPropagation(); record.id && handleDelete(record.id); }}
            onCancel={(e) => e?.stopPropagation()}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button type="text" danger shape="circle" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderGridView = () => (
    <Row gutter={[24, 24]}>
      {agents?.map((agent) => {
        const provider = providers?.find((p) => p.id === agent.provider_id);
        return (
          <Col xs={24} sm={12} lg={8} xl={6} key={agent.id}>
            <div 
              className="group relative bg-white rounded-2xl border border-gray-100 hover:border-blue-500 hover:shadow-lg transition-all duration-300 p-6 h-full flex flex-col cursor-pointer transform hover:-translate-y-1"
              onClick={() => router.push(`/admin/agents/${agent.id}`)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl transition-transform group-hover:scale-110">
                  <RobotOutlined />
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4 bg-white shadow-sm rounded-full p-1 border border-gray-100" onClick={e => e.stopPropagation()}>
                   <Popconfirm 
                      title="确认删除" 
                      onConfirm={(e) => { e?.stopPropagation(); agent.id && handleDelete(agent.id); }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" danger size="small" shape="circle" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </div>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">{agent.name}</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">{agent.description || '暂无描述'}</p>
              
              <div className="mt-auto space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 bg-gray-50 px-2 py-1 rounded-md">{provider?.name || 'Unknown'}</span>
                  <span className="text-gray-600 font-medium">{agent.model}</span>
                </div>
                
                <div className="flex gap-2 border-t border-gray-50 pt-3">
                  {agent.tools && agent.tools.length > 0 ? (
                    agent.tools.slice(0, 3).map(t => (
                      <span key={t} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-gray-300">无工具</span>
                  )}
                  {agent.tools && agent.tools.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{agent.tools.length - 3}</span>
                  )}
                </div>
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );

  return (
    <div className="min-h-screen bg-white animate-fade-in">
      {contextHolder}
      
      {/* Header Section */}
      <div className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <Title level={2} className="!mb-1 !font-bold text-gray-900 tracking-tight">智能体管理</Title>
            <Text className="text-gray-500">创建、配置和管理您的 AI 智能体</Text>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="bg-gray-50 p-1 rounded-lg border border-gray-100 hidden md:flex">
               <Button 
                 type={viewMode === 'list' ? 'text' : 'text'} 
                 className={`${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'} transition-all`}
                 icon={<BarsOutlined />} 
                 onClick={() => setViewMode('list')}
               />
               <Button 
                 type={viewMode === 'grid' ? 'text' : 'text'} 
                 className={`${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'} transition-all`}
                 icon={<AppstoreOutlined />} 
                 onClick={() => setViewMode('grid')}
               />
             </div>
             
             <Button 
               type="primary" 
               size="large" 
               icon={<PlusOutlined />} 
               onClick={() => router.push('/admin/agents/new')}
               className="bg-black hover:!bg-gray-800 border-none shadow-none rounded-xl px-6 h-12 font-medium transition-transform active:scale-95"
             >
               创建智能体
             </Button>
          </div>
        </div>

        {/* Filter Section */}
        <div className="mt-4">
          <Input 
            placeholder="搜索智能体名称、描述或模型..." 
            prefix={<SearchOutlined className="text-gray-400 text-lg mr-2" />} 
            onChange={(e) => setSearchText(e.target.value)}
            className="max-w-md h-12 bg-gray-50 border-gray-100 hover:bg-white focus:bg-white transition-all rounded-xl text-base"
            allowClear
          />
        </div>
      </div>

      {/* Content Section */}
      <div className="min-h-[400px]">
        {viewMode === 'list' ? (
          <Table 
            columns={columns} 
            dataSource={agents} 
            rowKey="id" 
            loading={isLoading}
            pagination={{
              ...pagination,
              total: agents?.length, 
              onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
              className: "mt-8",
              showSizeChanger: false
            }}
            className="custom-table"
            rowClassName="hover:bg-gray-50 transition-colors cursor-pointer"
            onRow={(record) => ({
              onClick: () => router.push(`/admin/agents/${record.id}`),
            })}
          />
        ) : (
          renderGridView()
        )}
      </div>

      <style jsx global>{`
        .custom-table .ant-table {
          background: transparent;
        }
        .custom-table .ant-table-thead > tr > th {
          background: transparent;
          border-bottom: 1px solid #f0f0f0;
          color: #6b7280;
          font-weight: 500;
          font-size: 0.875rem;
        }
        .custom-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f9fafb;
          padding: 16px 16px;
        }
        .custom-table .ant-table-tbody > tr:hover > td {
          background: #f9fafb !important;
        }
      `}</style>
    </div>
  );
}
