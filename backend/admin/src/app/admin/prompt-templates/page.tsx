'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  const filteredTemplates = templates?.filter((tpl) =>
    searchText
      ? tpl.name.toLowerCase().includes(searchText.toLowerCase()) ||
        tpl.description?.toLowerCase().includes(searchText.toLowerCase())
      : true
  );

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast({ title: t('promptTemplates.toast.deleteSuccess') });
      mutate();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: any) => e.msg).join('; ')
          : t('promptTemplates.toast.unknownError');
      toast({
        variant: 'destructive',
        title: t('promptTemplates.toast.deleteFailed'),
        description: message,
      });
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('promptTemplates.title')}</h2>
          <p className="text-muted-foreground">{t('promptTemplates.subtitle')}</p>
        </div>
        <Button onClick={() => router.push('/admin/prompt-templates/new')}>
          <Plus className="mr-2 h-4 w-4" /> {t('promptTemplates.createBtn')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('promptTemplates.searchPlaceholder')}
            className="pl-9 w-64"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterTemplateType || '__all__'} onValueChange={(v) => setFilterTemplateType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('promptTemplates.filterPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('promptTemplates.filterAll')}</SelectItem>
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
              <TableHead>{t('promptTemplates.table.name')}</TableHead>
              <TableHead>{t('promptTemplates.table.category')}</TableHead>
              <TableHead>{t('promptTemplates.table.varsCount')}</TableHead>
              <TableHead>{t('promptTemplates.table.status')}</TableHead>
              <TableHead className="text-right">{t('promptTemplates.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {t('promptTemplates.table.loading')}
                </TableCell>
              </TableRow>
            ) : filteredTemplates?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t('promptTemplates.table.empty')}
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
                          {template.description || t('promptTemplates.table.noDesc')}
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
                    <span className="text-sm">
                      {t('promptTemplates.table.varsUnit', { count: template.variables_schema?.length || 0 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {template.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          {t('promptTemplates.status.default')}
                        </Badge>
                      )}
                      <Badge variant={template.is_active ? 'default' : 'outline'} className="text-xs">
                        {template.is_active
                          ? t('promptTemplates.status.active')
                          : t('promptTemplates.status.inactive')}
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
                            <AlertDialogTitle>{t('promptTemplates.delete.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('promptTemplates.delete.description', { name: template.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('promptTemplates.delete.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => template.id && handleDelete(template.id)}>
                              {t('promptTemplates.delete.confirm')}
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
