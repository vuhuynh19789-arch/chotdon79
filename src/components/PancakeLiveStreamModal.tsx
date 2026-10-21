import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  X, 
  ArrowLeft, 
  Radio, 
  RefreshCw, 
  Search, 
  Printer, 
  ShoppingCart, 
  User, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  Share2, 
  ExternalLink, 
  Play, 
  Pause, 
  SlidersHorizontal, 
  Check, 
  Copy, 
  Flame, 
  MessageSquare,
  Sparkles,
  Zap,
  Tag
} from 'lucide-react';
import { useStore, CommentData, isCustomerNinhThuan, isCustomerGheLay } from '../store';
import { 
  fetchPancakePagePosts, 
  startPancakeLiveScraping, 
  stopPancakeLiveScraping, 
  pollPancakeLiveCommentsOnce, 
  getPancakeLiveStatus, 
  subscribePancakeLiveStatus, 
  PancakePost, 
  PancakeLiveStatus 
} from '../lib/pancakeLiveClient';
import { extractPriceFromContent, normalizeUser, getShortId, Platform } from '../lib/core';
import { CustomerAvatar, ThapChamIcon, GheLayBadge } from './UserAvatar';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';
import { openPancakeApp } from '../lib/pancakeDeepLink';

interface PancakeLiveStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPrice: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
  onOpenProfile: (user: string, platform: Platform) => void;
  onOpenPancakePush?: (user: string, platform: Platform) => void;
}

export const PancakeLiveStreamModal: React.FC<PancakeLiveStreamModalProps> = ({
  isOpen,
  onClose,
  onOpenPrice,
  onOpenProfile,
  onOpenPancakePush
}) => {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose, enabled: isOpen });
  const store = useStore();
  const pageId = '100546631959960';
  const pageName = 'Hiền Phạm Shop';

  // Navigation: 'posts' (danh sách bài viết/live) hoặc 'comments' (bình luận bài viết)
  const [activeView, setActiveView] = useState<'posts' | 'comments'>('posts');
  const [posts, setPosts] = useState<PancakePost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PancakePost | null>(null);

  // Search
  const [searchPostQuery, setSearchPostQuery] = useState('');
  const [searchCommentQuery, setSearchCommentQuery] = useState('');

  // Status
  const [status, setStatus] = useState<PancakeLiveStatus>(getPancakeLiveStatus());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoPrintOnPrice, setAutoPrintOnPrice] = useState<boolean>(() => {
    try {
      return localStorage.getItem('slp_pancake_autoprint') === 'true';
    } catch {
      return false;
    }
  });

  // Track printed status locally for instant feedback
  const [printedCommentIds, setPrintedCommentIds] = useState<Record<string, { price: number | string; time: number }>>({});
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Load comments from facebook store
  const fbComments = useStore((s) => s.facebook.comments);

  // Khôi phục bài live trước đó nếu có
  useEffect(() => {
    if (!isOpen) return;

    // Lắng nghe trạng thái cào
    const unsub = subscribePancakeLiveStatus((newStatus) => {
      setStatus(newStatus);
      if (newStatus.postId && !selectedPost) {
        setSelectedPost({
          id: `${pageId}_${newStatus.postId}`,
          rawId: newStatus.postId,
          message: newStatus.postTitle || `Bài Live #${newStatus.postId}`,
          type: 'livestream',
          isLivestream: true,
          commentsCount: newStatus.totalCommentsCount || 0,
          createdTime: ''
        });
      }
    });

    // Tự động load danh sách bài viết
    loadPosts();

    return () => unsub();
  }, [isOpen]);

  const loadPosts = async () => {
    setIsLoadingPosts(true);
    try {
      const list = await fetchPancakePagePosts(pageId);
      setPosts(list);
      // Nếu chưa chọn bài nào và bài đầu tiên là livestream, tự chọn hoặc gợi ý
      const livePost = list.find((p) => p.isLivestream);
      if (livePost && !selectedPost) {
        setSelectedPost(livePost);
      }
    } catch (e) {
      console.warn('Lỗi tải bài viết:', e);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Chọn bài viết để xem bình luận và bắt đầu cào
  const handleSelectPost = async (post: PancakePost) => {
    setSelectedPost(post);
    setActiveView('comments');
    await startPancakeLiveScraping({
      pageId,
      pageName,
      postId: post.rawId || post.id,
      postTitle: post.message
    });
  };

  // Làm mới cmt thủ công
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await pollPancakeLiveCommentsOnce();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Bật/tắt cào tự động
  const handleToggleScraping = () => {
    if (status.isPolling) {
      stopPancakeLiveScraping();
    } else if (selectedPost) {
      startPancakeLiveScraping({
        pageId,
        pageName,
        postId: selectedPost.rawId || selectedPost.id,
        postTitle: selectedPost.message
      });
    }
  };

  // Sao chép số điện thoại
  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Filter Tabs
  const [filterTab, setFilterTab] = useState<'all' | 'unprinted' | 'printed' | 'has_price' | 'has_phone' | 'ninh_thuan'>('all');
  const QUICK_PRICES = ['71', '82', '71*2', '99', '142', '160'];

  // IN ĐƠN THỐNG NHẤT MẪU IN CỦA APP
  const handlePrintCommentWithPrice = (c: CommentData, priceOverride?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const userName = normalizeUser(c.user);
    const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
    const priceToUse = priceOverride || extractPriceFromContent(contentStr).price;

    if (priceToUse) {
      const commentContentToSave = contentStr.trim() || `Sản phẩm ${priceToUse}k`;
      // In đơn theo mẫu thống nhất của app (printLabel -> LAN / thermal canvas / rawbt)
      store.printNewOrder(
        'facebook', 
        userName, 
        commentContentToSave, 
        priceToUse, 
        c.time, 
        c.id, 
        false, 
        false, 
        { 
          phone: c.phone, 
          province: c.province || c.location,
          orderCount: c.orderCount 
        }
      );
      
      // Đánh dấu đã in trên UI
      setPrintedCommentIds((prev) => ({
        ...prev,
        [c.id]: { price: priceToUse, time: Date.now() }
      }));

      // Hiệu ứng bay
      if (e) {
        window.dispatchEvent(new CustomEvent('FLYING_PLUS_ONE', { detail: { x: e.clientX, y: e.clientY, platform: 'facebook' } }));
      }
    } else {
      // Mở modal giá nhanh để chọn giá và in
      onOpenPrice(c.id, userName, 'facebook');
    }
  };

  const handlePrintComment = (c: CommentData, e?: React.MouseEvent) => {
    handlePrintCommentWithPrice(c, undefined, e);
  };

  // Chốt đơn vào giỏ hàng (không in hoặc in sau)
  const handleQuickAddToCart = (c: CommentData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const userName = normalizeUser(c.user);
    const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
    const extracted = extractPriceFromContent(contentStr);

    if (extracted.price) {
      store.printNewOrder('facebook', userName, contentStr, extracted.price, c.time, c.id, true, true, {
        phone: c.phone,
        province: c.province || c.location,
        orderCount: c.orderCount
      });
      setPrintedCommentIds((prev) => ({
        ...prev,
        [c.id]: { price: extracted.price!, time: Date.now() }
      }));
    } else {
      onOpenPrice(c.id, userName, 'facebook');
    }
  };

  // Lọc bài viết
  const filteredPosts = useMemo(() => {
    if (!searchPostQuery.trim()) return posts;
    const q = searchPostQuery.toLowerCase().trim();
    return posts.filter((p) => 
      p.id.toLowerCase().includes(q) ||
      p.rawId.toLowerCase().includes(q) ||
      p.message.toLowerCase().includes(q)
    );
  }, [posts, searchPostQuery]);

  // Lọc bình luận của bài live
  const filteredComments = useMemo(() => {
    let list = fbComments;

    // Lọc theo tab
    if (filterTab === 'unprinted') {
      list = list.filter((c) => !printedCommentIds[c.id]);
    } else if (filterTab === 'printed') {
      list = list.filter((c) => Boolean(printedCommentIds[c.id]));
    } else if (filterTab === 'has_price') {
      list = list.filter((c) => Boolean(extractPriceFromContent(String(c.content || '')).price));
    } else if (filterTab === 'has_phone') {
      list = list.filter((c) => Boolean(c.phone));
    } else if (filterTab === 'ninh_thuan') {
      list = list.filter((c) => Boolean(c.province?.toLowerCase().includes('ninh thuận') || isCustomerNinhThuan(store.facebook.ninhThuanTags, c.user)));
    }

    // Lọc theo từ khoá tìm kiếm
    if (searchCommentQuery.trim()) {
      const q = searchCommentQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const u = (c.user || '').toLowerCase();
        const content = (c.content || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const prov = (c.province || c.location || '').toLowerCase();
        return u.includes(q) || content.includes(q) || phone.includes(q) || prov.includes(q);
      });
    }

    return list;
  }, [fbComments, filterTab, searchCommentQuery, printedCommentIds, store.facebook.ninhThuanTags]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      {...touchHandlers}
    >
      <div 
        style={modalStyle}
        className="bg-[#121924] border border-white/10 rounded-none sm:rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-[92vh] max-h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#0b111a] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {activeView === 'comments' ? (
              <button
                type="button"
                onClick={() => setActiveView('posts')}
                className="p-1.5 -ml-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
                title="Quay lại danh sách bài viết"
              >
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Bài viết</span>
              </button>
            ) : null}

            <div className="flex items-center gap-2">
              <span className="text-xl">🥞</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    {activeView === 'posts' ? 'Bài viết Fanpage Pancake' : 'Bình luận bài Live'}
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                    {pageName}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 truncate">
                  {activeView === 'posts' 
                    ? 'Chọn bài viết hoặc livestream để cào & in đơn trực tiếp' 
                    : (selectedPost?.message || `Bài #${selectedPost?.rawId || ''}`)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeView === 'comments' && (
              <>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
                  title="Làm mới bình luận ngay lập tức"
                >
                  <RefreshCw size={16} className={isRefreshing ? "animate-spin text-blue-400" : ""} />
                </button>
                <button
                  type="button"
                  onClick={handleToggleScraping}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    status.isPolling 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                  title={status.isPolling ? "Tạm dừng cào" : "Tiếp tục cào"}
                >
                  {status.isPolling ? <Pause size={13} /> : <Play size={13} />}
                  <span>{status.isPolling ? "Tạm dừng" : "Tiếp tục"}</span>
                </button>
              </>
            )}

            <button 
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* View 1: Danh Sách Bài Viết / Livestream (Giống Ảnh 2 của người dùng) */}
        {activeView === 'posts' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0c121c]">
            {/* Thanh Tìm Kiếm Bài Viết */}
            <div className="p-3 border-b border-white/10 bg-[#0e1622] flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchPostQuery}
                  onChange={(e) => setSearchPostQuery(e.target.value)}
                  placeholder="Tìm theo ID bài viết hoặc nội dung..."
                  className="w-full pl-9 pr-3 py-2 bg-[#080d14] border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={loadPosts}
                disabled={isLoadingPosts}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              >
                <RefreshCw size={13} className={isLoadingPosts ? "animate-spin" : ""} />
                <span>Làm mới</span>
              </button>
            </div>

            {/* Danh Sách Bài Viết */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              {isLoadingPosts ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <RefreshCw size={24} className="animate-spin text-blue-400" />
                  <p className="text-xs font-medium">Đang tải danh sách bài viết từ Pancake...</p>
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-500 text-center gap-1">
                  <p className="text-sm font-semibold text-gray-400">Không tìm thấy bài viết nào.</p>
                  <p className="text-xs">Hãy kiểm tra lại quyền Token hoặc bấm "Làm mới".</p>
                </div>
              ) : (
                filteredPosts.map((post) => {
                  const isCurrentSelected = selectedPost?.rawId === post.rawId;
                  const isLiveActive = post.isLivestream;

                  return (
                    <div
                      key={post.id}
                      onClick={() => handleSelectPost(post)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex items-start gap-3 ${
                        isCurrentSelected
                          ? 'bg-blue-950/40 border-blue-500/50 shadow-md shadow-blue-500/10'
                          : 'bg-[#141d2a] hover:bg-[#1a2536] border-white/10 hover:border-white/20'
                      }`}
                    >
                      {/* Thumbnail hoặc Icon Live */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center relative">
                        {post.thumbnail ? (
                          <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-gray-500 text-xl font-bold">
                            {isLiveActive ? '🔴' : '📷'}
                          </div>
                        )}
                        {isLiveActive && (
                          <div className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-md animate-pulse">
                            LIVE
                          </div>
                        )}
                      </div>

                      {/* Thông Tin Bài Viết */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold text-blue-400 truncate">
                              #{post.rawId || post.id}
                            </span>
                            {post.createdTime && (
                              <span className="text-[10px] text-gray-400 shrink-0">
                                {new Date(post.createdTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 mt-0.5">
                            {post.message || (isLiveActive ? 'Hiền Phạm Shop đang phát trực tiếp.' : 'Bài viết')}
                          </h3>
                        </div>

                        {/* Thống kê cmt & Thẻ loại */}
                        <div className="flex items-center gap-2 mt-2 pt-1 border-t border-white/5">
                          <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                            <MessageSquare size={12} />
                            <span>{post.commentsCount}</span>
                          </span>
                          <span className="text-gray-500">•</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            isLiveActive 
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                              : 'bg-white/5 text-gray-300'
                          }`}>
                            {isLiveActive ? 'Livestream' : 'Hình ảnh'}
                          </span>

                          <div className="ml-auto">
                            <button
                              type="button"
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            >
                              <span>Cào & In Đơn</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* View 2: Màn Hình Bình Luận Trực Tiếp & In Đơn (Giống Ảnh 1 của người dùng) */}
        {activeView === 'comments' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0f17]">
            {/* Top Sub-Bar: Trạng Thái Live & Công Cụ */}
            <div className="px-3 py-2 bg-[#0e1622] border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 shrink-0">
                  <span className={`w-2 h-2 rounded-full ${status.isPolling ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                  <span className="text-[11px] font-bold text-white">
                    {status.isPolling ? 'Đang cào (2s/lần)' : 'Đã dừng'}
                  </span>
                </div>
                <span className="text-xs text-gray-400 font-semibold truncate hidden sm:inline">
                  Tổng <strong className="text-cyan-400">{filteredComments.length}</strong> bình luận
                </span>
              </div>

              {/* Tùy chọn tự động in khi có giá */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoPrintOnPrice}
                    onChange={(e) => {
                      setAutoPrintOnPrice(e.target.checked);
                      try {
                        localStorage.setItem('slp_pancake_autoprint', String(e.target.checked));
                      } catch {}
                    }}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-amber-300 flex items-center gap-0.5">
                    <Zap size={11} /> Tự động in khi có giá
                  </span>
                </label>
              </div>
            </div>

            {/* Ô Tìm Kiếm Bình Luận */}
            <div className="px-3 py-2 bg-[#090e16] border-b border-white/10 flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchCommentQuery}
                  onChange={(e) => setSearchCommentQuery(e.target.value)}
                  placeholder="Tìm kiếm theo tên khách, nội dung, SĐT, tỉnh thành..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#121924] border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {searchCommentQuery && (
                <button
                  type="button"
                  onClick={() => setSearchCommentQuery('')}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-white/5 rounded-md"
                >
                  Xoá
                </button>
              )}
            </div>

            {/* Thanh Tab Lọc Trực Tiếp */}
            <div className="px-3 py-1.5 bg-[#0b121b] border-b border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'unprinted', label: 'Chưa in' },
                { id: 'printed', label: 'Đã in' },
                { id: 'has_price', label: 'Có giá' },
                { id: 'has_phone', label: 'Có SĐT' },
                { id: 'ninh_thuan', label: 'Ninh Thuận' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    filterTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Danh Sách Bình Luận Thẻ Đậm Nét (Phỏng theo chuẩn giao diện ảnh 1 của Pancake) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              {filteredComments.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-500 text-center gap-1">
                  <MessageSquare size={32} className="text-gray-600 mb-1" />
                  <p className="text-sm font-semibold text-gray-400">Đang chờ bình luận từ Live...</p>
                  <p className="text-xs text-gray-500 max-w-sm">
                    Khách bình luận trên bài Live của Fanpage sẽ tự động đổ về đây theo thời gian thực mỗi 2 giây.
                  </p>
                </div>
              ) : (
                filteredComments.map((c, idx) => {
                  const userName = normalizeUser(c.user);
                  const isPrinted = Boolean(printedCommentIds[c.id]);
                  const extracted = extractPriceFromContent(String(c.content || ''));
                  const hasPrice = Boolean(extracted.price);
                  const orderCount = c.orderCount ?? 0;
                  const totalSpend = c.totalSpend ?? 0;
                  const province = c.province || c.location || (isCustomerNinhThuan(store.facebook.ninhThuanTags, userName) ? 'Ninh Thuận' : '');
                  const phone = c.phone;
                  const isGheLay = isCustomerGheLay(store.facebook.gheLayTags, userName, store.facebook.tags);

                  return (
                    <div
                      key={c.id || idx}
                      className={`p-3 sm:p-3.5 rounded-2xl border transition-all ${
                        isPrinted 
                          ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm' 
                          : 'bg-[#131b26] border-white/10 hover:border-white/20 shadow-md'
                      }`}
                    >
                      {/* Hàng 1: Avatar + Tên Khách + Các Tag Đặc Trưng (Số đơn, Doanh thu, Tỉnh thành, SĐT) */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Avatar */}
                          <div className="shrink-0">
                            <CustomerAvatar 
                              user={c.user} 
                              platform="facebook" 
                              avatarUrl={c.avatar} 
                              size="sm" 
                            />
                          </div>

                          {/* Thông Tin Tên & Tag */}
                          <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(userName, 'facebook')}
                              className="font-bold text-white text-xs sm:text-sm hover:text-blue-400 transition-colors truncate text-left cursor-pointer"
                              title="Xem chi tiết khách hàng"
                            >
                              {c.user}
                            </button>

                            {/* Tag Số Đơn Hàng (Icon tích xanh + Số đơn như ảnh 1) */}
                            {orderCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0">
                                <Check size={10} strokeWidth={3} />
                                <span>{orderCount}</span>
                              </span>
                            )}

                            {/* Tag Tổng Tiền Mua Hàng (như ảnh 1: 2.179.000 đ) */}
                            {totalSpend > 0 && (
                              <span className="px-1.5 py-0.2 rounded-md bg-white/5 border border-white/10 text-gray-300 text-[10px] font-bold shrink-0">
                                {totalSpend.toLocaleString('vi-VN')} đ
                              </span>
                            )}

                            {/* Tag Tỉnh Thành / Địa Chỉ (như ảnh 1: Ninh Thuận, Bình Thuận...) */}
                            {province && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-bold shrink-0 border ${
                                province.includes('Ninh Thuận') 
                                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                                  : 'bg-white/5 border-white/10 text-gray-300'
                              }`}>
                                {province.includes('Ninh Thuận') ? <ThapChamIcon className="w-2.5 h-2.5" /> : <MapPin size={9} />}
                                <span>{province}</span>
                              </span>
                            )}

                            {/* Ghé Lấy Tag */}
                            {isGheLay && <GheLayBadge className="text-[10px]" />}

                            {/* Nút Gọi Điện / Sao Chép SĐT nếu có */}
                            {phone && (
                              <button
                                type="button"
                                onClick={(e) => handleCopyPhone(phone, e)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold transition-all cursor-pointer"
                                title={`SĐT: ${phone} (Bấm để copy)`}
                              >
                                <Phone size={9} />
                                <span>{copiedPhone === phone ? 'Đã chép!' : phone}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Thời Gian Comment */}
                        <div className="text-[10px] text-gray-400 font-mono shrink-0">
                          {c.time}
                        </div>
                      </div>

                      {/* Hàng 2: Nội Dung Comment Khách (Đậm, Rõ Ràng) */}
                      <div className="mt-2 text-white text-xs sm:text-sm font-medium leading-relaxed pl-9 flex items-baseline justify-between gap-2">
                        <div className="break-words">
                          <span>{c.content}</span>
                          {hasPrice && (
                            <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/40">
                              <Tag size={10} />
                              <span>{extracted.price}k</span>
                            </span>
                          )}
                        </div>

                        {/* Huy hiệu đã in nếu có */}
                        {isPrinted && (
                          <span className="shrink-0 text-[10px] font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={11} /> Đã In {printedCommentIds[c.id]?.price}k
                          </span>
                        )}
                      </div>

                      {/* Dòng Chọn Giá Nhanh nếu bình luận chưa nhận diện được giá */}
                      {!hasPrice && !isPrinted && (
                        <div className="mt-2 pl-9 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-gray-400 font-medium">In giá:</span>
                          {QUICK_PRICES.map((qp) => (
                            <button
                              key={qp}
                              type="button"
                              onClick={(e) => handlePrintCommentWithPrice(c, qp, e)}
                              className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-blue-600/30 border border-white/10 hover:border-blue-500/40 text-blue-300 text-[10px] font-bold transition-all cursor-pointer active:scale-95"
                              title={`In nhãn mẫu thống nhất với giá ${qp}k`}
                            >
                              +{qp}k
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Hàng 3: Khung Nút Hành Động - IN ĐƠN THỐNG NHẤT MẪU IN CỦA APP */}
                      <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between gap-2 pl-9">
                        <div className="flex items-center gap-1.5">
                          {/* Nút Xem Hồ Sơ */}
                          <button
                            type="button"
                            onClick={() => onOpenProfile(userName, 'facebook')}
                            className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                            title="Xem chi tiết khách hàng và lịch sử đơn"
                          >
                            <User size={12} />
                            <span>Hồ sơ</span>
                          </button>

                          {/* Nút Đẩy Đơn Sang Pancake POS */}
                          {onOpenPancakePush && (
                            <button
                              type="button"
                              onClick={() => onOpenPancakePush(userName, 'facebook')}
                              className="px-2 py-1 bg-orange-950/40 hover:bg-orange-900/50 border border-orange-500/30 rounded-lg text-[11px] font-bold text-orange-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                              title="Đẩy đơn hàng trực tiếp sang Pancake POS"
                            >
                              <span>🥞 Đẩy POS</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Nút Chốt Đơn Giỏ Hàng */}
                          <button
                            type="button"
                            onClick={(e) => handleQuickAddToCart(c, e)}
                            className="px-2.5 py-1.5 bg-[#1b2636] hover:bg-[#223044] border border-white/10 rounded-xl text-xs font-bold text-gray-200 hover:text-white transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                            title="Thêm món này vào giỏ hàng"
                          >
                            <ShoppingCart size={13} />
                            <span>+ Giỏ</span>
                          </button>

                          {/* NÚT IN ĐƠN - MÁY IN MẪU IN THỐNG NHẤT */}
                          <button
                            type="button"
                            onClick={(e) => handlePrintComment(c, e)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              isPrinted
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                            }`}
                            title="In nhãn dán / phiếu đơn theo mẫu in thống nhất của App"
                          >
                            <Printer size={14} />
                            <span>{isPrinted ? 'In Lại' : (hasPrice ? `In ${extracted.price}k` : 'In Đơn')}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
