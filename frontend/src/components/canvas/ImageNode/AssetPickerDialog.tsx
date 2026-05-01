'use client';

import React, { useEffect, useMemo } from 'react';
import { X, FolderOpen, Loader2, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResourceStore } from '@/store/useResourceStore';

interface Props {
  imageList: string[];
  maxImages: number;
  onSelect: (url: string) => void;
  onClose: () => void;
}

/**
 * 资产库选择弹窗：支持从资产库选择图片添加到多宫格
 */
export function AssetPickerDialog({ imageList, maxImages, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const assets = useResourceStore((s) => s.assets);
  const isLoading = useResourceStore((s) => s.isLoading);
  const imageAssets = useMemo(() => assets.filter(a => a.file_type === 'image'), [assets]);
  const slotsLeft = maxImages - imageList.length;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
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
            <FolderOpen className="w-4 h-4 text-node-green" />
            <span className="text-sm font-semibold">{t('canvas.node.upload.fromLibrary')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {t('canvas.node.upload.slotsLeft', { count: slotsLeft })}
            </span>
            <button
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && imageAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">{t('sidebar.noImages')}</span>
            </div>
          )}

          {!isLoading && imageAssets.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {imageAssets.map((asset) => {
                const alreadyAdded = imageList.includes(asset.url);
                const isDisabled = alreadyAdded || slotsLeft <= 0;
                return (
                  <button
                    key={asset.id}
                    disabled={isDisabled}
                    onClick={() => onSelect(asset.url)}
                    className={`relative group rounded-lg border overflow-hidden aspect-square transition-all ${
                      isDisabled
                        ? 'opacity-40 cursor-not-allowed border-border/30'
                        : 'border-border/50 hover:border-node-green/60 hover:ring-1 hover:ring-node-green/30 cursor-pointer'
                    }`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.original_name || asset.filename}
                      loading="lazy"
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                    {alreadyAdded && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {t('canvas.node.upload.alreadyAdded')}
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
    </div>
  );
}
