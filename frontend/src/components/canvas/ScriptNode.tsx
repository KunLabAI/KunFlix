import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Wand2, Check, X } from 'lucide-react';
import { useCanvasStore, ScriptNodeData } from '@/store/useCanvasStore';
import { ScriptEditor } from './ScriptEditor';

const ScriptNode = ({ id, data, selected }: NodeProps<Node<ScriptNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ScriptNodeData>(data);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditData(data);
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

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, editData);
    setIsEditing(false);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditData(data);
    setIsEditing(false);
  };

  return (
    <div className={`w-[350px] transition-all ${isEditing ? 'z-50 shadow-xl scale-[1.02]' : 'z-0'}`}>
      {/* 标题移到卡片外部 */}
      <div className="mb-2 px-1">
        {isEditing ? (
          <Input
            value={editData.title}
            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
            className="font-bold text-lg h-8 bg-background/50 backdrop-blur-sm border-border/50"
            placeholder="无标题剧本"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3 className="text-lg font-bold truncate text-foreground/90 drop-shadow-sm" title={data.title}>
            {data.title || '无标题剧本'}
          </h3>
        )}
      </div>

      <Card className={`shadow-md transition-shadow hover:shadow-lg bg-card ${selected ? 'ring-2 ring-primary' : ''}`}>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm text-foreground min-h-[40px]">
            <ScriptEditor
              initialContent={editData.content || (editData.description ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: editData.description }] }] } : undefined)}
              isEditable={isEditing}
              onUpdate={(content) => setEditData({ ...editData, content })}
            />
          </div>
        </CardContent>
        <CardFooter className="p-2 bg-secondary/10 flex justify-end gap-2 border-t">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" /> 取消
              </Button>
              <Button variant="default" size="sm" className="h-8" onClick={handleSave}>
                <Check className="h-4 w-4 mr-1" /> 保存
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleAIAssist} title="AI 辅助">
                <Wand2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleEdit} title="编辑">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} title="删除">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-primary" />
    </div>
  );
};

export default memo(ScriptNode);
