'use client';

import React from 'react';
import { Table, Tag, Tooltip } from 'antd';
import useSWR from 'swr';
import api from '@/lib/axios';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function StoriesPage() {
  const { data: stories, error, isLoading } = useSWR('/admin/stories', fetcher);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      render: (text: string) => (
        <Tooltip title={text}>
          <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {text}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>故事记录</h2>
      <Table columns={columns} dataSource={stories} rowKey="id" loading={isLoading} />
    </div>
  );
}
