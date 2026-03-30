"use client";

import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AssetItem } from "@/lib/resourceApi";
import { useResourceStore } from "@/store/useResourceStore";

interface Props {
  asset: AssetItem | null;
  mode: "rename" | "replace" | null;
  onClose: () => void;
}

export default function AssetEditDialog({ asset, mode, onClose }: Props) {
  const [name, setName] = useState(asset?.original_name || asset?.filename || "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { renameAsset, replaceAssetFile } = useResourceStore();

  // 同步资产变化
  React.useEffect(() => {
    setName(asset?.original_name || asset?.filename || "");
    setFile(null);
  }, [asset]);

  const handleSubmit = async () => {
    const id = asset?.id;
    id || onClose();
    setLoading(true);
    try {
      mode === "rename" && id && await renameAsset(id, name);
      mode === "replace" && id && file && await replaceAssetFile(id, file);
      onClose();
    } catch (err) {
      console.error("Asset update failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<string, string> = { rename: "重命名", replace: "替换文件" };

  return (
    <Dialog open={!!asset && !!mode} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[mode ?? "rename"]}</DialogTitle>
          <DialogDescription>
            {mode === "rename" ? "修改资源的显示名称" : "上传新文件替换当前资源"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "rename" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入新名称"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          )}

          {mode === "replace" && (
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-medium hover:file:bg-primary/20 cursor-pointer"
              />
              {file && <div className="text-xs text-muted-foreground">已选择: {file.name}</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (mode === "rename" && !name.trim()) || (mode === "replace" && !file)}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {loading ? "保存中..." : "确定"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
