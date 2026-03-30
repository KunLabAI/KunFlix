"use client";

import React, { useState, useRef } from "react";
import { Image as ImageIcon, Video, Music, File, MoreHorizontal, Pencil, Replace, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetItem } from "@/lib/resourceApi";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// 文件类型 -> 图标映射（避免 if-else）
const TYPE_ICONS: Record<string, React.ElementType> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
};

// 文件大小格式化
function formatSize(bytes: number | null): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes ?? 0;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Preview renderers (component map)
// ---------------------------------------------------------------------------

function ImagePreview({ url }: { url: string }) {
  return <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />;
}

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="relative w-full h-full bg-black/80">
      <video src={`${url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover opacity-60" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-white border-b-[5px] border-b-transparent ml-0.5" />
        </div>
      </div>
    </div>
  );
}

function AudioPreview({ url }: { url: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary/50 p-4">
      <Music className="w-10 h-10 text-muted-foreground/30" />
      <audio src={url} controls preload="metadata" className="w-full max-w-full h-8 [&::-webkit-media-controls-panel]:bg-transparent" />
    </div>
  );
}

function DefaultPreview() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-secondary/50">
      <File className="w-10 h-10 text-muted-foreground/30" />
    </div>
  );
}

const PREVIEW_RENDERERS: Record<string, React.FC<{ url: string }>> = {
  image: ImagePreview,
  video: VideoPreview,
  audio: AudioPreview,
};

// ---------------------------------------------------------------------------
// AssetCard
// ---------------------------------------------------------------------------

interface AssetCardProps {
  asset: AssetItem;
  onPreview: (asset: AssetItem) => void;
  onRename: (asset: AssetItem) => void;
  onReplace: (asset: AssetItem) => void;
  onDelete: (asset: AssetItem) => void;
}

export default function AssetCard({ asset, onPreview, onRename, onReplace, onDelete }: AssetCardProps) {
  const Icon = TYPE_ICONS[asset.file_type ?? ""] ?? File;
  const Renderer = PREVIEW_RENDERERS[asset.file_type ?? ""] ?? DefaultPreview;

  return (
    <div className="group relative rounded-xl border border-border/50 overflow-hidden bg-card hover:border-primary/30 transition-all duration-200">
      {/* Preview - clickable */}
      <div className="aspect-square overflow-hidden cursor-pointer" onClick={() => onPreview(asset)}>
        <Renderer url={asset.url} />
      </div>

      {/* Bottom info overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2.5 pt-6 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-white/70 shrink-0" />
          <span className="text-[11px] text-white font-medium truncate">
            {asset.original_name || asset.filename}
          </span>
        </div>
        <div className="text-[10px] text-white/50 mt-0.5">
          {formatSize(asset.size)}
        </div>
      </div>

      {/* Action menu */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-md bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5 text-white" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onRename(asset)}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> 重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReplace(asset)}>
              <Replace className="w-3.5 h-3.5 mr-2" /> 替换文件
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(asset)} className="text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
