'use client';

import { useEffect, useRef } from 'react';

type Entry = [open: boolean, ref: React.RefObject<HTMLElement | null>, setter: (v: boolean) => void];

/**
 * 统一多下拉的外部点击关闭。
 * 传入 [open, ref, setter] 三元组数组：任一 open 为 true 时全局挂载 mousedown，
 * 点击落在各 ref 容器外时调用对应 setter(false)。
 */
export function useDropdownOutside(entries: Entry[]) {
  const latestRef = useRef(entries);
  latestRef.current = entries;

  const anyOpen = entries.some(([open]) => open);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      latestRef.current.forEach(([open, ref, setter]) => {
        open && ref.current && !ref.current.contains(e.target as HTMLElement) && setter(false);
      });
    };
    anyOpen && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [anyOpen]);
}
