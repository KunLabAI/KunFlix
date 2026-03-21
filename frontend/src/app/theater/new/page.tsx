
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { theaterApi } from '@/lib/theaterApi';

export default function NewTheaterPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const creating = useRef(false);

  useEffect(() => {
    // Wait for auth and prevent double-creation in strict mode
    if (!isAuthenticated || creating.current) return;
    creating.current = true;

    theaterApi
      .createTheater({ title: '未命名剧场' })
      .then((theater) => {
        router.replace(`/theater/${theater.id}`);
      })
      .catch((err) => {
        console.error('Failed to create theater:', err);
        creating.current = false;
        router.push('/');
      });
  }, [isAuthenticated, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">正在创建剧场...</p>
      </div>
    </div>
  );
}
