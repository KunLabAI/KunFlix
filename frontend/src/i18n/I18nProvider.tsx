"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";

export default function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // 客户端挂载后从 localStorage 恢复用户语言偏好（避免 SSR 水合不匹配）
  useEffect(() => {
    const saved = localStorage.getItem("i18n-lang");
    saved && i18n.language !== saved && i18n.changeLanguage(saved);
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
