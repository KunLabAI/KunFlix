'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  Zap,
  Users,
  BookOpen,
  CreditCard,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MoreHorizontal,
  FileCode2,
  Film,
  Blocks,
  ServerCog
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
  const { logout, user } = useAuth();

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
      title: '技能管理 (Skills)',
      href: '/admin/skills',
      icon: Blocks,
    },
    {
      title: 'MCP 客户端',
      href: '/admin/mcp',
      icon: ServerCog,
    },
    {
      title: '视频生成',
      href: '/admin/videos',
      icon: Film,
    },
    {
      title: '提示词模板',
      href: '/admin/prompt-templates',
      icon: FileCode2,
    },
    {
      title: '用户管理',
      href: '/admin/users',
      icon: Users,
    },
    {
      title: '订阅套餐',
      href: '/admin/subscriptions',
      icon: CreditCard,
    },
    {
      title: '管理员',
      href: '/admin/admins',
      icon: Shield,
    },
  ];

  return (
    <div className="fixed inset-0 flex w-full h-full bg-muted/40 overflow-hidden">
      <aside
        className={cn(
          "hidden border-r bg-background sm:flex flex-col transition-all duration-300",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <div className={cn("flex h-14 items-center border-b px-3 lg:h-[60px]", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <div className="flex items-center gap-2 font-semibold truncate">
              <span className="text-lg ml-2">Infinite Theater</span>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", collapsed ? "" : "")}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="sr-only">Toggle Menu</span>
          </Button>
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
        
        <div className="mt-auto p-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("w-full justify-start pl-0 hover:bg-muted", collapsed && "justify-center px-0")}>
                <div className="flex items-center gap-2 w-full">
                   <Avatar className="h-8 w-8">
                      <AvatarImage src="/avatars/01.png" alt="@admin" />
                      <AvatarFallback>AD</AvatarFallback>
                   </Avatar>
                   {!collapsed && (
                     <div className="flex flex-col items-start text-xs flex-1 min-w-0">
                       <span className="font-medium truncate w-full text-left">{user?.nickname || '管理员'}</span>
                       <span className="text-muted-foreground truncate w-full text-left">{user?.email || 'admin@infinitetheater.com'}</span>
                     </div>
                   )}
                   {!collapsed && <MoreHorizontal className="h-4 w-4 text-muted-foreground ml-auto" />}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-56" sideOffset={10}>
                <DropdownMenuLabel>{user?.nickname || '我的账户'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>退出登录</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 w-full h-full overflow-hidden">
        <main className="flex-1 min-h-0 w-full h-full p-8 overflow-hidden">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default AdminLayout;
