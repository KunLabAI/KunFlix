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

// Glow color matching NodeEffectOverlay scanning config (blue)
const GLOW_COLOR = 'rgba(59,130,246,0.4)';
const BG_COLOR = 'rgba(59,130,246,0.06)';

const GhostNode = memo(({ data }: NodeProps<Node<GhostNodeData>>) => {
  const nodeType = data.targetNodeType || 'text';
  const config = TYPE_CONFIG[nodeType] || DEFAULT_CONFIG;
  const Icon = config.icon;
  const dims = GHOST_DIMENSIONS[nodeType] || { width: 420, height: 300 };

  return (
    <div
      className="rounded-xl bg-card/80 backdrop-blur-sm overflow-visible relative"
      style={{ width: dims.width, height: dims.height }}
    >
      {/* ── Pulsing border + glow (same as NodeEffectOverlay scanning) ── */}
      <div
        className="absolute inset-[-3px] rounded-xl border-[1px] border-blue-400 pointer-events-none z-[1]"
        style={{
          animation: 'nodeEffectPulse 1.5s ease-in-out infinite',
          boxShadow: `0 0 6px 2px ${GLOW_COLOR}, inset 0 0 6px 2px ${GLOW_COLOR}`,
        }}
      />

      {/* ── Background tint overlay ── */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ backgroundColor: BG_COLOR }}
      />

      {/* ── Scan bar (sweep effect) ── */}
      <div className="absolute inset-0 rounded-xl pointer-events-none z-[2] overflow-hidden">
        <div
          className="absolute inset-y-0 w-1/3"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.15), transparent)',
            animation: 'nodeEffectScan 2s ease-in-out infinite',
          }}
        />
      </div>

      {/* ── Floating badge (same as NodeEffectOverlay) ── */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-[22] pointer-events-none">
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-lg border bg-blue-500 text-white border-blue-300"
          style={{ animation: 'nodeEffectBadgeBounce 1.5s ease-in-out infinite' }}
        >
          <span>{config.label}创建中…</span>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3">
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
