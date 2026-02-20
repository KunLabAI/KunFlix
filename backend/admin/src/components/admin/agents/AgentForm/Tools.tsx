import React from 'react';
import { Form, Switch, Select, Typography } from 'antd';
import { AVAILABLE_TOOLS } from '@/constants/agent';

const { Text } = Typography;

interface ToolsProps {
  toolsEnabled: boolean;
  onToolsEnabledChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Tools: React.FC<ToolsProps> = ({ toolsEnabled, onToolsEnabledChange, disabled }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5">
    <div className="flex justify-between items-center mb-4">
      <span className="text-sm font-medium text-gray-700">工具能力</span>
      <Form.Item 
        name="tools_enabled" 
        valuePropName="checked"
        noStyle
      >
        <Switch 
          onChange={onToolsEnabledChange} 
          disabled={disabled} 
          className="bg-gray-200"
        />
      </Form.Item>
    </div>

    {toolsEnabled ? (
      <Form.Item 
        name="tools" 
        rules={[{ required: true, message: '请至少选择一个工具', type: 'array', min: 1 }]}
        className="mb-0"
      >
        <Select 
          mode="multiple" 
          options={AVAILABLE_TOOLS} 
          placeholder="选择要启用的工具..." 
          disabled={disabled}
          className="w-full"
          variant="filled"
          style={{ width: '100%' }}
          tagRender={(props) => (
            <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded text-xs mr-1">
              {props.label}
            </span>
          )}
        />
      </Form.Item>
    ) : (
      <Text type="secondary" className="text-xs">
        启用工具以允许智能体访问外部数据或执行操作。
      </Text>
    )}
  </div>
);

export default Tools;
