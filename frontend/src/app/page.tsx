"use client";

import TopBar from "@/components/home/TopBar";
import RecentTheaters from "@/components/home/RecentTheaters";
import SharedTheaters from "@/components/home/SharedTheaters";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300 overflow-x-hidden">
      <TopBar />
      
      {/* 内容区：overflow-x-hidden 兄底防止子组件（轮播、负外边距等）意外引入横向滚动条。 */}
      <div className="flex-1 flex flex-col pt-24 pb-10 gap-8 w-full max-w-[1440px] mx-auto overflow-y-auto overflow-x-hidden">
        <RecentTheaters />
        <SharedTheaters />
      </div>
    </main>
  );
}
