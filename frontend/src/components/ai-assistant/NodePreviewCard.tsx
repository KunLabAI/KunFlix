'use client';

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, Image as ImageIcon, Film, Music, Clapperboard, X, Loader2, Play, Pause } from 'lucide-react';
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
  audio:      { icon: Music,        color: 'text-node-blue',   bg: 'bg-node-blue/10' },
  storyboard: { icon: Clapperboard, color: 'text-node-purple', bg: 'bg-node-purple/10' },
};

// 默认配置（兆底）
const DEFAULT_CONFIG = { icon: ScrollText, color: 'text-muted-foreground', bg: 'bg-muted/10' };

interface NodePreviewCardProps {
  attachment: NodeAttachment;
  onClear: () => void;
}

/**
 * 媒体节点预览卡（图片/视频）- 100x100 统一卡片
 * 左上角显示类型图标，底部显示节点名称
 */
function MediaNodeCard({ attachment, onClear }: NodePreviewCardProps) {
  const isUploading = !!attachment.meta?.uploading;
  const isVideo = attachment.nodeType === 'video';
  const config = NODE_PREVIEW_CONFIG[attachment.nodeType] ?? DEFAULT_CONFIG;
  const Icon = config.icon;

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
              <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                <Play className="w-3 h-3 text-white ml-0.5" fill="white" />
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
        {/* 左上角类型图标 */}
        <div className={cn('absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm')}>
          <Icon className="w-3 h-3 text-white" />
        </div>
        {/* 底部节点名称 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
          <p className="text-[10px] text-white truncate">{attachment.label}</p>
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
 * 音频节点预览卡 - 100x100，点击播放/暂停，无进度条
 * 左上角显示 Music 图标，中间大播放按钮，底部节点名称
 */
function AudioNodeCard({ attachment, onClear }: NodePreviewCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.paused ? audio.play() : audio.pause();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="relative group shrink-0"
    >
      <div className="size-[100px] rounded-lg overflow-hidden bg-secondary/50 border border-border shadow-sm flex flex-col items-center justify-center">
        {attachment.thumbnailUrl && (
          <audio
            ref={audioRef}
            src={attachment.thumbnailUrl}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        )}
        {/* 中间播放/暂停按钮 */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-foreground" fill="currentColor" />
          ) : (
            <Play className="w-5 h-5 text-foreground ml-0.5" fill="currentColor" />
          )}
        </button>
        {/* 左上角类型图标 */}
        <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm">
          <Music className="w-3 h-3 text-white" />
        </div>
        {/* 底部节点名称 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5">
          <p className="text-[10px] text-foreground truncate">{attachment.label}</p>
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
    </motion.div>
  );
}

/**
 * 文本/分镜等无缩略图节点预览卡 - 100x100 统一卡片
 * 左上角类型图标，中间摘要文本，底部节点名称
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
      <div className="size-[100px] rounded-lg overflow-hidden bg-muted border border-border shadow-sm p-2.5 pt-8 flex flex-col">
        {/* 中间：摘要文本 */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {attachment.excerpt && (
            <p className="text-[7px] text-muted-foreground whitespace-pre-wrap break-words leading-tight line-clamp-4">
              {attachment.excerpt}
            </p>
          )}
        </div>
        {/* 左上角类型图标 */}
        <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm">
          <Icon className="w-3 h-3 text-white" />
        </div>
        {/* 底部节点名称 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5">
          <p className="text-[10px] text-foreground truncate">{attachment.label}</p>
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
  const isVisualMedia = attachment.nodeType === 'image' || attachment.nodeType === 'video';
  const isAudio = attachment.nodeType === 'audio';

  return isVisualMedia
    ? <MediaNodeCard attachment={attachment} onClear={onClear} />
    : isAudio
      ? <AudioNodeCard attachment={attachment} onClear={onClear} />
      : <InfoNodeCard attachment={attachment} onClear={onClear} />;
}
