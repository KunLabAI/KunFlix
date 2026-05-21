'use client';

import React, { useEffect, useState } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';

/* ── 预设模板 ─────────────────────────── */
const PRESETS: { name: string; colors: string[] }[] = [
  { name: '水晶', colors: ['#a8d8ea', '#c9b1ff', '#e8d5f5', '#b8e4f0', '#d4c4fb', '#f0e6ff'] },
  { name: '深空星云', colors: ['#0d0221', '#261447', '#6b2fa0', '#1a1a4e', '#2d1b69', '#0f3460'] },
  { name: '极光深空', colors: ['#0a0a2e', '#1b0a3c', '#0d2b45', '#1a4a5c', '#2d1654', '#0b3d4a'] },
  { name: '银河蓝紫', colors: ['#0f0c29', '#302b63', '#24243e', '#1a0533', '#4a1c8b', '#1e3a5f'] },
  { name: '暗物质', colors: ['#05050f', '#0d1b2a', '#1b2838', '#162447', '#1f4068', '#0a1628'] },
  { name: '玫瑰星云', colors: ['#1a0a2e', '#3d1c5c', '#5c2a6e', '#1e1145', '#4a0e4e', '#2a1a4e'] },
  { name: '冰蓝星际', colors: ['#020c1b', '#0a192f', '#112240', '#1d3461', '#0d4b6e', '#162950'] },
  { name: '晨雾', colors: ['#e0e7ff', '#c7d2fe', '#ddd6fe', '#e0f2fe', '#f0e6ff', '#f5f3ff'] },
  { name: '蜜桃汽水', colors: ['#fecdd3', '#fde68a', '#fed7aa', '#fbcfe8', '#fca5a5', '#fef08a'] },
  { name: '薄荷奶油', colors: ['#d1fae5', '#a7f3d0', '#bfdbfe', '#c4f0eb', '#d5f5e3', '#e0f7fa'] },
  { name: '日落柔光', colors: ['#fda4af', '#fdba74', '#fcd34d', '#f9a8d4', '#fb923c', '#fde047'] },
  { name: '棉花糖', colors: ['#f0abfc', '#c4b5fd', '#93c5fd', '#f9a8d4', '#a5b4fc', '#d8b4fe'] },
  { name: '极地冰川', colors: ['#cffafe', '#a5f3fc', '#bae6fd', '#e0f2fe', '#dbeafe', '#c7d2fe'] },
  { name: '梅子黄昨', colors: ['#e9d5ff', '#fef3c7', '#ddd6fe', '#fde68a', '#c4b5fd', '#fbf8cc'] },
  { name: '浮光梦境', colors: ['#c4b5fd', '#fbcfe8', '#a5b4fc', '#f0abfc', '#818cf8', '#f9a8d4'] },
  { name: '午夜美梦', colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#7c3aed', '#6d28d9', '#c084fc'] },
  { name: '迷雾森林', colors: ['#a7f3d0', '#c4b5fd', '#6ee7b7', '#d8b4fe', '#86efac', '#e9d5ff'] },
  { name: '晨曦幻境', colors: ['#fecdd3', '#e0e7ff', '#fda4af', '#c7d2fe', '#fbcfe8', '#ddd6fe'] },
];

export default function ShaderDemoPage() {
  const [colors, setColors] = useState<string[]>(PRESETS[0].colors);
  const [activePreset, setActivePreset] = useState(0);
  const [distortion, setDistortion] = useState(1.2);
  const [swirl, setSwirl] = useState(0.6);
  const [speed, setSpeed] = useState(0.8);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleColorChange = (index: number, value: string) => {
    const next = [...colors];
    next[index] = value;
    setColors(next);
  };

  const handleCopy = (index: number) => {
    navigator.clipboard.writeText(colors[index]);
    setCopied(index);
    setTimeout(() => setCopied(null), 1200);
  };

  const handleCopyAll = () => {
    const text = `['${colors.join("', '")}']`;
    navigator.clipboard.writeText(text);
    setCopied(-1);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-neutral-950">
      {/* Shader 全屏背景 */}
      {mounted && (
        <div className="fixed inset-0">
          <MeshGradient
            width={dimensions.width}
            height={dimensions.height}
            colors={colors}
            distortion={distortion}
            swirl={swirl}
            speed={speed}
            offsetX={0.08}
            grainMixer={0}
            grainOverlay={0}
          />
        </div>
      )}

      {/* 浮动控制面板 */}
      <div className="fixed top-6 right-6 z-50 w-[320px] backdrop-blur-xl bg-black/50 border border-white/10 rounded-2xl shadow-2xl p-5 flex flex-col gap-5">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h1 className="text-white/90 text-base font-semibold tracking-tight">
            Shader 调色板
          </h1>
          <button
            onClick={handleCopyAll}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
          >
            {copied === -1 ? '✓ 已复制' : '复制全部色号'}
          </button>
        </div>

        {/* 预设模板 */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => { setColors(preset.colors); setActivePreset(i); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                activePreset === i
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 border border-transparent'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* 色彩选择器网格 */}
        <div className="grid grid-cols-2 gap-3">
          {colors.map((color, i) => (
            <div key={i} className="flex items-center gap-2.5 group">
              <label
                className="relative w-9 h-9 rounded-lg border-2 border-white/20 cursor-pointer overflow-hidden shrink-0 hover:border-white/50 transition-colors shadow-lg"
                style={{ backgroundColor: color }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleColorChange(i, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </label>
              <button
                onClick={() => handleCopy(i)}
                className="text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition-colors truncate"
              >
                {copied === i ? '✓' : color}
              </button>
            </div>
          ))}
        </div>

        {/* 分隔线 */}
        <div className="border-t border-white/10" />

        {/* 参数滑块 */}
        <div className="flex flex-col gap-4">
          <SliderControl
            label="Distortion"
            value={distortion}
            min={0}
            max={2}
            step={0.05}
            onChange={setDistortion}
          />
          <SliderControl
            label="Swirl"
            value={swirl}
            min={0}
            max={1}
            step={0.05}
            onChange={setSwirl}
          />
          <SliderControl
            label="Speed"
            value={speed}
            min={0}
            max={2}
            step={0.05}
            onChange={setSpeed}
          />
        </div>

        {/* 重置按钮 */}
        <button
          onClick={() => {
            setColors(PRESETS[0].colors);
            setActivePreset(0);
            setDistortion(1.2);
            setSwirl(0.6);
            setSpeed(0.8);
          }}
          className="w-full text-sm py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white transition-colors"
        >
          重置默认
        </button>
      </div>
    </div>
  );
}

/* ── 滑块控件 ─────────────────────────── */
function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50 font-medium">{label}</span>
        <span className="text-xs font-mono text-white/60 bg-white/5 px-1.5 py-0.5 rounded">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
      />
    </div>
  );
}
