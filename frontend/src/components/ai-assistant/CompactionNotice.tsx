'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface CompactionNoticeProps {
  summary: string;
}

export function CompactionNotice({ summary }: CompactionNoticeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex justify-start">
      <div className="w-[90%] max-w-[85%]">
        {/* Collapsed header bar */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
            'bg-amber-500/8 border border-amber-500/15 hover:bg-amber-500/12',
            'text-amber-600/80 dark:text-amber-400/70 transition-colors cursor-pointer',
            'select-none',
            isExpanded && 'rounded-b-none border-b-0',
          )}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">上下文已压缩</span>
          <span className="text-[10px] opacity-60 ml-1">
            旧消息已被摘要替代
          </span>
          <span className="ml-auto">
            {isExpanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
          </span>
        </button>

        {/* Expandable summary content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  'px-3 py-3 rounded-b-lg border border-t-0 border-amber-500/15',
                  'bg-amber-500/5',
                )}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed opacity-80 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summary}
                  </ReactMarkdown>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default CompactionNotice;
