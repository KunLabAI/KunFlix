'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 标题双击编辑通用 hook：
 * - 双击 h3 进入编辑态
 * - 失焦 / Enter / Escape 退出编辑态
 * - value 变更实时 commit，退出时再 commit 一次
 */
export function useInlineTitleEdit(externalName: string, onCommit: (name: string) => void) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(externalName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // 同步外部变更（非编辑态）
  useEffect(() => {
    !isEditing && setValue(externalName || '');
  }, [externalName, isEditing]);

  // 点击外部保存
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      isEditing && inputRef.current && !inputRef.current.contains(e.target as Node) && (() => {
        onCommit(value);
        setIsEditing(false);
      })();
    };
    isEditing && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isEditing, value, onCommit]);

  const enterEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setValue(externalName || '');
  }, [externalName]);

  const onChange = useCallback((v: string) => {
    setValue(v);
    onCommit(v);
  }, [onCommit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    (e.key === 'Enter' || e.key === 'Escape') && setIsEditing(false);
  }, []);

  return {
    isEditing,
    value,
    inputRef,
    enterEdit,
    onChange,
    onKeyDown,
  };
}
