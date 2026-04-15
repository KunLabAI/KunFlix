'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScrollToBottomButtonProps {
  isVisible: boolean;
  onClick: () => void;
  hasNewMessages?: boolean;
  className?: string;
}

export function ScrollToBottomButton({
  isVisible,
  onClick,
  hasNewMessages = false,
  className,
}: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'absolute bottom-10 left-1/2 -translate-x-1/2 z-20',
            className
          )}
        >
          <Button
            variant="secondary"
            size="icon"
            onClick={onClick}
            className={cn(
              'h-8 w-8 rounded-full shadow-lg border border-border/50',
              'bg-background/90 backdrop-blur-sm hover:bg-background',
              'flex items-center justify-center relative',
              hasNewMessages && 'bg-primary/10 text-primary border-primary/30'
            )}
          >
            <ArrowDown className="h-4 w-4" />
            {hasNewMessages && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
              </span>
            )}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ScrollToBottomButton;
