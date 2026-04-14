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
i18n.on("languageChanged", (lng) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("i18n-lang", lng);
  // fire-and-forget sync
  api.patch("/auth/preferences", { preferred_language: lng }).catch(() => {});
});

export default i18n;
