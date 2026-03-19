
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollText, User, Clapperboard, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string, data?: any) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    if (data) {
        event.dataTransfer.setData('application/reactflow-data', JSON.stringify(data));
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
            "flex items-center gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing",
            isCollapsed && "hidden"
          )}
        onDragStart={(event) => onDragStart(event, 'script', { title: '新剧本', description: '', content: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] })}
        draggable
        title="拖拽添加剧本卡"
      >
        <div className="p-2 rounded-md bg-primary/10">
          <ScrollText className="w-5 h-5 text-primary" />
        </div>
        <span className="font-medium text-sm whitespace-nowrap">剧本卡</span>
        <GripVertical className="w-4 h-4 text-muted-foreground ml-auto opacity-50" />
      </div>

      <div 
        className={cn(
          "flex items-center gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing",
          isCollapsed && "hidden"
        )}
        onDragStart={(event) => onDragStart(event, 'character', { name: '新角色', description: '' })}
        draggable
        title="拖拽添加角色卡"
      >
        <div className="p-2 rounded-md bg-green-500/10">
          <User className="w-5 h-5 text-green-600" />
        </div>
        <span className="font-medium text-sm whitespace-nowrap">角色卡</span>
        <GripVertical className="w-4 h-4 text-muted-foreground ml-auto opacity-50" />
      </div>

      <div 
        className={cn(
          "flex items-center gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-all bg-card hover:shadow-md active:cursor-grabbing",
          isCollapsed && "hidden"
        )}
        onDragStart={(event) => onDragStart(event, 'storyboard', { shotNumber: '01', duration: 3, description: '' })}
        draggable
        title="拖拽添加分镜卡"
      >
        <div className="p-2 rounded-md bg-amber-500/10">
          <Clapperboard className="w-5 h-5 text-amber-600" />
        </div>
        <span className="font-medium text-sm whitespace-nowrap">分镜卡</span>
        <GripVertical className="w-4 h-4 text-muted-foreground ml-auto opacity-50" />
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
