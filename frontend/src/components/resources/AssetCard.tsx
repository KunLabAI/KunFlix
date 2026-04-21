"use client";

import React from "react";
import { motion } from "framer-motion";
import { Image as ImageIcon, Video, Music, File, MoreHorizontal, Pencil, Replace, Trash2, ExternalLink, Check } from "lucide-react";
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

// 文件类型颜色映射
const TYPE_COLORS: Record<string, string> = {
  image: "text-node-green bg-node-green/10",
  video: "text-node-yellow bg-node-yellow/10",
  audio: "text-node-blue bg-node-blue/10",
};

// 文件大小格式化
function formatSize(bytes: number | null): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes ?? 0;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// 日期格式化
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
  viewMode?: "grid" | "list";
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (asset: AssetItem) => void;
  onPreview: (asset: AssetItem) => void;
  onRename: (asset: AssetItem) => void;
  onReplace: (asset: AssetItem) => void;
  onDelete: (asset: AssetItem) => void;
  /** data-attribute id for rubber-band hit testing */
  "data-asset-id"?: string;
}

export default function AssetCard({ asset, viewMode = "grid", selectable, selected, onToggleSelect, onPreview, onRename, onReplace, onDelete, ...rest }: AssetCardProps) {
  const Icon = TYPE_ICONS[asset.file_type ?? ""] ?? File;
  const Renderer = PREVIEW_RENDERERS[asset.file_type ?? ""] ?? DefaultPreview;
  const typeColorClass = TYPE_COLORS[asset.file_type ?? ""] ?? "text-muted-foreground bg-secondary";

  // 选择模式下：点击卡片切换选中状态
  const handleCardClick = () => {
    selectable ? onToggleSelect?.(asset) : onPreview(asset);
  };

  // 列表视图
  const listView = viewMode === "list";
  const wrapperProps = { "data-asset-id": rest["data-asset-id"] ?? asset.id };

  return listView ? (
    <motion.div
      whileHover={selectable ? undefined : { x: 4 }}
      {...wrapperProps}
      className={cn(
        "group flex items-center gap-4 p-3 rounded-xl border bg-card transition-all duration-200",
        selectable ? "cursor-pointer select-none" : "hover:shadow-sm",
        selected ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/30"
      )}
      onClick={selectable ? handleCardClick : undefined}
    >
      {/* Selection checkbox (always visible in selection mode) */}
      {selectable && (
        <div
          className={cn(
            "shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
            selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
          )}
        >
          {selected && <Check className="w-3 h-3" />}
        </div>
      )}
      {/* Thumbnail */}
      <div
        className={cn("w-16 h-16 rounded-lg overflow-hidden bg-secondary shrink-0", !selectable && "cursor-pointer")}
        onClick={selectable ? undefined : () => onPreview(asset)}
      >
        <Renderer url={asset.url} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">
            {asset.original_name || asset.filename}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className={cn("px-2 py-0.5 rounded-full", typeColorClass)}>
            {asset.file_type === "image" && "图片"}
            {asset.file_type === "video" && "视频"}
            {asset.file_type === "audio" && "音频"}
            {!asset.file_type && "文件"}
          </span>
          <span>{formatSize(asset.size)}</span>
          <span>{formatDate(asset.created_at)}</span>
        </div>
      </div>

      {/* Actions - hidden in selection mode */}
      {!selectable && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onPreview(asset)}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="预览"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onRename(asset)}>
                <Pencil className="w-4 h-4 mr-2" /> 重命名
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReplace(asset)}>
                <Replace className="w-4 h-4 mr-2" /> 替换文件
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(asset)} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </motion.div>
  ) : (
    /* 网格视图 */
    <div
      {...wrapperProps}
      className={cn(
        "group relative rounded-xl border overflow-hidden bg-card transition-all duration-200",
        selectable ? "cursor-pointer select-none" : "hover:shadow-lg",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border/50 hover:border-primary/30"
      )}
      onClick={selectable ? handleCardClick : undefined}
    >
      {/* Selection checkbox - always visible in selection mode */}
      {selectable && (
        <div
          className={cn(
            "absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-white/70 bg-black/30 backdrop-blur-sm"
          )}
        >
          {selected && <Check className="w-3 h-3" />}
        </div>
      )}
      {/* Preview area */}
      <div
        className={cn("aspect-square overflow-hidden", !selectable && "cursor-pointer")}
        onClick={selectable ? undefined : () => onPreview(asset)}
      >
        <Renderer url={asset.url} />
      </div>

      {/* Bottom info overlay - hidden in selection mode */}
      {!selectable && (
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
      )}

      {/* Action menu - hidden in selection mode */}
      {!selectable && (
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
      )}
    </div>
  );
}
