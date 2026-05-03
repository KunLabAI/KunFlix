'use client';

/**
 * Canvas 状态提示 Toast 封装（仅状态、不含交互）。
 *
 * - error：硬禁止（矩阵 forbid、自环、极性、重复边、拓扑环）
 * - info：一期未开放（矩阵 deferred）——文案提示「即将支持」
 * - warn：软约束（参考图上限、provider 能力不足等）
 * - success：操作完成提示
 *
 * 交互类二次确认（confirm）已移除 —— 连线注入默认直接执行，
 * 不再要求用户二次确认（参见 edgeRules.md 1.1.9）。
 * Toast 仅作为单向状态提示。
 */
import { toast } from 'sonner';

function showError(message: string) {
  toast.error(message, { duration: 3000 });
}

function showInfo(message: string) {
  toast.info(message, { duration: 2500 });
}

function showWarn(message: string) {
  toast.warning(message, { duration: 3000 });
}

function showSuccess(message: string) {
  toast.success(message, { duration: 2000 });
}

export const edgeToast = {
  error: showError,
  info: showInfo,
  warn: showWarn,
  success: showSuccess,
};
