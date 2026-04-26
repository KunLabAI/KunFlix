'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  useVirtualHumanPresets,
  useCreateVirtualHumanPreset,
  useUpdateVirtualHumanPreset,
  useDeleteVirtualHumanPreset,
} from '@/hooks/useVirtualHumanPresets';
import { VirtualHumanPreset, VirtualHumanPresetCreate } from '@/types';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Trash2, UserRound, Loader2, ImageOff, ArrowRight, Upload, X } from 'lucide-react';
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
// 图片压缩
// ---------------------------------------------------------------------------
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function compressImage(file: File, maxWidth = 800, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
        'image/webp',
        quality,
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

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
  const [uploading, setUploading] = useState(false);

  // delete state
  const [deleteTarget, setDeleteTarget] = useState<VirtualHumanPreset | null>(null);
  const [deleting, setDeleting] = useState(false);

  // file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ---- image upload ----
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset input
    if (!file) return;

    // validate size
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: '文件过大', description: '图片大小不能超过 5MB' });
      return;
    }

    // validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ variant: 'destructive', title: '格式不支持', description: '仅支持 PNG、JPG、WEBP 格式' });
      return;
    }

    setUploading(true);
    try {
      // compress
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed, `preview.webp`);

      const res = await api.post('/admin/virtual-human-presets/upload-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setField('preview_url', res.data.url);
      toast({ title: '上传成功' });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '上传失败';
      toast({ variant: 'destructive', title: '上传失败', description: msg });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const handleSubmit = async () => {
    const { asset_id, name, style, preview_url } = form;
    const missing = [
      !asset_id.trim() && 'Asset ID',
      !name.trim() && '名称',
      !style.trim() && '风格',
      !preview_url.trim() && '预览图',
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
          <p className="text-muted-foreground mt-1">
            管理火山方舟预制虚拟人像，用于 Seedance 2.0 真人视频生成
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> 添加人像
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
            {filteredPresets.map((preset) => {
              const gender = GENDER_MAP[preset.gender] ?? GENDER_MAP.male;
              return (
                <div
                  key={preset.id}
                  className="group relative flex flex-col rounded-xl bg-background border border-border cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/50"
                  onClick={() => openEditDialog(preset)}
                  role="button"
                  tabIndex={0}
                >
                  {/* 顶部强调线 */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* 头像预览 */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                    <PresetImage
                      src={preset.preview_url}
                      alt={preset.name}
                      className="h-full w-full transition-transform duration-500 group-hover:scale-105"
                    />
                    {/* 状态角标 */}
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium shadow backdrop-blur-sm">
                      <span
                        className={cn(
                          'inline-block h-2 w-2 rounded-full',
                          preset.is_active ? 'bg-emerald-500' : 'bg-gray-400',
                        )}
                      />
                      {preset.is_active ? '启用' : '停用'}
                    </div>
                  </div>

                  {/* 卡片主体 */}
                  <div className="p-4 flex-1 flex flex-col justify-center">
                    <h3 className="font-semibold text-base leading-tight text-foreground mb-2 truncate" title={preset.name}>
                      {preset.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge variant={gender.variant} className="text-[10px]">{gender.label}</Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">{preset.style}</Badge>
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground" title={preset.asset_id}>
                      {preset.asset_id}
                    </p>
                  </div>

                  {/* 底部操作区 */}
                  <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between transition-colors duration-300 group-hover:bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                      编辑配置
                      <ArrowRight className="w-3 h-3 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                    </span>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2.5 text-xs opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                        onClick={() => setDeleteTarget(preset)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
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

            {/* 预览图上传 */}
            <div className="grid gap-1.5">
              <Label>
                预览图 <span className="text-destructive">*</span>
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleImageUpload}
              />
              {form.preview_url ? (
                <div className="relative rounded-lg border bg-muted/20 overflow-hidden">
                  <img
                    src={form.preview_url}
                    alt="预览"
                    className="w-full h-48 object-contain"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 rounded-full"
                    onClick={() => setField('preview_url', '')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-2 right-2 h-7 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                    更换
                  </Button>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors',
                    'hover:border-primary/50 hover:bg-muted/30',
                    uploading && 'pointer-events-none opacity-60',
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {uploading ? '上传中…' : '点击上传预览图'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    支持 PNG、JPG、WEBP，最大 5MB，上传后自动压缩
                  </p>
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
            <Button onClick={handleSubmit} disabled={submitting || uploading}>
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
