
import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { useCanvasStore, StoryboardNodeData } from '@/store/useCanvasStore';

const StoryboardNode = ({ id, data, selected }: NodeProps<any>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [isEditing, setIsEditing] = useState(false);
  const [localData, setLocalData] = useState<StoryboardNodeData>(data as StoryboardNodeData);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setLocalData(data as StoryboardNodeData);
  };

  const handleBlur = () => {
    setIsEditing(false);
    updateNodeData(id, localData);
  };

  const handleChange = (field: keyof StoryboardNodeData, value: any) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="w-[280px]" onDoubleClick={handleDoubleClick}>
      <Card className={`shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">SHOT</span>
            {isEditing ? (
              <Input
                value={localData.shotNumber}
                onChange={(e) => handleChange('shotNumber', e.target.value)}
                onBlur={handleBlur}
                className="font-bold w-16 h-7 text-sm"
                autoFocus
              />
            ) : (
              <span className="font-bold text-lg">{data.shotNumber || '01'}</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {isEditing ? (
               <Input
                type="number"
                value={localData.duration}
                onChange={(e) => handleChange('duration', Number(e.target.value))}
                onBlur={handleBlur}
                className="w-16 h-7 text-xs"
              />
            ) : (
              <span className="text-xs">{data.duration}s</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {isEditing ? (
            <Textarea
              value={localData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              onBlur={handleBlur}
              className="min-h-[80px] text-sm"
              placeholder="Visual description..."
            />
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-3 min-h-[1.25rem]">
              {data.description || 'No visual description'}
            </p>
          )}
        </CardContent>
      </Card>
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(StoryboardNode);
