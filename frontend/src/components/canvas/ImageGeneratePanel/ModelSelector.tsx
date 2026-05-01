'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PROVIDER_ICONS } from './constants';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import type { ImageModel } from '@/hooks/useImageGeneration';

interface FlatModelItem {
  key: string;
  model: ImageModel;
  providerType: string;
  providerName: string;
}

interface Props {
  selectedModelKey: string;
  selectedModel: ImageModel | null;
  flatModels: FlatModelItem[];
  modelsCount: number;
  modelsLoading: boolean;
  enabled: boolean;
  taskActive: boolean;
  onSelect: (key: string) => void;
}

export function ModelSelector({
  selectedModelKey,
  selectedModel,
  flatModels,
  modelsCount,
  modelsLoading,
  enabled,
  taskActive,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDropdownOutside([[open, ref, setOpen]]);

  const selectedProviderType = selectedModel?.provider_type || '';
  const selectedProviderLogo = PROVIDER_ICONS[selectedProviderType] || '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={modelsLoading || taskActive || !enabled}
        className={cn(
          'h-8 pl-2 pr-6 rounded-lg bg-transparent text-sm font-medium cursor-pointer inline-flex items-center gap-1.5',
          'hover:bg-primary/10 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          selectedModelKey ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {selectedProviderLogo && <img src={selectedProviderLogo} alt="" className="w-4 h-4 object-contain" />}
        {modelsLoading ? '...' : (selectedModel?.display_name || t('canvas.node.image.selectModel', '选择模型'))}
        <ChevronDown className={cn(
          'absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-transform duration-150',
          open && 'rotate-180',
        )} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
          {flatModels.map(({ key, model: m, providerType, providerName }) => {
            const logoSrc = PROVIDER_ICONS[providerType];
            const isSelected = key === selectedModelKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { onSelect(key); setOpen(false); }}
                title={providerName}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {logoSrc
                  ? <img src={logoSrc} alt="" className="w-4 h-4 object-contain shrink-0" />
                  : <span className="w-4 h-4 shrink-0" />}
                <span className="flex-1 text-left font-medium truncate">{m.display_name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
          {modelsCount === 0 && !modelsLoading && (
            <div className="p-3 text-[10px] text-muted-foreground text-center">
              {t('canvas.node.image.noImageProviders', '未找到图像供应商，请联系管理员配置')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
