"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import TheaterCard from "./TheaterCard";
import CreateTheaterCard from "./CreateTheaterCard";
import { useAuth } from "@/context/AuthContext";
import { theaterApi, type TheaterResponse, type TheaterDetailResponse } from "@/lib/theaterApi";

// 剧场数据包含节点信息
interface TheaterWithNodes extends TheaterResponse {
  nodes?: TheaterDetailResponse["nodes"];
}

export default function RecentTheaters() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [theaters, setTheaters] = useState<TheaterWithNodes[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    const updateWidth = () => {
      if (carouselRef.current) {
        setWidth(carouselRef.current.scrollWidth - carouselRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [theaters]);

  useEffect(() => {
    if (!isAuthenticated || fetched.current) return;
    fetched.current = true;
    
    // 获取剧场列表，然后为每个剧场获取节点数据以提取背景
    const loadTheatersWithNodes = async () => {
      try {
        const listRes = await theaterApi.listTheaters(1, 20);
        const theatersWithNodes = await Promise.all(
          listRes.items.map(async (theater) => {
            // 如果没有缩略图，获取详细数据提取节点背景
            if (!theater.thumbnail_url) {
              try {
                const detail = await theaterApi.getTheater(theater.id);
                return { ...theater, nodes: detail.nodes };
              } catch {
                return theater;
              }
            }
            return theater;
          })
        );
        setTheaters(theatersWithNodes);
      } catch {
        setTheaters([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadTheatersWithNodes();
  }, [isAuthenticated]);

  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updatedTheater = await theaterApi.updateTheater(id, { title: newTitle });
      setTheaters((prev) => prev.map((t) => (t.id === id ? { ...t, title: updatedTheater.title } : t)));
    } catch (err) {
      console.error("Failed to rename theater:", err);
      alert("重命名失败");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newTheater = await theaterApi.duplicateTheater(id);
      setTheaters((prev) => [newTheater, ...prev]);
    } catch (err) {
      console.error("Failed to duplicate theater:", err);
      alert("创建副本失败");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await theaterApi.deleteTheater(id);
      setTheaters((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Failed to delete theater:", err);
      alert("删除失败");
    }
  };

  return (
    <div className="w-full py-8">
      {/* Section Header */}
      <div className="flex items-center justify-between px-6 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">最近剧场</h2>
          <p className="text-sm text-muted-foreground mt-1">
            继续您的创作或管理现有剧场
          </p>
        </div>
        <span className="text-sm text-muted-foreground bg-secondary px-3 py-1 rounded-full">
          {theaters.length} 个剧场
        </span>
      </div>
      
      {/* Carousel Container */}
      <motion.div 
        ref={carouselRef} 
        className="cursor-grab active:cursor-grabbing overflow-hidden py-6 pl-6 -mr-6 pr-6"
        whileTap={{ cursor: "grabbing" }}
      >
        <motion.div
          drag="x"
          dragConstraints={{ right: 0, left: -width }}
          className="flex gap-6"
        >
          {/* Create Theater Card - Always First */}
          <CreateTheaterCard onClick={() => router.push('/theater/new')} />

          {loading && (
            <div className="flex items-center justify-center w-[260px] h-[360px]">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            </div>
          )}

          {theaters.map((t, index) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <TheaterCard
                id={t.id}
                title={t.title}
                image={t.thumbnail_url}
                status={t.status}
                nodeCount={t.node_count}
                updatedAt={t.updated_at}
                nodes={t.nodes}
                onClick={() => router.push(`/theater/${t.id}`)}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
