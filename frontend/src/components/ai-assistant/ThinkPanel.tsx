'use client';

import React from 'react';
import { SingleAgentThinkPanel } from './SingleAgentThinkPanel';
import { MultiAgentPanel } from './MultiAgentPanel';
import type { AgentStep } from '@/store/useAIAssistantStore';

interface ThinkPanelProps {
  steps?: AgentStep[];      // 多智能体步骤（可选）
  isThinking?: boolean;     // 是否正在思考中
  agentName?: string;       // 单智能体名称（可选）
  thinkingContent?: string; // 思考过程内容（流式输出）
  className?: string;
  children?: React.ReactNode; // 思考完成后的最终内容
}

/**
 * ThinkPanel - AI思考过程面板容器
 * 
 * 根据传入的参数自动选择渲染模式：
 * 1. 多智能体模式：传入 steps 数组时，显示多智能体协作面板
 * 2. 单智能体模式：传入 thinkingContent 或 children 时，显示单智能体思考面板
 * 
 * 特性：
 * - 自动模式切换：根据参数自动选择合适的子组件
 * - 完全向后兼容：保持原有 API 不变
 */
export function ThinkPanel({ steps = [], isThinking = false, agentName, thinkingContent, className, children }: ThinkPanelProps) {
  // 判断是单智能体还是多智能体模式
  const isMultiAgent = steps.length > 0;

  // 多智能体模式：渲染 MultiAgentPanel
  const renderMultiAgent = isMultiAgent && (
    <MultiAgentPanel
      steps={steps}
      isThinking={isThinking}
      className={className}
    />
  );

  // 单智能体模式：渲染 SingleAgentThinkPanel
  const renderSingleAgent = !isMultiAgent && (
    <SingleAgentThinkPanel
      isThinking={isThinking}
      agentName={agentName}
      thinkingContent={thinkingContent}
      className={className}
    >
      {children}
    </SingleAgentThinkPanel>
  );

  return (
    <>
      {renderMultiAgent}
      {renderSingleAgent}
    </>
  );
}
