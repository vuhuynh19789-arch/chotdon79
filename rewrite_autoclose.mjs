import fs from 'fs';

const code = `import React, { useState, useEffect, useRef } from 'react';
import { useStore, CommentData, TagType } from '../store';
import { extractPriceFromContent } from '../lib/core';

export interface AutoCloseConfig {
    excludeKeywords: string;
    excludeTags: string[];
    isRunning: boolean;
}

const AVAILABLE_TAGS: {id: string, label: string}[] = [
    {id: 'DAO', label: 'Vãng lai (DẠO)'},
    {id: 'BOM', label: 'Bom hàng (BOM)'},
    {id: 'CHAN', label: 'Chặn (CHẶN)'},
    {id: 'COC', label: 'Cọc (CỌC)'},
    {id: 'VIP', label: 'VIP'},
    {id: 'NORMAL', label: 'Bình thường'}
];

export function useAutoClose() {
    const store = useStore();
    const [config, setConfig] = useState<AutoCloseConfig>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('slp_autoclose') || '{}');
            return {
                excludeKeywords: saved.excludeKeywords ?? "huỷ\\nđổi\\nnhầm\\nko lấy\\nkhông lấy\\nkhông\\nxin\\nbớt",
                excludeTags: saved.excludeTags ?? ['DAO', 'BOM', 'CHAN'],
                isRunning: saved.isRunning || false
            };
        } catch {
            return { 
                excludeKeywords: "huỷ\\nđổi\\nnhầm\\nko lấy\\nkhông lấy\\nkhông\\nxin\\nbớt", 
                excludeTags: ['DAO', 'BOM', 'CHAN'],
                isRunning: false 
            };
        }
    });

    const processedRef = useRef<Set<string>>(new Set());
    const initialLoadRef = useRef<boolean>(true);
    const printQueueRef = useRef<Array<{platform: any, user: string, content: string, price: string, time: string, id: string}>>([]);
    const isPrintingRef = useRef<boolean>(false);

    const saveConfig = (newConfig: Partial<AutoCloseConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...newConfig };
            try {
                localStorage.setItem('slp_autoclose', JSON.stringify({
                    excludeKeywords: next.excludeKeywords,
                    excludeTags: next.excludeTags,
                    isRunning: next.isRunning
                }));
            } catch (e) {}
            return next;
        });
    };

    // Print queue processor
    useEffect(() => {
        const interval = setInterval(() => {
            if (printQueueRef.current.length > 0 && !isPrintingRef.current) {
                isPrintingRef.current = true;
                const order = printQueueRef.current.shift();
                if (order) {
                    store.printNewOrder(order.platform, order.user, order.content, order.price, order.time, order.id);
                }
                // allow browser to process intent before next print
                setTimeout(() => {
                    isPrintingRef.current = false;
                }, 1500); // 1.5s interval between prints
            }
        }, 500);
        return () => clearInterval(interval);
    }, [store]);

    useEffect(() => {
        if (!config.isRunning) return;

        const keywords = config.excludeKeywords.split('\\n')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        const allComments: CommentData[] = [
            ...store.tiktok.comments,
            ...store.facebook.comments,
            ...store.shopee.comments
        ];

        if (initialLoadRef.current) {
            allComments.forEach(c => processedRef.current.add(c.id));
            if (allComments.length > 0) initialLoadRef.current = false;
            return;
        }

        allComments.forEach(c => {
            if (!processedRef.current.has(c.id)) {
                processedRef.current.add(c.id);
                
                const userTag = store[c.platform].tags?.[c.user] || 'NORMAL';
                if (config.excludeTags.includes(userTag)) return;

                const { price, content } = extractPriceFromContent(c.content);
                const hasPrice = parseInt(price) > 0;
                
                if (hasPrice) {
                    const lowerContent = c.content.toLowerCase();
                    const hasExcluded = keywords.some(k => lowerContent.includes(k));
                    
                    if (!hasExcluded) {
                        const time = new Date(c.time).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                        // push to print queue instead of immediate call
                        printQueueRef.current.push({
                            platform: c.platform,
                            user: c.user,
                            content,
                            price,
                            time,
                            id: c.id
                        });
                    }
                }
            }
        });
    }, [config.isRunning, config.excludeKeywords, config.excludeTags, store.tiktok.comments, store.facebook.comments, store.shopee.comments]);

    return { config, saveConfig };
}

export function AutoCloseModal({ 
    config, 
    saveConfig, 
    onClose 
}: { 
    config: AutoCloseConfig; 
    saveConfig: (c: Partial<AutoCloseConfig>) => void; 
    onClose: () => void;
}) {
    const toggleTag = (tagId: string) => {
        const newTags = config.excludeTags.includes(tagId)
            ? config.excludeTags.filter(t => t !== tagId)
            : [...config.excludeTags, tagId];
        saveConfig({ excludeTags: newTags });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-[400px] overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-bold text-[#0056b3] m-0">⚡ Tự động chốt</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold flex items-center justify-center">✕</button>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Từ khoá loại trừ (mỗi dòng 1 từ):</label>
                        <textarea 
                            className="w-full h-32 p-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="huỷ\nđổi\nnhầm\nko lấy..."
                            value={config.excludeKeywords}
                            onChange={e => saveConfig({ excludeKeywords: e.target.value })}
                            disabled={config.isRunning}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">KHÔNG tự động chốt cho khách có nhãn:</label>
                        <div className="grid grid-cols-2 gap-2">
                            {AVAILABLE_TAGS.map(tag => (
                                <label key={tag.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                                    <input 
                                        type="checkbox" 
                                        checked={config.excludeTags.includes(tag.id)}
                                        onChange={() => toggleTag(tag.id)}
                                        disabled={config.isRunning}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="text-sm font-medium text-gray-700">{tag.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    
                    <div className="text-xs text-gray-500 italic">
                        * Khi bật, bình luận có giá sẽ được in đơn tự động (trừ khi chứa từ khoá loại trừ hoặc khách thuộc nhóm nhãn đã chọn bên trên). 
                        <br/>Các đơn tự động chốt sẽ in lần lượt cách nhau 1.5 giây.
                    </div>
                </div>
                
                <div className="p-3 border-t border-gray-200 flex gap-2 shrink-0">
                    <button 
                        onClick={() => {
                            saveConfig({ isRunning: !config.isRunning });
                            if (!config.isRunning) onClose();
                        }}
                        className={\`flex-1 py-2.5 rounded-lg font-bold text-white text-[15px] \${config.isRunning ? 'bg-red-500' : 'bg-blue-600'}\`}
                    >
                        {config.isRunning ? '🛑 TẮT AUTO CHỐT' : '▶️ BẬT AUTO CHỐT'}
                    </button>
                </div>
            </div>
        </div>
    );
}
`;
fs.writeFileSync('src/components/AutoClose.tsx', code);
console.log("Updated AutoClose");
