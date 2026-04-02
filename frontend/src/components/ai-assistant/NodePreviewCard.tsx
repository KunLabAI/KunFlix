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
 * 小型图片卡片组件 - 用于多图横向排列
 */
function ImageThumbnailCard({ attachment, onClear }: NodePreviewCardProps) {
  const isUploading = !!attachment.meta?.uploading;
  const isVideo = attachment.nodeType === 'video';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="relative group shrink-0"
    >
      <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted/50 border border-border/50">
        {isVideo ? (
          <div className="relative w-full h-full">
            <video
              src={attachment.thumbnailUrl || undefined}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-4 h-4 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5" />
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
      </div>

      {/* 关闭按钮 - 移出卡片边界避免截断 */}
      <Button
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
 * 文本/其他类型节点的预览卡片
 */
function TextPreviewCard({ attachment, onClear }: NodePreviewCardProps) {
  const config = NODE_PREVIEW_CONFIG[attachment.nodeType] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const isUploading = !!attachment.meta?.uploading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mx-3 mb-1 mt-1"
    >
      <div className="flex items-start gap-2.5 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
        {/* 左侧：图标 */}
        <div className={cn('p-1.5 rounded-md shrink-0 mt-0.5', config.bg)}>
          <Icon className={cn('w-3.5 h-3.5', config.color)} />
        </div>

        {/* 中间：文本信息 */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">
              {attachment.label}
            </span>
            {isUploading && (
              <Loader2 className="w-3 h-3 text-muted-foreground animate-spin shrink-0" />
            )}
          </div>
          {attachment.excerpt && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
              {attachment.excerpt}
            </p>
          )}
        </div>

        {/* 关闭按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 hover:bg-primary/10 mt-0.5"
          onClick={onClear}
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
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
  // 分离图片/视频和其他类型
  const mediaAttachments = attachments.filter(a => a.nodeType === 'image' || a.nodeType === 'video');
  const otherAttachments = attachments.filter(a => a.nodeType !== 'image' && a.nodeType !== 'video');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mx-3 mb-2"
      >
        {/* 媒体文件横向排列 */}
        {mediaAttachments.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {mediaAttachments.map((attachment) => (
                <ImageThumbnailCard
                  key={attachment.nodeId}
                  attachment={attachment}
                  onClear={() => onRemove(attachment.nodeId)}
                />
              ))}
            </div>
            {/* 清除全部按钮 */}
            {attachments.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0 ml-auto"
                onClick={onClearAll}
              >
                清除全部
              </Button>
            )}
          </div>
        )}

        {/* 其他类型节点纵向排列 */}
        {otherAttachments.map((attachment) => (
          <TextPreviewCard
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
 * 单个节点预览卡片（向后兼容）
 */
export function NodePreviewCard({ attachment, onClear }: NodePreviewCardProps) {
  const isMedia = attachment.nodeType === 'image' || attachment.nodeType === 'video';
  
  return isMedia 
    ? <ImageThumbnailCard attachment={attachment} onClear={onClear} />
    : <TextPreviewCard attachment={attachment} onClear={onClear} />;
}
