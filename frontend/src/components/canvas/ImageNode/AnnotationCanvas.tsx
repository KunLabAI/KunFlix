'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as StageType } from 'konva/lib/Stage';
import type { AnnotationStateApi, TextShape } from '@/hooks/useAnnotationState';

export interface AnnotationCanvasHandle {
  getMergedDataURL: (pixelRatio?: number) => string | null;
  getNaturalSize: () => { width: number; height: number } | null;
}

interface Props {
  url: string;
  api: AnnotationStateApi;
  /** 可视区域尺寸（在父级提供 contain 适配） */
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * 加载远端图片为 HTMLImageElement（带 crossOrigin），返回 [image, error]。
 */
function useImageElement(src: string): { image: HTMLImageElement | null; error: string | null } {
  const [state, setState] = useState<{ image: HTMLImageElement | null; error: string | null; src: string }>({
    image: null,
    error: null,
    src: '',
  });

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { cancelled || setState({ image: img, error: null, src }); };
    img.onerror = () => { cancelled || setState({ image: null, error: 'Failed to load image', src }); };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  // 当 src 变化但新图未加载完成时，返回空以避免显示旧图
  const stale = state.src !== src;
  return {
    image: stale ? null : state.image,
    error: stale ? null : state.error,
  };
}

/**
 * Konva 画板：底图（KonvaImage）+ 涂鸦层 + 文字层。
 * - 内部坐标系基于图像原始分辨率（保证保存合成的清晰度）
 * - 外部 contain 适配通过 Stage scale + size 实现
 */
const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(function AnnotationCanvas(
  { url, api, viewportWidth, viewportHeight },
  ref,
) {
  const stageRef = useRef<StageType | null>(null);
  const { image, error } = useImageElement(url);

  // 文字编辑：双击文字进入 textarea；新增文本：点击空白
  const [editingText, setEditingText] = useState<{ id: string | null; x: number; y: number; value: string } | null>(null);

  // 计算 contain 缩放与偏移
  const naturalW = image?.naturalWidth || 0;
  const naturalH = image?.naturalHeight || 0;
  const scale = (naturalW > 0 && naturalH > 0)
    ? Math.min(viewportWidth / naturalW, viewportHeight / naturalH)
    : 1;
  const stageW = naturalW * scale;
  const stageH = naturalH * scale;

  useImperativeHandle(ref, () => ({
    getMergedDataURL: (pixelRatio = 2) => {
      const stage = stageRef.current;
      if (!stage || !naturalW || !naturalH) return null;
      // 使用 1/scale 把 stage 还原回原图分辨率，再乘以 pixelRatio 提升清晰度
      return stage.toDataURL({
        pixelRatio: (1 / scale) * pixelRatio,
        mimeType: 'image/png',
      });
    },
    getNaturalSize: () => (naturalW && naturalH ? { width: naturalW, height: naturalH } : null),
  }), [naturalW, naturalH, scale]);

  // ── Pointer handlers (in stage local coords, then divided by scale → image coords) ──
  const toImageCoords = (e: KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return { x: p.x / scale, y: p.y / scale };
  };

  const isDrawingRef = useRef(false);

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const target = e.target;
    const isOnText = target.getClassName() === 'Text';
    const isOnLine = target.getClassName() === 'Line';

    // Eraser: hit any shape → remove
    if (api.tool === 'eraser') {
      const id = (target.attrs as { id?: string })?.id;
      id && (isOnText || isOnLine) && api.eraseAt(id);
      return;
    }

    if (api.tool === 'pen') {
      const p = toImageCoords(e);
      p && (() => {
        isDrawingRef.current = true;
        api.beginStroke(p.x, p.y);
      })();
      return;
    }

    // text 模式由 onStageClick 处理（兼容性更好），此处不重复
  };

  const onStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (api.tool !== 'text') return;
    // 编辑期间点击其它位置先提交当前编辑（由 textarea 的 onBlur 触发），随后再创建新文本
    if (editingText) return;
    const target = e.target;
    const isOnText = target.getClassName() === 'Text';
    if (isOnText) {
      const id = (target.attrs as { id?: string })?.id;
      const shape = api.shapes.find((s) => s.id === id) as TextShape | undefined;
      shape && setEditingText({ id: shape.id, x: shape.x * scale, y: shape.y * scale, value: shape.text });
      return;
    }
    const p = toImageCoords(e);
    p && setEditingText({ id: null, x: p.x * scale, y: p.y * scale, value: '' });
  };

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    if (!isDrawingRef.current || api.tool !== 'pen') return;
    const p = toImageCoords(e);
    p && api.extendStroke(p.x, p.y);
  };

  const onPointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    api.endStroke();
  };

  const commitEditingText = () => {
    if (!editingText) return;
    const ix = editingText.x / scale;
    const iy = editingText.y / scale;
    const trimmed = editingText.value;
    if (editingText.id) {
      trimmed.trim() === ''
        ? api.eraseAt(editingText.id)
        : api.updateText(editingText.id, { text: trimmed });
    } else {
      trimmed.trim() !== '' && api.addText(ix, iy, trimmed);
    }
    setEditingText(null);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/70">
        图片加载失败（可能是跨域限制）
      </div>
    );
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/70">
        加载中…
      </div>
    );
  }

  return (
    <div
      className="relative"
      style={{ width: stageW, height: stageH, cursor: api.tool === 'pen' ? 'crosshair' : api.tool === 'text' ? 'text' : 'cell' }}
    >
      <Stage
        ref={(node: Konva.Stage | null) => {
          stageRef.current = node;
        }}
        width={stageW}
        height={stageH}
        scale={{ x: scale, y: scale }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseDown={onPointerDown as unknown as (e: KonvaEventObject<MouseEvent>) => void}
        onClick={onStageClick as unknown as (e: KonvaEventObject<MouseEvent>) => void}
        onTap={onStageClick as unknown as (e: KonvaEventObject<TouchEvent>) => void}
      >
        {/* 底图层：保持监听（listening 默认 true），让 Stage 在整张图区域都能稳定收到事件；KonvaImage 自身作为命中目标但不影响形状层。 */}
        <Layer>
          <KonvaImage image={image} width={naturalW} height={naturalH} />
        </Layer>
        <Layer>
          {api.shapes.map((s) =>
            s.type === 'stroke' ? (
              <Line
                key={s.id}
                id={s.id}
                points={s.points}
                stroke={s.color}
                strokeWidth={s.strokeWidth}
                tension={0.4}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation="source-over"
                hitStrokeWidth={Math.max(s.strokeWidth + 8, 12)}
              />
            ) : (
              <KonvaText
                key={s.id}
                id={s.id}
                x={s.x}
                y={s.y}
                text={s.text}
                fill={s.color}
                fontSize={s.fontSize}
                fontStyle="bold"
                shadowColor="rgba(0,0,0,0.6)"
                shadowBlur={2}
                shadowOffset={{ x: 1, y: 1 }}
                draggable={api.tool === 'text'}
                onDragEnd={(e) => {
                  api.updateText(s.id, { x: e.target.x(), y: e.target.y() });
                }}
              />
            ),
          )}
        </Layer>
      </Stage>

      {editingText && (
        <textarea
          autoFocus
          value={editingText.value}
          onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
          onBlur={commitEditingText}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            (e.key === 'Enter' && !e.shiftKey) && (e.preventDefault(), commitEditingText());
            e.key === 'Escape' && (e.preventDefault(), setEditingText(null));
          }}
          className="absolute z-50 outline-none border border-primary/60 bg-black/60 text-white p-1 rounded resize"
          style={{
            left: editingText.x,
            top: editingText.y,
            minWidth: 80,
            minHeight: 28,
            fontSize: api.fontSize * scale,
            color: api.color,
            fontWeight: 'bold',
          }}
        />
      )}
    </div>
  );
});

export default AnnotationCanvas;
