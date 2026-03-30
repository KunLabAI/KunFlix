"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Layers, Image as ImageIcon, Video, Music,
  Grid, List, FolderOpen, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useResourceStore, FileTypeFilter } from "@/store/useResourceStore";
import { AssetItem } from "@/lib/resourceApi";
import UploadZone from "@/components/resources/UploadZone";
import AssetCard from "@/components/resources/AssetCard";
import AssetEditDialog from "@/components/resources/AssetEditDialog";
import AssetDeleteDialog from "@/components/resources/AssetDeleteDialog";
import AssetPreviewDialog from "@/components/resources/AssetPreviewDialog";

// ---------------------------------------------------------------------------
// 类型筛选 tab 配置（映射表）
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FileTypeFilter; label: string; icon: React.ElementType }[] = [
  { key: "all", label: "全部", icon: Layers },
  { key: "image", label: "图片", icon: ImageIcon },
  { key: "video", label: "视频", icon: Video },
  { key: "audio", label: "音频", icon: Music },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResourcesPage() {
  const router = useRouter();
  const {
    assets, total, isLoading, hasMore, typeFilter,
    fetchAssets, loadMore, setTypeFilter,
  } = useResourceStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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

  const handlePreview = useCallback((asset: AssetItem) => setPreviewTarget(asset), []);
  const handleRename = useCallback((asset: AssetItem) => setEditTarget({ asset, mode: "rename" }), []);
  const handleReplace = useCallback((asset: AssetItem) => setEditTarget({ asset, mode: "replace" }), []);
  const handleDelete = useCallback((asset: AssetItem) => setDeleteTarget(asset), []);

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/10">
        <div className="w-full max-w-[1440px] mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">我的资源库</h1>
            <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">
              {total} 个资源
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Type filter tabs */}
            <div className="flex items-center gap-0.5 p-1 bg-secondary/50 rounded-lg">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTypeFilter(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    typeFilter === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-0.5 p-1 bg-secondary/50 rounded-lg">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "grid" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* Upload zone */}
        <UploadZone />

        {/* Asset grid / list */}
        {assets.length > 0 ? (
          <div className={cn(
            viewMode === "grid"
              ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
              : "flex flex-col gap-2"
          )}>
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onPreview={handlePreview}
                onRename={handleRename}
                onReplace={handleReplace}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          !isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mb-3 opacity-20" />
              <span className="text-sm font-medium">暂无资源</span>
              <span className="text-xs mt-1 opacity-60">上传您的第一个文件开始使用</span>
            </div>
          )
        )}

        {/* Loading / Infinite scroll sentinel */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={sentinelRef} className="h-1" />
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
