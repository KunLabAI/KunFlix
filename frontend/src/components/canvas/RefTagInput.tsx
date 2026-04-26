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
  insertTag: (refIdx: number, name: string, refType?: RefType) => void;
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

const VIDEO_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>';

const AUDIO_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

const TYPE_SVG: Record<RefType, string> = { image: IMG_SVG, video: VIDEO_SVG, audio: AUDIO_SVG };
const TYPE_TAG_PREFIX: Record<RefType, string> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO' };
const TAG_PREFIX_TO_TYPE: Record<string, RefType> = { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' };

const TAG_COLORS: Record<RefType, { bg: string; border: string; color: string }> = {
  image: { bg: 'var(--primary) 12%', border: 'var(--primary) 20%', color: 'var(--primary)' },
  video: { bg: '#f59e0b 15%', border: '#f59e0b 25%', color: '#d97706' },
  audio: { bg: '#14b8a6 15%', border: '#14b8a6 25%', color: '#0d9488' },
};

function tagStyle(refType: RefType) {
  const c = TAG_COLORS[refType];
  return [
    'display:inline-flex', 'align-items:center', 'gap:3px',
    'padding:0 6px', 'margin:0 1px', 'border-radius:4px',
    `background:color-mix(in srgb, ${c.bg}, transparent)`,
    `color:${c.color}`,
    'font-size:11px', 'font-weight:500', 'vertical-align:baseline',
    'cursor:grab', 'user-select:none', 'white-space:nowrap',
    `border:1px solid color-mix(in srgb, ${c.border}, transparent)`,
    'line-height:1.6',
  ].join(';');
}

function tagHtml(idx: number, name: string, refType: RefType = 'image') {
  const svg = TYPE_SVG[refType];
  const style = tagStyle(refType);
  return `<span contenteditable="false" draggable="true" data-ref-idx="${idx}" data-ref-type="${refType}" style="${style}">${svg}<span style="max-width:72px;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span></span>`;
}

/** Compute type-specific index for a ref at array position `pos` */
function typeIndex(refs: RefImage[], pos: number): number {
  const targetType = refs[pos]?.refType || 'image';
  let count = 0;
  for (let i = 0; i <= pos; i++) {
    refs[i].refType === targetType && count++;
  }
  return count;
}

/** Plain text with <IMAGE_N>/<VIDEO_N>/<AUDIO_N> markers → HTML with visual tag spans */
function toHtml(text: string, refs: RefImage[]) {
  // Build per-type lookup: type → [ref0, ref1, ...]
  const byType: Record<string, RefImage[]> = { image: [], video: [], audio: [] };
  refs.forEach(r => byType[r.refType]?.push(r));

  let html = esc(text);
  // Replace all three patterns: <IMAGE_N>, <VIDEO_N>, <AUDIO_N>
  html = html.replace(/&lt;(IMAGE|VIDEO|AUDIO)_(\d+)&gt;/g, (_, prefix, n) => {
    const refType = TAG_PREFIX_TO_TYPE[prefix] || 'image';
    const idx = parseInt(n);
    const list = byType[refType];
    const r = list?.[idx - 1];
    return r ? tagHtml(idx, r.name, refType) : `&lt;${prefix}_${n}&gt;`;
  });
  return html;
}

/** contentEditable DOM → plain text with <IMAGE_N>/<VIDEO_N>/<AUDIO_N> markers */
function serialize(el: HTMLElement): string {
  let r = '';
  el.childNodes.forEach((n) => {
    n.nodeType === Node.TEXT_NODE && (r += n.textContent || '');
    n.nodeType === Node.ELEMENT_NODE && (() => {
      const e = n as HTMLElement;
      const idx = e.getAttribute('data-ref-idx');
      const refType = (e.getAttribute('data-ref-type') || 'image') as RefType;
      const prefix = TYPE_TAG_PREFIX[refType] || 'IMAGE';
      r += idx ? `<${prefix}_${idx}>` : e.tagName === 'BR' ? '\n' : serialize(e);
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

    // -- expose API --
    useImperativeHandle(ref, () => ({
      insertTag(idx: number, name: string, refType: RefType = 'image') {
        const el = edRef.current;
        el || (void 0);
        if (!el) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = tagHtml(idx, name, refType);
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
    const dragIdxRef = useRef<number | null>(null);
    const dragTypeRef = useRef<RefType>('image');

    const handleDragStart = useCallback((e: React.DragEvent) => {
      const target = (e.target as HTMLElement).closest?.('[data-ref-idx]') as HTMLElement | null;
      target && (dragIdxRef.current = Number(target.getAttribute('data-ref-idx')), dragTypeRef.current = (target.getAttribute('data-ref-type') || 'image') as RefType);
      !target && e.preventDefault();
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      dragIdxRef.current !== null && e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      const idx = dragIdxRef.current;
      const refType = dragTypeRef.current;
      dragIdxRef.current = null;
      const el = edRef.current;
      (idx === null || !el) && (void 0);
      idx !== null && el && (() => {
        e.preventDefault();
        // Remove the original tag span from DOM
        const orig = el.querySelector(`[data-ref-idx="${idx}"][data-ref-type="${refType}"]`) || el.querySelector(`[data-ref-idx="${idx}"]`);
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

        // Re-create and insert tag at new position — find ref by type+idx
        const byType = referenceImages.filter(r => r.refType === refType);
        const ref = byType[idx - 1];
        ref && (() => {
          const tmp = document.createElement('div');
          tmp.innerHTML = tagHtml(idx, ref.name, refType);
          insertNodeAtCursor(el, tmp.firstElementChild!);
        })();

        // Serialize and sync
        const txt = serialize(el);
        lastVal.current = txt;
        onChange(txt);
      })();
    }, [referenceImages, onChange]);

    // -- @ select: remove '@', insert tag with type-specific index --
    const handleAtSelect = (arrayPos: number) => {
      const el = edRef.current;
      if (!el) return;
      const r = referenceImages[arrayPos];
      if (!r) return;
      const refType = r.refType;
      const idx = typeIndex(referenceImages, arrayPos);

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
      tmp.innerHTML = tagHtml(idx, r.name, refType);
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
            {referenceImages.map((r, i) => {
              const tIdx = typeIndex(referenceImages, i);
              const prefix = TYPE_TAG_PREFIX[r.refType];
              const isAud = r.refType === 'audio';
              const isVid = r.refType === 'video';
              return (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleAtSelect(i); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
              >
                {isAud ? (
                  <div className="h-6 w-6 shrink-0 rounded border border-border/30 bg-muted flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-400"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  </div>
                ) : isVid ? (
                  <div className="h-6 w-6 shrink-0 rounded border border-border/30 bg-muted flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/></svg>
                  </div>
                ) : (
                  <div className="h-6 w-6 shrink-0 relative">
                    <img src={r.previewUrl || r.url} alt="" className="h-6 w-6 rounded object-cover border border-border/30" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                    <div className="hidden h-6 w-6 rounded border border-border/30 bg-muted flex items-center justify-center absolute inset-0">
                      <UserRound className="w-3 h-3 text-muted-foreground/50" />
                    </div>
                  </div>
                )}
                <span className="font-medium truncate text-foreground">{r.name}</span>
                <span className={cn(
                  'text-[10px] ml-auto whitespace-nowrap',
                  isAud ? 'text-teal-500' : isVid ? 'text-amber-500' : 'text-muted-foreground',
                )}>{`${prefix}_${tIdx}`}</span>
              </button>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

export default RefTagInput;
