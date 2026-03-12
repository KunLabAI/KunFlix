'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Mail, Lock, Shield, Eye, EyeOff, AlertCircle, X } from 'lucide-react';
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

const loginSchema = z.object({
  email: z.string().email({ message: '请输入有效的邮箱地址' }),
  password: z.string().min(1, { message: '请输入密码' }),
  rememberEmail: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { login } = useAuth();
  const { toast } = useToast();

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

  async function onLogin(values: LoginValues) {
    setLoading(true);
    setLoginError(null);
    
    try {
      // 调用管理员登录接口
      const { data } = await api.post<AdminTokenResponse>('/admin/auth/login', {
        email: values.email,
        password: values.password,
      });
      
      // 处理记住邮箱
      if (values.rememberEmail) {
        localStorage.setItem('admin_remembered_email', values.email);
      } else {
        localStorage.removeItem('admin_remembered_email');
      }
      
      toast({ title: '登录成功', description: `欢迎回来，${data.admin.nickname}` });
      login(data.access_token, data.refresh_token, data.admin);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      
      let errorMessage = '登录失败，请稍后重试';
      
      if (status === 401) {
        errorMessage = detail || '邮箱或密码错误，请检查后重试';
      } else if (status === 403) {
        errorMessage = detail || '账户已被禁用，请联系超级管理员';
      } else if (status === 422) {
        errorMessage = '请求参数错误，请检查输入格式';
      } else if (status >= 500) {
        errorMessage = '服务器错误，请稍后重试';
      } else if (!err.response) {
        errorMessage = '网络连接失败，请检查网络设置';
      }
      
      setLoginError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  // 表单验证错误处理
  const onInvalid = (errors: any) => {
    const firstErrorKey = Object.keys(errors)[0];
    if (firstErrorKey && errors[firstErrorKey]) {
      setLoginError(errors[firstErrorKey].message as string);
    } else {
      setLoginError('输入信息有误，请检查');
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-muted/50 px-4">
      <Card className="w-full max-w-[400px] shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>管理员登录</CardTitle>
          <CardDescription>
            请输入管理员邮箱和密码
          </CardDescription>
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
                  aria-label="关闭提示"
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
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          className="pl-9" 
                          placeholder="admin@example.com" 
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
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          type={showPassword ? 'text' : 'password'} 
                          className="pl-9 pr-10" 
                          placeholder="请输入密码" 
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
                        记住邮箱
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            Infinite Game 管理后台
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
