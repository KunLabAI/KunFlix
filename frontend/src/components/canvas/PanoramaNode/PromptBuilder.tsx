'use client';

import React, { useCallback, useState } from 'react';
import { Sparkles, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** 固定的全景格式前缀 */
const PROMPT_PREFIX = '360 degree equirectangular panorama, seamless spherical projection, 2:1 aspect ratio, ';
/** 固定的全景格式后缀 */
const PROMPT_SUFFIX = '. The environment wraps fully 360 degrees with consistent lighting and no visible seams. Style: photorealistic, cinematic lighting, ultra detailed, 8K resolution';

interface Props {
  className?: string;
}

/**
 * 全景提示词生成器：用户输入简单场景描述 → 自动拼接专业全景格式前后缀 → 一键复制。
 * 在全景节点空状态时显示。
 */
export function PromptBuilder({ className }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(() => {
    const trimmed = input.trim();
    trimmed && setGeneratedPrompt(`${PROMPT_PREFIX}${trimmed}${PROMPT_SUFFIX}`);
  }, [input]);

  const handleCopy = useCallback(async () => {
    generatedPrompt && await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedPrompt]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleGenerate());
  }, [handleGenerate]);

  return (
    <div className={cn('flex flex-col gap-2 w-full px-4 py-3 nodrag', className)} onClick={(e) => e.stopPropagation()}>
      {/* 场景描述输入 */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={t('canvas.node.panorama.promptBuilder.placeholder', '描述你想要的场景，例如：飞船内部驾驶舱、未来城市天台…')}
        rows={2}
        className="w-full resize-none rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
      />

      {/* 生成按钮 */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!input.trim()}
        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        {t('canvas.node.panorama.promptBuilder.generate', '生成全景提示词')}
      </button>

      {/* 生成结果 */}
      {generatedPrompt && (
        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <textarea
            readOnly
            value={generatedPrompt}
            rows={4}
            className="w-full resize-none rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[10px] text-foreground/80 leading-relaxed focus:outline-none cursor-text select-all"
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-foreground/80 transition-all"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied
              ? t('canvas.node.panorama.promptBuilder.copied', '已复制')
              : t('canvas.node.panorama.promptBuilder.copyPrompt', '复制提示词')}
          </button>
          <span className="text-[10px] text-muted-foreground/60 text-center leading-snug">
            {t('canvas.node.panorama.promptBuilder.hint', '将提示词粘贴到 Midjourney / DALL-E 等工具生成全景图，再上传到此节点')}
          </span>
        </div>
      )}
    </div>
  );
}
