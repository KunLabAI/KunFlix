import React from 'react';
import { Form, Input } from 'antd';

const SystemPrompt: React.FC<{ disabled?: boolean }> = ({ disabled }) => (
  <Form.Item 
    name="system_prompt" 
    rules={[{ required: true, message: '请输入系统提示词' }]}
    className="mb-0"
    label={<span className="text-gray-700 font-medium">系统提示词 (System Prompt)</span>}
  >
    <Input.TextArea 
      rows={12} 
      showCount 
      maxLength={5000} 
      className="font-mono text-sm leading-relaxed resize-y border-gray-200 hover:border-gray-300 focus:border-black focus:shadow-none bg-gray-50/50 p-4 rounded-xl"
      placeholder="你是一个专业的助手..."
      disabled={disabled}
      style={{ minHeight: '300px' }}
    />
  </Form.Item>
);

export default SystemPrompt;
