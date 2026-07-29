import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';

export function useTheaterLoading(theaterId: string) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { loadTheater, setTheaterId, saveToBackend, isDirty, isSaving, isSyncing, isAiBusy } = useCanvasStore();
  const loaded = useRef(false);

  // Load theater on mount (wait for auth)
  useEffect(() => {
    if (!isAuthenticated || loaded.current) return;
    loaded.current = true;
    loadTheater(theaterId).catch(() => {
      router.push('/');
    });
  }, [isAuthenticated, theaterId, loadTheater, router]);

  // Ensure theaterId is set
  useEffect(() => {
    setTheaterId(theaterId);
  }, [theaterId, setTheaterId]);

  // Auto-save with 2s debounce
  // AI 推理期间跳过保存：后端 media_canvas_bridge 会高并发写入节点，同时 saveCanvas 会尝试 DELETE/INSERT
  // 大量行，在 SQLite 上很容易撞写锁（database is locked）导致 500。
  // AI 结束后任何一次本地修改都会重新触发这个 effect，不存在丢失保存的风险。
  useEffect(() => {
    if (!isDirty || isSaving || isSyncing || isAiBusy) return;

    const timer = setTimeout(() => {
      saveToBackend().catch(console.error);
    }, 2000);

    return () => clearTimeout(timer);
  }, [isDirty, isSaving, isSyncing, isAiBusy, saveToBackend]);

  // Save on network recovery
  useEffect(() => {
    const handleOnline = () => {
      // 同样避开 AI 忙时窗口
      if (useCanvasStore.getState().isDirty && !useCanvasStore.getState().isAiBusy) {
        saveToBackend().catch(console.error);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [saveToBackend]);
}
