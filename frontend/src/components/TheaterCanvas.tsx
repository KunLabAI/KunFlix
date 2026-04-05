'use client';

import { useEffect, useRef, useState } from 'react';

interface TheaterCanvasProps {
  width?: number;
  height?: number;
}

const TheaterCanvas: React.FC<TheaterCanvasProps> = ({ width = 800, height = 600 }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pixiApp, setPixiApp] = useState<any>(null);

  useEffect(() => {
    // Dynamically import pixi.js to ensure client-side only
    const initPixi = async () => {
      const PIXI = await import('pixi.js');
      
      if (!canvasRef.current) return;
      if (pixiApp) return;

      const app = new PIXI.Application();
      await app.init({ width, height, background: '#1099bb' });
      
      if (canvasRef.current) {
        canvasRef.current.appendChild(app.canvas);
      }
      setPixiApp(app);
      
      // Basic text to confirm rendering
      const text = new PIXI.Text({ text: 'KunFlix', style: { fill: 0xffffff } });
      text.x = 50;
      text.y = 50;
      app.stage.addChild(text);
    };

    initPixi();

    return () => {
      if (pixiApp) {
        pixiApp.destroy(true, { children: true, texture: true });
      }
    };
  }, [width, height]);

  return <div ref={canvasRef} className="rounded-lg shadow-lg overflow-hidden" />;
};

export default TheaterCanvas;
