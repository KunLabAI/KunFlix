'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
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
import { Mail, Lock, UserIcon } from 'lucide-react';
import api from '@/lib/axios';
import type { TokenResponse } from '@/types';

const loginSchema = z.object({
  email: z.string().email({ message: '请输入有效的邮箱地址' }),
  password: z.string().min(1, { message: '请输入密码' }),
});

const registerSchema = z
  .object({
    email: z.string().email({ message: '请输入有效的邮箱地址' }),
    nickname: z.string().min(1, { message: '请输入昵称' }).max(100),
    password: z.string().min(6, { message: '密码至少6位' }),
    confirmPassword: z.string().min(1, { message: '请确认密码' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', nickname: '', password: '', confirmPassword: '' },
  });

  async function onLogin(values: LoginValues) {
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>('/auth/login', {
        email: values.email,
        password: values.password,
      });
      toast({ title: '登录成功', description: `欢迎回来，${data.user.nickname}` });
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      const detail = err.response?.data?.detail || '登录失败，请检查邮箱和密码';
      toast({ variant: 'destructive', title: '登录失败', description: detail });
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(values: RegisterValues) {
    setLoading(true);
    try {
      // Register
      await api.post('/auth/register', {
        email: values.email,
        nickname: values.nickname,
        password: values.password,
      });

      // Auto-login after registration
      const { data } = await api.post<TokenResponse>('/auth/login', {
        email: values.email,
        password: values.password,
      });
      toast({ title: '注册成功', description: `欢迎，${data.user.nickname}` });
      login(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      const detail = err.response?.data?.detail || '注册失败，请稍后重试';
      toast({ variant: 'destructive', title: '注册失败', description: detail });
    } finally {
      setLoading(false);
    }
  }

  const switchMode = (target: 'login' | 'register') => {
    setMode(target);
    loginForm.reset();
    registerForm.reset();
  };

  return (
    <div className="flex justify-center items-center h-screen bg-muted/50">
      <Card className="w-[400px] shadow-lg">
        <CardHeader className="text-center">
          <CardTitle>{mode === 'login' ? '用户登录' : '用户注册'}</CardTitle>
          <CardDescription>
            {mode === 'login' ? '请输入您的邮箱和密码' : '创建新账户'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'login' ? (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>邮箱</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input className="pl-9" placeholder="your@email.com" {...field} />
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
                          <Input type="password" className="pl-9" placeholder="密码" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? '登录中...' : '登录'}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>邮箱</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input className="pl-9" placeholder="your@email.com" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>昵称</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <UserIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input className="pl-9" placeholder="显示昵称" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密码</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input type="password" className="pl-9" placeholder="至少6位" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>确认密码</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input type="password" className="pl-9" placeholder="再次输入密码" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? '注册中...' : '注册'}
                </Button>
              </form>
            </Form>
          )}

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                还没有账号？{' '}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode('register')}
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？{' '}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode('login')}
                >
                  返回登录
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
