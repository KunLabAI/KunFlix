"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssetItem } from "@/lib/resourceApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageViewState {
  scale: number;
  position: { x: number; y: number };
  isDragging: boolean;
}

interface RendererProps {
  asset: AssetItem;
  view: ImageViewState;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

// ---------------------------------------------------------------------------
// 预览渲染器映射表（避免 if-else）
// ---------------------------------------------------------------------------

function ImageFullPreview({ asset, view, onPointerDown, onPointerMove, onPointerUp }: RendererProps) {
  return (
    <img
      src={asset.url}
      alt={asset.original_name || asset.filename}
      className="max-w-[80vw] max-h-[75vh] object-contain rounded-lg select-none transition-transform duration-75 ease-out"
      style={{
        transform: `translate(${view.position.x}px, ${view.position.y}px) scale(${view.scale})`,
        cursor: view.isDragging ? "grabbing" : "grab",
      }}
      draggable={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function VideoFullPreview({ asset }: RendererProps) {
  return (
    <video
      src={asset.url}
      controls
      autoPlay
      className="max-w-[80vw] max-h-[75vh] rounded-lg"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function AudioFullPreview({ asset }: RendererProps) {
  return (
    <div
      className="flex flex-col items-center gap-6 p-8 bg-secondary/30 rounded-xl min-w-[360px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-primary border-b-[10px] border-b-transparent ml-1" />
        </div>
      </div>
      <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
        {asset.original_name || asset.filename}
      </span>
      <audio src={asset.url} controls autoPlay className="w-full" />
    </div>
  );
}

const FULL_PREVIEW_RENDERERS: Record<string, React.FC<RendererProps>> = {
  image: ImageFullPreview,
  video: VideoFullPreview,
  audio: AudioFullPreview,
};

// ---------------------------------------------------------------------------
// AssetPreviewDialog
// ---------------------------------------------------------------------------

interface AssetPreviewDialogProps {
  asset: AssetItem | null;
  /** 资产列表，用于左右切换；不传则不显示切换按钮 */
  assets?: AssetItem[];
  /** 切换到指定资产时的回调（更新外部 previewTarget） */
  onNavigate?: (asset: AssetItem) => void;
  onClose: () => void;
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 5;
const SCALE_STEP = 0.25;

export default function AssetPreviewDialog({ asset, assets, onNavigate, onClose }: AssetPreviewDialogProps) {
  const { t } = useTranslation();
  const Renderer = FULL_PREVIEW_RENDERERS[asset?.file_type ?? ""];
  const isImage = asset?.file_type === "image";

  // ----- 缩放/拖拽状态（仅图像有效） -----
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 切换 asset 时重置视图
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, [asset?.id]);

  // ----- 切换索引 -----
  const list = assets ?? [];
  const currentIndex = asset ? list.findIndex((a) => a.id === asset.id) : -1;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < list.length - 1;

  const goPrev = useCallback(() => {
    canPrev && onNavigate?.(list[currentIndex - 1]);
  }, [canPrev, currentIndex, list, onNavigate]);

  const goNext = useCallback(() => {
    canNext && onNavigate?.(list[currentIndex + 1]);
  }, [canNext, currentIndex, list, onNavigate]);

  const zoomIn = useCallback(() => setScale((p) => Math.min(SCALE_MAX, p + SCALE_STEP)), []);
  const zoomOut = useCallback(() => setScale((p) => Math.max(SCALE_MIN, p - SCALE_STEP)), []);

  // ----- 键盘快捷键：左右切换 + 上下缩放 -----
  useEffect(() => {
    if (!asset) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.key === "ArrowLeft" && (e.preventDefault(), goPrev());
      e.key === "ArrowRight" && (e.preventDefault(), goNext());
      isImage && e.key === "ArrowUp" && (e.preventDefault(), zoomIn());
      isImage && e.key === "ArrowDown" && (e.preventDefault(), zoomOut());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [asset, isImage, goPrev, goNext, zoomIn, zoomOut]);

  // ----- 滚轮缩放（仅图像）：window 级别监听 + 容器内目标校验 -----
  useEffect(() => {
    if (!asset || !isImage) return;
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Node | null;
      if (!target || !containerRef.current?.contains(target)) return;
      e.preventDefault();
      // 乘性缩放更符合人眼感知；指数补偿使不同设备 deltaY 表现一致
      setScale((prev) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        return Math.min(Math.max(SCALE_MIN, prev * factor), SCALE_MAX);
      });
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [asset, isImage]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !isImage) return;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isImage, position.x, position.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      isDragging && setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    },
    [isDragging],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // ----- 下载 -----
  const handleDownload = useCallback(async () => {
    if (!asset) return;
    const url = asset.url;
    const name = asset.original_name || asset.filename || "asset";
    const fallback = () => window.open(url, "_blank");
    try {
      const resp = await fetch(url, { mode: "cors" });
      if (!resp.ok) return fallback();
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const ext = (blob.type.split("/")[1] || "bin").split(";")[0];
      const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      fallback();
    }
  }, [asset]);

  const view: ImageViewState = { scale, position, isDragging };
  const showNav = list.length > 1 && currentIndex >= 0;

  return (
    <Dialog open={!!asset} onOpenChange={(open) => { open || onClose(); }}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[92vh] p-0 bg-transparent border-none shadow-none [&>button]:hidden flex items-center justify-center"
        onClick={onClose}
      >
        <DialogTitle className="sr-only">
          {asset?.original_name || asset?.filename || t("resources.preview.title", "Preview")}
        </DialogTitle>

        {/* Top-right controls */}
        <div
          className="absolute top-4 right-4 flex items-center gap-2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {isImage && (
            <>
              <div className="bg-black/50 text-white px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-md">
                {Math.round(scale * 100)}%
              </div>
              <Button
                variant="secondary"
                size="icon"
                className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
                onClick={zoomIn}
                title={t("canvas.node.preview.zoomIn", "Zoom in")}
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
                onClick={zoomOut}
                title={t("canvas.node.preview.zoomOut", "Zoom out")}
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
            onClick={handleDownload}
            title={t("canvas.node.preview.download", "Download")}
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
            onClick={onClose}
            title={t("canvas.node.preview.close", "Close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Main content area */}
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden p-8 pb-28"
          onClick={(e) => e.stopPropagation()}
        >
          {asset && Renderer && (
            <Renderer
              asset={asset}
              view={view}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          )}
        </div>

        {/* Bottom toolbar: prev/next pager + file info */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {showNav && (
            <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md text-white rounded-lg px-2 py-1.5 shadow-lg">
              <button
                disabled={!canPrev}
                className="h-8 w-8 flex items-center justify-center rounded text-white/90 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                onClick={goPrev}
                title={t("resources.preview.prev", "Previous")}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-white/80 px-2 tabular-nums min-w-[48px] text-center">
                {currentIndex + 1} / {list.length}
              </span>
              <button
                disabled={!canNext}
                className="h-8 w-8 flex items-center justify-center rounded text-white/90 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                onClick={goNext}
                title={t("resources.preview.next", "Next")}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="text-xs text-white/60 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full max-w-[80vw] truncate">
            {asset?.original_name || asset?.filename}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
