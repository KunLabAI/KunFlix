"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ConfigProvider, theme as antdTheme, App } from "antd";
import zhCN from 'antd/locale/zh_CN';
import api from "@/lib/api";

type Theme = "light" | "dark" | "system";

/** 实际渲染主题，始终为 light | dark */
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  restoreTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem("theme") as Theme;
    const initial = storedTheme || "system";
    setThemeState(initial);
    setResolvedTheme(resolveTheme(initial));
  }, []);

  // 监听系统主题变化（system 模式）
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setResolvedTheme(prev => theme === "system" ? getSystemTheme() : prev);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    if (!mounted) return;
    const applied = resolveTheme(theme);
    setResolvedTheme(applied);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(applied);
    document.documentElement.setAttribute("data-theme", applied);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // fire-and-forget sync to backend
    api.patch("/auth/preferences", { preferred_theme: t }).catch(() => {});
  }, []);

  /** Restore theme from server (called on login / hydration) */
  const restoreTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const toggleTheme = () => {
    const TOGGLE_MAP: Record<Theme, Theme> = { light: "dark", dark: "light", system: "dark" };
    setThemeState(prev => TOGGLE_MAP[prev]);
  };

  // During SSR, we render with the default theme (dark) to ensure context is available.
  // We can suppress hydration warning if needed, but for now let's just ensure provider exists.
  
  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, restoreTheme }}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm:
            resolvedTheme === "dark"
              ? antdTheme.darkAlgorithm
              : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: resolvedTheme === "dark" ? "#fafafa" : "#18181b",
            colorBgBase: resolvedTheme === "dark" ? "#09090b" : "#ffffff",
            colorTextBase: resolvedTheme === "dark" ? "#fafafa" : "#09090b",
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
