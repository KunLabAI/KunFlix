
import { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge'; // Assuming Badge exists or use span
import { useCanvasStore, ScriptNodeData } from '@/store/useCanvasStore';

const ScriptNode = ({ id, data, selected }: NodeProps<any>) => { // Use any or specific type if possible
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [isEditing, setIsEditing] = useState(false);
  
  // Local state for editing to prevent frequent store updates on every keystroke
  const [localData, setLocalData] = useState<ScriptNodeData>(data as ScriptNodeData);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setLocalData(data as ScriptNodeData);
  };

  const handleBlur = () => {
    setIsEditing(false);
    updateNodeData(id, localData);
  };

  const handleChange = (field: keyof ScriptNodeData, value: any) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="w-[280px]" onDoubleClick={handleDoubleClick}>
      <Card className={`shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader className="p-4 pb-2">
          {isEditing ? (
            <Input
              value={localData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              onBlur={handleBlur}
              className="font-bold text-lg h-8"
              autoFocus
            />
          ) : (
            <CardTitle className="text-lg font-bold truncate">{data.title || 'Untitled Script'}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-2">
          {isEditing ? (
            <>
              <Textarea
                value={localData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                onBlur={handleBlur}
                className="min-h-[80px] text-sm"
                placeholder="Description..."
              />
              <Input
                value={localData.tags?.join(', ')}
                onChange={(e) => handleChange('tags', e.target.value.split(',').map(t => t.trim()))}
                onBlur={handleBlur}
                className="text-xs h-7"
                placeholder="Tags (comma separated)"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground line-clamp-3 min-h-[1.25rem]">
                {data.description || 'No description'}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {data.tags?.map((tag: string, i: number) => (
                  <span key={i} className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Handles */}
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(ScriptNode);
