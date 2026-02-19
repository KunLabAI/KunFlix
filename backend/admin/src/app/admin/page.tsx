'use client';

import React from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { UserOutlined, BookOutlined, RobotOutlined, FileImageOutlined } from '@ant-design/icons';
import useSWR from 'swr';
import api from '@/lib/axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function AdminDashboard() {
  const { data: stats, error, isLoading } = useSWR('/admin/stats', fetcher);

  if (error) return <div>加载失败</div>;
  if (isLoading) return <div>加载中...</div>;

  const data = [
    { name: '玩家', count: stats.players },
    { name: '故事', count: stats.stories },
    { name: '资产', count: stats.assets },
    { name: '供应商', count: stats.providers },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>仪表盘</h2>
      <Row gutter={16}>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="玩家总数"
              value={stats.players}
              prefix={<UserOutlined />}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="故事总数"
              value={stats.stories}
              prefix={<BookOutlined />}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="生成资产数"
              value={stats.assets}
              prefix={<FileImageOutlined />}
              styles={{ content: { color: '#108ee9' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="AI 供应商"
              value={stats.providers}
              prefix={<RobotOutlined />}
              styles={{ content: { color: '#faad14' } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card title="系统概览" variant="borderless">
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart
                  data={data}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="数量" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
