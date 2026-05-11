'use client';

import React, { useEffect, useMemo } from 'react';
import { X, FolderOpen, Loader2, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResourceStore } from '@/store/useResourceStore';

interface Props {
  currentUrl: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

/**
 * 资产库选择弹窗：支持从资产库选择音频
 */
export function AssetPickerDialog({ currentUrl, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const assets = useResourceStore((s) => s.assets);
  const isLoading = useResourceStore((s) => s.isLoading);
  const audioAssets = useMemo(() => assets.filter((a) => a.file_type === 'audio'), [assets]);

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
        className="bg-background border border-border/50 rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-node-purple" />
            <span className="text-sm font-semibold">{t('canvas.node.upload.fromLibrary')}</span>
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

          {!isLoading && audioAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Music className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">{t('sidebar.noAudios', '暂无音频资产')}</span>
            </div>
          )}

          {!isLoading && audioAssets.length > 0 && (
            <div className="flex flex-col gap-2">
              {audioAssets.map((asset) => {
                const isSelected = currentUrl === asset.url;
                return (
                  <button
                    key={asset.id}
                    disabled={isSelected}
                    onClick={() => onSelect(asset.url)}
                    className={`relative group rounded-lg border transition-all px-3 py-2 flex items-center gap-3 text-left ${
                      isSelected
                        ? 'opacity-40 cursor-not-allowed border-border/30'
                        : 'border-border/50 hover:border-node-purple/60 hover:ring-1 hover:ring-node-purple/30 cursor-pointer'
                    }`}
                  >
                    <Music className="w-4 h-4 text-node-purple shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {asset.original_name || asset.filename}
                      </div>
                      <audio
                        src={asset.url}
                        controls
                        preload="none"
                        className="w-full h-7 mt-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                        {t('canvas.node.upload.alreadyAdded')}
                      </span>
                    )}
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
