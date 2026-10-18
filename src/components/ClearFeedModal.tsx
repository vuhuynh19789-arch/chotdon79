import React, { useState } from 'react';
import { Trash2, X, Check, ShieldCheck, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import { Platform, PLATFORMS } from '../lib/core';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

interface ClearFeedModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

export const ClearFeedModal: React.FC<ClearFeedModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose, enabled: isOpen });
    const store = useStore();
    const [selectedTarget, setSelectedTarget] = useState<'all' | Platform>('all');
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            if (selectedTarget === 'all') {
                store.clearFeed();
                onSuccess?.("🧹 Đã dọn sạch feed bình luận toàn bộ các kênh (TikTok, Facebook, Shopee)!");
            } else {
                store.clearFeed(selectedTarget);
                const pLabel = PLATFORMS[selectedTarget]?.label || selectedTarget;
                onSuccess?.(`🧹 Đã dọn sạch feed bình luận kênh ${pLabel}!`);
            }
            onClose();
        } catch (err) {
            console.error("Lỗi xoá feed:", err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" {...touchHandlers}>
            <div 
                style={modalStyle}
                className="bg-[#1c2533] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#151c27]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <Trash2 size={22} />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base leading-tight">Xoá Feed Bình Luận</h3>
                            <p className="text-gray-400 text-xs mt-0.5">Làm sạch màn hình chuẩn bị live mới</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 text-sm">
                    {/* Safe Guarantee Banner */}
                    <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-3 text-emerald-300">
                        <ShieldCheck size={22} className="shrink-0 text-emerald-400 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                            <strong className="block text-emerald-200 font-semibold mb-0.5">Dữ liệu an toàn 100%:</strong>
                            Danh sách khách hàng, giỏ hàng đã chốt và doanh thu phiên bán <span className="underline font-bold text-emerald-100">KHÔNG BỊ MẤT</span>. Thao tác này chỉ dọn sạch các dòng chat hiển thị.
                        </div>
                    </div>

                    {/* Scope Selector */}
                    <div>
                        <label className="text-xs font-semibold text-gray-300 block mb-2">Chọn phạm vi dọn sạch:</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedTarget('all')}
                                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left flex items-center justify-between transition-all ${
                                    selectedTarget === 'all'
                                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-sm'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                <span>🌐 Tất cả các kênh</span>
                                {selectedTarget === 'all' && <Check size={16} className="text-rose-400" />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setSelectedTarget('tiktok')}
                                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left flex items-center justify-between transition-all ${
                                    selectedTarget === 'tiktok'
                                        ? 'bg-[#00f2ea]/20 border-[#00f2ea] text-[#00f2ea] shadow-sm'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                <span>🎵 Chỉ TikTok</span>
                                {selectedTarget === 'tiktok' && <Check size={16} className="text-[#00f2ea]" />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setSelectedTarget('facebook')}
                                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left flex items-center justify-between transition-all ${
                                    selectedTarget === 'facebook'
                                        ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-sm'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                <span>📘 Chỉ Facebook</span>
                                {selectedTarget === 'facebook' && <Check size={16} className="text-blue-400" />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setSelectedTarget('shopee')}
                                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left flex items-center justify-between transition-all ${
                                    selectedTarget === 'shopee'
                                        ? 'bg-orange-500/20 border-orange-500 text-orange-300 shadow-sm'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                <span>🛒 Chỉ Shopee</span>
                                {selectedTarget === 'shopee' && <Check size={16} className="text-orange-400" />}
                            </button>
                        </div>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200/90 flex items-center gap-2">
                        <AlertCircle size={18} className="shrink-0 text-amber-400" />
                        <span>Phiên live mới bắt đầu nhận comment ngay sau khi dọn sạch.</span>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="px-5 py-4 border-t border-white/10 bg-[#151c27] flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-lg shadow-rose-900/30 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                        <Trash2 size={16} />
                        <span>{isProcessing ? 'Đang dọn dẹp...' : 'Xác nhận xoá feed ngay'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
