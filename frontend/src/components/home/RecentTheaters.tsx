"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import TheaterCard from "./TheaterCard";
import CreateTheaterCard from "./CreateTheaterCard";
import { useAuth } from "@/context/AuthContext";
import { theaterApi, type TheaterResponse } from "@/lib/theaterApi";

export default function RecentTheaters() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [theaters, setTheaters] = useState<TheaterResponse[]>([]);
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
    theaterApi
      .listTheaters(1, 20)
      .then((res) => setTheaters(res.items))
      .catch(() => setTheaters([]))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div className="w-full py-8">
      <h2 className="text-2xl font-bold mb-6 px-6 text-foreground">最近剧场</h2>
      
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
            <div className="flex items-center justify-center w-[200px] h-[300px]">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          )}

          {theaters.map((t) => (
            <TheaterCard
              key={t.id}
              id={t.id}
              title={t.title}
              image={t.thumbnail_url}
              status={t.status}
              nodeCount={t.node_count}
              updatedAt={t.updated_at}
              onClick={() => router.push(`/theater/${t.id}`)}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
