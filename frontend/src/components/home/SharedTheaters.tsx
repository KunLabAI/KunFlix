"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import TheaterCard from "./TheaterCard";
import { Loader2 } from "lucide-react";

export default function SharedTheaters() {
  const [theaters, setTheaters] = useState<Array<{ id: string; title: string; image: string }>>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const loadMoreTheaters = useCallback(() => {
    if (loadingRef.current) return;
    // We'll leave the function here but disable the fake generation logic
    // loadingRef.current = true;
    // setLoading(true);
    //
    // TODO: Implement actual API call here
    // setTimeout(() => {
    //   setTheaters((prev) => [...prev]);
    //   setLoading(false);
    //   loadingRef.current = false;
    // }, 1000);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreTheaters();
        }
      },
      { threshold: 1.0 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [loadMoreTheaters]);

  // Initial load
  useEffect(() => {
    if (theaters.length === 0) {
      loadMoreTheaters();
    }
  }, []);

  return (
    <div className="w-full px-6 py-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">社区剧场</h2>
          <p className="text-sm text-muted-foreground mt-1">
            发现和探索社区中的优秀作品
          </p>
        </div>
      </div>
      
      {/* Empty State */}
      {theaters.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4">
            <Loader2 className="w-8 h-8 opacity-30" />
          </div>
          <p className="text-base font-medium text-foreground">暂无社区剧场</p>
          <p className="text-sm mt-1">社区功能即将上线，敬请期待</p>
        </div>
      )}

      {/* Theater Grid */}
      <div className="flex flex-wrap gap-6 justify-start">
        {theaters.map((theater, index) => (
          <motion.div
            key={theater.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <TheaterCard
              id={theater.id}
              title={theater.title}
              // image={theater.image}
              onClick={() => console.log(`Shared Theater ${theater.id} Clicked`)}
            />
          </motion.div>
        ))}
      </div>

      <div ref={observerTarget} className="w-full py-8 flex justify-center items-center">
        {loading && <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />}
      </div>
    </div>
  );
}
