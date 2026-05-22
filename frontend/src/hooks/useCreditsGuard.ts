'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';

// 与后端 require_positive_balance 的 min_credits 保持一致
const MIN_CREDITS_THRESHOLD = 0.0001;

/**
 * 前端积分耗尽预拦截 hook。
 *
 * - creditsExhausted：用户积分 <= 0.0001 时为 true，付费入口（视频/图像/音频/AI 对话）应当 disabled
 * - tooltipText：i18n 文案，hover 提示用户去充值
 *
 * 状态来源：AuthContext 的 user.credits，由 SSE billing 事件实时刷新；
 * 后端「兜底扣到 0」分支会下发 remaining_credits=0，因此本 hook 会随之立即变化。
 */
export function useCreditsGuard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const creditsExhausted = (user?.credits ?? 0) <= MIN_CREDITS_THRESHOLD;
  const tooltipText = t('errors.creditsEmpty');
  return { creditsExhausted, tooltipText };
}
