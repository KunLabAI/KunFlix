"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { AssetItem, resourceApi } from "@/lib/resourceApi";
import { cn } from "@/lib/utils";
import { useResourceStore } from "@/store/useResourceStore";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 每批删除的数量 */
const BATCH_CHUNK_SIZE = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  asset: AssetItem | null;
  /** 批量删除模式：传入待删除的 ID 列表 */
  batchIds?: string[];
  onClose: () => void;
}

type DeletePhase = "confirm" | "progress" | "done" | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetDeleteDialog({ asset, batchIds, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const { deleteAsset, fetchAssets } = useResourceStore();
  const { t } = useTranslation();

  // 批量删除进度状态
  const [phase, setPhase] = useState<DeletePhase>("confirm");
  const [progress, setProgress] = useState({ current: 0, total: 0, deleted: 0 });

  const isBatch = batchIds && batchIds.length > 0;
  const isOpen = isBatch ? batchIds.length > 0 : !!asset;
  const isLargeBatch = isBatch && batchIds.length > BATCH_CHUNK_SIZE;

  // 重置状态
  const resetState = useCallback(() => {
    setPhase("confirm");
    setProgress({ current: 0, total: 0, deleted: 0 });
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    // 删除进行中不允许关闭
    phase === "progress" || (() => {
      resetState();
      onClose();
    })();
  }, [phase, resetState, onClose]);

  // 单个删除
  const handleSingleDelete = async () => {
    setLoading(true);
    try {
      asset?.id && await deleteAsset(asset.id);
      onClose();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // 批量分片删除
  const handleBatchDelete = useCallback(async () => {
    const ids = batchIds ?? [];
    const total = ids.length;

    // 小批量直接走一次请求
    const useChunked = total > BATCH_CHUNK_SIZE;
    setPhase(useChunked ? "progress" : "progress");
    setProgress({ current: 0, total, deleted: 0 });

    // 乐观更新：先从 UI 移除
    const idSet = new Set(ids);
    useResourceStore.setState((s) => ({
      assets: s.assets.filter((a) => !idSet.has(a.id)),
      total: Math.max(0, s.total - total),
    }));

    let totalDeleted = 0;
    let hasError = false;

    // 分片执行
    const chunks: string[][] = [];
    for (let i = 0; i < total; i += BATCH_CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + BATCH_CHUNK_SIZE));
    }

    for (let i = 0; i < chunks.length; i++) {
      try {
        const res = await resourceApi.batchDeleteAssets(chunks[i]);
        totalDeleted += res.deleted;
      } catch {
        hasError = true;
      }
      setProgress({ current: Math.min((i + 1) * BATCH_CHUNK_SIZE, total), total, deleted: totalDeleted });
    }

    // 完成
    hasError ? setPhase("error") : setPhase("done");
    setProgress(prev => ({ ...prev, deleted: totalDeleted }));

    // 刷新列表确保数据一致
    hasError && fetchAssets();
  }, [batchIds, fetchAssets]);

  const handleConfirm = () => {
    isBatch ? handleBatchDelete() : handleSingleDelete();
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // 确认阶段
  const confirmContent = (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          {isBatch ? t("resources.batchDeleteTitle") : t("resources.deleteTitle")}
        </DialogTitle>
        <DialogDescription>
          {isBatch
            ? t("resources.batchDeleteDesc", { count: batchIds!.length })
            : t("resources.deleteDesc")}
        </DialogDescription>
      </DialogHeader>

      <div className="py-3">
        {isBatch ? (
          <div className="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
            <span className="text-sm font-medium">
              {t("resources.batchDeleteCount", { count: batchIds!.length })}
            </span>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
            <span className="text-sm font-medium">{asset?.original_name || asset?.filename}</span>
          </div>
        )}
      </div>

      <DialogFooter>
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
        >
          {t("resources.cancel")}
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {loading ? t("resources.deleting") : t("resources.confirmDelete")}
        </button>
      </DialogFooter>
    </>
  );

  // 进度阶段
  const progressContent = (
    <div className="flex flex-col items-center gap-5 py-6">
      <Loader2 className="w-10 h-10 text-destructive animate-spin" />
      <div className="w-full space-y-3">
        <div className="text-center text-sm font-medium">
          {t("resources.deleteProgress", { current: progress.current, total: progress.total })}
        </div>
        <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-destructive"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
        <div className="text-center text-xs text-muted-foreground">{progressPercent}%</div>
      </div>
    </div>
  );

  // 完成阶段
  const doneContent = (
    <div className="flex flex-col items-center gap-4 py-6">
      <CheckCircle2 className="w-10 h-10 text-green-500" />
      <p className="text-sm font-medium text-center">
        {t("resources.deleteComplete", { count: progress.deleted })}
      </p>
      <button
        onClick={handleClose}
        className="px-6 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t("resources.confirmDelete") === t("resources.confirmDelete") ? "OK" : "OK"}
      </button>
    </div>
  );

  // 错误阶段
  const errorContent = (
    <div className="flex flex-col items-center gap-4 py-6">
      <AlertCircle className="w-10 h-10 text-destructive" />
      <p className="text-sm font-medium text-center">
        {t("resources.deleteFailed", { deleted: progress.deleted, total: progress.total })}
      </p>
      <button
        onClick={handleClose}
        className="px-6 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        OK
      </button>
    </div>
  );

  // 阶段 -> 内容映射
  const PHASE_CONTENT: Record<DeletePhase, React.ReactNode> = {
    confirm: confirmContent,
    progress: progressContent,
    done: doneContent,
    error: errorContent,
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { !open && handleClose(); }}
    >
      <DialogContent
        className={cn(
          "sm:max-w-md",
          phase === "progress" && "[&>button:last-child]:hidden"
        )}
        onPointerDownOutside={(e) => { phase === "progress" && e.preventDefault(); }}
        onEscapeKeyDown={(e) => { phase === "progress" && e.preventDefault(); }}
      >
        {PHASE_CONTENT[phase]}
      </DialogContent>
    </Dialog>
  );
}
