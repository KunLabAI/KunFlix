'use client';

import React, { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { RefreshCw, FileText, Settings2, Info, Wrench, Edit3, Image as ImageIcon, Video, Music, ArrowRight } from 'lucide-react';
import { useToolRegistry, useImageCapabilities, useVideoCapabilities, useToolConfig, useUpdateToolConfig } from '@/hooks/useToolRegistry';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { ImageGenToolConfigData, VideoGenToolConfigData, MusicGenToolConfigData, ToolProviderInfo } from '@/types';
import ImageGenConfigDialog from '@/components/admin/tools/ImageGenConfigDialog';
import VideoGenConfigDialog from '@/components/admin/tools/VideoGenConfigDialog';
import MusicGenConfigDialog from '@/components/admin/tools/MusicGenConfigDialog';
import { useVirtualizer } from '@tanstack/react-virtual';

// ---------------------------------------------------------------------------
// BatchBar Component
// ---------------------------------------------------------------------------
interface BatchBarProps {
  isLoading: boolean;
  onRefresh: () => void;
}

const BatchBar: React.FC<BatchBarProps> = ({ isLoading, onRefresh }) => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-between items-center mb-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('tools.title')}</h2>
        <p className="text-muted-foreground mt-2">{t('tools.subtitle')}</p>
      </div>
      <div className="flex gap-2">
        <Link href="/admin/tools/logs">
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" /> {t('tools.logsBtn')}
          </Button>
        </Link>
        <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> {t('tools.refresh')}
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ToolCard Component
// ---------------------------------------------------------------------------
interface ToolCardProps {
  provider: ToolProviderInfo;
  onOpenDetail: (provider: ToolProviderInfo) => void;
  onEdit: (provider: ToolProviderInfo) => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ provider, onOpenDetail, onEdit }) => {
  const { t } = useTranslation();
  const hasImageGen = provider.tools.some(t => t.name === 'generate_image');
  const hasVideoGen = provider.tools.some(t => t.name === 'generate_video');
  const hasMusicGen = provider.tools.some(t => t.name === 'generate_music');
  const hasGenerationTool = hasImageGen || hasVideoGen || hasMusicGen;

  return (
    <div 
      className="group relative flex flex-col rounded-xl bg-background border border-border cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/50"
      onClick={() => onOpenDetail(provider)}
      role="button"
      tabIndex={0}
    >
      {/* 顶部强调线 */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* 卡片主体 */}
      <div className="p-5 flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-4">
          <div className="overflow-hidden">
            <h3 className="font-semibold text-lg leading-tight text-foreground mb-2 truncate" title={provider.display_name}>
              {provider.display_name}
            </h3>
            <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md border border-border/50">
              {provider.provider_name}
            </span>
          </div>
          <div
            className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-secondary/80 text-secondary-foreground text-sm font-bold"
            title={t('tools.card.toolCountTitle', { count: provider.tools.length })}
          >
            {provider.tools.length}
          </div>
        </div>
      </div>

      {/* 底部操作区 */}
      <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between transition-colors duration-300 group-hover:bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
          {t('tools.card.viewDetail')}
          <ArrowRight className="w-3 h-3 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
        </span>
        
        {hasGenerationTool && (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 px-2.5 text-xs opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(provider);
            }}
          >
            <Settings2 className="w-3 h-3 mr-1.5" />
            {t('tools.card.configBtn')}
          </Button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CardGrid Component
// ---------------------------------------------------------------------------
interface CardGridProps {
  registry: ToolProviderInfo[];
  onOpenDetail: (provider: ToolProviderInfo) => void;
  onEdit: (provider: ToolProviderInfo) => void;
}

const CardGrid: React.FC<CardGridProps> = ({ registry, onOpenDetail, onEdit }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  // 假设卡片高度约为 140px
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(registry.length / 3),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140 + 24, // height + gap
    overscan: 5,
  });

  const isVirtual = registry.length >= 100;

  if (isVirtual) {
    // 虚拟化渲染
    return (
      <div ref={parentRef} style={{ height: '800px', overflow: 'auto' }}>
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * 3;
            const items = registry.slice(startIndex, startIndex + 3);
            return (
              <div
                key={virtualRow.index}
                className="absolute top-0 left-0 w-full p-3"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '1.5rem',
                }}
              >
                {items.map((provider) => (
                  <ToolCard 
                    key={provider.provider_name} 
                    provider={provider} 
                    onOpenDetail={onOpenDetail}
                    onEdit={onEdit}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 常规网格渲染
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
      {registry.map((provider) => (
        <ToolCard 
          key={provider.provider_name} 
          provider={provider} 
          onOpenDetail={onOpenDetail}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function ToolsPage() {
  const { t } = useTranslation();
  const { registry, isLoading: regLoading } = useToolRegistry();
  const { activeProviders } = useLLMProviders();
  const { capabilities: imageCapabilities } = useImageCapabilities();
  const { capabilities: videoCapabilities } = useVideoCapabilities();
  const { config: imageToolConfig, mutate: refreshImageToolConfig } = useToolConfig('generate_image');
  const { config: videoToolConfig, mutate: refreshVideoToolConfig } = useToolConfig('generate_video');
  const { config: musicToolConfig, mutate: refreshMusicToolConfig } = useToolConfig('generate_music');
  const { updateConfig } = useUpdateToolConfig();

  // Dialog 状态
  const [imageConfigDialogOpen, setImageConfigDialogOpen] = useState(false);
  const [videoConfigDialogOpen, setVideoConfigDialogOpen] = useState(false);
  const [musicConfigDialogOpen, setMusicConfigDialogOpen] = useState(false);
  const [detailProvider, setDetailProvider] = useState<ToolProviderInfo | null>(null);

  const isLoading = regLoading;

  const imageGenConfig: ImageGenToolConfigData | undefined = imageToolConfig?.config as ImageGenToolConfigData;
  const videoGenConfig: VideoGenToolConfigData | undefined = videoToolConfig?.config as VideoGenToolConfigData;
  const musicGenConfig: MusicGenToolConfigData | undefined = musicToolConfig?.config as MusicGenToolConfigData;

  const handleSaveImageConfig = async (config: ImageGenToolConfigData) => {
    await updateConfig('generate_image', { config });
  };

  const handleSaveVideoConfig = async (config: VideoGenToolConfigData) => {
    await updateConfig('generate_video', { config });
  };

  const handleSaveMusicConfig = async (config: MusicGenToolConfigData) => {
    await updateConfig('generate_music', { config });
  };

  const handleEdit = (provider: ToolProviderInfo) => {
    // 简化的编辑逻辑：根据 provider 包含的生成类工具类型弹出对应的配置
    const hasImageGen = provider.tools.some(t => t.name === 'generate_image');
    const hasVideoGen = provider.tools.some(t => t.name === 'generate_video');
    const hasMusicGen = provider.tools.some(t => t.name === 'generate_music');

    if (hasImageGen) setImageConfigDialogOpen(true);
    else if (hasVideoGen) setVideoConfigDialogOpen(true);
    else if (hasMusicGen) setMusicConfigDialogOpen(true);
    else {
      // 默认弹出详情作为备用
      setDetailProvider(provider);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full pb-8">
      <BatchBar 
        isLoading={isLoading} 
        onRefresh={() => window.location.reload()} 
      />

      {isLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <CardGrid 
          registry={registry || []} 
          onOpenDetail={setDetailProvider}
          onEdit={handleEdit}
        />
      )}

      {/* 配置 Dialogs */}
      <ImageGenConfigDialog
        open={imageConfigDialogOpen}
        onOpenChange={setImageConfigDialogOpen}
        onSaved={() => refreshImageToolConfig()}
        providers={activeProviders || []}
        imageCapabilities={imageCapabilities}
        initialConfig={imageGenConfig}
        onSaveConfig={handleSaveImageConfig}
      />

      <VideoGenConfigDialog
        open={videoConfigDialogOpen}
        onOpenChange={setVideoConfigDialogOpen}
        onSaved={() => refreshVideoToolConfig()}
        providers={activeProviders || []}
        videoCapabilities={videoCapabilities}
        initialConfig={videoGenConfig}
        onSaveConfig={handleSaveVideoConfig}
      />

      <MusicGenConfigDialog
        open={musicConfigDialogOpen}
        onOpenChange={setMusicConfigDialogOpen}
        onSaved={() => refreshMusicToolConfig()}
        providers={activeProviders || []}
        initialConfig={musicGenConfig}
        onSaveConfig={handleSaveMusicConfig}
      />

      {/* 优化的详情弹窗 */}
      <Dialog open={!!detailProvider} onOpenChange={(open) => { if (!open) setDetailProvider(null); }}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">{detailProvider?.display_name}</DialogTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {t('tools.detail.providerId')}: <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{detailProvider?.provider_name}</code>
                </div>
              </div>
            </div>
            <DialogDescription className="text-base mt-4">
              {detailProvider?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
              <span className="text-sm text-muted-foreground block mb-1">{t('tools.detail.enableCondition')}</span>
              <span className="text-sm font-medium">{detailProvider?.condition || t('tools.detail.noCondition')}</span>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                {t('tools.detail.includedTools', { count: detailProvider?.tools.length ?? 0 })}
              </h4>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
                {detailProvider?.tools.map((tool) => (
                  <div key={tool.name} className="flex flex-col gap-1 p-3 rounded-md bg-muted/50 border border-border/50 hover:bg-muted/80 transition-colors">
                    <code className="text-sm font-mono font-semibold text-primary">{tool.name}</code>
                    {tool.description && (
                      <span className="text-xs text-muted-foreground leading-relaxed">{tool.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
