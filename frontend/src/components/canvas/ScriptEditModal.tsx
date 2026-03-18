import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScriptNodeData } from "@/store/useCanvasStore";

interface ScriptEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ScriptNodeData;
  onSave: (data: ScriptNodeData) => void;
}

export function ScriptEditModal({ open, onOpenChange, data, onSave }: ScriptEditModalProps) {
  const [formData, setFormData] = useState<ScriptNodeData>(data);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync data when modal opens
  useEffect(() => {
    if (open) {
      setFormData(data);
      setHasChanges(false);
    }
  }, [open, data]);

  const handleChange = (field: keyof ScriptNodeData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Validation: Title required
    if (!formData.title.trim()) {
      // You might want a better UI feedback here, but alert is functional for now
      // Or set an error state
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
      // If user cancels, do nothing (modal stays open)
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
        className="sm:max-w-[600px]"
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleInteractOutside}
      >
        <DialogHeader>
          <DialogTitle>编辑剧本卡</DialogTitle>
          <DialogDescription>
            在此编辑剧本卡的详细信息。完成后点击保存。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="title" className="text-right text-sm font-medium">
              标题
            </label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
              className="col-span-3"
              placeholder="请输入标题"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="description" className="text-right text-sm font-medium">
              简介
            </label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              className="col-span-3"
              placeholder="请输入简介"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="characters" className="text-right text-sm font-medium">
              角色列表
            </label>
            <Input
              id="characters"
              placeholder="角色名称，用逗号分隔"
              value={formData.characters?.join(", ") || ""}
              onChange={(e) => handleChange("characters", e.target.value.split(/[,，]/).map(s => s.trim()))}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="scenes" className="text-right text-sm font-medium">
              场景描述
            </label>
             <Textarea
              id="scenes"
              value={formData.scenes || ""}
              onChange={(e) => handleChange("scenes", e.target.value)}
              className="col-span-3"
              placeholder="场景详细描述..."
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="tags" className="text-right text-sm font-medium">
              标签
            </label>
            <Input
              id="tags"
              placeholder="标签，用逗号分隔"
              value={formData.tags?.join(", ") || ""}
              onChange={(e) => handleChange("tags", e.target.value.split(/[,，]/).map(s => s.trim()))}
              className="col-span-3"
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
