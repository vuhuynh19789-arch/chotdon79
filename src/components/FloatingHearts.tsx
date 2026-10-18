import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { subscribeTikTokLikes } from '../lib/tiktokLiveClient';
import { normalizeUser } from '../lib/core';

interface FloatingHeartItem {
  id: string;
  left: number;
  color: string;
  size: number;
  user?: string;
}

const HEART_COLORS = [
  '#ff0050',
  '#00f2ea',
  '#ff2d55',
  '#ff9500',
  '#ffcc00',
  '#e0245e',
  '#a855f7',
  '#ec4899',
];

export const FloatingHearts: React.FC = () => {
  const [hearts, setHearts] = useState<FloatingHeartItem[]>([]);
  const [recentLiker, setRecentLiker] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeTikTokLikes((data) => {
      const id = `heart_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const count = Math.min(data.likeCount || 1, 4); // spawn up to 4 hearts per burst
      
      const cleanUser = normalizeUser(data.user);
      if (cleanUser && cleanUser !== 'Khách') {
        setRecentLiker(cleanUser);
        setTimeout(() => setRecentLiker(null), 3000);
      }

      const newHearts: FloatingHeartItem[] = [];
      for (let i = 0; i < count; i++) {
        newHearts.push({
          id: `${id}_${i}`,
          left: 20 + Math.random() * 60, // position percentage from right
          color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
          size: 18 + Math.floor(Math.random() * 14),
          user: cleanUser,
        });
      }

      setHearts((prev) => [...prev.slice(-25), ...newHearts]);

      // Remove hearts after animation completes
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => !newHearts.some((nh) => nh.id === h.id)));
      }, 2500);
    });

    return () => unsubscribe();
  }, []);

  if (hearts.length === 0 && !recentLiker) return null;

  return (
    <div className="fixed bottom-20 right-4 pointer-events-none z-40 w-24 h-64 overflow-hidden flex flex-col justify-end items-center">
      {recentLiker && (
        <div className="text-[10px] font-bold text-pink-400 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full border border-pink-500/30 mb-2 animate-bounce">
          ❤️ {recentLiker}
        </div>
      )}
      {hearts.map((h) => (
        <div
          key={h.id}
          className="absolute bottom-2 animate-float-heart"
          style={{
            right: `${h.left}%`,
            color: h.color,
          }}
        >
          <Heart 
            size={h.size} 
            fill={h.color} 
            className="drop-shadow-[0_2px_8px_rgba(255,0,80,0.5)]" 
          />
        </div>
      ))}
    </div>
  );
};
