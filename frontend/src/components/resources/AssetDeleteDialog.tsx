"use client";

import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { AssetItem } from "@/lib/resourceApi";
import { useResourceStore } from "@/store/useResourceStore";

interface Props {
  asset: AssetItem | null;
  onClose: () => void;
}

export default function AssetDeleteDialog({ asset, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const { deleteAsset } = useResourceStore();

  const handleDelete = async () => {
    const id = asset?.id;
    id || onClose();
    setLoading(true);
    try {
      id && await deleteAsset(id);
      onClose();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!asset} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            确认删除
          </DialogTitle>
          <DialogDescription>
            此操作将永久删除该资源文件，且无法恢复。
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          <div className="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
            <span className="text-sm font-medium">{asset?.original_name || asset?.filename}</span>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {loading ? "删除中..." : "确认删除"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
