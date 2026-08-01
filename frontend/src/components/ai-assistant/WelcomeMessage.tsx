'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraggableOrb } from '@/components/canvas/DraggableOrb';

// 气泡轮播内容：欢迎词 + 预设提示词，labelKey 为气泡展示的短标题，messageKey 为点击后注入输入框的完整文案
interface PresetEntry {
  labelKey: string;
  messageKey: string;
  /** false 表示纯展示不可点击注入（如欢迎词） */
  clickable?: boolean;
}
const PRESET_PROMPTS: PresetEntry[] = [
  { labelKey: 'ai.welcome.subtitle', messageKey: 'ai.welcome.subtitle', clickable: false },
  { labelKey: 'ai.presets.scifiScript', messageKey: 'ai.presets.scifiScriptMsg' },
  { labelKey: 'ai.presets.designCharacter', messageKey: 'ai.presets.designCharacterMsg' },
  { labelKey: 'ai.presets.storyboard', messageKey: 'ai.presets.storyboardMsg' },
  { labelKey: 'ai.presets.polishStory', messageKey: 'ai.presets.polishStoryMsg' },
];

interface WelcomeMessageProps {
  /** 把预设提示词注入输入框（不直接发送），由父级转交给 MessageInput */
  onInjectPrompt?: (message: string) => void;
  /** 空间边界元素（AI 面板容器）：小球拖到四壁即被挤压压扁，无法拖出 */
  boundsRef?: React.RefObject<HTMLElement | null>;
  /** 底部障碍元素（如输入区）：小球向下拖到其顶边即被硬挡住并触发碰撞 */
  barrierRef?: React.RefObject<HTMLElement | null>;
  /** 当前登录用户昵称，用于欢迎词插值 */
  userName?: string;
}

/**
 * 欢迎消息组件 - AI助手面板默认空状态下的欢迎页
 *
 * 显示：AI 助手小球 Orbie 动态头像，对话气泡中随机轮换展示欢迎词与预设提示词（短标题），
 * 点击气泡或小球即把对应的完整文案注入输入框，供用户编辑后发送。
 */
export function WelcomeMessage({ onInjectPrompt, boundsRef, barrierRef, userName }: WelcomeMessageProps) {
  const { t } = useTranslation();

  // 气泡展示→留白→切换循环：展示 8~12s 后收起留白 3~5s，
  // 留白结束时切到下一条（+1 起步保证不重复停留），降低切换频率并增加呼吸感
  const [presetIndex, setPresetIndex] = useState(() => Math.floor(Math.random() * PRESET_PROMPTS.length));
  const [showBubble, setShowBubble] = useState(true);
  useEffect(() => {
    const delay = showBubble ? 8000 + Math.random() * 4000 : 3000 + Math.random() * 2000;
    const timer = setTimeout(() => {
      setShowBubble(s => !s);
      // 仅在留白→展示的切换点推进提示词
      !showBubble && setPresetIndex(i => (i + 1 + Math.floor(Math.random() * (PRESET_PROMPTS.length - 1))) % PRESET_PROMPTS.length);
    }, delay);
    return () => clearTimeout(timer);
  }, [showBubble, presetIndex]);

  const preset = PRESET_PROMPTS[presetIndex];
  // 欢迎词含 {{name}} 插值，未登录时用默认昵称；提示词模板无插值，t() 自动忽略多余参数
  const tOpts = { name: userName || t('ai.welcome.defaultUser') };
  // 点击气泡 / 轻点小球：把当前预设的完整文案注入输入框（拖拽小球不会走到这里）
  const handleInject = () => onInjectPrompt?.(t(preset.messageKey, tOpts));
  // 未接注入回调或当前条目不可点击时气泡不响应点击，避免给出无效的可点击暗示
  const injectHandler = onInjectPrompt && preset.clickable !== false ? handleInject : undefined;

  return (
    <div className="flex flex-col items-center">
      {/* AI 小球头像（可拖拽，受面板四壁阻挡），气泡展示欢迎词/预设提示词、点击即注入输入框 */}
      <DraggableOrb
        size={72}
        boundsRef={boundsRef}
        barrierRef={barrierRef}
        onTap={injectHandler}
        onBubbleClick={injectHandler}
        bubble={showBubble ? t(preset.labelKey, tOpts) : undefined}
        className="mt-12"
      />
    </div>
  );
}
