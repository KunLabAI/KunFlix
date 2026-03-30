"use client";

import React from "react";
import { X, Download } from "lucide-react";
import { AssetItem } from "@/lib/resourceApi";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// 预览渲染器映射表（避免 if-else）
// ---------------------------------------------------------------------------

function ImageFullPreview({ asset }: { asset: AssetItem }) {
  return (
    <img
      src={asset.url}
      alt={asset.original_name || asset.filename}
      className="max-w-full max-h-[80vh] object-contain rounded-lg"
    />
  );
}

function VideoFullPreview({ asset }: { asset: AssetItem }) {
  return (
    <video
      src={asset.url}
      controls
      autoPlay
      className="max-w-full max-h-[80vh] rounded-lg"
    />
  );
}

function AudioFullPreview({ asset }: { asset: AssetItem }) {
  return (
    <div className="flex flex-col items-center gap-6 p-8 bg-secondary/30 rounded-xl min-w-[360px]">
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

const FULL_PREVIEW_RENDERERS: Record<string, React.FC<{ asset: AssetItem }>> = {
  image: ImageFullPreview,
  video: VideoFullPreview,
  audio: AudioFullPreview,
};

// ---------------------------------------------------------------------------
// AssetPreviewDialog
// ---------------------------------------------------------------------------

interface AssetPreviewDialogProps {
  asset: AssetItem | null;
  onClose: () => void;
}

export default function AssetPreviewDialog({ asset, onClose }: AssetPreviewDialogProps) {
  const Renderer = FULL_PREVIEW_RENDERERS[asset?.file_type ?? ""];

  return (
    <Dialog open={!!asset} onOpenChange={(open) => { open || onClose(); }}>
      <DialogContent className="max-w-[90vw] w-auto p-0 bg-transparent border-none shadow-none [&>button]:hidden">
        <DialogTitle className="sr-only">{asset?.original_name || asset?.filename || "预览"}</DialogTitle>
        <div className="relative flex flex-col items-center gap-3">
          {/* Top bar */}
          <div className="flex items-center gap-2 self-end">
            <a
              href={asset?.url}
              download={asset?.original_name || asset?.filename}
              className="p-2 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="w-4 h-4 text-white" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Content */}
          {asset && Renderer && <Renderer asset={asset} />}

          {/* File info */}
          <div className="text-xs text-white/60 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
            {asset?.original_name || asset?.filename}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
