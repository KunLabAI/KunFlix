'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Pencil,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Check,
  Loader2,
  Download,
} from 'lucide-react';
import type { AnnotationStateApi, AnnotationTool } from '@/hooks/useAnnotationState';

interface Props {
  api: AnnotationStateApi;
  isSaving: boolean;
  canSave: boolean;
  saveDisabledReason?: string | null;
  onSave: () => void;
  onCancel: () => void;
  onDownload?: () => void;
}

const TOOL_ICON: Record<AnnotationTool, React.ComponentType<{ className?: string }>> = {
  pen: Pencil,
  text: Type,
  eraser: Eraser,
};

/**
 * 标注工具栏：模式切换 / 颜色 / 笔触粗细 / 字号 / 撤销重做 / 清空 / 保存。
 */
export function AnnotationToolbar({ api, isSaving, canSave, saveDisabledReason, onSave, onCancel, onDownload }: Props) {
  const { t } = useTranslation();
  const tools: AnnotationTool[] = ['pen', 'text', 'eraser'];

  return (
    <div
      className="flex items-center gap-3 bg-black/70 backdrop-blur-md text-white rounded-lg px-3 py-2 shadow-lg pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tool group */}
      <div className="flex items-center gap-1">
        {tools.map((tool) => {
          const Icon = TOOL_ICON[tool];
          const active = api.tool === tool;
          return (
            <button
              key={tool}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                active ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'
              }`}
              onClick={() => api.setTool(tool)}
              title={t(`canvas.node.annotation.tool.${tool}`)}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      <div className="w-px h-6 bg-white/20" />

      {/* Color preset */}
      <div className="flex items-center gap-1">
        {api.presetColors.map((c) => (
          <button
            key={c}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${
              api.color === c ? 'border-white scale-110' : 'border-white/30 hover:scale-110'
            }`}
            style={{ background: c }}
            onClick={() => api.setColor(c)}
            title={c}
          />
        ))}
        <input
          type="color"
          value={api.color}
          onChange={(e) => api.setColor(e.target.value)}
          className="w-5 h-5 rounded-full bg-transparent border border-white/30 cursor-pointer"
          title={t('canvas.node.annotation.customColor')}
        />
      </div>

      <div className="w-px h-6 bg-white/20" />

      {/* Stroke width / Font size based on tool */}
      {api.tool === 'text' ? (
        <label className="flex items-center gap-2 text-xs">
          <span className="opacity-70">{t('canvas.node.annotation.fontSize')}</span>
          <input
            type="range"
            min={12}
            max={96}
            step={1}
            value={api.fontSize}
            onChange={(e) => api.setFontSize(Number(e.target.value))}
            className="w-24 accent-primary"
          />
          <span className="w-7 text-right">{api.fontSize}</span>
        </label>
      ) : (
        <label className="flex items-center gap-2 text-xs">
          <span className="opacity-70">{t('canvas.node.annotation.strokeWidth')}</span>
          <input
            type="range"
            min={1}
            max={32}
            step={1}
            value={api.strokeWidth}
            onChange={(e) => api.setStrokeWidth(Number(e.target.value))}
            className="w-24 accent-primary"
          />
          <span className="w-7 text-right">{api.strokeWidth}</span>
        </label>
      )}

      <div className="w-px h-6 bg-white/20" />

      {/* History */}
      <div className="flex items-center gap-1">
        <button
          className="w-8 h-8 flex items-center justify-center rounded text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={api.undo}
          disabled={!api.canUndo}
          title={t('canvas.node.annotation.undo')}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center rounded text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={api.redo}
          disabled={!api.canRedo}
          title={t('canvas.node.annotation.redo')}
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center rounded text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={api.clear}
          disabled={!api.isDirty}
          title={t('canvas.node.annotation.clear')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-white/20" />

      {/* Actions */}
      {onDownload && (
        <button
          className="w-8 h-8 flex items-center justify-center rounded text-white/70 hover:bg-white/10"
          onClick={onDownload}
          title={t('canvas.node.preview.download')}
        >
          <Download className="w-4 h-4" />
        </button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-white/80 hover:bg-white/10 hover:text-white h-8"
        onClick={onCancel}
        disabled={isSaving}
      >
        {t('canvas.node.annotation.exit')}
      </Button>
      <Button
        variant="default"
        size="sm"
        className="h-8"
        onClick={onSave}
        disabled={!canSave || isSaving || !api.isDirty}
        title={saveDisabledReason || ''}
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1" />
        ) : (
          <Check className="w-4 h-4 mr-1" />
        )}
        {t('canvas.node.annotation.save')}
      </Button>
    </div>
  );
}
