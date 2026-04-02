'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, MousePointer2, Hand, Move, Square, Command, Plus, ZoomIn, ZoomOut, Maximize, Trash2, Undo2, Redo2, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  keys?: string[];
}

function ShortcutItem({ icon, title, description, keys }: ShortcutItemProps) {
  return (
    <div className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors min-w-[100px]">
      <div className="p-2 rounded-md bg-primary/10 text-primary mb-2">
        {icon}
      </div>
      <span className="font-medium text-sm">{title}</span>
      {keys && keys.length > 0 && (
        <span className="flex items-center gap-1 mt-1 flex-wrap justify-center">
          {keys.map((key, index) => (
            <React.Fragment key={index}>
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">
                {key}
              </kbd>
              {index < keys.length - 1 && <span className="text-muted-foreground text-xs">+</span>}
            </React.Fragment>
          ))}
        </span>
      )}
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{description}</p>
    </div>
  );
}

interface ShortcutSectionProps {
  title: string;
  children: React.ReactNode;
}

function ShortcutSection({ title, children }: ShortcutSectionProps) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border/50 last:border-0">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16 shrink-0 pt-3">
        {title}
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {children}
      </div>
    </div>
  );
}

export function CanvasHelpButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Help 按钮 - 位于画布左下角，与工具条分离 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full bg-card border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent"
        onClick={() => setIsOpen(true)}
        title="快捷键帮助"
      >
        <HelpCircle className="w-4 h-4" />
      </Button>

      {/* 帮助弹窗 - 横向布局 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Command className="w-5 h-5" />
              画布快捷键
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {/* 基础操作 */}
            <ShortcutSection title="基础">
              <ShortcutItem
                icon={<MousePointer2 className="w-4 h-4" />}
                title="框选节点"
                description="空白处拖拽鼠标"
                keys={['左键拖拽']}
              />
              <ShortcutItem
                icon={<Hand className="w-4 h-4" />}
                title="移动画布"
                description="空格键+拖拽"
                keys={['Space']}
              />
              <ShortcutItem
                icon={<Move className="w-4 h-4" />}
                title="移动节点"
                description="直接拖拽节点"
              />
            </ShortcutSection>

            {/* 多选操作 */}
            <ShortcutSection title="多选">
              <ShortcutItem
                icon={<Plus className="w-4 h-4" />}
                title="添加选中"
                description="Shift+点击节点"
                keys={['Shift', '点击']}
              />
              <ShortcutItem
                icon={<Square className="w-4 h-4" />}
                title="批量框选"
                description="Shift+拖拽"
                keys={['Shift', '拖拽']}
              />
            </ShortcutSection>

            {/* 视图操作 */}
            <ShortcutSection title="视图">
              <ShortcutItem
                icon={<ZoomIn className="w-4 h-4" />}
                title="放大"
                description="放大画布"
                keys={['Ctrl', '+']}
              />
              <ShortcutItem
                icon={<ZoomOut className="w-4 h-4" />}
                title="缩小"
                description="缩小画布"
                keys={['Ctrl', '-']}
              />
              <ShortcutItem
                icon={<Maximize className="w-4 h-4" />}
                title="适应视图"
                description="适应所有节点"
                keys={['Ctrl', '0']}
              />
            </ShortcutSection>

            {/* 编辑操作 */}
            <ShortcutSection title="编辑">
              <ShortcutItem
                icon={<Trash2 className="w-4 h-4" />}
                title="删除"
                description="删除选中节点"
                keys={['Delete']}
              />
              <ShortcutItem
                icon={<Undo2 className="w-4 h-4" />}
                title="撤销"
                description="撤销上一步"
                keys={['Ctrl', 'Z']}
              />
              <ShortcutItem
                icon={<Redo2 className="w-4 h-4" />}
                title="重做"
                description="重做下一步"
                keys={['Ctrl', 'Y']}
              />
              <ShortcutItem
                icon={<Save className="w-4 h-4" />}
                title="保存"
                description="手动保存"
                keys={['Ctrl', 'S']}
              />
            </ShortcutSection>

            {/* AI 操作 */}
            <ShortcutSection title="AI">
              <ShortcutItem
                icon={<Sparkles className="w-4 h-4" />}
                title="AI 编辑"
                description="拖拽到 AI 面板"
              />
              <ShortcutItem
                icon={<span className="text-xs font-bold">5</span>}
                title="多图编辑"
                description="最多 5 个图像"
              />
            </ShortcutSection>
          </div>

          <div className="mt-4 pt-3 border-t text-xs text-muted-foreground text-center">
            提示：将节点拖拽到 AI 对话面板可进行智能编辑
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
