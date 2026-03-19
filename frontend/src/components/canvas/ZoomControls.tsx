import React from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Map, Plus, Minus, Focus } from 'lucide-react';

export function ZoomControls({ 
  showMap, 
  onToggleMap 
}: { 
  showMap: boolean; 
  onToggleMap: () => void 
}) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  
  // Get current zoom level from ReactFlow store
  const zoom = useStore((state) => state.transform[2]);
  
  const minZoom = 0.1;
  const maxZoom = 4;
  
  const handleSliderChange = (value: number[]) => {
    zoomTo(value[0]);
  };

  return (
    <div className="flex items-center bg-card border border-border/50 shadow-sm rounded-lg p-1 gap-1 pointer-events-auto">
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

      <Button 
        variant={showMap ? "secondary" : "ghost"} 
        size="icon" 
        className={`h-8 w-8 ${!showMap && 'text-muted-foreground hover:text-foreground'}`} 
        onClick={onToggleMap} 
        title={showMap ? "关闭地图" : "打开地图"}
      >
        <Map className="w-4 h-4" />
      </Button>
    </div>
  );
}
