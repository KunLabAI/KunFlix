"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Layers, Image as ImageIcon, Video, Music,
  LayoutGrid, List, FolderOpen, Loader2, Upload, X, AlertCircle,
  Search, Filter, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useResourceStore, FileTypeFilter } from "@/store/useResourceStore";
import { AssetItem } from "@/lib/resourceApi";
import AssetCard from "@/components/resources/AssetCard";
import AssetEditDialog from "@/components/resources/AssetEditDialog";
import AssetDeleteDialog from "@/components/resources/AssetDeleteDialog";
import AssetPreviewDialog from "@/components/resources/AssetPreviewDialog";

// 筛选标签配置
const FILTER_TABS: { key: FileTypeFilter; label: string; icon: React.ElementType; color: string }[] = [
  { key: "all", label: "全部", icon: Layers, color: "text-foreground" },
  { key: "image", label: "图片", icon: ImageIcon, color: "text-node-green" },
  { key: "video", label: "视频", icon: Video, color: "text-node-yellow" },
  { key: "audio", label: "音频", icon: Music, color: "text-node-blue" },
];

// 视图模式配置
const VIEW_MODES = [
  { key: "grid", icon: LayoutGrid, label: "网格" },
  { key: "list", icon: List, label: "列表" },
];

// 文件类型颜色映射
const TYPE_COLORS: Record<string, string> = {
  image: "border-node-green/30 hover:border-node-green/60",
  video: "border-node-yellow/30 hover:border-node-yellow/60",
  audio: "border-node-blue/30 hover:border-node-blue/60",
};

// 上传状态样式
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted-foreground",
  uploading: "bg-primary",
  done: "bg-node-green",
  error: "bg-destructive",
};

export default function ResourcesPage() {
  const router = useRouter();
  const {
    assets, total, isLoading, hasMore, typeFilter, uploadQueue,
    fetchAssets, loadMore, setTypeFilter, addUpload, removeUpload,
  } = useResourceStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 编辑/删除/预览 dialog 状态
  const [editTarget, setEditTarget] = useState<{ asset: AssetItem; mode: "rename" | "replace" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AssetItem | null>(null);

  // 首次加载
  useEffect(() => { fetchAssets(); }, []);

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => { entry.isIntersecting && hasMore && !isLoading && loadMore(); },
      { rootMargin: "200px" }
    );
    el && obs.observe(el);
    return () => { el && obs.unobserve(el); };
  }, [hasMore, isLoading, loadMore]);

  // 文件处理
  const SIZE_LIMITS: Record<string, number> = {
    image: 50 * 1024 * 1024,
    video: 500 * 1024 * 1024,
    audio: 100 * 1024 * 1024,
  };
  const SIZE_LABELS: Record<string, string> = { image: "50MB", video: "500MB", audio: "100MB" };
  const MIME_TYPE_MAP: Record<string, string> = { "image/": "image", "video/": "video", "audio/": "audio" };

  const deriveType = (file: File): string => {
    for (const [prefix, type] of Object.entries(MIME_TYPE_MAP)) {
      if (file.type.startsWith(prefix)) return type;
    }
    return "other";
  };

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

  // 过滤资源
  const filteredAssets = assets.filter((asset) => {
    const matchesType = typeFilter === "all" || asset.file_type === typeFilter;
    const matchesSearch = !searchQuery || 
      (asset.original_name || asset.filename).toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // 事件处理
  const handlePreview = useCallback((asset: AssetItem) => setPreviewTarget(asset), []);
  const handleRename = useCallback((asset: AssetItem) => setEditTarget({ asset, mode: "rename" }), []);
  const handleReplace = useCallback((asset: AssetItem) => setEditTarget({ asset, mode: "replace" }), []);
  const handleDelete = useCallback((asset: AssetItem) => setDeleteTarget(asset), []);

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Row */}
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/")}
                className="p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold">我的资源库</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  管理和组织您的创作素材
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                {total} 个资源
              </span>
            </div>

            {/* Search - Desktop */}
            <div className="hidden md:flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索资源..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "w-64 h-9 pl-9 pr-4 text-sm rounded-lg",
                    "bg-secondary/50 border border-border",
                    "placeholder:text-muted-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                    "transition-all"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Bottom Row - Filters */}
          <div className="flex items-center justify-between pb-4 gap-4">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-xl">
              {FILTER_TABS.map((tab) => {
                const isActive = typeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setTypeFilter(tab.key)}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all",
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <tab.icon className={cn("w-4 h-4", isActive && tab.color)} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeFilter"
                        className="absolute inset-0 bg-background rounded-lg shadow-sm -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
              {VIEW_MODES.map((mode) => {
                const isActive = viewMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    onClick={() => setViewMode(mode.key as "grid" | "list")}
                    className={cn(
                      "p-2 rounded-md transition-all",
                      isActive 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={mode.label}
                  >
                    <mode.icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "relative flex flex-col items-center justify-center gap-4 py-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 overflow-hidden",
              isDragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border/50 bg-secondary/30 hover:border-primary/30 hover:bg-secondary/50"
            )}
          >
            {/* Background Gradient */}
            <div className={cn(
              "absolute inset-0 bg-gradient-to-br from-node-purple/5 via-transparent to-node-blue/5 transition-opacity duration-300",
              isDragOver ? "opacity-100" : "opacity-0"
            )} />

            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300",
                isDragOver 
                  ? "bg-primary/10 scale-110" 
                  : "bg-secondary"
              )}>
                <Upload className={cn(
                  "w-8 h-8 transition-colors",
                  isDragOver ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div className="text-center">
                <p className="text-base font-medium text-foreground mb-1">
                  {isDragOver ? "释放以上传文件" : "拖拽文件到这里上传"}
                </p>
                <p className="text-sm text-muted-foreground">
                  或 <span className="text-primary font-medium">点击选择文件</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground/60">
                支持 JPG, PNG, WebP, GIF, MP4, WebM, MOV, MP3, WAV · 最大 500MB
              </p>
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
          <AnimatePresence>
            {sizeError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-start gap-2.5 mt-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-sm flex-1">{sizeError}</span>
                <button 
                  onClick={() => setSizeError(null)} 
                  className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Queue */}
          <AnimatePresence>
            {uploadQueue.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-2"
              >
                {uploadQueue.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/50 border border-border/30"
                  >
                    <Loader2 className={cn(
                      "w-5 h-5 shrink-0",
                      item.status === "uploading" && "animate-spin text-primary",
                      item.status === "error" && "text-destructive"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.file.name}</div>
                      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <motion.div
                          className={cn("h-full rounded-full", STATUS_STYLES[item.status])}
                          initial={{ width: 0 }}
                          animate={{ width: `${item.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                    <button 
                      onClick={() => removeUpload(item.id)} 
                      className="shrink-0 p-2 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Asset Grid / List */}
        {filteredAssets.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                : "flex flex-col gap-3"
            )}
          >
            <AnimatePresence mode="popLayout">
              {filteredAssets.map((asset, index) => (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.03 }}
                  layout
                >
                  <AssetCard
                    asset={asset}
                    viewMode={viewMode}
                    onPreview={handlePreview}
                    onRename={handleRename}
                    onReplace={handleReplace}
                    onDelete={handleDelete}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-muted-foreground"
            >
              <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6">
                <FolderOpen className="w-12 h-12 opacity-30" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {searchQuery ? "未找到匹配的资源" : "资源库为空"}
              </h3>
              <p className="text-sm text-center max-w-sm mb-6">
                {searchQuery 
                  ? "尝试使用其他关键词搜索，或清除筛选条件" 
                  : "拖拽文件到上方区域，或点击上传按钮添加您的第一个资源"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  上传文件
                </button>
              )}
            </motion.div>
          )
        )}

        {/* Loading / Infinite scroll sentinel */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={sentinelRef} className="h-4" />
      </div>

      {/* Dialogs */}
      <AssetPreviewDialog
        asset={previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <AssetEditDialog
        asset={editTarget?.asset ?? null}
        mode={editTarget?.mode ?? null}
        onClose={() => setEditTarget(null)}
      />
      <AssetDeleteDialog
        asset={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </main>
  );
}
