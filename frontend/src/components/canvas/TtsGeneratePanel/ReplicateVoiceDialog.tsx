'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, Loader2, AudioLines, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { replicateVoice, type ReplicateVoiceResult } from '@/hooks/useTtsGeneration';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId?: string;
  model?: string;
  onReplicated: (result: ReplicateVoiceResult) => void;
}

const ACCEPT = '.wav,.mp3,audio/wav,audio/mpeg';
const MAX_MB = 15;

/** 单个音频上传槽（参考音频 / 授权音频） */
function AudioSlot({
  label, hint, icon, file, onFile, onClear, disabled,
}: {
  label: string; hint: string; icon: React.ReactNode;
  file: File | null; onFile: (f: File | null) => void; onClear: () => void; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = file ? URL.createObjectURL(file) : '';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}{label}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      {file ? (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 text-[11px] truncate text-foreground">{file.name}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            <button
              type="button"
              onClick={() => { onClear(); inputRef.current && (inputRef.current.value = ''); }}
              disabled={disabled}
              className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <audio src={previewUrl} controls preload="metadata" className="w-full h-8" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={cn(
            'w-full rounded-lg border border-dashed border-border/60 bg-background/50 px-3 py-4',
            'flex flex-col items-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Upload className="w-4 h-4" />
          <span className="text-[11px]">{hint}</span>
        </button>
      )}
    </div>
  );
}

/**
 * 音色复刻弹窗：上传参考音频 + 授权音频 + 命名，注册为持久复刻音色。
 */
export function ReplicateVoiceDialog({ open, onOpenChange, providerId, model, onReplicated }: Props) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setDisplayName('');
    setSourceFile(null);
    setConsentFile(null);
    setError(null);
    setSubmitting(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    !next && reset();
    onOpenChange(next);
  };

  const canSubmit = displayName.trim().length > 0 && !!sourceFile && !!consentFile && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !sourceFile || !consentFile) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await replicateVoice({
        displayName: displayName.trim(),
        sourceAudio: sourceFile,
        consentAudio: consentFile,
        providerId,
        model,
      });
      onReplicated(result);
      handleOpenChange(false);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err?.response?.data?.detail || err?.message || t('canvas.node.tts.replicateFailed', '音色复刻失败，请重试'));
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit, sourceFile, consentFile, displayName, providerId, model, onReplicated]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AudioLines className="w-4 h-4 text-primary" />
            {t('canvas.node.tts.replicateTitle', '复刻音色')}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {t('canvas.node.tts.replicateDesc', '上传一段参考音频与一段授权录音，复刻为可长期复用的专属音色。')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* 名称 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('canvas.node.tts.replicateName', '音色名称')}</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('canvas.node.tts.replicateNamePlaceholder', '例如：我的声音')}
              maxLength={100}
              disabled={submitting}
              className="h-8 text-xs"
            />
          </div>

          {/* 参考音频 */}
          <AudioSlot
            label={t('canvas.node.tts.sourceAudio', '参考音频')}
            hint={t('canvas.node.tts.sourceAudioHint', '上传 10-30 秒清晰人声（WAV）')}
            icon={<AudioLines className="w-3.5 h-3.5 text-muted-foreground" />}
            file={sourceFile}
            onFile={(f) => { setSourceFile(f); setError(null); }}
            onClear={() => setSourceFile(null)}
            disabled={submitting}
          />

          {/* 授权音频 */}
          <AudioSlot
            label={t('canvas.node.tts.consentAudio', '授权录音')}
            hint={t('canvas.node.tts.consentAudioHint', '上传本人朗读授权声明的录音（WAV）')}
            icon={<ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />}
            file={consentFile}
            onFile={(f) => { setConsentFile(f); setError(null); }}
            onClear={() => setConsentFile(null)}
            disabled={submitting}
          />

          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            {t('canvas.node.tts.consentNote', '授权录音用于证明你拥有该声音的使用权，请自行准备授权声明并朗读录制。单个文件不超过 15MB。')}
          </p>

          {error && (
            <div className="text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">{error}</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t('canvas.node.tts.cancel', '取消')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit} className="gap-1.5">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? t('canvas.node.tts.replicating', '复刻中…') : t('canvas.node.tts.replicateSubmit', '开始复刻')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
