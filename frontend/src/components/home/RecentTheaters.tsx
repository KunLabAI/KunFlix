"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { message } from "antd";
import TheaterCard from "./TheaterCard";
import CreateTheaterCard from "./CreateTheaterCard";
import { useAuth } from "@/context/AuthContext";
import { theaterApi, type TheaterResponse } from "@/lib/theaterApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function RecentTheaters() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [theaters, setTheaters] = useState<TheaterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingTheater, setDeletingTheater] = useState<TheaterResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fetched = useRef(false);

  const handleDeleteConfirm = async () => {
    if (!deletingTheater) return;
    setIsDeleting(true);
    try {
      await theaterApi.deleteTheater(deletingTheater.id);
      setTheaters(prev => prev.filter(t => t.id !== deletingTheater.id));
      messageApi.success('删除成功');
    } catch (error) {
      messageApi.error('删除失败，请稍后重试');
    } finally {
      setIsDeleting(false);
      setDeletingTheater(null);
    }
  };

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
      {contextHolder}
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
              createdAt={t.created_at}
              onClick={() => router.push(`/theater/${t.id}`)}
              onDelete={() => setDeletingTheater(t)}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTheater} onOpenChange={(open) => !open && setDeletingTheater(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>删除剧场</DialogTitle>
            <DialogDescription>
              确定要删除剧场 <span className="font-bold text-foreground">“{deletingTheater?.title}”</span> 吗？
              <br />
              <span className="text-destructive mt-2 inline-block">删除后不可恢复。</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeletingTheater(null)} disabled={isDeleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
