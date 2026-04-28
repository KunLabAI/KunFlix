'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  ImageIcon,
  Film,
  Music,
  ScrollText,
  Clapperboard,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import type { CanvasNode } from '@/store/useCanvasStore';

// ─── Shared node-type icon + color mapping ────────────────────────────────

export interface NodeTypeConfig {
  icon: LucideIcon;
  color: string;
  label: string;
}

export const NODE_TYPE_CONFIG: Record<string, NodeTypeConfig> = {
  image:      { icon: ImageIcon,    color: 'text-node-green',  label: '图片' },
  video:      { icon: Film,         color: 'text-amber-400',   label: '视频' },
  audio:      { icon: Music,        color: 'text-teal-400',    label: '音频' },
  text:       { icon: ScrollText,   color: 'text-node-blue',   label: '文本' },
  storyboard: { icon: Clapperboard, color: 'text-node-purple', label: '分镜' },
};

export const DEFAULT_NODE_TYPE_CONFIG: NodeTypeConfig = {
  icon: FileText,
  color: 'text-muted-foreground',
  label: '节点',
};

export const getNodeTypeConfig = (nodeType: string | undefined): NodeTypeConfig =>
  NODE_TYPE_CONFIG[nodeType || ''] ?? DEFAULT_NODE_TYPE_CONFIG;

// ─── Picker item shape ─────────────────────────────────────────────────────

export interface NodePickerItem {
  node: CanvasNode;
  /** Display label for the node. */
  label: string;
  /** Thumbnail URL for image/video. Null for audio/text/storyboard. */
  thumbUrl: string | null;
  /** Disable interaction for this item. */
  disabled?: boolean;
}

export interface NodePickerDropdownProps {
  /** Whether the dropdown is visible. */
  open: boolean;
  /** Title text shown at top of panel. */
  title: string;
  /** Text shown when no items available. */
  emptyText: string;
  /** Items to render. */
  items: NodePickerItem[];
  /** Anchor direction — top opens downward, bottom opens upward. */
  anchor?: 'top' | 'bottom';
  /** Horizontal alignment. */
  align?: 'left' | 'right';
  /** Width Tailwind class (default w-56). */
  widthClass?: string;
  /** Max height Tailwind class (default max-h-60). */
  maxHeightClass?: string;
  /** Item click handler. */
  onSelect: (node: CanvasNode) => void;
}

/**
 * 统一的节点选择下拉面板（视觉基准：VideoGeneratePanel 原生下拉样式）。
 * 仅渲染面板，不负责触发按钮或 open 状态。
 */
export function NodePickerDropdown({
  open,
  title,
  emptyText,
  items,
  anchor = 'top',
  align = 'right',
  widthClass = 'w-56',
  maxHeightClass = 'max-h-60',
  onSelect,
}: NodePickerDropdownProps) {
  if (!open) return null;

  const positionClass = anchor === 'bottom'
    ? 'bottom-full mb-1'
    : 'top-full mt-1';
  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div
      className={cn(
        'absolute z-50 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg',
        'animate-in fade-in zoom-in-95 duration-100',
        positionClass,
        alignClass,
        widthClass,
        maxHeightClass,
      )}
    >
      <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/50">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="p-3 text-[10px] text-muted-foreground text-center">
          {emptyText}
        </div>
      ) : (
        items.map((item) => {
          const { node, label, thumbUrl, disabled } = item;
          const cfg = getNodeTypeConfig(node.type);
          const TypeIcon = cfg.icon;
          const isVideo = node.type === 'video';
          const isAudio = node.type === 'audio';
          const isImage = node.type === 'image';

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => !disabled && onSelect(node)}
              disabled={disabled}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer',
                disabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {/* Thumbnail / placeholder */}
              {isVideo && thumbUrl ? (
                <div className="h-8 w-12 rounded bg-muted shrink-0 overflow-hidden">
                  <video src={thumbUrl} className="w-full h-full object-cover" preload="metadata" muted />
                </div>
              ) : isAudio ? (
                <div className="h-8 w-8 rounded bg-muted shrink-0 flex items-center justify-center">
                  <Music className="w-4 h-4 text-teal-400/60" />
                </div>
              ) : isImage && thumbUrl ? (
                <img src={thumbUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded bg-muted shrink-0 flex items-center justify-center">
                  <TypeIcon className={cn('w-4 h-4', cfg.color, 'opacity-70')} />
                </div>
              )}
              {/* Label */}
              <div className="flex flex-col min-w-0 flex-1 text-left">
                <span className="font-medium truncate text-foreground">{label}</span>
              </div>
              {/* Type indicator */}
              <TypeIcon className={cn('w-3 h-3 shrink-0', cfg.color)} />
            </button>
          );
        })
      )}
    </div>
  );
}
