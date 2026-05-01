'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

// ── Shape types ─────────────────────────────────────────────────────────────

export type AnnotationTool = 'pen' | 'text' | 'eraser';

export interface StrokeShape {
  type: 'stroke';
  id: string;
  points: number[]; // flat [x1,y1,x2,y2,...] in image natural coordinates
  color: string;
  strokeWidth: number;
}

export interface TextShape {
  type: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export type AnnotationShape = StrokeShape | TextShape;

interface HistoryFrame {
  shapes: AnnotationShape[];
}

const MAX_HISTORY = 50;

const PRESET_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];

const genId = () => `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 标注画板状态：图形栈 + 撤销/重做 + 工具/样式参数。
 * 与 useCanvasStore 完全独立，避免污染节点画布历史。
 */
export function useAnnotationState() {
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [tool, setTool] = useState<AnnotationTool>('pen');
  const [color, setColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [fontSize, setFontSize] = useState<number>(24);

  const historyRef = useRef<HistoryFrame[]>([{ shapes: [] }]);
  const historyIndexRef = useRef<number>(0);
  // 镜像状态供渲染使用（避免在渲染期间访问 ref.current）
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [historyLength, setHistoryLength] = useState<number>(1);

  const pushHistory = useCallback((next: AnnotationShape[]) => {
    const idx = historyIndexRef.current;
    const trimmed = historyRef.current.slice(0, idx + 1);
    trimmed.push({ shapes: next });
    trimmed.length > MAX_HISTORY && trimmed.shift();
    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
    setHistoryIndex(trimmed.length - 1);
    setHistoryLength(trimmed.length);
  }, []);

  const commitShapes = useCallback((next: AnnotationShape[]) => {
    setShapes(next);
    pushHistory(next);
  }, [pushHistory]);

  // ── Pen drawing ──────────────────────────────────────────────────────────
  const drawingRef = useRef<StrokeShape | null>(null);

  const beginStroke = useCallback((x: number, y: number) => {
    const s: StrokeShape = {
      type: 'stroke',
      id: genId(),
      points: [x, y],
      color,
      strokeWidth,
    };
    drawingRef.current = s;
    setShapes((prev) => [...prev, s]);
  }, [color, strokeWidth]);

  const extendStroke = useCallback((x: number, y: number) => {
    const s = drawingRef.current;
    s && (() => {
      s.points = [...s.points, x, y];
      setShapes((prev) => prev.map((sh) => (sh.id === s.id ? { ...s } : sh)));
    })();
  }, []);

  const endStroke = useCallback(() => {
    const s = drawingRef.current;
    s && (() => {
      drawingRef.current = null;
      // commit current shapes snapshot to history
      setShapes((prev) => {
        pushHistory(prev);
        return prev;
      });
    })();
  }, [pushHistory]);

  // ── Text ────────────────────────────────────────────────────────────────
  const addText = useCallback((x: number, y: number, text: string) => {
    text.trim() === '' && (() => {})();
    if (text.trim() === '') return;
    const t: TextShape = {
      type: 'text',
      id: genId(),
      x,
      y,
      text,
      color,
      fontSize,
    };
    setShapes((prev) => {
      const next = [...prev, t];
      pushHistory(next);
      return next;
    });
  }, [color, fontSize, pushHistory]);

  const updateText = useCallback((id: string, patch: Partial<Omit<TextShape, 'type' | 'id'>>) => {
    setShapes((prev) => {
      const next = prev.map((sh) => (sh.id === id && sh.type === 'text' ? { ...sh, ...patch } : sh));
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  // ── Eraser: hit any shape, remove it ────────────────────────────────────
  const eraseAt = useCallback((id: string) => {
    setShapes((prev) => {
      const next = prev.filter((sh) => sh.id !== id);
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  // ── Undo / Redo / Clear ─────────────────────────────────────────────────
  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    idx > 0 && (() => {
      historyIndexRef.current = idx - 1;
      setShapes(historyRef.current[idx - 1].shapes);
      setHistoryIndex(idx - 1);
    })();
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const frames = historyRef.current;
    idx < frames.length - 1 && (() => {
      historyIndexRef.current = idx + 1;
      setShapes(frames[idx + 1].shapes);
      setHistoryIndex(idx + 1);
    })();
  }, []);

  const clear = useCallback(() => {
    shapes.length > 0 && commitShapes([]);
  }, [shapes.length, commitShapes]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;
  const isDirty = useMemo(() => shapes.length > 0, [shapes.length]);

  return {
    // state
    shapes,
    tool,
    color,
    strokeWidth,
    fontSize,
    canUndo,
    canRedo,
    isDirty,
    presetColors: PRESET_COLORS,
    // setters
    setTool,
    setColor,
    setStrokeWidth,
    setFontSize,
    // ops
    beginStroke,
    extendStroke,
    endStroke,
    addText,
    updateText,
    eraseAt,
    undo,
    redo,
    clear,
  };
}

export type AnnotationStateApi = ReturnType<typeof useAnnotationState>;
