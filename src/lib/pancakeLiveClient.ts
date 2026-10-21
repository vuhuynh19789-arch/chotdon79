import { useState, useEffect } from 'react';
import { useStore, CommentData, registerCustomerAvatar } from '../store';
import { DEFAULT_PANCAKE_TOKEN, getOrderPushSettings } from './orderPushSettings';
import { ref, set as fbSet } from 'firebase/database';
import { firebaseDb, DEVICE_ID, extractPriceFromContent } from './core';

export const PANCAKE_QUICK_PRICES = ['71', '82', '71*2', '99', '142', '160'];

export interface PancakePost {
  id: string;
  rawId: string;
  message: string;
  type: string;
  isLivestream: boolean;
  commentsCount: number;
  createdTime: string;
  thumbnail?: string;
}

export interface PancakeLiveStatus {
  isConnected: boolean;
  isPolling: boolean;
  pageId: string;
  pageName: string;
  postId: string;
  postTitle: string;
  totalCommentsCount: number;
  lastComment: string | null;
  lastCommentUser: string | null;
  lastSyncAt: number | null;
  lastError: string | null;
}

let scraperStatus: PancakeLiveStatus = {
  isConnected: false,
  isPolling: false,
  pageId: '100546631959960',
  pageName: 'Hiền Phạm Shop',
  postId: '',
  postTitle: '',
  totalCommentsCount: 0,
  lastComment: null,
  lastCommentUser: null,
  lastSyncAt: null,
  lastError: null
};

const statusListeners: Array<(status: PancakeLiveStatus) => void> = [];
let pollTimer: any = null;
const seenCommentIds = new Set<string>();

function notifyListeners() {
  const cloned = { ...scraperStatus };
  statusListeners.forEach((fn) => {
    try { fn(cloned); } catch {}
  });
}

export function getPancakeLiveStatus(): PancakeLiveStatus {
  return { ...scraperStatus };
}

export function subscribePancakeLiveStatus(callback: (status: PancakeLiveStatus) => void): () => void {
  statusListeners.push(callback);
  callback(getPancakeLiveStatus());
  return () => {
    const idx = statusListeners.indexOf(callback);
    if (idx !== -1) statusListeners.splice(idx, 1);
  };
}

export function usePancakeLiveStatus(): PancakeLiveStatus {
  const [status, setStatus] = useState<PancakeLiveStatus>(getPancakeLiveStatus());
  useEffect(() => {
    return subscribePancakeLiveStatus(setStatus);
  }, []);
  return status;
}

// Lấy danh sách Pages của Pancake
export async function fetchPancakePagesList(): Promise<Array<{ id: string; name: string }>> {
  const settings = getOrderPushSettings();
  const token = (settings.pancakeToken || DEFAULT_PANCAKE_TOKEN).trim();

  try {
    const res = await fetch(`/api/pancake/pages?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      const list = data.categorized?.activated || data.pages || data.data || [];
      if (Array.isArray(list) && list.length > 0) {
        return list.map((p: any) => ({
          id: String(p.id),
          name: p.name || `Fanpage #${p.id}`
        }));
      }
    }
  } catch {}

  return [
    { id: '100546631959960', name: 'Hiền Phạm Shop' }
  ];
}

// Lấy danh sách bài viết / livestream của Fanpage từ Pancake
export async function fetchPancakePagePosts(pageId: string = '100546631959960'): Promise<PancakePost[]> {
  const settings = getOrderPushSettings();
  const token = (settings.pancakeToken || DEFAULT_PANCAKE_TOKEN).trim();

  try {
    const res = await fetch(`/api/pancake/pages/${pageId}/posts?token=${encodeURIComponent(token)}&page_size=35`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.posts)) {
        return data.posts;
      }
    }
  } catch (err: any) {
    console.warn('Lỗi lấy bài viết Pancake:', err.message);
  }
  return [];
}

// Bắt đầu cào bình luận từ bài Live trên Pancake
export async function startPancakeLiveScraping(options: {
  pageId?: string;
  pageName?: string;
  postId: string;
  postTitle?: string;
}): Promise<boolean> {
  const pageId = options.pageId || '100546631959960';
  const pageName = options.pageName || 'Hiền Phạm Shop';
  let cleanPostId = options.postId.trim();
  if (cleanPostId.includes('_')) {
    cleanPostId = cleanPostId.split('_')[1];
  }
  const postTitle = options.postTitle || `Bài Live #${cleanPostId}`;

  // Lưu phiên gần nhất vào localStorage
  try {
    localStorage.setItem('slp_pancake_live_session', JSON.stringify({
      pageId,
      pageName,
      postId: cleanPostId,
      postTitle
    }));
  } catch {}

  scraperStatus = {
    ...scraperStatus,
    isConnected: true,
    isPolling: true,
    pageId,
    pageName,
    postId: cleanPostId,
    postTitle,
    lastError: null
  };
  notifyListeners();

  if (pollTimer) clearInterval(pollTimer);

  // Quét ngay lượt đầu tiên
  await pollPancakeLiveCommentsOnce();

  // Đặt interval quét liên tục mỗi 2 giây
  pollTimer = setInterval(pollPancakeLiveCommentsOnce, 2000);

  return true;
}

// Dừng cào
export function stopPancakeLiveScraping(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;

  scraperStatus = {
    ...scraperStatus,
    isConnected: false,
    isPolling: false,
    lastError: null
  };
  notifyListeners();

  try {
    localStorage.removeItem('slp_pancake_live_session');
  } catch {}
}

// Quét 1 lượt bình luận từ Pancake API
export async function pollPancakeLiveCommentsOnce(): Promise<number> {
  if (!scraperStatus.isConnected || !scraperStatus.postId) return 0;

  const settings = getOrderPushSettings();
  const token = (settings.pancakeToken || DEFAULT_PANCAKE_TOKEN).trim();
  const { pageId, postId } = scraperStatus;

  try {
    const url = `/api/pancake/pages/${pageId}/live-comments?postId=${encodeURIComponent(postId)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      scraperStatus = { ...scraperStatus, lastError: `Lỗi kết nối Pancake (${res.status}): ${errText.slice(0, 100)}` };
      notifyListeners();
      return 0;
    }

    const data = await res.json();
    if (!data.success || !Array.isArray(data.comments)) {
      if (data.error) {
        scraperStatus = { ...scraperStatus, lastError: data.error };
        notifyListeners();
      }
      return 0;
    }

    const comments: any[] = data.comments;
    let newCount = 0;
    const store = useStore.getState();

    for (const c of comments) {
      const commentId = String(c.id);
      if (seenCommentIds.has(commentId)) continue;
      seenCommentIds.add(commentId);
      if (seenCommentIds.size > 3000) {
        const first = seenCommentIds.values().next().value;
        if (first) seenCommentIds.delete(first);
      }

      newCount++;
      const commentItem: CommentData = {
        id: `pancake_${commentId}`,
        user: c.user || 'Khách FB',
        nickname: c.nickname || c.user || 'Khách FB',
        content: c.content || c.comment || '',
        comment: c.comment || c.content || '',
        time: c.time || new Date(c.ts || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        avatar: c.avatar || '',
        ts: c.ts || Date.now(),
        platform: 'facebook',
        phone: c.phone,
        orderCount: c.orderCount,
        totalSpend: c.totalSpend,
        province: c.province || c.location,
        location: c.location || c.province,
        pancakeConvId: c.pancakeConvId,
        pancakePageId: c.pancakePageId
      };

      // Đẩy vào kho lưu trữ (tự động phân tích giá tiền, hiển thị lên Feed)
      store.addComment('facebook', commentItem);

      // Nếu có avatar từ Pancake hoặc Facebook, đăng ký vào Registry để hiển thị tức thì
      if (commentItem.avatar) {
        registerCustomerAvatar(commentItem.user, commentItem.avatar, 'facebook');
      }

      // Tự động in nhãn dán theo mẫu thống nhất nếu người dùng bật "Tự động in khi có giá"
      try {
        const isAutoPrint = localStorage.getItem('slp_pancake_autoprint') === 'true';
        if (isAutoPrint) {
          const contentStr = commentItem.content || '';
          const extracted = extractPriceFromContent(contentStr);
          if (extracted.price) {
            store.printNewOrder(
              'facebook',
              commentItem.user,
              contentStr,
              extracted.price,
              commentItem.time,
              commentItem.id,
              false,
              false,
              {
                phone: commentItem.phone,
                province: commentItem.province || commentItem.location,
                orderCount: commentItem.orderCount
              }
            );
          }
        }
      } catch (err) {}

      // Nếu khách có tỉnh Ninh Thuận, đánh dấu thẻ Ninh Thuận tự động
      if (commentItem.province && commentItem.province.toLowerCase().includes('ninh thuận')) {
        const u = commentItem.user.trim();
        const currentTags = store.facebook.ninhThuanTags || {};
        if (!currentTags[u]) {
          useStore.setState((state) => ({
            facebook: {
              ...state.facebook,
              ninhThuanTags: {
                ...state.facebook.ninhThuanTags,
                [u]: true
              }
            }
          }));
        }
      }

      // Nếu khách có số điện thoại từ Pancake, liên kết Zalo/Pancake ngay
      if (commentItem.phone) {
        const u = commentItem.user.trim();
        const currentLinks = store.facebook.pancakeLinks || {};
        if (!currentLinks[u]) {
          useStore.setState((state) => ({
            facebook: {
              ...state.facebook,
              pancakeLinks: {
                ...state.facebook.pancakeLinks,
                [u]: commentItem.phone!
              }
            }
          }));
        }
      }

      scraperStatus.lastComment = commentItem.content;
      scraperStatus.lastCommentUser = commentItem.user;
      scraperStatus.totalCommentsCount++;
    }

    scraperStatus.lastSyncAt = Date.now();
    scraperStatus.lastError = null;
    notifyListeners();

    // Đồng bộ lên Firebase RTDB để các màn hình phụ / TV box nhận đồng bộ
    if (newCount > 0 && comments.length > 0) {
      try {
        const recentChunk = comments.slice(-40).map((c) => ({
          id: `pancake_${c.id}`,
          user: c.user,
          content: c.content || c.comment,
          time: c.time,
          ts: c.ts || Date.now(),
          platform: 'facebook',
          avatar: c.avatar || ''
        }));
        const fbUrl = ref(firebaseDb, 'rooms/hienpham_live_fb/comments');
        await fbSet(fbUrl, {
          data: recentChunk,
          updatedAt: Date.now(),
          deviceId: DEVICE_ID
        });
      } catch {}
    }

    return newCount;
  } catch (err: any) {
    scraperStatus = { ...scraperStatus, lastError: `Lỗi kết nối: ${err.message}` };
    notifyListeners();
    return 0;
  }
}

// Tạm dừng cào
export function pausePancakeLiveScraping(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  scraperStatus = {
    ...scraperStatus,
    isPolling: false
  };
  notifyListeners();
}

// Tiếp tục cào
export function resumePancakeLiveScraping(): void {
  if (!scraperStatus.isConnected) return;
  if (pollTimer) clearInterval(pollTimer);
  scraperStatus = {
    ...scraperStatus,
    isPolling: true
  };
  notifyListeners();
  pollTimer = setInterval(pollPancakeLiveCommentsOnce, 2000);
  pollPancakeLiveCommentsOnce();
}

// Bật / tắt nhanh cào
export function togglePancakeLiveScraping(): boolean {
  if (scraperStatus.isPolling) {
    pausePancakeLiveScraping();
    return false;
  } else {
    if (scraperStatus.isConnected) {
      resumePancakeLiveScraping();
      return true;
    } else {
      autoDetectAndStartPancakeLive();
      return true;
    }
  }
}

// Khôi phục phiên cào nếu trước đó đang cào dở
export function restorePreviousPancakeLiveSession(): void {
  try {
    const raw = localStorage.getItem('slp_pancake_live_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.postId) {
        startPancakeLiveScraping(parsed);
      }
    }
  } catch {}
}

// Tự động nhận diện bài Live mới nhất của Pancake và cào trực tiếp vào ứng dụng (không cần mở trình duyệt Facebook)
export async function autoDetectAndStartPancakeLive(): Promise<boolean> {
  const isStoppedByUser = localStorage.getItem('slp_pancake_manual_stopped') === 'true';
  if (isStoppedByUser) return false;

  const pageId = '100546631959960';
  const pageName = 'Hiền Phạm Shop';

  // 1. Kiểm tra phiên lưu trước đó
  try {
    const raw = localStorage.getItem('slp_pancake_live_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.postId) {
        startPancakeLiveScraping(parsed);
        return true;
      }
    }
  } catch {}

  // 2. Tự động lấy danh sách bài viết / livestream của Page từ Pancake
  try {
    const posts = await fetchPancakePagePosts(pageId);
    if (posts && posts.length > 0) {
      const live = posts.find((p) => p.isLivestream) || posts[0];
      if (live) {
        return startPancakeLiveScraping({
          pageId,
          pageName,
          postId: live.rawId || live.id,
          postTitle: live.message ? live.message.slice(0, 45) : `Live #${live.rawId || live.id}`
        });
      }
    }
  } catch {}

  // 3. Fallback: Bắt đầu cào trực tiếp với postId "auto" (server sẽ quét tất cả bình luận live gần nhất)
  return startPancakeLiveScraping({
    pageId,
    pageName,
    postId: 'auto',
    postTitle: 'Hiền Phạm Shop (Trực tiếp Pancake)'
  });
}
