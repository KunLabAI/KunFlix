'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  Zap,
  Users,
  BookOpen,
  Menu,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { logout } = useAuth();

  // If login page, don't show layout
  if (pathname === '/admin/login') {
    return <>{children}<Toaster /></>;
  }

  const items = [
    {
      title: '仪表盘',
      href: '/admin',
      icon: LayoutDashboard,
    },
    {
      title: 'AI 供应商',
      href: '/admin/llm',
      icon: Bot,
    },
    {
      title: '智能体管理',
      href: '/admin/agents',
      icon: Zap,
    },
    {
      title: '玩家管理',
      href: '/admin/players',
      icon: Users,
    },
    {
      title: '故事管理',
      href: '/admin/stories',
      icon: BookOpen,
    },
  ];

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-10 hidden flex-col border-r bg-background sm:flex transition-all duration-300",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <div className={cn("flex h-14 items-center border-b px-4 lg:h-[60px]", collapsed ? "justify-center" : "gap-2")}>
          <div className="flex items-center gap-2 font-semibold">
            <span className={cn("text-lg transition-all", collapsed && "hidden")}>Infinite Game</span>
            {collapsed && <span className="text-lg">IG</span>}
          </div>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            {items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                    isActive ? "bg-muted text-primary" : "text-muted-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <item.icon className="h-4 w-4" />
                  {!collapsed && item.title}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
           {/* Footer content if needed */}
        </div>
      </aside>

      <div className={cn("flex flex-col sm:pl-64 transition-all duration-300 w-full", collapsed && "sm:pl-14")}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <Button
            variant="outline"
            size="icon"
            className="hidden sm:flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            <span className="sr-only">Toggle Menu</span>
          </Button>
          
          {/* Mobile Menu Trigger could be added here for mobile view */}

          <div className="ml-auto flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                  <span className="sr-only">Toggle user menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>我的账户</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 sm:px-6 sm:py-0 md:gap-8 lg:py-4">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default AdminLayout;
