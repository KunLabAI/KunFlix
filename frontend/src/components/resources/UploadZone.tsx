"use client";

import React, { useRef, useState } from "react";
import { Upload, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResourceStore, UploadQueueItem } from "@/store/useResourceStore";

const STATUS_STYLES: Record<UploadQueueItem["status"], string> = {
  pending: "bg-muted-foreground",
  uploading: "bg-primary",
  done: "bg-green-500",
  error: "bg-destructive",
};

// 按类型的大小限制映射表（字节）
const SIZE_LIMITS: Record<string, number> = {
  image: 50 * 1024 * 1024,    // 50MB
  video: 500 * 1024 * 1024,   // 500MB
  audio: 100 * 1024 * 1024,   // 100MB
};
const SIZE_LABELS: Record<string, string> = { image: "50MB", video: "500MB", audio: "100MB" };
const MAX_SIZE_LABEL = "视频500MB / 音频100MB / 图片50MB";

// MIME 前缀 -> 类型（避免 if-else）
const MIME_TYPE_MAP: Record<string, string> = { "image/": "image", "video/": "video", "audio/": "audio" };
function deriveType(file: File): string {
  for (const [prefix, type] of Object.entries(MIME_TYPE_MAP)) {
    if (file.type.startsWith(prefix)) return type;
  }
  return "other";
}

export default function UploadZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadQueue, addUpload, removeUpload } = useResourceStore();

  const handleFiles = (files: FileList | null) => {
    setSizeError(null);
    const fileList = files ? Array.from(files) : [];

    const oversized: string[] = [];
    const valid: File[] = [];
    fileList.forEach((f) => {
      const type = deriveType(f);
      const limit = SIZE_LIMITS[type] ?? 50 * 1024 * 1024;
      const label = SIZE_LABELS[type] ?? "50MB";
      f.size <= limit
        ? valid.push(f)
        : oversized.push(`${f.name}（超出${label}限制）`);
    });

    oversized.length > 0 && setSizeError(`${oversized.join("、")}，已跳过`);
    valid.forEach(addUpload);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200",
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/50 bg-secondary/30 hover:border-primary/30 hover:bg-secondary/50"
        )}
      >
        <Upload className={cn("w-8 h-8 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground/50")} />
        <div className="text-sm text-muted-foreground">
          拖拽文件到这里或 <span className="text-primary font-medium">点击上传</span>
        </div>
        <div className="text-[11px] text-muted-foreground/60">
          支持 jpg, png, webp, gif, mp4, webm, mov, mp3, wav &middot; {MAX_SIZE_LABEL}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Size limit error */}
      {sizeError && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="text-xs flex-1">{sizeError}</span>
          <button onClick={() => setSizeError(null)} className="shrink-0 p-0.5 rounded hover:bg-destructive/10 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          {uploadQueue.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50 border border-border/30">
              <Loader2 className={cn("w-4 h-4 shrink-0", item.status === "uploading" && "animate-spin text-primary", item.status === "error" && "text-destructive")} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{item.file.name}</div>
                <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-300", STATUS_STYLES[item.status])} style={{ width: `${item.progress}%` }} />
                </div>
              </div>
              <button onClick={() => removeUpload(item.id)} className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
