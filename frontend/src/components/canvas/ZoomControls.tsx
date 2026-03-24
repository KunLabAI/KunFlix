import React from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Map, Plus, Minus, Focus, LayoutGrid, Grid, Magnet } from 'lucide-react';

export function ZoomControls({ 
  showMap, 
  onToggleMap,
  onAutoLayout,
  isLayouting,
  snapToGrid,
  onToggleSnapToGrid,
  snapToGuides,
  onToggleSnapToGuides
}: { 
  showMap: boolean; 
  onToggleMap: () => void;
  onAutoLayout?: () => void;
  isLayouting?: boolean;
  snapToGrid?: boolean;
  onToggleSnapToGrid?: () => void;
  snapToGuides?: boolean;
  onToggleSnapToGuides?: () => void;
}) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  
  // Get current zoom level from ReactFlow store
  const zoom = useStore((state) => state.transform[2]);
  
  // Match minZoom/maxZoom with ReactFlow's props in page.tsx
  const minZoom = 0.25;
  const maxZoom = 3;
  
  const handleSliderChange = (value: number[]) => {
    zoomTo(value[0]);
  };

  return (
    <div className="flex items-center bg-card border border-border/50 rounded-lg p-1 gap-1 pointer-events-auto">
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => zoomOut({ duration: 300 })} title="缩小">
        <Minus className="w-4 h-4" />
      </Button>
      
      <div className="flex items-center w-24 px-2 group">
        <Slider
          min={minZoom}
          max={maxZoom}
          step={0.05}
          value={[zoom]}
          onValueChange={handleSliderChange}
          className="w-full cursor-pointer"
        />
      </div>

      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => zoomIn({ duration: 300 })} title="放大">
        <Plus className="w-4 h-4" />
      </Button>

      <div className="w-px h-4 bg-border/50 mx-1" />

      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => fitView({ duration: 800 })} title="适应屏幕">
        <Focus className="w-4 h-4" />
      </Button>

      {onAutoLayout && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-foreground" 
          onClick={onAutoLayout} 
          disabled={isLayouting}
          title="自动排列节点"
        >
          <LayoutGrid className={`w-4 h-4 ${isLayouting ? 'animate-pulse text-primary' : ''}`} />
        </Button>
      )}

      <div className="w-px h-4 bg-border/50 mx-1" />

      {onToggleSnapToGrid && (
        <Button 
          variant={snapToGrid ? "secondary" : "ghost"} 
          size="icon" 
          className={`h-8 w-8 ${!snapToGrid ? 'text-muted-foreground hover:text-foreground' : 'text-primary'}`} 
          onClick={onToggleSnapToGrid} 
          title={snapToGrid ? "关闭网格吸附" : "开启网格吸附"}
        >
          <Magnet className="w-4 h-4" />
        </Button>
      )}

      {onToggleSnapToGuides && (
        <Button 
          variant={snapToGuides ? "secondary" : "ghost"} 
          size="icon" 
          className={`h-8 w-8 ${!snapToGuides ? 'text-muted-foreground hover:text-foreground' : 'text-primary'}`} 
          onClick={onToggleSnapToGuides} 
          title={snapToGuides ? "关闭对齐参考线" : "开启对齐参考线"}
        >
          <Grid className="w-4 h-4" />
        </Button>
      )}

      <Button 
        variant={showMap ? "secondary" : "ghost"} 
        size="icon" 
        className={`h-8 w-8 ${!showMap ? 'text-muted-foreground hover:text-foreground' : 'text-primary'}`} 
        onClick={onToggleMap} 
        title={showMap ? "关闭地图" : "打开地图"}
      >
        <Map className="w-4 h-4" />
      </Button>
    </div>
  );
}
