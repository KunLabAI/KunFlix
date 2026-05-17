"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, useAnimation } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import TheaterCard from "./TheaterCard";
import CreateTheaterCard from "./CreateTheaterCard";
import { useAuth } from "@/context/AuthContext";
import { theaterApi, type TheaterResponse } from "@/lib/theaterApi";
import { theaterListCache } from "@/lib/theaterListCache";

export default function RecentTheaters() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isHydrated } = useAuth();
  // hydrate 完成前（含 SSR 与 CSR 首帧）均默认按“已登录”视图渲染（轮播 + 加载占位），
  // 避免已登录用户刷新时看到“游客引导卡 → 轮播”的倒转闪烁。
  const isGuest = isHydrated && !isAuthenticated;
  const carouselRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [theaters, setTheaters] = useState<TheaterResponse[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (!isAuthenticated) return;

    // 仅拉列表，不再为「补封面」拉完整画布详情。
    // 后端在 save_canvas 时会自动维护 thumbnail_url；未生成的剧场直接留白占位。
    //
    // 缓存策略（stale-while-revalidate）：
    //   1. 命中缓存 → 立即渲染并关闭 loading，避免「进首页都转一下」
    //   2. 新鲜期内（1 分钟）不发请求；超期后台静默重拉
    //   3. 静默重拉失败不清空原有列表，避免闪空
    //
    // 不再用 fetched ref 做去重守卫：StrictMode 下双调用会让守卫位与取消逻辑互锁。
    const cached = theaterListCache.peek();
    const hasCache = cached !== null;
    hasCache && setTheaters(cached);
    hasCache && setLoading(false);

    // 新鲜期内跳过后台刷新
    if (theaterListCache.isFresh()) return;

    const controller = new AbortController();
    let cancelled = false;

    // 无缓存才展示 loading；有缓存静默后台刷新
    hasCache || setLoading(true);

    theaterApi
      .listTheaters(1, 20, undefined, controller.signal)
      .then((listRes) => {
        if (cancelled) return;
        setTheaters(listRes.items);
        theaterListCache.set(listRes.items);
      })
      .catch(() => {
        // 失败时：有缓存 → 保留旧数据；无缓存 → 置空
        cancelled || hasCache || setTheaters([]);
      })
      .finally(() => {
        cancelled || setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isAuthenticated]);

  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updatedTheater = await theaterApi.updateTheater(id, { title: newTitle });
      setTheaters((prev) => prev.map((th) => (th.id === id ? { ...th, title: updatedTheater.title } : th)));
      // 同步缓存：下次进首页不会看到老标题闪现
      theaterListCache.upsert({ ...updatedTheater } as TheaterResponse);
    } catch (err) {
      console.error("Failed to rename theater:", err);
      alert(t("home.renameFailed"));
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newTheater = await theaterApi.duplicateTheater(id);
      setTheaters((prev) => [newTheater, ...prev]);
      theaterListCache.upsert(newTheater, "head");
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
      theaterListCache.remove(id);
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
        {isAuthenticated && (
          <span className="text-sm text-muted-foreground bg-secondary px-3 py-1 rounded-full">
            {t("home.theaterCount", { count: theaters.length })}
          </span>
        )}
      </div>

      {/* Guest Placeholder: 仅在已 hydrate 且确定为游客时才展示登录引导卡。
          hydrate 前统一走轮播分支，已登录用户首帧不会被误示为游客。 */}
      {isGuest ? (
        <div className="px-6">
          <motion.button
            type="button"
            onClick={() => router.push("/login?redirect=%2F")}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.995 }}
            className={cn(
              "group relative w-full overflow-hidden rounded-2xl",
              "bg-gradient-to-br from-secondary/60 via-secondary/30 to-secondary/10",
              "border-2 border-dashed border-border hover:border-primary/50",
              "px-8 py-12 flex flex-col items-center justify-center gap-4 text-center",
              "transition-colors"
            )}
          >
            <h3 className="text-lg font-semibold text-foreground">
              {t("home.guestRecentTitle")}
            </h3>
          </motion.button>
        </div>
      ) : (
      /* Carousel Container
         移除原“-mr-6 pr-6”（负右外边距）。负外边距会让该元素自身外边界超出父容器 24px，
         触发顶层页面横向滚动条；overflow-hidden 只隔离内部拖拽溢出，对自身负外边距无效。
         改用对称 px-6 即可。 */
      <motion.div 
        ref={carouselRef} 
        className="cursor-grab active:cursor-grabbing overflow-hidden py-6 px-6"
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
      )}
    </div>
  );
}
