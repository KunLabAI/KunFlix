"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import GameCard from "./GameCard";
import { Loader2 } from "lucide-react";

// Mock data generator
const generateGames = (startId: number, count: number) => {
  return Array.from({ length: count }).map((_, i) => ({
    id: `shared-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: `Shared Game ${startId + i}`,
    image: "/api/placeholder/400/600",
  }));
};

export default function SharedGames() {
  const [games, setGames] = useState<Array<{ id: string; title: string; image: string }>>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const loadMoreGames = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setGames((prev) => {
        const newGames = generateGames(prev.length, 6);
        return [...prev, ...newGames];
      });
      setLoading(false);
      loadingRef.current = false;
    }, 1000);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreGames();
        }
      },
      { threshold: 1.0 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [loadMoreGames]);

  // Initial load
  useEffect(() => {
    if (games.length === 0) {
      loadMoreGames();
    }
  }, []);

  return (
    <div className="w-full px-6 py-8">
      <h2 className="text-2xl font-bold mb-6 text-foreground">Community Games</h2>
      
      <div className="flex flex-wrap gap-6 justify-start">
        {games.map((game) => (
          <div key={game.id}>
            <GameCard
              id={game.id}
              title={game.title}
              // image={game.image}
              onClick={() => console.log(`Shared Game ${game.id} Clicked`)}
            />
          </div>
        ))}
      </div>

      <div ref={observerTarget} className="w-full py-8 flex justify-center items-center">
        {loading && <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />}
      </div>
    </div>
  );
}
