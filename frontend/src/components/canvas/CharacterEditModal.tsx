import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharacterNodeData } from "@/store/useCanvasStore";

interface CharacterEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CharacterNodeData;
  onSave: (data: CharacterNodeData) => void;
}

export function CharacterEditModal({ open, onOpenChange, data, onSave }: CharacterEditModalProps) {
  const [formData, setFormData] = useState<CharacterNodeData>(data);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(data);
      setHasChanges(false);
    }
  }, [open, data]);

  const handleChange = (field: keyof CharacterNodeData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
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
          <DialogTitle>编辑角色卡</DialogTitle>
          <DialogDescription>
            在此编辑角色的基本信息。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="name" className="text-right text-sm font-medium">
              姓名
            </label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => handleChange("name", e.target.value)}
              className="col-span-3"
              placeholder="角色姓名"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="description" className="text-right text-sm font-medium">
              设定与描述
            </label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleChange("description", e.target.value)}
              className="col-span-3"
              placeholder="性格、外貌、背景等..."
              rows={4}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="avatar" className="text-right text-sm font-medium">
              头像链接
            </label>
            <Input
              id="avatar"
              value={formData.avatar || ''}
              onChange={(e) => handleChange("avatar", e.target.value)}
              className="col-span-3"
              placeholder="https://..."
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
