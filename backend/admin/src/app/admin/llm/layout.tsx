import React from 'react';

export default function LLMLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      {children}
    </div>
  );
}
