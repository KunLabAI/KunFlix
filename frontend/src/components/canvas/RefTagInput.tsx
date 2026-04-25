'use client';

import React, { useState, useEffect, useRef, useCallback, useImperativeHandle } from 'react';
import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefType = 'image' | 'video' | 'audio';

export interface RefImage {
  url: string;
  name: string;
  refType: RefType; // 参考类型：image / video / audio
  previewUrl?: string; // 虚拟人像用：展示缩略图（preview_url），提交时用 url（asset://...）
}

export interface RefTagInputRef {
  insertTag: (refIdx: number, name: string) => void;
  focus: () => void;
}

interface RefTagInputProps {
  value: string;
  onChange: (text: string) => void;
  referenceImages: RefImage[];
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers — tag HTML rendering (inline styles for dynamic innerHTML)
// ---------------------------------------------------------------------------

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const IMG_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';

const TAG_STYLE = [
  'display:inline-flex', 'align-items:center', 'gap:3px',
  'padding:0 6px', 'margin:0 1px', 'border-radius:4px',
  'background:color-mix(in srgb, var(--primary) 12%, transparent)',
  'color:var(--primary)',
  'font-size:11px', 'font-weight:500', 'vertical-align:baseline',
  'cursor:grab', 'user-select:none', 'white-space:nowrap',
  'border:1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
  'line-height:1.6',
].join(';');

function tagHtml(idx: number, name: string) {
  return `<span contenteditable="false" draggable="true" data-ref-idx="${idx}" style="${TAG_STYLE}">${IMG_SVG}<span style="max-width:72px;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span></span>`;
}

/** Plain text with <IMAGE_N> markers → HTML with visual tag spans */
function toHtml(text: string, refs: RefImage[]) {
  return esc(text).replace(/&lt;IMAGE_(\d+)&gt;/g, (_, n) => {
    const r = refs[parseInt(n) - 1];
    return r ? tagHtml(parseInt(n), r.name) : `&lt;IMAGE_${n}&gt;`;
  });
}

/** contentEditable DOM → plain text with <IMAGE_N> markers */
function serialize(el: HTMLElement): string {
  let r = '';
  el.childNodes.forEach((n) => {
    n.nodeType === Node.TEXT_NODE && (r += n.textContent || '');
    n.nodeType === Node.ELEMENT_NODE && (() => {
      const e = n as HTMLElement;
      const idx = e.getAttribute('data-ref-idx');
      r += idx ? `<IMAGE_${idx}>` : e.tagName === 'BR' ? '\n' : serialize(e);
    })();
  });
  return r;
}

/** Insert a DOM node at the current selection range, with trailing space */
function insertNodeAtCursor(el: HTMLElement, node: Node) {
  el.focus();
  const sel = window.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  const space = document.createTextNode('\u00A0');

  range && el.contains(range.startContainer)
    ? (range.deleteContents(), range.insertNode(space), range.insertNode(node),
       range.setStartAfter(space), range.collapse(true),
       sel!.removeAllRanges(), sel!.addRange(range))
    : (el.appendChild(node), el.appendChild(space));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RefTagInput = React.forwardRef<RefTagInputRef, RefTagInputProps>(
  function RefTagInput({ value, onChange, referenceImages, placeholder, disabled, onSubmit }, ref) {
    const { t } = useTranslation();
    const edRef = useRef<HTMLDivElement>(null);
    const lastVal = useRef(value);
    const [atMenu, setAtMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const dragIdxRef = useRef<number | null>(null);

    // -- expose API --
    useImperativeHandle(ref, () => ({
      insertTag(idx: number, name: string) {
        const el = edRef.current;
        el || (void 0);
        if (!el) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = tagHtml(idx, name);
        insertNodeAtCursor(el, tmp.firstElementChild!);
        const txt = serialize(el);
        lastVal.current = txt;
        onChange(txt);
      },
      focus() { edRef.current?.focus(); },
    }));

    // -- sync external value → editor DOM --
    useEffect(() => {
      const el = edRef.current;
      if (!el || value === lastVal.current) return;
      lastVal.current = value;
      el.innerHTML = toHtml(value, referenceImages) || '<br>';
      // cursor to end
      const sel = window.getSelection();
      sel && el.childNodes.length && (() => {
        const rng = document.createRange();
        rng.selectNodeContents(el);
        rng.collapse(false);
        sel.removeAllRanges();
        sel.addRange(rng);
      })();
    }, [value, referenceImages]);

    // -- initial render --
    useEffect(() => {
      const el = edRef.current;
      el && (el.innerHTML = toHtml(value, referenceImages) || '<br>');
      lastVal.current = value;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // -- input handler --
    const handleInput = useCallback(() => {
      const el = edRef.current;
      if (!el) return;
      const txt = serialize(el);
      lastVal.current = txt;
      onChange(txt);
    }, [onChange]);

    // -- keyboard --
    const handleKeyDown = (e: React.KeyboardEvent) => {
      e.stopPropagation();
      e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (e.preventDefault(), onSubmit?.());
      e.key === 'Escape' && atMenu && (e.preventDefault(), setAtMenu(false));
      // @ trigger
      e.key === '@' && referenceImages.length > 0 && requestAnimationFrame(() => setAtMenu(true));
    };

    // -- paste as plain text --
    const handlePaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      const txt = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, txt);
    };

    // -- tag drag & drop within editor --
    const handleDragStart = useCallback((e: React.DragEvent) => {
      const target = (e.target as HTMLElement).closest?.('[data-ref-idx]') as HTMLElement | null;
      target && (dragIdxRef.current = Number(target.getAttribute('data-ref-idx')));
      !target && e.preventDefault();
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      dragIdxRef.current !== null && e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      const idx = dragIdxRef.current;
      dragIdxRef.current = null;
      const el = edRef.current;
      (idx === null || !el) && (void 0);
      idx !== null && el && (() => {
        e.preventDefault();
        // Remove the original tag span from DOM
        const orig = el.querySelector(`[data-ref-idx="${idx}"]`);
        orig?.remove();

        // Place caret at drop point
        const caretPos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
        const caretRange = (document as any).caretRangeFromPoint?.(e.clientX, e.clientY) as Range | null;

        const sel = window.getSelection();
        const range = caretPos
          ? (() => { const r = document.createRange(); r.setStart(caretPos.offsetNode, caretPos.offset); r.collapse(true); return r; })()
          : caretRange;

        range && sel && el.contains(range.startContainer)
          ? (sel.removeAllRanges(), sel.addRange(range))
          : (void 0);

        // Re-create and insert tag at new position
        const refs = referenceImages[idx - 1];
        refs && (() => {
          const tmp = document.createElement('div');
          tmp.innerHTML = tagHtml(idx, refs.name);
          insertNodeAtCursor(el, tmp.firstElementChild!);
        })();

        // Serialize and sync
        const txt = serialize(el);
        lastVal.current = txt;
        onChange(txt);
      })();
    }, [referenceImages, onChange]);

    // -- @ select: remove '@', insert tag --
    const handleAtSelect = (idx: number) => {
      const el = edRef.current;
      if (!el) return;
      const r = referenceImages[idx - 1];
      if (!r) return;

      // remove the '@' char before cursor
      const sel = window.getSelection();
      sel?.rangeCount && (() => {
        const range = sel.getRangeAt(0);
        const tn = range.startContainer;
        tn.nodeType === Node.TEXT_NODE && range.startOffset > 0 && (() => {
          const text = tn.textContent || '';
          const at = text.lastIndexOf('@', range.startOffset - 1);
          at >= 0 && ((tn as Text).deleteData(at, range.startOffset - at), range.setStart(tn, at), range.collapse(true));
        })();
      })();

      // insert tag
      const tmp = document.createElement('div');
      tmp.innerHTML = tagHtml(idx, r.name);
      insertNodeAtCursor(el, tmp.firstElementChild!);
      handleInput();
      setAtMenu(false);
      el.focus();
    };

    // -- close @ menu on outside click --
    useEffect(() => {
      const h = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as HTMLElement) && setAtMenu(false);
      atMenu && document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [atMenu]);

    const isEmpty = !value || value.trim().length === 0;

    return (
      <div className="relative">
        {/* Placeholder */}
        {isEmpty && !disabled && (
          <div className="absolute top-2.5 left-3 text-sm text-muted-foreground/60 pointer-events-none select-none">
            {placeholder}
          </div>
        )}

        {/* Editor */}
        <div
          ref={edRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            'w-full bg-transparent border-0 outline-none text-sm text-foreground cursor-text',
            'min-h-[44px] max-h-[400px] overflow-y-auto py-2.5 px-3 pb-1',
            'focus:ring-0 focus:outline-none whitespace-pre-wrap break-words',
            disabled && 'opacity-50 pointer-events-none',
          )}
          role="textbox"
          aria-multiline="true"
        />

        {/* @ mention menu — appears above the editor */}
        {atMenu && referenceImages.length > 0 && (
          <div
            ref={menuRef}
            className="absolute z-50 w-56 bottom-full left-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/50">
              {t('canvas.node.video.insertRefImage')}
            </div>
            {referenceImages.map((r, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleAtSelect(i + 1); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
              >
                <div className="h-6 w-6 shrink-0 relative">
                  <img src={r.previewUrl || r.url} alt="" className="h-6 w-6 rounded object-cover border border-border/30" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                  <div className="hidden h-6 w-6 rounded border border-border/30 bg-muted flex items-center justify-center absolute inset-0">
                    <UserRound className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                </div>
                <span className="font-medium truncate text-foreground">{r.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">{`IMAGE_${i + 1}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);

export default RefTagInput;
