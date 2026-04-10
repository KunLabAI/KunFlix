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

// 影视作品卡片数据 - 4列不同的图片集
const FILM_COLUMNS = [
  [
    { title: "Breaking Bad", img: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=280&h=380&fit=crop" },
    { title: "Stranger Things", img: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=280&h=380&fit=crop" },
    { title: "The Crown", img: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=280&h=380&fit=crop" },
    { title: "Dark", img: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=280&h=380&fit=crop" },
    { title: "Westworld", img: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=280&h=380&fit=crop" },
    { title: "Dune", img: "https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=280&h=380&fit=crop" },
    { title: "Interstellar", img: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=280&h=380&fit=crop" },
    { title: "Blade Runner", img: "https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=280&h=380&fit=crop" },
  ],
  [
    { title: "Game of Thrones", img: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=280&h=380&fit=crop" },
    { title: "The Witcher", img: "https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=280&h=380&fit=crop" },
    { title: "Vikings", img: "https://images.unsplash.com/photo-1500252185289-40ca85eb23a7?w=280&h=380&fit=crop" },
    { title: "Peaky Blinders", img: "https://images.unsplash.com/photo-1494972308805-463bc619d34e?w=280&h=380&fit=crop" },
    { title: "The Mandalorian", img: "https://images.unsplash.com/photo-1534996858221-380b92700493?w=280&h=380&fit=crop" },
    { title: "Arrival", img: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=280&h=380&fit=crop" },
    { title: "Avatar", img: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=280&h=380&fit=crop" },
    { title: "The Matrix", img: "https://images.unsplash.com/photo-1464802686167-b939a6910659?w=280&h=380&fit=crop" },
  ],
  [
    { title: "Black Mirror", img: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=280&h=380&fit=crop" },
    { title: "Chernobyl", img: "https://images.unsplash.com/photo-1504192010706-dd7f569ee2be?w=280&h=380&fit=crop" },
    { title: "The Expanse", img: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=280&h=380&fit=crop" },
    { title: "Altered Carbon", img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=280&h=380&fit=crop" },
    { title: "Foundation", img: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=280&h=380&fit=crop" },
    { title: "Cosmos", img: "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=280&h=380&fit=crop" },
    { title: "Gravity", img: "https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=280&h=380&fit=crop" },
    { title: "Moon", img: "https://images.unsplash.com/photo-1522030299830-16b8d3d049fe?w=280&h=380&fit=crop" },
  ],
  [
    { title: "True Detective", img: "https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=280&h=380&fit=crop" },
    { title: "Severance", img: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=280&h=380&fit=crop" },
    { title: "Mindhunter", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=280&h=380&fit=crop" },
    { title: "The Last of Us", img: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=280&h=380&fit=crop" },
    { title: "Succession", img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=280&h=380&fit=crop" },
    { title: "Nebula", img: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=280&h=380&fit=crop" },
    { title: "Eclipse", img: "https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=280&h=380&fit=crop" },
    { title: "Mars", img: "https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=280&h=380&fit=crop" },
  ],
  [
    { title: "Ozark", img: "https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=280&h=380&fit=crop" },
    { title: "Mr. Robot", img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=280&h=380&fit=crop" },
    { title: "Fargo", img: "https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=280&h=380&fit=crop" },
    { title: "Better Call Saul", img: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=280&h=380&fit=crop" },
    { title: "The Boys", img: "https://images.unsplash.com/photo-1535016120720-40c646be5580?w=280&h=380&fit=crop" },
    { title: "Solaris", img: "https://images.unsplash.com/photo-1454789548928-9efd52dc4031?w=280&h=380&fit=crop" },
    { title: "Horizon", img: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=280&h=380&fit=crop" },
    { title: "Aurora", img: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=280&h=380&fit=crop" },
  ],
  [
    { title: "House of Cards", img: "https://images.unsplash.com/photo-1501466044931-62695aada8e9?w=280&h=380&fit=crop" },
    { title: "Narcos", img: "https://images.unsplash.com/photo-1518173946687-a1e0e2e3e14c?w=280&h=380&fit=crop" },
    { title: "Sherlock", img: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=280&h=380&fit=crop" },
    { title: "The Haunting", img: "https://images.unsplash.com/photo-1510070112808-e47d3005c0c9?w=280&h=380&fit=crop" },
    { title: "Euphoria", img: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=280&h=380&fit=crop" },
    { title: "Void", img: "https://images.unsplash.com/photo-1475274047050-1d0c55b7b10f?w=280&h=380&fit=crop" },
    { title: "Signal", img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=280&h=380&fit=crop" },
    { title: "Spectrum", img: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=280&h=380&fit=crop" },
  ],
];

// 每行的动画配置：时长和方向（交错排列）
const ROW_CONFIGS = [
  { duration: 240, reverse: false },
  { duration: 240, reverse: true },
  { duration: 220, reverse: false },
  { duration: 232, reverse: true },
  { duration: 240, reverse: false },
  { duration: 240, reverse: true },
];

// 胶片齿孔组件
function FilmPerforations({ side }: { side: 'top' | 'bottom' }) {
  return (
    <div className={cn(
      "absolute left-0 right-0 flex justify-around px-4 z-10",
      side === 'top' ? 'top-[3px]' : 'bottom-[3px]',
    )}>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="w-[10px] h-[6px] rounded-[1px] bg-black/50 border border-white/5"
        />
      ))}
    </div>
  );
}

function FilmCard({ title, img }: { title: string; img: string }) {
  return (
    <div className="relative w-[260px] h-[180px] shrink-0">
      {/* 胶片带外框 */}
      <div className="absolute inset-0 bg-zinc-900/90 border border-white/5" />

      {/* 上下齿孔 */}
      <FilmPerforations side="top" />
      <FilmPerforations side="bottom" />

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

function FilmStripRow({ cards, duration, reverse }: {
  cards: { title: string; img: string }[];
  duration: number;
  reverse: boolean;
}) {
  const repeatedCards = [...cards, ...cards, ...cards, ...cards, ...cards];
  return (
    <div className="relative w-full h-[180px] shrink-0 overflow-hidden">
      <div
        className="flex flex-row gap-0 w-max"
        style={{
          animation: `film-scroll-x ${duration}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {repeatedCards.map((card, i) => (
          <FilmCard key={`${card.title}-${i}`} {...card} />
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
          className="absolute flex flex-col justify-center gap-16"
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
            />
          ))}
        </div>
      </div>

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
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {mode === "login" ? "欢迎回来" : "创建账号"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {mode === "login" ? "登录以继续您的创作之旅" : "开始您的无限创作之旅"}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence>
                {currentFields.map((field, index) => (
                  <motion.div
                    key={`${mode}-${field.name}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                  >
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
                  </motion.div>
                ))}
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
