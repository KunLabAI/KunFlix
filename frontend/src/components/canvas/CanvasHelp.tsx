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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Help 按钮 - 位于画布左下角，与工具条分离 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full bg-card border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent"
        onClick={() => setIsOpen(true)}
        title={t('canvas.help.buttonTitle')}
      >
        <HelpCircle className="w-4 h-4" />
      </Button>

      {/* 帮助弹窗 - 横向布局 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Command className="w-5 h-5" />
              {t('canvas.help.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {/* 基础操作 */}
            <ShortcutSection title={t('canvas.help.sections.basic')}>
              <ShortcutItem
                icon={<MousePointer2 className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.selectBox.title')}
                description={t('canvas.help.shortcuts.selectBox.description')}
                keys={['左键拖拽']}
              />
              <ShortcutItem
                icon={<Hand className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.moveCanvas.title')}
                description={t('canvas.help.shortcuts.moveCanvas.description')}
                keys={['Space']}
              />
              <ShortcutItem
                icon={<Move className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.moveNode.title')}
                description={t('canvas.help.shortcuts.moveNode.description')}
              />
            </ShortcutSection>

            {/* 多选操作 */}
            <ShortcutSection title={t('canvas.help.sections.multiSelect')}>
              <ShortcutItem
                icon={<Plus className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.addSelect.title')}
                description={t('canvas.help.shortcuts.addSelect.description')}
                keys={['Shift', '点击']}
              />
              <ShortcutItem
                icon={<Square className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.batchSelect.title')}
                description={t('canvas.help.shortcuts.batchSelect.description')}
                keys={['Shift', '拖拽']}
              />
            </ShortcutSection>

            {/* 视图操作 */}
            <ShortcutSection title={t('canvas.help.sections.view')}>
              <ShortcutItem
                icon={<ZoomIn className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.zoomIn.title')}
                description={t('canvas.help.shortcuts.zoomIn.description')}
                keys={['Ctrl', '+']}
              />
              <ShortcutItem
                icon={<ZoomOut className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.zoomOut.title')}
                description={t('canvas.help.shortcuts.zoomOut.description')}
                keys={['Ctrl', '-']}
              />
              <ShortcutItem
                icon={<Maximize className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.fitView.title')}
                description={t('canvas.help.shortcuts.fitView.description')}
                keys={['Ctrl', '0']}
              />
            </ShortcutSection>

            {/* 编辑操作 */}
            <ShortcutSection title={t('canvas.help.sections.edit')}>
              <ShortcutItem
                icon={<Trash2 className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.delete.title')}
                description={t('canvas.help.shortcuts.delete.description')}
                keys={['Delete']}
              />
              <ShortcutItem
                icon={<Undo2 className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.undo.title')}
                description={t('canvas.help.shortcuts.undo.description')}
                keys={['Ctrl', 'Z']}
              />
              <ShortcutItem
                icon={<Redo2 className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.redo.title')}
                description={t('canvas.help.shortcuts.redo.description')}
                keys={['Ctrl', 'Y']}
              />
              <ShortcutItem
                icon={<Save className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.save.title')}
                description={t('canvas.help.shortcuts.save.description')}
                keys={['Ctrl', 'S']}
              />
            </ShortcutSection>

            {/* AI 操作 */}
            <ShortcutSection title={t('canvas.help.sections.ai')}>
              <ShortcutItem
                icon={<Sparkles className="w-4 h-4" />}
                title={t('canvas.help.shortcuts.aiEdit.title')}
                description={t('canvas.help.shortcuts.aiEdit.description')}
              />
              <ShortcutItem
                icon={<span className="text-xs font-bold">5</span>}
                title={t('canvas.help.shortcuts.multiImageEdit.title')}
                description={t('canvas.help.shortcuts.multiImageEdit.description')}
              />
            </ShortcutSection>
          </div>

          <div className="mt-4 pt-3 border-t text-xs text-muted-foreground text-center">
            {t('canvas.help.tip')}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
