'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
// 性别变体
// ---------------------------------------------------------------------------
const GENDER_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  male: 'default',
  female: 'secondary',
};

const GENDER_FILTER_KEYS = ['all', 'male', 'female'] as const;
type GenderFilter = typeof GENDER_FILTER_KEYS[number];

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
  const { t } = useTranslation();
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
      toast({
        variant: 'destructive',
        title: t('virtualHumans.toast.fileTooBigTitle'),
        description: t('virtualHumans.toast.fileTooBigDesc'),
      });
      return;
    }

    // validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: t('virtualHumans.toast.formatUnsupportedTitle'),
        description: t('virtualHumans.toast.formatUnsupportedDesc'),
      });
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
      toast({ title: t('virtualHumans.toast.uploadSuccess') });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || t('virtualHumans.toast.uploadFailedFallback');
      toast({
        variant: 'destructive',
        title: t('virtualHumans.toast.uploadFailed'),
        description: msg,
      });
    } finally {
      setUploading(false);
    }
  }, [toast, t]);

  const handleSubmit = async () => {
    const { asset_id, name, style, preview_url } = form;
    const missing = [
      !asset_id.trim() && t('virtualHumans.form.assetId'),
      !name.trim() && t('virtualHumans.form.name'),
      !style.trim() && t('virtualHumans.form.style'),
      !preview_url.trim() && t('virtualHumans.form.preview'),
    ].filter(Boolean);

    if (missing.length) {
      toast({
        variant: 'destructive',
        title: t('virtualHumans.toast.fieldsRequiredTitle'),
        description: missing.join(t('virtualHumans.toast.fieldsRequiredJoiner')),
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...form, sort_order: Number(form.sort_order) || 0 };
      editingPreset
        ? await updatePreset(editingPreset.id, payload)
        : await createPreset(payload);
      toast({
        title: editingPreset
          ? t('virtualHumans.toast.updateSuccess')
          : t('virtualHumans.toast.createSuccess'),
      });
      setDialogOpen(false);
      mutate();
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      const msg = typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
          : e?.message || t('virtualHumans.toast.unknownError');
      toast({
        variant: 'destructive',
        title: editingPreset
          ? t('virtualHumans.toast.updateFailed')
          : t('virtualHumans.toast.createFailed'),
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
      toast({ title: t('virtualHumans.toast.deleteSuccess') });
      setDeleteTarget(null);
      mutate();
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      const msg = typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
          : e?.message || t('virtualHumans.toast.unknownError');
      toast({
        variant: 'destructive',
        title: t('virtualHumans.toast.deleteFailed'),
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
          <h2 className="text-3xl font-bold tracking-tight">{t('virtualHumans.title')}</h2>
          <p className="text-muted-foreground mt-1">
            {t('virtualHumans.subtitle')}
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> {t('virtualHumans.addBtn')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center rounded-lg border bg-background p-1 shadow-sm">
          {GENDER_FILTER_KEYS.map((key) => (
            <Button
              key={key}
              variant={genderFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setGenderFilter(key)}
            >
              {t(`virtualHumans.filter.${key}`)}
            </Button>
          ))}
        </div>

        <Input
          placeholder={t('virtualHumans.filter.stylePlaceholder')}
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
            <p className="text-sm">{t('virtualHumans.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
            {filteredPresets.map((preset) => {
              const genderVariant = GENDER_VARIANT[preset.gender] ?? GENDER_VARIANT.male;
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
                      {preset.is_active
                        ? t('virtualHumans.status.active')
                        : t('virtualHumans.status.inactive')}
                    </div>
                  </div>

                  {/* 卡片主体 */}
                  <div className="p-4 flex-1 flex flex-col justify-center">
                    <h3 className="font-semibold text-base leading-tight text-foreground mb-2 truncate" title={preset.name}>
                      {preset.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge variant={genderVariant} className="text-[10px]">
                        {t(`virtualHumans.gender.${preset.gender}`, { defaultValue: preset.gender })}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">{preset.style}</Badge>
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground" title={preset.asset_id}>
                      {preset.asset_id}
                    </p>
                  </div>

                  {/* 底部操作区 */}
                  <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between transition-colors duration-300 group-hover:bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                      {t('virtualHumans.card.editConfig')}
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
                        {t('virtualHumans.card.deleteBtn')}
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
            <DialogTitle>
              {editingPreset
                ? t('virtualHumans.dialog.editTitle')
                : t('virtualHumans.dialog.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editingPreset
                ? t('virtualHumans.dialog.editDesc')
                : t('virtualHumans.dialog.createDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* asset_id */}
            <div className="grid gap-1.5">
              <Label htmlFor="asset_id">
                {t('virtualHumans.form.assetId')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="asset_id"
                placeholder={t('virtualHumans.form.assetIdPlaceholder')}
                value={form.asset_id}
                onChange={(e) => setField('asset_id', e.target.value)}
              />
            </div>

            {/* name */}
            <div className="grid gap-1.5">
              <Label htmlFor="name">
                {t('virtualHumans.form.name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder={t('virtualHumans.form.namePlaceholder')}
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>

            {/* gender + style row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>{t('virtualHumans.form.gender')}</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setField('gender', v as 'male' | 'female')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('virtualHumans.gender.male')}</SelectItem>
                    <SelectItem value="female">{t('virtualHumans.gender.female')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="style">
                  {t('virtualHumans.form.style')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="style"
                  placeholder={t('virtualHumans.form.stylePlaceholder')}
                  value={form.style}
                  onChange={(e) => setField('style', e.target.value)}
                />
              </div>
            </div>

            {/* 预览图上传 */}
            <div className="grid gap-1.5">
              <Label>
                {t('virtualHumans.form.preview')} <span className="text-destructive">*</span>
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
                    alt={t('virtualHumans.form.previewAlt')}
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
                    {t('virtualHumans.form.replace')}
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
                    {uploading
                      ? t('virtualHumans.form.uploading')
                      : t('virtualHumans.form.uploadHint')}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {t('virtualHumans.form.formatHint')}
                  </p>
                </div>
              )}
            </div>

            {/* description */}
            <div className="grid gap-1.5">
              <Label htmlFor="description">{t('virtualHumans.form.description')}</Label>
              <Textarea
                id="description"
                placeholder={t('virtualHumans.form.descriptionPlaceholder')}
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
                  {form.is_active
                    ? t('virtualHumans.form.isActive')
                    : t('virtualHumans.form.isInactive')}
                </Label>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sort_order">{t('virtualHumans.form.sortOrder')}</Label>
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
              {t('virtualHumans.form.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || uploading}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPreset
                ? t('virtualHumans.form.save')
                : t('virtualHumans.form.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Alert ---- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { !open && setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('virtualHumans.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('virtualHumans.delete.description', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('virtualHumans.delete.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('virtualHumans.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
