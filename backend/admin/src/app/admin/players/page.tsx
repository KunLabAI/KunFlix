'use client';

import React from 'react';
import { Table, Button, Popconfirm, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function PlayersPage() {
  const { data: players, error, isLoading } = useSWR('/admin/players', fetcher);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/players/${id}`);
      message.success('玩家删除成功');
      mutate('/admin/players');
    } catch (err) {
      message.error('删除玩家失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
          <Button icon={<DeleteOutlined />} danger />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>玩家列表</h2>
      <Table columns={columns} dataSource={players} rowKey="id" loading={isLoading} />
    </div>
  );
}
