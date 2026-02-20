'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgents, useDeleteAgent } from '@/hooks/useAgents';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { Agent } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Search, LayoutGrid, List, Bot, Cpu, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AgentsPage() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const { toast } = useToast();
  
  const { agents, isLoading, mutate } = useAgents(searchText, pagination.current, pagination.pageSize);
  const { providers } = useLLMProviders();
  const { deleteAgent } = useDeleteAgent();

  const handleDelete = async (id: string) => {
    try {
      await deleteAgent(id);
      toast({
        title: "智能体删除成功",
      });
      mutate();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: err.response?.data?.detail || '未知错误',
      });
    }
  };

  const renderGridView = () => (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {agents?.map((agent) => {
        const provider = providers?.find((p) => p.id === agent.provider_id);
        return (
          <Card 
            key={agent.id} 
            className="group relative cursor-pointer transition-all hover:border-primary hover:shadow-lg"
            onClick={() => router.push(`/admin/agents/${agent.id}`)}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <Bot className="h-6 w-6" />
                </div>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => agent.id && handleDelete(agent.id)}>确认删除</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="mb-1 text-lg group-hover:text-primary transition-colors">{agent.name}</CardTitle>
              <CardDescription className="line-clamp-2 h-10 text-xs">
                {agent.description || '暂无描述'}
              </CardDescription>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-3 border-t bg-muted/20 p-4">
              <div className="flex w-full items-center justify-between text-xs">
                <Badge variant="secondary" className="font-normal">{provider?.name || 'Unknown'}</Badge>
                <span className="font-medium text-muted-foreground">{agent.model}</span>
              </div>
              <div className="flex w-full flex-wrap gap-1">
                {agent.tools && agent.tools.length > 0 ? (
                  agent.tools.slice(0, 3).map(t => (
                    <Badge key={t} variant="outline" className="text-[10px] bg-blue-50/50 text-blue-600 border-blue-100">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground">无工具</span>
                )}
                {agent.tools && agent.tools.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{agent.tools.length - 3}</span>
                )}
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">智能体管理</h2>
          <p className="text-muted-foreground">创建、配置和管理您的 AI 智能体</p>
        </div>
        
        <div className="flex items-center gap-2">
           <div className="hidden md:flex items-center rounded-lg border bg-background p-1 shadow-sm">
             <Button 
               variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
               size="sm"
               onClick={() => setViewMode('list')}
               className="h-8 w-8 p-0"
             >
               <List className="h-4 w-4" />
             </Button>
             <Button 
               variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
               size="sm"
               onClick={() => setViewMode('grid')}
               className="h-8 w-8 p-0"
             >
               <LayoutGrid className="h-4 w-4" />
             </Button>
           </div>
           
           <Button onClick={() => router.push('/admin/agents/new')}>
             <Plus className="mr-2 h-4 w-4" /> 创建智能体
           </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="搜索智能体名称、描述或模型..." 
          className="pl-9 max-w-md"
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div className="min-h-[400px]">
        {viewMode === 'list' ? (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>模型配置</TableHead>
                  <TableHead>参数</TableHead>
                  <TableHead>能力</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : agents?.map((agent: Agent) => {
                   const provider = providers?.find((p) => p.id === agent.provider_id);
                   return (
                    <TableRow 
                      key={agent.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/admin/agents/${agent.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold">{agent.name}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{agent.description}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">供应商</span>
                            <Badge variant="outline" className="font-normal">{provider?.name || 'Unknown'}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">模型</span>
                            <span className="text-sm font-medium">{agent.model}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                           <div className="flex justify-between text-xs w-32">
                             <span className="text-muted-foreground">温度</span>
                             <span className="font-mono">{agent.temperature}</span>
                           </div>
                           <div className="flex justify-between text-xs w-32">
                             <span className="text-muted-foreground">上下文</span>
                             <span className="font-mono">{agent.context_window / 1024}k</span>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {agent.tools && agent.tools.length > 0 ? (
                             agent.tools.map(t => (
                              <Badge key={t} variant="secondary" className="text-xs">
                                 {t}
                               </Badge>
                             ))
                          ) : (
                             <span className="text-muted-foreground text-xs">无工具</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">{new Date(agent.created_at || '').toLocaleDateString()}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/agents/${agent.id}`)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>编辑</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确认删除？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  此操作不可撤销。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => agent.id && handleDelete(agent.id)}>确认删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                   );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          renderGridView()
        )}
      </div>
    </div>
  );
}
