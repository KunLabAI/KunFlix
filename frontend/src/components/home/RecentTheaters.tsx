"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, useAnimation } from "framer-motion";
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
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [theaters, setTheaters] = useState<TheaterWithNodes[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);
  const controls = useAnimation();

  useEffect(() => {
    const updateWidth = () => {
      if (carouselRef.current) {
        setWidth(Math.max(0, carouselRef.current.scrollWidth - carouselRef.current.offsetWidth));
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [theaters]);

  useEffect(() => {
    if (!isAuthenticated || fetched.current) return;
    fetched.current = true;
    
    const loadTheatersWithNodes = async () => {
      try {
        const listRes = await theaterApi.listTheaters(1, 20);
        const theatersWithNodes = await Promise.all(
          listRes.items.map(async (theater) => {
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
      setTheaters((prev) => prev.map((th) => (th.id === id ? { ...th, title: updatedTheater.title } : th)));
    } catch (err) {
      console.error("Failed to rename theater:", err);
      alert(t("home.renameFailed"));
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newTheater = await theaterApi.duplicateTheater(id);
      setTheaters((prev) => [newTheater, ...prev]);
    } catch (err) {
      console.error("Failed to duplicate theater:", err);
      alert(t("home.duplicateFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await theaterApi.deleteTheater(id);
      // 先重置拖拽位置到起始点，再更新列表，避免约束冲突
      controls.set({ x: 0 });
      setTheaters((prev) => prev.filter((th) => th.id !== id));
    } catch (err) {
      console.error("Failed to delete theater:", err);
      alert(t("home.deleteFailed"));
    }
  };

  return (
    <div className="w-full py-8">
      {/* Section Header */}
      <div className="flex items-center justify-between px-6 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("home.recentTheaters")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("home.recentDesc")}
          </p>
        </div>
        <span className="text-sm text-muted-foreground bg-secondary px-3 py-1 rounded-full">
          {t("home.theaterCount", { count: theaters.length })}
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
          animate={controls}
          className="flex gap-6"
        >
          {/* Create Theater Card - Always First */}
          <CreateTheaterCard onClick={() => router.push('/theater/new')} />

          {loading && (
            <div className="flex items-center justify-center w-[260px] h-[360px]">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            </div>
          )}

          {theaters.map((th, index) => (
            <motion.div
              key={th.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <TheaterCard
                id={th.id}
                title={th.title}
                image={th.thumbnail_url}
                status={th.status}
                nodeCount={th.node_count}
                updatedAt={th.updated_at}
                nodes={th.nodes}
                onClick={() => router.push(`/theater/${th.id}`)}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                priority={index === 0}
              />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
