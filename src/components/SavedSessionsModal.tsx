import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, X, Download, Copy, Trash2, ChevronDown, ChevronUp, Search, DollarSign, ShoppingBag, Users, MessageSquare, Clock, Check, FileSpreadsheet, ExternalLink, AlertTriangle, Edit2, CheckCircle2 } from 'lucide-react';
import { SavedLiveSession, getSavedLiveSessions, deleteSavedLiveSession, updateSavedLiveSession, exportSessionToCSV, generateSessionReportText, formatDateTime, formatDate, formatTime } from '../lib/liveSessions';

interface SavedSessionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSaveCurrent?: () => void;
}

export function SavedSessionsModal({
    isOpen,
    onClose,
    onOpenSaveCurrent
}: SavedSessionsModalProps) {
    const [sessions, setSessions] = useState<SavedLiveSession[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
    const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingNote, setEditingNote] = useState('');

    const refreshSessions = () => {
        setSessions(getSavedLiveSessions());
    };

    useEffect(() => {
        if (isOpen) {
            refreshSessions();
            setExpandedSessionId(null);
            setConfirmDeleteId(null);
            setEditingSessionId(null);
        }
    }, [isOpen]);

    // Filter sessions
    const filteredSessions = useMemo(() => {
        if (!searchQuery.trim()) return sessions;
        const q = searchQuery.toLowerCase().trim();
        return sessions.filter(s => 
            s.name.toLowerCase().includes(q) || 
            (s.note && s.note.toLowerCase().includes(q)) ||
            s.customers.some(c => c.user.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)))
        );
    }, [sessions, searchQuery]);

    // Aggregate statistics across all saved sessions
    const stats = useMemo(() => {
        let rev = 0;
        let ord = 0;
        let cust = 0;
        sessions.forEach(s => {
            rev += s.totalRevenue || 0;
            ord += s.totalOrders || 0;
            cust += s.totalCustomers || 0;
        });
        return {
            totalSessions: sessions.length,
            totalRevenue: rev,
            totalOrders: ord,
            totalCustomers: cust
        };
    }, [sessions]);

    if (!isOpen) return null;

    const handleCopyReport = (session: SavedLiveSession) => {
        try {
            const report = generateSessionReportText(session);
            navigator.clipboard.writeText(report);
            setCopiedSessionId(session.id);
            setTimeout(() => setCopiedSessionId(null), 2500);
        } catch (err) {
            console.error('Failed to copy report:', err);
        }
    };

    const handleExportCSV = (session: SavedLiveSession) => {
        try {
            exportSessionToCSV(session);
        } catch (err) {
            console.error('Failed to export CSV:', err);
        }
    };

    const handleDelete = (sessionId: string) => {
        const updated = deleteSavedLiveSession(sessionId);
        setSessions(updated);
        setConfirmDeleteId(null);
    };

    const startEditing = (session: SavedLiveSession) => {
        setEditingSessionId(session.id);
        setEditingName(session.name);
        setEditingNote(session.note || '');
    };

    const saveEditing = (sessionId: string) => {
        const updated = updateSavedLiveSession(sessionId, {
            name: editingName.trim() || 'Phiên Live',
            note: editingNote.trim()
        });
        setSessions(updated);
        setEditingSessionId(null);
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#121a24] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-5 py-4 bg-gradient-to-r from-indigo-950/60 to-[#121a24] border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
                                Lịch Sử Các Phiên Live
                                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                    {sessions.length} phiên đã lưu
                                </span>
                            </h2>
                            <p className="text-gray-400 text-xs">
                                Xem lại doanh số, đơn hàng, xuất Excel hoặc sao chép báo cáo Zalo
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

                {/* Subheader / Overall Stats */}
                <div className="px-5 py-3 bg-[#0e1620] border-b border-white/5 flex items-center justify-between gap-3 flex-wrap text-xs">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5 text-gray-300">
                            <span className="text-gray-500">Tổng doanh thu:</span>
                            <span className="font-bold text-emerald-400">{stats.totalRevenue.toLocaleString('vi-VN')}k</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-300">
                            <span className="text-gray-500">Tổng đơn:</span>
                            <span className="font-bold text-blue-400">{stats.totalOrders} món</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-300">
                            <span className="text-gray-500">Số phiên:</span>
                            <span className="font-bold text-purple-400">{stats.totalSessions}</span>
                        </div>
                    </div>

                    {onOpenSaveCurrent && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onOpenSaveCurrent();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                        >
                            <span>+ Lưu phiên hiện tại</span>
                        </button>
                    )}
                </div>

                {/* Search Bar */}
                <div className="px-5 py-2.5 bg-[#121a24] border-b border-white/5">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm theo tên phiên, ghi chú, khách hàng hoặc số điện thoại..."
                            className="w-full bg-[#0d141d] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Body / Sessions List */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {filteredSessions.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-gray-500">
                                <Calendar size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">
                                    {searchQuery ? 'Không tìm thấy phiên live phù hợp' : 'Chưa có phiên live nào được lưu'}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                                    {searchQuery
                                        ? 'Thử tìm từ khóa khác hoặc xóa ô tìm kiếm'
                                        : 'Sau khi kết thúc ca live, hãy bấm nút "Lưu phiên live" trên thanh công cụ để lưu trữ toàn bộ dữ liệu.'}
                                </p>
                            </div>
                            {!searchQuery && onOpenSaveCurrent && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onOpenSaveCurrent();
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 mt-2"
                                >
                                    <span>Lưu phiên hiện tại ngay</span>
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredSessions.map((session) => {
                            const isExpanded = expandedSessionId === session.id;
                            const isCopied = copiedSessionId === session.id;
                            const isConfirmingDelete = confirmDeleteId === session.id;
                            const isEditing = editingSessionId === session.id;

                            return (
                                <div
                                    key={session.id}
                                    className="bg-[#16202c] border border-white/10 rounded-xl overflow-hidden transition-all hover:border-white/20"
                                >
                                    {/* Session Card Main Row */}
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            type="text"
                                                            value={editingName}
                                                            onChange={(e) => setEditingName(e.target.value)}
                                                            className="w-full bg-[#0d141d] border border-white/20 rounded px-2.5 py-1 text-white text-xs font-bold"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editingNote}
                                                            onChange={(e) => setEditingNote(e.target.value)}
                                                            placeholder="Ghi chú thêm..."
                                                            className="w-full bg-[#0d141d] border border-white/20 rounded px-2.5 py-1 text-gray-300 text-xs"
                                                        />
                                                        <div className="flex items-center gap-2 pt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => saveEditing(session.id)}
                                                                className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold"
                                                            >
                                                                Lưu thay đổi
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingSessionId(null)}
                                                                className="px-2.5 py-1 rounded bg-white/10 text-gray-300 text-[11px]"
                                                            >
                                                                Hủy
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="text-white font-bold text-sm sm:text-base">
                                                                {session.name}
                                                            </h3>
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditing(session)}
                                                                className="text-gray-500 hover:text-gray-300 transition-colors"
                                                                title="Chỉnh sửa tên & ghi chú"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                                                            <span className="flex items-center gap-1">
                                                                <Clock size={11} className="text-gray-500" />
                                                                <span>{formatDateTime(session.startTime)} - {formatTime(session.endTime)}</span>
                                                            </span>
                                                            <span>•</span>
                                                            <span>Lưu lúc {formatTime(session.savedAt)} {formatDate(session.savedAt)}</span>
                                                        </div>
                                                        {session.note && (
                                                            <p className="text-gray-300 text-xs mt-1.5 bg-black/20 px-2.5 py-1 rounded-md border border-white/5 inline-block">
                                                                💬 {session.note}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyReport(session)}
                                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                                                        isCopied
                                                            ? 'bg-emerald-600 text-white'
                                                            : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'
                                                    }`}
                                                    title="Sao chép báo cáo Zalo / Telegram"
                                                >
                                                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                                                    <span className="hidden sm:inline">{isCopied ? 'Đã copy' : 'Báo cáo'}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleExportCSV(session)}
                                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                                    title="Xuất danh sách đơn ra file Excel CSV"
                                                >
                                                    <Download size={13} />
                                                    <span className="hidden sm:inline">Xuất Excel</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteId(isConfirmingDelete ? null : session.id)}
                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 border border-white/5 transition-colors cursor-pointer"
                                                    title="Xoá phiên live đã lưu"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Confirm Delete Warning */}
                                        {isConfirmingDelete && (
                                            <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                                                <div className="flex items-center gap-2 text-rose-300">
                                                    <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                                                    <span>Bạn có chắc chắn muốn xoá vĩnh viễn phiên live này?</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="px-2.5 py-1 rounded bg-white/10 text-gray-300 text-xs hover:bg-white/20"
                                                    >
                                                        Hủy
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(session.id)}
                                                        className="px-2.5 py-1 rounded bg-rose-600 text-white font-bold text-xs hover:bg-rose-500"
                                                    >
                                                        Xoá ngay
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Metrics Row */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-white/5 text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400">Doanh thu:</span>
                                                <span className="font-extrabold text-emerald-400 text-sm">
                                                    {(session.totalRevenue || 0).toLocaleString('vi-VN')}k
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400">Đơn chốt:</span>
                                                <span className="font-bold text-blue-400">
                                                    {session.totalOrders || 0} món
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400">Số khách:</span>
                                                <span className="font-bold text-purple-400">
                                                    {session.totalCustomers || 0} khách
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400">Bình luận:</span>
                                                <span className="font-bold text-gray-200">
                                                    {session.totalComments || 0} cmt
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expandable Customers List Toggle */}
                                    {session.customers && session.customers.length > 0 && (
                                        <div className="border-t border-white/5 bg-[#121922]">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                                className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                                            >
                                                <span className="flex items-center gap-1.5 font-medium">
                                                    <Users size={13} className="text-indigo-400" />
                                                    <span>Xem danh sách {session.customers.length} khách chốt đơn</span>
                                                </span>
                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>

                                            {/* Expanded Customers Table */}
                                            {isExpanded && (
                                                <div className="p-4 pt-1 border-t border-white/5 space-y-2 max-h-64 overflow-y-auto">
                                                    {session.customers.map((c, i) => (
                                                        <div
                                                            key={i}
                                                            className="p-2.5 rounded-lg bg-[#182330] border border-white/5 flex items-start justify-between gap-3 text-xs"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-bold text-white">{c.user}</span>
                                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-gray-300 uppercase">
                                                                        {c.platform}
                                                                    </span>
                                                                    {c.tag && (
                                                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                                                            {c.tag}
                                                                        </span>
                                                                    )}
                                                                    {c.phone && (
                                                                        <span className="text-[10px] text-emerald-400 font-medium">
                                                                            📞 {c.phone}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {c.items && c.items.length > 0 && (
                                                                    <div className="mt-1 space-y-0.5 text-[11px] text-gray-400">
                                                                        {c.items.map((it, idx) => (
                                                                            <div key={idx} className="flex items-center gap-1.5">
                                                                                <span className="text-gray-600">└</span>
                                                                                <span className="text-gray-300 truncate max-w-[280px]">{it.content}</span>
                                                                                <span className="text-emerald-400 font-semibold">({it.price}k)</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="text-right shrink-0">
                                                                <div className="font-extrabold text-emerald-400 text-sm">
                                                                    {c.total}k
                                                                </div>
                                                                <div className="text-[10px] text-gray-400">
                                                                    {c.count} món
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 bg-[#101824] border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                        Dữ liệu lưu an toàn trên trình duyệt, không bị mất khi F5 hoặc mở lại máy
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-semibold cursor-pointer transition-colors"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
}
