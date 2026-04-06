import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileCode2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { usePromptTemplates } from '@/hooks/usePromptTemplates';
import { PromptTemplate } from '@/types';

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  story_basic: '故事基础设定',
  character: '角色设定',
  scene: '场景描述',
  storyboard: '分镜脚本',
  custom: '自定义',
};

interface SystemPromptProps {
  disabled?: boolean;
}

const SystemPrompt: React.FC<SystemPromptProps> = ({ disabled }) => {
  const { control, setValue } = useFormContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('__all__');

  const { templates } = usePromptTemplates();

  const filtered = (templates || []).filter((t) => {
    const matchType = filterType === '__all__' || t.template_type === filterType;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.description || '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch && t.is_active;
  });

  const templateTypes = Array.from(new Set((templates || []).map((t) => t.template_type)));

  const handleApply = (template: PromptTemplate) => {
    setValue('system_prompt', template.system_prompt_template, { shouldDirty: true });
    setOpen(false);
  };

  return (
    <>
      <FormField
        control={control}
        name="system_prompt"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between mb-1">
              <FormLabel>系统提示词 (System Prompt)</FormLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setOpen(true)}
                disabled={disabled}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                从模板导入
              </Button>
            </div>
            <FormControl>
              <Textarea
                placeholder="你是一个专业的助手..."
                disabled={disabled}
                className="font-mono text-sm min-h-[300px] resize-y"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>选择提示词模板</DialogTitle>
          </DialogHeader>

          {/* 搜索 & 筛选 */}
          <div className="px-6 py-3 border-b shrink-0 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索模板名称..."
                className="pl-8 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部分类</SelectItem>
                {templateTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TEMPLATE_TYPE_LABELS[t] || t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-6 py-4 space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">没有匹配的模板</p>
              )}
              {filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleApply(t)}
                  className="w-full text-left p-4 rounded-lg border hover:bg-accent hover:border-primary transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{t.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {TEMPLATE_TYPE_LABELS[t.template_type] || t.template_type}
                        </span>
                        {t.is_default && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">默认</span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-primary opacity-0 group-hover:opacity-100 shrink-0 pt-0.5">点击应用</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground font-mono line-clamp-2 bg-muted/50 rounded p-2">
                    {t.system_prompt_template.slice(0, 120)}{t.system_prompt_template.length > 120 ? '...' : ''}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SystemPrompt;
