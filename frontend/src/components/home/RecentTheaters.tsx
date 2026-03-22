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
import { Input } from "@/components/ui/input";

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
  const [cloningTheater, setCloningTheater] = useState<TheaterResponse | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [renamingTheater, setRenamingTheater] = useState<TheaterResponse | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const fetched = useRef(false);

  const fetchTheaters = () => {
    setLoading(true);
    theaterApi
      .listTheaters(1, 20)
      .then((res) => setTheaters(res.items))
      .catch(() => setTheaters([]))
      .finally(() => setLoading(false));
  };

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

  const handleCloneConfirm = async () => {
    if (!cloningTheater) return;
    setIsCloning(true);
    try {
      await theaterApi.cloneTheater(cloningTheater.id);
      messageApi.success('副本已创建');
      fetchTheaters();
    } catch (error) {
      messageApi.error('创建副本失败，请稍后重试');
    } finally {
      setIsCloning(false);
      setCloningTheater(null);
    }
  };

  const handleRenameConfirm = async () => {
    if (!renamingTheater) return;
    const newTitle = renameTitle.trim();
    if (newTitle.length < 2 || newTitle.length > 30) {
      messageApi.warning('剧场名称需在 2-30 个字符之间');
      return;
    }
    setIsRenaming(true);
    try {
      await theaterApi.renameTheater(renamingTheater.id, newTitle);
      setTheaters(prev => prev.map(t => t.id === renamingTheater.id ? { ...t, title: newTitle } : t));
      messageApi.success('重命名成功');
    } catch (error) {
      messageApi.error('重命名失败，请稍后重试');
    } finally {
      setIsRenaming(false);
      setRenamingTheater(null);
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
    fetchTheaters();
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
              onClone={() => setCloningTheater(t)}
              onRename={() => {
                setRenameTitle(t.title);
                setRenamingTheater(t);
              }}
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
            <Button onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Confirmation Dialog */}
      <Dialog open={!!cloningTheater} onOpenChange={(open) => !open && setCloningTheater(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>创建副本</DialogTitle>
            <DialogDescription>
              确定要为剧场 <span className="font-bold text-foreground">“{cloningTheater?.title}”</span> 创建副本吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCloningTheater(null)} disabled={isCloning}>
              取消
            </Button>
            <Button onClick={handleCloneConfirm} disabled={isCloning}>
              {isCloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renamingTheater} onOpenChange={(open) => !open && setRenamingTheater(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>重命名剧场</DialogTitle>
            <DialogDescription>
              请输入新的剧场名称（2-30 个字符）
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="剧场名称"
              maxLength={30}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameTitle.trim().length >= 2) {
                  handleRenameConfirm();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingTheater(null)} disabled={isRenaming}>
              取消
            </Button>
            <Button onClick={handleRenameConfirm} disabled={isRenaming || renameTitle.trim().length < 2}>
              {isRenaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
