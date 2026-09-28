'use client';

import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Sparkles, Trash2, UserRound, Library } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import type { TtsVoice, LibraryVoice } from '@/hooks/useTtsGeneration';
import { TRIGGER_CLS, OPTION_CLS, OPTION_SELECTED_CLS, OPTION_IDLE_CLS, localizeVoiceTone } from './constants';
import { VoiceLibraryDialog } from './VoiceLibraryDialog';

interface Props {
  value: string;                       // 'auto' | 预置音色名 | voice_ ID
  voices: TtsVoice[];
  onChange: (v: string) => void;
  onReplicate: () => void;             // 打开复刻弹窗
  onDeleteReplicated?: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;                   // 多说话人角色行内使用时更紧凑
  providerId?: string;                 // 当前选中模型的供应商（供扩展音色库使用同一密钥）
}

type GenderFilter = 'all' | 'male' | 'female';

/** 性别徽标（♂ 蓝 / ♀ 玫瑰），音色固有属性 */
function GenderBadge({ gender }: { gender: string }) {
  const isMale = gender === 'male';
  const isFemale = gender === 'female';
  return (isMale || isFemale) ? (
    <span className={cn(
      'shrink-0 text-[11px] leading-none font-semibold',
      isMale ? 'text-sky-500' : 'text-rose-400',
    )} title={isMale ? 'Male' : 'Female'}>
      {isMale ? '♂' : '♀'}
    </span>
  ) : null;
}

/**
 * 音色选择器（对齐音频卡下拉体系）：
 * 顶部性别筛选（全部/男声/女声）+ 分组「自动 / 我的复刻音色 / 预置音色」，
 * 语气标签中英本地化，性别为音色固有属性（不可通过语气修改）。
 */
export function VoiceSelector({ value, voices, onChange, onReplicate, onDeleteReplicated, disabled, compact, providerId }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [libraryOpen, setLibraryOpen] = useState(false);
  // 从扩展音色库选中的音色（不在 30 预置/复刻列表中，需单独缓存用于回显）
  const [libraryPick, setLibraryPick] = useState<LibraryVoice | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDropdownOutside([[open, ref, setOpen]]);

  const lang = i18n.language || 'en';
  const replicated = useMemo(() => voices.filter((v) => v.type === 'replicated'), [voices]);
  const prebuilt = useMemo(
    () => voices.filter((v) => v.type !== 'replicated' && (genderFilter === 'all' || v.gender === genderFilter)),
    [voices, genderFilter],
  );

  // 当前选中项的显示文本（优先处理扩展音色库选中项）
  const selected = voices.find((v) => v.name === value);
  const isLibraryPick = !!libraryPick && libraryPick.id === value;
  const label = value === 'auto' || !value
    ? t('canvas.node.tts.voiceAuto', '自动音色')
    : isLibraryPick
      ? libraryPick!.display_name || libraryPick!.id
      : selected
        ? (selected.type === 'replicated'
            ? selected.display_name
            : `${selected.display_name} · ${localizeVoiceTone(selected.name, selected.tone, lang)}`)
        : value;
  const triggerGender = isLibraryPick ? libraryPick!.gender : (selected?.type !== 'replicated' ? selected?.gender || '' : '');

  const selectAndClose = (v: string) => { onChange(v); setOpen(false); };

  const handleLibraryPick = (v: LibraryVoice) => {
    setLibraryPick(v);
    onChange(v.id);
  };

  const GENDER_TABS: Array<{ key: GenderFilter; label: string }> = [
    { key: 'all', label: t('canvas.node.tts.genderAll', '全部') },
    { key: 'male', label: t('canvas.node.tts.genderMale', '男声') },
    { key: 'female', label: t('canvas.node.tts.genderFemale', '女声') },
  ];

  const renderOption = (v: TtsVoice) => {
    const isSelected = v.name === value;
    const tone = localizeVoiceTone(v.name, v.tone, lang);
    const isReplicated = v.type === 'replicated';
    return (
      <div key={v.name} className="relative">
        <button
          type="button"
          onClick={() => selectAndClose(v.name)}
          className={cn(OPTION_CLS, isSelected ? OPTION_SELECTED_CLS : OPTION_IDLE_CLS)}
        >
          {isReplicated
            ? <UserRound className="w-3 h-3 shrink-0 text-primary/70" />
            : <GenderBadge gender={v.gender} />}
          <span className="flex-1 text-left truncate">
            {isReplicated ? v.display_name : v.name}
            {!isReplicated && tone && <span className="text-muted-foreground/70"> · {tone}</span>}
          </span>
          {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
        </button>
        {isReplicated && v.id && onDeleteReplicated && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteReplicated(v.id!); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground/60 hover:text-destructive transition-colors"
            title={t('canvas.node.tts.deleteVoice', '删除复刻音色')}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={cn('relative', compact ? 'w-28' : 'w-full')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(TRIGGER_CLS, 'flex items-center justify-between gap-1', disabled && 'opacity-50 cursor-not-allowed')}
        title={t('canvas.node.tts.voice', '音色')}
      >
        <span className="flex items-center gap-1 min-w-0">
          <GenderBadge gender={triggerGender} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-60 max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
          {/* 性别筛选 */}
          <div className="sticky top-0 z-10 bg-popover px-2 pt-2 pb-1.5">
            <div className="flex items-center gap-0.5 p-[3px] rounded-lg bg-muted/50">
              {GENDER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setGenderFilter(tab.key)}
                  className={cn(
                    'flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                    genderFilter === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground/70',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 自动 */}
          <button
            type="button"
            onClick={() => selectAndClose('auto')}
            className={cn(OPTION_CLS, (value === 'auto' || !value) ? OPTION_SELECTED_CLS : OPTION_IDLE_CLS)}
          >
            <Sparkles className="w-3 h-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">{t('canvas.node.tts.voiceAuto', '自动音色')}</span>
            {(value === 'auto' || !value) && <Check className="w-3 h-3 shrink-0 text-primary" />}
          </button>

          {/* 我的复刻音色 */}
          {replicated.length > 0 && (
            <>
              <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground/70">
                {t('canvas.node.tts.replicatedVoices', '我的复刻音色')}
              </div>
              {replicated.map(renderOption)}
            </>
          )}

          {/* 预置音色（受性别筛选） */}
          <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground/70">
            {t('canvas.node.tts.prebuiltVoices', '预置音色')}
          </div>
          {prebuilt.map(renderOption)}
          {prebuilt.length === 0 && (
            <div className="px-2.5 py-2 text-[10px] text-muted-foreground/60 text-center">
              {t('canvas.node.tts.noVoicesForGender', '该性别下暂无音色')}
            </div>
          )}

          {/* 扩展音色库 / 复刻入口 */}
          <div className="border-t border-border/50 mt-1 pt-1">
            <button
              type="button"
              onClick={() => { setOpen(false); setLibraryOpen(true); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] font-medium text-primary hover:bg-accent transition-colors cursor-pointer"
            >
              <Library className="w-3.5 h-3.5 shrink-0" />
              {t('canvas.node.tts.browseLibrary', '浏览扩展音色库…')}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onReplicate(); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] font-medium text-primary hover:bg-accent transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              {t('canvas.node.tts.replicateNew', '复刻新音色…')}
            </button>
          </div>
        </div>
      )}

      {/* 扩展音色库浏览弹窗 */}
      <VoiceLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} onPick={handleLibraryPick} providerId={providerId} />
    </div>
  );
}
