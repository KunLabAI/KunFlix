import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Layers, Plus, ScrollText, Image as ImageIcon, Video, 
  Table2, GripVertical, File, Film, ImagePlus, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanvasStore, CharacterNodeData, VideoNodeData } from '@/store/useCanvasStore';

const NODE_TYPES = [
  { 
    type: 'text', 
    name: '文本卡', 
    description: '剧本、广告等文案',
    icon: ScrollText, 
    color: 'text-node-blue', 
    bg: 'bg-node-blue/10',
    data: { title: '新文本卡', content: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] }
  },
  { 
    type: 'image', 
    name: '图片卡', 
    description: '角色、场景、海报等',
    icon: ImageIcon, 
    color: 'text-node-green', 
    bg: 'bg-node-green/10',
    data: { name: '新图片卡', description: '' }
  },
  { 
    type: 'video', 
    name: '视频卡', 
    description: '动画、短片等媒体',
    icon: Video, 
    color: 'text-node-yellow', 
    bg: 'bg-node-yellow/10',
    data: { name: '新视频卡', description: '' }
  },
  { 
    type: 'storyboard', 
    name: '多维表格卡', 
    description: '分镜、脚本等数据管理',
    icon: Table2, 
    color: 'text-node-purple', 
    bg: 'bg-node-purple/10',
    data: { shotNumber: '01', duration: 3, description: '', pivotConfig: { rows: [], cols: [], values: [] } },
    dimensions: { width: 768, height: 512 }
  },
];

export const Sidebar = () => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeAssetTab, setActiveAssetTab] = useState<'images' | 'videos' | 'others'>('images');
  let timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get all nodes from the store
  const nodes = useCanvasStore((state) => state.nodes);

  // Compute assets from nodes
  const { ASSET_IMAGES, ASSET_VIDEOS, ASSET_OTHERS } = useMemo(() => {
    const images: any[] = [];
    const videos: any[] = [];
    const others: any[] = [];

    nodes.forEach(node => {
      if (node.type === 'image') {
        const charData = node.data as CharacterNodeData;
        if (charData.imageUrl) {
          images.push({
            id: `img-${node.id}`,
            type: 'image',
            url: charData.imageUrl,
            name: charData.name || '未命名图片',
          });
        }
      } else if (node.type === 'video') {
        const videoData = node.data as VideoNodeData;
        if (videoData.videoUrl) {
          videos.push({
            id: `vid-${node.id}`,
            type: 'video',
            url: videoData.videoUrl,
            name: videoData.name || '未命名视频',
          });
        }
      }
      // Assuming other document types or scripts could be collected here if needed
      // else if (node.type === 'script' && hasFileAttachment) { ... }
    });

    return { ASSET_IMAGES: images, ASSET_VIDEOS: videos, ASSET_OTHERS: others };
  }, [nodes]);

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
    if (data) {
        event.dataTransfer.setData('application/reactflow-data', JSON.stringify(data));
    }
    if (initialDimensions) {
        event.dataTransfer.setData('application/reactflow-dimensions', JSON.stringify(initialDimensions));
    }
    event.dataTransfer.effectAllowed = 'move';

    // Create semi-transparent custom drag image
    const dragPreview = document.createElement('div');
    dragPreview.className = 'px-4 py-2 bg-background/80 backdrop-blur border border-primary/50 text-foreground rounded-md shadow-none flex items-center gap-2';
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    dragPreview.style.opacity = '0.7';
    dragPreview.innerHTML = `
      <div class="w-4 h-4 rounded-sm bg-primary/20"></div>
      <span class="text-sm font-medium">放置以添加节点</span>
    `;
    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 0, 0);

    // Cleanup drag image
    setTimeout(() => {
      if (document.body.contains(dragPreview)) {
        document.body.removeChild(dragPreview);
      }
    }, 0);
  };

  return (
    <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50">
      <div 
        className="flex flex-col gap-2 p-1.5 rounded-xl bg-background/70 backdrop-blur-xl border border-border/50 shadow-none"
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
            <Layers className="w-4 h-4" />
          </button>
          
          {/* Node Library Panel */}
          <div className={cn(
            "absolute left-full top-0 ml-4 w-60 bg-background/70 backdrop-blur-xl border border-border/50 rounded-xl p-2 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-none",
            activeMenu === 'nodes' 
              ? "opacity-100 translate-x-0 pointer-events-auto" 
              : "opacity-0 -translate-x-2 pointer-events-none"
          )}>
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 pt-1">添加节点</div>
            <div className="flex flex-col gap-1">
              {NODE_TYPES.map((node) => (
                <div
                  key={node.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type, node.data, node.dimensions)}
                  className="group flex items-start gap-3 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-secondary transition-colors"
                >
                  <div className={cn("p-1.5 rounded-md mt-0.5", node.bg)}>
                    <node.icon className={cn("w-4 h-4", node.color)} />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground">{node.name}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 leading-snug opacity-80">{node.description}</span>
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
            "absolute left-full top-0 ml-4 w-72 bg-background/70 backdrop-blur-xl border border-border/50 rounded-xl p-3 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-none flex flex-col gap-3",
            activeMenu === 'assets' 
              ? "opacity-100 translate-x-0 pointer-events-auto" 
              : "opacity-0 -translate-x-2 pointer-events-none"
          )}>
            
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
              <button 
                onClick={() => setActiveAssetTab('images')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all",
                  activeAssetTab === 'images' ? "bg-background text-node-green shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                图片
              </button>
              <button 
                onClick={() => setActiveAssetTab('videos')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all",
                  activeAssetTab === 'videos' ? "bg-background text-node-yellow shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Film className="w-3.5 h-3.5" />
                视频
              </button>
              <button 
                onClick={() => setActiveAssetTab('others')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all",
                  activeAssetTab === 'others' ? "bg-background text-node-blue shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                其他
              </button>
            </div>

            {/* Content Area */}
            <div className="max-h-[300px] min-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              
              {/* Image Tab */}
              {activeAssetTab === 'images' && (
                <div className="grid grid-cols-2 gap-2">
                  {ASSET_IMAGES.length > 0 ? ASSET_IMAGES.map((asset) => (
                    <div 
                      key={asset.id} 
                      draggable
                      onDragStart={(e) => onDragStart(e, asset.type, { name: asset.name, imageUrl: asset.url })}
                      className="group relative rounded-lg border border-border/50 overflow-hidden cursor-grab active:cursor-grabbing bg-secondary/50 hover:border-node-green/50 transition-colors h-[80px] flex items-center justify-center"
                    >
                      <img 
                        src={asset.url} 
                        alt={asset.name} 
                        loading="lazy"
                        className="w-full h-full object-contain p-1"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm p-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
                        <span className="text-[10px] text-white font-medium truncate block">{asset.name}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-2 flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 border-dashed">
                      <ImagePlus className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-xs">暂无图片资产</span>
                    </div>
                  )}
                </div>
              )}

              {/* Video Tab */}
              {activeAssetTab === 'videos' && (
                <div className="grid grid-cols-2 gap-2">
                  {ASSET_VIDEOS.length > 0 ? ASSET_VIDEOS.map((asset) => (
                    <div 
                      key={asset.id} 
                      draggable
                      onDragStart={(e) => onDragStart(e, asset.type, { name: asset.name, videoUrl: asset.url })}
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
                        <span className="text-[10px] text-white font-medium truncate block">{asset.name}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-2 flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 border-dashed">
                      <Film className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-xs">暂无视频资产</span>
                    </div>
                  )}
                </div>
              )}

              {/* Other Tab */}
              {activeAssetTab === 'others' && (
                <div className="flex flex-col gap-2">
                  {ASSET_OTHERS.length > 0 ? ASSET_OTHERS.map((asset) => (
                    <div 
                      key={asset.id} 
                      draggable
                      onDragStart={(e) => onDragStart(e, asset.type, { title: asset.name, content: { type: 'doc', content: [{ type: 'paragraph' }] } })}
                      className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/50 cursor-grab active:cursor-grabbing bg-secondary/50 hover:border-node-blue/50 transition-colors"
                    >
                      <div className="p-1.5 rounded-md bg-node-blue/10 shrink-0">
                        <File className="w-4 h-4 text-node-blue" />
                      </div>
                      <span className="text-xs font-medium text-foreground flex-1 truncate">{asset.name}</span>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground bg-secondary/50 rounded-lg border border-border/50 border-dashed">
                      <FileText className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-xs">暂无其他资源</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
