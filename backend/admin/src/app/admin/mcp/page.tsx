'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Activity, Plug, Plus, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function MCPPage() {
  const { toast } = useToast();
  
  // Mock data for phase 4 frontend preview
  const clients = [
    {
      id: 'local_sqlite',
      name: 'SQLite Database',
      transport: 'stdio',
      status: 'connected',
      details: 'python sqlite_mcp_server.py',
      toolsCount: 3
    },
    {
      id: 'remote_weather',
      name: 'Weather API',
      transport: 'http',
      status: 'disconnected',
      details: 'https://api.weather-mcp.com/v1',
      toolsCount: 0
    }
  ];

  const handleAction = (action: string, clientName: string) => {
    toast({
      title: "操作成功",
      description: `已${action} MCP 客户端: ${clientName}`,
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">MCP 客户端管理</h2>
          <p className="text-muted-foreground mt-2">
            Model Context Protocol (MCP) 允许 Agent 动态连接到外部工具和数据源。支持无感热重载。
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> 添加客户端
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户端名称</TableHead>
              <TableHead>协议 (Transport)</TableHead>
              <TableHead>连接配置</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>可用工具数</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium flex items-center">
                  <Server className="w-4 h-4 mr-2 text-muted-foreground" />
                  {client.name}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{client.transport}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {client.details}
                </TableCell>
                <TableCell>
                  {client.status === 'connected' ? (
                    <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">
                      <Activity className="w-3 h-3 mr-1" /> 已连接
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">
                      <Plug className="w-3 h-3 mr-1" /> 未连接
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{client.toolsCount}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleAction('编辑', client.name)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleAction('删除', client.name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
