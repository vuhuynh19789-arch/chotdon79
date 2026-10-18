import React, { useState, useMemo } from 'react';
import { Save, X, Sparkles, CheckCircle2, Users, ShoppingBag, DollarSign, MessageSquare, Clock, FileText, ArrowRight } from 'lucide-react';
import { useStore, CommentData } from '../store';
import { Platform } from '../lib/core';
import { SavedLiveSession, SavedCustomerOrder, saveLiveSession, formatDateTime, formatTime, formatDate } from '../lib/liveSessions';

interface SaveLiveSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
    onViewSavedSessions?: () => void;
}

export function SaveLiveSessionModal({
    isOpen,
    onClose,
    onSuccess,
    onViewSavedSessions
}: SaveLiveSessionModalProps) {
    const store = useStore();

    // Default session name based on time of day
    const defaultName = useMemo(() => {
        const d = new Date();
        const hour = d.getHours();
        let sessionOfDay = 'Tối';
        if (hour >= 5 && hour < 11) sessionOfDay = 'Sáng';
        else if (hour >= 11 && hour < 14) sessionOfDay = 'Trưa';
        else if (hour >= 14 && hour < 18) sessionOfDay = 'Chiều';
        return `Phiên Live ${sessionOfDay} ${formatDate(d.getTime())}`;
    }, []);

    const [sessionName, setSessionName] = useState(defaultName);
    const [note, setNote] = useState('');
    const [resetStatsAfterSave, setResetStatsAfterSave] = useState(true);
    const [clearFeedAfterSave, setClearFeedAfterSave] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Collect all closed customers & items across platforms
    const {
        customersList,
        totalRevenue,
        totalOrders,
        totalCustomers,
        newCustomersCount,
        vipCustomersCount,
        totalComments,
        earliestCommentTs,
        latestCommentTs
    } = useMemo(() => {
        const list: SavedCustomerOrder[] = [];
        let rev = 0;
        let ord = 0;
        let vip = 0;
        let newCust = 0;

        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(platform => {
            const custs = store[platform].customers as Record<string, any>;
            Object.entries(custs).forEach(([user, data]) => {
                if (!data) return;
                const items = Array.isArray(data.items) ? data.items : [];
                const custQty = items.length > 0 
                    ? items.reduce((s: number, it: any) => s + (it.quantity || 1), 0)
                    : (data.count || 0);
                const custTotal = data.total || 0;

                if (custQty > 0 || custTotal > 0) {
                    rev += custTotal;
                    ord += custQty;

                    const tag = data.tag || '';
                    if (tag === 'VIP' || tag === 'Quen' || (data.historyCount && data.historyCount > 1)) {
                        vip++;
                    } else {
                        newCust++;
                    }

                    list.push({
                        user,
                        platform,
                        count: custQty,
                        total: custTotal,
                        tag: data.tag,
                        nickname: data.nickname,
                        phone: data.phone,
                        pancakeLink: data.pancakeLink,
                        items: items.map((it: any) => ({
                            id: it.id || String(Math.random()),
                            content: it.content || it.name || 'Món chốt',
                            price: it.price || 0,
                            createdAt: it.createdAt || it.time || Date.now()
                        }))
                    });
                }
            });
        });

        // Sort customers by total desc
        list.sort((a, b) => b.total - a.total);

        // Calculate comment count and time boundaries
        const allComments: CommentData[] = [
            ...store.tiktok.comments,
            ...store.facebook.comments,
            ...store.shopee.comments
        ].filter(c => c && c.ts);

        const commentTimestamps = allComments.map(c => Number(c.ts) || 0).filter(t => t > 0);
        const earliest = commentTimestamps.length > 0 ? Math.min(...commentTimestamps) : Date.now();
        const latest = commentTimestamps.length > 0 ? Math.max(...commentTimestamps) : Date.now();

        return {
            customersList: list,
            totalRevenue: rev,
            totalOrders: ord,
            totalCustomers: list.length,
            newCustomersCount: newCust,
            vipCustomersCount: vip,
            totalComments: allComments.length,
            earliestCommentTs: earliest,
            latestCommentTs: latest
        };
    }, [store.tiktok.customers, store.facebook.customers, store.shopee.customers, store.tiktok.comments, store.facebook.comments, store.shopee.comments]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (isSaving) return;
        setIsSaving(true);

        const now = Date.now();
        const sessionRecord: SavedLiveSession = {
            id: 'live_' + now,
            name: sessionName.trim() || defaultName,
            note: note.trim(),
            startTime: earliestCommentTs || now,
            endTime: latestCommentTs || now,
            savedAt: now,
            totalRevenue,
            totalOrders,
            totalComments,
            totalCustomers,
            newCustomersCount,
            vipCustomersCount,
            customers: customersList
        };

        try {
            saveLiveSession(sessionRecord);

            if (resetStatsAfterSave) {
                store.resetSession();
            }

            if (clearFeedAfterSave) {
                store.clearFeed();
            }

            onSuccess?.(`Đã lưu "${sessionRecord.name}" thành công (${totalRevenue.toLocaleString('vi-VN')}k - ${totalOrders} món)!`);
            onClose();
        } catch (err) {
            console.error('Error saving live session:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#121a24] border border-white/10 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-5 py-4 bg-gradient-to-r from-emerald-950/60 to-[#121a24] border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <Save size={20} />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
                                Lưu Phiên Live
                                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                    Lưu trữ & Báo cáo
                                </span>
                            </h2>
                            <p className="text-gray-400 text-xs">
                                Lưu lại toàn bộ đơn chốt, khách hàng và doanh số để đối soát & xem lại
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                    {/* Stats Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-[#182332] p-3 rounded-xl border border-emerald-500/20 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-emerald-400 mb-1">
                                <span className="text-[11px] font-medium">Doanh thu</span>
                                <DollarSign size={14} />
                            </div>
                            <div className="text-lg sm:text-xl font-black text-white">
                                {totalRevenue.toLocaleString('vi-VN')}k
                            </div>
                            <span className="text-[10px] text-gray-400 mt-0.5">từ đơn chốt</span>
                        </div>

                        <div className="bg-[#182332] p-3 rounded-xl border border-blue-500/20 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-blue-400 mb-1">
                                <span className="text-[11px] font-medium">Đơn chốt</span>
                                <ShoppingBag size={14} />
                            </div>
                            <div className="text-lg sm:text-xl font-black text-white">
                                {totalOrders}
                            </div>
                            <span className="text-[10px] text-gray-400 mt-0.5">món hàng</span>
                        </div>

                        <div className="bg-[#182332] p-3 rounded-xl border border-purple-500/20 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-purple-400 mb-1">
                                <span className="text-[11px] font-medium">Số khách</span>
                                <Users size={14} />
                            </div>
                            <div className="text-lg sm:text-xl font-black text-white">
                                {totalCustomers}
                            </div>
                            <span className="text-[10px] text-purple-300 mt-0.5">
                                {vipCustomersCount > 0 ? `${vipCustomersCount} quen, ${newCustomersCount} mới` : 'khách đã chốt'}
                            </span>
                        </div>

                        <div className="bg-[#182332] p-3 rounded-xl border border-white/10 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-gray-400 mb-1">
                                <span className="text-[11px] font-medium">Bình luận</span>
                                <MessageSquare size={14} />
                            </div>
                            <div className="text-lg sm:text-xl font-black text-white">
                                {totalComments}
                            </div>
                            <span className="text-[10px] text-gray-400 mt-0.5">
                                {earliestCommentTs ? `${formatTime(earliestCommentTs)} - ${formatTime(latestCommentTs)}` : 'toàn phiên'}
                            </span>
                        </div>
                    </div>

                    {/* Session Name & Note */}
                    <div className="space-y-3 bg-[#16202c] p-3.5 rounded-xl border border-white/5">
                        <div>
                            <label className="block text-gray-300 font-semibold mb-1 text-xs">
                                Tên phiên live <span className="text-rose-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={sessionName}
                                onChange={(e) => setSessionName(e.target.value)}
                                placeholder="VD: Phiên Live Tối 08/10, Xả kho đầm váy..."
                                className="w-full bg-[#0d141d] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="block text-gray-300 font-semibold mb-1 text-xs">
                                Ghi chú phiên live (tùy chọn)
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={2}
                                placeholder="Ghi chú thêm về ca live, doanh số, người trực, mã hàng hot..."
                                className="w-full bg-[#0d141d] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                            />
                        </div>
                    </div>

                    {/* Preview of Customers in this Session */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-gray-300 text-xs">
                                Danh sách khách hàng đã chốt ({customersList.length})
                            </span>
                            {customersList.length > 5 && (
                                <span className="text-[10px] text-gray-500">
                                    Đang hiện top 5 khách
                                </span>
                            )}
                        </div>

                        {customersList.length === 0 ? (
                            <div className="p-4 text-center bg-[#16202c] rounded-xl border border-white/5 text-gray-400">
                                Chưa có đơn chốt nào trong phiên hiện tại. Bạn vẫn có thể lưu lại mốc phiên live này.
                            </div>
                        ) : (
                            <div className="bg-[#16202c] rounded-xl border border-white/5 divide-y divide-white/5 max-h-40 overflow-y-auto">
                                {customersList.slice(0, 5).map((c, i) => (
                                    <div key={i} className="p-2.5 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-white truncate max-w-[150px]">{c.user}</span>
                                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-gray-300 uppercase">
                                                    {c.platform}
                                                </span>
                                                {c.tag && (
                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                                        {c.tag}
                                                    </span>
                                                )}
                                            </div>
                                            {c.phone && <div className="text-[10px] text-emerald-400 mt-0.5">📞 {c.phone}</div>}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="font-bold text-emerald-400">{c.total}k</span>
                                            <span className="text-gray-400 text-[10px] ml-1">({c.count} món)</span>
                                        </div>
                                    </div>
                                ))}
                                {customersList.length > 5 && (
                                    <div className="p-2 text-center text-gray-400 text-[11px] bg-white/[0.02]">
                                        + và {customersList.length - 5} khách hàng khác...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Options checkboxes */}
                    <div className="space-y-2.5 bg-[#16202c] p-3.5 rounded-xl border border-white/5">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={resetStatsAfterSave}
                                onChange={(e) => setResetStatsAfterSave(e.target.checked)}
                                className="mt-0.5 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                            />
                            <div>
                                <span className="font-semibold text-white text-xs block">
                                    Làm mới số liệu phiên (Reset doanh số & đơn chốt về 0)
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    Khuyên dùng: Chuẩn bị bảng số liệu trống để bắt đầu phiên live tiếp theo
                                </span>
                            </div>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer select-none border-t border-white/5 pt-2">
                            <input
                                type="checkbox"
                                checked={clearFeedAfterSave}
                                onChange={(e) => setClearFeedAfterSave(e.target.checked)}
                                className="mt-0.5 rounded border-gray-600 text-rose-500 focus:ring-rose-500 cursor-pointer"
                            />
                            <div>
                                <span className="font-semibold text-rose-300 text-xs block">
                                    Đồng thời dọn sạch danh sách bình luận (Bắt đầu màn hình trống)
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    Chỉ chọn khi bạn muốn xoá các bình luận cũ khỏi màn hình Feed
                                </span>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 bg-[#101824] border-t border-white/10 flex items-center justify-between gap-2">
                    {onViewSavedSessions && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onViewSavedSessions();
                            }}
                            className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                            <span>Xem các phiên đã lưu</span>
                            <ArrowRight size={13} />
                        </button>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-semibold cursor-pointer transition-colors"
                        >
                            Hủy bỏ
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Save size={15} />
                            <span>{isSaving ? 'Đang lưu...' : 'Xác Nhận Lưu Phiên Live'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
