import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import api from "@/lib/api";

import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

const resources = {
  "zh-CN": { translation: zhCN },
  "en-US": { translation: enUS },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  supportedLngs: ["zh-CN", "en-US"],
  interpolation: {
    escapeValue: false,
  },
});

// 语言变更时自动持久化到 localStorage 并同步后端
// 注意：未登录用户不发 PATCH，避免 401 触发 token 刷新失败 -> window.location.href=/login 的无限刷新循环
i18n.on("languageChanged", (lng) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("i18n-lang", lng);
  const token = localStorage.getItem("access_token");
  if (!token) return;
  // fire-and-forget sync
  api.patch("/auth/preferences", { preferred_language: lng }).catch(() => {});
});

export default i18n;
