
import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useCanvasStore, CharacterNodeData } from '@/store/useCanvasStore';

const CharacterNode = ({ id, data, selected }: NodeProps<any>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [isEditing, setIsEditing] = useState(false);
  const [localData, setLocalData] = useState<CharacterNodeData>(data as CharacterNodeData);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setLocalData(data as CharacterNodeData);
  };

  const handleBlur = () => {
    setIsEditing(false);
    updateNodeData(id, localData);
  };

  const handleChange = (field: keyof CharacterNodeData, value: any) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="w-[280px]" onDoubleClick={handleDoubleClick}>
      <Card className={`shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader className="p-4 pb-2 flex flex-row items-center gap-3 space-y-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={data.avatar} alt={data.name} />
            <AvatarFallback>{data.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
             {isEditing ? (
              <Input
                value={localData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={handleBlur}
                className="font-bold h-8"
                autoFocus
                placeholder="Character Name"
              />
            ) : (
              <CardTitle className="text-base font-bold truncate">{data.name || 'Unnamed'}</CardTitle>
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
                placeholder="Character Description..."
              />
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-3 min-h-[1.25rem]">
              {data.description || 'No description'}
            </p>
          )}
        </CardContent>
      </Card>
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(CharacterNode);
