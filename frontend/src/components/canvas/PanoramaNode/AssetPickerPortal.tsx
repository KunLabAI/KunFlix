'use client';

import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Loader2, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResourceStore } from '@/store/useResourceStore';

interface Props {
  open: boolean;
  currentUrl: string | null | undefined;
  onSelect: (url: string) => void;
  onClose: () => void;
}

/**
 * 全景节点的资产库选择弹窗（单图选择，简化版）。
 * 资产类型与图片节点共用 image，由用户自行判断是否为等距柱状全景图。
 */
export function AssetPickerPortal({ open, currentUrl, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const assets = useResourceStore((s) => s.assets);
  const isLoading = useResourceStore((s) => s.isLoading);
  const imageAssets = useMemo(() => assets.filter(a => a.file_type === 'image'), [assets]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border/50 rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden shadow-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-cyan-500" />
            <span className="text-sm font-semibold">{t('canvas.node.upload.fromLibrary', '从资产库选择')}</span>
          </div>
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && imageAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Globe className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">{t('sidebar.noImages', '暂无图片资产')}</span>
            </div>
          )}

          {!isLoading && imageAssets.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {imageAssets.map((asset) => {
                const isCurrent = currentUrl === asset.url;
                return (
                  <button
                    key={asset.id}
                    disabled={isCurrent}
                    onClick={() => { onSelect(asset.url); onClose(); }}
                    className={`relative group rounded-lg border overflow-hidden aspect-[2/1] transition-all ${
                      isCurrent
                        ? 'opacity-40 cursor-not-allowed border-border/30'
                        : 'border-border/50 hover:border-cyan-500/60 hover:ring-1 hover:ring-cyan-500/30 cursor-pointer'
                    }`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.original_name || asset.filename}
                      loading="lazy"
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                    {isCurrent && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {t('canvas.node.upload.alreadyAdded', '已选择')}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm p-1 translate-y-full group-hover:translate-y-0 transition-transform">
                      <span className="text-[10px] text-white font-medium truncate block">
                        {asset.original_name || asset.filename}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
