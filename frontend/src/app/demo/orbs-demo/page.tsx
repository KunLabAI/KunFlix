'use client';

import React, { useState, useEffect } from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import NodeEffectOverlay from '@/components/canvas/NodeEffectOverlay';
import GhostNode from '@/components/canvas/GhostNode';
import { useCanvasStore, type NodeEffect } from '@/store/useCanvasStore';

/* ── 9 种状态元数据（label = 库枚举值，hint = 中文语义） ─────────────── */
const ORB_STATES: { state: OrbState; label: string; hint: string }[] = [
  { state: 'working', label: 'working', hint: '工作 / 生成输出' },
  { state: 'searching', label: 'searching', hint: '搜索 / 深度思考' },
  { state: 'solving', label: 'solving', hint: '求解 / 推理' },
  { state: 'listening', label: 'listening', hint: '聆听 / 初始响应' },
  { state: 'connecting', label: 'connecting', hint: '连接 / Leader 调度' },
  { state: 'weaving', label: 'weaving', hint: '编织 / 多智能体协作' },
  { state: 'composing', label: 'composing', hint: '编排 / 组织内容' },
  { state: 'breathing', label: 'breathing', hint: '呼吸 / 待机' },
  { state: 'shaping', label: 'shaping', hint: '塑形 / 结构化' },
];

/* ── 画布节点卡片的 Agent 操作效果（复用 NodeEffectOverlay 的真实状态枚举）── */
const NODE_EFFECTS: NodeEffect[] = ['reading', 'scanning', 'updating', 'deleting', 'connecting'];

// GhostNode 仅消费 data.targetNodeType，用最小 props 断言为完整 NodeProps 类型
const ghostProps = { data: { targetNodeType: 'text' } } as unknown as React.ComponentProps<typeof GhostNode>;

/**
 * ThinkingOrb 动画演示页（视觉验收 / 调试用）。
 * 展示全部 9 种 state 在 size=20（内联）与 size=64（头像级）下的形态，
 * 并提供状态切换与速度调节交互；theme 跟随应用当前主题。
 */
export default function OrbsDemoPage() {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light';
  const [selected, setSelected] = useState<OrbState>('working');
  const [speed, setSpeed] = useState(1);

  const selectedMeta = ORB_STATES.find((s) => s.state === selected) ?? ORB_STATES[0];

  // 为演示卡片在 canvas store 中常驻设置各类节点效果（卸载时清除，避免污染真实画布）
  useEffect(() => {
    const effects: Record<string, NodeEffect> = {};
    NODE_EFFECTS.forEach((e) => { effects[`demo-${e}`] = e; });
    useCanvasStore.getState().setNodeEffects(effects);
    return () => {
      const s = useCanvasStore.getState();
      NODE_EFFECTS.forEach((e) => s.clearNodeEffect(`demo-${e}`));
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-background text-foreground p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* 头部 */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">ThinkingOrb & 节点描边动画演示</h1>
          <p className="text-sm text-muted-foreground">
            thinking-orbs 的 9 种状态 + 画布节点 BorderBeam 描边效果 · 当前主题：{resolvedTheme}
          </p>
        </header>

        {/* 交互预览 */}
        <section className="rounded-xl border border-border/60 bg-muted/20 p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <ThinkingOrb
              state={selected}
              size={64}
              theme={theme}
              speed={speed}
              aria-label={selectedMeta.hint}
            />
            {/* 内联形态：orb 在左、文字在右 */}
            <div className="flex items-center gap-2">
              <ThinkingOrb state={selected} size={20} theme={theme} speed={speed} aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{selectedMeta.hint}</span>
            </div>
            <code className="text-xs font-mono text-muted-foreground">
              {`<ThinkingOrb state="${selected}" size={64} theme="${theme}" />`}
            </code>
          </div>

          {/* 状态切换按钮 */}
          <div className="flex flex-wrap justify-center gap-2">
            {ORB_STATES.map((s) => (
              <button
                key={s.state}
                type="button"
                onClick={() => setSelected(s.state)}
                aria-pressed={selected === s.state}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  selected === s.state
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-background hover:border-primary/50',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 速度调节 */}
          <div className="flex items-center justify-center gap-3">
            <label htmlFor="orb-speed" className="text-xs text-muted-foreground">
              speed
            </label>
            <input
              id="orb-speed"
              type="range"
              min={0.25}
              max={3}
              step={0.25}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-48"
            />
            <span className="w-12 text-xs font-mono tabular-nums text-muted-foreground">
              {speed.toFixed(2)}×
            </span>
          </div>
        </section>

        {/* 全部状态 · size 64（头像级） */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">全部状态 · size 64（头像级）</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {ORB_STATES.map((s) => (
              <div
                key={s.state}
                className="flex flex-col items-center gap-2 rounded-lg border border-border/40 bg-muted/10 p-4"
              >
                <ThinkingOrb state={s.state} size={64} theme={theme} aria-label={s.hint} />
                <span className="text-xs font-mono">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 全部状态 · size 20（内联，与文字并排） */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            全部状态 · size 20（内联，与文字并排）
          </h2>
          <div className="flex flex-col gap-2">
            {ORB_STATES.map((s) => (
              <div key={s.state} className="flex items-center gap-2">
                <ThinkingOrb state={s.state} size={20} theme={theme} aria-hidden="true" />
                <span className="text-sm text-muted-foreground">{s.hint}</span>
                <code className="ml-auto text-[10px] font-mono text-muted-foreground/60">{s.label}</code>
              </div>
            ))}
          </div>
        </section>

        {/* 节点卡片描边效果（Agent 操作画布节点，复用生产组件 NodeEffectOverlay / GhostNode）*/}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-muted-foreground">
              节点卡片描边效果 · Agent 操作画布节点
            </h2>
            <p className="text-xs text-muted-foreground">
              复用生产组件 NodeEffectOverlay（BorderBeam 流光 + 图标徽标 + 背景色 + reading 扫描光带）；实际使用中为瞬态，工具完成后约 1.5s 淡出。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-14 pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {NODE_EFFECTS.map((eff) => (
              <div key={eff} className="relative">
                <NodeEffectOverlay nodeId={`demo-${eff}`} />
                <div className="flex h-[120px] flex-col gap-2 rounded-xl border border-border/50 bg-card p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full bg-primary/40" />
                    <span className="h-2.5 w-24 rounded bg-muted-foreground/30" />
                    <code className="ml-auto text-[10px] font-mono text-muted-foreground/50">{eff}</code>
                  </div>
                  <span className="h-2 w-full rounded bg-muted-foreground/15" />
                  <span className="h-2 w-4/5 rounded bg-muted-foreground/15" />
                  <span className="h-2 w-2/3 rounded bg-muted-foreground/15" />
                </div>
              </div>
            ))}
          </div>

          {/* 创建态 · GhostNode */}
          <div className="space-y-2 pt-6">
            <h3 className="text-xs font-medium text-muted-foreground">
              创建态 · GhostNode（create_canvas_node / 媒体生成占位）
            </h3>
            <div className="flex flex-wrap items-start gap-8 pt-10">
              <GhostNode {...ghostProps} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
