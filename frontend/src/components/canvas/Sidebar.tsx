
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollText, User, Clapperboard, Video, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/useCanvasStore';

export const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string, data?: any, initialDimensions?: {width: number, height: number}) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    if (data) {
        event.dataTransfer.setData('application/reactflow-data', JSON.stringify(data));
    }
    if (initialDimensions) {
        event.dataTransfer.setData('application/reactflow-dimensions', JSON.stringify(initialDimensions));
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="relative h-full z-10">
      <aside 
        className={cn(
          "h-full bg-background border-r flex flex-col gap-4 shadow-sm transition-all duration-300 ease-in-out overflow-hidden",
          isCollapsed ? "w-0 p-0 border-none" : "w-[250px] p-4"
        )}
      >
        <div className={cn("text-sm font-semibold text-muted-foreground mb-2 whitespace-nowrap transition-all", isCollapsed && "opacity-0 hidden")}>
          节点库
        </div>
        
        <div 
          className={cn(
            "flex items-start gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing group",
            isCollapsed && "hidden"
          )}
        onDragStart={(event) => onDragStart(event, 'script', { title: '新文本卡', description: '', content: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] })}
        draggable
        title="拖拽添加文本卡"
      >
        <div className="p-2 rounded-md bg-primary/10 shrink-0 mt-0.5">
          <ScrollText className="w-5 h-5 text-primary" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-sm text-foreground">文本卡</span>
          <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-snug">用于编写剧本、文案等用途</span>
        </div>
        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1" />
      </div>

      <div 
        className={cn(
          "flex items-start gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing group",
          isCollapsed && "hidden"
        )}
        onDragStart={(event) => onDragStart(event, 'character', { name: '新图片卡', description: '' })}
        draggable
        title="拖拽添加图片卡"
      >
        <div className="p-2 rounded-md bg-green-500/10 shrink-0 mt-0.5">
          <User className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-sm text-foreground">图片卡</span>
          <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-snug">用于展示角色、场景、海报等</span>
        </div>
        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1" />
      </div>

      <div 
        className={cn(
          "flex items-start gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing group",
          isCollapsed && "hidden"
        )}
        onDragStart={(event) => onDragStart(event, 'video', { name: '新视频卡', description: '' })}
        draggable
        title="拖拽添加视频卡"
      >
        <div className="p-2 rounded-md bg-purple-500/10 shrink-0 mt-0.5">
          <Video className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-sm text-foreground">视频卡</span>
          <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-snug">用于展示动画、短片等</span>
        </div>
        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1" />
      </div>

      <div 
          className={cn(
            "flex items-start gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing group",
            isCollapsed && "hidden"
          )}
        onDragStart={(event) => onDragStart(event, 'storyboard', { shotNumber: '01', duration: 3, description: '', pivotConfig: { rows: [], cols: [], values: [] } }, { width: 768, height: 512 })}
        draggable
        title="拖拽添加多维表格卡"
      >
        <div className="p-2 rounded-md bg-amber-500/10 shrink-0 mt-0.5">
          <Clapperboard className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-sm text-foreground">多维表格卡</span>
          <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-snug">用于管理分镜、脚本等数据</span>
        </div>
        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-1" />
      </div>

      {!isCollapsed && (
        <div className="mt-auto text-xs text-muted-foreground text-center bg-secondary/30 p-2 rounded-md whitespace-nowrap">
          <p>拖拽卡片到画布以添加节点</p>
        </div>
      )}
    </aside>

    <Button 
      variant="ghost" 
      size="icon" 
      className={cn(
        "absolute top-1/2 -translate-y-1/2 h-8 w-6 rounded-r-md rounded-l-none border border-l-0 shadow-md bg-background z-50 hover:bg-accent transition-all duration-300 flex items-center justify-center",
        isCollapsed ? "left-0" : "left-[250px]"
      )}
      onClick={() => setIsCollapsed(!isCollapsed)}
    >
      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </Button>
  </div>
  );
};
