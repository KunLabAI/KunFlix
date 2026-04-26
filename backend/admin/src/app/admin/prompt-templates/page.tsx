'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePromptTemplates, useDeletePromptTemplate } from '@/hooks/usePromptTemplates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Search, FileText } from 'lucide-react';
import api from '@/lib/axios';

export default function PromptTemplatesPage() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [filterTemplateType, setFilterTemplateType] = useState<string>('');
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const { toast } = useToast();

  const { templates, isLoading, mutate } = usePromptTemplates({
    template_type: filterTemplateType || undefined,
  });
  const { deleteTemplate } = useDeletePromptTemplate();

  // 从 API 动态加载分类列表
  useEffect(() => {
    api.get('/prompt-templates/types/list')
      .then((res) => setCategoryOptions(res.data || []))
      .catch(() => {});
  }, [templates]);

  const filteredTemplates = templates?.filter((t) =>
    searchText
      ? t.name.toLowerCase().includes(searchText.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchText.toLowerCase())
      : true
  );

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast({ title: '模板删除成功' });
      mutate();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: any) => e.msg).join('; ')
          : '未知错误';
      toast({ variant: 'destructive', title: '删除失败', description: message });
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">提示词模板</h2>
          <p className="text-muted-foreground">管理 AI 生成使用的提示词模板</p>
        </div>
        <Button onClick={() => router.push('/admin/prompt-templates/new')}>
          <Plus className="mr-2 h-4 w-4" /> 创建模板
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索模板名称或描述..."
            className="pl-9 w-64"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterTemplateType || '__all__'} onValueChange={(v) => setFilterTemplateType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="模板分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部分类</SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模板名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>变量数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : filteredTemplates?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  暂无模板，点击「创建模板」开始添加
                </TableCell>
              </TableRow>
            ) : (
              filteredTemplates?.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">
                          {template.description || '暂无描述'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {template.template_type ? (
                      <Badge variant="outline">{template.template_type}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{template.variables_schema?.length || 0} 个</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {template.is_default && (
                        <Badge variant="secondary" className="text-xs">默认</Badge>
                      )}
                      <Badge variant={template.is_active ? 'default' : 'outline'} className="text-xs">
                        {template.is_active ? '启用' : '禁用'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/prompt-templates/${template.id}`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
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
                              此操作不可撤销，将永久删除「{template.name}」模板。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => template.id && handleDelete(template.id)}>
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
