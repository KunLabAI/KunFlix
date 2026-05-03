"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, Lock, User, ArrowRight,
  Eye, EyeOff, Loader2, Globe
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import type { TokenResponse } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import api from "@/lib/api";
import { App } from "antd";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";

// 本地素材图片
const EFFECT_IMAGES = [
  "/effect/023576f6-ce4d-4e16-ae0f-22ce69ac363e.jpg",
  "/effect/0d563961-5ad4-4d26-8d21-7b0152302e46.jpg",
  "/effect/1619b2eb-11a6-4302-9b0a-c4ee79283af6.jpg",
  "/effect/18c5dedb-6fe7-4708-b864-afab675ca140.jpg",
  "/effect/2d25e12c-adff-476d-8eaa-6a0cc73371f3.jpg",
  "/effect/30a18532-606d-4f5f-841a-9a071a3d465e.jpg",
  "/effect/5d13bdc6-329f-4475-92a6-bbc8703f4034.jpg",
  "/effect/697b54f4-0941-43d6-8577-06442d49cd4d.jpg",
  "/effect/79a6397c-83cc-419e-b42e-431d0db6b773.jpg",
  "/effect/7a628fe3-6633-4f87-9c50-a91b14402c8e.jpg",
  "/effect/a422bcd0-20ed-4496-b909-2e5b081e61e7.jpg",
  "/effect/c70ea786-873a-484e-a4e3-597f00985821.jpg",
  "/effect/c86b0964-cb67-4402-b227-5b53305c2bc2.jpg",
  "/effect/ee13c0e5-e668-492b-9334-dcf861cb7dab.jpg",
  "/effect/f3d7d5f9-0f21-460a-9e3b-c1465495ae90.jpg",
  "/effect/f8b65eac-dcf8-4c36-ad5e-a911872a4bd2.jpg",
  "/effect/f8b65eac-dcf8-4c36-ad5e-a911872a4bd9.jpg",
];

// 手动分配3行，每行8张，确保行间无重复、视觉均匀
const FILM_COLUMNS = [
  [0, 5, 10, 3, 14, 7, 12, 1],
  [4, 11, 8, 16, 2, 13, 6, 9],
  [15, 3, 9, 6, 11, 0, 14, 8],
].map(row => row.map((idx, col) => ({
  title: `Scene ${col + 1}`,
  img: EFFECT_IMAGES[idx % EFFECT_IMAGES.length],
})));

// 3行配置：尺寸（small/large）+ 动画时长 + 方向
const ROW_CONFIGS: { size: "small" | "large"; duration: number; reverse: boolean }[] = [
  { size: "small", duration: 200, reverse: false },
  { size: "large", duration: 240, reverse: true },
  { size: "small", duration: 200, reverse: false },
];

// 胶片齿孔组件
function FilmPerforations({ side, count = 8 }: { side: 'top' | 'bottom'; count?: number }) {
  return (
    <div className={cn(
      "absolute left-0 right-0 flex justify-around px-4 z-10",
      side === 'top' ? 'top-[3px]' : 'bottom-[3px]',
    )}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="w-[10px] h-[6px] rounded-[1px] bg-black/50 border border-white/5"
        />
      ))}
    </div>
  );
}

const CARD_SIZES = {
  small: { width: 220, height: 150, perforations: 6 },
  large: { width: 520, height: 320, perforations: 12 },
} as const;

function FilmCard({ title, img, size = "small" }: { title: string; img: string; size?: "small" | "large" }) {
  const { width, height, perforations } = CARD_SIZES[size];
  return (
    <div className="relative shrink-0" style={{ width, height }}>
      {/* 胶片带外框 */}
      <div className="absolute inset-0 bg-zinc-900/90 border border-white/5" />

      {/* 上下齿孔 */}
      <FilmPerforations side="top" count={perforations} />
      <FilmPerforations side="bottom" count={perforations} />

      {/* 图片区域（上下留出胶片边框） */}
      <div className="absolute top-[12px] bottom-[12px] left-[6px] right-[6px] overflow-hidden">
        <img
          src={img}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {/* 胶片划痕/晃电噪点覆层 */}
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, transparent 4px)`,
          }}
        />
      </div>
    </div>
  );
}

function FilmStripRow({ cards, duration, reverse, size = "small" }: {
  cards: { title: string; img: string }[];
  duration: number;
  reverse: boolean;
  size?: "small" | "large";
}) {
  const repeatedCards = [...cards, ...cards, ...cards, ...cards, ...cards];
  const rowHeight = CARD_SIZES[size].height;
  return (
    <div className="relative w-full shrink-0 overflow-hidden" style={{ height: rowHeight }}>
      <div
        className="flex flex-row gap-0 w-max"
        style={{
          animation: `film-scroll-x ${duration}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {repeatedCards.map((card, i) => (
          <FilmCard key={`${card.title}-${i}`} {...card} size={size} />
        ))}
      </div>
    </div>
  );
}

// 表单字段配置（动态国际化）
// autoComplete 语义对齐 WHATWG 规范：邮箱/用户名/当前密码/新密码，便于密码管理器识别与自动填充
function getFormFields(t: (key: string) => string) {
  return {
    login: [
      { name: "email", type: "email", label: t("login.email"), placeholder: t("login.emailPlaceholder"), icon: Mail, required: true, autoComplete: "email" },
      { name: "password", type: "password", label: t("login.password"), placeholder: t("login.passwordPlaceholder"), icon: Lock, required: true, autoComplete: "current-password" },
    ],
    register: [
      { name: "email", type: "email", label: t("login.email"), placeholder: t("login.emailPlaceholder"), icon: Mail, required: true, autoComplete: "email" },
      { name: "nickname", type: "text", label: t("login.nickname"), placeholder: t("login.nicknamePlaceholder"), icon: User, required: true, autoComplete: "username" },
      { name: "password", type: "password", label: t("login.password"), placeholder: t("login.passwordMinPlaceholder"), icon: Lock, required: true, minLength: 6, autoComplete: "new-password" },
      { name: "confirmPassword", type: "password", label: t("login.confirmPassword"), placeholder: t("login.confirmPasswordPlaceholder"), icon: Lock, required: true, autoComplete: "new-password" },
    ],
  };
}

// 验证规则（动态国际化）
function getValidators(t: (key: string) => string): Record<string, (value: string, formData?: Record<string, string>) => string | null> {
  return {
    email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : t("login.emailInvalid"),
    password: (value) => {
      return (value?.length ?? 0) < 6 ? t("login.passwordMin") : null;
    },
    confirmPassword: (value, formData) => value === formData?.password ? null : t("login.confirmPasswordMismatch"),
    nickname: (value) => (value?.length ?? 0) >= 1 ? null : t("login.nicknameRequired"),
  };
}

const LANGUAGES = [
  { code: "zh-CN", label: "中文", flag: "中" },
  { code: "en-US", label: "English", flag: "En" },
] as const;

// Google SVG icon
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// GitHub SVG icon
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const { login } = useAuth();
  const { restoreTheme } = useTheme();
  const { message } = App.useApp();

  // 登录后恢复用户主题/语言偏好
  const applyUserPreferences = (u: TokenResponse["user"]) => {
    const theme = u.preferred_theme as "light" | "dark" | "system" | undefined;
    theme && restoreTheme(theme);
    u.preferred_language && i18n.changeLanguage(u.preferred_language);
  };

  const FORM_FIELDS = useMemo(() => getFormFields(t), [t]);
  const VALIDATORS = useMemo(() => getValidators(t), [t]);

  // 表单验证
  const validateField = (name: string, value: string): string | null => {
    const validator = VALIDATORS[name];
    return validator?.(value, formData) ?? null;
  };

  const validateForm = (): boolean => {
    const currentFields = FORM_FIELDS[mode];
    const newErrors: Record<string, string> = {};
    let isValid = true;

    currentFields.forEach((field) => {
      const value = formData[field.name] || "";
      const error = field.required && !value 
        ? t("login.fieldRequired", { label: field.label })
        : validateField(field.name, value);
      
      error && (newErrors[field.name] = error, isValid = false);
    });

    setErrors(newErrors);
    return isValid;
  };

  // 输入处理
  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    errors[name] && setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // 切换模式
  const switchMode = () => {
    setMode((prev) => prev === "login" ? "register" : "login");
    setFormData({});
    setErrors({});
  };

  // 登录处理
  const handleLogin = async () => {
    const { email, password } = formData;
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/auth/login", { email, password });
      // 恢复用户偏好
      applyUserPreferences(data.user);
      message.success(t("login.loginSuccess", { name: data.user.nickname }));
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      message.error(err.response?.data?.detail || t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  // 注册处理
  const handleRegister = async () => {
    const { email, nickname, password } = formData;
    setLoading(true);
    try {
      await api.post("/auth/register", { email, nickname, password });
      const { data } = await api.post<TokenResponse>("/auth/login", { email, password });
      // 恢复用户偏好
      applyUserPreferences(data.user);
      message.success(t("login.registerSuccess", { name: data.user.nickname }));
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      message.error(err.response?.data?.detail || t("login.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  // 提交处理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateForm() && (mode === "login" ? handleLogin() : handleRegister());
  };

  // 切换密码显示
  const togglePasswordVisibility = (fieldName: string) => {
    setShowPassword((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const currentFields = FORM_FIELDS[mode];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* ===== Layer 0: Logo in top-left corner ===== */}
      <div className="fixed top-6 left-6 z-50 flex items-center gap-3">
        <Logo size={36} />
        <span className="text-xl font-bold text-foreground tracking-tight">KunFlix</span>
      </div>

      {/* ===== Layer 1: Full-screen Film Strip Background ===== */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Film strip rows with 45° diagonal scrolling */}
        <div
          className="absolute flex flex-col justify-center gap-20"
          style={{
            transform: 'rotate(-45deg)',
            transformOrigin: 'center center',
            width: '200vw',
            height: '200vh',
            top: '-50vh',
            left: '-50vw',
          }}
        >
          {FILM_COLUMNS.map((cards, rowIdx) => (
            <FilmStripRow
              key={rowIdx}
              cards={cards}
              duration={ROW_CONFIGS[rowIdx].duration}
              reverse={ROW_CONFIGS[rowIdx].reverse}
              size={ROW_CONFIGS[rowIdx].size}
            />
          ))}
        </div>
      </div>

      {/* ===== Layer 1.5: Frosted Glass Overlay ===== */}
      <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-[1px]" />

      {/* ===== Layer 2: Floating Form ===== */}
      <div className="relative z-30 flex items-center justify-center h-full p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          {/* Form Card */}
          <div className="bg-card/80 backdrop-blur-2xl border border-border/50 rounded-2xl p-6 sm:p-8 shadow-2xl">
            {/* Language Switcher */}
            <div className="flex justify-end mb-2 -mt-1 -mr-2 relative" data-lang-menu>
              <button
                onClick={() => setLangMenuOpen((v) => !v)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                aria-label="Switch language"
              >
                <Globe className="h-4 w-4" />
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 py-1 rounded-xl bg-popover border border-border shadow-lg z-50">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { i18n.changeLanguage(lang.code); setLangMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                        i18n.language === lang.code
                          ? "text-foreground bg-secondary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                    >
                      <span className="text-xs">{lang.flag}</span>
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {mode === "login" ? t("login.welcomeBack") : t("login.createAccount")}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {mode === "login" ? t("login.loginSubtitle") : t("login.registerSubtitle")}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: mode === "register" ? 24 : -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: mode === "register" ? -24 : 24 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="space-y-5"
                >
                  {currentFields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        {field.label}
                      </label>
                      <div className="relative">
                        <field.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                          type={field.type === "password" && showPassword[field.name] ? "text" : field.type}
                          name={field.name}
                          autoComplete={field.autoComplete}
                          value={formData[field.name] || ""}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          className={cn(
                            "w-full h-11 pl-10 pr-10 rounded-lg",
                            "bg-secondary/50 border border-border",
                            "text-foreground placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                            "transition-all duration-200",
                            errors[field.name] && "border-destructive focus:border-destructive focus:ring-destructive/20"
                          )}
                        />
                        {field.type === "password" && (
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(field.name)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPassword[field.name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      {errors[field.name] && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs text-destructive mt-1.5"
                        >
                          {errors[field.name]}
                        </motion.p>
                      )}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={cn(
                  "w-full h-11 flex items-center justify-center gap-2",
                  "bg-primary text-primary-foreground font-medium rounded-lg",
                  "hover:bg-primary/90 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "mt-6"
                )}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? t("login.submit") : t("login.register")}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            {/* Switch Mode */}
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {mode === "login" ? t("login.noAccount") : t("login.hasAccount")}
                <button
                  type="button"
                  onClick={switchMode}
                  className="ml-1 text-primary hover:underline font-medium transition-colors"
                >
                  {mode === "login" ? t("login.registerNow") : t("login.backToLogin")}
                </button>
              </p>
            </div>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {t("login.orContinueWith")}
                </span>
              </div>
            </div>

            {/* Social Login Buttons */}
            <div className="flex flex-col gap-3">
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => message.info("Google OAuth - Coming soon")}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-lg",
                  "bg-secondary/50 border border-border",
                  "text-foreground text-sm font-medium",
                  "hover:bg-secondary transition-colors"
                )}
              >
                <GoogleIcon className="h-4 w-4" />
                {t("login.continueWithGoogle")}
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => message.info("GitHub OAuth - Coming soon")}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-lg",
                  "bg-secondary/50 border border-border",
                  "text-foreground text-sm font-medium",
                  "hover:bg-secondary transition-colors"
                )}
              >
                <GitHubIcon className="h-4 w-4" />
                {t("login.continueWithGitHub")}
              </motion.button>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground/70 mt-4">
              {t("login.termsNotice")}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
