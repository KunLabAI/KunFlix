"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, Lock, User, ArrowRight,
  Eye, EyeOff, Loader2
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { TokenResponse } from "@/context/AuthContext";
import api from "@/lib/api";
import { App } from "antd";
import { cn } from "@/lib/utils";

// 本地素材图片
const EFFECT_IMAGES = [
  "/effect/023576f6-ce4d-4e16-ae0f-22ce69ac363e.png",
  "/effect/0d563961-5ad4-4d26-8d21-7b0152302e46.jpg",
  "/effect/1619b2eb-11a6-4302-9b0a-c4ee79283af6.jpg",
  "/effect/18c5dedb-6fe7-4708-b864-afab675ca140.png",
  "/effect/2d25e12c-adff-476d-8eaa-6a0cc73371f3.jpg",
  "/effect/30a18532-606d-4f5f-841a-9a071a3d465e.png",
  "/effect/5d13bdc6-329f-4475-92a6-bbc8703f4034.png",
  "/effect/697b54f4-0941-43d6-8577-06442d49cd4d.png",
  "/effect/79a6397c-83cc-419e-b42e-431d0db6b773.png",
  "/effect/7a628fe3-6633-4f87-9c50-a91b14402c8e.png",
  "/effect/a422bcd0-20ed-4496-b909-2e5b081e61e7.jpg",
  "/effect/c70ea786-873a-484e-a4e3-597f00985821.jpg",
  "/effect/c86b0964-cb67-4402-b227-5b53305c2bc2.png",
  "/effect/ee13c0e5-e668-492b-9334-dcf861cb7dab.jpg",
  "/effect/f3d7d5f9-0f21-460a-9e3b-c1465495ae90.jpg",
  "/effect/f8b65eac-dcf8-4c36-ad5e-a911872a4bd2.png",
  "/effect/f8b65eac-dcf8-4c36-ad5e-a911872a4bd9.png",
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

// 表单字段配置
const FORM_FIELDS = {
  login: [
    { name: "email", type: "email", label: "邮箱", placeholder: "请输入邮箱", icon: Mail, required: true },
    { name: "password", type: "password", label: "密码", placeholder: "请输入密码", icon: Lock, required: true },
  ],
  register: [
    { name: "email", type: "email", label: "邮箱", placeholder: "请输入邮箱", icon: Mail, required: true },
    { name: "nickname", type: "text", label: "昵称", placeholder: "请输入昵称", icon: User, required: true },
    { name: "password", type: "password", label: "密码", placeholder: "至少6位字符", icon: Lock, required: true, minLength: 6 },
    { name: "confirmPassword", type: "password", label: "确认密码", placeholder: "再次输入密码", icon: Lock, required: true },
  ],
};

// 验证规则
const VALIDATORS: Record<string, (value: string, formData?: Record<string, string>) => string | null> = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "请输入有效的邮箱地址",
  password: (value, formData) => {
    if ((value?.length ?? 0) < 6) return "密码至少6位";
    return null;
  },
  confirmPassword: (value, formData) => value === formData?.password ? null : "两次密码不一致",
  nickname: (value) => (value?.length ?? 0) >= 1 ? null : "请输入昵称",
};

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { login } = useAuth();
  const { message } = App.useApp();

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
        ? `请输入${field.label}` 
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
      message.success(`欢迎回来，${data.user.nickname}`);
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      message.error(err.response?.data?.detail || "登录失败");
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
      message.success(`欢迎，${data.user.nickname}`);
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      message.error(err.response?.data?.detail || "注册失败");
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
                    {mode === "login" ? "欢迎回来" : "创建账号"}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {mode === "login" ? "登录以继续您的创作之旅" : "开始您的无限创作之旅"}
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
                    {mode === "login" ? "登录" : "注册"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            {/* Switch Mode */}
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {mode === "login" ? "还没有账号？" : "已有账号？"}
                <button
                  type="button"
                  onClick={switchMode}
                  className="ml-1 text-primary hover:underline font-medium transition-colors"
                >
                  {mode === "login" ? "立即注册" : "返回登录"}
                </button>
              </p>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground/70 mt-4">
              登录即表示您同意我们的服务条款和隐私政策
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
