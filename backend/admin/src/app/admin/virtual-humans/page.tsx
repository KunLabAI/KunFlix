'use client';

import React, { useState, useMemo } from 'react';
import {
  useVirtualHumanPresets,
  useCreateVirtualHumanPreset,
  useUpdateVirtualHumanPreset,
  useDeleteVirtualHumanPreset,
} from '@/hooks/useVirtualHumanPresets';
import { VirtualHumanPreset, VirtualHumanPresetCreate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, UserRound, Loader2, ImageOff, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// 映射表
// ---------------------------------------------------------------------------
const GENDER_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  male:   { label: '男', variant: 'default' },
  female: { label: '女', variant: 'secondary' },
};

const GENDER_FILTERS = [
  { key: 'all',    label: '全部' },
  { key: 'male',   label: '男' },
  { key: 'female', label: '女' },
] as const;

type GenderFilter = typeof GENDER_FILTERS[number]['key'];

// ---------------------------------------------------------------------------
// 默认表单值
// ---------------------------------------------------------------------------
const EMPTY_FORM: VirtualHumanPresetCreate & { description: string } = {
  asset_id: '',
  name: '',
  gender: 'male',
  style: '',
  preview_url: '',
  description: '',
  is_active: true,
  sort_order: 0,
};

// ---------------------------------------------------------------------------
// 图片带 fallback
// ---------------------------------------------------------------------------
function PresetImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  return (!src || failed) ? (
    <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
      <ImageOff className="h-8 w-8 opacity-30" />
    </div>
  ) : (
    <img
      src={src}
      alt={alt}
      className={cn('object-cover', className)}
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function VirtualHumansPage() {
  const { toast } = useToast();

  // data
  const { presets, isLoading, mutate } = useVirtualHumanPresets();
  const { createPreset } = useCreateVirtualHumanPreset();
  const { updatePreset } = useUpdateVirtualHumanPreset();
  const { deletePreset } = useDeleteVirtualHumanPreset();

  // filters
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [styleFilter, setStyleFilter] = useState('');

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<VirtualHumanPreset | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // delete state
  const [deleteTarget, setDeleteTarget] = useState<VirtualHumanPreset | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- filtered list ----
  const filteredPresets = useMemo(() => {
    const list = presets ?? [];
    return list
      .filter((p) => genderFilter === 'all' || p.gender === genderFilter)
      .filter((p) => !styleFilter || p.style.toLowerCase().includes(styleFilter.toLowerCase()))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [presets, genderFilter, styleFilter]);

  // ---- form helpers ----
  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: typeof EMPTY_FORM[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreateDialog = () => {
    setEditingPreset(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (preset: VirtualHumanPreset) => {
    setEditingPreset(preset);
    setForm({
      asset_id: preset.asset_id,
      name: preset.name,
      gender: preset.gender,
      style: preset.style,
      preview_url: preset.preview_url,
      description: preset.description ?? '',
      is_active: preset.is_active,
      sort_order: preset.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const { asset_id, name, style, preview_url } = form;
    const missing = [
      !asset_id.trim() && 'Asset ID',
      !name.trim() && '名称',
      !style.trim() && '风格',
      !preview_url.trim() && '预览图 URL',
    ].filter(Boolean);

    if (missing.length) {
      toast({ variant: 'destructive', title: '请填写必填项', description: missing.join('、') });
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...form, sort_order: Number(form.sort_order) || 0 };
      editingPreset
        ? await updatePreset(editingPreset.id, payload)
        : await createPreset(payload);
      toast({ title: editingPreset ? '更新成功' : '创建成功' });
      setDialogOpen(false);
      mutate();
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      const msg = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ') : e?.message || '未知错误';
      toast({
        variant: 'destructive',
        title: editingPreset ? '更新失败' : '创建失败',
        description: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePreset(deleteTarget.id);
      toast({ title: '删除成功' });
      setDeleteTarget(null);
      mutate();
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      const msg = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ') : e?.message || '未知错误';
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: msg,
      });
    } finally {
      setDeleting(false);
    }
  };

  // ---- render ----
  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">虚拟人像库</h2>
          <p className="text-muted-foreground">
            管理火山方舟预制虚拟人像，用于 Seedance 2.0 真人视频生成
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> 添加人像
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Gender button group */}
        <div className="flex items-center rounded-lg border bg-background p-1 shadow-sm">
          {GENDER_FILTERS.map((g) => (
            <Button
              key={g.key}
              variant={genderFilter === g.key ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setGenderFilter(g.key)}
            >
              {g.label}
            </Button>
          ))}
        </div>

        <Input
          placeholder="按风格筛选，如 realistic…"
          className="max-w-xs"
          value={styleFilter}
          onChange={(e) => setStyleFilter(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/50 text-muted-foreground">
            <UserRound className="h-8 w-8 opacity-40" />
            <p className="text-sm">暂无虚拟人像</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPresets.map((preset) => {
              const gender = GENDER_MAP[preset.gender] ?? GENDER_MAP.male;
              return (
                <Card
                  key={preset.id}
                  className="group relative flex flex-col overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg"
                >
                  {/* Image */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                    <PresetImage
                      src={preset.preview_url}
                      alt={preset.name}
                      className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* Status dot */}
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium shadow backdrop-blur-sm">
                      <span
                        className={cn(
                          'inline-block h-2 w-2 rounded-full',
                          preset.is_active ? 'bg-emerald-500' : 'bg-gray-400',
                        )}
                      />
                      {preset.is_active ? '启用' : '停用'}
                    </div>

                    {/* Hover actions */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 text-xs shadow"
                        onClick={() => openEditDialog(preset)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> 编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 gap-1 text-xs shadow"
                        onClick={() => setDeleteTarget(preset)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> 删除
                      </Button>
                    </div>
                  </div>

                  {/* Info */}
                  <CardContent className="flex-1 space-y-2 p-4">
                    <h3 className="truncate text-base font-semibold leading-tight">{preset.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={gender.variant} className="text-[10px]">{gender.label}</Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">{preset.style}</Badge>
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground" title={preset.asset_id}>
                      {preset.asset_id}
                    </p>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <ArrowUpDown className="h-3 w-3" />
                      <span>排序 {preset.sort_order}</span>
                    </div>
                    <span>{new Date(preset.created_at).toLocaleDateString()}</span>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Create / Edit Dialog ---- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPreset ? '编辑虚拟人像' : '添加虚拟人像'}</DialogTitle>
            <DialogDescription>
              {editingPreset ? '修改虚拟人像预设信息' : '添加一个新的火山方舟预制虚拟人像'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* asset_id */}
            <div className="grid gap-1.5">
              <Label htmlFor="asset_id">
                Asset ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="asset_id"
                placeholder="asset-xxxxxxxxx-xxxxx"
                value={form.asset_id}
                onChange={(e) => setField('asset_id', e.target.value)}
              />
            </div>

            {/* name */}
            <div className="grid gap-1.5">
              <Label htmlFor="name">
                名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="人像名称"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>

            {/* gender + style row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>性别</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setField('gender', v as 'male' | 'female')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">男</SelectItem>
                    <SelectItem value="female">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="style">
                  风格 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="style"
                  placeholder="realistic"
                  value={form.style}
                  onChange={(e) => setField('style', e.target.value)}
                />
              </div>
            </div>

            {/* preview_url + live preview */}
            <div className="grid gap-1.5">
              <Label htmlFor="preview_url">
                预览图 URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="preview_url"
                placeholder="https://..."
                value={form.preview_url}
                onChange={(e) => setField('preview_url', e.target.value)}
              />
              {form.preview_url.trim() && (
                <div className="mt-1 flex justify-center rounded-md border bg-muted/30 p-2">
                  <PresetImage
                    src={form.preview_url}
                    alt="预览"
                    className="h-28 w-auto max-w-full rounded"
                  />
                </div>
              )}
            </div>

            {/* description */}
            <div className="grid gap-1.5">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                placeholder="可选描述信息…"
                rows={3}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
              />
            </div>

            {/* is_active + sort_order row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setField('is_active', v)}
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  {form.is_active ? '启用' : '停用'}
                </Label>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sort_order">排序</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setField('sort_order', Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPreset ? '保存修改' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Alert ---- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { !open && setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除虚拟人像「{deleteTarget?.name}」，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
