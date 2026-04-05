import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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

// 语言变更时自动持久化到 localStorage
i18n.on("languageChanged", (lng) => {
  typeof window !== "undefined" && localStorage.setItem("i18n-lang", lng);
});

export default i18n;
