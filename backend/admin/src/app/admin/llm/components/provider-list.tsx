
'use client';

import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge";
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
import { useToast } from '@/components/ui/use-toast';
import { Pencil, Trash2, Loader2, Plus } from 'lucide-react';
import { LLMProvider, PROVIDER_ICONS } from '../schema';
import { Card, CardContent } from '@/components/ui/card';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export function ProviderList() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: providers, error, isLoading } = useSWR('/admin/llm-providers/', fetcher);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/llm-providers/${id}`);
      toast({
        title: "供应商删除成功",
      });
      mutate('/admin/llm-providers/');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "删除失败",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center text-destructive">
        加载失败，请刷新重试
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="flex h-[400px] w-full flex-col items-center justify-center space-y-4 rounded-lg border border-dashed bg-muted/50">
        <div className="text-xl font-medium text-muted-foreground">暂无 AI 供应商</div>
        <Button onClick={() => router.push('/admin/llm/create')}>
          <Plus className="mr-2 h-4 w-4" />
          添加第一个 AI 供应商
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">名称</TableHead>
              <TableHead className="w-[120px]">品牌</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>模型</TableHead>
              <TableHead className="w-[120px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider: LLMProvider) => (
              <TableRow key={provider.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    {PROVIDER_ICONS[provider.provider_type] ? (
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-muted/50">
                        <Image
                          src={PROVIDER_ICONS[provider.provider_type]}
                          alt={provider.provider_type}
                          fill
                          className="object-contain p-1"
                        />
                      </div>
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-md border bg-muted/50 flex items-center justify-center text-xs text-muted-foreground font-mono">
                        {provider.provider_type.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span>{provider.name}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">{provider.base_url || '默认URL'}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-xs">{provider.provider_type}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {provider.tags?.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">{tag}</Badge>
                    ))}
                    {(provider.tags?.length || 0) > 3 && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">+{provider.tags!.length - 3}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {provider.models?.slice(0, 2).map(model => {
                      const displayName = provider.model_metadata?.[model]?.display_name || model;
                      return (
                        <Badge key={model} variant="outline" className="text-xs bg-muted/50 font-mono px-1.5 py-0">{displayName}</Badge>
                      );
                    })}
                    {(provider.models?.length || 0) > 2 && (
                      <Badge variant="outline" className="text-xs bg-muted/50 px-1.5 py-0">+{provider.models.length - 2}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => router.push(`/admin/llm/${provider.id}`)}
                      title="编辑"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="删除">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认删除供应商？</AlertDialogTitle>
                          <AlertDialogDescription>
                            此操作将永久删除该供应商配置 ({provider.name})，不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(provider.id)} className="bg-destructive hover:bg-destructive/90">
                            确认删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
