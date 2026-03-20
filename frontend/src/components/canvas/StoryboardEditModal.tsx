import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StoryboardNodeData } from "@/store/useCanvasStore";

interface StoryboardEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: StoryboardNodeData;
  onSave: (data: StoryboardNodeData) => void;
}

export function StoryboardEditModal({ open, onOpenChange, data, onSave }: StoryboardEditModalProps) {
  const [formData, setFormData] = useState<StoryboardNodeData>(data);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(data);
      setHasChanges(false);
    }
  }, [open, data]);

  const handleChange = (field: keyof StoryboardNodeData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!formData.shotNumber?.trim()) {
      return;
    }
    onSave(formData);
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleAttemptClose = (isOpen: boolean) => {
    if (!isOpen && hasChanges) {
      if (confirm("您有未保存的更改。确定要放弃吗？")) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(isOpen);
    }
  };
  
  const handleInteractOutside = (e: Event) => {
      if (hasChanges) {
          e.preventDefault();
          if (confirm("您有未保存的更改。确定要放弃吗？")) {
              onOpenChange(false);
          }
      }
  }

  return (
    <Dialog open={open} onOpenChange={handleAttemptClose}>
      <DialogContent 
        className="sm:max-w-[500px]"
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleInteractOutside}
      >
        <DialogHeader>
          <DialogTitle>编辑多维表格卡</DialogTitle>
          <DialogDescription>
            在此编辑相关的分镜或脚本信息。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="shotNumber" className="text-right text-sm font-medium">
              镜头编号
            </label>
            <Input
              id="shotNumber"
              value={formData.shotNumber || ''}
              onChange={(e) => handleChange("shotNumber", e.target.value)}
              className="col-span-3"
              placeholder="例如: S01"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="duration" className="text-right text-sm font-medium">
              时长 (秒)
            </label>
            <Input
              id="duration"
              type="number"
              min="0"
              step="0.1"
              value={formData.duration || 0}
              onChange={(e) => handleChange("duration", Number(e.target.value))}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="description" className="text-right text-sm font-medium">
              画面描述
            </label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleChange("description", e.target.value)}
              className="col-span-3"
              placeholder="镜头内的画面动作与视觉描述..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleAttemptClose(false)}>取消</Button>
          <Button type="submit" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
