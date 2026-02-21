"use client";

import React, { useState } from "react";
import { Form, Input, Button, Typography, message, Card, Space } from "antd";
import { MailOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import type { TokenResponse } from "@/context/AuthContext";
import api from "@/lib/api";

const { Title, Text, Link } = Typography;

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const onLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/auth/login", values);
      message.success(`欢迎回来，${data.user.nickname}`);
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      message.error(err.response?.data?.detail || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values: {
    email: string;
    nickname: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      await api.post("/auth/register", values);
      const { data } = await api.post<TokenResponse>("/auth/login", {
        email: values.email,
        password: values.password,
      });
      message.success(`欢迎，${data.user.nickname}`);
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      message.error(err.response?.data?.detail || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background transition-colors duration-300">
      <Card
        className="w-[400px] border-border shadow-lg"
        bordered={false}
      >
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <Title level={3} style={{ margin: 0 }}>
              Infinite Narrative Game
            </Title>
            <Text type="secondary">
              {mode === "login" ? "登录你的账号" : "创建新账号"}
            </Text>
          </div>

          {mode === "login" ? (
            <Form layout="vertical" onFinish={onLogin} autoComplete="off">
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "请输入有效的邮箱" },
                ]}
              >
                <Input
                  prefix={<MailOutlined />}
                  placeholder="邮箱"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  size="large"
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  登录
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <Form layout="vertical" onFinish={onRegister} autoComplete="off">
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "请输入有效的邮箱" },
                ]}
              >
                <Input
                  prefix={<MailOutlined />}
                  placeholder="邮箱"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="nickname"
                rules={[{ required: true, message: "请输入昵称" }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="昵称"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[
                  { required: true, message: "请输入密码" },
                  { min: 6, message: "密码至少6位" },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "请确认密码" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      return !value || getFieldValue("password") === value
                        ? Promise.resolve()
                        : Promise.reject(new Error("两次密码不一致"));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="确认密码"
                  size="large"
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  注册
                </Button>
              </Form.Item>
            </Form>
          )}

          <div style={{ textAlign: "center" }}>
            <Text type="secondary">
              {mode === "login" ? "还没有账号？" : "已有账号？"}{" "}
              <Link onClick={switchMode}>
                {mode === "login" ? "立即注册" : "返回登录"}
              </Link>
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}
