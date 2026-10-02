'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Warp } from '@paper-design/shaders-react';
import { ThinkingOrb } from 'thinking-orbs';
import { Check, Download, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { Slider } from '@/components/ui/slider';

/* ═══════════════════════════════════════════════════════════════════════
 * 小球形象设计器（AiOrb 参数化 Playground）
 *
 * 基于 components/canvas/AiOrb.tsx 的实现做 1:1 参数化复刻：
 * 结构、类名、动画关键帧与生产组件保持一致，仅把写死的尺寸/节奏/配色
 * 抽成 CSS 变量，由左侧控制面板实时驱动，无需刷新。
 * 右侧同时展示 thinking-orbs 的 ThinkingOrb（画布 AI 助手面板加载指示器）
 * 对应状态，方便对比两套小球形象并敲定最终参数。
 * ═══════════════════════════════════════════════════════════════════════ */

type EyeStyle = 'round' | 'crescent' | 'pixel';
type HairStyle = 'straight' | 'curly' | 'antenna' | 'none';
type Expression = 'working' | 'searching' | 'listening' | 'breathing' | 'panic';

interface OrbParams {
  /* 球体形态 */
  size: number;
  aspect: number;          // 高/宽比（圆形 1 : 1，椭圆 < 1 蹲坐感）
  squish: number;          // 底部压扁系数
  glossiness: number;      // 高光强度 0~1
  glossBlur: number;       // 高光柔化 px
  transparency: number;    // 整体不透明度 0~1
  /* 配色（三档渐变） */
  color1: string;
  color2: string;
  color3: string;
  sweatHue: number;        // 汗滴色相旋转（基于 AiOrb 蓝青渐变）
  /* 眼睛 */
  eyeStyle: EyeStyle;
  eyeWidth: number;        // 相对 size 的比例
  eyeHeight: number;
  eyeGap: number;
  eyeColor: string;
  glintScale: number;
  blinkInterval: number;   // 秒
  /* 呆毛 */
  hairStyle: HairStyle;
  hairColor: string;
  hairLength: number;      // 相对 size 的高度比例
  hairLeft: number;        // %
  swayAmplitude: number;   // deg
  swayFrequency: number;   // 秒/次
  /* 动作 */
  breathDuration: number;  // 果冻蠕动周期（秒）
  hopDuration: number;     // 蹦跳周期（秒）
  hopAmplitude: number;    // 跳跃高度 %（作用于 translateY 百分比）
  hopEnabled: boolean;
  talkBounce: boolean;     // 说话小幅蹦跳（预览开关）
  bubbleText: string;      // panic 气泡文案
  /* 表情 */
  expression: Expression;
}

const DEFAULT_PARAMS: OrbParams = {
  size: 96,
  aspect: 0.9,
  squish: 1.06,
  glossiness: 0.75,
  glossBlur: 0.5,
  transparency: 1,
  color1: '#ffd9e2',
  color2: '#ff92a4',
  color3: '#ff4d7d',
  sweatHue: 0,
  eyeStyle: 'round',
  eyeWidth: 0.19,
  eyeHeight: 0.26,
  eyeGap: 0.2,
  eyeColor: '#14080c',
  glintScale: 1,
  blinkInterval: 3.8,
  hairStyle: 'curly',
  hairColor: '#ff4d7d',
  hairLength: 0.34,
  hairLeft: 36,
  swayAmplitude: 7,
  swayFrequency: 3.4,
  breathDuration: 4.5,
  hopDuration: 4.8,
  hopAmplitude: 17,
  hopEnabled: true,
  talkBounce: false,
  bubbleText: 'NONONO',
  expression: 'breathing',
};

/* ── 表情 → 动画/装饰变量查找表（避免散落 if 判断） ───────────────────── */
type OrbVars = Record<string, string>;

const EXPR_BASE: OrbVars = {
  '--orbx-look-dur': '7s',
  '--orbx-squint-dur': '9s',
  '--orbx-squint-scale': '1',
  '--orbx-blush-op': '0.3',
  '--orbx-blush-dur': '9s',
  '--orbx-bubble-op': '0',
  '--orbx-blush-filter': 'none',
};

const EXPR_VARS: Record<Expression, OrbVars> = {
  breathing: {
    '--orbx-look-dur': '14s',
  },
  working: {
    '--orbx-squint-scale': '0.5',
    '--orbx-blush-op': '0.85',
    '--orbx-blush-filter': 'hue-rotate(-12deg) saturate(1.3)',
  },
  searching: {
    '--orbx-look-dur': '2.6s',
    '--orbx-blush-filter': 'hue-rotate(180deg) saturate(1.2)',
  },
  listening: {
    '--orbx-squint-dur': '5.5s',
    '--orbx-blush-filter': 'hue-rotate(95deg)',
  },
  panic: {
    '--orbx-bubble-op': '1',
  },
};

/* 表情对动作节奏的倍率（作用于滑块基准周期，1 = 不变） */
const EXPR_MOTION: Record<Expression, { hop: number; hair: number; jelly: number; blink: number }> = {
  breathing: { hop: 1.6, hair: 1.5, jelly: 1.4, blink: 1.4 },
  working: { hop: 1, hair: 1, jelly: 1, blink: 1 },
  searching: { hop: 1.35, hair: 0.9, jelly: 1, blink: 0.7 },
  listening: { hop: 1.3, hair: 1.2, jelly: 1.2, blink: 1 },
  panic: { hop: 0.25, hair: 0.09, jelly: 0.6, blink: 0.6 },
};

/* panic（对应生产组件 sweating）专属的附加变量 */
const PANIC_EXTRA: OrbVars = {
  '--orbx-squint-scale': '1',
  '--orbx-blush-op': '0',
  '--orbx-blush-filter': 'hue-rotate(-170deg)',
};

/* 表情 → ThinkingOrb state 对照（画布 AI 助手面板的真实映射） */
const THINKING_PAIRS: { label: string; state: 'working' | 'searching' | 'listening' | 'breathing' | 'connecting' }[] = [
  { label: 'working · 生成输出', state: 'working' },
  { label: 'searching · 深度思考', state: 'searching' },
  { label: 'listening · 初始响应', state: 'listening' },
  { label: 'breathing · 待机呼吸', state: 'breathing' },
  { label: 'connecting · 编排调度', state: 'connecting' },
];

const EXPRESSIONS: { value: Expression; label: string; hint: string }[] = [
  { value: 'working', label: 'working', hint: '开心瞪眼 + 腮红' },
  { value: 'searching', label: 'searching', hint: '快速左右张望' },
  { value: 'listening', label: 'listening', hint: '柔和缓眨' },
  { value: 'breathing', label: 'breathing', hint: '待机慢呼吸' },
  { value: 'panic', label: 'panic', hint: '拖拽冒汗 >< 眼' },
];

const EYE_STYLES: { value: EyeStyle; label: string }[] = [
  { value: 'round', label: '圆眼' },
  { value: 'crescent', label: '弯月眼' },
  { value: 'pixel', label: '像素眼' },
];

const HAIR_STYLES: { value: HairStyle; label: string }[] = [
  { value: 'curly', label: '卷发（生产默认）' },
  { value: 'straight', label: '直发' },
  { value: 'antenna', label: '天线状' },
  { value: 'none', label: '无呆毛' },
];

/* 呆毛 SVG：path 与生产 AiOrb 的 curly 完全一致 */
const HAIR_PATHS: Record<Exclude<HairStyle, 'none'>, string> = {
  straight: 'M5 19 C 6 12, 8 6, 13 2',
  curly: 'M4 19 C 5 10, 7 4, 14 3.5 C 19 3.2, 20 8, 16 8.5',
  antenna: 'M12 20 C 12 12, 11 8, 13 4',
};

/* 预设方案：一键对比不同风格取向 */
const PRESETS: { name: string; patch: Partial<OrbParams> }[] = [
  { name: '原版', patch: {} },
  {
    name: 'Q弹大眼',
    patch: { eyeWidth: 0.24, eyeHeight: 0.32, eyeGap: 0.16, glintScale: 1.5, hopAmplitude: 24, hopDuration: 3.2, breathDuration: 3, glossiness: 0.9, aspect: 0.96 },
  },
  {
    name: '静谧果冻',
    patch: { hopEnabled: false, blinkInterval: 6, breathDuration: 7, swayFrequency: 5.5, swayAmplitude: 4, glossiness: 0.55, transparency: 0.88, expression: 'breathing' },
  },
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** 从 hex 颜色估算色相（仅作为汗滴 hue-rotate 的展示参考） */
function hexToHue(hex: string): number {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  const [r, g, b] = m ? [1, 3, 5].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : [0, 0, 1];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const sectors = [(g - b) / delta, (b - r) / delta + 2, (r - g) / delta + 4];
  const hue = Math.round(60 * sectors[[r, g, b].indexOf(max)]);
  return delta === 0 ? 0 : ((hue % 360) + 360) % 360;
}

/* ── 参数化小球：AiOrb 的 1:1 结构复刻，写死值全部换成 CSS 变量 ───────── */
function DesignerOrb({ p }: { p: OrbParams }) {
  const size = p.size;
  const bodyWidth = size * p.squish;
  const bodyHeight = size * p.aspect * p.squish;
  const panic = p.expression === 'panic';
  const tempo = EXPR_MOTION[p.expression];

  const baseVars: OrbVars = {
    '--orbx-eye-w': `${round3(size * p.eyeWidth)}px`,
    '--orbx-eye-h': `${round3(size * p.eyeHeight)}px`,
    '--orbx-eye-gap': `${round3(size * p.eyeGap)}px`,
    '--orbx-glint': `${round3(size * 0.07 * p.glintScale)}px`,
    '--orbx-eye-color': p.eyeColor,
    '--orbx-blink-dur': `${round3(p.blinkInterval * tempo.blink)}s`,
    '--orbx-jelly-dur': `${round3(p.breathDuration * tempo.jelly)}s`,
    '--orbx-hop-dur': `${round3(p.hopDuration * tempo.hop)}s`,
    '--orbx-hop-amp': `${p.hopAmplitude}`,
    '--orbx-hair-dur': `${round3(p.swayFrequency * tempo.hair)}s`,
    '--orbx-hair-amp': `${p.swayAmplitude}deg`,
    '--orbx-hair-panic-amp': `${round3(p.swayAmplitude * 2.2)}deg`,
    '--orbx-gloss-op': `${p.glossiness}`,
    '--orbx-gloss-blur': `${p.glossBlur}px`,
    '--orbx-hop-anim': !p.hopEnabled ? 'none' : p.talkBounce ? 'orbx-talk-bounce' : 'orbx-hop',
    '--orbx-body-opacity': `${p.transparency}`,
    '--orbx-sweat-filter': `hue-rotate(${p.sweatHue}deg)`,
    '--orbx-blush-color': p.color3,
  };
  const vars = { ...baseVars, ...EXPR_BASE, ...EXPR_VARS[p.expression], ...(panic ? PANIC_EXTRA : {}) } as unknown as React.CSSProperties;

  return (
    <div className="orbx-root relative pointer-events-none" style={{ ...vars, width: size, height: size }}>
      {panic && (
        <div className="orbx-bubble" style={{ fontSize: Math.max(8, size * 0.22) }}>{p.bubbleText}</div>
      )}

      {/* 身体层：呆毛 + 圆脸同容器，呼吸/蹦跳时整体浮动 */}
      <div className="orbx-body">
        {/* 呆毛：发根被圆脸盖住，先于身体渲染 */}
        {p.hairStyle !== 'none' && (
          <svg
            className={cn('orbx-hair', panic && 'orbx-hair-panic')}
            style={{ width: size * 0.38, height: size * p.hairLength, left: `${p.hairLeft}%`, bottom: '86%' }}
            viewBox="0 0 24 20"
            fill="none"
          >
            <path
              d={HAIR_PATHS[p.hairStyle]}
              stroke={p.hairColor}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {p.hairStyle === 'antenna' && <circle cx="13" cy="3.5" r="2.6" fill={p.hairColor} />}
          </svg>
        )}

        {/* 果冻身体：轮廓循环形变 + 顶部镜面高光 */}
        <div
          className="orbx-shape"
          style={{ width: bodyWidth, height: bodyHeight, left: (size - bodyWidth) / 2, bottom: 0 }}
        >
          <Warp
            width={bodyWidth}
            height={bodyHeight}
            colors={[p.color1, p.color2, p.color3]}
            proportion={0.35}
            softness={1}
            distortion={0.5}
            swirl={1}
            swirlIterations={8}
            shape="edge"
            shapeScale={0}
            speed={8}
            scale={0.31}
            rotation={176}
            offsetX={0.65}
            offsetY={0.09}
          />
          <span className="orbx-gloss" style={{ width: bodyWidth * 0.34, height: bodyHeight * 0.22, left: '18%', top: '12%' }} />
          <span className="orbx-gloss orbx-gloss-dot" style={{ width: bodyWidth * 0.12, height: bodyHeight * 0.1, left: '54%', top: '10%' }} />

          {/* 脸部层：左右张望 */}
          <div className="orbx-face absolute inset-0">
            <div
              className="orbx-eyes absolute inset-0 flex items-center justify-center"
              style={{ gap: 'var(--orbx-eye-gap)', paddingBottom: bodyHeight * 0.2 }}
            >
              {panic ? (
                <>
                  {[-45, 135].map((deg) => (
                    <span
                      key={deg}
                      className="orbx-eye-panic"
                      style={{
                        width: size * 0.2,
                        height: size * 0.2,
                        borderRight: `${Math.max(1.5, size * 0.05)}px solid rgba(0, 0, 0, 0.9)}`,
                        borderBottom: `${Math.max(1.5, size * 0.05)}px solid rgba(0, 0, 0, 0.9)}`,
                        transform: `rotate(${deg}deg)`,
                      }}
                    />
                  ))}
                </>
              ) : (
                <>
                  {[0, 1].map((i) => (
                    <span key={i} className={cn('orbx-eye', `orbx-eye-${p.eyeStyle}`)}>
                      {p.eyeStyle !== 'crescent' && <span className="orbx-glint" />}
                    </span>
                  ))}
                </>
              )}
            </div>

            {/* 腮红 */}
            {[{ left: '8%' }, { right: '8%' }].map((pos) => (
              <span
                key={JSON.stringify(pos)}
                className="orbx-blush"
                style={{ width: size * 0.18, height: size * 0.09, top: '54%', ...pos }}
              />
            ))}

            {/* panic 汗滴：与生产 AiOrb 三滴布局一致 */}
            {panic && [
              { width: 1, top: '10%', left: '16%', delay: '0s' },
              { width: 1, top: '16%', right: '12%', delay: '0.35s' },
              { width: 0.75, top: '5%', right: '30%', delay: '0.7s' },
            ].map((d) => (
              <span
                key={d.delay}
                className="orbx-sweat"
                style={{
                  width: size * 0.13 * d.width,
                  height: size * 0.17 * d.width,
                  top: d.top,
                  left: d.left,
                  right: d.right,
                  animationDelay: d.delay,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 设计器专属样式：与 AiOrb 内联 <style> 同源，常量替换为 CSS 变量 ──── */
const DESIGNER_CSS = `
  .orbx-body {
    transform-origin: bottom center;
    animation: var(--orbx-hop-anim, orbx-hop) var(--orbx-hop-dur, 4.8s) ease-in-out infinite;
  }
  .orbx-shape {
    position: absolute;
    overflow: hidden;
    border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%;
    box-shadow:
      inset 0 -18% 22% -6% rgba(255, 255, 255, 0.55),
      inset 0 14% 18% -6% rgba(255, 60, 100, 0.35);
    opacity: var(--orbx-body-opacity, 1);
    animation: orbx-jelly var(--orbx-jelly-dur, 4.5s) ease-in-out infinite;
  }
  .orbx-gloss {
    position: absolute;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 999px;
    transform: rotate(-24deg);
    filter: blur(var(--orbx-gloss-blur, 0.5px));
    opacity: var(--orbx-gloss-op, 0.75);
  }
  .orbx-gloss-dot { opacity: calc(var(--orbx-gloss-op, 0.75) * 0.8); }
  .orbx-hair {
    position: absolute;
    overflow: visible;
    transform-origin: 20% 100%;
    animation: orbx-hair-sway var(--orbx-hair-dur, 3.4s) ease-in-out infinite;
  }
  .orbx-hair-panic { animation-name: orbx-hair-shake; }
  .orbx-face { animation: orbx-look var(--orbx-look-dur, 7s) ease-in-out infinite; }
  .orbx-eyes { animation: orbx-squint var(--orbx-squint-dur, 9s) ease-in-out infinite; }
  .orbx-eye {
    position: relative;
    background: var(--orbx-eye-color, rgba(20, 8, 12, 0.92));
    width: var(--orbx-eye-w, 18px);
    height: var(--orbx-eye-h, 25px);
    transform-origin: center;
    animation: orbx-blink var(--orbx-blink-dur, 3.8s) ease-in-out infinite;
  }
  .orbx-eye-round { border-radius: 999px; }
  .orbx-eye-pixel { border-radius: 12%; }
  .orbx-eye-crescent {
    background: transparent;
    border-bottom: max(2px, calc(var(--orbx-eye-h) * 0.45)) solid var(--orbx-eye-color, #14080c);
    border-radius: 0 0 999px 999px;
    height: calc(var(--orbx-eye-h) * 0.55);
  }
  .orbx-glint {
    position: absolute;
    left: 18%;
    top: 14%;
    width: var(--orbx-glint, 7px);
    height: var(--orbx-glint, 7px);
    background: #ffffff;
    border-radius: 999px;
    opacity: 0.95;
  }
  .orbx-eye-panic { border-radius: 3px; }
  .orbx-bubble {
    position: absolute;
    right: calc(100% + 0.5em);
    top: 50%;
    background: #ffffff;
    color: #ef4444;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    padding: 0.35em 0.55em;
    border-radius: 0.6em;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    transform: translateY(-50%);
    transform-origin: right center;
    opacity: var(--orbx-bubble-op, 0);
    animation: orbx-bubble-pop 0.25s ease-out, orbx-bubble-wobble 0.6s ease-in-out 0.25s infinite;
  }
  .orbx-bubble::after {
    content: '';
    position: absolute;
    left: 100%;
    top: 50%;
    margin-top: -0.3em;
    border: 0.3em solid transparent;
    border-left-color: #ffffff;
  }
  .orbx-blush {
    position: absolute;
    border-radius: 999px;
    background: color-mix(in srgb, var(--orbx-blush-color, #ff4d7d) 65%, transparent);
    filter: var(--orbx-blush-filter, none);
    animation: orbx-blush-pulse var(--orbx-blush-dur, 9s) ease-in-out infinite;
  }
  .orbx-sweat {
    position: absolute;
    background: linear-gradient(180deg, rgba(190, 230, 255, 0.95), rgba(90, 175, 255, 0.95));
    border-radius: 50% 50% 50% 50% / 70% 70% 40% 40%;
    filter: var(--orbx-sweat-filter, none);
    animation: orbx-sweat-fall 1.1s ease-in infinite;
  }
  @keyframes orbx-look {
    0%, 26%, 62%, 100% { transform: translateX(0); }
    32%, 42% { transform: translateX(-9%); }
    48%, 58% { transform: translateX(9%); }
  }
  @keyframes orbx-blink {
    0%, 86%, 100% { transform: scaleY(1); }
    89%, 95% { transform: scaleY(0.08); }
    92% { transform: scaleY(1); }
  }
  @keyframes orbx-squint {
    0%, 55%, 82%, 100% { transform: scaleY(1); }
    62%, 75% { transform: scaleY(var(--orbx-squint-scale, 1)); }
  }
  @keyframes orbx-jelly {
    0%, 100% { border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%; }
    33% { border-radius: 46% 54% 42% 50% / 52% 60% 46% 40%; }
    66% { border-radius: 54% 46% 50% 42% / 60% 52% 40% 46%; }
  }
  @keyframes orbx-hop {
    0%, 100% { transform: translateY(0) scale(1); }
    16% { transform: translateY(calc(1.5% * var(--orbx-hop-amp, 17) / 17)) scale(1.02, 0.97); }
    30% { transform: translateY(calc(2.5% * var(--orbx-hop-amp, 17) / 17)) scale(1.06, 0.92); }
    40% { transform: translateY(calc(-1% * var(--orbx-hop-amp, 17))) scale(0.93, 1.1); }
    50% { transform: translateY(calc(-17% * var(--orbx-hop-amp, 17) / 17)) scale(0.98, 1.03); }
    60% { transform: translateY(0) scale(1.1, 0.87); }
    68% { transform: translateY(calc(-4% * var(--orbx-hop-amp, 17) / 17)) scale(0.97, 1.04); }
    78% { transform: translateY(0) scale(1); }
  }
  @keyframes orbx-talk-bounce {
    0%, 100% { transform: translateY(0) scale(1); }
    35% { transform: translateY(-5%) scale(0.98, 1.03); }
    70% { transform: translateY(1.5%) scale(1.02, 0.98); }
  }
  @keyframes orbx-hair-sway {
    0%, 100% { transform: rotate(calc(-1 * var(--orbx-hair-amp, 7deg))); }
    50% { transform: rotate(var(--orbx-hair-amp, 7deg)); }
  }
  @keyframes orbx-hair-shake {
    0%, 100% { transform: rotate(calc(-1 * var(--orbx-hair-panic-amp, 16deg))); }
    50% { transform: rotate(var(--orbx-hair-panic-amp, 16deg)); }
  }
  @keyframes orbx-blush-pulse {
    0%, 55%, 82%, 100% { opacity: calc(var(--orbx-blush-op, 0.3) * 0.35); }
    62%, 75% { opacity: var(--orbx-blush-op, 0.3); }
  }
  @keyframes orbx-sweat-fall {
    0% { opacity: 0; transform: translateY(-30%) scale(0.4); }
    25% { opacity: 0.95; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(160%) scale(0.85); }
  }
  @keyframes orbx-bubble-pop {
    0% { opacity: 0; transform: translateY(-50%) scale(0.3); }
    100% { opacity: var(--orbx-bubble-op, 0); transform: translateY(-50%) scale(1); }
  }
  @keyframes orbx-bubble-wobble {
    0%, 100% { transform: translateY(-50%) rotate(-3deg); }
    50% { transform: translateY(-50%) rotate(3deg); }
  }
`;

/* ── 控制面板通用控件 ─────────────────────────────────────────────────── */
function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <span className="w-16 shrink-0 text-right text-xs font-mono tabular-nums">
        {value}{unit ?? ''}
      </span>
    </div>
  );
}

function SelectRow<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 shrink-0 cursor-pointer rounded-md border border-border/60 bg-background p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
      <span className="text-xs font-mono text-muted-foreground">{checked ? 'on' : 'off'}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/* ── 页面主体 ─────────────────────────────────────────────────────────── */
export default function OrbDesignerPage() {
  const { resolvedTheme } = useTheme();
  const [params, setParams] = useState<OrbParams>(DEFAULT_PARAMS);
  const [copied, setCopied] = useState(false);
  const [stageDark, setStageDark] = useState(resolvedTheme !== 'light');
  const [compare, setCompare] = useState(false);

  const set = <K extends keyof OrbParams>(key: K, value: OrbParams[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

  const configJson = useMemo(() => JSON.stringify(params, null, 2), [params]);

  const copyConfig = () => {
    navigator.clipboard.writeText(configJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const activeThinking = THINKING_PAIRS.find((t) => t.state === params.expression) ?? THINKING_PAIRS[0];

  return (
    <div className="min-h-screen w-full bg-background text-foreground p-4 md:p-8">
      <style>{DESIGNER_CSS}</style>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* 头部 */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">小球形象设计器</h1>
            <p className="text-sm text-muted-foreground">
              AiOrb（画布悬浮头像）参数化 Playground · 左侧实时预览 · 调好后一键导出参数 JSON
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((pre) => (
              <motion.button
                key={pre.name}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setParams({ ...DEFAULT_PARAMS, ...pre.patch })}
                className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium hover:border-primary/50"
              >
                预设 · {pre.name}
              </motion.button>
            ))}
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setParams(DEFAULT_PARAMS)}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium hover:border-primary/50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 重置
            </motion.button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* 左：实时预览 */}
          <div className="space-y-4">
            <div
              className={cn(
                'relative overflow-hidden rounded-xl border border-border/60 p-6',
                stageDark ? 'dark bg-zinc-950' : 'bg-zinc-50',
              )}
            >
              {/* 背景氛围光斑 */}
              <motion.div
                className={cn('pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full blur-3xl', stageDark ? 'bg-pink-500/15' : 'bg-pink-300/25')}
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className={cn('pointer-events-none absolute -bottom-24 right-0 h-56 w-56 rounded-full blur-3xl', stageDark ? 'bg-fuchsia-500/10' : 'bg-fuchsia-300/20')}
                animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* 主预览：放大展示以便观察细节（不影响实际尺寸参数） */}
              <div className="relative flex min-h-[280px] items-end justify-center gap-10 pb-6">
                {[...(compare ? [{ key: 'ref', p: DEFAULT_PARAMS, tag: '生产默认' }] : []), { key: 'cur', p: params, tag: '当前方案' }].map((slot) => (
                  <div key={slot.key} className="flex flex-col items-center gap-2">
                    {/* 主预览把小球视觉放大到约 220px 以便观察细节（不改实际尺寸参数） */}
                    <div
                      style={{
                        width: slot.p.size,
                        height: slot.p.size,
                        transform: `scale(${Math.min(2.4, Math.max(1, 220 / slot.p.size))})`,
                        transformOrigin: 'bottom center',
                      }}
                    >
                      <DesignerOrb p={slot.p} />
                    </div>
                    <span className={cn('text-[10px] font-mono', stageDark ? 'text-zinc-500' : 'text-zinc-400')}>{slot.tag}</span>
                  </div>
                ))}
              </div>

              {/* 真实尺寸对照 + ThinkingOrb 对照 */}
              <div className="relative mt-4 flex flex-wrap items-end justify-center gap-8 border-t border-current/10 pt-4">
                {[40, 64].map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1.5">
                    <DesignerOrb p={{ ...params, size: s }} />
                    <span className="text-[10px] font-mono text-muted-foreground">AiOrb size={s}</span>
                  </div>
                ))}
                {THINKING_PAIRS.map((t) => (
                  <div key={t.state} className="flex flex-col items-center gap-1.5">
                    <ThinkingOrb
                      state={t.state}
                      size={64}
                      theme={stageDark ? 'dark' : 'light'}
                      speed={1}
                      aria-label={t.label}
                    />
                    <span className={cn('text-[10px] font-mono', t.state === params.expression ? 'text-pink-500 font-bold' : 'text-muted-foreground')}>
                      {t.state}
                    </span>
                  </div>
                ))}
              </div>

              {/* 舞台工具：底色 + 对比开关 */}
              <div className="absolute right-3 top-3 flex items-center gap-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={compare}
                  onClick={() => setCompare(!compare)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                    compare
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-current/20 bg-background/60 hover:border-primary/50',
                  )}
                >
                  对比原版
                </button>
                {(['light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStageDark(t === 'dark')}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                      stageDark === (t === 'dark')
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-current/20 bg-background/60 hover:border-primary/50',
                    )}
                  >
                    {t === 'dark' ? '深底' : '浅底'}
                  </button>
                ))}
              </div>
            </div>

            {/* 配置输出 */}
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">当前参数配置</h3>
                <div className="flex gap-2">
                  <code className="self-center text-[10px] font-mono text-muted-foreground/70">
                    {'<AiOrb size={' + params.size + '} />'}
                  </code>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={copyConfig}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      copied ? 'bg-emerald-500/15 text-emerald-500' : 'bg-primary text-primary-foreground',
                    )}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                    {copied ? '已复制' : '复制 JSON'}
                  </motion.button>
                </div>
              </div>
              <pre className="max-h-52 overflow-auto rounded-lg bg-background/70 p-3 text-[11px] leading-relaxed font-mono text-muted-foreground">
                {configJson}
              </pre>
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                参数回填映射：主色三档 → AiOrb.tsx 的 ORB_COLORS；尺寸/五官比例/高光位置 → 组件内 size * 系数；
                眨眼/呼吸/蹦跳/呆毛周期与幅度 → 内联 style 中各 @keyframes 的 animation-duration 与位移百分比；
                透明度/光泽度 → .orbx-shape opacity 与 .orbx-gloss opacity。
              </p>
            </div>
          </div>

          {/* 右：参数控制面板 */}
          <div className="space-y-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto lg:pr-1">
            {/* 表情状态 */}
            <Panel title="表情 · Expression">
              <div className="flex flex-wrap gap-1.5">
                {EXPRESSIONS.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => set('expression', e.value)}
                    aria-pressed={params.expression === e.value}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                      params.expression === e.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/60 bg-background hover:border-primary/50',
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {EXPRESSIONS.find((e) => e.value === params.expression)?.hint}
                {' · ThinkingOrb 对照：'}
                <code className="font-mono">{activeThinking.state}</code>
              </p>
            </Panel>

            {/* 球体形态 */}
            <Panel title="球体形态 · Body">
              <SliderRow label="尺寸 size" value={params.size} min={32} max={176} step={4} unit="px" onChange={(v) => set('size', v)} />
              <SliderRow label="形状 高/宽比" value={params.aspect} min={0.7} max={1.1} step={0.02} onChange={(v) => set('aspect', v)} />
              <SliderRow label="底部宽度" value={params.squish} min={0.9} max={1.2} step={0.02} onChange={(v) => set('squish', v)} />
              <SliderRow label="光泽度" value={params.glossiness} min={0} max={1} step={0.05} onChange={(v) => set('glossiness', v)} />
              <SliderRow label="高光柔化" value={params.glossBlur} min={0} max={4} step={0.25} unit="px" onChange={(v) => set('glossBlur', v)} />
              <SliderRow label="透明度(反)" value={params.transparency} min={0.3} max={1} step={0.05} onChange={(v) => set('transparency', v)} />
              <ColorRow label="主色 浅" value={params.color1} onChange={(v) => set('color1', v)} />
              <ColorRow label="主色 中" value={params.color2} onChange={(v) => set('color2', v)} />
              <ColorRow label="主色 深" value={params.color3} onChange={(v) => set('color3', v)} />
            </Panel>

            {/* 眼睛 */}
            <Panel title="眼睛 · Eyes">
              <SelectRow label="样式" value={params.eyeStyle} options={EYE_STYLES} onChange={(v) => set('eyeStyle', v)} />
              <SliderRow label="宽度" value={params.eyeWidth} min={0.08} max={0.32} step={0.01} onChange={(v) => set('eyeWidth', v)} />
              <SliderRow label="高度" value={params.eyeHeight} min={0.1} max={0.4} step={0.01} onChange={(v) => set('eyeHeight', v)} />
              <SliderRow label="间距" value={params.eyeGap} min={0.05} max={0.4} step={0.01} onChange={(v) => set('eyeGap', v)} />
              <SliderRow label="反光点" value={params.glintScale} min={0} max={2.5} step={0.1} onChange={(v) => set('glintScale', v)} />
              <SliderRow label="眨眼周期" value={params.blinkInterval} min={1} max={10} step={0.2} unit="s" onChange={(v) => set('blinkInterval', v)} />
              <ColorRow label="眼睛颜色" value={params.eyeColor} onChange={(v) => set('eyeColor', v)} />
              <p className="text-[10px] text-muted-foreground/70">眼睛色相 ≈ {hexToHue(params.eyeColor)}° · 汗滴可独立调色</p>
            </Panel>

            {/* 呆毛 */}
            <Panel title="呆毛 · Ahoge">
              <SelectRow label="形状" value={params.hairStyle} options={HAIR_STYLES} onChange={(v) => set('hairStyle', v)} />
              <ColorRow label="颜色" value={params.hairColor} onChange={(v) => set('hairColor', v)} />
              <SliderRow label="长度" value={params.hairLength} min={0.15} max={0.7} step={0.02} onChange={(v) => set('hairLength', v)} />
              <SliderRow label="位置 left" value={params.hairLeft} min={10} max={70} step={2} unit="%" onChange={(v) => set('hairLeft', v)} />
              <SliderRow label="摆动幅度" value={params.swayAmplitude} min={0} max={24} step={1} unit="°" onChange={(v) => set('swayAmplitude', v)} />
              <SliderRow label="摆动周期" value={params.swayFrequency} min={0.8} max={8} step={0.2} unit="s" onChange={(v) => set('swayFrequency', v)} />
            </Panel>

            {/* 动作 */}
            <Panel title="动作 · Motion">
              <SliderRow label="呼吸周期" value={params.breathDuration} min={1.5} max={10} step={0.5} unit="s" onChange={(v) => set('breathDuration', v)} />
              <SwitchRow label="蹦跳" checked={params.hopEnabled} onChange={(v) => set('hopEnabled', v)} />
              <SliderRow label="蹦跳周期" value={params.hopDuration} min={1.5} max={12} step={0.2} unit="s" onChange={(v) => set('hopDuration', v)} />
              <SliderRow label="跳跃幅度" value={params.hopAmplitude} min={0} max={40} step={1} unit="%" onChange={(v) => set('hopAmplitude', v)} />
              <SwitchRow label="说话蹦跳" checked={params.talkBounce} onChange={(v) => set('talkBounce', v)} />
              <SliderRow label="汗滴色相" value={params.sweatHue} min={-180} max={180} step={10} unit="°" onChange={(v) => set('sweatHue', v)} />
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">气泡文案</span>
                <input
                  type="text"
                  value={params.bubbleText}
                  onChange={(e) => set('bubbleText', e.target.value)}
                  className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
