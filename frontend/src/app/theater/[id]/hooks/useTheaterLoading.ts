import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';

export function useTheaterLoading(theaterId: string) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { loadTheater, setTheaterId, saveToBackend, isDirty, isSaving, isSyncing } = useCanvasStore();
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
  useEffect(() => {
    if (!isDirty || isSaving || isSyncing) return;

    const timer = setTimeout(() => {
      saveToBackend().catch(console.error);
    }, 2000);

    return () => clearTimeout(timer);
  }, [isDirty, isSaving, isSyncing, saveToBackend]);

  // Save on network recovery
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
