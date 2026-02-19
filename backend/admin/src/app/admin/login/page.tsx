'use client';

import React from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();

  const onFinish = (values: any) => {
    // Mock authentication
    if (values.username === 'admin' && values.password === 'admin') {
      message.success('登录成功');
      login('mock_token_123');
    } else {
      message.error('用户名或密码错误');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="管理员登录" style={{ width: 300 }}>
        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名！' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码！' }]}
          >
            <Input
              prefix={<LockOutlined />}
              type="password"
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ width: '100%' }}>
              登录
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center', color: '#888' }}>
            默认账号：admin / admin
          </div>
        </Form>
      </Card>
    </div>
  );
}
