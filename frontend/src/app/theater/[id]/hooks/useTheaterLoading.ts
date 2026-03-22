import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';

export function useTheaterLoading(theaterId: string) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { loadTheater, setTheaterId, saveToBackend } = useCanvasStore();
  const loaded = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || loaded.current) return;
    loaded.current = true;
    loadTheater(theaterId).catch(() => {
      router.push('/');
    });
  }, [isAuthenticated, theaterId, loadTheater, router]);

  useEffect(() => {
    setTheaterId(theaterId);
  }, [theaterId, setTheaterId]);

  useEffect(() => {
    const handleOnline = () => {
      if (useCanvasStore.getState().isDirty) {
        saveToBackend().catch(console.error);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [saveToBackend]);
}
