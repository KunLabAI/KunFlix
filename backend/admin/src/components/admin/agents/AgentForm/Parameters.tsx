import React from 'react';
import { Form, Row, Col, Radio, InputNumber, Slider, Typography, Space } from 'antd';

const { Text } = Typography;

const Parameters: React.FC<{ disabled?: boolean }> = ({ disabled }) => (
  <div className="space-y-6">
    <div className="bg-white rounded-xl border border-gray-100 p-5">
       <div className="flex justify-between items-center mb-4">
         <span className="text-sm font-medium text-gray-700">思考模式</span>
         <Form.Item name="thinking_mode" noStyle>
           <Radio.Group disabled={disabled} size="small" buttonStyle="solid">
             <Radio.Button value={true}>开启</Radio.Button>
             <Radio.Button value={false}>关闭</Radio.Button>
           </Radio.Group>
         </Form.Item>
       </div>
       <Text type="secondary" className="text-xs">开启后，模型会在回答前进行思考过程（Chain of Thought）。</Text>
    </div>

    <div className="bg-white rounded-xl border border-gray-100 p-5">
       <div className="mb-4">
         <div className="flex justify-between items-center mb-1">
           <span className="text-sm font-medium text-gray-700">上下文窗口</span>
         </div>
         <Form.Item 
            name="context_window" 
            rules={[
              { type: 'number', min: 4096, max: 256000, message: '范围 4096 - 256000' }
            ]}
            noStyle
          >
            <Space.Compact className="w-full">
              <InputNumber 
                className="w-full rounded-lg border-gray-200" 
                disabled={disabled} 
              />
              <span className="inline-flex items-center px-3 text-xs text-gray-500 bg-gray-50 border border-l-0 border-gray-200 rounded-r-lg">
                Tokens
              </span>
            </Space.Compact>
          </Form.Item>
       </div>
    </div>

    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">温度 (Temperature)</span>
        <Form.Item name="temperature" noStyle>
            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">
               {/* This is tricky to show dynamic value without useWatch, let's just leave it */}
               Creative vs Precise
            </span>
        </Form.Item>
      </div>
      
      <Row gutter={16} align="middle">
        <Col span={18}>
          <Form.Item name="temperature" noStyle>
            <Slider 
              min={0} 
              max={1} 
              step={0.1} 
              disabled={disabled} 
              tooltip={{ formatter: (value) => `${value}` }}
              trackStyle={{ backgroundColor: '#000' }}
              handleStyle={{ borderColor: '#000', boxShadow: 'none' }}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="temperature" noStyle>
            <InputNumber 
              min={0} 
              max={1} 
              step={0.1} 
              className="w-full rounded-lg border-gray-200" 
              disabled={disabled} 
            />
          </Form.Item>
        </Col>
      </Row>
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>0 (精确)</span>
        <span>1 (创造性)</span>
      </div>
    </div>
  </div>
);

export default Parameters;
