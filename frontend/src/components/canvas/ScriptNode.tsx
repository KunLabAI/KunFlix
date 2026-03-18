import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Wand2 } from 'lucide-react';
import { useCanvasStore, ScriptNodeData } from '@/store/useCanvasStore';
import { ScriptEditModal } from './ScriptEditModal';

const ScriptNode = ({ id, data, selected }: NodeProps<Node<ScriptNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这张剧本卡吗？")) {
      deleteNode(id);
    }
  };

  const handleAIAssist = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert("AI 辅助功能正在开发中...");
  };

  const handleSave = (newData: ScriptNodeData) => {
    updateNodeData(id, newData);
  };

  return (
    <div className="w-[300px]">
      <Card className={`shadow-md transition-shadow hover:shadow-lg ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg font-bold truncate" title={data.title}>
              {data.title || '无标题剧本'}
            </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-2">
            <p className="text-sm text-muted-foreground line-clamp-3 min-h-[1.25rem]">
              {data.description || '暂无简介...'}
            </p>
            {data.tags && data.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {data.tags.map((tag: string, i: number) => (
                  <span key={i} className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            )}
        </CardContent>
        <CardFooter className="p-2 bg-secondary/10 flex justify-end gap-2 border-t">
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleAIAssist} title="AI 辅助">
             <Wand2 className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleEdit} title="编辑">
             <Pencil className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} title="删除">
             <Trash2 className="h-4 w-4" />
           </Button>
        </CardFooter>
      </Card>
      
      <ScriptEditModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        data={data as ScriptNodeData} 
        onSave={handleSave} 
      />

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(ScriptNode);
