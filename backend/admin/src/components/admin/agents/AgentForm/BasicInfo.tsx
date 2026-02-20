import React, { useMemo } from 'react';
import { Form, Input, Select, Row, Col, Typography } from 'antd';
import { LLMProvider } from '@/types';
import { parseProviderModels } from '@/lib/api-utils';

const { Text } = Typography;

interface BasicInfoProps {
  providers: LLMProvider[];
  selectedProviderId: number | null;
  onProviderChange: (value: number) => void;
  loading?: boolean;
}

const BasicInfo: React.FC<BasicInfoProps> = ({ 
  providers, 
  selectedProviderId, 
  onProviderChange, 
  loading 
}) => {
  const availableModels = useMemo(() => {
    if (!selectedProviderId || !providers) return [];
    const provider = providers.find(p => p.id === selectedProviderId);
    return provider ? parseProviderModels(provider.models) : [];
  }, [selectedProviderId, providers]);

  return (
    <div className="space-y-4">
      <Form.Item 
        name="name" 
        label={<span className="text-gray-700 font-medium">名称</span>}
        rules={[
          { required: true, message: '请输入智能体名称' },
          { max: 50, message: '最大长度50字符' }
        ]}
      >
        <Input 
          placeholder="给智能体起个名字，例如: 故事导演" 
          disabled={loading} 
          className="h-10 rounded-lg border-gray-200 hover:border-gray-300 focus:border-black focus:shadow-none"
        />
      </Form.Item>

      <Form.Item 
        name="description" 
        label={<span className="text-gray-700 font-medium">描述</span>}
        rules={[
          { required: true, message: '请输入描述' },
          { max: 500, message: '最大长度500字符' }
        ]}
      >
        <Input.TextArea 
          rows={3} 
          placeholder="简要描述智能体的职责和功能..." 
          disabled={loading}
          className="rounded-lg border-gray-200 hover:border-gray-300 focus:border-black focus:shadow-none resize-none"
        />
      </Form.Item>

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <Text className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-3 block">模型配置</Text>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              name="provider_id" 
              label={<span className="text-gray-600 text-xs">供应商</span>}
              rules={[{ required: true, message: '请选择供应商' }]}
              className="mb-0"
            >
              <Select 
                placeholder="选择供应商" 
                onChange={onProviderChange}
                options={providers.map(p => ({ label: p.name, value: p.id }))}
                loading={loading}
                disabled={loading}
                className="h-9"
                variant="borderless"
                style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
             <Form.Item 
              name="model" 
              label={<span className="text-gray-600 text-xs">模型</span>}
              rules={[{ required: true, message: '请选择模型' }]}
              className="mb-0"
            >
              <Select 
                placeholder={selectedProviderId ? "选择模型" : "先选择供应商"}
                options={availableModels.map(m => ({ label: m, value: m }))}
                disabled={!selectedProviderId || loading}
                className="h-9"
                variant="borderless"
                style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </Form.Item>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default BasicInfo;
