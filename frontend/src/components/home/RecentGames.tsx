"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import GameCard from "./GameCard";
import CreateGameCard from "./CreateGameCard";

// Mock data for created games
const CREATED_GAMES = [
  { id: "1", title: "Cyberpunk Odyssey" },
  { id: "2", title: "Medieval Kingdom" },
  { id: "3", title: "Space Explorer" },
  { id: "4", title: "Zombie Survival" },
  { id: "5", title: "Mystery Mansion" },
  { id: "6", title: "Deep Sea Adventure" },
  { id: "7", title: "Mountain Peak" },
];

export default function RecentGames() {
  const router = useRouter();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (carouselRef.current) {
        setWidth(carouselRef.current.scrollWidth - carouselRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return (
    <div className="w-full py-8">
      <h2 className="text-2xl font-bold mb-6 px-6 text-foreground">Recent Games</h2>
      
      {/* Carousel Container */}
      <motion.div 
        ref={carouselRef} 
        className="cursor-grab active:cursor-grabbing overflow-hidden py-6 pl-6 -mr-6 pr-6"
        whileTap={{ cursor: "grabbing" }}
      >
        <motion.div
          drag="x"
          dragConstraints={{ right: 0, left: -width }}
          className="flex gap-6"
        >
          {/* Create Game Card - Always First */}
          <CreateGameCard onClick={() => router.push('/game/new')} />

          {/* User's Created Games */}
          {CREATED_GAMES.map((game) => (
            <GameCard
              key={game.id}
              id={game.id}
              title={game.title}
              // image={game.image} 
              onClick={() => console.log(`Game ${game.id} Clicked`)}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
