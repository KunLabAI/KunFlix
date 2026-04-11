'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Mail, Lock, Shield, Eye, EyeOff, AlertCircle, X, Globe } from 'lucide-react';
import api from '@/lib/axios';
import { Alert, AlertDescription } from '@/components/ui/alert';

// 管理员登录响应类型
interface AdminTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  admin: {
    id: string;
    email: string;
    nickname: string;
    permission_level: string;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
}

const LANGUAGES = [
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
] as const;

type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>;

function createLoginSchema(t: (key: string) => string) {
  return z.object({
    email: z.string().email({ message: t('login.emailRequired') }),
    password: z.string().min(1, { message: t('login.passwordRequired') }),
    rememberEmail: z.boolean().optional(),
  });
}

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
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const loginSchema = useMemo(() => createLoginSchema(t), [t]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { 
      email: '', 
      password: '',
      rememberEmail: false,
    },
  });

  // 加载记住的邮箱
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('admin_remembered_email');
    if (rememberedEmail) {
      loginForm.setValue('email', rememberedEmail);
      loginForm.setValue('rememberEmail', true);
    }
  }, [loginForm]);

  // 点击外部关闭语言菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      !target.closest('[data-lang-menu]') && setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const switchLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setLangMenuOpen(false);
  };

  async function onLogin(values: LoginValues) {
    setLoading(true);
    setLoginError(null);
    
    try {
      const { data } = await api.post<AdminTokenResponse>('/admin/auth/login', {
        email: values.email,
        password: values.password,
      });
      
      // 处理记住邮箱
      values.rememberEmail
        ? localStorage.setItem('admin_remembered_email', values.email)
        : localStorage.removeItem('admin_remembered_email');
      
      toast({ title: t('login.loginSuccess'), description: t('login.welcomeBack', { name: data.admin.nickname }) });
      login(data.access_token, data.refresh_token, data.admin);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      
      const errorMap: Record<number, string> = {
        401: detail || t('login.wrongCredentials'),
        403: detail || t('login.accountDisabled'),
        422: t('login.invalidParams'),
      };
      
      let errorMessage = errorMap[status as number]
        ?? (status >= 500 ? t('login.serverError') : undefined)
        ?? (!err.response ? t('login.networkError') : undefined)
        ?? t('login.loginFailed');
      
      setLoginError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (errors: any) => {
    const firstErrorKey = Object.keys(errors)[0];
    setLoginError(
      firstErrorKey && errors[firstErrorKey]
        ? (errors[firstErrorKey].message as string)
        : t('login.inputError')
    );
  };

  return (
    <div className="flex justify-center items-center h-screen bg-muted/50 px-4">
      <Card className="w-full max-w-[400px] shadow-lg">
        <CardHeader className="text-center relative">
          {/* 语言切换 */}
          <div className="absolute right-4 top-4" data-lang-menu>
            <button
              onClick={() => setLangMenuOpen((v) => !v)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Switch language"
            >
              <Globe className="h-4 w-4" />
            </button>
            {langMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 py-1 rounded-xl bg-popover border border-border shadow-lg z-50">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => switchLanguage(lang.code)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      i18n.language === lang.code
                        ? 'text-foreground bg-secondary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    <span className="text-xs">{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-center mb-2">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>{t('login.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loginError && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 mb-4">
              <Alert variant="destructive" className="relative pr-8">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="ml-2 font-medium text-sm leading-normal flex items-center min-h-[20px]">
                  {loginError}
                </AlertDescription>
                <button
                  type="button"
                  onClick={() => setLoginError(null)}
                  className="absolute right-2 top-2 p-1 rounded-full hover:bg-destructive-foreground/10 text-destructive hover:text-destructive/80 transition-colors"
                  aria-label={t('login.closeAlert')}
                >
                  <X className="h-4 w-4" />
                </button>
              </Alert>
            </div>
          )}
          
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(onLogin, onInvalid)} className="space-y-4">
              <FormField
                control={loginForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.email')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          className="pl-9" 
                          placeholder={t('login.emailPlaceholder')}
                          autoComplete="email"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          type={showPassword ? 'text' : 'password'} 
                          className="pl-9 pr-10" 
                          placeholder={t('login.passwordPlaceholder')}
                          autoComplete="current-password"
                          {...field} 
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={loginForm.control}
                name="rememberEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        {t('login.rememberEmail')}
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            KunFlix Admin
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
