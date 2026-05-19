"use client";

/**
 * EmailCodeField —— 邮箱验证码组件
 *
 * 职责：
 * - 渲染验证码输入框 + 「发送验证码」按钮（带 60s 冷却倒计时）
 * - 调用 /auth/email-code/send 发送
 * - 输入达到 6 位自动 /auth/email-code/verify，成功后通过 onVerified 回传一次性 token
 * - 任意 prop 变化（邮箱变更、purpose 切换）会清理 token 并通知父级失效
 *
 * 不耦合具体业务表单（注册 / 改密 / 忘记密码）；调用方持有 token 后再发起业务接口。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ShieldCheck, Send } from "lucide-react";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export type EmailCodePurpose = "register" | "change_password" | "reset_password";

export interface EmailCodeFieldProps {
  /** 当前邮箱（受控），由父级表单维护 */
  email: string;
  /** 业务用途，决定后端模板与 token 命名空间 */
  purpose: EmailCodePurpose;
  /** 禁用整个组件 */
  disabled?: boolean;
  /** 验证成功的一次性 token（提交时携带） */
  onVerified?: (token: string) => void;
  /** 邮箱/验证码变更时清空已持有的 token */
  onInvalidate?: () => void;
  /** 自定义类名 */
  className?: string;
}

const COOLDOWN_DEFAULT = 60;

export default function EmailCodeField({
  email,
  purpose,
  disabled,
  onVerified,
  onInvalidate,
  className,
}: EmailCodeFieldProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVerifiedKeyRef = useRef<string>("");

  // 邮箱合法性（前端简单校验，与后端 EmailStr 一致兜底）
  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ""),
    [email]
  );

  // 启动倒计时
  const startCooldown = useCallback((seconds: number) => {
    setCooldown(seconds);
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        const next = prev - 1;
        next <= 0 && timerRef.current && clearInterval(timerRef.current);
        return Math.max(0, next);
      });
    }, 1000);
  }, []);

  // 卸载清理 timer
  useEffect(() => () => {
    timerRef.current && clearInterval(timerRef.current);
  }, []);

  // 邮箱/purpose 变化 → 失效已验证 token
  useEffect(() => {
    setCode("");
    setVerified(false);
    lastVerifiedKeyRef.current = "";
    onInvalidate?.();
    // 不依赖 onInvalidate 引用，避免父级 inline 回调导致死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, purpose]);

  const sendCode = useCallback(async () => {
    if (!emailValid) {
      message.error(t("login.emailInvalid"));
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post<{ expires_in: number; cooldown: number }>(
        "/auth/email-code/send",
        { email, purpose }
      );
      message.success(t("emailCode.sent"));
      startCooldown(data?.cooldown || COOLDOWN_DEFAULT);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail || t("emailCode.sendFailed");
      message.error(detail);
    } finally {
      setSending(false);
    }
  }, [email, purpose, emailValid, message, t, startCooldown]);

  // 自动校验：6 位且未在校验中
  const verifyNow = useCallback(
    async (currentCode: string) => {
      if (!emailValid || currentCode.length !== 6) return;
      const key = `${purpose}:${email}:${currentCode}`;
      if (key === lastVerifiedKeyRef.current) return;
      lastVerifiedKeyRef.current = key;

      setVerifying(true);
      try {
        const { data } = await api.post<{
          ok: boolean;
          token?: string;
          reason?: string;
        }>("/auth/email-code/verify", { email, purpose, code: currentCode });

        if (data?.ok && data.token) {
          setVerified(true);
          onVerified?.(data.token);
        } else {
          setVerified(false);
          onInvalidate?.();
          const reasonMap: Record<string, string> = {
            mismatch: t("emailCode.invalidCode"),
            expired: t("emailCode.expired"),
            exhausted: t("emailCode.exhausted"),
          };
          message.error(reasonMap[data?.reason || ""] || t("emailCode.invalidCode"));
        }
      } catch (err: any) {
        setVerified(false);
        onInvalidate?.();
        const detail =
          err?.response?.data?.detail || t("emailCode.invalidCode");
        message.error(detail);
      } finally {
        setVerifying(false);
      }
    },
    [email, purpose, emailValid, onVerified, onInvalidate, message, t]
  );

  const handleCodeChange = useCallback(
    (val: string) => {
      // 仅允许数字
      const cleaned = val.replace(/\D/g, "").slice(0, 6);
      setCode(cleaned);
      setVerified(false);
      onInvalidate?.();
      cleaned.length === 6 && verifyNow(cleaned);
    },
    [verifyNow, onInvalidate]
  );

  const sendBtnLabel = sending
    ? t("emailCode.sending")
    : cooldown > 0
    ? `${cooldown}s`
    : t("emailCode.send");

  const sendBtnDisabled =
    Boolean(disabled) || sending || cooldown > 0 || !emailValid;

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={disabled}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder={t("emailCode.placeholder")}
            className={cn(
              "w-full h-11 pl-10 pr-10 rounded-lg",
              "bg-secondary/50 border border-border",
              "text-foreground placeholder:text-muted-foreground tracking-[0.4em]",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "transition-all duration-200",
              verified && "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
            )}
          />
          {(verifying || verified) && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {verifying ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={sendCode}
          disabled={sendBtnDisabled}
          className={cn(
            "h-11 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg",
            "bg-secondary border border-border text-sm font-medium whitespace-nowrap",
            "text-foreground hover:bg-secondary/80 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {sendBtnLabel}
        </button>
      </div>
    </div>
  );
}
