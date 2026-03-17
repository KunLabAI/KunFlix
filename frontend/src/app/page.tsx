"use client";

import TopBar from "@/components/home/TopBar";
import RecentTheaters from "@/components/home/RecentTheaters";
import SharedTheaters from "@/components/home/SharedTheaters";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <TopBar />
      
      <div className="flex-1 flex flex-col pt-20 pb-10 gap-8 overflow-y-auto">
        <RecentTheaters />
        <SharedTheaters />
      </div>
    </main>
  );
}
