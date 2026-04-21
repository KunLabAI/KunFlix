'use client';

import { memo } from 'react';
import { useCanvasStore, type NodeEffect } from '@/store/useCanvasStore';
import { Eye, Pencil, Trash2, Link2, ScanSearch } from 'lucide-react';

/* ── Effect visual config ─────────────────────────────────── */
const EFFECT_CONFIG: Record<NodeEffect, {
  borderColor: string;       // Tailwind border color
  glowColor: string;         // box-shadow glow color (CSS value)
  bgColor: string;           // overlay background
  icon: typeof Eye;
  label: string;
}> = {
  reading: {
    borderColor: 'border-blue-400',
    glowColor: 'rgba(59,130,246,0.5)',
    bgColor: 'rgba(59,130,246,0.08)',
    icon: Eye,
    label: 'Reading…',
  },
  scanning: {
    borderColor: 'border-blue-400',
    glowColor: 'rgba(59,130,246,0.4)',
    bgColor: 'rgba(59,130,246,0.06)',
    icon: ScanSearch,
    label: 'Scanning…',
  },
  updating: {
    borderColor: 'border-amber-400',
    glowColor: 'rgba(245,158,11,0.5)',
    bgColor: 'rgba(245,158,11,0.08)',
    icon: Pencil,
    label: 'Editing…',
  },
  deleting: {
    borderColor: 'border-red-400',
    glowColor: 'rgba(239,68,68,0.5)',
    bgColor: 'rgba(239,68,68,0.10)',
    icon: Trash2,
    label: 'Deleting…',
  },
  connecting: {
    borderColor: 'border-green-400',
    glowColor: 'rgba(34,197,94,0.5)',
    bgColor: 'rgba(34,197,94,0.08)',
    icon: Link2,
    label: 'Connecting…',
  },
};

/* Badge color map */
const BADGE_COLORS: Record<NodeEffect, string> = {
  reading: 'bg-blue-500 text-white border-blue-300',
  scanning: 'bg-blue-500 text-white border-blue-300',
  updating: 'bg-amber-500 text-white border-amber-300',
  deleting: 'bg-red-500 text-white border-red-300',
  connecting: 'bg-green-500 text-white border-green-300',
};

interface NodeEffectOverlayProps {
  nodeId: string;
}

const NodeEffectOverlay = memo(({ nodeId }: NodeEffectOverlayProps) => {
  const effect = useCanvasStore((state) => state.activeNodeEffects[nodeId]);

  // Zero cost when no effect
  if (!effect) return null;

  const config = EFFECT_CONFIG[effect];
  const Icon = config.icon;

  return (
    <>
      {/* ── Pulsing border + glow ────────────────────── */}
      <div
        className={`absolute inset-[-3px] rounded-xl ${config.borderColor} border-[3px] pointer-events-none z-[20]`}
        style={{
          animation: 'nodeEffectPulse 1.5s ease-in-out infinite',
          boxShadow: `0 0 12px 2px ${config.glowColor}, inset 0 0 12px 2px ${config.glowColor}`,
        }}
      />

      {/* ── Background tint overlay ──────────────────── */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none z-[19]"
        style={{ backgroundColor: config.bgColor }}
      />

      {/* ── Scan bar for reading effect ──────────────── */}
      {effect === 'reading' && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none z-[21] overflow-hidden"
        >
          <div
            className="absolute inset-y-0 w-1/3"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.18), transparent)',
              animation: 'nodeEffectScan 2s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {/* ── Floating label badge ─────────────────────── */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-[22] pointer-events-none">
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-lg border ${BADGE_COLORS[effect]}`}
          style={{ animation: 'nodeEffectBadgeBounce 1.5s ease-in-out infinite' }}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{config.label}</span>
        </div>
      </div>
    </>
  );
});

NodeEffectOverlay.displayName = 'NodeEffectOverlay';

export default NodeEffectOverlay;
