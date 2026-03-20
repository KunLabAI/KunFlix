
import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Pencil, Trash2 } from 'lucide-react';
import { useCanvasStore, StoryboardNodeData } from '@/store/useCanvasStore';
import { StoryboardEditModal } from './StoryboardEditModal';

const StoryboardNode = ({ id, data, selected }: NodeProps<Node<StoryboardNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这张分镜卡吗？")) {
      deleteNode(id);
    }
  };

  const handleSave = (newData: StoryboardNodeData) => {
    updateNodeData(id, newData);
  };

  return (
    <div className="w-[280px]">
      <Card className={`shadow-md transition-shadow hover:shadow-lg ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">SHOT</span>
            <span className="font-bold text-lg">{data.shotNumber || '01'}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            <span className="text-xs font-medium">{data.duration}s</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
            <p className="text-sm text-muted-foreground line-clamp-3 min-h-[1.25rem]" title={data.description}>
              {data.description || '暂无画面描述...'}
            </p>
        </CardContent>
        <CardFooter className="p-2 bg-secondary/10 flex justify-end gap-2 border-t">
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleEdit} title="编辑">
             <Pencil className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} title="删除">
             <Trash2 className="h-4 w-4" />
           </Button>
        </CardFooter>
      </Card>
      
      <StoryboardEditModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        data={data as StoryboardNodeData} 
        onSave={handleSave} 
      />

      <Handle type="target" position={Position.Left} id="left-target" className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Left} id="left-source" className="w-3 h-3 bg-primary opacity-0 z-[-1]" />
      
      <Handle type="target" position={Position.Right} id="right-target" className="w-3 h-3 bg-primary opacity-0 z-[-1]" />
      <Handle type="source" position={Position.Right} id="right-source" className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(StoryboardNode);
