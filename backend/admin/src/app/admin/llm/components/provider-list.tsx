
'use client';

import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { data: providers, error, isLoading } = useSWR('/admin/llm-providers/', fetcher);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/llm-providers/${id}`);
      toast({
        title: t('llm.list.toast.deleteSuccess'),
      });
      mutate('/admin/llm-providers/');
    } catch {
      toast({
        variant: "destructive",
        title: t('llm.list.toast.deleteFailed'),
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
        {t('llm.list.loadFailed')}
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="flex h-[400px] w-full flex-col items-center justify-center space-y-4 rounded-lg border border-dashed bg-muted/50">
        <div className="text-xl font-medium text-muted-foreground">{t('llm.list.empty')}</div>
        <Button onClick={() => router.push('/admin/llm/create')}>
          <Plus className="mr-2 h-4 w-4" />
          {t('llm.list.emptyAction')}
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
              <TableHead className="w-[200px]">{t('llm.list.table.name')}</TableHead>
              <TableHead className="w-[120px]">{t('llm.list.table.brand')}</TableHead>
              <TableHead>{t('llm.list.table.tags')}</TableHead>
              <TableHead>{t('llm.list.table.models')}</TableHead>
              <TableHead className="w-[120px] text-right">{t('llm.list.table.actions')}</TableHead>
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
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">{provider.base_url || t('llm.list.defaultUrl')}</span>
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
                      title={t('llm.list.editTooltip')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title={t('llm.list.deleteTooltip')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('llm.list.delete.title')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('llm.list.delete.description', { name: provider.name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('llm.list.delete.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(provider.id)} className="bg-destructive hover:bg-destructive/90">
                            {t('llm.list.delete.confirm')}
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
