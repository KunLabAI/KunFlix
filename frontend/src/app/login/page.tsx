"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, Lock, User, ArrowRight, Sparkles, Film, Palette, Zap,
  Eye, EyeOff, Loader2
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { TokenResponse } from "@/context/AuthContext";
import api from "@/lib/api";
import { App } from "antd";
import { cn } from "@/lib/utils";

// 特性展示配置
const FEATURES = [
  { icon: Film, label: "AI 视频生成", desc: "一键生成高质量视频" },
  { icon: Palette, label: "智能画布", desc: "可视化创作工作流" },
  { icon: Zap, label: "多模态创作", desc: "图文音视频一站式" },
];

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
    <div className="min-h-screen flex bg-background">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Animated Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-node-purple/20 via-background to-node-blue/20 animate-gradient" />
        
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-node-purple to-node-blue flex items-center justify-center shadow-lg shadow-node-purple/20">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-foreground">KunFlix</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-foreground mb-4 leading-tight">
              KunFlix
            </h1>
            <p className="text-lg text-muted-foreground mb-12 max-w-md">
              AI 驱动的多模态创作平台，让创意无限延伸
            </p>

            {/* Features */}
            <div className="space-y-4">
              {FEATURES.map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 backdrop-blur-sm border border-border/50"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{feature.label}</p>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-node-purple to-node-blue flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">KunFlix</span>
          </div>

          {/* Form Card */}
          <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-2xl p-6 sm:p-8 shadow-xl">
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
              <AnimatePresence mode="wait">
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
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            登录即表示您同意我们的服务条款和隐私政策
          </p>
        </motion.div>
      </div>
    </div>
  );
}
