"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Menu, User, Sun, Moon } from "lucide-react";
import { Button, Dropdown, Avatar, Input, Drawer } from "antd";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  const menuItems = [
    {
      key: "profile",
      label: "个人资料",
      onClick: () => console.log("Profile clicked"),
    },
    {
      key: "settings",
      label: "设置",
      onClick: () => console.log("Settings clicked"),
    },
    {
      key: "logout",
      label: "退出登录",
      onClick: logout,
    },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center bg-background/80 backdrop-blur-md transition-colors duration-300 border-b border-border/10">
      <div className="w-full max-w-[1440px] flex items-center justify-between px-6 py-4">
        {/* Menu Button */}
        <Button
          type="text"
          className="hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          icon={<Menu className="w-5 h-5 text-foreground" />}
          onClick={() => setMenuVisible(true)}
        />

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex items-center">
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: searchVisible ? 240 : 0, opacity: searchVisible ? 1 : 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <Input 
                placeholder="搜索剧场..." 
                className="w-full rounded-full bg-accent/50 border-transparent focus:border-primary hover:border-primary/50 transition-colors" 
              />
            </motion.div>
            <Button
              type="text"
              className="ml-2 hover:bg-accent hover:text-accent-foreground rounded-full transition-colors"
              icon={<Search className="w-5 h-5 text-foreground" />}
              onClick={() => setSearchVisible(!searchVisible)}
            />
          </div>

          {/* Theme Toggle */}
          <Button
            type="text"
            className="hover:bg-accent hover:text-accent-foreground rounded-full transition-colors"
            icon={
              theme === "dark" ? (
                <Sun className="w-5 h-5 text-foreground" />
              ) : (
                <Moon className="w-5 h-5 text-foreground" />
              )
            }
            onClick={toggleTheme}
          />

          {/* User Info */}
          <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
            <div className="flex items-center gap-3 cursor-pointer pl-2 hover:opacity-80 transition-opacity">
              <span className="hidden md:block text-sm text-foreground font-medium">
                {user?.nickname || "游客"}
              </span>
              <Avatar icon={<User />} className="bg-primary text-primary-foreground border-2 border-background shadow-sm" />
            </div>
          </Dropdown>
        </div>
      </div>

      {/* Menu Drawer */}
      <Drawer
        title={<span className="font-semibold text-lg">菜单导航</span>}
        placement="left"
        onClose={() => setMenuVisible(false)}
        open={menuVisible}
        styles={{ body: { padding: '16px' }, header: { borderBottom: '1px solid var(--border)' } }}
        className="bg-background"
      >
        <div className="flex flex-col gap-2">
          <Button type="text" block className="h-12 text-left justify-start px-4 rounded-lg hover:bg-accent hover:text-accent-foreground text-base font-medium transition-colors"
            onClick={() => { setMenuVisible(false); router.push("/"); }}>
            首页
          </Button>
          <Button type="text" block className="h-12 text-left justify-start px-4 rounded-lg hover:bg-accent hover:text-accent-foreground text-base font-medium transition-colors"
            onClick={() => { setMenuVisible(false); router.push("/resources"); }}>
            我的库
          </Button>
          <Button type="text" block className="h-12 text-left justify-start px-4 rounded-lg hover:bg-accent hover:text-accent-foreground text-base font-medium transition-colors">
            社区
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
