import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Smartphone, Check, Trash2, X, Clipboard, Search, RefreshCw, MessageSquare, Copy, Sparkles, AlertCircle, Clock, Phone, MapPin } from 'lucide-react';
import { useStore, getCustomerAvatar } from '../store';
import { Platform, PLATFORMS, getShortId, normalizeUser } from '../lib/core';
import { openPancakeApp } from '../lib/pancakeDeepLink';
import { CustomerAvatar } from './UserAvatar';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';
import { 
  fetchRecentZaloConversations, 
  ZaloInboxConversation, 
  generateSuggestedPancakeName, 
  getOrderStatusLabel, 
  getCustomerInsight,
  syncSingleCustomerPancakeOrders,
  updatePancakeCustomerName
} from '../lib/pancakeSync';

interface PancakeLinkModalProps {
    isOpen: boolean;
    user: string;
    platform: Platform;
    initialSearch?: string;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

export const PancakeLinkModal: React.FC<PancakeLinkModalProps> = ({
    isOpen,
    user,
    platform,
    initialSearch,
    onClose,
    onSuccess
}) => {
    const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose, enabled: isOpen });
    const store = useStore();
    const cleanUser = normalizeUser(user);
    const existingLink = store[platform].pancakeLinks?.[cleanUser] || '';
    
    const [inputValue, setInputValue] = useState(existingLink);
    const [isLoadingConvs, setIsLoadingConvs] = useState(false);
    const [zaloConvs, setZaloConvs] = useState<ZaloInboxConversation[]>([]);
    const [searchQuery, setSearchQuery] = useState(initialSearch || '');
    const [activeTab, setActiveTab] = useState<'new_only' | 'all' | 'manual'>('new_only');
    const [copiedName, setCopiedName] = useState<string | null>(null);
    const [customNickname, setCustomNickname] = useState('');

    const nickname = store[platform].nicknames?.[cleanUser] || '';
    const tag = store[platform].tags?.[cleanUser] || 'NORMAL';
    const avatarUrl = getCustomerAvatar(cleanUser, platform) || undefined;
    const insight = getCustomerInsight(cleanUser);

    const loadConversations = async () => {
        setIsLoadingConvs(true);
        try {
            const res = await fetchRecentZaloConversations(undefined, platform === 'facebook' ? 'facebook' : 'all');
            setZaloConvs(res.conversations || []);
        } catch (err) {
            console.error("Lỗi tải hội thoại Pancake:", err);
        } finally {
            setIsLoadingConvs(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            const currentLink = store[platform].pancakeLinks?.[cleanUser] || '';
            setInputValue(currentLink);
            setCustomNickname(store[platform].nicknames?.[cleanUser] || '');
            if (initialSearch) {
                setSearchQuery(initialSearch);
            } else {
                setSearchQuery('');
            }
            loadConversations();
            // Nếu đã có link, mặc định mở tab all để xem/sửa link; nếu chưa có link, mở tab new_only
            setActiveTab(currentLink ? 'all' : 'new_only');
        }
    }, [isOpen, cleanUser, platform, initialSearch]);

    if (!isOpen) return null;

    const handleSelectConversation = (conv: ZaloInboxConversation) => {
        const link = conv.deepLink;
        setInputValue(link);
        
        // 1. Tên chuẩn dạng: [Tên Zalo] #[ShortId] [Tên TikTok] (ví dụ: Trâm Huỳnh #463 Thùy Dung 90)
        const suggestedName = generateSuggestedPancakeName(conv.name, cleanUser);

        // 2. Lưu link Pancake & Đồng bộ đơn POS tự động (KHÔNG đổi tên gợi nhớ của khách ở chotdon)
        store.setCustomerPancakeLink(platform, cleanUser, link);
        syncSingleCustomerPancakeOrders(cleanUser, platform, link);

        // 3. Cập nhật tên / ghi chú hội thoại trên Pancake Pages & POS
        updatePancakeCustomerName({
            pageId: conv.pageId,
            convId: conv.id,
            customerId: conv.customerId,
            newName: suggestedName
        });

        // 4. Tự động copy tên chuẩn vào clipboard để tiện đối soát/sử dụng
        if (navigator?.clipboard?.writeText) {
            try {
                navigator.clipboard.writeText(suggestedName);
            } catch {}
        }

        onSuccess?.(`🥞 Đã gán Zalo "${conv.name}" cho @${cleanUser}!`);
        onClose();
    };

    const handleSaveManual = () => {
        const link = inputValue.trim();
        store.setCustomerPancakeLink(platform, cleanUser, link);
        store.setCustomerNickname(platform, cleanUser, customNickname.trim());
        if (link) {
            syncSingleCustomerPancakeOrders(cleanUser, platform, link);
            onSuccess?.(`🥞 Đã lưu liên kết Pancake cho khách ${cleanUser}!`);
        } else {
            onSuccess?.(`Đã gỡ liên kết Pancake của ${cleanUser}`);
        }
        onClose();
    };

    const handleRemoveLink = () => {
        store.setCustomerPancakeLink(platform, cleanUser, '');
        setInputValue('');
        onSuccess?.(`Đã gỡ liên kết Pancake của ${cleanUser}`);
        onClose();
    };

    const handleCopy = (text: string, id: string) => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedName(id);
            setTimeout(() => setCopiedName(null), 2000);
        }
    };

    // Lọc danh sách hội thoại
    const filteredConvs = zaloConvs.filter(c => {
        if (activeTab === 'new_only' && !c.isNewCustomerNoOrder) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            c.name.toLowerCase().includes(q) ||
            (c.snippet && c.snippet.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q))
        );
    });

    const hasLinked = !!existingLink;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" {...touchHandlers}>
            <div 
                style={modalStyle}
                className="bg-[#18202d] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#111722]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-xl shadow-inner">
                            🥞
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-white font-bold text-base leading-tight">
                                    {hasLinked ? 'Đã Liên Kết Zalo / Pancake' : 'Gán Khách Zalo Đang Inbox (Chờ Cọc)'}
                                </h3>
                                {hasLinked ? (
                                    <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        ✓ Đã nối Zalo
                                    </span>
                                ) : (
                                    <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                        ⚡ Chưa liên kết
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-400 text-xs mt-0.5">
                                Khách live: <strong className="text-white">@{cleanUser}</strong> {nickname && `(${nickname})`}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Target Customer Strip */}
                <div className="bg-[#121924] px-5 py-2.5 border-b border-white/5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <CustomerAvatar 
                            user={cleanUser} 
                            platform={platform} 
                            avatarUrl={avatarUrl} 
                            tag={tag} 
                            size="sm" 
                        />
                        <div className="min-w-0 truncate">
                            <span className="font-bold text-white text-sm">#{getShortId(cleanUser)} {cleanUser}</span>
                            <span className="text-gray-400 ml-2">
                                Đã chốt: <strong className="text-emerald-400">{store[platform].customers[cleanUser]?.count || 0} món</strong> ({store[platform].customers[cleanUser]?.total || 0}k)
                            </span>
                        </div>
                    </div>
                    {existingLink && (
                        <button
                            onClick={() => openPancakeApp(existingLink, true)}
                            className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 shadow cursor-pointer transition-all"
                        >
                            <Smartphone size={14} />
                            <span>Mở Pancake Chat</span>
                        </button>
                    )}
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-white/10 bg-[#141b26] px-4">
                    <button
                        onClick={() => setActiveTab('new_only')}
                        className={`py-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                            activeTab === 'new_only' 
                                ? 'border-orange-500 text-orange-400 bg-orange-500/10' 
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <span>🆕 Khách Zalo Mới Chưa Đơn</span>
                        <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                            {zaloConvs.filter(c => c.isNewCustomerNoOrder).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`py-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                            activeTab === 'all' 
                                ? 'border-orange-500 text-orange-400 bg-orange-500/10' 
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <span>💬 Tất Cả Zalo Đang Inbox</span>
                        <span className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                            {zaloConvs.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`py-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                            activeTab === 'manual' 
                                ? 'border-orange-500 text-orange-400 bg-orange-500/10' 
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <span>🔗 Nhập Link / SĐT Thủ Công</span>
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1 text-sm bg-[#131a24]">
                    {activeTab !== 'manual' ? (
                        <>
                            {/* Search & Refresh Bar */}
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Tìm theo tên Zalo, nội dung tin nhắn hỏi cọc..."
                                        className="w-full bg-[#0d131c] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                                <button
                                    onClick={loadConversations}
                                    disabled={isLoadingConvs}
                                    className="p-2 bg-[#1c2635] hover:bg-[#253245] text-gray-300 rounded-xl border border-white/10 cursor-pointer disabled:opacity-50"
                                    title="Tải lại danh sách tin nhắn Zalo"
                                >
                                    <RefreshCw size={15} className={isLoadingConvs ? 'animate-spin text-orange-400' : ''} />
                                </button>
                            </div>

                            {/* Conversation List */}
                            {isLoadingConvs ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                                    <RefreshCw size={24} className="animate-spin text-orange-400" />
                                    <span className="text-xs">Đang tải danh sách khách Zalo đang inbox...</span>
                                </div>
                            ) : filteredConvs.length === 0 ? (
                                <div className="py-10 text-center text-gray-400 border border-dashed border-white/10 rounded-xl p-4">
                                    <MessageSquare size={28} className="mx-auto text-gray-600 mb-2" />
                                    <p className="text-xs font-semibold text-gray-300">Không tìm thấy hội thoại Zalo phù hợp</p>
                                    <p className="text-[11px] text-gray-500 mt-1">Khách vừa nhắn tin Zalo? Bấm nút làm mới ở trên hoặc nhập link thủ công.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                                    {filteredConvs.map(conv => {
                                        const suggested = generateSuggestedPancakeName(conv.name, cleanUser);
                                        const isCurrentLinked = existingLink.includes(conv.id);

                                        return (
                                            <div 
                                                key={conv.id}
                                                className={`p-3 rounded-xl border transition-all ${
                                                    isCurrentLinked 
                                                        ? 'bg-orange-950/30 border-orange-500/60 ring-1 ring-orange-500/40' 
                                                        : 'bg-[#182230] hover:bg-[#1d293a] border-white/5 hover:border-white/20'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                        <div className="relative shrink-0 mt-0.5">
                                                            {conv.avatarUrl ? (
                                                                <img 
                                                                    src={conv.avatarUrl} 
                                                                    alt={conv.name} 
                                                                    className="w-9 h-9 rounded-full object-cover border border-white/10"
                                                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                                />
                                                            ) : (
                                                                <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 font-bold text-sm">
                                                                    {conv.name.charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                            {conv.unreadCount > 0 && (
                                                                <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                                                                    {conv.unreadCount}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-bold text-white text-sm truncate">
                                                                    {conv.name}
                                                                </span>
                                                                {conv.isNewCustomerNoOrder ? (
                                                                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                                                                        🆕 Chưa đơn (Chờ cọc)
                                                                    </span>
                                                                ) : (
                                                                    <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                                                                        👑 {conv.ordersCount} đơn POS
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Snippet tin nhắn gần nhất */}
                                                            {conv.snippet && (
                                                                <p className="text-xs text-gray-300 mt-1 line-clamp-2 bg-[#0e1520] px-2 py-1 rounded border border-white/5 font-mono">
                                                                    💬 {conv.snippet}
                                                                </p>
                                                            )}

                                                            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1.5">
                                                                {conv.phone && (
                                                                    <span className="text-emerald-400 font-mono flex items-center gap-1">
                                                                        <Phone size={11} />
                                                                        {conv.phone}
                                                                    </span>
                                                                )}
                                                                {conv.updatedAt && (
                                                                    <span className="flex items-center gap-1 text-gray-400">
                                                                        <Clock size={11} />
                                                                        {new Date(conv.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ({new Date(conv.updatedAt).toLocaleDateString('vi-VN')})
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Gợi ý tên chuẩn Pancake */}
                                                            <div className="mt-2 flex items-center gap-2 bg-[#121924] p-1.5 rounded-lg border border-white/5">
                                                                <span className="text-[10px] text-gray-400 shrink-0 font-medium">Tên chuẩn:</span>
                                                                <span className="text-xs text-orange-300 font-mono font-bold truncate flex-1">
                                                                    {suggested}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopy(suggested, conv.id)}
                                                                    className="text-[10px] bg-white/10 hover:bg-white/20 text-gray-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 cursor-pointer"
                                                                    title="Copy tên để đổi trên Pancake"
                                                                >
                                                                    {copiedName === conv.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                                                    <span>{copiedName === conv.id ? 'Đã copy' : 'Copy'}</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                                                        <button
                                                            onClick={() => handleSelectConversation(conv)}
                                                            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-all ${
                                                                isCurrentLinked
                                                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                                                                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow hover:scale-105'
                                                            }`}
                                                        >
                                                            <Check size={13} />
                                                            <span>{isCurrentLinked ? 'Đang liên kết' : 'Gán Zalo Này'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => openPancakeApp(conv.deepLink, true)}
                                                            className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <ExternalLink size={11} />
                                                            <span>Mở chat</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Manual Link Entry */
                        <div className="space-y-4 pt-1">
                            <div>
                                <label className="text-xs font-bold text-gray-200 block mb-1">
                                    Đường dẫn hội thoại Pancake / Zalo hoặc SĐT:
                                </label>
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder="https://pages.fm/#/conversations/pzl_.../pzl_... hoặc SĐT Zalo"
                                    className="w-full bg-[#0d131c] border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Dán link copy từ Pancake app/web hoặc nhập SĐT Zalo của khách để kết nối.
                                </p>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-200 block mb-1">
                                    Tên ghi nhớ / Nickname (VD: <span className="text-orange-300 font-mono">TênZalo # {cleanUser}</span>):
                                </label>
                                <input
                                    type="text"
                                    value={customNickname}
                                    onChange={e => setCustomNickname(e.target.value)}
                                    placeholder={`Tên Zalo #${cleanUser}`}
                                    className="w-full bg-[#0d131c] border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono"
                                />
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                {existingLink ? (
                                    <button
                                        type="button"
                                        onClick={handleRemoveLink}
                                        className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-950/40 border border-red-500/20 cursor-pointer"
                                    >
                                        <Trash2 size={14} />
                                        <span>Gỡ liên kết</span>
                                    </button>
                                ) : <div />}

                                <button
                                    type="button"
                                    onClick={handleSaveManual}
                                    className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Check size={14} />
                                    <span>Lưu Liên Kết</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Guide Note */}
                <div className="px-5 py-2.5 bg-[#0f141d] border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                        <Sparkles size={12} className="text-orange-400" />
                        Chỉ khách ĐÃ LIÊN KẾT mới được đồng bộ đơn POS chuẩn xác.
                    </span>
                    <span className="text-gray-500">Pancake Zalo # TikTok Live</span>
                </div>
            </div>
        </div>
    );
};
