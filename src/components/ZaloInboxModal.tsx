import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, MessageSquare, RefreshCw, Smartphone, Search, Check, ExternalLink, 
  Copy, Clock, Phone, MapPin, User, ChevronRight, Sparkles, Send, ArrowLeft
} from 'lucide-react';
import { useStore } from '../store';
import { Platform, PLATFORMS, getShortId, normalizeUser } from '../lib/core';
import { openPancakeApp } from '../lib/pancakeDeepLink';
import { 
  fetchRecentZaloConversations, 
  fetchConversationMessages, 
  ZaloInboxConversation, 
  generateSuggestedPancakeName,
  getOrderStatusLabel,
  syncSingleCustomerPancakeOrders,
  updatePancakeCustomerName
} from '../lib/pancakeSync';
import { CustomerAvatar } from './UserAvatar';

interface ZaloInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomerToLink?: (user: string, platform: Platform) => void;
  onToast?: (msg: string) => void;
}

export const ZaloInboxModal: React.FC<ZaloInboxModalProps> = ({
  isOpen,
  onClose,
  onToast
}) => {
  const store = useStore();
  const [conversations, setConversations] = useState<ZaloInboxConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'new_deposit'>('new_deposit');
  const [selectedConv, setSelectedConv] = useState<ZaloInboxConversation | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [selectedTiktokUser, setSelectedTiktokUser] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Lấy danh sách khách hàng đang có đơn chốt & đang ghim trên TikTok Live
  const tiktokCustomers = useMemo(() => {
    const custs = store.tiktok.customers || {};
    const pinned = store.tiktok.pinned || {};
    const tags = store.tiktok.tags || {};
    const now = Date.now();

    const pinnedUserSet = new Set<string>();
    Object.values(pinned).forEach((pData: any) => {
      if (pData && pData.user) {
        if (!pData.expiry || pData.expiry > now || tags[normalizeUser(pData.user)] === 'HOST') {
          pinnedUserSet.add(normalizeUser(pData.user));
        }
      }
    });

    const userMap = new Map<string, {
      user: string;
      count: number;
      total: number;
      hasLink: boolean;
      link: string;
      nickname: string;
      tag: string;
      isPinned: boolean;
    }>();

    Object.entries(custs).forEach(([user, data]: [string, any]) => {
      const cleanUser = normalizeUser(user);
      userMap.set(cleanUser, {
        user: cleanUser,
        count: data.count || 0,
        total: data.total || 0,
        hasLink: !!store.tiktok.pancakeLinks?.[cleanUser],
        link: store.tiktok.pancakeLinks?.[cleanUser] || '',
        nickname: store.tiktok.nicknames?.[cleanUser] || '',
        tag: store.tiktok.tags?.[cleanUser] || 'NORMAL',
        isPinned: pinnedUserSet.has(cleanUser)
      });
    });

    pinnedUserSet.forEach(cleanUser => {
      if (!userMap.has(cleanUser)) {
        userMap.set(cleanUser, {
          user: cleanUser,
          count: 0,
          total: 0,
          hasLink: !!store.tiktok.pancakeLinks?.[cleanUser],
          link: store.tiktok.pancakeLinks?.[cleanUser] || '',
          nickname: store.tiktok.nicknames?.[cleanUser] || '',
          tag: store.tiktok.tags?.[cleanUser] || 'NORMAL',
          isPinned: true
        });
      }
    });

    const list = Array.from(userMap.values());
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.hasLink !== b.hasLink) return a.hasLink ? 1 : -1;
      return (b.count || 0) - (a.count || 0);
    });

    return list;
  }, [store.tiktok.customers, store.tiktok.pancakeLinks, store.tiktok.nicknames, store.tiktok.tags, store.tiktok.pinned]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const res = await fetchRecentZaloConversations();
      setConversations(res.conversations || []);
    } catch (err) {
      console.error("Lỗi load Zalo Inbox:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      setSelectedConv(null);
      setMessages([]);
      setSelectedTiktokUser('');
    }
  }, [isOpen]);

  // Load tin nhắn chi tiết khi click vào một hội thoại
  const handleSelectConv = async (conv: ZaloInboxConversation) => {
    setSelectedConv(conv);
    setIsLoadingMessages(true);
    try {
      const msgs = await fetchConversationMessages(conv.pageId, conv.id, conv.customerId);
      setMessages(msgs || []);
    } catch (err) {
      console.error("Lỗi lấy messages:", err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // 1-Click Liên kết Khách Zalo với Khách TikTok đang chọn
  const handleLinkToTiktok = (tiktokUser: string, conv: ZaloInboxConversation) => {
    const cleanUser = normalizeUser(tiktokUser);
    const link = conv.deepLink;
    const suggestedName = generateSuggestedPancakeName(conv.name, cleanUser);

    // 1. Lưu link Pancake & Đồng bộ đơn POS (KHÔNG đổi nickname ở chotdon)
    store.setCustomerPancakeLink('tiktok', cleanUser, link);
    syncSingleCustomerPancakeOrders(cleanUser, 'tiktok', link);

    // 2. Cập nhật tên / ghi chú hội thoại trên Pancake Pages & POS
    updatePancakeCustomerName({
      pageId: conv.pageId,
      convId: conv.id,
      customerId: conv.customerId,
      newName: suggestedName
    });

    onToast?.(`🥞 Đã gán Zalo "${conv.name}" cho @${cleanUser}!`);
  };

  const handleCopy = (text: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (!isOpen) return null;

  const filteredConvs = conversations.filter(c => {
    if (activeFilter === 'new_deposit' && !c.isNewCustomerNoOrder) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.snippet && c.snippet.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#151c27] border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#101620]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-400/40 flex items-center justify-center text-white font-bold text-xl shadow-md">
              💬
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-black text-base">Hộp Thư Chat Zalo Live (Pancake)</h3>
                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Realtime Inbox
                </span>
              </div>
              <p className="text-gray-400 text-xs mt-0.5">
                Xem khách Zalo hỏi cọc, xem tin nhắn và 1-click liên kết với đơn TikTok Live
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadConversations}
              disabled={isLoading}
              className="p-2 bg-[#1c2635] hover:bg-[#253245] text-gray-300 rounded-xl border border-white/10 cursor-pointer disabled:opacity-50 text-xs flex items-center gap-1.5"
              title="Làm mới tin nhắn Zalo"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-orange-400' : ''} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Content: Split View (Left: Conversations List, Right: Chat Detail & Linker) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Conversations List */}
          <div className={`w-full md:w-5/12 border-r border-white/10 flex flex-col bg-[#121822] ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
            {/* Filter Tabs & Search */}
            <div className="p-3 border-b border-white/10 space-y-2 bg-[#10151f]">
              <div className="flex gap-1.5 p-1 bg-[#0d121a] rounded-xl border border-white/5">
                <button
                  onClick={() => setActiveFilter('new_deposit')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeFilter === 'new_deposit'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>🆕 Chờ Cọc (Chưa Đơn)</span>
                  <span className="bg-amber-500/30 text-amber-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                    {conversations.filter(c => c.isNewCustomerNoOrder).length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeFilter === 'all'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>Tất Cả ({conversations.length})</span>
                </button>
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên Zalo, SĐT, tin nhắn..."
                  className="w-full bg-[#090d14] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Conversation Scroll List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <RefreshCw size={22} className="animate-spin text-blue-400" />
                  <span className="text-xs">Đang đồng bộ hộp thư Zalo...</span>
                </div>
              ) : filteredConvs.length === 0 ? (
                <div className="py-12 text-center text-gray-400 p-4">
                  <MessageSquare size={30} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-xs font-semibold text-gray-300">Không có tin nhắn nào</p>
                </div>
              ) : (
                filteredConvs.map(conv => {
                  const isSelected = selectedConv?.id === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConv(conv)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/40'
                          : 'bg-[#17202d] hover:bg-[#1c2737] border-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
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

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-white text-xs truncate">
                              {conv.name}
                            </span>
                            {conv.updatedAt && (
                              <span className="text-[10px] text-gray-400 shrink-0">
                                {new Date(conv.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          {conv.snippet && (
                            <p className="text-[11px] text-gray-300 line-clamp-1 mt-0.5 font-mono">
                              {conv.snippet}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 mt-1.5">
                            {conv.isNewCustomerNoOrder ? (
                              <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                                🆕 Chờ cọc
                              </span>
                            ) : (
                              <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                                👑 {conv.ordersCount} đơn POS
                              </span>
                            )}
                            {conv.phone && (
                              <span className="text-[10px] text-gray-400 font-mono">
                                📞 {conv.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Chat Messages & Linker Form */}
          <div className={`w-full md:w-7/12 flex flex-col bg-[#151c27] ${!selectedConv ? 'hidden md:flex' : 'flex'}`}>
            {selectedConv ? (
              <>
                {/* Conversation Bar Header */}
                <div className="p-3.5 border-b border-white/10 bg-[#121924] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => setSelectedConv(null)}
                      className="md:hidden p-1 text-gray-400 hover:text-white cursor-pointer"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 font-bold text-xs shrink-0">
                      {selectedConv.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{selectedConv.name}</span>
                        {selectedConv.isNewCustomerNoOrder ? (
                          <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                            🆕 Khách mới (Chờ cọc)
                          </span>
                        ) : (
                          <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                            👑 {selectedConv.ordersCount} đơn POS
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {selectedConv.pageName} • ID: <span className="font-mono">{selectedConv.id}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openPancakeApp(selectedConv.deepLink, true)}
                      className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow cursor-pointer transition-all"
                    >
                      <Smartphone size={13} />
                      <span>Mở Chat App</span>
                    </button>
                  </div>
                </div>

                {/* Messages Box */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0f1520]">
                  {isLoadingMessages ? (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                      <RefreshCw size={20} className="animate-spin text-blue-400" />
                      <span className="text-xs">Đang tải tin nhắn...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                      <p className="text-xs">Chưa tải được lịch sử tin nhắn đầy đủ.</p>
                      {selectedConv.snippet && (
                        <div className="mt-3 max-w-sm mx-auto bg-[#18202d] p-3 rounded-xl border border-white/10 text-left">
                          <p className="text-xs text-gray-400 font-bold mb-1">Tin nhắn gần nhất:</p>
                          <p className="text-xs text-white font-mono">{selectedConv.snippet}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const isFromShop = m.from_page || m.is_page_sender;
                      return (
                        <div
                          key={m.id || idx}
                          className={`flex ${isFromShop ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-3 rounded-2xl text-xs space-y-1 ${
                              isFromShop
                                ? 'bg-blue-600 text-white rounded-tr-none'
                                : 'bg-[#1e293b] text-gray-200 border border-white/10 rounded-tl-none'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{m.message || m.content || selectedConv.snippet}</p>
                            {m.inserted_at && (
                              <p className={`text-[9px] ${isFromShop ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                                {new Date(m.inserted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Fast Linker Box: 1-Click Link with TikTok Live Customers */}
                <div className="p-3.5 bg-[#121924] border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-300 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-orange-400" />
                      Gán Hội Thoại Này Cho Khách TikTok Vừa Chốt:
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Tên gợi ý: <strong className="text-white font-mono">{selectedConv.name} #TikTok</strong>
                    </span>
                  </div>

                  {/* Customer Quick Selector */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTiktokUser}
                      onChange={e => setSelectedTiktokUser(e.target.value)}
                      className="flex-1 bg-[#090d14] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                    >
                      <option value="">-- Chọn khách hàng TikTok vừa chốt đơn --</option>
                      {tiktokCustomers.map(tc => (
                        <option key={tc.user} value={tc.user}>
                          {tc.isPinned ? '📌 [GHIM] ' : ''}@{tc.user} ({tc.count > 0 ? `${tc.count} cái - ${tc.total}k` : 'Chưa có đơn live'}) {tc.hasLink ? '✓ Đã có Zalo' : '⚡ Chưa nối Zalo'}
                        </option>
                      ))}
                    </select>

                    <button
                      disabled={!selectedTiktokUser}
                      onClick={() => {
                        if (selectedTiktokUser && selectedConv) {
                          handleLinkToTiktok(selectedTiktokUser, selectedConv);
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs px-4 py-2 rounded-xl shadow flex items-center gap-1.5 cursor-pointer shrink-0 transition-all"
                    >
                      <Check size={14} />
                      <span>Gán Ngay</span>
                    </button>
                  </div>

                  {/* Quick Copy Suggested Name */}
                  <div className="flex items-center justify-between text-xs bg-[#0b1017] p-2 rounded-lg border border-white/5">
                    <span className="text-gray-400 text-[11px]">
                      Copy tên đổi trên Pancake:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-orange-300 text-xs">
                        {selectedTiktokUser ? generateSuggestedPancakeName(selectedConv.name, selectedTiktokUser) : `${selectedConv.name} #TikTok`}
                      </span>
                      <button
                        onClick={() => {
                          const name = selectedTiktokUser ? generateSuggestedPancakeName(selectedConv.name, selectedTiktokUser) : `${selectedConv.name} #TikTok`;
                          handleCopy(name, 'suggested');
                        }}
                        className="bg-white/10 hover:bg-white/20 text-gray-200 text-[10px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
                      >
                        {copiedId === 'suggested' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>{copiedId === 'suggested' ? 'Đã copy' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-2xl mb-3">
                  💬
                </div>
                <h4 className="text-white font-bold text-sm">Chọn một cuộc trò chuyện Zalo bên trái</h4>
                <p className="text-xs text-gray-400 max-w-sm mt-1">
                  Xem tin nhắn khách hỏi cọc, sau khi cọc xong chọn khách TikTok tương ứng để liên kết và đổi tên ngay tại đây.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
