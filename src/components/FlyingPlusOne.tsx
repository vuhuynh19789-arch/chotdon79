import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Platform, PLATFORMS } from '../lib/core';

export function FlyingPlusOneManager() {
    const [items, setItems] = useState<{ id: number, x: number, y: number, platform: Platform }[]>([]);

    useEffect(() => {
        const handleEvent = (e: any) => {
            const { x, y, platform } = e.detail;
            const id = Date.now() + Math.random();
            setItems(prev => [...prev, { id, x, y, platform }]);
        };
        window.addEventListener('FLYING_PLUS_ONE', handleEvent);
        return () => window.removeEventListener('FLYING_PLUS_ONE', handleEvent);
    }, []);

    const handleComplete = (id: number) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    return (
        <div className="fixed inset-0 pointer-events-none z-[9999]">
            <AnimatePresence>
                {items.map(item => (
                    <FlyingItem key={item.id} item={item} onComplete={() => handleComplete(item.id)} />
                ))}
            </AnimatePresence>
        </div>
    );
}

function FlyingItem({ item, onComplete }: { key?: any, item: { id: number, x: number, y: number, platform: Platform }, onComplete: () => void }) {
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        const target = document.getElementById(`stat-${item.platform}`);
        if (target) {
            setTargetRect(target.getBoundingClientRect());
        }
    }, [item.platform]);

    if (!targetRect) {
        return (
            <motion.div
                initial={{ x: item.x, y: item.y, opacity: 1, scale: 1 }}
                animate={{ y: item.y - 100, opacity: 0, scale: 1.5 }}
                transition={{ duration: 0.6 }}
                onAnimationComplete={onComplete}
                className="absolute text-2xl font-black text-green-500 drop-shadow-md"
            >
                +1
            </motion.div>
        );
    }

    const targetX = targetRect.x + targetRect.width / 2 - 10;
    const targetY = targetRect.y + targetRect.height / 2 - 10;

    return (
        <motion.div
            initial={{ x: item.x, y: item.y, opacity: 1, scale: 0.5 }}
            animate={{ 
                x: targetX, 
                y: targetY, 
                opacity: [1, 1, 0], 
                scale: [0.5, 1.5, 0.5] 
            }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
            onAnimationComplete={onComplete}
            className={`absolute text-2xl font-black drop-shadow-md ${PLATFORMS[item.platform].colorClass}`}
        >
            +1
        </motion.div>
    );
}
