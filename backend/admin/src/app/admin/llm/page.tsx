'use client';

import React, { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Switch, message, Popconfirm, Tag, List, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, MinusCircleOutlined, ApiOutlined } from '@ant-design/icons';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';

interface LLMProvider {
  id: number;
  name: string;
  provider_type: string;
  models: string[];
  tags?: string[];
  is_active: boolean;
  is_default: boolean;
  base_url?: string;
  api_key?: string;
  config_json?: string;
}

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function LLMPage() {
  const { data: providers, error, isLoading } = useSWR('/admin/llm-providers/', fetcher);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [form] = Form.useForm();
  const [isTesting, setIsTesting] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const handleAdd = () => {
    setEditingProvider(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: LLMProvider) => {
    setEditingProvider(record);
    const formValues = {
      ...record,
      config_json: typeof record.config_json === 'object' 
        ? JSON.stringify(record.config_json, null, 2) 
        : record.config_json
    };
    form.setFieldsValue(formValues);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/llm-providers/${id}`);
      messageApi.success('供应商删除成功');
      mutate('/admin/llm-providers/');
    } catch (err) {
      messageApi.error('删除供应商失败');
    }
  };

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields();
      if (!values.models || values.models.length === 0) {
        messageApi.warning('请至少添加一个模型进行测试');
        return;
      }
      
      setIsTesting(true);
      const testModel = values.models[0];
      
      const payload = {
        provider_type: values.provider_type,
        api_key: values.api_key,
        base_url: values.base_url,
        model: testModel,
        config_json: typeof values.config_json === 'string' 
          ? JSON.parse(values.config_json || '{}') 
          : (values.config_json || {})
      };

      const res = await api.post('/admin/llm-providers/test-connection', payload);
      
      if (res.data.success) {
        messageApi.success(`连接成功！回复：${res.data.response}`);
      } else {
        messageApi.error(`连接失败：${res.data.message}`);
      }
    } catch (err: any) {
      console.error(err);
      messageApi.error(`测试失败：${err.message || '未知错误'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      // Ensure config_json is parsed if it's a string
      const submitValues = {
        ...values,
        config_json: typeof values.config_json === 'string'
          ? JSON.parse(values.config_json || '{}')
          : (values.config_json || {})
      };

      if (editingProvider) {
        await api.put(`/admin/llm-providers/${editingProvider.id}`, submitValues);
        messageApi.success('供应商更新成功');
      } else {
        await api.post('/admin/llm-providers/', submitValues);
        messageApi.success('供应商创建成功');
      }
      setIsModalOpen(false);
      mutate('/admin/llm-providers/');
    } catch (err) {
      console.error(err);
      messageApi.error('操作失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '平台名称',
      dataIndex: 'provider_type',
      key: 'provider_type',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) => (
        <>
          {tags && tags.map(tag => (
            <Tag key={tag} color="cyan">{tag}</Tag>
          ))}
        </>
      ),
    },
    {
      title: '模型',
      dataIndex: 'models',
      key: 'models',
      render: (models: string[]) => (
        <>
          {models && models.map(model => (
            <Tag key={model}>{model}</Tag>
          ))}
        </>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '默认',
      dataIndex: 'is_default',
      key: 'is_default',
      render: (def: boolean) => (
        def ? <Tag color="gold">默认</Tag> : null
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: LLMProvider) => (
        <Space size="middle">
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>LLM 供应商</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加供应商
        </Button>
      </div>
      <Table columns={columns} dataSource={providers} rowKey="id" loading={isLoading} />

      <Modal
        title={editingProvider ? "编辑供应商" : "添加供应商"}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="provider_type" label="平台名称" rules={[{ required: true, message: '请选择平台' }]}>
            <Select>
              <Select.Option value="openai">OpenAI</Select.Option>
              <Select.Option value="azure">Azure</Select.Option>
              <Select.Option value="dashscope">Dashscope</Select.Option>
              <Select.Option value="anthropic">Anthropic</Select.Option>
              <Select.Option value="gemini">Gemini</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="例如: llm, audio, image">
              <Select.Option value="llm">LLM</Select.Option>
              <Select.Option value="audio">Audio</Select.Option>
              <Select.Option value="image">Image</Select.Option>
              <Select.Option value="video">Video</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.List
            name="models"
            initialValue={[""]}
            rules={[
              {
                validator: async (_, names) => {
                  if (!names || names.length < 1) {
                    return Promise.reject(new Error('至少需要一个模型'));
                  }
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <Form.Item label="模型列表" required>
                  {fields.map((field, index) => (
                    <Form.Item
                      required={false}
                      key={field.key}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Form.Item
                          validateTrigger={['onChange', 'onBlur']}
                          rules={[
                            {
                              required: true,
                              whitespace: true,
                              message: "请输入模型名称或删除此字段",
                            },
                          ]}
                          noStyle
                          name={[field.name]}
                        >
                          <Input placeholder="模型名称 (例如 gpt-4)" style={{ width: '90%' }} />
                        </Form.Item>
                        {fields.length > 1 ? (
                          <MinusCircleOutlined
                            className="dynamic-delete-button"
                            onClick={() => remove(field.name)}
                            style={{ marginLeft: 8 }}
                          />
                        ) : null}
                      </div>
                    </Form.Item>
                  ))}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      style={{ width: '100%' }}
                      icon={<PlusOutlined />}
                    >
                      添加模型
                    </Button>
                    <Form.ErrorList errors={errors} />
                  </Form.Item>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Form.Item name="base_url" label="基础 URL">
            <Input />
          </Form.Item>
          <Form.Item name="api_key" label="API 密钥">
            <Input.Password />
          </Form.Item>
          <Form.Item 
            name="config_json" 
            label="配置 JSON"
            rules={[
              {
                validator: async (_, value) => {
                  if (value && typeof value === 'string') {
                    try {
                      JSON.parse(value);
                    } catch (e) {
                      throw new Error('请输入有效的 JSON 格式');
                    }
                  }
                },
              },
            ]}
          >
            <Input.TextArea rows={4} placeholder='{"timeout": 30, ...}' />
          </Form.Item>
          
          <Button 
            icon={<ApiOutlined />} 
            onClick={handleTestConnection} 
            loading={isTesting}
            style={{ marginBottom: 24 }}
          >
            测试连接
          </Button>

          <div style={{ display: 'flex', gap: 24 }}>
            <Form.Item name="is_active" valuePropName="checked" label="启用">
              <Switch />
            </Form.Item>
            <Form.Item name="is_default" valuePropName="checked" label="默认">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
