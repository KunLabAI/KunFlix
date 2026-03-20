
import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { useCanvasStore, CharacterNodeData } from '@/store/useCanvasStore';
import { CharacterEditModal } from './CharacterEditModal';

const CharacterNode = ({ id, data, selected }: NodeProps<Node<CharacterNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这张角色卡吗？")) {
      deleteNode(id);
    }
  };

  const handleSave = (newData: CharacterNodeData) => {
    updateNodeData(id, newData);
  };

  return (
    <div className="w-[280px]">
      <Card className={`shadow-md transition-shadow hover:shadow-lg ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader className="p-4 pb-2 flex flex-row items-center gap-3 space-y-0">
          <Avatar className="h-10 w-10 border shadow-sm">
            <AvatarImage src={data.avatar} alt={data.name} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {data.name?.slice(0, 2).toUpperCase() || '??'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
             <CardTitle className="text-base font-bold truncate" title={data.name}>
               {data.name || '未命名角色'}
             </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
            <p className="text-sm text-muted-foreground line-clamp-3 min-h-[1.25rem]" title={data.description}>
              {data.description || '暂无描述...'}
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
      
      <CharacterEditModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        data={data as CharacterNodeData} 
        onSave={handleSave} 
      />

      <Handle type="target" position={Position.Left} id="left-target" className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Left} id="left-source" className="w-3 h-3 bg-primary opacity-0 z-[-1]" />
      
      <Handle type="target" position={Position.Right} id="right-target" className="w-3 h-3 bg-primary opacity-0 z-[-1]" />
      <Handle type="source" position={Position.Right} id="right-source" className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(CharacterNode);
