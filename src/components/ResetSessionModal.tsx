import React, { useState } from 'react';
import { RotateCcw, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

interface ResetSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

export const ResetSessionModal: React.FC<ResetSessionModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose, enabled: isOpen });
    const store = useStore();
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            store.resetSession();
            onSuccess?.("🔄 Đã reset số lượng và doanh thu về 0 thành công!");
            onClose();
        } catch (err) {
            console.error("Lỗi reset session:", err);
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
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <RotateCcw size={22} />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base leading-tight">Reset Số Liệu Phiên Bán</h3>
                            <p className="text-gray-400 text-xs mt-0.5">Làm mới số lượng và doanh thu</p>
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
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex items-start gap-3 text-amber-200">
                        <AlertTriangle size={22} className="shrink-0 text-amber-400 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                            <strong className="block text-amber-300 font-semibold mb-0.5">Lưu ý khi Reset:</strong>
                            Số lượng sản phẩm và doanh thu trên giỏ hàng sẽ được đưa về 0.
                        </div>
                    </div>

                    <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-3 text-emerald-300">
                        <ShieldCheck size={22} className="shrink-0 text-emerald-400 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                            <strong className="block text-emerald-200 font-semibold mb-0.5">Thông tin được giữ lại:</strong>
                            Danh sách tên khách hàng, lịch sử nhãn phân loại (VIP, Cọc, Bom hàng...) hoàn toàn được giữ lại.
                        </div>
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
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-900/30 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                        <RotateCcw size={16} />
                        <span>{isProcessing ? 'Đang reset...' : 'Xác nhận Reset số liệu'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
