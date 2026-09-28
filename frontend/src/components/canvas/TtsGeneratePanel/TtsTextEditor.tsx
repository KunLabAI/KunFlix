'use client';

import React, {
  useState, useEffect, useRef, useCallback, useImperativeHandle,
} from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TtsTextEditorRef {
  /** 在当前光标处插入内联音效标签（如 <laugh>） */
  insertTag: (tag: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Enter（无 Shift）回调，对齐原 textarea 的提交行为 */
  onEnterSubmit?: () => void;
  /** 内容自适应上限（px），超出滚动 */
  maxHeight?: number;
  minLength?: number;
  /** 外部容器 ref（供 usePanelResize 拖拽手柄读取高度） */
  containerRef?: React.Ref<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Helpers — 内联标签 ↔ 芯片 HTML（复刻 RefTagInput 的 contentEditable 模式）
// ---------------------------------------------------------------------------

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 匹配 Gemini TTS 人声内联标签：<laugh> <short pause> <throat-clearing> 等 */
const TAG_RE = /&lt;([a-z][a-z\s-]*)&gt;/g;

const WAVE_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M2 12h2l2-6 3 14 3-10 2 4h2l2-8 2 10 1-4h1"/></svg>';

// 芯片样式由 globals.css 的 .tts-tag-chip / .tts-tag-del 提供（无描边、半透明浅底、
// 深浅色文字自适应，删除按钮走 CSS :hover），避免内联样式无法适配主题。
function chipHtml(inner: string) {
  return `<span contenteditable="false" draggable="true" data-tts-tag="${esc(inner)}" class="tts-tag-chip">${WAVE_SVG}<span>${esc(inner)}</span><span data-tts-tag-delete="1" class="tts-tag-del">×</span></span>`;
}

/** 纯文本（含 <tag> 标记）→ 芯片 HTML */
function toHtml(text: string) {
  return esc(text).replace(TAG_RE, (_, inner: string) => chipHtml(inner.trim()));
}

/** contentEditable DOM → 纯文本（芯片还原为 <tag> 标记） */
function serialize(el: HTMLElement): string {
  let r = '';
  el.childNodes.forEach((n) => {
    n.nodeType === Node.TEXT_NODE && (r += n.textContent || '');
    n.nodeType === Node.ELEMENT_NODE && (() => {
      const e = n as HTMLElement;
      const tag = e.getAttribute?.('data-tts-tag');
      r += tag ? `<${tag}>` : (e.tagName === 'BR' ? '\n' : serialize(e));
    })();
  });
  return r;
}

/** 在当前 selection 处插入节点（无光标时追加到末尾） */
function insertNodeAtCursor(el: HTMLElement, node: Node) {
  el.focus();
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  range && el.contains(range.startContainer)
    ? (range.deleteContents(), range.insertNode(node),
       range.setStartAfter(node), range.collapse(true),
       sel!.removeAllRanges(), sel!.addRange(range))
    : el.appendChild(node);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * TTS 朗读文本编辑器：普通文本 + 交互式内联音效标签芯片。
 * - 芯片可拖拽左右移动调整顺序（系统原生 caret 指示落点）；
 * - 芯片尾部 × 删除该标签；
 * - 外部（配置面板标签速查）经 ref.insertTag 在光标处插入。
 * 序列化结果即 Gemini TTS 的 verbatim transcript + <tag> 标记。
 */
const TtsTextEditor = React.forwardRef<TtsTextEditorRef, Props>(
  function TtsTextEditor({ value, onChange, placeholder, disabled, onEnterSubmit, maxHeight = 252, minLength = 44, containerRef }, ref) {
    const edRef = useRef<HTMLDivElement>(null);
    const lastVal = useRef(value);
    const [isEmpty, setIsEmpty] = useState(!value);

    // 内容变化时自适应高度（未达 maxHeight 前随内容增长，对齐原 textarea auto-resize）
    const autoGrow = useCallback(() => {
      const el = edRef.current;
      el && (() => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      })();
    }, [maxHeight]);

    const syncFromDom = useCallback(() => {
      const el = edRef.current;
      el && (() => {
        const txt = serialize(el);
        lastVal.current = txt;
        setIsEmpty(!txt.trim());
        onChange(txt);
        autoGrow();
      })();
    }, [onChange, autoGrow]);

    // -- 对外 API --
    useImperativeHandle(ref, () => ({
      insertTag(tag: string) {
        const el = edRef.current;
        el && (() => {
          const tmp = document.createElement('div');
          const inner = tag.replace(/^</, '').replace(/>$/, '');
          tmp.innerHTML = chipHtml(inner);
          insertNodeAtCursor(el, tmp.firstElementChild!);
          syncFromDom();
        })();
      },
      focus() { edRef.current?.focus(); },
    }), [syncFromDom]);

    // -- 外部 value 变化（如连线注入 prompt-prefix）→ 重建 DOM --
    useEffect(() => {
      const el = edRef.current;
      (!el || value === lastVal.current) || (() => {
        lastVal.current = value;
        el.innerHTML = toHtml(value) || '<br>';
        setIsEmpty(!value.trim());
        const sel = window.getSelection();
        sel && el.childNodes.length && (() => {
          const rng = document.createRange();
          rng.selectNodeContents(el);
          rng.collapse(false);
          sel.removeAllRanges();
          sel.addRange(rng);
        })();
      })();
      el && autoGrow();
    }, [value, autoGrow]);

    // -- 初始渲染 --
    useEffect(() => {
      const el = edRef.current;
      el && (el.innerHTML = toHtml(value) || '<br>');
      lastVal.current = value;
      autoGrow();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // -- 键盘：Enter 提交（Shift+Enter 换行） --
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      e.stopPropagation();
      (e.key === 'Enter' && !e.shiftKey) && (e.preventDefault(), onEnterSubmit?.());
    }, [onEnterSubmit]);

    // -- 粘贴为纯文本 --
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault();
      const txt = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, txt);
    }, []);

    // -- 点击删除芯片 --
    const handleClick = useCallback((e: React.MouseEvent) => {
      const delBtn = (e.target as HTMLElement).closest?.('[data-tts-tag-delete]');
      delBtn && (() => {
        e.preventDefault();
        e.stopPropagation();
        (delBtn.closest('[data-tts-tag]') as HTMLElement | null)?.remove();
        syncFromDom();
      })();
    }, [syncFromDom]);

    // -- 芯片拖拽换位（对齐 RefTagInput：原生 caret 指示落点） --
    const dragTagRef = useRef<string | null>(null);

    const rangeFromPoint = useCallback((x: number, y: number): Range | null => {
      const caretPos = document.caretPositionFromPoint?.(x, y);
      const viaPos = caretPos
        ? (() => { const r = document.createRange(); r.setStart(caretPos.offsetNode, caretPos.offset); r.collapse(true); return r; })()
        : null;
      const viaRange = !viaPos && (document as any).caretRangeFromPoint
        ? ((document as any).caretRangeFromPoint(x, y) as Range | null)
        : null;
      return viaPos ?? viaRange ?? null;
    }, []);

    const handleDragStart = useCallback((e: React.DragEvent) => {
      const target = (e.target as HTMLElement).closest?.('[data-tts-tag]') as HTMLElement | null;
      // 芯片外的普通文本选中拖拽不劫持
      target
        ? (() => {
            dragTagRef.current = target.getAttribute('data-tts-tag');
            e.dataTransfer.setData('text/plain', '');
            e.dataTransfer.effectAllowed = 'move';
          })()
        : e.preventDefault();
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      dragTagRef.current !== null && (() => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const el = edRef.current;
        // dragover 时把真实 selection 同步到落点，让浏览器显示原生 caret
        el && (() => {
          const range = rangeFromPoint(e.clientX, e.clientY);
          range && el.contains(range.startContainer) && (() => {
            const sel = window.getSelection();
            sel && (sel.removeAllRanges(), sel.addRange(range));
          })();
        })();
      })();
    }, [rangeFromPoint]);

    const handleDrop = useCallback((e: React.DragEvent) => {
      const tag = dragTagRef.current;
      dragTagRef.current = null;
      const el = edRef.current;
      (tag !== null && el) && (() => {
        e.preventDefault();
        // 1) 基于当前 DOM 计算落点（原芯片移除前坐标才稳定）
        const dropRange = rangeFromPoint(e.clientX, e.clientY);
        // 2) 定位原芯片（同名标签可能多个，取拖拽起点最近的一个即可——以首个匹配为准）
        const orig = el.querySelector(`[data-tts-tag="${CSS.escape(tag)}"]`) as HTMLElement | null;
        // 3) 落点在原芯片内部 → 原地拖放，不处理
        const dropInsideOrig = !!(dropRange && orig && orig.contains(dropRange.startContainer));
        !dropInsideOrig && (() => {
          // 4) 捕获落点锚点（在芯片外部，移除原芯片后依然有效）
          const anchorNode = dropRange?.startContainer ?? null;
          const anchorOffset = dropRange?.startOffset ?? 0;
          const anchorValid = !!(anchorNode && el.contains(anchorNode) && (!orig || !orig.contains(anchorNode)));
          // 5) 移除原芯片
          orig?.remove();
          // 6) 光标精确放置到落点；失败则回退末尾
          const sel = window.getSelection();
          sel && (() => {
            const r = document.createRange();
            anchorValid
              ? (() => {
                  const maxOff = anchorNode!.nodeType === Node.TEXT_NODE
                    ? (anchorNode!.textContent?.length ?? 0)
                    : anchorNode!.childNodes.length;
                  r.setStart(anchorNode!, Math.min(anchorOffset, maxOff));
                })()
              : r.selectNodeContents(el);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
          })();
          // 7) 在光标处重新插入芯片
          const tmp = document.createElement('div');
          tmp.innerHTML = chipHtml(tag);
          insertNodeAtCursor(el, tmp.firstElementChild!);
          syncFromDom();
        })();
      })();
    }, [rangeFromPoint, syncFromDom]);

    const handleDragEnd = useCallback(() => { dragTagRef.current = null; }, []);

    return (
      <div className="relative nodrag" ref={containerRef}>
        {/* 占位符 */}
        {isEmpty && !disabled && (
          <div className="absolute top-2.5 left-3 text-[13px] text-muted-foreground/60 pointer-events-none select-none">
            {placeholder}
          </div>
        )}

        <div
          ref={edRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={syncFromDom}
          onBlur={syncFromDom}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClick={handleClick}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          className={cn(
            'w-full bg-transparent border-0 outline-none text-[13px] leading-relaxed text-foreground cursor-text',
            'overflow-y-auto px-3 pt-2.5 pb-1 custom-scrollbar',
            'focus:ring-0 focus:outline-none whitespace-pre-wrap break-words',
            disabled && 'opacity-60 cursor-not-allowed pointer-events-none',
          )}
          style={{ minHeight: minLength, maxHeight }}
          role="textbox"
          aria-multiline="true"
        />
      </div>
    );
  },
);

export default TtsTextEditor;
