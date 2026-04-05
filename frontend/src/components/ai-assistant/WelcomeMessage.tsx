'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, UserRound, Film, MessageSquareText } from 'lucide-react';

// 预设对话列表：icon + labelKey + messageKey（通过 t() 在渲染时解析）
const PRESET_PROMPTS = [
  { icon: Sparkles, labelKey: 'ai.presets.scifiScript', messageKey: 'ai.presets.scifiScriptMsg' },
  { icon: UserRound, labelKey: 'ai.presets.designCharacter', messageKey: 'ai.presets.designCharacterMsg' },
  { icon: Film, labelKey: 'ai.presets.storyboard', messageKey: 'ai.presets.storyboardMsg' },
  { icon: MessageSquareText, labelKey: 'ai.presets.polishStory', messageKey: 'ai.presets.polishStoryMsg' },
];

interface WelcomeMessageProps {
  onSend?: (message: string) => void;
}

/**
 * 欢迎消息组件 - AI助手面板默认状态下的欢迎文案 + 预设对话快捷入口
 *
 * 显示：
 * - 第一行：👋{username}，欢迎回来！（摇手emoji带动画）
 * - 第二行：我们一起来创作吧~
 * - 下方：可点击的预设对话按钮
 */
export function WelcomeMessage({ onSend }: WelcomeMessageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const username = user?.nickname || t('ai.welcome.defaultUser');

  return (
    <div className="flex flex-col gap-4">
      {/* 欢迎文案 */}
      <div className="flex flex-col gap-1 text-[var(--color-text-primary)]">
        <div className="flex items-center gap-0.5 text-xl">
          <motion.span
            className="inline-block origin-[70%_70%]"
            animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
            transition={{
              duration: 2.5,
              ease: 'easeInOut',
              repeat: Infinity,
              repeatDelay: 1,
            }}
          >
            👋
          </motion.span>
          <span className="font-medium">{username}</span>
          <span>{t('ai.welcome.greeting')}</span>
        </div>
        <div className="text-2xl font-bold text-[var(--color-text-secondary)]">
          {t('ai.welcome.subtitle')}
        </div>
      </div>

      {/* 预设对话快捷入口 */}
      <div className="grid grid-cols-2 gap-2">
        {PRESET_PROMPTS.map((preset) => (
          <motion.button
            key={preset.labelKey}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSend?.(t(preset.messageKey))}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-left
              bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-elevated)]
              border border-[var(--color-border-light)] hover:border-[var(--color-border)]
              text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
              transition-colors cursor-pointer"
          >
            <preset.icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="leading-tight">{t(preset.labelKey)}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
