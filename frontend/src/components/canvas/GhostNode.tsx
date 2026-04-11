'use client';

import { memo } from 'react';
import { NodeProps, Node } from '@xyflow/react';
import { FileText, Image, Film, Music, Clapperboard, Sparkles } from 'lucide-react';
import { GhostNodeData } from '@/store/useCanvasStore';

const TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  text: { icon: FileText, color: 'text-indigo-400', label: '文本卡' },
  image: { icon: Image, color: 'text-emerald-400', label: '图片卡' },
  video: { icon: Film, color: 'text-purple-400', label: '视频卡' },
  audio: { icon: Music, color: 'text-amber-400', label: '音频卡' },
  storyboard: { icon: Clapperboard, color: 'text-amber-400', label: '分镜卡' },
};

const DEFAULT_CONFIG = { icon: FileText, color: 'text-muted-foreground', label: '节点' };

// Dimensions must match addGhostNode in useCanvasStore
const GHOST_DIMENSIONS: Record<string, { width: number; height: number }> = {
  text: { width: 400, height: 300 },
  image: { width: 512, height: 384 },
  video: { width: 512, height: 384 },
  audio: { width: 360, height: 200 },
  storyboard: { width: 398, height: 256 },
};

const GhostNode = memo(({ data }: NodeProps<Node<GhostNodeData>>) => {
  const nodeType = data.targetNodeType || 'text';
  const config = TYPE_CONFIG[nodeType] || DEFAULT_CONFIG;
  const Icon = config.icon;
  const dims = GHOST_DIMENSIONS[nodeType] || { width: 420, height: 300 };

  return (
    <div
      className="rounded-xl border-2 border-dashed border-primary/30 bg-card/80 backdrop-blur-sm overflow-hidden relative"
      style={{ width: dims.width, height: dims.height }}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 animate-ghost-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.08) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />

      {/* Pulse ring */}
      <div className="absolute inset-0 rounded-xl animate-ghost-pulse" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3">
        <div className="relative">
          <Icon className={`w-10 h-10 ${config.color} opacity-60`} />
          <Sparkles className="w-4 h-4 text-primary absolute -top-1 -right-1 animate-pulse" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground/70">AI 正在创建</p>
          <p className="text-xs text-muted-foreground mt-0.5">{config.label}</p>
        </div>
        {/* Loading dots */}
        <div className="flex gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-ghost-dot"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

GhostNode.displayName = 'GhostNode';

export default GhostNode;
