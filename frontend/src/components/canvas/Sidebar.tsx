import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  VectorSquare, Plus, ScrollText, Image as ImageIcon, Video, 
  Table2, GripVertical, Film, ImagePlus, Music, ExternalLink, Loader2, Headphones
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resourceApi, AssetItem } from '@/lib/resourceApi';

const NODE_TYPES = [
  { 
    type: 'text', 
    nameKey: 'sidebar.textCard', 
    descKey: 'sidebar.textDesc',
    icon: ScrollText, 
    color: 'text-node-blue', 
    bg: 'bg-node-blue/10',
    titleKey: 'canvas.node.newTextCard',
    data: { content: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] },
    dimensions: { width: 420, height: 320 }
  },
  { 
    type: 'image', 
    nameKey: 'sidebar.imageCard', 
    descKey: 'sidebar.imageDesc',
    icon: ImageIcon, 
    color: 'text-node-green', 
    bg: 'bg-node-green/10',
    titleKey: 'canvas.node.newImageCard',
    data: { description: '' },
    dimensions: { width: 512, height: 384 }
  },
  { 
    type: 'video', 
    nameKey: 'sidebar.videoCard', 
    descKey: 'sidebar.videoDesc',
    icon: Video, 
    color: 'text-node-yellow', 
    bg: 'bg-node-yellow/10',
    titleKey: 'canvas.node.newVideoCard',
    data: { description: '' },
    dimensions: { width: 512, height: 384 }
  },
  { 
    type: 'audio', 
    nameKey: 'sidebar.audioCard', 
    descKey: 'sidebar.audioDesc',
    icon: Headphones, 
    color: 'text-amber-500', 
    bg: 'bg-amber-500/10',
    titleKey: 'canvas.node.newAudioCard',
    data: { description: '' },
    dimensions: { width: 360, height: 200 }
  },
  { 
    type: 'storyboard', 
    nameKey: 'sidebar.storyboardCard', 
    descKey: 'sidebar.storyboardDesc',
    icon: Table2, 
    color: 'text-node-purple', 
    bg: 'bg-node-purple/10',
    titleKey: 'canvas.node.storyboardCard',
    data: { shotNumber: '01', duration: 3, description: '', pivotConfig: { rows: [], cols: [], values: [] } },
    dimensions: { width: 768, height: 512 }
  },
];

// 拖拽数据映射表：资产类型 -> 画布节点类型 + 数据结构
const DRAG_DATA_BUILDERS: Record<string, (asset: { url: string; name: string }) => { nodeType: string; data: Record<string, unknown> }> = {
  image: (a) => ({ nodeType: 'image', data: { name: a.name, imageUrl: a.url } }),
  video: (a) => ({ nodeType: 'video', data: { name: a.name, videoUrl: a.url } }),
  audio: (a) => ({ nodeType: 'audio', data: { name: a.name, audioUrl: a.url } }),
};

// 资产标签tab配置
const ASSET_TABS = [
  { key: 'images' as const, labelKey: 'sidebar.images', icon: ImagePlus, activeColor: 'text-node-green' },
  { key: 'videos' as const, labelKey: 'sidebar.videos', icon: Film, activeColor: 'text-node-yellow' },
  { key: 'audio' as const, labelKey: 'sidebar.audio', icon: Headphones, activeColor: 'text-amber-500' },
];

// 空状态配置
const EMPTY_STATE_CONFIG: Record<string, { icon: React.ElementType; labelKey: string }> = {
  images: { icon: ImagePlus, labelKey: 'sidebar.noImages' },
  videos: { icon: Film, labelKey: 'sidebar.noVideos' },
  audio: { icon: Headphones, labelKey: 'sidebar.noAudio' },
};

// Tab key -> API file_type 映射
const TAB_TYPE_MAP: Record<string, string> = { images: 'image', videos: 'video', audio: 'audio' };
const PAGE_SIZE = 20;

interface TabState {
  items: AssetItem[];
  page: number;
  total: number;
  loading: boolean;
  hasMore: boolean;
}

const INIT_TAB: TabState = { items: [], page: 0, total: 0, loading: false, hasMore: true };

export const Sidebar = () => {
  const { t } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeAssetTab, setActiveAssetTab] = useState<'images' | 'videos' | 'audio'>('images');
  let timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 每个 tab 独立分页状态
  const [tabData, setTabData] = useState<Record<string, TabState>>({
    images: { ...INIT_TAB }, videos: { ...INIT_TAB }, audio: { ...INIT_TAB },
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabDataRef = useRef(tabData);
  tabDataRef.current = tabData;

  // 加载指定 tab 的下一页（通过 ref 读取最新状态，避免闭包陈旧值）
  const loadPage = useCallback(async (tab: string) => {
    const snap = tabDataRef.current[tab];
    // 已在加载或无更多数据
    if (snap.loading || !snap.hasMore) return;

    setTabData(prev => ({ ...prev, [tab]: { ...prev[tab], loading: true } }));

    const nextPage = snap.page + 1;
    try {
      const res = await resourceApi.listAssets(nextPage, PAGE_SIZE, TAB_TYPE_MAP[tab]);
      setTabData(prev => {
        const s = prev[tab];
        const existingIds = new Set(s.items.map(a => a.id));
        const newItems = res.items.filter(a => !existingIds.has(a.id));
        const merged = [...s.items, ...newItems];
        return { ...prev, [tab]: { items: merged, page: nextPage, total: res.total, loading: false, hasMore: merged.length < res.total } };
      });
    } catch {
      setTabData(prev => ({ ...prev, [tab]: { ...prev[tab], loading: false } }));
    }
  }, []);

  // 面板打开 / 切换 tab 时，自动加载首页
  useEffect(() => {
    if (activeMenu !== 'assets') return;
    const s = tabDataRef.current[activeAssetTab];
    s.page === 0 && !s.loading && loadPage(activeAssetTab);
  }, [activeMenu, activeAssetTab, loadPage]);

  // 面板关闭时重置所有 tab 数据
  useEffect(() => {
    activeMenu !== 'assets' && setTabData({ images: { ...INIT_TAB }, videos: { ...INIT_TAB }, audio: { ...INIT_TAB } });
  }, [activeMenu]);

  // 滚动到底部时加载更多
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    nearBottom && loadPage(activeAssetTab);
  }, [activeAssetTab, loadPage]);

  const curTab = tabData[activeAssetTab];
  const ASSET_IMAGES = tabData.images.items;
  const ASSET_VIDEOS = tabData.videos.items;
  const ASSET_AUDIO = tabData.audio.items;
  const isLoading = curTab.loading && curTab.items.length === 0;

  const handleMouseEnter = (menu: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveMenu(menu);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, data?: any, initialDimensions?: {width: number, height: number}) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    data && event.dataTransfer.setData('application/reactflow-data', JSON.stringify(data));
    initialDimensions && event.dataTransfer.setData('application/reactflow-dimensions', JSON.stringify(initialDimensions));
    event.dataTransfer.effectAllowed = 'move';

    // Create semi-transparent custom drag image
    const dragPreview = document.createElement('div');
    dragPreview.className = 'px-4 py-2 bg-background/80 backdrop-blur border border-primary/50 text-foreground rounded-md shadow-none flex items-center gap-2';
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    dragPreview.style.opacity = '0.7';
    dragPreview.innerHTML = `
      <div class="w-4 h-4 rounded-sm bg-primary/20"></div>
      <span class="text-sm font-medium">${t('sidebar.dropToAdd')}</span>
    `;
    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 0, 0);

    // Cleanup drag image
    setTimeout(() => {
      document.body.contains(dragPreview) && document.body.removeChild(dragPreview);
    }, 0);
  };

  // 获取带国际化标题的节点数据
  const getNodeDataWithType = (nodeType: string) => {
    const nodeConfig = NODE_TYPES.find(n => n.type === nodeType);
    if (!nodeConfig) return {};
    
    const title = t(nodeConfig.titleKey || 'canvas.node.unnamedTextCard');
    const baseData = nodeConfig.data || {};
    
    // text 节点使用 title 字段，其他节点使用 name 字段
    if (nodeType === 'text') {
      return { ...baseData, title };
    }
    return { ...baseData, name: title };
  };

  const onAssetDragStart = (event: React.DragEvent, asset: { file_type: string | null; url: string; original_name: string | null; filename: string }) => {
    const builder = DRAG_DATA_BUILDERS[asset.file_type ?? ''];
    const name = asset.original_name || asset.filename;
    const info = builder?.({ url: asset.url, name }) ?? { nodeType: 'text', data: { title: name } };
    onDragStart(event, info.nodeType, info.data);
  };

  return (
    <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50">
      <div 
        className="flex flex-col gap-2 p-1.5 rounded-xl bg-background border border-border/50 shadow-none"
        onMouseLeave={handleMouseLeave}
      >
        {/* Node Library Button */}
        <div 
          className="relative"
          onMouseEnter={() => handleMouseEnter('nodes')}
        >
          <button className={cn(
            "w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors duration-200 shadow-none",
            activeMenu === 'nodes' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}>
            <VectorSquare className="w-4 h-4" />
          </button>
          
          {/* Node Library Panel */}
          <div className={cn(
            "absolute left-full top-0 ml-4 w-60 bg-background border border-border/50 rounded-xl p-2 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-none",
            activeMenu === 'nodes' 
              ? "opacity-100 translate-x-0 pointer-events-auto" 
              : "opacity-0 -translate-x-2 pointer-events-none"
          )}>
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 pt-1">{t('sidebar.addNode')}</div>
            <div className="flex flex-col gap-1">
              {NODE_TYPES.map((node) => (
                <div
                  key={node.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type, getNodeDataWithType(node.type), node.dimensions)}
                  className="group flex items-start gap-3 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-secondary transition-colors"
                >
                  <div className={cn("p-1.5 rounded-md mt-0.5", node.bg)}>
                    <node.icon className={cn("w-4 h-4", node.color)} />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground">{t(node.nameKey)}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 leading-snug opacity-80">{t(node.descKey)}</span>
                  </div>
                  <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Asset Library Button */}
        <div 
          className="relative"
          onMouseEnter={() => handleMouseEnter('assets')}
        >
          <button className={cn(
            "w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors duration-200 shadow-none",
            activeMenu === 'assets' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}>
            <Plus className="w-4 h-4" />
          </button>
          
          {/* Asset Library Panel */}
          <div className={cn(
            "absolute left-full top-0 ml-4 w-72 bg-background border border-border/50 rounded-xl p-3 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-none flex flex-col gap-3",
            activeMenu === 'assets' 
              ? "opacity-100 translate-x-0 pointer-events-auto" 
              : "opacity-0 -translate-x-2 pointer-events-none"
          )}>
            
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
              {ASSET_TABS.map((tab) => (
                <button 
                  key={tab.key}
                  onClick={() => setActiveAssetTab(tab.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all",
                    activeAssetTab === tab.key ? `bg-background ${tab.activeColor} shadow-sm` : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div ref={scrollRef} onScroll={handleScroll} className="max-h-[300px] min-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              
              {/* Loading state - 首次加载 */}
              {isLoading && (
                <div className="flex items-center justify-center min-h-[280px]">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Image Tab */}
              {!isLoading && activeAssetTab === 'images' && (
                <div className="grid grid-cols-2 gap-2">
                  {ASSET_IMAGES.length > 0 ? ASSET_IMAGES.map((asset) => (
                    <div 
                      key={asset.id} 
                      draggable
                      onDragStart={(e) => onAssetDragStart(e, asset)}
                      className="group relative rounded-lg border border-border/50 overflow-hidden cursor-grab active:cursor-grabbing bg-secondary/50 hover:border-node-green/50 transition-colors h-[80px] flex items-center justify-center"
                    >
                      <img 
                        src={asset.url} 
                        alt={asset.original_name || asset.filename} 
                        loading="lazy"
                        draggable={false}
                        className="w-full h-full object-contain p-1"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm p-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
                        <span className="text-[10px] text-white font-medium truncate block">{asset.original_name || asset.filename}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-2 flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 border-dashed">
                      <ImagePlus className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-xs">{t('sidebar.noImages')}</span>
                    </div>
                  )}
                  {curTab.loading && curTab.items.length > 0 && (
                    <div className="col-span-2 flex justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {/* Video Tab */}
              {!isLoading && activeAssetTab === 'videos' && (
                <div className="grid grid-cols-2 gap-2">
                  {ASSET_VIDEOS.length > 0 ? ASSET_VIDEOS.map((asset) => (
                    <div 
                      key={asset.id} 
                      draggable
                      onDragStart={(e) => onAssetDragStart(e, asset)}
                      className="group relative rounded-lg border border-border/50 overflow-hidden cursor-grab active:cursor-grabbing bg-secondary/50 hover:border-node-yellow/50 transition-colors h-[80px] flex items-center justify-center bg-black/80"
                    >
                      <video 
                        src={asset.url}
                        className="w-full h-full object-cover opacity-50"
                        preload="metadata"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                          <div className="w-0 h-0 border-t-3 border-t-transparent border-l-4 border-l-white border-b-3 border-b-transparent ml-0.5"></div>
                        </div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm p-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
                        <span className="text-[10px] text-white font-medium truncate block">{asset.original_name || asset.filename}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-2 flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 border-dashed">
                      <Film className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-xs">{t('sidebar.noVideos')}</span>
                    </div>
                  )}
                  {curTab.loading && curTab.items.length > 0 && (
                    <div className="col-span-2 flex justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {/* Audio Tab */}
              {!isLoading && activeAssetTab === 'audio' && (
                <div className="flex flex-col gap-2">
                  {ASSET_AUDIO.length > 0 ? ASSET_AUDIO.map((asset) => (
                    <div 
                      key={asset.id} 
                      draggable
                      onDragStart={(e) => onAssetDragStart(e, asset)}
                      className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/50 cursor-grab active:cursor-grabbing bg-secondary/50 hover:border-node-blue/50 transition-colors"
                    >
                      <div className="p-1.5 rounded-md bg-node-blue/10 shrink-0">
                        <Music className="w-4 h-4 text-node-blue" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium text-foreground truncate">{asset.original_name || asset.filename}</span>
                        <audio src={asset.url} preload="none" controls className="w-full h-6 mt-1 [&::-webkit-media-controls-panel]:bg-transparent" />
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 border-dashed">
                      <Music className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-xs">{t('sidebar.noMusic')}</span>
                    </div>
                  )}
                  {curTab.loading && curTab.items.length > 0 && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* 管理资产链接 */}
            <a
              href="/resources"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-secondary/50"
            >
              <ExternalLink className="w-3 h-3" />
              {t('sidebar.manageResources')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
