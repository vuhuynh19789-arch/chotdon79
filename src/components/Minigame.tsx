import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Platform, PLATFORMS } from '../lib/core';

export function MinigameModal({ onClose, onOpenProfile, onOpenPrice }: { onClose: () => void, onOpenProfile: (u: string, p: Platform) => void, onOpenPrice: (id: string | null, u: string, p: Platform) => void }) {
    const store = useStore();
    const [keyword, setKeyword] = useState('10k');
    const [durationSec, setDurationSec] = useState(60);
    const [winnerCount, setWinnerCount] = useState(1);
    const [winMode, setWinMode] = useState<'random' | 'most_comments'>('random');
    
    const [gameState, setGameState] = useState<'idle' | 'playing' | 'spinning' | 'done'>('idle');
    const [startTime, setStartTime] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    
    const [participants, setParticipants] = useState<{user: string, platform: Platform, count: number}[]>([]);
    const [winners, setWinners] = useState<{user: string, platform: Platform, count: number}[]>([]);
    const [spinningWinner, setSpinningWinner] = useState<{user: string, platform: Platform, count: number} | null>(null);
    const [isFlipped, setIsFlipped] = useState(false);

    useEffect(() => {
        if (gameState === 'playing') {
            const interval = setInterval(() => {
                const now = Date.now();
                const diff = Math.max(0, startTime + durationSec * 1000 - now);
                setTimeLeft(Math.ceil(diff / 1000));
                
                const lowerKw = keyword.toLowerCase();
                const matched = new Map<string, {user: string, platform: Platform, count: number}>();
                
                (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
                    store[p].comments.forEach(c => {
                        if (c.ts && c.ts >= startTime && c.ts <= startTime + durationSec * 1000) {
                            if (c.content.toLowerCase().includes(lowerKw)) {
                                const key = `${p}-${c.user}`;
                                const curr = matched.get(key);
                                if (curr) {
                                    curr.count++;
                                } else {
                                    matched.set(key, { user: c.user, platform: p, count: 1 });
                                }
                            }
                        }
                    });
                });
                
                setParticipants(Array.from(matched.values()));

                if (diff === 0) {
                    setGameState('spinning');
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, [gameState, startTime, durationSec, keyword, store]);

    useEffect(() => {
        if (gameState === 'spinning') {
            if (participants.length === 0) {
                setWinners([]);
                setGameState('done');
                return;
            }

            const spinTime = 2500;
            const end = Date.now() + spinTime;

            const interval = setInterval(() => {
                const idx = Math.floor(Math.random() * participants.length);
                setSpinningWinner(participants[idx]);

                if (Date.now() >= end) {
                    clearInterval(interval);
                    
                    let finalWinners = [...participants];
                    if (winMode === 'most_comments') {
                        finalWinners.sort((a, b) => b.count - a.count);
                    } else {
                        // Shuffle for random winners
                        for (let i = finalWinners.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [finalWinners[i], finalWinners[j]] = [finalWinners[j], finalWinners[i]];
                        }
                    }
                    
                    setWinners(finalWinners.slice(0, winnerCount));
                    setGameState('done');
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, [gameState, participants, winMode, winnerCount]);

    const startGame = () => {
        if (winnerCount < 1) {
            alert('Số lượng người thắng phải lớn hơn hoặc bằng 1');
            return;
        }
        setStartTime(Date.now());
        setGameState('playing');
        setWinners([]);
        setSpinningWinner(null);
        setParticipants([]);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <div className={`relative z-10 bg-[#1c242f] rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden max-h-[90vh] transition-transform duration-300 border border-white/10 ${isFlipped ? '-scale-x-100' : ''}`}>
                <div className="bg-gradient-to-r from-purple-700 to-indigo-700 px-4 py-4 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        🎮 Minigame
                    </h2>
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => setIsFlipped(!isFlipped)} className="text-white hover:bg-white/20 px-2 py-1.5 rounded text-xs font-bold transition-colors border border-white/30 cursor-pointer">
                            {isFlipped ? 'Huỷ lật UI' : 'Lật UI 🔄'}
                        </button>
                        <button onClick={onClose} className="text-white hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition-colors ml-1 cursor-pointer">✕</button>
                    </div>
                </div>
                
                <div className="p-5 overflow-y-auto">
                    {gameState === 'idle' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-1">Cú pháp cần bình luận:</label>
                                <input 
                                    type="text" 
                                    value={keyword}
                                    onChange={e => setKeyword(e.target.value)}
                                    className="w-full p-2.5 bg-[#0e1621] text-white placeholder-gray-400 border border-white/20 rounded-lg font-bold focus:outline-none focus:border-indigo-500"
                                    placeholder="VD: 10k"
                                />
                            </div>
                            
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-gray-300 mb-1">Số phần thưởng:</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={winnerCount}
                                        onChange={e => setWinnerCount(parseInt(e.target.value) || 1)}
                                        className="w-full p-2.5 bg-[#0e1621] text-white placeholder-gray-400 border border-white/20 rounded-lg font-bold focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-gray-300 mb-1">Thể lệ chọn:</label>
                                    <select 
                                        value={winMode}
                                        onChange={e => setWinMode(e.target.value as 'random' | 'most_comments')}
                                        className="w-full p-2.5 bg-[#0e1621] text-white border border-white/20 rounded-lg font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
                                    >
                                        <option value="random" className="bg-[#1c242f] text-white">Ngẫu nhiên</option>
                                        <option value="most_comments" className="bg-[#1c242f] text-white">Cmt nhiều nhất</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-1">Thời gian (giây):</label>
                                <div className="flex gap-2">
                                    {[30, 60, 120, 300].map(s => (
                                        <button 
                                            key={s}
                                            onClick={() => setDurationSec(s)}
                                            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors cursor-pointer ${durationSec === s ? 'bg-indigo-600 text-white' : 'bg-[#0e1621] border border-white/10 text-gray-300 hover:bg-white/5'}`}
                                        >
                                            {s >= 60 ? `${s/60} phút` : `${s} giây`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <button 
                                onClick={startGame}
                                className="w-full mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white font-black text-lg py-3.5 rounded-xl shadow-md transition-all cursor-pointer"
                            >
                                🚀 BẮT ĐẦU TRÒ CHƠI
                            </button>
                        </div>
                    )}

                    {(gameState === 'playing' || gameState === 'spinning') && (
                        <div className="text-center space-y-6 py-4">
                            <div>
                                <div className="text-gray-400 font-bold mb-1">Thời gian còn lại</div>
                                <div className="text-5xl font-black text-indigo-400 font-mono">
                                    {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </div>
                            </div>
                            
                            <div className="bg-[#0e1621] p-4 rounded-xl border border-white/10">
                                <div className="text-sm font-bold text-gray-300 mb-2">Đang tìm cú pháp: <span className="text-indigo-400 text-lg">"{keyword}"</span></div>
                                <div className="text-3xl font-black text-white">{participants.length} <span className="text-base text-gray-400 font-bold">người hợp lệ</span></div>
                            </div>

                            {gameState === 'spinning' && (
                                <div className="animate-pulse">
                                    <div className="text-lg font-bold text-orange-400 mb-2">🎲 Đang quay thưởng...</div>
                                    {spinningWinner && (
                                        <div className="text-2xl font-black text-white">{store[spinningWinner.platform].nicknames?.[spinningWinner.user] ? `${spinningWinner.user} (${store[spinningWinner.platform].nicknames[spinningWinner.user]})` : spinningWinner.user} <span className="text-sm font-normal text-gray-400">({spinningWinner.count} cmt)</span></div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {gameState === 'done' && (
                        <div className="text-center py-4">
                            {winners.length > 0 ? (
                                <div>
                                    <div className="text-4xl mb-3">🎉</div>
                                    <h3 className="text-xl font-black text-white mb-4">
                                        {winners.length > 1 ? 'NHỮNG NGƯỜI CHIẾN THẮNG' : 'NGƯỜI CHIẾN THẮNG'}
                                    </h3>
                                    
                                    <div className="space-y-3 max-h-[40vh] overflow-y-auto px-1">
                                        {winners.map((w, i) => (
                                            <div key={i} className="flex flex-col gap-2 bg-[#0e1621] p-3 rounded-2xl border border-white/10 shadow-sm text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded text-white font-bold shrink-0 ${PLATFORMS[w.platform].bgClass}`}>
                                                        {PLATFORMS[w.platform].label}
                                                    </span>
                                                    <span className="text-lg font-black text-orange-400 truncate">{store[w.platform].nicknames?.[w.user] ? `${w.user} (${store[w.platform].nicknames[w.user]})` : w.user}</span>
                                                    {winMode === 'most_comments' && (
                                                        <span className="ml-auto text-xs font-bold text-gray-300 bg-[#1c242f] px-2 py-1 rounded-full border border-white/10 shadow-sm whitespace-nowrap">
                                                            {w.count} bình luận
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => onOpenProfile(w.user, w.platform)}
                                                        className="flex-1 py-2 bg-[#1c242f] border border-white/10 text-gray-200 hover:bg-white/10 font-bold text-sm rounded-lg transition-colors shadow-sm cursor-pointer"
                                                    >
                                                        👤 Hồ sơ
                                                    </button>
                                                    <button 
                                                        onClick={() => onOpenPrice(null, w.user, w.platform)}
                                                        className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-lg shadow-sm transition-colors cursor-pointer"
                                                    >
                                                        ➕ Lên đơn
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="text-4xl mb-4">😢</div>
                                    <h3 className="text-xl font-bold text-gray-400">Không có ai bình luận đúng cú pháp!</h3>
                                </div>
                            )}

                            <button 
                                onClick={() => setGameState('idle')}
                                className="w-full mt-6 py-3 border-2 border-indigo-500 text-indigo-400 font-bold rounded-xl hover:bg-indigo-500/10 transition-colors cursor-pointer"
                            >
                                🔄 Chơi lại
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
