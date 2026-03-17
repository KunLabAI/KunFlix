
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollText, User, Clapperboard } from 'lucide-react';

export const Sidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string, data?: any) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    if (data) {
        event.dataTransfer.setData('application/reactflow-data', JSON.stringify(data));
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-[250px] h-full bg-background border-r p-4 flex flex-col gap-4 z-10 shadow-sm">
      <div className="text-sm font-semibold text-muted-foreground mb-2">节点库</div>
      
      <div 
        className="flex items-center gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-colors bg-card"
        onDragStart={(event) => onDragStart(event, 'script', { title: '新剧本', description: '', tags: [] })}
        draggable
      >
        <ScrollText className="w-5 h-5 text-primary" />
        <span className="font-medium">剧本卡</span>
      </div>

      <div 
        className="flex items-center gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-colors bg-card"
        onDragStart={(event) => onDragStart(event, 'character', { name: '新角色', description: '' })}
        draggable
      >
        <User className="w-5 h-5 text-primary" />
        <span className="font-medium">角色卡</span>
      </div>

      <div 
        className="flex items-center gap-3 p-3 border rounded-md cursor-grab hover:bg-accent transition-colors bg-card"
        onDragStart={(event) => onDragStart(event, 'storyboard', { shotNumber: '01', duration: 3, description: '' })}
        draggable
      >
        <Clapperboard className="w-5 h-5 text-primary" />
        <span className="font-medium">分镜卡</span>
      </div>

      <div className="mt-auto text-xs text-muted-foreground">
        <p>拖拽卡片到画布以添加节点</p>
      </div>
    </aside>
  );
};
