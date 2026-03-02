
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TEMPLATES } from '@/components/create-game/data';
import TemplateDetails from '@/components/create-game/TemplateDetails';
import TemplateList from '@/components/create-game/TemplateList';
import { motion } from 'framer-motion';

export default function CreateGamePage() {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(TEMPLATES[0].id);

  const selectedTemplate = TEMPLATES.find((t) => t.id === selectedTemplateId) || TEMPLATES[0];

  const handleConfirm = () => {
    // Navigate to the next step of game creation
    // For now, we can just log or navigate to a placeholder
    console.log('Selected Template:', selectedTemplate);
    // TODO: Implement actual game creation logic or navigate to configuration page
    router.push(`/game/new?template=${selectedTemplate.id}`);
  };

  const handleCancel = () => {
    router.push('/');
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Upper Section: Template Details */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex-[1.4] relative overflow-hidden"
      >
        <TemplateDetails 
          template={selectedTemplate} 
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </motion.div>

      {/* Lower Section: Template Selection */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex-1 min-h-[300px] relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]"
      >
        <TemplateList 
          templates={TEMPLATES}
          selectedId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
        />
      </motion.div>
    </div>
  );
}
