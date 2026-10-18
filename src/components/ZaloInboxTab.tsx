import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  MessageSquare, RefreshCw, Send, Link as LinkIcon, 
  ExternalLink, Search, Check, Copy, AlertCircle, 
  Clock, Phone, Sparkles, UserCheck, ShieldAlert, CheckCircle2,
  Key, Filter, Mail, CornerUpLeft, ArrowLeft, Image as ImageIcon,
  QrCode, ShoppingBag, Printer, ChevronRight, X, User,
  DollarSign, CheckSquare, MessageCircle, Pin
} from 'lucide-react';
import { CustomerAvatar } from './UserAvatar';
import { 
  fetchRecentZaloConversations, 
  fetchConversationMessages,
  sendPancakeDepositMessage, 
  sendPancakeCustomMessage,
  ZaloInboxConversation, 
  generateSuggestedPancakeName,
  PANCAKE_COC_MESSAGE_PART1,
  PANCAKE_COC_MESSAGE_PART2,
  formatPancakeTime,
  getPancakeToken,
  setPancakeToken,
  syncSingleCustomerPancakeOrders,
  updatePancakeCustomerName,
  parsePancakeUrlIds
} from '../lib/pancakeSync';
import { openPancakeApp } from '../lib/pancakeDeepLink';
import { useStore } from '../store';
import { normalizeUser, getShortId, Platform } from '../lib/core';

interface ZaloInboxTabProps {
  searchKeyword?: string;
  onOpenProfile?: (user: string, platform: Platform) => void;
  onToast?: (message: string) => void;
  onScroll?: (isDown: boolean) => void;
  onOpenPrice?: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
}

export const ZaloInboxTab: React.FC<ZaloInboxTabProps> = ({
  searchKeyword = '',
  onOpenProfile,
  onToast,
  onScroll,
  onOpenPrice
}) => {
  const store = useStore();
  const [conversations, setConversations] = useState<ZaloInboxConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState(searchKeyword);
  const [activeFilterTab, setActiveFilterTab] = useState<'strangers' | 'all' | 'unpaid' | 'friends' | 'received' | 'linked'>('strangers');
  const [sendingConvId, setSendingConvId] = useState<string | null>(null);
  const [sentConvIds, setSentConvIds] = useState<Record<string, boolean>>({});
  const lastScrollTopRef = useRef(0);
  
  // Selected conversation for Direct Live Chat
  const [selectedConv, setSelectedConv] = useState<ZaloInboxConversation | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Modal chọn khách TikTok để gán
  const [assigningConv, setAssigningConv] = useState<ZaloInboxConversation | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignFilterTab, setAssignFilterTab] = useState<'all' | 'pinned' | 'with_orders' | 'no_zalo'>('all');
  const [showPreviewCoc, setShowPreviewCoc] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [showQrModal, setShowQrModal] = useState<{ amount: number; user: string } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (Math.abs(st - lastScrollTopRef.current) > 10) {
      onScroll?.(st > lastScrollTopRef.current);
      lastScrollTopRef.current = st;
    }
  };

  // Tải danh sách tất cả khách Zalo từ Pancake / Gateway
  const loadConversations = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await fetchRecentZaloConversations();
      setConversations(data?.conversations || []);
    } catch (err) {
      console.error("Lỗi tải hội thoại Zalo:", err);
      setConversations([]);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    // Tự động đồng bộ siêu nhanh mỗi 5 giây để cập nhật khách cọc tức thì
    const interval = setInterval(() => {
      loadConversations(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Tải tin nhắn chi tiết khi chọn 1 cuộc hội thoại
  const loadMessagesForConv = useCallback(async (conv: ZaloInboxConversation, showLoading = true) => {
    if (!conv) return;
    if (showLoading) setIsLoadingMessages(true);
    try {
      const msgs = await fetchConversationMessages(conv.pageId, conv.id, conv.customerId);
      // Sắp xếp tin nhắn theo thứ tự thời gian tăng dần (cũ ở trên, mới nhất ở dưới)
      const sorted = Array.isArray(msgs) ? [...msgs].sort((a, b) => {
        const tA = new Date(a.inserted_at || a.created_at || a.updated_at || 0).getTime();
        const tB = new Date(b.inserted_at || b.created_at || b.updated_at || 0).getTime();
        return tA - tB;
      }) : [];
      setMessages(sorted);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error("Lỗi load messages:", err);
    } finally {
      if (showLoading) setIsLoadingMessages(false);
    }
  }, []);

  // Polling tin nhắn thời gian thực khi đang mở hộp chat
  useEffect(() => {
    if (!selectedConv) return;
    loadMessagesForConv(selectedConv, true);
    const msgInterval = setInterval(() => {
      loadMessagesForConv(selectedConv, false);
    }, 4000);
    return () => clearInterval(msgInterval);
  }, [selectedConv, loadMessagesForConv]);

  const [isLookingUpLink, setIsLookingUpLink] = useState(false);

  // Xử lý khi người dùng nhập hoặc dán link Pancake vào thanh tìm kiếm
  const handleLookupPancakeLink = async (url: string) => {
    if (!url.includes('pancake.vn') && !url.includes('pages.fm') && !url.includes('c_id=')) return;
    setIsLookingUpLink(true);
    try {
      const res = await fetch(`/api/pancake/customer-orders-lookup?link=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (data.success && data.insight) {
        const { pageId, convId } = parsePancakeUrlIds(url.trim());
        const matchedName = data.insight.matchedName || 'Khách Zalo';
        const matchedPhone = data.insight.matchedPhone || '';
        const orders = data.insight.ordersHistory || [];
        const latestOrder = orders[0];

        const newConv: ZaloInboxConversation = {
          id: convId || `pzl_u_${Date.now()}`,
          pageId: pageId || 'pzl_2007152536191688636',
          pageName: 'Phạm Ngọc Hiền',
          name: matchedName,
          snippet: `[Khách liên kết] ${matchedPhone ? 'SĐT: ' + matchedPhone : ''}`,
          unreadCount: 0,
          updatedAt: new Date().toISOString(),
          updatedTimestamp: Date.now(),
          deepLink: url.trim(),
          isGroup: false,
          phone: matchedPhone,
          address: latestOrder?.billAddress || '',
          tags: [],
          isStranger: false,
          hasShippingTag: orders.length > 0,
          isNewCustomerNoOrder: orders.length === 0,
          ordersCount: orders.length,
          latestOrder: latestOrder ? {
            id: latestOrder.id,
            orderNumber: latestOrder.orderNumber,
            status: latestOrder.status,
            statusText: latestOrder.statusText,
            partnerName: latestOrder.partnerName,
            partnerStatus: latestOrder.partnerStatus,
            partnerStatusText: latestOrder.partnerStatusText,
            trackingCode: latestOrder.trackingCode,
            totalPrice: latestOrder.totalPrice,
            billFullName: latestOrder.billFullName,
            billPhoneNumber: latestOrder.billPhoneNumber,
            billAddress: latestOrder.billAddress,
            insertedAt: latestOrder.insertedAt
          } : undefined
        };

        setConversations(prev => {
          const filtered = prev.filter(c => c.id !== newConv.id && c.deepLink !== newConv.deepLink);
          return [newConv, ...filtered];
        });

        setSelectedConv(newConv);
        onToast?.(`✅ Đã nạp thành công khách "${matchedName}" (${orders.length} đơn POS)!`);
      } else {
        onToast?.(`⚠️ Không thể nạp thông tin từ link. Vui lòng kiểm tra lại.`);
      }
    } catch {
      onToast?.(`❌ Lỗi khi nạp link Pancake`);
    } finally {
      setIsLookingUpLink(false);
    }
  };

  useEffect(() => {
    if (searchKeyword) {
      setFilterKeyword(searchKeyword);
      if (searchKeyword.includes('pancake.vn') || searchKeyword.includes('pages.fm') || searchKeyword.includes('c_id=')) {
        handleLookupPancakeLink(searchKeyword);
      }
    }
  }, [searchKeyword]);

  // Gửi tin nhắn cọc /coc
  const handleSendDepositMessage = async (conv: ZaloInboxConversation) => {
    setSendingConvId(conv.id);
    try {
      const result = await sendPancakeDepositMessage(conv.pageId, conv.id);
      if (result.success) {
        setSentConvIds(prev => ({ ...prev, [conv.id]: true }));
        onToast?.(`✅ Đã gửi mẫu /coc cho khách "${conv.name}" thành công!`);
        if (selectedConv?.id === conv.id) {
          loadMessagesForConv(conv, false);
        }
      } else {
        onToast?.(`⚠️ Không thể gửi: ${result.message}`);
      }
    } catch (err: any) {
      onToast?.(`❌ Lỗi gửi tin nhắn: ${err.message}`);
    } finally {
      setSendingConvId(null);
    }
  };

  // Gửi tin nhắn tự gõ trực tiếp
  const handleSendDirectReply = async () => {
    if (!selectedConv || !replyText.trim() || isSendingReply) return;
    const textToSend = replyText.trim();
    setIsSendingReply(true);
    try {
      const res = await sendPancakeCustomMessage(selectedConv.pageId, selectedConv.id, textToSend);
      if (res.success) {
        setReplyText('');
        onToast?.(`✅ Đã gửi tin nhắn tới "${selectedConv.name}"!`);
        // Thêm ngay vào danh sách tin nhắn để phản hồi mượt mà
        setMessages(prev => [
          ...prev,
          {
            id: `temp_${Date.now()}`,
            message: textToSend,
            from: { id: selectedConv.pageId, name: selectedConv.pageName },
            inserted_at: new Date().toISOString()
          }
        ]);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          loadMessagesForConv(selectedConv, false);
        }, 300);
      } else {
        onToast?.(`⚠️ Không gửi được: ${res.message}`);
      }
    } catch (err: any) {
      onToast?.(`❌ Lỗi gửi tin: ${err.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Gửi nhanh các mẫu tin nhắn
  const handleSendQuickTemplate = async (templateText: string) => {
    if (!selectedConv || isSendingReply) return;
    setIsSendingReply(true);
    try {
      const res = await sendPancakeCustomMessage(selectedConv.pageId, selectedConv.id, templateText);
      if (res.success) {
        onToast?.(`✅ Đã gửi mẫu tin nhắn tới "${selectedConv.name}"!`);
        setMessages(prev => [
          ...prev,
          {
            id: `temp_${Date.now()}`,
            message: templateText,
            from: { id: selectedConv.pageId, name: selectedConv.pageName },
            inserted_at: new Date().toISOString()
          }
        ]);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          loadMessagesForConv(selectedConv, false);
        }, 300);
      } else {
        onToast?.(`⚠️ Lỗi: ${res.message}`);
      }
    } catch (err: any) {
      onToast?.(`❌ Lỗi gửi tin: ${err.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Lấy danh sách khách TikTok trên live hiện tại để gán nhanh
  const liveTikTokCustomers = useMemo(() => {
    const custs = store.tiktok.customers as Record<string, any>;
    const pinned = store.tiktok.pinned as Record<string, any>;
    const comments = store.tiktok.comments || [];
    const tags = store.tiktok.tags || {};
    const now = Date.now();

    // Map các user đang được ghim (pinned)
    const pinnedUserSet = new Set<string>();
    Object.values(pinned || {}).forEach((pData: any) => {
      if (pData && pData.user) {
        if (!pData.expiry || pData.expiry > now || tags[normalizeUser(pData.user)] === 'HOST') {
          pinnedUserSet.add(normalizeUser(pData.user));
        }
      }
    });

    // Map avatar từ comments gần nhất
    const userAvatars: Record<string, string> = {};
    const userLatestCommentTime: Record<string, number> = {};
    comments.forEach(c => {
      if (!c || !c.user) return;
      const u = normalizeUser(c.user);
      if (c.avatar && !userAvatars[u]) {
        userAvatars[u] = c.avatar;
      }
      const cTs = Number(c.ts) || 0;
      if (!userLatestCommentTime[u] || cTs > userLatestCommentTime[u]) {
        userLatestCommentTime[u] = cTs;
      }
    });

    const userMap = new Map<string, {
      user: string;
      count: number;
      total: number;
      hasLink: boolean;
      link?: string;
      nickname?: string;
      isPinned: boolean;
      lastTime: number;
      tag: string;
      avatar?: string;
    }>();

    // 1. Thêm từ danh sách customers
    for (const [user, data] of Object.entries(custs)) {
      const cleanUser = normalizeUser(user);
      const existingLink = store.tiktok.pancakeLinks?.[cleanUser];
      const nick = store.tiktok.nicknames?.[cleanUser];
      const isPinned = pinnedUserSet.has(cleanUser);
      const tag = tags[cleanUser] || 'NORMAL';
      const lastTime = Math.max(data.lastTime || 0, userLatestCommentTime[cleanUser] || 0);

      userMap.set(cleanUser, {
        user: cleanUser,
        count: data.count || 0,
        total: data.total || 0,
        hasLink: !!existingLink,
        link: existingLink,
        nickname: nick,
        isPinned,
        lastTime,
        tag,
        avatar: userAvatars[cleanUser]
      });
    }

    // 2. Thêm các khách đang ghim nếu chưa có trong customers
    pinnedUserSet.forEach(cleanUser => {
      if (!userMap.has(cleanUser)) {
        const existingLink = store.tiktok.pancakeLinks?.[cleanUser];
        const nick = store.tiktok.nicknames?.[cleanUser];
        const tag = tags[cleanUser] || 'NORMAL';
        userMap.set(cleanUser, {
          user: cleanUser,
          count: 0,
          total: 0,
          hasLink: !!existingLink,
          link: existingLink,
          nickname: nick,
          isPinned: true,
          lastTime: userLatestCommentTime[cleanUser] || now,
          tag,
          avatar: userAvatars[cleanUser]
        });
      }
    });

    const list = Array.from(userMap.values());

    // Sắp xếp thông minh:
    // 1. Ưu tiên khách đang GHIM lên hàng đầu
    // 2. Ưu tiên khách chưa có link Zalo
    // 3. Khách có đơn chốt nhiều nhất (count giảm dần)
    // 4. Khách vừa mới có đơn / tương tác gần nhất
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.hasLink !== b.hasLink) return a.hasLink ? 1 : -1;
      if (a.count !== b.count) return b.count - a.count;
      return (b.lastTime || 0) - (a.lastTime || 0);
    });

    return list;
  }, [store.tiktok.customers, store.tiktok.pancakeLinks, store.tiktok.nicknames, store.tiktok.pinned, store.tiktok.comments, store.tiktok.tags]);

  // Lọc danh sách gán
  const filteredTikTokCustomers = useMemo(() => {
    let list = liveTikTokCustomers;

    // Lọc theo Tab bộ lọc
    if (assignFilterTab === 'pinned') {
      list = list.filter(c => c.isPinned);
    } else if (assignFilterTab === 'with_orders') {
      list = list.filter(c => c.count > 0);
    } else if (assignFilterTab === 'no_zalo') {
      list = list.filter(c => !c.hasLink);
    }

    if (!assignSearch.trim()) return list;
    const q = assignSearch.trim().toLowerCase();
    return list.filter(c => 
      c.user.toLowerCase().includes(q) || 
      (c.nickname && c.nickname.toLowerCase().includes(q)) ||
      getShortId(c.user).toLowerCase().includes(q) ||
      (c.tag && c.tag.toLowerCase().includes(q))
    );
  }, [liveTikTokCustomers, assignSearch, assignFilterTab]);

  // Xử lý gán Zalo cho khách TikTok
  const handleAssignTikTokUser = (tiktokUser: string) => {
    if (!assigningConv) return;
    const cleanUser = normalizeUser(tiktokUser);
    
    // 1. Lưu link Pancake cho khách TikTok & Đồng bộ ngay lịch sử đơn hàng POS (KHÔNG đổi nickname ở chotdon)
    store.setCustomerPancakeLink('tiktok', cleanUser, assigningConv.deepLink);
    syncSingleCustomerPancakeOrders(cleanUser, 'tiktok', assigningConv.deepLink);

    // 2. Tạo tên chuẩn [Tên Zalo] #[ShortId] [Tên TikTok]
    const suggestedName = generateSuggestedPancakeName(assigningConv.name, cleanUser);

    // 3. Cập nhật tên / ghi chú hội thoại trên Pancake Pages & POS
    updatePancakeCustomerName({
      pageId: assigningConv.pageId,
      convId: assigningConv.id,
      customerId: assigningConv.customerId,
      newName: suggestedName
    });

    // 4. Copy tên gợi ý vào clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(suggestedName);
      }
    } catch {}

    onToast?.(`✅ Đã gán Zalo "${assigningConv.name}" cho @${cleanUser}!`);
    setAssigningConv(null);
  };

  // Tập hợp các conversation ID hoặc link đã được lưu trong Store (TikTok, Facebook, Shopee)
  const linkedConvIdSet = useMemo(() => {
    const set = new Set<string>();
    const platforms = ['tiktok', 'facebook', 'shopee'] as const;
    platforms.forEach(p => {
      const links = store[p]?.pancakeLinks || {};
      Object.values(links).forEach((link: string) => {
        if (!link) return;
        const clean = link.trim();
        const urlMatch = clean.match(/c_id=([^&]+)/);
        if (urlMatch) {
          set.add(urlMatch[1]);
          const short = urlMatch[1].split('_').pop();
          if (short && short.length >= 8) set.add(short);
        }
        const pzlMatch = clean.match(/(pzl_u_\d+_\d+)/);
        if (pzlMatch) {
          set.add(pzlMatch[1]);
          const short = pzlMatch[1].split('_').pop();
          if (short && short.length >= 8) set.add(short);
        }
        const pureShortMatch = clean.match(/pzl_u_(\d+)/);
        if (pureShortMatch) {
          set.add(pureShortMatch[1]);
        }
        set.add(clean);
      });
    });
    return set;
  }, [store.tiktok?.pancakeLinks, store.facebook?.pancakeLinks, store.shopee?.pancakeLinks]);

  // Bảng tra cứu link Pancake -> TikTok username
  const pancakeLinkToTikTokUser = useMemo(() => {
    const map: Record<string, string> = {};
    const links = store.tiktok.pancakeLinks || {};
    for (const [tiktokUser, link] of Object.entries(links)) {
      if (link) {
        const clean = link.trim();
        const { pageId, convId } = parsePancakeUrlIds(clean);
        if (pageId && convId) {
          map[`${pageId}_${convId}`] = tiktokUser;
          map[convId] = tiktokUser;
        }
        map[clean] = tiktokUser;
      }
    }
    return map;
  }, [store.tiktok.pancakeLinks]);

  // Kiểm tra hội thoại đã được liên kết với nick TikTok / hồ sơ chưa
  const isConversationLinked = useCallback((c: ZaloInboxConversation): boolean => {
    if (!c) return false;
    if (linkedConvIdSet.has(c.id) || linkedConvIdSet.has(c.deepLink)) return true;
    const userUniqueId = c.id ? c.id.split('_').pop() : '';
    if (userUniqueId && userUniqueId.length >= 8 && linkedConvIdSet.has(userUniqueId)) return true;
    if (pancakeLinkToTikTokUser[`${c.pageId}_${c.id}`] || pancakeLinkToTikTokUser[c.deepLink] || pancakeLinkToTikTokUser[c.id]) return true;
    return false;
  }, [linkedConvIdSet, pancakeLinkToTikTokUser]);

  // Đếm số lượng theo các tiêu chí thông minh
  const counts = useMemo(() => {
    let unlinkedStrangers = 0; // Khách lạ chưa có tag vận đơn & chưa liên kết
    let allUnlinked = 0;        // Tất cả khách chưa liên kết (chưa nhận)
    let unpaid = 0;             // Chưa cọc / chưa có đơn
    let friends = 0;            // Bạn bè chưa liên kết
    let received = 0;           // Đã nhận hàng thành công
    let linked = 0;             // Đã liên kết

    for (const c of conversations) {
      const isLk = isConversationLinked(c);
      if (isLk) {
        linked++;
      }
      if (c.isReceived) {
        received++;
      }
      if (!isLk && !c.isReceived) {
        allUnlinked++;
        if (c.isStranger && !c.hasShippingTag) {
          unlinkedStrangers++;
        }
        if (!c.isStranger) {
          friends++;
        }
        if (c.isNewCustomerNoOrder) {
          unpaid++;
        }
      }
    }
    return { unlinkedStrangers, allUnlinked, unpaid, friends, received, linked };
  }, [conversations, isConversationLinked]);

  // Lọc hội thoại thông minh
  const filteredConversations = useMemo(() => {
    let list = conversations;

    if (filterKeyword.trim()) {
      const q = filterKeyword.trim().toLowerCase();
      return list.filter(c => {
        const linkedUser = pancakeLinkToTikTokUser[`${c.pageId}_${c.id}`] || pancakeLinkToTikTokUser[c.deepLink] || pancakeLinkToTikTokUser[c.id] || '';
        return (
          c.name.toLowerCase().includes(q) ||
          (c.snippet && c.snippet.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (linkedUser && linkedUser.toLowerCase().includes(q))
        );
      });
    }

    switch (activeFilterTab) {
      case 'strangers':
        return list.filter(c => !isConversationLinked(c) && !c.isReceived && c.isStranger && !c.hasShippingTag);
      case 'unpaid':
        return list.filter(c => !isConversationLinked(c) && !c.isReceived && c.isNewCustomerNoOrder);
      case 'friends':
        return list.filter(c => !isConversationLinked(c) && !c.isReceived && !c.isStranger);
      case 'received':
        return list.filter(c => c.isReceived);
      case 'linked':
        return list.filter(c => isConversationLinked(c));
      case 'all':
      default:
        return list.filter(c => !isConversationLinked(c) && !c.isReceived);
    }
  }, [conversations, activeFilterTab, filterKeyword, isConversationLinked, pancakeLinkToTikTokUser]);

  // Lấy thông tin giỏ hàng TikTok của khách được chọn (nếu có)
  const selectedTikTokUser = useMemo(() => {
    if (!selectedConv) return null;
    return pancakeLinkToTikTokUser[`${selectedConv.pageId}_${selectedConv.id}`] || 
           pancakeLinkToTikTokUser[selectedConv.deepLink] || 
           pancakeLinkToTikTokUser[selectedConv.id] || null;
  }, [selectedConv, pancakeLinkToTikTokUser]);

  const selectedTikTokCart = useMemo(() => {
    if (!selectedTikTokUser) return null;
    const clean = normalizeUser(selectedTikTokUser);
    const data = store.tiktok.customers?.[clean];
    if (!data) return null;
    return {
      user: clean,
      count: data.count || 0,
      total: data.total || 0,
      tag: store.tiktok.tags?.[clean] || 'NORMAL',
      nickname: store.tiktok.nicknames?.[clean] || ''
    };
  }, [selectedTikTokUser, store.tiktok.customers, store.tiktok.tags, store.tiktok.nicknames]);

  const handleSaveToken = () => {
    if (tempToken.trim()) {
      setPancakeToken(tempToken.trim());
      setShowTokenModal(false);
      onToast?.("✅ Đã lưu token mới! Đang đồng bộ lại...");
      loadConversations(true);
    }
  };

  return (
    <div 
      onScroll={handleContainerScroll}
      className="flex-1 flex flex-col h-full bg-[#0b1118] text-white overflow-hidden select-none"
    >
      {/* HEADER BAR */}
      <div className="bg-[#121a24] border-b border-white/10 px-3 py-2 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black">
            <MessageSquare size={16} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-white tracking-wide">Zalo Live Inbox & Cọc</h2>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold">
                ● Realtime Multi-User
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Nhắn tin Zalo trực tiếp, gửi mẫu cọc, VietQR & liên kết TikTok
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowPreviewCoc(true)}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            title="Xem mẫu cọc /coc"
          >
            <span>⚡ Mẫu Cọc</span>
          </button>

          <button
            onClick={() => loadConversations(true)}
            disabled={isLoading}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-all cursor-pointer active:scale-95 border border-white/10"
            title="Làm mới tin nhắn"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin text-blue-400" : ""} />
          </button>

          <button
            onClick={() => {
              setTempToken(getPancakeToken());
              setShowTokenModal(true);
            }}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-all cursor-pointer active:scale-95 border border-white/10"
            title="Cài đặt kết nối / Token"
          >
            <Key size={14} />
          </button>
        </div>
      </div>

      {/* MAIN CONTAINER: DUAL PANE (DESKTOP) OR SLIDE (MOBILE) */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT PANE: CONVERSATION LIST */}
        <div className={`w-full md:w-80 lg:w-96 flex flex-col bg-[#0f1722] border-r border-white/10 shrink-0 h-full overflow-hidden ${
          selectedConv ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Filter Tabs */}
          <div className="p-2 border-b border-white/10 bg-[#121c2a] flex items-center gap-1 overflow-x-auto hide-scrollbar shrink-0">
            <button
              onClick={() => setActiveFilterTab('strangers')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeFilterTab === 'strangers'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-[#1a2533] text-gray-300 hover:bg-[#223144]'
              }`}
            >
              <span>🔥 Cần Cọc</span>
              <span className="px-1.5 py-0.2 bg-black/30 rounded-full text-[10px]">{counts.unlinkedStrangers}</span>
            </button>

            <button
              onClick={() => setActiveFilterTab('unpaid')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeFilterTab === 'unpaid'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-[#1a2533] text-gray-300 hover:bg-[#223144]'
              }`}
            >
              <span>⚡ Chưa có đơn</span>
              <span className="px-1.5 py-0.2 bg-black/30 rounded-full text-[10px]">{counts.unpaid}</span>
            </button>

            <button
              onClick={() => setActiveFilterTab('linked')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeFilterTab === 'linked'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-[#1a2533] text-gray-300 hover:bg-[#223144]'
              }`}
            >
              <span>🔗 Đã liên kết</span>
              <span className="px-1.5 py-0.2 bg-black/30 rounded-full text-[10px]">{counts.linked}</span>
            </button>

            <button
              onClick={() => setActiveFilterTab('friends')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeFilterTab === 'friends'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-[#1a2533] text-gray-300 hover:bg-[#223144]'
              }`}
            >
              <span>🤝 Bạn bè</span>
              <span className="px-1.5 py-0.2 bg-black/30 rounded-full text-[10px]">{counts.friends}</span>
            </button>

            <button
              onClick={() => setActiveFilterTab('all')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeFilterTab === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-[#1a2533] text-gray-300 hover:bg-[#223144]'
              }`}
            >
              <span>Tất cả</span>
              <span className="px-1.5 py-0.2 bg-black/30 rounded-full text-[10px]">{counts.allUnlinked}</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="p-2 border-b border-white/10 bg-[#0d141e] relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filterKeyword}
              onChange={e => {
                const val = e.target.value;
                setFilterKeyword(val);
                if (val.includes('pancake.vn') || val.includes('pages.fm') || val.includes('c_id=')) {
                  handleLookupPancakeLink(val);
                }
              }}
              placeholder="Tìm theo tên Zalo, SĐT, hoặc link Pancake..."
              className="w-full bg-[#16212e] border border-white/10 rounded-xl pl-8 pr-16 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {filterKeyword && (
              <button
                onClick={() => setFilterKeyword('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Conversation List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-1.5 space-y-1">
            {isLoading && conversations.length === 0 ? (
              <div className="py-12 text-center text-gray-400 space-y-2">
                <RefreshCw size={24} className="animate-spin text-blue-400 mx-auto" />
                <p className="text-xs">Đang tải danh sách Zalo...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-12 text-center text-gray-400 space-y-1 px-4">
                <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-1" />
                <p className="text-xs font-bold text-gray-200">Không có hội thoại nào!</p>
                <p className="text-[11px] text-gray-400">Tất cả khách lạ đã được xử lý hoặc đã liên kết.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedConv?.id === conv.id;
                const timeObj = formatPancakeTime(conv.updatedTimestamp);
                const linkedTikTokUser = pancakeLinkToTikTokUser[`${conv.pageId}_${conv.id}`] || pancakeLinkToTikTokUser[conv.deepLink] || pancakeLinkToTikTokUser[conv.id];
                const isSent = sentConvIds[conv.id];

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 border ${
                      isSelected 
                        ? 'bg-blue-900/30 border-blue-500/60 shadow-md ring-1 ring-blue-500/30' 
                        : 'bg-[#141d2a] border-white/5 hover:bg-[#1a2636] hover:border-white/15'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0 mt-0.5">
                      {conv.avatarUrl ? (
                        <img 
                          src={conv.avatarUrl} 
                          alt={conv.name} 
                          className="w-10 h-10 rounded-full object-cover border border-white/10"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-400/30 flex items-center justify-center font-bold text-xs text-blue-200">
                          {conv.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 bg-blue-600 text-white text-[7px] font-black px-1 rounded-full border border-[#141d2a]">
                        Z
                      </span>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-white truncate max-w-[140px]">
                          {conv.name}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">
                          {timeObj.time || conv.updatedAt.slice(11, 16)}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-300 truncate mt-0.5 leading-snug">
                        {conv.snippet || "[Hình ảnh/Tệp]"}
                      </p>

                      {/* Badges row */}
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {conv.isStranger ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            Khách lạ
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/40">
                            Bạn bè
                          </span>
                        )}

                        {linkedTikTokUser ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-400 text-amber-950">
                            @{linkedTikTokUser}
                          </span>
                        ) : conv.isNewCustomerNoOrder ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Chưa cọc
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            {conv.ordersCount > 0 ? `${conv.ordersCount} đơn` : 'Đã cọc'}
                          </span>
                        )}

                        {isSent && (
                          <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                            <Check size={10} /> Đã gửi /coc
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: LIVE CHAT & ACTION CENTER */}
        <div className={`flex-1 flex flex-col h-full bg-[#0d141e] overflow-hidden ${
          selectedConv ? 'flex' : 'hidden md:flex'
        }`}>
          {selectedConv ? (
            <>
              {/* CHAT HEADER */}
              <div className="p-3 bg-[#141d29] border-b border-white/10 flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Back button on mobile */}
                  <button
                    onClick={() => setSelectedConv(null)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 md:hidden cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <div className="relative shrink-0">
                    {selectedConv.avatarUrl ? (
                      <img 
                        src={selectedConv.avatarUrl} 
                        alt={selectedConv.name} 
                        className="w-10 h-10 rounded-full object-cover border border-white/10"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-400/30 flex items-center justify-center font-bold text-sm text-blue-200">
                        {selectedConv.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#141d29]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate max-w-[160px] sm:max-w-xs">
                        {selectedConv.name}
                      </h3>
                      {selectedConv.phone && (
                        <span className="text-[11px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          {selectedConv.phone}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <span>{selectedConv.pageName}</span>
                      <span>•</span>
                      <span>{selectedConv.isStranger ? 'Khách lạ' : 'Bạn bè'}</span>
                    </p>
                  </div>
                </div>

                {/* Right Action Icons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setAssigningConv(selectedConv);
                      setAssignSearch('');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
                      selectedTikTokUser 
                        ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 shadow-md font-black'
                        : 'bg-orange-600/30 text-orange-300 border border-orange-500/40 hover:bg-orange-600/40'
                    }`}
                  >
                    <LinkIcon size={13} />
                    <span>{selectedTikTokUser ? `@${selectedTikTokUser}` : '🔗 Gán TikTok'}</span>
                  </button>

                  <button
                    onClick={() => openPancakeApp(selectedConv.deepLink, true)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 active:scale-95 transition-all cursor-pointer"
                    title="Mở App Pancake / Zalo Web"
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>

              {/* TIKTOK LIVE CART BANNER (IF LINKED) */}
              {selectedTikTokCart && (
                <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border-b border-amber-500/30 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingBag size={15} className="text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs text-amber-300 font-bold">
                        Đơn Live TikTok: <strong className="text-white">{selectedTikTokCart.count} món ({selectedTikTokCart.total}k)</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        onOpenPrice?.(null, selectedTikTokCart.user, 'tiktok', String(selectedTikTokCart.total));
                      }}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      <Printer size={12} />
                      <span>In / Chốt Đơn</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowQrModal({ amount: selectedTikTokCart.total, user: selectedTikTokCart.user });
                      }}
                      className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      <QrCode size={12} />
                      <span>VietQR {selectedTikTokCart.total}k</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CHAT MESSAGES THREAD */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0d141e]">
                {isLoadingMessages && messages.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <RefreshCw size={20} className="animate-spin text-blue-400 mx-auto" />
                    <p className="text-xs">Đang tải lịch sử tin nhắn...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <MessageCircle size={32} className="text-gray-500 mx-auto" />
                    <p className="text-xs font-bold text-gray-300">Chưa có tin nhắn trong phiên này</p>
                    <p className="text-[11px] text-gray-500">Bạn có thể bấm nút gửi mẫu cọc hoặc gõ tin nhắn phía dưới để bắt đầu chat.</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isFromShop = String(msg.from?.id || '').toLowerCase() === String(selectedConv.pageId).toLowerCase() || msg.from?.is_page === true || msg.is_page_message === true;
                    const timeStr = msg.inserted_at ? new Date(msg.inserted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
                    const photoUrl = msg.attachments?.[0]?.url || msg.photo_url || msg.image_url;

                    return (
                      <div 
                        key={msg.id || idx}
                        className={`flex flex-col ${isFromShop ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`max-w-[82%] sm:max-w-[70%] rounded-2xl p-3 shadow-md ${
                          isFromShop 
                            ? 'bg-blue-600 text-white rounded-br-xs' 
                            : 'bg-[#1e293b] text-gray-100 border border-white/10 rounded-bl-xs'
                        }`}>
                          {/* Sender name if group/shop */}
                          <div className="text-[10px] font-bold opacity-75 mb-1">
                            {isFromShop ? (msg.sender?.name || selectedConv.pageName || 'Shop') : (msg.from?.name || selectedConv.name)}
                          </div>

                          {/* Message Text */}
                          {msg.message && (
                            <p className="text-xs leading-relaxed whitespace-pre-line break-words font-sans">
                              {msg.message}
                            </p>
                          )}

                          {/* Image Attachment (Click to Zoom & Inspect Bill) */}
                          {photoUrl && (
                            <div className="mt-2 relative rounded-xl overflow-hidden border border-white/20 group cursor-pointer">
                              <img 
                                src={photoUrl} 
                                alt="Ảnh đính kèm" 
                                className="max-h-60 rounded-xl object-contain bg-black/40 hover:opacity-90 transition-opacity"
                                referrerPolicy="no-referrer"
                                onClick={() => setZoomedImage(photoUrl)}
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                                🔍 Bấm xem ảnh lớn
                              </div>
                            </div>
                          )}

                          {/* Message Time */}
                          {timeStr && (
                            <div className={`text-[9px] mt-1 text-right font-mono ${isFromShop ? 'text-blue-200' : 'text-gray-400'}`}>
                              {timeStr}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* QUICK ACTION BAR (1-CHẠM GỬI MẪU) */}
              <div className="bg-[#121c2a] border-t border-white/10 px-3 py-2 flex items-center gap-1.5 overflow-x-auto hide-scrollbar shrink-0">
                <button
                  type="button"
                  onClick={() => handleSendDepositMessage(selectedConv)}
                  disabled={isSendingReply || sendingConvId === selectedConv.id}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm"
                >
                  <Send size={12} />
                  <span>⚡ Gửi Mẫu Cọc (/coc)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const amt = selectedTikTokCart?.total || 50;
                    setShowQrModal({ amount: amt, user: selectedTikTokCart?.user || selectedConv.name });
                  }}
                  className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <QrCode size={13} />
                  <span>🏦 Mã VietQR Chuyển Khoản</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSendQuickTemplate("Dạ shop chào bạn! Bạn cho shop xin Tên nhận + SĐT + Địa chỉ cụ thể để shop tạo đơn chốt live cho bạn nha ❤️");
                  }}
                  disabled={isSendingReply}
                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1 active:scale-95 transition-all cursor-pointer border border-white/10"
                >
                  <span>📍 Xin Đ/c & SĐT</span>
                </button>

                {selectedTikTokCart && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSendQuickTemplate(`Dạ shop đã chốt cho bạn ${selectedTikTokCart.count} món trên live, tổng tiền là ${selectedTikTokCart.total}k. Bạn gửi địa chỉ nhận hàng và chuyển cọc giúp shop nha! ❤️`);
                    }}
                    disabled={isSendingReply}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1 active:scale-95 transition-all cursor-pointer border border-white/10"
                  >
                    <span>📦 Báo Tổng Đơn Live</span>
                  </button>
                )}
              </div>

              {/* INPUT COMPOSER */}
              <div className="p-3 bg-[#141d29] border-t border-white/10 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendDirectReply();
                    }
                  }}
                  placeholder={`Nhắn tin trực tiếp cho ${selectedConv.name}... (Enter để gửi)`}
                  className="flex-1 bg-[#0b1118] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />

                <button
                  type="button"
                  onClick={handleSendDirectReply}
                  disabled={!replyText.trim() || isSendingReply}
                  className={`p-2.5 rounded-xl font-bold flex items-center justify-center transition-all cursor-pointer shadow-md ${
                    replyText.trim() && !isSendingReply
                      ? 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
                      : 'bg-white/5 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isSendingReply ? (
                    <RefreshCw size={16} className="animate-spin text-white" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            </>
          ) : (
            /* EMPTY STATE WHEN NO CONVERSATION SELECTED (DESKTOP) */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <MessageSquare size={32} />
              </div>
              <h3 className="text-sm font-bold text-white">Chọn một khách hàng để xem hộp thoại chat</h3>
              <p className="text-xs text-gray-400 max-w-sm">
                Bạn có thể xem lịch sử tin nhắn, gửi trực tiếp mẫu cọc (/coc), tạo mã QR chuyển khoản và liên kết nick TikTok ngay tại đây.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL GÁN KHÁCH TIKTOK LIVE */}
      {assigningConv && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#172333] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 bg-[#131d2a]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔗</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">Gán Khách TikTok Cho Zalo</h3>
                    <p className="text-xs text-orange-300 font-semibold mt-0.5">
                      Khách Zalo: <span className="text-white">{assigningConv.name}</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setAssigningConv(null)}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Search TikTok */}
              <div className="mt-3 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  placeholder="Tìm nick TikTok, #mã ngắn, hoặc tên Zalo..."
                  className="w-full bg-[#0d141e] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              {/* Filter Tabs: Tất cả, Đang ghim, Có đơn live, Chưa nối Zalo */}
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setAssignFilterTab('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer text-[11px] ${
                    assignFilterTab === 'all'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                  }`}
                >
                  Tất cả ({liveTikTokCustomers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignFilterTab('pinned')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${
                    assignFilterTab === 'pinned'
                      ? 'bg-amber-600 text-white font-bold shadow'
                      : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  }`}
                >
                  <Pin size={11} className="rotate-45" /> Đang ghim ({liveTikTokCustomers.filter(c => c.isPinned).length})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignFilterTab('with_orders')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${
                    assignFilterTab === 'with_orders'
                      ? 'bg-emerald-600 text-white font-bold shadow'
                      : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  <ShoppingBag size={11} /> Có đơn ({liveTikTokCustomers.filter(c => c.count > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignFilterTab('no_zalo')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${
                    assignFilterTab === 'no_zalo'
                      ? 'bg-orange-600 text-white font-bold shadow'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  ⚡ Chưa nối ({liveTikTokCustomers.filter(c => !c.hasLink).length})
                </button>
              </div>
            </div>

            {/* TikTok Customers List */}
            <div className="flex-1 overflow-y-auto p-3 divide-y divide-white/5 max-h-[50vh]">
              {filteredTikTokCustomers.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs space-y-1">
                  <p>Không tìm thấy khách TikTok nào phù hợp.</p>
                  {assignFilterTab !== 'all' && (
                    <button
                      onClick={() => setAssignFilterTab('all')}
                      className="text-blue-400 underline text-[11px] cursor-pointer"
                    >
                      Xem tất cả khách hàng
                    </button>
                  )}
                </div>
              ) : (
                filteredTikTokCustomers.map((c, idx) => {
                  const suggested = generateSuggestedPancakeName(assigningConv.name, c.user);
                  return (
                    <div 
                      key={idx}
                      className={`py-2.5 px-3 flex items-center justify-between gap-3 hover:bg-white/5 rounded-xl transition-colors ${
                        c.isPinned ? 'bg-amber-500/10 border border-amber-500/20 my-1' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-start gap-2.5">
                        <CustomerAvatar 
                          user={c.user} 
                          platform="tiktok" 
                          avatarUrl={c.avatar} 
                          size="sm"
                          tag={c.tag}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {c.isPinned && (
                              <span className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow">
                                <Pin size={9} className="rotate-45" /> ĐANG GHIM
                              </span>
                            )}
                            <span className="text-[10px] font-mono font-bold text-gray-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                              #{getShortId(c.user)}
                            </span>
                            {c.nickname && (
                              <span className="text-xs text-amber-300 font-bold bg-amber-500/15 border border-amber-500/30 px-1 rounded truncate">({c.nickname})</span>
                            )}
                            <span className="text-sm font-bold text-white truncate">
                              {c.user}
                            </span>
                          </div>

                          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                            {c.count > 0 ? (
                              <span className="text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                Đã chốt: {c.count} cái ({c.total}k)
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">
                                Chưa chốt đơn live
                              </span>
                            )}
                            {c.hasLink ? (
                              <span className="text-emerald-400 text-[10px] font-semibold">● Đã có link</span>
                            ) : (
                              <span className="text-amber-400 text-[10px] font-semibold">○ Chưa có Zalo</span>
                            )}
                          </div>

                          <div className="text-[10px] text-orange-300 font-mono mt-1 truncate">
                            Tên gợi ý: <strong>{suggested}</strong>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAssignTikTokUser(c.user)}
                        className={`px-3 py-1.5 active:scale-95 text-white text-xs font-bold rounded-xl shrink-0 flex items-center gap-1 cursor-pointer shadow-md ${
                          c.isPinned ? 'bg-amber-600 hover:bg-amber-500' : 'bg-orange-600 hover:bg-orange-500'
                        }`}
                      >
                        <UserCheck size={14} /> Gán
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL MÃ VIETQR CHUYỂN KHOẢN TỰ ĐỘNG */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#172333] border border-white/15 rounded-2xl w-full max-w-sm p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <QrCode size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-white">Mã QR Chuyển Khoản VietQR</h3>
              </div>
              <button 
                onClick={() => setShowQrModal(null)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-center space-y-2">
              <div className="bg-white p-3 rounded-2xl inline-block shadow-lg mx-auto">
                <img 
                  src={`https://img.vietqr.io/image/liobank-67896896-compact2.png?amount=${showQrModal.amount * 1000}&addInfo=${encodeURIComponent(`COC ${showQrModal.user}`)}&accountName=${encodeURIComponent("HUYNH NGOC VU")}`}
                  alt="Mã QR Chuyển Khoản"
                  className="w-60 h-60 object-contain mx-auto"
                />
              </div>

              <div className="bg-[#0e1621] p-2.5 rounded-xl border border-white/10 text-xs text-left space-y-1 font-mono">
                <div className="flex justify-between text-gray-300">
                  <span>Ngân hàng:</span> <strong className="text-white">Liobank</strong>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Số TK:</span> <strong className="text-amber-400">67896896</strong>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Chủ TK:</span> <strong className="text-white">HUYNH NGOC VU</strong>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Số tiền:</span> <strong className="text-emerald-400 font-bold">{showQrModal.amount * 1000} đ ({showQrModal.amount}k)</strong>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Nội dung:</span> <strong className="text-yellow-300">COC {showQrModal.user}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const qrUrl = `https://img.vietqr.io/image/liobank-67896896-compact2.png?amount=${showQrModal.amount * 1000}&addInfo=${encodeURIComponent(`COC ${showQrModal.user}`)}&accountName=${encodeURIComponent("HUYNH NGOC VU")}`;
                  if (selectedConv) {
                    handleSendQuickTemplate(`Dạ shop gửi bạn mã QR chuyển khoản cọc ${showQrModal.amount}k ạ:\nSTK: 67896896 (Liobank)\nTên: Huỳnh Ngọc Vũ\nNội dung: COC ${showQrModal.user}\nLink QR: ${qrUrl}`);
                  }
                  setShowQrModal(null);
                }}
                className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-black text-xs font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <Send size={13} /> Gửi Vào Chat Zalo
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(`67896896\nLiobank\nHUYNH NGOC VU\nSo tien: ${showQrModal.amount * 1000}d\nNoi dung: COC ${showQrModal.user}`);
                    onToast?.("✅ Đã copy thông tin STK chuyển khoản!");
                  } catch {}
                  setShowQrModal(null);
                }}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZOOM ẢNH BILL CHUYỂN KHOẢN */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-2xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-sm font-bold bg-white/10 px-3 py-1 rounded-full cursor-pointer"
            >
              ✕ Đóng
            </button>
            <img 
              src={zoomedImage} 
              alt="Ảnh phóng to" 
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-white/20"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC MẪU TIN NHẮN CỌC /coc */}
      {showPreviewCoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#172333] border border-white/10 rounded-2xl w-full max-w-md p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <h3 className="text-sm font-bold text-white">Mẫu Tin Nhắn Cọc (/coc)</h3>
              </div>
              <button 
                onClick={() => setShowPreviewCoc(false)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-200">
              <div className="bg-[#0e1621] p-3 rounded-xl border border-white/5 whitespace-pre-line leading-relaxed font-sans text-gray-300">
                {PANCAKE_COC_MESSAGE_PART1}
              </div>
              <div className="bg-[#0e1621] p-3 rounded-xl border border-white/5 whitespace-pre-line leading-relaxed font-sans text-blue-200 font-mono">
                {PANCAKE_COC_MESSAGE_PART2}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(`${PANCAKE_COC_MESSAGE_PART1}\n\n${PANCAKE_COC_MESSAGE_PART2}`);
                    onToast?.("✅ Đã copy toàn bộ nội dung mẫu cọc!");
                  } catch {}
                  setShowPreviewCoc(false);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Copy size={13} /> Copy Mẫu Cọc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cài đặt Token / Gateway */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141d29] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-white/10 bg-[#172333] flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Key size={16} className="text-amber-400" />
                Cài Đặt Kết Nối Zalo & Pancake Token
              </h3>
              <button 
                onClick={() => setShowTokenModal(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-3 text-xs">
              <p className="text-gray-300 leading-relaxed">
                Nhập hoặc dán access token từ Pancake để đồng bộ trực tiếp tài khoản Zalo cá nhân của shop:
              </p>
              <textarea
                value={tempToken}
                onChange={e => setTempToken(e.target.value)}
                placeholder="Dán access_token từ pages.fm / pos.pages.fm..."
                rows={4}
                className="w-full bg-[#0e1621] border border-white/10 rounded-xl p-2.5 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="p-3 border-t border-white/10 bg-[#172333] flex justify-end gap-2">
              <button
                onClick={() => setShowTokenModal(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveToken}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Lưu Token & Đồng bộ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
