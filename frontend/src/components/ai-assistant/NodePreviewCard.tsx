'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, Image as ImageIcon, Film, Clapperboard, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NodeAttachment } from '@/store/useAIAssistantStore';
import type { LucideIcon } from 'lucide-react';

// 节点类型 → 预览配置映射表
const NODE_PREVIEW_CONFIG: Record<string, {
  icon: LucideIcon;
  color: string;
  bg: string;
}> = {
  text:       { icon: ScrollText,   color: 'text-node-blue',   bg: 'bg-node-blue/10' },
  image:      { icon: ImageIcon,    color: 'text-node-green',  bg: 'bg-node-green/10' },
  video:      { icon: Film,         color: 'text-node-yellow', bg: 'bg-node-yellow/10' },
  storyboard: { icon: Clapperboard, color: 'text-node-purple', bg: 'bg-node-purple/10' },
};

// 默认配置（兜底）
const DEFAULT_CONFIG = { icon: ScrollText, color: 'text-muted-foreground', bg: 'bg-muted/10' };

interface NodePreviewCardProps {
  attachment: NodeAttachment;
  onClear: () => void;
}

/**
 * 媒体节点预览卡（图片/视频）- 100x100 统一卡片
 */
function MediaNodeCard({ attachment, onClear }: NodePreviewCardProps) {
  const isUploading = !!attachment.meta?.uploading;
  const isVideo = attachment.nodeType === 'video';
  const config = NODE_PREVIEW_CONFIG[attachment.nodeType] ?? DEFAULT_CONFIG;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="relative group shrink-0"
    >
      <div className="size-[100px] rounded-lg overflow-hidden bg-muted border border-border shadow-sm">
        {isVideo ? (
          <div className="relative w-full h-full">
            <video
              src={attachment.thumbnailUrl || undefined}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-5 h-5 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-white border-b-[4px] border-b-transparent ml-0.5" />
              </div>
            </div>
          </div>
        ) : (
          <img
            src={attachment.thumbnailUrl || undefined}
            alt={attachment.label}
            className="w-full h-full object-cover"
          />
        )}
        {/* 底部标签 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5 flex items-center gap-1">
          <span className={cn('text-[9px]', config.color)}>
            {config.icon === ImageIcon ? '图片' : '视频'}
          </span>
          <p className="text-[10px] text-foreground truncate flex-1">{attachment.label}</p>
        </div>
      </div>

      {/* 关闭按钮 */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground z-10"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
      </Button>

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        </div>
      )}
    </motion.div>
  );
}

/**
 * 文本/分镜等无缩略图节点预览卡 - 100x100 统一卡片
 */
function InfoNodeCard({ attachment, onClear }: NodePreviewCardProps) {
  const config = NODE_PREVIEW_CONFIG[attachment.nodeType] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const isUploading = !!attachment.meta?.uploading;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="relative group shrink-0"
    >
      <div className="size-[100px] rounded-lg overflow-hidden bg-muted border border-border shadow-sm p-2.5 flex flex-col">
        {/* 顶部：图标 */}
        <div className={cn('p-1.5 rounded-md shrink-0 w-fit', config.bg)}>
          <Icon className={cn('w-3.5 h-3.5', config.color)} />
        </div>

        {/* 中间：摘要文本 */}
        <div className="flex-1 min-w-0 overflow-hidden mt-1.5">
          {attachment.excerpt && (
            <p className="text-[7px] text-muted-foreground whitespace-pre-wrap break-words leading-tight line-clamp-3">
              {attachment.excerpt}
            </p>
          )}
        </div>

        {/* 底部渐变 + 标签 */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none" />
        <span className="absolute bottom-1.5 left-1.5 text-[9px] text-foreground bg-muted/90 border border-border/50 px-1.5 py-0.5 rounded truncate max-w-[85px]">
          {attachment.label}
        </span>
      </div>

      {/* 关闭按钮 */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground z-10"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
      </Button>

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        </div>
      )}
    </motion.div>
  );
}

/**
 * 多图附件预览列表 - 横向排列
 */
interface NodePreviewListProps {
  attachments: NodeAttachment[];
  onRemove: (nodeId: string) => void;
  onClearAll: () => void;
}

export function NodePreviewList({ attachments, onRemove, onClearAll }: NodePreviewListProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="flex gap-2 items-start"
      >
        {attachments.map((attachment) => (
          <NodePreviewCard
            key={attachment.nodeId}
            attachment={attachment}
            onClear={() => onRemove(attachment.nodeId)}
          />
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * 统一节点预览卡片 - 根据类型自动选择渲染方式
 */
export function NodePreviewCard({ attachment, onClear }: NodePreviewCardProps) {
  const isMedia = attachment.nodeType === 'image' || attachment.nodeType === 'video';

  return isMedia
    ? <MediaNodeCard attachment={attachment} onClear={onClear} />
    : <InfoNodeCard attachment={attachment} onClear={onClear} />;
}
