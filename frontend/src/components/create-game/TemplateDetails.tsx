
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { StoryTemplate } from './data';
import { Sparkles, MapPin, Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TemplateDetailsProps {
  template: StoryTemplate;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TemplateDetails({ template, onConfirm, onCancel }: TemplateDetailsProps) {
  return (
    <div className="relative w-full h-full flex flex-col justify-center overflow-hidden p-8 md:p-12 text-white">
      {/* Back Button */}
      <button 
        onClick={onCancel}
        className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/70 hover:text-white transition-colors backdrop-blur-sm"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Background Gradient with Animation */}
      <div className="absolute inset-0 z-0 bg-zinc-950">
        <AnimatePresence mode="popLayout">
          {template.backgroundImage ? (
            <motion.div
              key={`${template.id}-bg-image`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url('${template.backgroundImage}')` }}
              />
              {/* Gradient overlay: Darker on the left (for text), lighter on the right */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
            </motion.div>
          ) : (
            <motion.div
              key={`${template.id}-bg-gradient`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-20`} />
              <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-10 blur-3xl scale-110`} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Left Column: Title & Description */}
        <motion.div
          key={`info-${template.id}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-6"
        >
          <div className="space-y-2">
            <motion.span 
              className="inline-block px-3 py-1 rounded-full bg-zinc-800/50 backdrop-blur-sm text-sm font-medium border border-zinc-700/50 text-zinc-100"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {template.category}
            </motion.span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-50">{template.name}</h1>
          </div>
          
          <p className="text-lg text-zinc-400 leading-relaxed max-w-lg">
            {template.description}
          </p>

          <div className="pt-4">
            <Button 
              size="lg" 
              onClick={onConfirm}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
            >
              使用此模板
            </Button>
          </div>
        </motion.div>

        {/* Right Column: Features & Scenarios */}
        <motion.div
          key={`features-${template.id}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-zinc-900/60 backdrop-blur-md rounded-2xl p-6 border border-zinc-700/50 shadow-xl"
        >
          <div className="space-y-6">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-zinc-50">
                <Zap className="w-5 h-5 text-yellow-500" />
                特色元素
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.features.map((feature, idx) => (
                  <span 
                    key={idx} 
                    className="px-3 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-200"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-zinc-50">
                <MapPin className="w-5 h-5 text-blue-500" />
                适用场景
              </h3>
              <ul className="grid grid-cols-2 gap-2">
                {template.scenarios.map((scenario, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    {scenario}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
