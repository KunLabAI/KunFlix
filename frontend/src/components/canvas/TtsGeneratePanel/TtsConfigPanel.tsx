'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSelector } from './StyleSelector';
import { INLINE_TAG_LIST } from './constants';
import type { TtsTextEditorRef } from './TtsTextEditor';

interface Props {
  style: string;
  setStyle: (v: string) => void;
  taskActive: boolean;
  /** 朗读文本编辑器句柄：点击标签芯片在光标处插入 */
  editorRef?: React.RefObject<TtsTextEditorRef | null>;
}

/**
 * TTS 高级配置面板：语气风格下拉（20 预设，多语言）+ 交互式内联音效标签。
 * 点击标签 → 插入到编辑器光标处；编辑器内芯片支持拖拽换位与删除。
 * 对齐 LyriaConfigPanel 的卡片式容器与主题变量。
 */
export function TtsConfigPanel({ style, setStyle, taskActive, editorRef }: Props) {
  const { t } = useTranslation();

  const handleInsertTag = (tag: string) => {
    editorRef?.current?.insertTag(tag);
  };

  return (
    <div className="rounded-xl bg-card p-2.5 space-y-2.5 text-xs cursor-default animate-in fade-in slide-in-from-top-1 border border-border/50 duration-150">
      {/* 语气风格（下拉选择） */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>{t('canvas.node.tts.style', '语气风格')}</span>
          <span className="text-[10px] text-muted-foreground/70">{t('canvas.node.tts.styleHint', '作用于整段')}</span>
        </label>
        <StyleSelector value={style} onChange={setStyle} disabled={taskActive} />
      </div>

      {/* 内联音效标签（点击插入光标处） */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('canvas.node.tts.inlineTags', '内联音效标签')}
        </label>
        <div className="flex flex-wrap gap-1">
          {INLINE_TAG_LIST.map((item) => (
            <button
              key={item.tag}
              type="button"
              disabled={taskActive}
              onClick={() => handleInsertTag(item.tag)}
              title={`${item.tag} → ${t('canvas.node.tts.insertTag', '插入到光标处')}`}
              className="group/tag inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-500/10 text-[10px] text-teal-600 dark:text-teal-400 font-medium cursor-pointer transition-all hover:bg-teal-500/20 hover:border-teal-500/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="font-mono">{item.tag}</span>
              <span className="opacity-70 group-hover/tag:opacity-100">{t(item.labelKey, item.labelEn)}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          {t('canvas.node.tts.inlineTagsInteractiveHint', '点击标签插入到文本光标处；文本中的标签芯片可拖拽调整位置、点 × 删除。')}
        </p>
      </div>
    </div>
  );
}
