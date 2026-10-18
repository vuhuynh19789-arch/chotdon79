import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calculator, Tag, Printer, Plus } from 'lucide-react';
import { useStore } from '../store';
import { Platform, PLATFORMS, getShortId, normalizeUser, getLastClosedPrice, getRecentSearchPrices } from '../lib/core';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

export interface ParsedCalculatorItem {
    id: string;
    unitPrice: number;
    quantity: number;
    total: number;
    name: string;
    rawTerm: string;
}

export function parseOrderFormula(rawExpr: string, defaultName: string = ''): {
    items: ParsedCalculatorItem[];
    grandTotalK: number;
    totalQty: number;
    isValid: boolean;
    cleanFormula: string;
} {
    if (!rawExpr || !rawExpr.trim()) {
        return { items: [], grandTotalK: 0, totalQty: 0, isValid: false, cleanFormula: '' };
    }

    const normalized = rawExpr
        .replace(/[xX×]/g, '*')
        .replace(/[\s]+/g, ' ')
        .trim();

    const rawTerms = normalized.split('+').map(t => t.trim()).filter(Boolean);
    const items: ParsedCalculatorItem[] = [];

    rawTerms.forEach((term, index) => {
        if (term.includes('*')) {
            const parts = term.split('*').map(p => parseFloat(p.trim())).filter(p => !isNaN(p) && p > 0);
            if (parts.length >= 2) {
                let p1 = parts[0];
                let p2 = parts[1];
                let unitPrice = p1;
                let qty = p2;
                
                // If user typed 2*89, unitPrice is 89, qty is 2
                if (p1 < 10 && p2 >= 10 && Number.isInteger(p1)) {
                    unitPrice = p2;
                    qty = p1;
                }
                if (parts.length > 2) {
                    qty = parts.slice(1).reduce((a, b) => a * b, 1);
                }
                const roundedPrice = Math.round(unitPrice);
                const roundedQty = Math.max(1, Math.round(qty));
                items.push({
                    id: `item_${index}_${Date.now()}`,
                    unitPrice: roundedPrice,
                    quantity: roundedQty,
                    total: roundedPrice * roundedQty,
                    name: defaultName ? `${defaultName} (${roundedPrice}k)` : `Sản phẩm ${roundedPrice}k`,
                    rawTerm: term
                });
            } else if (parts.length === 1) {
                const roundedPrice = Math.round(parts[0]);
                items.push({
                    id: `item_${index}_${Date.now()}`,
                    unitPrice: roundedPrice,
                    quantity: 1,
                    total: roundedPrice,
                    name: defaultName ? `${defaultName} (${roundedPrice}k)` : `Sản phẩm ${roundedPrice}k`,
                    rawTerm: term
                });
            }
        } else {
            const num = parseFloat(term);
            if (!isNaN(num) && num > 0) {
                const roundedPrice = Math.round(num);
                items.push({
                    id: `item_${index}_${Date.now()}`,
                    unitPrice: roundedPrice,
                    quantity: 1,
                    total: roundedPrice,
                    name: defaultName ? `${defaultName} (${roundedPrice}k)` : `Sản phẩm ${roundedPrice}k`,
                    rawTerm: term
                });
            }
        }
    });

    const grandTotalK = items.reduce((sum, it) => sum + it.total, 0);
    const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

    return {
        items,
        grandTotalK,
        totalQty,
        isValid: items.length > 0,
        cleanFormula: normalized
    };
}

export function ItemCalculatorModal({
    user,
    platform,
    sourceCommentId,
    defaultPrice,
    defaultContent,
    onClose,
    onAdded
}: {
    user: string;
    platform: Platform;
    sourceCommentId?: string | null;
    defaultPrice?: string;
    defaultContent?: string;
    onClose: () => void;
    onAdded?: (addedItems?: ParsedCalculatorItem[]) => void;
}) {
    const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose });
    const store = useStore();
    const cleanUser = normalizeUser(user);
    const pStore = store[platform];
    const flowPrice = pStore.flowPrice;
    const lastClosed = getLastClosedPrice();
    const searchPrices = getRecentSearchPrices();

    // Mặc định mở bảng tính lên là nhảy giá 0₫ (trừ khi có truyền defaultPrice cụ thể)
    const initialPriceStr = defaultPrice || '';

    const [formula, setFormula] = useState<string>(initialPriceStr);
    const [content, setContent] = useState(defaultContent || '');
    const [printNow, setPrintNow] = useState<boolean>(false);
    const formulaContainerRef = useRef<HTMLDivElement>(null);

    const cust = store[platform].customers[cleanUser];

    const parsedResult = useMemo(() => {
        return parseOrderFormula(formula, content.trim());
    }, [formula, content]);

    // Tự động cuộn sang phải cùng để luôn nhìn thấy số vừa nhập cuối cùng của phép tính dài
    useEffect(() => {
        const scrollToRight = () => {
            if (formulaContainerRef.current) {
                formulaContainerRef.current.scrollLeft = formulaContainerRef.current.scrollWidth + 2000;
            }
        };
        scrollToRight();
        const rAF = requestAnimationFrame(scrollToRight);
        const timer = setTimeout(scrollToRight, 50);
        return () => {
            cancelAnimationFrame(rAF);
            clearTimeout(timer);
        };
    }, [formula]);

    // Haptic feedback helper for ultra-responsive mobile feel
    const triggerHaptic = (ms: number = 12) => {
        if (typeof window !== 'undefined' && window.navigator && typeof window.navigator.vibrate === 'function') {
            try {
                window.navigator.vibrate(ms);
            } catch {
                // Ignore vibration errors
            }
        }
    };

    const handleNumpadKey = (key: string) => {
        triggerHaptic(15);
        if (key === 'C') {
            setFormula('');
        } else if (key === '⌫') {
            setFormula(prev => prev.slice(0, -1));
        } else if (key === '000') {
            setFormula(prev => {
                if (!prev) return '';
                const lastChar = prev.trim().slice(-1);
                if (['+', '*', 'x', 'X'].includes(lastChar)) return prev;
                return prev + '000';
            });
        } else if (key === '×' || key === '*' || key === 'x') {
            setFormula(prev => {
                if (!prev) return '';
                const trimmed = prev.trim();
                const lastChar = trimmed.slice(-1);
                if (['+', '*', 'x', 'X'].includes(lastChar)) {
                    return trimmed.slice(0, -1) + '*';
                }
                return trimmed + '*';
            });
        } else if (key === '+') {
            setFormula(prev => {
                if (!prev) return '';
                const trimmed = prev.trim();
                const lastChar = trimmed.slice(-1);
                if (['+', '*', 'x', 'X'].includes(lastChar)) {
                    return trimmed.slice(0, -1) + '+';
                }
                return trimmed + '+';
            });
        } else if (key === '=') {
            handleConfirmAdd();
        } else {
            // Digit 0-9
            setFormula(prev => prev + key);
        }
    };

    const handleAppendPreset = (val: string) => {
        triggerHaptic(15);
        setFormula(prev => {
            if (!prev || prev.trim() === '') return val;
            const trimmed = prev.trim();
            const lastChar = trimmed.slice(-1);
            if (['+', '*', 'x', 'X'].includes(lastChar)) {
                return trimmed + val;
            }
            return trimmed + '+' + val;
        });
    };

    const handleConfirmAdd = () => {
        if (!parsedResult.isValid || parsedResult.items.length === 0) return;
        triggerHaptic(25);

        const itemsToAdd = parsedResult.items.map(it => ({
            content: content.trim() ? (parsedResult.items.length > 1 ? `${content.trim()} (${it.unitPrice}k)` : content.trim()) : '',
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            price: it.total,
            sourceCommentId
        }));

        store.addMultipleCustomOrderItems(platform, cleanUser, itemsToAdd, printNow);

        if (onAdded) onAdded(parsedResult.items);
        else onClose();
    };

    // Global desktop physical keyboard support without popping up mobile virtual keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement && document.activeElement.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'text') {
                return;
            }

            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                handleNumpadKey(e.key);
            } else if (e.key === '+' || e.key === '=' && e.shiftKey) {
                e.preventDefault();
                handleNumpadKey('+');
            } else if (e.key === '*' || e.key === 'x' || e.key === 'X') {
                e.preventDefault();
                handleNumpadKey('*');
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                handleNumpadKey('⌫');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmAdd();
            } else if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                handleNumpadKey('C');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [formula, content, parsedResult]);

    const quickItemTags = ['Áo', 'Quần', 'Đầm / Váy', 'Set bộ', 'Áo khoác', 'Quà tặng', 'Phụ kiện', 'Túi xách'];
    const quickPrices = [
        lastClosed ? { label: `⚡ Chốt ${lastClosed}k`, val: String(lastClosed) } : null,
        ...searchPrices.map(sp => ({ label: `🔍 ${sp}k`, val: sp })),
        { label: '35k', val: '35' },
        { label: '39k', val: '39' },
        { label: '50k', val: '50' },
        { label: '65k', val: '65' },
        { label: '75k', val: '75' },
        { label: '89k', val: '89' },
        { label: '99k', val: '99' },
        { label: '120k', val: '120' },
        { label: '150k', val: '150' },
    ].filter(Boolean) as { label: string, val: string }[];

    return (
        <div 
            className="fixed inset-0 bg-black/85 z-[130] flex items-center justify-center p-1.5 sm:p-4 backdrop-blur-xs select-none"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
            {...touchHandlers}
        >
            <div style={modalStyle} className="bg-[#0f1724] rounded-3xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl border-2 border-cyan-500/40 animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className={`p-3 bg-gradient-to-r ${PLATFORMS[platform].bgClass || 'from-blue-600 to-indigo-700'} text-white flex items-center justify-between shadow-md`}>
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-lg shadow-inner shrink-0">
                            🧮
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 truncate">
                                <span>BẢNG TÍNH MÁY TÍNH</span>
                                <span className="bg-black/30 text-[9.5px] px-1.5 py-0.2 rounded-full font-bold">
                                    {PLATFORMS[platform].label}
                                </span>
                            </h3>
                            <div className="text-[10.5px] text-white/90 font-medium truncate flex items-center gap-1">
                                <span>Khách:</span>
                                <strong className="text-amber-200 font-mono">
                                    {store[platform].nicknames?.[cleanUser] ? `(${store[platform].nicknames[cleanUser]}) ${cleanUser}` : `#${getShortId(cleanUser)} ${cleanUser}`}
                                </strong>
                                {cust && (
                                    <span className="bg-black/40 text-emerald-300 text-[9.5px] px-1.5 py-0.2 rounded font-bold ml-1">
                                        Đang có {cust.count} món ({cust.total}k)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onPointerDown={onClose}
                        className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-white font-bold flex items-center justify-center text-sm cursor-pointer shrink-0 transition-transform active:scale-90"
                    >
                        ✕
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-2.5 sm:p-3 space-y-2.5 overflow-y-auto max-h-[85vh] custom-scrollbar">
                    {/* Tên sản phẩm / Ghi chú */}
                    <div className="bg-[#09101a] p-2 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-gray-300 flex items-center gap-1">
                                <Tag size={11} className="text-orange-400" />
                                <span>Ghi chú món / Tên sản phẩm:</span>
                            </label>
                            {content && (
                                <button
                                    type="button"
                                    onPointerDown={() => {
                                        triggerHaptic(10);
                                        setContent('');
                                    }}
                                    className="text-[9.5px] text-red-400 hover:text-red-300 font-semibold"
                                >
                                    Xóa
                                </button>
                            )}
                        </div>
                        <input
                            type="text"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="VD: Áo phông đỏ, Váy hoa..."
                            className="w-full py-1 px-2.5 bg-[#050b13] border border-white/10 focus:border-cyan-500 rounded-lg text-xs font-bold text-white outline-none placeholder-gray-500"
                        />
                        {/* Quick Name Chips */}
                        <div className="flex items-center gap-1 mt-1.5 overflow-x-auto hide-scrollbar pb-0.5">
                            {quickItemTags.map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onPointerDown={() => {
                                        triggerHaptic(10);
                                        setContent(prev => prev ? `${prev} ${tag}` : tag);
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 hover:text-white border border-white/10 text-[9.5px] font-medium shrink-0 cursor-pointer transition-transform"
                                >
                                    +{tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 🖩 MÀN HÌNH MÁY TÍNH LCD */}
                    <div className="bg-gradient-to-b from-[#050b14] via-[#09121f] to-[#050b14] p-3 rounded-2xl border-2 border-cyan-500/60 shadow-xl space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-cyan-400 px-0.5">
                            <span className="flex items-center gap-1">
                                <Calculator size={12} />
                                <span>MÀN HÌNH TÍNH (VD: 89*2 hoặc 39+89*2)</span>
                            </span>
                            <span className="text-gray-400 font-mono">Đơn vị: k (nghìn)</span>
                        </div>

                        {/* Màn hình hiển thị Công thức */}
                        <div className="relative bg-[#02060c] rounded-xl border border-cyan-500/40 p-2.5 min-h-[52px] flex flex-col justify-center shadow-inner">
                            <div className="flex items-center justify-between gap-2">
                                {formula ? (
                                    <button
                                        type="button"
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            triggerHaptic(15);
                                            setFormula('');
                                        }}
                                        className="w-6 h-6 rounded-md bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-300 flex items-center justify-center text-xs font-bold shrink-0 cursor-pointer active:scale-90 transition-transform"
                                        title="Xóa phép tính"
                                    >
                                        ✕
                                    </button>
                                ) : (
                                    <span className="text-[11px] text-gray-500 italic shrink-0">Bấm phím số bên dưới...</span>
                                )}

                                <div 
                                    ref={formulaContainerRef}
                                    className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap hide-scrollbar py-0.5 select-text"
                                    style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
                                >
                                    <div className="font-mono font-black text-2xl sm:text-3xl text-cyan-300 tracking-wider inline-flex min-w-full justify-end px-1">
                                        {formula || '0'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bóc tách kết quả trực tiếp */}
                        <div className="pt-1.5 border-t border-white/10 flex items-center justify-between px-0.5">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                                <span className="bg-cyan-950/90 text-cyan-300 border border-cyan-600/50 px-2 py-0.5 rounded-lg text-xs font-black font-mono shadow-xs shrink-0">
                                    📦 {parsedResult.totalQty} món
                                </span>
                                {parsedResult.items.length > 1 && (
                                    <div className="text-[10px] text-gray-400 overflow-x-auto whitespace-nowrap hide-scrollbar font-mono flex-1 min-w-0">
                                        ({parsedResult.items.map(it => `${it.quantity}x${it.unitPrice}k`).join('+')})
                                    </div>
                                )}
                            </div>

                            <div className="text-right shrink-0">
                                <div className="text-lg sm:text-xl font-black text-emerald-400 font-mono leading-none">
                                    = {parsedResult.grandTotalK}k
                                </div>
                                <div className="text-[9.5px] font-bold text-orange-300 mt-0.5">
                                    ≈ {(parsedResult.grandTotalK * 1000).toLocaleString('vi-VN')} đ
                                </div>
                            </div>
                        </div>

                        {/* Chi tiết từng món bóc tách */}
                        {parsedResult.items.length > 0 && (
                            <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar pt-1">
                                {parsedResult.items.map((it, idx) => (
                                    <div
                                        key={it.id || idx}
                                        className="bg-[#121e30] border border-cyan-500/30 rounded-lg px-2 py-1 flex items-center gap-1.5 text-[10.5px] shrink-0 font-mono"
                                    >
                                        <span className="text-cyan-400 font-bold">#{idx + 1}</span>
                                        <span className="text-white font-bold">{it.quantity} cái × {it.unitPrice}k</span>
                                        <span className="text-emerald-400 font-black">= {it.total}k</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Phím tắt giá nhanh */}
                    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar py-0.5">
                        <span className="text-[9.5px] font-bold text-gray-400 shrink-0">⚡ Giá:</span>
                        {quickPrices.slice(0, 7).map((qp, idx) => (
                            <button
                                key={`qp_${idx}`}
                                type="button"
                                onPointerDown={() => handleAppendPreset(qp.val)}
                                className="px-2 py-1 rounded-lg text-[10.5px] font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200 shrink-0 transition-transform active:scale-90 cursor-pointer"
                                style={{ touchAction: 'manipulation' }}
                            >
                                +{qp.label}
                            </button>
                        ))}
                    </div>

                    {/* 📱 BÀN PHÍM MÁY TÍNH CẢM ỨNG SIÊU NHẠY */}
                    <div className="bg-[#080d16] p-2 rounded-2xl border border-white/10 shadow-inner">
                        <div className="grid grid-cols-4 gap-1.5">
                            {[
                                { k: 'C', label: 'C', sub: 'Xóa', cls: 'bg-red-950/70 text-red-300 hover:bg-red-900 border-red-500/40 text-lg font-black' },
                                { k: '⌫', label: '⌫', sub: 'Lùi', cls: 'bg-slate-800 text-gray-200 hover:bg-slate-700 text-lg font-black' },
                                { k: quickPrices[1]?.val || '89', label: `+${quickPrices[1]?.label || '89k'}`, sub: 'Giá nhanh', isPreset: true, cls: 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border-emerald-500/40 font-black text-sm' },
                                { k: quickPrices[2]?.val || '35', label: `+${quickPrices[2]?.label || '35k'}`, sub: 'Giá nhanh', isPreset: true, cls: 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border-emerald-500/40 font-black text-sm' },

                                { k: '7', label: '7', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '8', label: '8', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '9', label: '9', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: quickPrices[0]?.val || '39', label: `+${quickPrices[0]?.label || '39k'}`, sub: 'Giá nhanh', isPreset: true, cls: 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border-emerald-500/40 font-black text-sm' },

                                { k: '4', label: '4', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '5', label: '5', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '6', label: '6', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '*', label: '×', sub: 'Nhân SL', cls: 'bg-indigo-900/80 text-indigo-200 hover:bg-indigo-800 border-indigo-500/50 text-2xl font-black' },

                                { k: '1', label: '1', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '2', label: '2', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '3', label: '3', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '+', label: '+', sub: 'Cộng', cls: 'bg-indigo-900/80 text-indigo-200 hover:bg-indigo-800 border-indigo-500/50 text-2xl font-black' },

                                { k: '0', label: '0', cls: 'bg-[#162130] text-white hover:bg-[#203046] text-xl font-black' },
                                { k: '000', label: '000', cls: 'bg-[#1a293c] text-cyan-300 hover:bg-[#233750] text-sm font-black' },
                                { k: quickPrices[3]?.val || '50', label: `+${quickPrices[3]?.label || '50k'}`, sub: 'Giá nhanh', isPreset: true, cls: 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border-emerald-500/40 font-black text-sm' },
                                { k: '=', label: '= THÊM', sub: 'Chốt', cls: 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-950' },
                            ].map((btn, idx) => (
                                <button
                                    key={`calc_btn_${idx}_${btn.k}`}
                                    type="button"
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        if (btn.isPreset) {
                                            handleAppendPreset(btn.k);
                                        } else {
                                            handleNumpadKey(btn.k);
                                        }
                                    }}
                                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                                    className={`h-12 sm:h-13 rounded-xl font-mono flex flex-col items-center justify-center border border-white/5 transition-transform duration-75 active:scale-90 active:brightness-125 cursor-pointer select-none ${btn.cls}`}
                                >
                                    <span>{btn.label}</span>
                                    {btn.sub && (
                                        <span className="text-[8.5px] opacity-75 font-sans font-normal leading-none mt-0.5">
                                            {btn.sub}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tùy chọn In tem */}
                    <div className="flex items-center justify-between px-1 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer text-gray-300 select-none">
                            <input
                                type="checkbox"
                                checked={printNow}
                                onChange={e => setPrintNow(e.target.checked)}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-white/20 cursor-pointer"
                            />
                            <span className="font-semibold flex items-center gap-1 text-[11px] sm:text-xs">
                                <Printer size={12} className="text-emerald-400" />
                                <span>In tem nhãn dán ngay sau khi thêm</span>
                            </span>
                        </label>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-2.5 sm:p-3 bg-[#0a111b] border-t border-white/10 flex items-center gap-2">
                    <button
                        type="button"
                        onPointerDown={onClose}
                        className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs rounded-xl transition-transform active:scale-95 cursor-pointer"
                        style={{ touchAction: 'manipulation' }}
                    >
                        ✕ ĐÓNG
                    </button>
                    <button
                        type="button"
                        onPointerDown={handleConfirmAdd}
                        disabled={!parsedResult.isValid || parsedResult.items.length === 0}
                        className="flex-[2] py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ touchAction: 'manipulation' }}
                    >
                        <Plus size={15} className="stroke-[3]" />
                        <span>THÊM VÀO ĐƠN ({parsedResult.totalQty} MÓN - {parsedResult.grandTotalK}k)</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
