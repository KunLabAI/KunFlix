'use client';

/**
 * P1-1: SubAgentTemplate 蓝图管理页
 *
 * 简洁的表格视图 + 新建 Dialog。编辑/删除通过行操作按钮触发。
 * 页面数据来自 GET /api/admin/sub-agent-templates。
 */
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { fetcher } from '@/lib/api-utils';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Puzzle } from 'lucide-react';

interface Template {
  id: string;
  type: string;
  description: string;
  system_prompt_template: string;
  permission_mode: string;
  tools: string[];
  max_tool_rounds: number;
  context_config: any;
  created_at: string;
}

const PERMISSION_MODES = ['default', 'explore', 'bypass'] as const;

export default function TemplatesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: templates, mutate } = useSWR<Template[]>(
    '/admin/sub-agent-templates',
    fetcher,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: '',
    description: '',
    system_prompt_template: '',
    permission_mode: 'default',
    tools: '',
    max_tool_rounds: 50,
  });

  const resetForm = () => setForm({
    type: '', description: '', system_prompt_template: '',
    permission_mode: 'default', tools: '', max_tool_rounds: 50,
  });

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (tpl: Template) => {
    setForm({
      type: tpl.type,
      description: tpl.description,
      system_prompt_template: tpl.system_prompt_template,
      permission_mode: tpl.permission_mode || 'default',
      tools: (tpl.tools || []).join(', '),
      max_tool_rounds: tpl.max_tool_rounds || 50,
    });
    setEditingId(tpl.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      type: form.type.trim(),
      description: form.description.trim(),
      system_prompt_template: form.system_prompt_template,
      permission_mode: form.permission_mode,
      tools: form.tools.split(',').map(s => s.trim()).filter(Boolean),
      max_tool_rounds: form.max_tool_rounds,
    };
    try {
      if (editingId) {
        await api.put(`/admin/sub-agent-templates/${editingId}`, payload);
        toast({ title: 'Template updated' });
      } else {
        await api.post('/admin/sub-agent-templates', payload);
        toast({ title: 'Template created' });
      }
      mutate();
      setDialogOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.response?.data?.detail || 'Failed' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/sub-agent-templates/${id}`);
      toast({ title: 'Template deleted' });
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.response?.data?.detail || 'Failed' });
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Puzzle className="h-7 w-7 text-primary" />
            {t('templates.title')}
          </h2>
          <p className="text-muted-foreground mt-1">
            {t('templates.subtitle')}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t('templates.createBtn')}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead>Rounds</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.map((tpl) => (
              <TableRow key={tpl.id}>
                <TableCell className="font-mono font-medium">{tpl.type}</TableCell>
                <TableCell className="max-w-[250px] truncate text-xs text-muted-foreground">
                  {tpl.description}
                </TableCell>
                <TableCell>
                  <Badge variant={tpl.permission_mode === 'explore' ? 'outline' : tpl.permission_mode === 'bypass' ? 'destructive' : 'secondary'}>
                    {tpl.permission_mode}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {(tpl.tools || []).join(', ') || '—'}
                </TableCell>
                <TableCell className="font-mono">{tpl.max_tool_rounds}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(tpl)}>
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
                          <AlertDialogTitle>Delete "{tpl.type}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. Leaders referencing this template must be updated first.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(tpl.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!templates || templates.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                  No blueprints yet. Click "New Blueprint" to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Blueprint' : 'New Blueprint'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t('templates.form.type')}</label>
              <Input
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder={t('templates.form.typePlaceholder')}
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('templates.form.description')}</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('templates.form.descriptionPlaceholder')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('templates.form.systemPrompt')}</label>
              <textarea
                className="w-full rounded-md border bg-background p-3 text-sm font-mono min-h-[120px] resize-y"
                value={form.system_prompt_template}
                onChange={(e) => setForm({ ...form, system_prompt_template: e.target.value })}
                placeholder={t('templates.form.systemPromptPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('templates.form.placeholderHint')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('templates.form.permissionMode')}</label>
                <Select value={form.permission_mode} onValueChange={(v) => setForm({ ...form, permission_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERMISSION_MODES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('templates.form.maxToolRounds')}</label>
                <Input
                  type="number"
                  value={form.max_tool_rounds}
                  onChange={(e) => setForm({ ...form, max_tool_rounds: Number(e.target.value) || 50 })}
                  min={5}
                  max={200}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('templates.form.tools')}</label>
              <Input
                value={form.tools}
                onChange={(e) => setForm({ ...form, tools: e.target.value })}
                placeholder={t('templates.form.toolsPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSave}>{editingId ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
