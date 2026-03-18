import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Bot, X, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AIAssistantPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([
    { role: 'ai', content: '你好！我是你的专属创作 AI 助手，有什么可以帮你的吗？' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [panelSize, setPanelSize] = useState({ width: 320, height: 480 });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  
  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: inputValue }]);
    setInputValue('');
    
    // Mock AI response
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'ai', content: '这是一个模拟回复。AI功能正在开发中。' }]);
    }, 1000);
  };

  // Resize Handlers
  const handleResizeStart = (e: React.PointerEvent, direction: 'left' | 'bottom' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction === 'left' || direction === 'corner') {
        // Dragging left handle to the left (negative delta) increases width
        newWidth = Math.max(300, startWidth - deltaX);
      }
      
      if (direction === 'bottom' || direction === 'corner') {
        // Dragging bottom handle down (positive delta) increases height
        newHeight = Math.max(400, startHeight + deltaY);
      }

      setPanelSize({ width: newWidth, height: newHeight });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      {/* Drag boundary container (covers the screen but allows pointer events through) */}
      <div className="fixed inset-0 pointer-events-none z-40" ref={constraintsRef} />

      <AnimatePresence initial={false} mode="wait">
        {!isOpen ? (
          <motion.div
            key="ai-button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto"
          >
            <Button
              onClick={() => setIsOpen(true)}
              className="h-10 w-10 rounded-full shadow-lg bg-primary hover:bg-primary/90 flex items-center justify-center animate-pulse group relative overflow-hidden"
              title="唤起 AI 助手"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="ai-panel"
            drag
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={constraintsRef}
            dragMomentum={false}
            dragElastic={0}
            initial={{ opacity: 0, width: 48, height: 48, borderRadius: 24, x: 0, y: 0 }}
            animate={{ 
              opacity: 1, 
              width: panelSize.width, 
              height: panelSize.height, 
              borderRadius: 12, 
              // Do not animate x/y in animate prop to avoid fighting with drag
            }}
            exit={{ opacity: 0, width: 48, height: 48, borderRadius: 24 }}
            transition={{ 
              duration: 0.3, 
              ease: 'easeInOut',
              // Disable transition for x/y to prevent drag lag
              x: { duration: 0 },
              y: { duration: 0 }
            }}
            className="pointer-events-auto bg-background border shadow-2xl overflow-hidden flex flex-col absolute right-0 top-0 origin-top-right z-50 cursor-default"
            style={{ touchAction: 'none' }}
          >
            {/* Header (Draggable Handle) */}
            <div 
              className="flex items-center justify-between p-3 border-b bg-secondary/30 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium text-sm">AI 创作助手</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive z-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-secondary text-secondary-foreground rounded-tl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t bg-background">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="输入你的想法..."
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit" size="icon" disabled={!inputValue.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>

            {/* Resize Handles */}
            {/* Left Edge */}
            <div 
              className="absolute left-0 top-0 bottom-4 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'left')}
            />
            {/* Bottom Edge */}
            <div 
              className="absolute bottom-0 left-4 right-0 h-1 cursor-ns-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'bottom')}
            />
            {/* Bottom-Left Corner */}
            <div 
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize hover:bg-primary/50 transition-colors z-50 rounded-tr-lg"
              onPointerDown={(e) => handleResizeStart(e, 'corner')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
