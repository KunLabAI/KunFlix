"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import TheaterCard from "./TheaterCard";
import { Loader2 } from "lucide-react";

export default function SharedTheaters() {
  const [theaters, setTheaters] = useState<Array<{ id: string; title: string; image: string }>>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const loadMoreTheaters = useCallback(() => {
    if (loadingRef.current) return;
    // We'll leave the function here but disable the fake generation logic
    // loadingRef.current = true;
    // setLoading(true);
    //
    // TODO: Implement actual API call here
    // setTimeout(() => {
    //   setTheaters((prev) => [...prev]);
    //   setLoading(false);
    //   loadingRef.current = false;
    // }, 1000);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreTheaters();
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
  }, [loadMoreTheaters]);

  // Initial load
  useEffect(() => {
    if (theaters.length === 0) {
      loadMoreTheaters();
    }
  }, []);

  return (
    <div className="w-full px-6 py-8">
      <h2 className="text-2xl font-bold mb-6 text-foreground">社区剧场</h2>
      
      <div className="flex flex-wrap gap-6 justify-start">
        {theaters.map((theater) => (
          <div key={theater.id}>
            <TheaterCard
              id={theater.id}
              title={theater.title}
              // image={theater.image}
              onClick={() => console.log(`Shared Theater ${theater.id} Clicked`)}
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
