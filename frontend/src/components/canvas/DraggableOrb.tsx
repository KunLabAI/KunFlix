'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useAnimationControls,
} from 'framer-motion';
import { AiOrb } from '@/components/canvas/AiOrb';

/** 碰撞发生的方向（小球撞到哪面墙） */
export type OrbImpactSide = 'top' | 'left' | 'right' | 'bottom';

interface DraggableOrbProps {
  /** 头像直径（px），默认 40 */
  size?: number;
  /** 点击（非拖拽）回调；发生拖动位移时不会触发 */
  onTap?: () => void;
  /** 空间边界元素（如 AI 面板容器）：小球被四壁硬挡住，撞墙时被挤压压扁 */
  boundsRef?: React.RefObject<HTMLElement | null>;
  /** 作为“地板”的障碍元素（如预设按钮区）；小球向下拖到其顶边即被硬挡住并触发碰撞 */
  barrierRef?: React.RefObject<HTMLElement | null>;
  /** 撞墙瞬间回调，携带碰撞方向（供父级触发对应的碰撞反馈，如底部按钮区震动） */
  onImpact?: (side: OrbImpactSide) => void;
  /** 对话气泡文案：显示在小球右上方 */
  bubble?: string;
  /** 气泡点击回调：传入时气泡才可点击 */
  onBubbleClick?: () => void;
  className?: string;
}

/** 小球手势阶段：idle 静止可交互 / drag 拖拽中 / settle 松手回弹中（拖拽余波，不响应点击） */
type OrbPhase = 'idle' | 'drag' | 'settle';

// 视为“无墙”的哨兵距离
const NO_WALL = 9999;
// 小球与面板边缘保留的缝隙（px）
const WALL_GAP = 6;
// 底部（靠近输入区）额外保留的缝隙（px）：比侧边更大，给输入组件留足空间
const FLOOR_GAP = 16;
// 松手后的回弹静默期（ms）：略长于 dragSnapToOrigin 回弹时长，期间屏蔽点击、隐藏气泡
const SETTLE_MS = 420;

// 各方向撞墙的压扁形变：贴墙的一侧作为形变原点，垂直墙面的轴被压缩、平行轴被挤宽
const SQUASH_BY_SIDE: Record<OrbImpactSide, Record<string, number | number[]>> = {
  bottom: { originX: 0.5, originY: 1, scaleX: [1, 1.35, 0.95, 1], scaleY: [1, 0.65, 1.05, 1] },
  top: { originX: 0.5, originY: 0, scaleX: [1, 1.35, 0.95, 1], scaleY: [1, 0.65, 1.05, 1] },
  left: { originX: 0, originY: 0.5, scaleX: [1, 0.65, 1.05, 1], scaleY: [1, 1.35, 0.95, 1] },
  right: { originX: 1, originY: 0.5, scaleX: [1, 0.65, 1.05, 1], scaleY: [1, 1.35, 0.95, 1] },
};

/**
 * 可拖拽的 AI 小球 Orbie —— KunFlix 独立组件
 *
 * 在 AiOrb 外包裹 framer-motion 拖拽，构建“房间”物理感：
 * - 四周：以 boundsRef（AI 面板）为空间边界，拖到墙边即被硬挡住，
 *   撞墙瞬间朝对应方向压扁回弹，像撞到玻璃墙；
 * - 下方：额外受 barrierRef“地板”硬阻挡（优先于面板底边），拖到其顶边即停；
 * - 松手弹回原位（dragSnapToOrigin）；
 * - 碰撞瞬间通过 onImpact(side) 通知父级联动反馈（如地板震动）。
 * 拖拽过程中小球冒汗、眼睛变 >< 并弹出 NONONO 气泡。
 *
 * 拖拽与点击彻底隔离：一次手势内只要进入过拖拽，本次手势的 onTap / 气泡点击一律不触发，
 * 松手后还有一段回弹静默期（SETTLE_MS），避免松手瞬间误触提示词注入。
 */
export function DraggableOrb({
  size = 40,
  onTap,
  boundsRef,
  barrierRef,
  onImpact,
  bubble,
  onBubbleClick,
  className = '',
}: DraggableOrbProps) {
  const [phase, setPhase] = useState<OrbPhase>('idle');
  const [limits, setLimits] = useState({
    top: NO_WALL,
    left: NO_WALL,
    right: NO_WALL,
    bottom: NO_WALL,
  });
  // 气泡最大宽度：随面板宽度动态适配，防止溢出面板右边缘
  const [bubbleMaxWidth, setBubbleMaxWidth] = useState(220);
  const orbRef = useRef<HTMLDivElement>(null);
  const atWallRef = useRef({ top: false, left: false, right: false, bottom: false });
  // 本次手势是否已发生拖拽：按下时清零，拖拽启动时置位，用于在 pointerup 时否决轻点
  const draggedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const squash = useAnimationControls();
  const isDragging = phase === 'drag';

  // 测量小球静止位（扣除当前拖拽位移）到面板四壁 / 地板的距离 = 各方向可拖拽的最大位移
  useLayoutEffect(() => {
    const measure = () => {
      const orbRect = orbRef.current?.getBoundingClientRect();
      const wall = boundsRef?.current?.getBoundingClientRect();
      const barrier = barrierRef?.current?.getBoundingClientRect();
      const rest = orbRect && {
        left: orbRect.left - x.get(),
        right: orbRect.right - x.get(),
        top: orbRect.top - y.get(),
        bottom: orbRect.bottom - y.get(),
      };
      // 底边界：地板（预设按钮区）优先，其次面板底边
      const bottomEdge = barrier?.top ?? wall?.bottom;
      setLimits({
        top: rest && wall ? Math.max(0, rest.top - wall.top - WALL_GAP) : NO_WALL,
        left: rest && wall ? Math.max(0, rest.left - wall.left - WALL_GAP) : NO_WALL,
        right: rest && wall ? Math.max(0, wall.right - rest.right - WALL_GAP) : NO_WALL,
        bottom: rest && bottomEdge != null ? Math.max(0, bottomEdge - rest.bottom - FLOOR_GAP) : NO_WALL,
      });
      // 气泡可用宽度 = 面板右边缘 - 气泡左边（容器 58% 处）- 16px 安全间距
      if (orbRect && wall) {
        const restLeft = orbRect.left - x.get();
        setBubbleMaxWidth(Math.max(80, wall.right - (restLeft + size * 0.58) - 16));
      }
    };
    measure();
    // 面板入场动画（scale 0.95→1）期间 getBoundingClientRect 含缩放，测得的边界偏小；
    // ResizeObserver 不感知纯 transform 变化，需延迟复测一次校正
    const timer = setTimeout(measure, 350);
    const ro = new ResizeObserver(measure);
    orbRef.current && ro.observe(orbRef.current);
    boundsRef?.current && ro.observe(boundsRef.current);
    barrierRef?.current && ro.observe(barrierRef.current);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [boundsRef, barrierRef, x, y]);

  // 触发一次撞墙：朝对应方向压扁回弹 + 通知父级
  const handleImpact = (side: OrbImpactSide) => {
    onImpact?.(side);
    squash.start(SQUASH_BY_SIDE[side], {
      duration: 0.5,
      ease: 'easeOut',
      originX: { duration: 0 },
      originY: { duration: 0 },
    });
  };

  // 上升沿检测：抵达某面墙的瞬间触发一次碰撞，离开后复位以便下次再触发
  const checkWall = (side: OrbImpactSide, reached: boolean) => {
    reached && !atWallRef.current[side] && ((atWallRef.current[side] = true), handleImpact(side));
    !reached && (atWallRef.current[side] = false);
  };
  const hasWall = (limit: number) => limit > 0 && limit < NO_WALL;
  useMotionValueEvent(y, 'change', (v) => {
    checkWall('bottom', hasWall(limits.bottom) && v >= limits.bottom - 0.5);
    checkWall('top', hasWall(limits.top) && v <= -limits.top + 0.5);
  });
  useMotionValueEvent(x, 'change', (v) => {
    checkWall('right', hasWall(limits.right) && v >= limits.right - 0.5);
    checkWall('left', hasWall(limits.left) && v <= -limits.left + 0.5);
  });

  useEffect(() => () => {
    settleTimerRef.current && clearTimeout(settleTimerRef.current);
  }, []);

  // 新手势开始（小球或气泡上按下）：清零拖拽标记，本次手势重新判定是拖拽还是点击
  const handleGestureStart = () => {
    draggedRef.current = false;
    settleTimerRef.current && clearTimeout(settleTimerRef.current);
  };

  // 拖拽启动：标记本次手势为拖拽，其后的 pointerup 不再视为轻点
  const handleDragStart = () => {
    draggedRef.current = true;
    setPhase('drag');
  };

  // 松手：进入回弹静默期，期间气泡不显示、点击不响应，回弹结束后才恢复可交互
  const handleDragEnd = () => {
    setPhase('settle');
    settleTimerRef.current = setTimeout(() => setPhase('idle'), SETTLE_MS);
  };

  // 轻点 / 气泡点击的统一闸门：仅在未发生拖拽且已静止时放行，确保拖拽不会注入提示词
  const runIfTap = (handler?: () => void) => () => {
    !draggedRef.current && phase === 'idle' && handler?.();
  };

  const bubbleVisible = phase === 'idle' && !!bubble;

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <motion.div
        ref={orbRef}
        drag
        dragSnapToOrigin
        dragConstraints={{
          top: -limits.top,
          left: -limits.left,
          right: limits.right,
          bottom: limits.bottom,
        }}
        dragElastic={0}
        dragTransition={{ bounceStiffness: 450, bounceDamping: 12 }}
        whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
        whileTap={{ scale: 0.92 }}
        onPointerDown={handleGestureStart}
        onTap={runIfTap(onTap)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{ x, y, width: size, height: size, touchAction: 'none' }}
        className="cursor-grab outline-none"
      >
        <motion.div animate={squash} style={{ width: size, height: size }}>
          <AiOrb size={size} sweating={isDragging} talking={bubbleVisible} />
        </motion.div>
      </motion.div>

      {/* 对话气泡：渲染为拖拽元素的兄弟节点而非子级，指针事件与拖拽/轻点彻底解耦——
          点气泡只触发注入、不会误启动拖拽，拖拽也不会影响气泡点击；
          拖拽与回弹期间隐藏（由冒汗 NONONO 表情接管），文案切换时通过 key 重放弹出动画 */}
      {bubbleVisible && (
        <div
          key={bubble}
          onPointerDown={handleGestureStart}
          onClick={runIfTap(onBubbleClick)}
          className={`ai-orb-speech ${onBubbleClick ? 'pointer-events-auto cursor-pointer' : ''}`}
          style={{ fontSize: Math.max(13, size * 0.23), whiteSpace: 'pre-line', width: 'max-content', maxWidth: bubbleMaxWidth }}
        >
          {bubble}
        </div>
      )}
    </div>
  );
}
