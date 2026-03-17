"use client";

import { useState } from "react";
import { Search, Menu, User, Sun, Moon } from "lucide-react";
import { Button, Dropdown, Avatar, Input, Drawer } from "antd";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
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
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md transition-colors duration-300 border-b border-border/10">
      {/* Menu Button */}
      <Button
        type="text"
        icon={<Menu className="w-6 h-6 text-foreground" />}
        onClick={() => setMenuVisible(true)}
      />

      {/* Right Side Actions */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: searchVisible ? 200 : 0, opacity: searchVisible ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="absolute right-10 top-1/2 -translate-y-1/2 overflow-hidden"
          >
            <Input placeholder="搜索剧场..." className="w-[200px]" />
          </motion.div>
          <Button
            type="text"
            icon={<Search className="w-6 h-6 text-foreground" />}
            onClick={() => setSearchVisible(!searchVisible)}
          />
        </div>

        {/* Theme Toggle */}
        <Button
          type="text"
          icon={
            theme === "dark" ? (
              <Sun className="w-6 h-6 text-foreground" />
            ) : (
              <Moon className="w-6 h-6 text-foreground" />
            )
          }
          onClick={toggleTheme}
        />

        {/* User Info */}
        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <div className="flex items-center gap-2 cursor-pointer">
            <span className="hidden md:block text-foreground font-medium">
              {user?.nickname || "游客"}
            </span>
            <Avatar icon={<User />} className="bg-primary text-primary-foreground" />
          </div>
        </Dropdown>
      </div>

      {/* Menu Drawer */}
      <Drawer
        title="菜单"
        placement="left"
        onClose={() => setMenuVisible(false)}
        open={menuVisible}
        styles={{ body: { padding: 0 } }}
      >
        <div className="flex flex-col p-4 gap-2">
          <Button type="text" block className="text-left justify-start">
            首页
          </Button>
          <Button type="text" block className="text-left justify-start">
            我的库
          </Button>
          <Button type="text" block className="text-left justify-start">
            社区
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
