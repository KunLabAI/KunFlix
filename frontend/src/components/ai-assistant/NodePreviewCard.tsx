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
  showThumbnail: boolean;
}> = {
  text:       { icon: ScrollText,   color: 'text-node-blue',   bg: 'bg-node-blue/10',   showThumbnail: false },
  image:      { icon: ImageIcon,    color: 'text-node-green',  bg: 'bg-node-green/10',  showThumbnail: true },
  video:      { icon: Film,         color: 'text-node-yellow', bg: 'bg-node-yellow/10', showThumbnail: true },
  storyboard: { icon: Clapperboard, color: 'text-node-purple', bg: 'bg-node-purple/10', showThumbnail: false },
};

// 默认配置（兜底）
const DEFAULT_CONFIG = { icon: ScrollText, color: 'text-muted-foreground', bg: 'bg-muted/10', showThumbnail: false };

interface NodePreviewCardProps {
  attachment: NodeAttachment;
  onClear: () => void;
}

export function NodePreviewCard({ attachment, onClear }: NodePreviewCardProps) {
  const config = NODE_PREVIEW_CONFIG[attachment.nodeType] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const isUploading = !!attachment.meta?.uploading;

  return (
    <AnimatePresence>
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

          {/* 右侧：缩略图（仅图片/视频） */}
          {config.showThumbnail && attachment.thumbnailUrl && (
            <div className="w-12 h-12 rounded-md overflow-hidden bg-muted/50 shrink-0 border border-border/50">
              {attachment.nodeType === 'video' ? (
                <div className="relative w-full h-full">
                  <video
                    src={attachment.thumbnailUrl}
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
                  src={attachment.thumbnailUrl}
                  alt={attachment.label}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}

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
    </AnimatePresence>
  );
}
