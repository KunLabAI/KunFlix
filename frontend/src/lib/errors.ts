/**
 * 统一错误规范化层
 *
 * 后端协议（详见 backend/errors.py）：
 *   { code: string, detail: string, data?: object | null }
 *
 * 前端将所有错误源（业务异常、HTTP、网络异常、超时）统一归一为
 * NormalizedError 对象，由调用方按 code 决定 i18n 文案 / UI 行为。
 */

import type { AxiosError } from "axios";
import type i18n from "i18next";

// ── 错误码常量（与 backend/errors.py:ErrorCode 对齐） ──────────────────────────
export const ErrorCode = {
  // 业务错误（后端返回）
  UNAUTHORIZED: "UNAUTHORIZED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_CONFLICT: "RESOURCE_CONFLICT",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  BALANCE_FROZEN: "BALANCE_FROZEN",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_PARAMETER: "INVALID_PARAMETER",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  HTTP_ERROR: "HTTP_ERROR",
  // 客户端侧分类
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  REQUEST_CANCELLED: "REQUEST_CANCELLED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface NormalizedError {
  /** 标准错误码（UPPER_SNAKE_CASE） */
  code: ErrorCodeType | string;
  /** 后端原始 detail（英文/中文兜底文案，仅当 i18n 缺字段时显示） */
  detail: string;
  /** HTTP 状态码（业务错误带状态、网络错误为 0） */
  status: number;
  /** 业务上下文数据（如 current_balance、required） */
  data?: Record<string, unknown> | null;
  /** 是否可重试（网络/超时/5xx） */
  retryable: boolean;
  /** 原始 error 对象（用于调试） */
  cause?: unknown;
}

// ── HTTP 状态 → 错误码 兜底映射 ───────────────────────────────────────────────
const STATUS_TO_CODE: Record<number, ErrorCodeType> = {
  400: ErrorCode.INVALID_PARAMETER,
  401: ErrorCode.UNAUTHORIZED,
  402: ErrorCode.INSUFFICIENT_CREDITS,
  403: ErrorCode.PERMISSION_DENIED,
  404: ErrorCode.RESOURCE_NOT_FOUND,
  409: ErrorCode.RESOURCE_CONFLICT,
  422: ErrorCode.VALIDATION_ERROR,
  429: ErrorCode.RATE_LIMITED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.UPSTREAM_ERROR,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.UPSTREAM_ERROR,
};

// ── 可重试错误码集合 ──────────────────────────────────────────────────────────
const RETRYABLE_CODES = new Set<string>([
  ErrorCode.NETWORK_ERROR,
  ErrorCode.TIMEOUT,
  ErrorCode.SERVICE_UNAVAILABLE,
  ErrorCode.UPSTREAM_ERROR,
  ErrorCode.INTERNAL_ERROR,
]);

/** 从 axios error 推断错误来源类型（无 if 链，纯映射） */
function classifyAxiosError(err: AxiosError): { code: ErrorCodeType; status: number } {
  // 优先：被取消（手动 abort）
  const cancelled = err.code === "ERR_CANCELED" || err.name === "CanceledError";
  if (cancelled) return { code: ErrorCode.REQUEST_CANCELLED, status: 0 };

  // 超时
  const timedOut = err.code === "ECONNABORTED" || /timeout/i.test(err.message || "");
  if (timedOut) return { code: ErrorCode.TIMEOUT, status: 0 };

  // 无 response：网络层失败（DNS/CORS/断网）
  if (!err.response) return { code: ErrorCode.NETWORK_ERROR, status: 0 };

  // 有 response：按状态映射
  const status = err.response.status;
  return { code: STATUS_TO_CODE[status] ?? ErrorCode.HTTP_ERROR, status };
}

/**
 * 规范化任意错误为 NormalizedError。
 *
 * 优先级：业务 code > status 兜底 code > 客户端分类 > UNKNOWN
 */
export function normalizeError(err: unknown): NormalizedError {
  // 已规范化对象
  const isNormalized = err && typeof err === "object" && "code" in err && "retryable" in err;
  if (isNormalized) return err as NormalizedError;

  // axios error
  const axiosErr = err as AxiosError | undefined;
  const isAxios = !!axiosErr && (axiosErr.isAxiosError === true || !!axiosErr.config);
  if (isAxios) {
    const { code: classified, status } = classifyAxiosError(axiosErr);
    const body = (axiosErr.response?.data ?? {}) as Partial<NormalizedError>;
    const code = (body.code as string) || classified;
    const detail = body.detail || axiosErr.message || "Request failed";
    return {
      code,
      detail,
      status,
      data: (body.data as Record<string, unknown>) ?? null,
      retryable: RETRYABLE_CODES.has(code) || status >= 500,
      cause: err,
    };
  }

  // 普通 Error / 未知
  const e = err as Error | undefined;
  return {
    code: ErrorCode.UNKNOWN,
    detail: e?.message || "Unknown error",
    status: 0,
    data: null,
    retryable: false,
    cause: err,
  };
}

/**
 * 通过 i18n 字典查 code → 显示文案；缺失时回退到 detail。
 * 用法：getErrorMessage(t, normalizeError(err))
 */
export function getErrorMessage(
  t: typeof i18n.t,
  normalized: NormalizedError
): string {
  const key = `errors.${normalized.code}`;
  const translated = t(key, { ...(normalized.data || {}), defaultValue: "" });
  return (translated as string) || normalized.detail || (t("errors.UNKNOWN") as string);
}
