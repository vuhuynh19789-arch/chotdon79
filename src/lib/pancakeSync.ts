/**
 * pancakeSync.ts
 * Module đồng bộ chuyên sâu Pancake Pages (Zalo cá nhân / Facebook) & Pancake POS
 * 
 * NGUYÊN TẮC CHÍNH XÁC:
 * 1. Khách ĐÃ LIÊN KẾT LINK: Dựa đúng vào link/ID hội thoại đã gán, lấy đúng customer trong cuộc trò chuyện đó
 *    và tra cứu đơn POS của đúng SĐT / ID khách hàng đó, TUYỆT ĐỐI KHÔNG fuzzy match bừa bãi.
 * 2. Khách CHƯA LIÊN KẾT: Hiển thị trạng thái "Chưa liên kết Zalo" và nút mở bảng chọn khách Zalo đang inbox.
 * 3. HỘP THƯ CHAT ZALO CỌC: Chuyên lọc danh sách các khách Zalo CHƯA CÓ ĐƠN POS (khách chưa cọc)
 *    để người dùng theo dõi và gửi nhanh tin nhắn cọc /coc qua Pancake API chỉ với 1 chạm.
 */

import { parsePancakeContact } from './pancakeDeepLink';
import { getShortId } from './core';
import { registerCustomerAvatar, isGhostZeroPriceItem } from '../store';
import { getOrderPushSettings } from './orderPushSettings';
import { pushOrderDirectlyFromBrowser, pushOrderToCustomApi } from './pancakeDirectPush';

export interface PancakeOrderInfo {
  id: number | string;
  orderNumber?: string;
  status: number;
  statusText: string;
  partnerName?: string;
  partnerStatus?: string;
  partnerStatusText?: string;
  trackingCode?: string;
  totalPrice: number;
  totalQuantity?: number;
  billFullName: string;
  billPhoneNumber: string;
  billAddress: string;
  insertedAt: string;
  updatedAt?: string;
  items?: { name: string; quantity: number; price: number }[];
  note?: string;
  isSuccess?: boolean;
}

export interface PancakeCustomerInsight {
  matchedName: string;
  matchedPhone?: string;
  matchedAddress?: string;
  pancakeConvUrl?: string;
  pancakePageId?: string;
  pancakeConvId?: string;
  pageName?: string;
  totalOrdersCount: number;
  totalSpent: number;
  purchasedAmount?: number;
  succeedOrderCount?: number;
  returnedOrderCount?: number;
  isReturningCustomer: boolean; // Khách quen (>= 2 đơn trên POS)
  customerBadge: 'REGULAR' | 'NEW' | 'VIP'; // REGULAR = Khách quen, NEW = Khách mới
  latestOrder?: PancakeOrderInfo;
  ordersHistory?: PancakeOrderInfo[];
  successfulOrders?: PancakeOrderInfo[];
  confidence: 'linked_exact' | 'pos_exact' | 'manual';
  matchedAt: number;
}

export interface ZaloInboxTag {
  id?: string | number;
  text?: string;
  name?: string;
  color?: string;
}

export interface ZaloInboxConversation {
  id: string;
  pageId: string;
  pageName: string;
  name: string;
  avatarUrl?: string;
  customerId?: string;
  fbId?: string;
  snippet?: string;
  unreadCount: number;
  updatedAt: string;
  updatedTimestamp: number;
  deepLink: string;
  isGroup: boolean;
  platform?: string;
  phone?: string;
  address?: string;
  tags: ZaloInboxTag[];
  isStranger: boolean;
  isReceived?: boolean;
  hasShippingTag: boolean;
  isNewCustomerNoOrder: boolean; // Khách người lạ CHƯA CÓ tag vận đơn (đang chờ cọc)
  ordersCount: number;
  latestOrder?: PancakeOrderInfo;
}

/**
 * Parse thời gian từ Pancake API chuẩn xác (xử lý múi giờ UTC -> Việt Nam UTC+7)
 */
export function parsePancakeTimestamp(timeStr?: string): number {
  if (!timeStr) return 0;
  try {
    let clean = timeStr.trim();
    // Nếu chuỗi là định dạng "YYYY-MM-DD HH:mm:ss" không có timezone, Pancake trả về là giờ UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(clean) && !clean.includes('Z') && !clean.includes('+')) {
      clean = clean.replace(' ', 'T') + 'Z';
    }
    const d = new Date(clean);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

/**
 * Định dạng thời gian hiển thị thân thiện theo giờ Việt Nam
 */
export function formatPancakeTime(timestamp: number): { time: string; date: string; full: string } {
  if (!timestamp) return { time: '', date: '', full: '' };
  const d = new Date(timestamp);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return { time, date, full: `${time} ${date}` };
}

/**
 * Kiểm tra tag có phải là tag [Đã nhận] (đã mua & nhận hàng thành công) không
 */
export function isReceivedTag(t: any): boolean {
  if (!t) return false;
  if (t === -3 || t === 3 || t === '-3' || t === '3') return true;
  const tagText = (typeof t === 'string' ? t : (t.text || t.name || t.label || '')).toLowerCase().trim();
  return tagText.includes('đã nhận') || 
         tagText.includes('da nhan') || 
         tagText.includes('giao thành công') || 
         tagText.includes('giao thanh cong') ||
         tagText.includes('thành công') ||
         tagText.includes('hoàn thành');
}

/**
 * Kiểm tra tag có phải là tag Người lạ không
 */
export function isStrangerTag(t: any): boolean {
  if (!t) return false;
  const tagText = (typeof t === 'string' ? t : (t.text || t.name || t.label || '')).toLowerCase().trim();
  return tagText.includes('người lạ') || tagText.includes('nguoi la');
}

/**
 * Kiểm tra tin nhắn có phải thông báo tự động / tin rác hệ thống Zalo không
 */
export function isZaloSystemNotification(snippet?: string): boolean {
  if (!snippet) return false;
  const s = snippet.toLowerCase().trim();
  return s.includes('sinh nhật của') || 
         s.includes('sinh nhat cua') || 
         s.includes('hãy gửi lời chúc') || 
         s.includes('hay gui loi chuc') || 
         s.includes('chúc tốt đẹp') ||
         s.includes('chúc mừng sinh nhật') ||
         s.includes('chuc mung sinh nhat') ||
         s.includes('thời tiết hôm nay') ||
         s.includes('zalo official account') ||
         s.includes('đã thêm bạn từ danh bạ') ||
         s.includes('[system message]') ||
         s.includes('tin nhắn từ hệ thống') ||
         s.includes('gửi lời chúc') ||
         s.includes('tổng hợp mẫu') ||
         s.includes('tong hop mau') ||
         s.includes('kho sỉ') ||
         s.includes('kho si') ||
         s.includes('tuyển sỉ') ||
         s.includes('tuyen si') ||
         s.includes('chuyên sỉ') ||
         s.includes('chuyen si') ||
         s.includes('mẫu mới về') ||
         s.includes('mau moi ve') ||
         s.includes('sỉ inbox') ||
         s.includes('si inbox') ||
         s.startsWith('[link] 🔥') ||
         s.startsWith('[link] 💥');
}

/**
 * Kiểm tra tag có phải là tag Vận đơn / Đơn hàng / Đã nhận không
 */
export function isShippingOrOrderTag(t: any): boolean {
  if (!t) return false;
  const tagText = (typeof t === 'string' ? t : (t.text || t.name || t.label || '')).toLowerCase().trim();
  if (!tagText) return false;
  
  const keywords = [
    'đã nhận', 'da nhan',
    'nhận hàng', 'nhan hang',
    'đang giao', 'dang giao',
    'chờ giao', 'cho giao',
    'giao thành công', 'giao thanh cong',
    'thành công', 'thanh cong',
    'đã gửi', 'da gui',
    'gửi hàng', 'gui hang',
    'đang ship', 'dang ship',
    'đã ship', 'da ship',
    'ship',
    'vận đơn', 'van don',
    'đã tạo đơn', 'da tao don',
    'tạo đơn', 'tao don',
    'đơn hàng', 'don hang',
    'đã in', 'da in',
    'in bill',
    'đóng gói', 'dong goi',
    'hoàn tất', 'hoan tat',
    'hoàn thành', 'hoan thanh',
    'đã cọc', 'da coc',
    'đã ck', 'da thanh toan', 'đã thanh toán',
    'đang phát', 'dang phat',
    'đối soát', 'doi soat'
  ];
  return keywords.some(kw => tagText.includes(kw));
}

export interface PancakeSyncStats {
  pagesCount?: number;
  conversationsCount?: number;
  ordersCount?: number;
  linkedCustomersCount?: number;
  pages?: { id: string; name: string; platform: string }[];
  shops?: { id: number; name: string }[];
  totalConversations?: number;
  totalPosOrders?: number;
  matchedCustomersCount?: number;
  regularCustomersCount?: number;
  newCustomersCount?: number;
  deliveringOrdersCount?: number;
  lastSyncTimestamp?: number;
  lastSyncTime?: number;
}

export const DEFAULT_PANCAKE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSWFtaGllbiBoaWVucGhhbTIuMCIsImV4cCI6MTc5Njg4MjYxMiwiYXBwbGljYXRpb24iOjEsInVpZCI6ImI5Y2IyMzQwLTRlMWItNGQ4NS05YWMyLTAxMjRiYjJkOTFlYyIsInNlc3Npb25faWQiOiI4OTFhNTAyMC02ZjU4LTRhMjMtOWVjNi0wNTZkMWU0NGM2ZjAiLCJpYXQiOjE3ODkxMDY2MTIsInBhbmNha2VfaWQiOiI3MTdkMjIwNS0wN2NkLTQxN2YtOGNlZi1hZmNlODgwODgwMzQiLCJmYl9pZCI6IjE0NTkyNjMxMTQ2ODI1NCIsImxvZ2luX3Nlc3Npb24iOm51bGwsImZiX25hbWUiOiJJYW1oaWVuIGhpZW5waGFtMi4wIn0.NABY5AILX_Bhy0ijUQc6o852SYPwnEjClqcFuPLAF-4";

// Tin nhắn mẫu cọc chuẩn của shop trong Pancake (/coc)
export const PANCAKE_COC_MESSAGE_PART1 = `💥💥💥ship ninh thuận 15k, toàn quốc 20k , shop không đồng kiểm \n👉👉👉hoặc đặt đơn  xong ghé lấy đều được ạ 62/79 bạch đằng, phường đông hải \nTrưa Từ 12h30 đến 4h chiều mỗi ngày ❤️\nBên e đi đơn từ 2c ạ\n👉👉👉khách có đơn cọc 50k or 100k giúp e\n💥💥💥Lưu ý khách đi đơn 1c ship 25k`;

export const PANCAKE_COC_MESSAGE_PART2 = `Em gửi thông tin ngân hàng ạ\n___________________________\nNgân hàng Liobank \nStk: 67896896\nTên Tk: Huỳnh ngọc Vũ\n----\nKhách chuyển khoản xong .gửi em ảnh Bill và nick tiktok/shopee em cảm ơn ạ`;

const TOKEN_KEY = "slp_pancake_access_token";
const INSIGHTS_CACHE_KEY = "slp_pancake_customer_insights";
const STATS_CACHE_KEY = "slp_pancake_sync_stats";
const ZALO_INBOX_CACHE_KEY = "slp_zalo_inbox_cache";

export function getPancakeToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return DEFAULT_PANCAKE_TOKEN;
}

export function setPancakeToken(token: string) {
  try {
    if (!token || !token.trim()) {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, token.trim());
    }
  } catch {}
}

export function removeVietnameseAccents(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeCustomerName(text: string): string {
  if (!text) return "";
  let normalized = text.normalize("NFKD");
  normalized = removeVietnameseAccents(normalized);
  return normalized.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Trả về nhãn trạng thái đơn hàng thân thiện
 */
export function getOrderStatusLabel(status: number): { text: string; color: string; bg: string; border: string } {
  switch (status) {
    case 0:
      return { text: "Mới tạo", color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-500/30" };
    case 1:
      return { text: "Chờ xác nhận", color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-500/30" };
    case 2:
      return { text: "Đang chuẩn bị", color: "text-blue-400", bg: "bg-blue-950/40", border: "border-blue-500/30" };
    case 3:
      return { text: "Đã gửi hàng", color: "text-indigo-400", bg: "bg-indigo-950/40", border: "border-indigo-500/30" };
    case 4:
      return { text: "Thành công", color: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-500/30" };
    case 5:
      return { text: "Đã huỷ", color: "text-red-400", bg: "bg-red-950/40", border: "border-red-500/30" };
    case 6:
      return { text: "Chờ chuyển khoản", color: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-500/30" };
    case 7:
    case 8:
      return { text: "Chuyển hoàn", color: "text-rose-400", bg: "bg-rose-950/40", border: "border-rose-500/30" };
    default:
      return { text: "Đang xử lý", color: "text-gray-400", bg: "bg-gray-800/40", border: "border-gray-600/30" };
  }
}

/**
 * Trả về nhãn vận chuyển từ đối tác (SPX, GHN, GHTK, ViettelPost...)
 */
export function getPartnerStatusLabel(partnerStatus?: string): { text: string; color: string } {
  if (!partnerStatus) return { text: "", color: "" };
  const s = partnerStatus.toLowerCase();
  if (s.includes("delivered") || s.includes("success") || s.includes("giao thanh cong")) {
    return { text: "Giao thành công", color: "text-emerald-400" };
  }
  if (s.includes("delivering") || s.includes("in_transit") || s.includes("dang giao")) {
    return { text: "Đang giao hàng", color: "text-cyan-400" };
  }
  if (s.includes("picked_up") || s.includes("lay hang")) {
    return { text: "Đã lấy hàng", color: "text-blue-400" };
  }
  if (s.includes("returning") || s.includes("returned")) {
    return { text: "Đang hoàn về", color: "text-rose-400" };
  }
  return { text: partnerStatus, color: "text-gray-300" };
}

let memoryInsightsCache: Record<string, PancakeCustomerInsight> | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === INSIGHTS_CACHE_KEY) {
      memoryInsightsCache = null;
    }
  });
}

export function getCustomerInsightsCache(): Record<string, PancakeCustomerInsight> {
  if (memoryInsightsCache) return memoryInsightsCache;
  try {
    const raw = localStorage.getItem(INSIGHTS_CACHE_KEY);
    if (raw) {
      memoryInsightsCache = JSON.parse(raw) || {};
      return memoryInsightsCache!;
    }
  } catch {}
  memoryInsightsCache = {};
  return memoryInsightsCache;
}

export function saveCustomerInsightsCache(insights: Record<string, PancakeCustomerInsight>) {
  memoryInsightsCache = insights;
  try {
    localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify(insights));
    window.dispatchEvent(new CustomEvent("pancake_insights_updated", { detail: insights }));
  } catch {}
}

export function getPancakeSyncStats(): PancakeSyncStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function savePancakeSyncStats(stats: PancakeSyncStats) {
  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats));
  } catch {}
}

/**
 * Lấy insight của khách hàng:
 * CHỈ TRẢ VỀ nếu khách ĐÃ ĐƯỢC LIÊN KẾT link hoặc xác thực chính xác!
 */
export function getCustomerInsight(userName: string): PancakeCustomerInsight | null {
  if (!userName) return null;
  const cache = getCustomerInsightsCache();
  const clean = userName.trim();
  if (cache[clean]) return cache[clean];
  return null;
}

/**
 * Kiểm tra xem một số điện thoại có phải số của shop không (tránh lấy nhầm số chủ shop)
 */
export function isShopPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const d = String(phone).replace(/\D/g, '');
  return d.endsWith('965286096') || d.endsWith('937789496');
}

/**
 * Trích xuất pageId và convId từ Pancake Link (hỗ trợ cả web pages.fm, pancake.vn và deep link từ app Pancake)
 */
export function parsePancakeUrlIds(url: string): { pageId?: string; convId?: string; phone?: string } {
  if (!url) return {};
  try {
    let clean = url.trim();
    let pageId: string | undefined;
    let convId: string | undefined;
    let phone: string | undefined;

    // 0a. Nếu clean là Conversation ID Zalo (pzl_u_... hoặc pzl_g_...)
    if (/^pzl_[ug]_[0-9]+_[0-9]+/.test(clean)) {
      convId = clean;
      const pzMatch = clean.match(/pzl_[ug]_([0-9]+)_/);
      pageId = pzMatch && pzMatch[1] ? `pzl_${pzMatch[1]}` : 'pzl_2007152536191688636';
      return { pageId, convId };
    }

    // 0b. Nếu clean là Conversation ID Facebook dạng pageId_senderId hoặc fb_pageId_senderId
    const fbConvMatch = clean.match(/^(?:fb_)?([0-9]{10,})_([0-9]{10,})$/);
    if (fbConvMatch) {
      pageId = fbConvMatch[1];
      convId = `${fbConvMatch[1]}_${fbConvMatch[2]}`;
      return { pageId, convId };
    }

    // 0c. Nếu clean là Số điện thoại Việt Nam (loại trừ số chủ shop)
    const cleanDigits = clean.replace(/\D/g, '');
    if ((cleanDigits.length === 10 && cleanDigits.startsWith('0')) || (cleanDigits.length === 11 && cleanDigits.startsWith('84')) || (cleanDigits.length === 9 && !clean.includes('/'))) {
      const std = cleanDigits.startsWith('84') ? '0' + cleanDigits.slice(2) : (cleanDigits.length === 9 ? '0' + cleanDigits : cleanDigits);
      if (!isShopPhone(std)) {
        return { phone: std };
      }
      return {};
    }

    // 1. Thử parse qua query parameters
    try {
      const urlObj = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
      if (urlObj.searchParams.has('page_id')) pageId = urlObj.searchParams.get('page_id') || undefined;
      if (!pageId && urlObj.searchParams.has('pageId')) pageId = urlObj.searchParams.get('pageId') || undefined;
      if (!pageId && urlObj.searchParams.has('p_id')) pageId = urlObj.searchParams.get('p_id') || undefined;
      if (!pageId && urlObj.searchParams.has('mailbox_id')) pageId = urlObj.searchParams.get('mailbox_id') || undefined;
      if (!pageId && urlObj.searchParams.has('asset_id')) pageId = urlObj.searchParams.get('asset_id') || undefined;

      if (urlObj.searchParams.has('c_id')) convId = urlObj.searchParams.get('c_id') || undefined;
      if (!convId && urlObj.searchParams.has('conversation_id')) convId = urlObj.searchParams.get('conversation_id') || undefined;
      if (!convId && urlObj.searchParams.has('conv_id')) convId = urlObj.searchParams.get('conv_id') || undefined;
      if (!convId && urlObj.searchParams.has('cid')) convId = urlObj.searchParams.get('cid') || undefined;
      if (!convId && urlObj.searchParams.has('selected_item_id')) convId = urlObj.searchParams.get('selected_item_id') || undefined;
      if (urlObj.searchParams.has('phone')) phone = urlObj.searchParams.get('phone') || undefined;
    } catch {}

    // 2. Pattern 1: https://pages.fm/:pageId/inbox?c_id=:convId hoặc https://pages.fm/:pageId/conversations/:convId
    const matchPagesFm = clean.match(/(?:pages\.fm|pancake\.vn)\/([a-zA-Z0-9_.-]+)\/(?:inbox|conversations|c)(?:\/([a-zA-Z0-9_.-]+))?/i);
    if (matchPagesFm) {
      if (!['inbox', 'conversations', 'pages', 'settings', 'p'].includes(matchPagesFm[1])) {
        if (!pageId) pageId = matchPagesFm[1];
      }
      if (matchPagesFm[2] && !convId) {
        convId = matchPagesFm[2];
      }
    }

    // Pattern 1b: https://pancake.vn/:pageId?c_id=:convId hoặc https://pages.fm/:pageId?c_id=:convId
    if (!pageId) {
      const matchDirectPage = clean.match(/(?:pages\.fm|pancake\.vn)\/([a-zA-Z0-9_.-]+)(?:\?|$|\/)/i);
      if (matchDirectPage && !['inbox', 'conversations', 'pages', 'settings', 'p'].includes(matchDirectPage[1])) {
        pageId = matchDirectPage[1];
      }
    }

    // 3. Pattern Meta Business Suite / Facebook Inbox
    if (!convId) {
      const matchMetaItem = clean.match(/[?&]selected_item_id=([a-zA-Z0-9_.-]+)/i);
      if (matchMetaItem) convId = matchMetaItem[1];
    }
    if (!pageId) {
      const matchMetaPage = clean.match(/[?&](?:mailbox_id|asset_id|page_id)=([0-9]+)/i);
      if (matchMetaPage) pageId = matchMetaPage[1];
    }

    // 4. Pattern Facebook Messenger links: facebook.com/messages/t/:id hoặc m.me/:id
    const matchFbMessenger = clean.match(/(?:facebook\.com\/messages\/t|m\.me)\/([a-zA-Z0-9_.-]+)/i);
    if (matchFbMessenger) {
      if (!convId) convId = matchFbMessenger[1];
    }

    // 5. Pattern Pancake App deep links: pancake://pages/:pageId/conversations/:convId
    const matchDeep = clean.match(/pancake:\/\/(?:pages\/([a-zA-Z0-9_.-]+)\/)?(?:conversations|inbox)\/([a-zA-Z0-9_.-]+)/i);
    if (matchDeep) {
      if (matchDeep[1] && !pageId) pageId = matchDeep[1];
      if (matchDeep[2] && !convId) convId = matchDeep[2];
    }

    // 6. Pattern: /conversations/:convId hoặc /inbox/:convId
    const matchConv = clean.match(/(?:conversations|inbox|c)\/([a-zA-Z0-9_.-]+)/i);
    if (matchConv && !convId) {
      convId = matchConv[1];
    }

    // 7. Pattern: c_id parameter fallback
    if (!convId) {
      const matchCId = clean.match(/[?&](?:c_id|conversation_id|conv_id|cid)=([a-zA-Z0-9_.-]+)/i);
      if (matchCId) convId = matchCId[1];
    }

    // 8. Pattern: page_id parameter fallback
    if (!pageId) {
      const matchPage = clean.match(/[?&](?:page_id|pageId|p_id)=([a-zA-Z0-9_.-]+)/i);
      if (matchPage) pageId = matchPage[1];
    }

    // 9. Nếu convId có dạng pageId_senderId hoặc fb_pageId_senderId (Facebook Messenger Pancake format)
    if (convId) {
      if (convId.startsWith('fb_')) {
        const afterFb = convId.slice(3);
        const parts = afterFb.split('_');
        if (parts.length >= 2 && /^\d{10,}$/.test(parts[0])) {
          pageId = parts[0];
          convId = afterFb; // normalize without fb_ prefix
        }
      } else if (convId.includes('_')) {
        const parts = convId.split('_');
        if (parts.length >= 2 && /^\d{10,}$/.test(parts[0])) {
          // parts[0] luôn là Page ID chuẩn xác nhất thay thế mọi slug như phamngochienshop
          pageId = parts[0];
        }
      }
    }

    if (pageId === 'phamngochienshop') {
      pageId = '100546631959960';
    }

    // 10. Nếu convId thuộc Zalo (pzl_u_{PAGE_ID}_{USER_ID})
    if (convId && convId.startsWith('pzl_')) {
      const pzMatch = convId.match(/pzl_[ug]_([0-9]+)_/);
      if (pzMatch && pzMatch[1]) {
        pageId = `pzl_${pzMatch[1]}`;
      }
    }

    return { pageId, convId, phone };
  } catch {}
  return {};
}

/**
 * Gửi tin nhắn cọc /coc tự động qua Pancake API tới khách hàng
 */
export async function sendPancakeDepositMessage(
  pageId: string,
  convId: string,
  customToken?: string
): Promise<{ success: boolean; message?: string }> {
  const token = (customToken || getPancakeToken()).trim();
  try {
    // 1. Gửi tin nhắn phần 1: Chính sách cọc & quy định ship
    const res1 = await fetch(`/api/pancake/pages/${pageId}/conversations/${convId}/messages?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: PANCAKE_COC_MESSAGE_PART1 })
    });

    // 2. Gửi tin nhắn phần 2: Thông tin tài khoản cọc Liobank
    const res2 = await fetch(`/api/pancake/pages/${pageId}/conversations/${convId}/messages?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: PANCAKE_COC_MESSAGE_PART2 })
    });

    if (res1.ok || res2.ok) {
      return { success: true, message: "Đã gửi thông tin cọc cho khách thành công!" };
    }
    return { success: false, message: "Không thể gửi tin nhắn qua Pancake. Vui lòng kiểm tra quyền token." };
  } catch (err: any) {
    return { success: false, message: err?.message || "Lỗi kết nối khi gửi tin nhắn" };
  }
}

/**
 * Gửi tin nhắn văn bản tùy chỉnh qua Zalo / Pancake API tới khách hàng
 */
export async function sendPancakeCustomMessage(
  pageId: string,
  convId: string,
  messageText: string,
  customToken?: string
): Promise<{ success: boolean; message?: string }> {
  if (!messageText || !messageText.trim()) {
    return { success: false, message: "Nội dung tin nhắn không được để trống" };
  }
  const token = (customToken || getPancakeToken()).trim();
  try {
    const res = await fetch(`/api/pancake/pages/${pageId}/conversations/${convId}/messages?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageText.trim() })
    });
    if (res.ok) {
      return { success: true, message: "Đã gửi tin nhắn thành công!" };
    }
    const data = await res.json().catch(() => null);
    return { success: false, message: data?.message || data?.error || "Không thể gửi tin nhắn qua Zalo/Pancake" };
  } catch (err: any) {
    return { success: false, message: err?.message || "Lỗi kết nối khi gửi tin nhắn" };
  }
}

/**
 * Nhận diện chính xác Trang / Tài khoản Zalo trên Pancake (Bỏ qua hoàn toàn Facebook/Instagram)
 */
export function isZaloPage(p: any): boolean {
  if (!p) return false;
  const platform = String(p.platform || p.platform_type || p.service || '').toLowerCase().trim();
  const id = String(p.id || '').toLowerCase().trim();

  // BỎ QUA NGAY LẬP TỨC các trang Facebook, Instagram, Shopee, Lazada
  if (
    platform === 'facebook' || 
    platform === 'fb' || 
    platform === 'page' || 
    platform === 'instagram' || 
    platform === 'ig' ||
    platform === 'shopee' ||
    platform === 'lazada'
  ) {
    return false;
  }

  // Nếu ID là chuỗi số thuần túy (ID Fanpage Facebook như 145926311468254) -> BỎ QUA
  if (/^\d+$/.test(id)) {
    return false;
  }

  // 1. Zalo cá nhân / Zalo OA có platform là zalo hoặc personal_zalo
  if (platform.includes('zalo') || platform.includes('pzl')) {
    return true;
  }

  // 2. ID Zalo cá nhân trên Pancake luôn có tiền tố pzl_ hoặc zalo_
  if (id.startsWith('pzl_') || id.startsWith('zalo_') || id.startsWith('pzl')) {
    return true;
  }

  return false;
}

/**
 * Tải danh sách khách Zalo đang Inbox mới nhất từ Pancake Pages siêu tốc
 * và CHỈ LỌC KHÁCH CHƯA CÓ ĐƠN POS / CHƯA CÓ TAG VẬN ĐƠN (Khách chờ cọc)
 */
export async function fetchRecentZaloConversations(
  customToken?: string,
  platform?: string
): Promise<{ 
  conversations: ZaloInboxConversation[]; 
  unpaidConversations: ZaloInboxConversation[]; // Khách chưa có đơn POS (chờ cọc)
  pages: any[]; 
  shops: any[] 
}> {
  try {
    const token = (customToken || getPancakeToken()).trim();
    const platParam = platform ? `&platform=${encodeURIComponent(platform)}` : '';

    let zaloPages: any[] = [];
    let rawConversations: any[] = [];
    let posOrders: any[] = [];
    let shops: any[] = [];

  // 1. Gọi song song API Conversations Fast + POS Shops/Orders để tốc độ đạt tối đa (< 300ms)
  try {
    const [fastRes, shopsRes] = await Promise.all([
      fetch(`/api/pancake/conversations-fast?token=${encodeURIComponent(token)}${platParam}`).catch(() => null),
      fetch(`/api/pancake/shops?token=${encodeURIComponent(token)}`).catch(() => null)
    ]);

    if (fastRes && fastRes.ok) {
      const fastData = await fastRes.json();
      zaloPages = fastData.pages || [];
      rawConversations = fastData.conversations || [];
    }

    if (shopsRes && shopsRes.ok) {
      const sData = await shopsRes.json();
      shops = sData.shops || [];
      // Lấy song song orders của các shop
      const orderPromises = shops.map(async (s) => {
        try {
          const ordRes = await fetch(`/api/pancake/shops/${s.id}/orders?token=${encodeURIComponent(token)}&page_size=60&page_number=1`);
          if (ordRes.ok) {
            const oData = await ordRes.json();
            return oData.data || [];
          }
        } catch {}
        return [];
      });
      const orderResults = await Promise.all(orderPromises);
      posOrders = orderResults.flat();
    }
  } catch (err) {
    console.warn("Lỗi fetch Zalo Fast:", err);
  }

  // Fallback: nếu fast endpoint không có dữ liệu, dùng phương thức quét tuần tự hoặc gọi trực tiếp Pancake API
  if (rawConversations.length === 0 && zaloPages.length === 0) {
    try {
      let pagesRes = await fetch(`/api/pancake/pages?token=${encodeURIComponent(token)}`).catch(() => null);
      if (!pagesRes || !pagesRes.ok) {
        // Fallback trực tiếp tới Pancake Pages API
        pagesRes = await fetch(`https://pages.fm/api/v1/pages?access_token=${encodeURIComponent(token)}`).catch(() => null);
      }
      if (pagesRes && pagesRes.ok) {
        const pData = await pagesRes.json();
        const allActivated: any[] = [
          ...(pData.categorized?.personal_zalo || []),
          ...(pData.categorized?.zalo || []),
          ...(pData.categorized?.zalo_oa || []),
          ...(pData.categorized?.activated || []),
          ...(pData.pages || []),
          ...(pData.data || [])
        ];
        const pageMap = new Map<string, any>();
        allActivated.forEach(p => {
          if (p && p.id && !pageMap.has(p.id) && isZaloPage(p)) {
            pageMap.set(p.id, p);
          }
        });
        zaloPages = Array.from(pageMap.values());
      }
    } catch {}

    const convPromises = zaloPages.map(async (p) => {
      try {
        const queryUrls = [
          `/api/pancake/pages/${p.id}/conversations?token=${encodeURIComponent(token)}&type=INBOX&page_size=100`,
          `/api/pancake/pages/${p.id}/conversations?token=${encodeURIComponent(token)}&page_size=100`,
          `https://pages.fm/api/v1/pages/${p.id}/conversations?access_token=${encodeURIComponent(token)}&type=INBOX&page_size=100`,
          `https://pages.fm/api/v1/pages/${p.id}/conversations?access_token=${encodeURIComponent(token)}&page_size=100`
        ];
        const resList = await Promise.all(queryUrls.map(u => fetch(u).catch(() => null)));
        const pageConvs: any[] = [];
        const seen = new Set<string>();
        for (const r of resList) {
          if (r && r.ok) {
            const cData = await r.json();
            const arr = cData.conversations || cData.data || [];
            arr.forEach((c: any) => {
              if (c && c.id && !seen.has(c.id)) {
                seen.add(c.id);
                pageConvs.push({ ...c, _page_id: p.id, _page_name: p.name });
              }
            });
          }
        }
        return pageConvs;
      } catch {}
      return [];
    });
    const results = await Promise.all(convPromises);
    rawConversations = results.flat();
  }

  // 2. Chuyển đổi và lọc dữ liệu
  const allConversations: ZaloInboxConversation[] = [];

  for (const c of rawConversations) {
    let pageId = c._page_id || c.page_id || (zaloPages[0]?.id || "");
    // Chuẩn hóa pageId theo conversation ID của Zalo
    const pMatch = String(c.id || '').match(/pzl_[ug]_([0-9]+)_/);
    if (pMatch && pMatch[1]) {
      pageId = `pzl_${pMatch[1]}`;
    }
    const pageName = c._page_name || (zaloPages.find(p => p.id === pageId)?.name || 'Zalo Cá Nhân');
    // Ưu tiên phonebook_name (tên danh bạ Zalo, ví dụ "Chồng")
    const fromName = c.from?.phonebook_name || c.customers?.[0]?.phonebook_name || c.from?.name || c.customers?.[0]?.name || "Khách Zalo";
    const custId = c.customers?.[0]?.id || "";
    const fbId = c.from?.id || c.customers?.[0]?.fb_id || "";
    
    // Kiểm tra nền tảng Facebook vs Zalo
    const isFb = c.platform === 'facebook' || (!String(pageId).startsWith('pzl_') && /^\d{10,}$/.test(String(pageId)));
    
    // Nếu yêu cầu chỉ lấy Zalo mà là Facebook -> bỏ qua
    if (platform === 'zalo' && isFb) continue;
    // Nếu yêu cầu chỉ lấy Facebook mà không phải Facebook -> bỏ qua
    if (platform === 'facebook' && !isFb) continue;

    // 1. Lọc tài khoản hệ thống Zalo / FB
    const lowerName = fromName.toLowerCase().trim();
    if (lowerName === 'zalo' || lowerName.includes('hệ thống') || lowerName.includes('thông báo zalo') || (fbId && fbId.toLowerCase() === 'zalo')) {
      continue;
    }

    // 2. Chỉ bỏ qua nhóm chat (Group chat) nếu đúng là nhóm
    const isGroup = c.type === 'GROUP' || c.from?.is_group === true || (fbId && fbId.startsWith('pzl_g_')) || (c.id && c.id.startsWith('pzl_g_')) || (c.snippet && c.snippet.includes('zalo.me/g/')) || lowerName.startsWith('lớp ') || lowerName.startsWith('nhóm ');
    if (isGroup) {
      continue;
    }

    // 3. Kiểm tra tin nhắn báo đơn / mã đơn tự động / tin rác hệ thống Zalo (sinh nhật...)
    const snippetText = (c.snippet || '').toLowerCase().trim();
    const isSystemMsg = isZaloSystemNotification(snippetText) || isZaloSystemNotification(c.snippet);
    if (isSystemMsg) {
      continue;
    }

    const updatedAt = c.updated_at || "";
    const updatedTimestamp = parsePancakeTimestamp(updatedAt);
    // Định dạng deep link chuẩn mở trực tiếp App Pancake / Pages.fm
    const deepLink = `https://pages.fm/${pageId}/inbox?c_id=${c.id}`;
    const phone = c.recent_phone_numbers?.[0]?.phone_number || c.customers?.[0]?.phone_number || "";

    // Trích xuất tags thực tế từ Pancake
    const rawTags: any[] = Array.isArray(c.tags) ? c.tags : (Array.isArray(c.tag_names) ? c.tag_names : []);
    const tags: ZaloInboxTag[] = rawTags.map((t: any) => {
      if (typeof t === 'string') return { text: t, name: t, color: '#e53e3e' };
      return {
        id: t.id,
        text: t.text || t.name || t.label || '',
        name: t.name || t.text || t.label || '',
        color: t.color || t.tag_color || '#e53e3e'
      };
    });

    // 1. Kiểm tra tag Đã nhận -> gắn cờ để giao diện lọc theo tab, không xóa sổ hoàn toàn
    const hasReceivedTag = c.is_received === true || tags.some(t => isReceivedTag(t)) || rawTags.some(t => isReceivedTag(t));

    // 2. Kiểm tra tag Người lạ chuẩn xác (bao gồm flag từ Pancake API và tag name)
    const hasStrangerTag = c.is_stranger === true || c.from?.is_stranger === true || tags.some(t => isStrangerTag(t)) || rawTags.some(t => isStrangerTag(t));

    // 3. Kiểm tra tag vận đơn / đang giao / tạo đơn / in bill
    const hasShippingTag = tags.some(t => isShippingOrOrderTag(t));

    const hasOrderSnippet = snippetText.includes('đơn hàng :') || 
                            snippetText.includes('don hang :') || 
                            snippetText.includes('giao thành công') || 
                            snippetText.includes('đang giao') || 
                            snippetText.includes('mã vận đơn') || 
                            snippetText.includes('tra cứu đơn');

    // 4. Kiểm tra mã đơn / số bill trong tên khách (ví dụ #021, #845...)
    const hasCodeInName = /#\d+/.test(fromName) || /#\w+/.test(fromName);

    // Đối soát CHÍNH XÁC với đơn POS theo ID khách hàng, SĐT hoặc User ID trong hội thoại
    const userUniqueId = c.id ? c.id.split('_').pop() : '';
    const matchedOrders = posOrders.filter((o) => {
      if (custId && o.customer_id && String(o.customer_id) === String(custId)) return true;
      if (phone && o.bill_phone_number && o.bill_phone_number.trim() === phone.trim()) return true;
      if (c.id && o.conversation_id) {
        if (String(o.conversation_id) === String(c.id)) return true;
        if (userUniqueId && userUniqueId.length >= 8 && String(o.conversation_id).endsWith(userUniqueId)) return true;
      }
      return false;
    });

    const ordersCount = matchedOrders.length;
    
    // Khách chưa có đơn POS (chờ cọc)
    const isNewCustomerNoOrder = !hasShippingTag && !hasOrderSnippet && ordersCount === 0;
    const latestPos = matchedOrders[0];

    const convAvatar = c.from?.avatar_url || c.customers?.[0]?.avatar_url || (fbId ? `https://graph.facebook.com/${fbId}/picture?type=square` : undefined);
    if (fromName && convAvatar) {
      registerCustomerAvatar(fromName, convAvatar, isFb ? 'facebook' : undefined);
    }

    allConversations.push({
      id: c.id,
      pageId: pageId,
      pageName: pageName,
      name: fromName,
      avatarUrl: convAvatar,
      customerId: custId,
      fbId,
      snippet: c.snippet || "",
      unreadCount: c.unread_count || 0,
      updatedAt,
      updatedTimestamp,
      deepLink,
      isGroup,
      platform: isFb ? 'facebook' : 'personal_zalo',
      phone: phone || latestPos?.bill_phone_number || "",
      address: latestPos?.full_address || latestPos?.bill_address || "",
      tags,
      isStranger: hasStrangerTag,
      isReceived: hasReceivedTag,
      hasShippingTag,
      isNewCustomerNoOrder,
      ordersCount,
      latestOrder: latestPos ? {
        id: latestPos.id,
        orderNumber: latestPos.display_id || latestPos.order_number || String(latestPos.id),
        status: latestPos.status,
        statusText: getOrderStatusLabel(latestPos.status).text,
        partnerName: latestPos.partner?.service_partner?.name || latestPos.partner?.name,
        partnerStatus: latestPos.partner?.partner_status,
        partnerStatusText: getPartnerStatusLabel(latestPos.partner?.partner_status).text,
        trackingCode: latestPos.partner?.extend_code || latestPos.tracking_code,
        totalPrice: Number(latestPos.total_price || latestPos.total_cost || 0),
        billFullName: latestPos.bill_full_name || latestPos.customer?.name || fromName,
        billPhoneNumber: latestPos.bill_phone_number || "",
        billAddress: latestPos.full_address || latestPos.bill_address || "",
        insertedAt: latestPos.inserted_at || ""
      } : undefined
    });
  }

  // Sắp xếp hội thoại theo thời gian cập nhật mới nhất
  allConversations.sort((a, b) => b.updatedTimestamp - a.updatedTimestamp);

  // Danh sách các khách CHƯA CÓ ĐƠN (Chờ cọc)
  const unpaidConversations = allConversations.filter(c => c.isNewCustomerNoOrder);

    return {
      conversations: allConversations,
      unpaidConversations,
      pages: zaloPages,
      shops
    };
  } catch (err) {
    console.error("fetchRecentZaloConversations error:", err);
    return {
      conversations: [],
      unpaidConversations: [],
      pages: [],
      shops: []
    };
  }
}

/**
 * Tải tin nhắn chi tiết của một cuộc trò chuyện Zalo/Pancake
 */
export async function fetchConversationMessages(
  pageId: string,
  convId: string,
  customerId?: string,
  customToken?: string
): Promise<any[]> {
  const token = (customToken || getPancakeToken()).trim();
  try {
    const url = `/api/pancake/pages/${pageId}/conversations/${convId}/messages?token=${encodeURIComponent(token)}${customerId ? `&customer_id=${customerId}` : ''}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.messages || [];
    }
  } catch (err) {
    console.error("Lỗi lấy messages:", err);
  }
  return [];
}

/**
 * Đồng bộ insight CHÍNH XÁC cho các khách hàng ĐÃ CÓ link hội thoại
 * Tuyệt đối không fuzzy match lung tung sang khách khác!
 */
export async function syncLinkedCustomersInsights(
  pancakeLinks: Record<string, string>,
  customToken?: string,
  onProgress?: (msg: string) => void
): Promise<Record<string, PancakeCustomerInsight>> {
  const token = (customToken || getPancakeToken()).trim();
  const linkedUsers = Object.entries(pancakeLinks).filter(([_, link]) => !!link && link.trim().length > 0);

  if (linkedUsers.length === 0) {
    onProgress?.("Chưa có khách nào được gán link hội thoại Pancake.");
    return getCustomerInsightsCache();
  }

  onProgress?.(`Đang đồng bộ dữ liệu cho ${linkedUsers.length} khách đã gắn link hội thoại...`);

  const cache = getCustomerInsightsCache();

  // Gọi song song endpoint customer-orders-lookup thông minh
  const promises = linkedUsers.map(async ([userName, link], idx) => {
    try {
      onProgress?.(`Đang kiểm tra đơn hàng khách ${idx + 1}/${linkedUsers.length}: ${userName}...`);
      const insight = await syncSingleCustomerPancakeOrders(userName, 'TIKTOK', link, token);
      if (insight) {
        cache[userName] = insight;
      }
    } catch (err) {
      console.warn(`Lỗi sync khách ${userName}:`, err);
    }
  });

  await Promise.all(promises);
  saveCustomerInsightsCache(cache);

  onProgress?.(`Đã đồng bộ xong dữ liệu cho ${linkedUsers.length} khách hàng.`);
  return cache;
}

/**
 * Hàm đồng bộ thông minh cho PancakeSyncModal
 */
export async function runPancakeSmartSync(
  customers: Record<string, any>,
  nicknames: Record<string, string>,
  customToken?: string,
  onProgress?: (msg: string) => void
): Promise<{
  insights: Record<string, PancakeCustomerInsight>;
  stats: PancakeSyncStats;
  newPancakeLinks: Record<string, string>;
}> {
  const token = customToken || getPancakeToken();
  const linkedUsers: Record<string, string> = {};
  
  // Thu thập các link đã lưu trong cache hoặc store
  const cached = getCustomerInsightsCache();
  for (const [u, data] of Object.entries(cached)) {
    if (data.pancakeConvUrl) {
      linkedUsers[u] = data.pancakeConvUrl;
    }
  }

  const updatedInsights = await syncLinkedCustomersInsights(linkedUsers, token, onProgress);
  
  let regularCount = 0;
  let newCount = 0;
  let deliveringCount = 0;

  for (const ins of Object.values(updatedInsights)) {
    if (ins.isReturningCustomer) regularCount++;
    else newCount++;
    if (ins.latestOrder && [1, 2, 3].includes(ins.latestOrder.status)) deliveringCount++;
  }

  const stats: PancakeSyncStats = {
    totalConversations: Object.keys(updatedInsights).length,
    totalPosOrders: Object.values(updatedInsights).reduce((sum, i) => sum + i.totalOrdersCount, 0),
    matchedCustomersCount: Object.keys(updatedInsights).length,
    regularCustomersCount: regularCount,
    newCustomersCount: newCount,
    deliveringOrdersCount: deliveringCount,
    lastSyncTimestamp: Date.now()
  };

  savePancakeSyncStats(stats);

  return {
    insights: updatedInsights,
    stats,
    newPancakeLinks: {}
  };
}

/**
 * Gợi ý tên chuẩn theo quy tắc: [Tên Zalo] #[ShortId] [Tên TikTok]
 * Ví dụ: "Trâm Huỳnh #463 Thùy Dung 90"
 */
export function generateSuggestedPancakeName(zaloName: string, tiktokUser: string, customShortId?: string): string {
  const cleanZalo = (zaloName || "").trim();
  const cleanTiktok = (tiktokUser || "").trim().replace(/^@+/, '');
  if (!cleanTiktok) return cleanZalo;

  const shortId = customShortId || getShortId(cleanTiktok);
  const tag = `#${shortId} ${cleanTiktok}`;

  if (!cleanZalo) return tag;

  // Tránh lặp lại nếu trong tên Zalo đã có chứa shortId hoặc tên TikTok
  if (cleanZalo.toLowerCase().includes(cleanTiktok.toLowerCase()) || cleanZalo.includes(`#${shortId}`)) {
    return cleanZalo;
  }

  return `${cleanZalo} ${tag}`;
}

/**
 * Cập nhật tên khách hàng / ghi chú hội thoại trên Pancake Pages & POS
 */
export async function updatePancakeCustomerName(params: {
  pageId?: string;
  convId?: string;
  customerId?: string;
  newName: string;
  shopId?: string;
  token?: string;
}): Promise<boolean> {
  try {
    const token = (params.token || getPancakeToken()).trim();
    const res = await fetch('/api/pancake/update-customer-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, token })
    });
    const data = await res.json();
    return Boolean(data && data.success);
  } catch (err) {
    console.warn("Không thể cập nhật tên khách trên Pancake:", err);
    return false;
  }
}

/**
 * Đồng bộ ngay lập tức toàn bộ đơn hàng và thông tin POS cho 1 khách hàng vừa được gán/sửa link Pancake.
 */
export async function syncSingleCustomerPancakeOrders(
  userName: string,
  platform: string,
  link: string,
  customToken?: string
): Promise<PancakeCustomerInsight | null> {
  if (!userName || !link) return null;
  const cleanUser = userName.trim();
  const token = (customToken || getPancakeToken()).trim();
  const { pageId, convId } = parsePancakeUrlIds(link);
  const parsedContact = parsePancakeContact(link);

  try {
    const url = `/api/pancake/customer-orders-lookup?link=${encodeURIComponent(link || '')}&page_id=${encodeURIComponent(pageId || '')}&conv_id=${encodeURIComponent(convId || '')}&phone=${encodeURIComponent(parsedContact.type === 'phone_zalo' ? (parsedContact.phone || '') : '')}&user_name=${encodeURIComponent(cleanUser)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.insight) {
        const rawInsight = data.insight;
        const ordersHistory: PancakeOrderInfo[] = (rawInsight.ordersHistory || []).map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber || String(o.id),
          status: o.status,
          statusText: getOrderStatusLabel(o.status).text,
          partnerName: o.partnerName,
          partnerStatus: o.partnerStatus,
          partnerStatusText: getPartnerStatusLabel(o.partnerStatus).text,
          trackingCode: o.trackingCode,
          totalPrice: Number(o.totalPrice || 0),
          totalQuantity: Number(o.items?.reduce((s: number, it: any) => s + (it.quantity || 1), 0) || 1),
          billFullName: o.billFullName || rawInsight.matchedName || cleanUser,
          billPhoneNumber: o.billPhoneNumber || rawInsight.matchedPhone || "",
          billAddress: o.billAddress || rawInsight.matchedAddress || "",
          insertedAt: o.insertedAt || "",
          updatedAt: o.insertedAt || "",
          items: o.items || [],
          note: o.note || "",
          isSuccess: !!o.isSuccess || o.status === 3 || o.status === 4 || (o.partnerStatus || '').toLowerCase().includes('delivered') || (o.partnerStatus || '').toLowerCase().includes('success')
        }));

        const successfulOrders = ordersHistory.filter(o => o.isSuccess);
        const latestOrder = ordersHistory[0];

        const insight: PancakeCustomerInsight = {
          matchedName: rawInsight.matchedName || latestOrder?.billFullName || cleanUser,
          matchedPhone: rawInsight.matchedPhone || latestOrder?.billPhoneNumber || "",
          matchedAddress: rawInsight.matchedAddress || latestOrder?.billAddress || "",
          pancakeConvUrl: link,
          pancakePageId: rawInsight.pageId || pageId,
          pancakeConvId: rawInsight.conversationId || convId,
          totalOrdersCount: rawInsight.totalOrdersCount || ordersHistory.length,
          totalSpent: rawInsight.purchasedAmount || rawInsight.totalSpent || successfulOrders.reduce((s, o) => s + o.totalPrice, 0),
          purchasedAmount: rawInsight.purchasedAmount || rawInsight.totalSpent || successfulOrders.reduce((s, o) => s + o.totalPrice, 0),
          succeedOrderCount: rawInsight.succeedOrderCount !== undefined ? rawInsight.succeedOrderCount : successfulOrders.length,
          returnedOrderCount: rawInsight.returnedOrderCount !== undefined ? rawInsight.returnedOrderCount : 0,
          isReturningCustomer: (rawInsight.succeedOrderCount >= 2) || (ordersHistory.length >= 2),
          customerBadge: ((rawInsight.succeedOrderCount >= 2) || (ordersHistory.length >= 2)) ? 'REGULAR' : 'NEW',
          latestOrder: latestOrder,
          ordersHistory,
          successfulOrders,
          confidence: 'linked_exact',
          matchedAt: Date.now()
        };

        const cache = getCustomerInsightsCache();
        cache[cleanUser] = insight;
        saveCustomerInsightsCache(cache);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent("pancake_insights_updated", { detail: { user: cleanUser, insight } }));
        }

        return insight;
      }
    }
  } catch (err) {
    console.warn("Lỗi sync customer orders qua server endpoint, thử gọi trực tiếp Pancake:", err);
  }

  // FALLBACK CHO VERCEL HOẶC KHI SERVER ENDPOINT KHÔNG CÓ:
  // Gọi trực tiếp Pancake API từ Browser (Hỗ trợ 100% CORS *)
  try {
    const directInsight = await lookupCustomerOrdersDirectClient(cleanUser, platform, link, token);
    if (directInsight) return directInsight;
  } catch (err) {
    console.warn("Lỗi direct client lookup:", err);
  }

  return null;
}

/**
 * Tra cứu đơn hàng Pancake POS trực tiếp từ Client (hoạt động 100% trên Vercel, Netlify, Static Hosting)
 * Vì pos.pages.fm và pages.fm đều hỗ trợ CORS '*' đầy đủ!
 */
export async function lookupCustomerOrdersDirectClient(
  cleanUser: string,
  platform: string,
  link: string,
  token: string
): Promise<PancakeCustomerInsight | null> {
  try {
    const { pageId: parsedPageId, convId: parsedConvId } = parsePancakeUrlIds(link);
    const parsedContact = parsePancakeContact(link);

    let pageId = parsedPageId;
    let convId = parsedConvId;
    let targetPhone = parsedContact.type === 'phone_zalo' ? parsedContact.phone : '';
    let customerInfo: any = null;
    let convDataObj: any = null;

    // 1. Nếu có conversation ID hoặc URL Pancake, lấy chi tiết conversation trực tiếp từ pages.fm
    if (convId) {
      try {
        if (pageId) {
          const cRes = await fetch(`https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}?access_token=${token}`).catch(() => null);
          if (cRes && cRes.ok) {
            const cData = await cRes.json();
            if (cData && cData.conversation) {
              convDataObj = cData.conversation;
              customerInfo = convDataObj.customers?.[0] || convDataObj.from || null;
            }
          }
        }
      } catch {}
    }

    const custId = customerInfo?.id || "";
    const fromId = convDataObj?.from?.id || "";

    // Xác định số điện thoại khách hàng
    let custPhone = targetPhone || customerInfo?.phone_number || convDataObj?.phone_number || "";
    if (!custPhone && convDataObj?.recent_phone_numbers && Array.isArray(convDataObj.recent_phone_numbers)) {
      const pObj = convDataObj.recent_phone_numbers.find((p: any) => p && p.phone_number);
      if (pObj) custPhone = pObj.phone_number;
    }

    const custName = customerInfo?.name || convDataObj?.from?.name || cleanUser;
    const custAddress = customerInfo?.current_address?.full_address || customerInfo?.full_address || "";

    // 2. Lấy danh sách shop POS và đơn hàng trực tiếp từ pos.pages.fm
    const shopsRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`).catch(() => null);
    if (!shopsRes || !shopsRes.ok) return null;
    const shopsData = await shopsRes.json();
    const shops = shopsData.shops || [];
    if (shops.length === 0) return null;

    // Lấy đơn hàng từ shop (lấy 2 trang gần nhất của shop)
    const orderPromises = shops.slice(0, 2).map(async (s: any) => {
      const pagePromises = [1, 2].map(async (pNum) => {
        try {
          const oRes = await fetch(`https://pos.pages.fm/api/v1/shops/${s.id}/orders?access_token=${token}&page_size=100&page_number=${pNum}`).catch(() => null);
          if (oRes && oRes.ok) {
            const oData = await oRes.json();
            return oData.data || [];
          }
        } catch {}
        return [];
      });
      const resList = await Promise.all(pagePromises);
      return resList.flat();
    });

    const shopOrders = (await Promise.all(orderPromises)).flat();

    // Chuẩn hóa số điện thoại: chỉ lấy các số, lấy 9 số cuối
    const normPhone = (p: string) => {
      const clean = (p || '').replace(/\D/g, '');
      return clean.length >= 9 ? clean.slice(-9) : '';
    };
    const targetPhoneDigits = normPhone(custPhone);

    let userUniqueId = "";
    if (convId) {
      const parts = convId.split('_');
      userUniqueId = parts[parts.length - 1] || "";
    }

    // 3. Khớp đơn hàng chính xác
    const matchedOrders = shopOrders.filter((o: any) => {
      // a. Khớp conversation_id
      if (convId && o.conversation_id) {
        if (String(o.conversation_id) === String(convId)) return true;
        if (userUniqueId && userUniqueId.length >= 8 && String(o.conversation_id).endsWith(userUniqueId)) {
          return true;
        }
      }

      // b. Khớp customer_id
      if (custId && o.customer_id && String(o.customer_id) === String(custId)) {
        return true;
      }
      if (fromId && o.customer?.fb_id && String(o.customer.fb_id) === String(fromId)) {
        return true;
      }

      // c. Khớp SĐT (9 số cuối)
      if (targetPhoneDigits && targetPhoneDigits.length >= 9) {
        const oPhone = normPhone(o.bill_phone_number || o.customer?.phone_number || '');
        if (oPhone && oPhone.length >= 9 && oPhone === targetPhoneDigits) {
          return true;
        }
      }

      return false;
    });

    // Sắp xếp đơn mới nhất lên đầu
    matchedOrders.sort((a: any, b: any) => {
      const tA = new Date(a.inserted_at || a.updated_at || 0).getTime();
      const tB = new Date(b.inserted_at || b.updated_at || 0).getTime();
      return tB - tA;
    });

    const ordersHistory: PancakeOrderInfo[] = matchedOrders.map((o: any) => {
      const rawItems = o.items || o.order_items || o.products || [];
      const items = Array.isArray(rawItems) ? rawItems.map((it: any) => ({
        name: it.variation_info?.name || it.product?.name || it.name || "Sản phẩm",
        quantity: Number(it.quantity || 1),
        price: Number(it.price || it.retail_price || 0)
      })) : [];

      const pStatus = (o.partner?.partner_status || '').toLowerCase();
      const isSuccess = o.status === 3 || o.status === 4 || pStatus.includes('delivered') || pStatus.includes('success') || pStatus.includes('giao thanh cong');

      return {
        id: o.id,
        orderNumber: o.display_id || o.order_number || String(o.id),
        status: o.status,
        statusText: getOrderStatusLabel(o.status).text,
        partnerName: o.partner?.service_partner?.name || o.partner?.name,
        partnerStatus: o.partner?.partner_status,
        partnerStatusText: getPartnerStatusLabel(o.partner?.partner_status).text,
        trackingCode: o.partner?.extend_code || o.tracking_code || o.order_number_vtp,
        totalPrice: Number(o.total_price || o.total_cost || 0),
        totalQuantity: items.reduce((sum: number, it: any) => sum + it.quantity, 0) || 1,
        billFullName: o.bill_full_name || o.customer?.name || custName,
        billPhoneNumber: o.bill_phone_number || custPhone,
        billAddress: o.shipping_address?.full_address || o.full_address || o.bill_address || custAddress,
        insertedAt: o.inserted_at || o.updated_at || "",
        updatedAt: o.inserted_at || o.updated_at || "",
        note: o.note || o.notes || o.customer_notes || "",
        isSuccess,
        items
      };
    });

    const successfulOrders = ordersHistory.filter(o => o.isSuccess);
    const latestOrder = ordersHistory[0] || null;
    const totalSuccessfulSpent = successfulOrders.reduce((sum: number, o: any) => sum + (o.totalPrice || 0), 0);
    const totalSpent = totalSuccessfulSpent > 0 ? totalSuccessfulSpent : ordersHistory.reduce((sum: number, o: any) => sum + (o.totalPrice || 0), 0);
    const succeedOrderCount = successfulOrders.length;
    const totalOrdersCount = ordersHistory.length;
    const isReturningCustomer = (succeedOrderCount >= 2) || (totalOrdersCount >= 2);

    const insight: PancakeCustomerInsight = {
      matchedName: custName || latestOrder?.billFullName || cleanUser,
      matchedPhone: custPhone || latestOrder?.billPhoneNumber || "",
      matchedAddress: custAddress || latestOrder?.billAddress || "",
      pancakeConvUrl: link,
      pancakePageId: pageId,
      pancakeConvId: convId,
      totalOrdersCount,
      totalSpent,
      purchasedAmount: totalSpent,
      succeedOrderCount,
      returnedOrderCount: 0,
      isReturningCustomer,
      customerBadge: isReturningCustomer ? 'REGULAR' : 'NEW',
      latestOrder,
      ordersHistory,
      successfulOrders,
      confidence: 'linked_exact',
      matchedAt: Date.now()
    };

    const cache = getCustomerInsightsCache();
    cache[cleanUser] = insight;
    saveCustomerInsightsCache(cache);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent("pancake_insights_updated", { detail: { user: cleanUser, insight } }));
    }

    return insight;
  } catch (directErr) {
    console.warn("Lỗi tra cứu đơn POS trực tiếp trên client:", directErr);
    return null;
  }
}

export interface PancakeVariation {
  id: string;
  productId?: string;
  name: string;
  productName?: string;
  variationName?: string;
  displayId?: string;
  barcode?: string;
  retailPrice: number;
  remainQuantity?: number | null;
  weight?: number;
}

export interface PushOrderItem {
  id?: string;
  content: string;
  price: number;
  unitPrice?: number;
  totalPrice?: number;
  quantity?: number;
  variationId?: string;
  variationName?: string;
  productName?: string;
  isPast?: boolean;
  createdAt?: number;
}

export interface PushOrderPayload {
  platform: string;
  user: string;
  nickname?: string;
  pancakeLink?: string;
  pageId?: string;
  conversationId?: string;
  items: PushOrderItem[];
  discount?: number;
  shippingFee?: number;
  prepaid?: number;
  tag?: string;
  isGheLay?: boolean;
  isNinhThuan?: boolean;
  ninhThuanTag?: boolean;
  customNote?: string;
  shopId?: number | string;
  sendNotificationMessage?: boolean;
  customCustomerInfo?: {
    name?: string;
    phone?: string;
    address?: string;
    pageId?: string;
    conversationId?: string;
    customerId?: string;
  };
}

export interface PushOrderResult {
  success: boolean;
  message?: string;
  error?: string;
  order?: any;
  messageSent?: boolean;
  messageError?: string;
  conversationId?: string;
  pageId?: string;
}

/**
 * Tải danh sách variations sản phẩm từ Pancake POS
 */
export async function fetchPancakeVariations(shopId?: string | number): Promise<{ success: boolean; variations: PancakeVariation[]; error?: string }> {
  try {
    const token = getPancakeToken();
    const query = new URLSearchParams({ token });
    if (shopId) query.set('shop_id', String(shopId));

    const res = await fetch(`/api/pancake/variations?${query.toString()}`);
    if (!res.ok) return { success: false, variations: [] };
    const data = await res.json();
    if (data.success && Array.isArray(data.variations)) {
      return { success: true, variations: data.variations };
    }
    return { success: false, variations: [], error: data.error || "Không thể lấy danh sách sản phẩm" };
  } catch (err: any) {
    return { success: false, variations: [], error: err.message };
  }
}

/**
 * Tạo nhanh sản phẩm mới trên Pancake POS
 */
export async function createPancakeProduct(name: string, price: number, sku?: string, shopId?: string | number): Promise<{ success: boolean; product?: any; error?: string }> {
  try {
    const token = getPancakeToken();
    const res = await fetch(`/api/pancake/create-product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name, price, sku, shopId })
    });
    if (!res.ok) return { success: false, error: "Lỗi kết nối máy chủ" };
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Gửi tin nhắn trực tiếp vào hội thoại Pancake Pages / Zalo của khách hàng
 */
export async function sendPancakeMessage(
  arg1: string | { pageId?: string; conversationId: string; message: string },
  arg2?: string,
  arg3?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    let pageId = "";
    let conversationId = "";
    let message = "";

    if (typeof arg1 === 'object') {
      pageId = arg1.pageId || "";
      conversationId = arg1.conversationId || "";
      message = arg1.message || "";
    } else {
      pageId = arg1 || "";
      conversationId = arg2 || "";
      message = arg3 || "";
    }

    const token = getPancakeToken();
    const res = await fetch(`/api/pancake/send-message?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pageId, conversationId, message })
    });
    const resText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(resText);
    } catch {}

    if (res.ok && data?.success) {
      return { success: true, message: data.message || "Đã gửi tin nhắn thành công!" };
    }
    return { success: false, error: data?.error || data?.message || `Lỗi máy chủ (${res.status})` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Tra cứu thông tin khách hàng Pancake theo Số điện thoại (Chính xác từ Pancake POS)
 */
export async function lookupCustomerByPhone(phone: string): Promise<{
  success: boolean;
  name?: string;
  phone?: string;
  address?: string;
  customerId?: string;
  conversationId?: string;
  pageId?: string;
  ordersCount?: number;
  totalSpent?: number;
}> {
  try {
    const token = getPancakeToken();
    const cleanDigits = phone.replace(/\D/g, '');
    const stdPhone = cleanDigits.startsWith('84') ? '0' + cleanDigits.slice(2) : cleanDigits;
    if (!stdPhone || stdPhone.length < 9 || isShopPhone(stdPhone)) return { success: false };

    // 1. Tra cứu trực tiếp từ hồ sơ khách hàng Pancake POS
    try {
      const res1 = await fetch(`/api/pancake/customer-by-phone?phone=${encodeURIComponent(stdPhone)}&token=${encodeURIComponent(token)}`);
      if (res1.ok) {
        const data1 = await res1.json();
        if (data1 && data1.success && data1.customer) {
          return {
            success: true,
            name: data1.customer.name || "",
            phone: data1.customer.phone || stdPhone,
            address: data1.customer.address || "",
            customerId: data1.customer.id,
            conversationId: data1.customer.conversation_id,
            pageId: data1.customer.page_id
          };
        }
      }
    } catch {}

    // 2. Tra cứu qua lịch sử đơn hàng và Zalo insight
    const res = await fetch(`/api/pancake/customer-orders-lookup?phone=${encodeURIComponent(stdPhone)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) return { success: false };
    const data = await res.json();
    if (data && data.success && data.insight) {
      return {
        success: true,
        name: data.insight.matchedName || "",
        phone: data.insight.matchedPhone || stdPhone,
        address: data.insight.matchedAddress || "",
        customerId: data.insight.customerId,
        conversationId: data.insight.conversationId,
        pageId: data.insight.pageId,
        ordersCount: data.insight.totalOrdersCount || 0,
        totalSpent: data.insight.totalSpent || 0
      };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

/**
 * Đẩy đơn hàng của khách hàng lên Pancake POS
 */
export async function pushCustomerOrderToPancake(payload: PushOrderPayload): Promise<PushOrderResult> {
  const pushSettings = getOrderPushSettings();

  try {
    let result: PushOrderResult;

    // 1. Chế độ Custom API / Webhook riêng (Vercel API, Make, n8n, Google Apps Script...)
    if (pushSettings.mode === 'custom_api' && pushSettings.customApiUrl?.trim()) {
      result = await pushOrderToCustomApi(payload, pushSettings);
    } 
    // 2. Chế độ Đẩy trực tiếp từ trình duyệt (Client-Side Direct to Pancake POS)
    // Cực kỳ nhanh, không qua server trung gian, không bao giờ bị timeout 504 Vercel!
    else if (pushSettings.mode === 'client_direct') {
      result = await pushOrderDirectlyFromBrowser(payload, pushSettings);
    } 
    // 3. Chế độ Máy chủ Proxy (Server Proxy) với cơ chế Tự động Failover thông minh
    else {
      const token = (pushSettings.pancakeToken || getPancakeToken()).trim();
      const proxyUrl = pushSettings.proxyUrl || '/api/pancake/push-order';
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9500);

        const res = await fetch(`${proxyUrl}?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const resText = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(resText);
        } catch {
          data = null;
        }

        const isServerTimeoutOrError = 
          !res.ok && (
            res.status === 504 || 
            res.status === 502 || 
            res.status === 503 ||
            resText.includes("FUNCTION_INVOCATION_FAILED") ||
            resText.includes("GATEWAY_TIMEOUT")
          );

        if (isServerTimeoutOrError && pushSettings.autoFailoverToClient) {
          console.warn("⚠️ [Failover] Máy chủ phản hồi chậm hoặc timeout Vercel. Tự động chuyển sang Đẩy trực tiếp từ trình duyệt...");
          result = await pushOrderDirectlyFromBrowser(payload, pushSettings);
          if (result.success) {
            result.message = `${result.message || 'Đẩy đơn thành công!'} (Tự động chuyển Đẩy trực tiếp do máy chủ chậm)`;
          }
        } else if (!res.ok || (data && !data.success)) {
          const cleanErr = (resText.includes("FUNCTION_INVOCATION_FAILED") || res.status === 504 || res.status === 502)
            ? "Máy chủ phản hồi chậm hoặc đang xử lý. Bạn có thể bật 'Đẩy trực tiếp từ trình duyệt' trong Cài đặt API Đẩy Đơn để đẩy tức thì!"
            : (data?.error || data?.message || `Lỗi phản hồi máy chủ (${res.status}): ${resText.slice(0, 100)}`);
          result = {
            success: false,
            error: cleanErr
          };
        } else {
          result = {
            success: true,
            message: data?.message || "Tạo đơn trên Pancake POS thành công!",
            order: data?.order,
            messageSent: data?.messageSent,
            messageError: data?.messageError,
            conversationId: data?.conversationId,
            pageId: data?.pageId
          };
        }
      } catch (fetchErr: any) {
        // Nếu fetch bị timeout hoặc lỗi mạng máy chủ và có bật auto failover
        if (pushSettings.autoFailoverToClient) {
          console.warn("⚠️ [Failover Timeout] Quá thời gian chờ máy chủ. Tự động chuyển sang Đẩy trực tiếp từ trình duyệt...");
          result = await pushOrderDirectlyFromBrowser(payload, pushSettings);
          if (result.success) {
            result.message = `${result.message || 'Đẩy đơn thành công!'} (Tự động chuyển Đẩy trực tiếp do máy chủ chậm)`;
          }
        } else {
          result = {
            success: false,
            error: `Lỗi kết nối máy chủ: ${fetchErr?.message || 'Quá thời gian phản hồi'}. Hãy chọn Đẩy trực tiếp trong Cài đặt!`
          };
        }
      }
    }

    if (!result.success) {
      return result;
    }

    const data = result;

    if (data.order && payload.user) {
      const o = data.order;
      const rawItems = o.items || o.order_items || o.products || payload.items || [];
      const items = Array.isArray(rawItems) ? rawItems.map((it: any) => ({
        name: it.variation_info?.name || it.product?.name || it.name || it.content || "Sản phẩm",
        quantity: Number(it.quantity || 1),
        price: Number(it.price || it.retail_price || (it.priceK ? it.priceK * 1000 : 0))
      })) : [];

      const newOrderInfo: PancakeOrderInfo = {
        id: o.id,
        orderNumber: o.display_id || o.order_number || String(o.id),
        status: o.status ?? 0,
        statusText: getOrderStatusLabel(o.status ?? 0).text,
        partnerName: o.partner?.service_partner?.name || o.partner?.name,
        partnerStatus: o.partner?.partner_status,
        partnerStatusText: getPartnerStatusLabel(o.partner?.partner_status).text,
        trackingCode: o.partner?.extend_code || o.tracking_code || o.order_number_vtp,
        totalPrice: Number(o.total_price || o.total_cost || payload.items.reduce((sum: number, it: any) => sum + (Number(it.price) > 1000 ? Number(it.price) : Number(it.price) * 1000) * Number(it.quantity || 1), 0)),
        totalQuantity: items.reduce((sum: number, it: any) => sum + it.quantity, 0) || 1,
        billFullName: o.bill_full_name || o.shipping_address?.full_name || payload.customCustomerInfo?.name || payload.user,
        billPhoneNumber: o.bill_phone_number || o.shipping_address?.phone_number || payload.customCustomerInfo?.phone || "",
        billAddress: o.shipping_address?.full_address || o.bill_address || payload.customCustomerInfo?.address || "",
        insertedAt: o.inserted_at || new Date().toISOString(),
        updatedAt: o.updated_at || new Date().toISOString(),
        note: o.note || "",
        items,
        isSuccess: o.status === 3 || o.status === 4
      };

      // Cập nhật ngay lập tức vào cache của khách hàng
      const cache = getCustomerInsightsCache();
      const existing = (cache[payload.user] || {}) as Partial<PancakeCustomerInsight>;
      const existingHistory = (existing.ordersHistory || []).filter((x: any) => String(x.id) !== String(o.id) && String(x.orderNumber) !== String(newOrderInfo.orderNumber));
      const updatedHistory = [newOrderInfo, ...existingHistory];
      const succOrders = updatedHistory.filter((x: any) => x.isSuccess);
      const isRet = updatedHistory.length >= 2;

      cache[payload.user] = {
        ...existing,
        matchedName: newOrderInfo.billFullName || existing.matchedName || payload.user,
        matchedPhone: newOrderInfo.billPhoneNumber || existing.matchedPhone || "",
        matchedAddress: newOrderInfo.billAddress || existing.matchedAddress || "",
        pancakeConvUrl: payload.pancakeLink || existing.pancakeConvUrl,
        pancakePageId: data.pageId || existing.pancakePageId,
        pancakeConvId: data.conversationId || existing.pancakeConvId,
        totalOrdersCount: updatedHistory.length,
        totalSpent: updatedHistory.reduce((s: number, ord: any) => s + (ord.totalPrice || 0), 0),
        isReturningCustomer: isRet,
        customerBadge: isRet ? 'REGULAR' : 'NEW',
        latestOrder: newOrderInfo,
        ordersHistory: updatedHistory,
        successfulOrders: succOrders,
        confidence: 'linked_exact',
        matchedAt: Date.now()
      } as PancakeCustomerInsight;
      saveCustomerInsightsCache(cache);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("pancake_insights_updated", { detail: { user: payload.user, insight: cache[payload.user] } }));
      }
    }

    // Trigger sync again for this customer to update insight cache from server
    const linkOrPhone = payload.pancakeLink || payload.customCustomerInfo?.phone || "";
    if (linkOrPhone && payload.user && payload.platform) {
      setTimeout(() => {
        syncSingleCustomerPancakeOrders(payload.user, payload.platform as any, linkOrPhone);
      }, 1200);
    }

    return {
      success: true,
      message: data.message || "Tạo đơn trên Pancake POS thành công!",
      order: data.order,
      messageSent: data.messageSent,
      messageError: data.messageError,
      conversationId: data.conversationId,
      pageId: data.pageId
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Lỗi kết nối khi đẩy đơn lên Pancake"
    };
  }
}





/**
 * Phân tích chuỗi ngày giờ từ Pancake / Hệ thống sang timestamp (ms)
 * Hỗ trợ mọi định dạng: ISO, SQL, DD/MM/YYYY, HH:mm DD/MM/YY, DD/MM/YY HH:mm, v.v.
 */
export function parseOrderTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (!str) return 0;

  // Nếu là chuỗi số timestamp (ms hoặc s)
  if (/^\d{10,13}$/.test(str)) {
    const num = parseInt(str, 10);
    return str.length === 10 ? num * 1000 : num;
  }

  // Parse trực tiếp nếu là định dạng chuẩn ISO/RFC
  const direct = new Date(str).getTime();
  if (!isNaN(direct) && direct > 0) return direct;

  // Format: "HH:mm DD/MM/YYYY" hoặc "HH:mm DD/MM/YY"
  const mTimeDate = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (mTimeDate) {
    const hour = parseInt(mTimeDate[1], 10);
    const minute = parseInt(mTimeDate[2], 10);
    const sec = parseInt(mTimeDate[3] || "0", 10);
    const day = parseInt(mTimeDate[4], 10);
    const month = parseInt(mTimeDate[5], 10) - 1;
    let year = parseInt(mTimeDate[6], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day, hour, minute, sec).getTime();
  }

  // Format: "DD/MM/YYYY HH:mm" hoặc "DD/MM/YY HH:mm" hoặc "DD/MM/YYYY"
  const mDateTime = str.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (mDateTime) {
    const day = parseInt(mDateTime[1], 10);
    const month = parseInt(mDateTime[2], 10) - 1;
    let year = parseInt(mDateTime[3], 10);
    if (year < 100) year += 2000;
    const hour = parseInt(mDateTime[4] || "0", 10);
    const minute = parseInt(mDateTime[5] || "0", 10);
    const sec = parseInt(mDateTime[6] || "0", 10);
    return new Date(year, month, day, hour, minute, sec).getTime();
  }

  return 0;
}

export function getVietnamDateString(ts: number): string {
  if (!ts || ts <= 0) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export function toStartOfDay(ts: number): number {
  if (!ts || ts <= 0) return 0;
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatDateTime(val: any): string {
  if (!val) return '';
  const ts = parseOrderTimestamp(val);
  if (!ts) return String(val);
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Kiểm tra xem khách hàng đã đi hết đơn hay chưa dựa trên so sánh:
 * Thời gian của đơn hàng gần nhất trên Pancake POS vs Thời gian chốt đơn trong hệ thống.
 * 
 * QUY TẮC NGHIỆP VỤ:
 * 1. Nếu các món trong giỏ đã được đánh dấu shipped: true -> ĐÃ ĐI ĐƠN
 * 2. Nếu đơn gần nhất trên Pancake có ngày >= ngày của các món trong lịch sử chốt đơn cũ (pastItems):
 *    -> Hiểu toàn bộ các đơn chốt cũ đó đã gom đẩy lên Pancake POS xong.
 * 3. Nếu đơn Pancake được tạo trong ngày hôm nay -> hỗ trợ thông báo và nút 1 chạm xác nhận đi đơn.
 * 4. Nếu không còn món mới nào chốt sau thời điểm đơn Pancake (currentItems trống hoặc được tạo trước đơn Pancake):
 *    -> Khách hàng ĐÃ ĐI HẾT ĐƠN 100%.
 */
export function checkCustomerPancakeShippedStatus(
  cust: { items?: any[]; pastItems?: any[]; lastTime?: number; count?: number; total?: number } | undefined,
  insight: PancakeCustomerInsight | null | undefined
): {
  isAllShipped: boolean;
  latestChotTime: number;
  latestPancakeTime: number;
  latestPancakeOrder: PancakeOrderInfo | null;
  hasPancakeOrders: boolean;
  unshippedItemsCount: number;
  hasNewItemsAfterPancake: boolean;
  unshippedPastItemsCount: number;
  unshippedCurrentItemsCount: number;
  hasPancakeOrderToday: boolean;
  matchingTodayOrder: PancakeOrderInfo | null;
  allCurrentAreShipped: boolean;
} {
  if (!cust) {
    return {
      isAllShipped: false,
      latestChotTime: 0,
      latestPancakeTime: 0,
      latestPancakeOrder: null,
      hasPancakeOrders: false,
      unshippedItemsCount: 0,
      hasNewItemsAfterPancake: false,
      unshippedPastItemsCount: 0,
      unshippedCurrentItemsCount: 0,
      hasPancakeOrderToday: false,
      matchingTodayOrder: null,
      allCurrentAreShipped: false
    };
  }

  const currentItems = cust.items || [];
  const pastItems = cust.pastItems || [];

  // Lấy đơn gần nhất trên Pancake POS
  const orders = insight?.ordersHistory || (insight?.latestOrder ? [insight.latestOrder] : []);
  const latestPancakeOrder = orders[0] || null;
  const hasPancakeOrders = orders.length > 0 && !!latestPancakeOrder;

  let latestPancakeTime = 0;
  if (latestPancakeOrder) {
    const rawDate = latestPancakeOrder.insertedAt || latestPancakeOrder.updatedAt || "";
    latestPancakeTime = parseOrderTimestamp(rawDate);
  }

  // Ngày hiện tại theo giờ Việt Nam
  const todayVNStr = getVietnamDateString(Date.now());
  const pancakeDayVNStr = getVietnamDateString(latestPancakeTime);
  const hasPancakeOrderToday = hasPancakeOrders && !!pancakeDayVNStr && pancakeDayVNStr === todayVNStr;

  // Tìm đơn tạo trong ngày hôm nay nếu có trong danh sách đơn Pancake
  const matchingTodayOrder = orders.find(o => {
    const t = parseOrderTimestamp(o.insertedAt || o.updatedAt || "");
    return t > 0 && getVietnamDateString(t) === todayVNStr;
  }) || (hasPancakeOrderToday ? latestPancakeOrder : null);

  // Tìm thời gian chốt đơn gần nhất thực tế của khách từ các items
  let latestChotTime = 0;
  currentItems.forEach(it => {
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (itTime > latestChotTime) latestChotTime = itTime;
  });
  pastItems.forEach(it => {
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (itTime > latestChotTime) latestChotTime = itTime;
  });
  if (latestChotTime === 0 && cust.lastTime) {
    latestChotTime = cust.lastTime;
  }

  // Kiểm tra xem tất cả các món trong currentItems đã được đánh dấu shipped: true hay chưa
  const allCurrentAreShipped = currentItems.length > 0 && currentItems.every(it => it.shipped);

  const latestUnrestoredPush = ((cust as any)?.pushHistory || []).find((h: any) => h.status !== 'restored');
  const latestPushTime = latestUnrestoredPush?.timestamp || 0;
  const pushDayVNStr = latestPushTime > 0 ? getVietnamDateString(latestPushTime) : "";

  // 1. Phân loại các món trong giỏ hiện tại (currentItems):
  const unshippedCurrentItems = currentItems.filter(it => {
    if (it.shipped) return false;
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (!itTime) return false;
    const itDayVNStr = getVietnamDateString(itTime);
    if (latestPushTime > 0) {
      if (pushDayVNStr && itDayVNStr && pushDayVNStr >= itDayVNStr) return false;
      if (itTime <= latestPushTime + 60000) return false;
    }
    if (!hasPancakeOrders || latestPancakeTime <= 0) return true;
    return itTime > (latestPancakeTime + 120000);
  });

  // 2. Phân loại các món trong lịch sử cũ (pastItems):
  // Đúng quy tắc: đơn mới nhất Pancake hoặc lịch sử đẩy đơn >= ngày đang có đơn thì tự động hết giữ đơn (đã gạch đơn)
  const unshippedPastItems = pastItems.filter(it => {
    if (it.shipped) return false;
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (!itTime) return false;
    const itDayVNStr = getVietnamDateString(itTime);
    if (latestPushTime > 0) {
      if (pushDayVNStr && itDayVNStr && pushDayVNStr >= itDayVNStr) return false;
      if (itTime <= latestPushTime + 60000) return false;
    }
    if (!hasPancakeOrders || latestPancakeTime <= 0) return true;
    if (pancakeDayVNStr && itDayVNStr && pancakeDayVNStr >= itDayVNStr) return false;
    return itTime > (latestPancakeTime + 120000);
  });

  const unshippedCurrentCount = unshippedCurrentItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const unshippedPastCount = unshippedPastItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const totalUnshippedCount = unshippedCurrentCount + unshippedPastCount;

  // Khách được coi là "Đã đi hết đơn" nếu:
  // 1. Tất cả các món hiện tại đã được đánh dấu shipped: true
  // 2. Hoặc ngày lịch sử đẩy đơn lớn hơn hoặc bằng ngày đơn chốt (đã đẩy đơn xoá sạch giỏ hàng)
  // 3. Hoặc không còn món nào chưa giao (totalUnshippedCount === 0)
  // 4. Hoặc đơn Pancake có ngày/giờ >= lần chốt đơn gần nhất
  const isAllShipped = allCurrentAreShipped || (
    (latestPushTime > 0 && totalUnshippedCount === 0) ||
    (latestPushTime > 0 && pushDayVNStr && pushDayVNStr >= getVietnamDateString(latestChotTime)) ||
    (latestPushTime > 0 && latestPushTime >= latestChotTime) ||
    (hasPancakeOrders && (
      totalUnshippedCount === 0 ||
      (currentItems.length === 0 && pancakeDayVNStr && pancakeDayVNStr >= getVietnamDateString(latestChotTime)) ||
      (latestPancakeTime >= latestChotTime)
    ))
  );

  return {
    isAllShipped,
    latestChotTime,
    latestPancakeTime,
    latestPancakeOrder,
    hasPancakeOrders,
    unshippedItemsCount: isAllShipped ? 0 : totalUnshippedCount,
    hasNewItemsAfterPancake: !isAllShipped && totalUnshippedCount > 0,
    unshippedPastItemsCount: isAllShipped ? 0 : unshippedPastCount,
    unshippedCurrentItemsCount: isAllShipped ? 0 : unshippedCurrentCount,
    hasPancakeOrderToday,
    matchingTodayOrder,
    allCurrentAreShipped
  };
}

/**
 * Lấy danh sách các món trong pastItems thực sự còn đang giữ (chưa đi đơn trên Pancake POS)
 */
export function getCustomerActivePastItems(
  cust: { pastItems?: any[]; pushHistory?: { timestamp: number; status?: string }[] } | undefined,
  insight?: PancakeCustomerInsight | null
): { item: any; originalIndex: number }[] {
  if (!cust || !cust.pastItems || cust.pastItems.length === 0) return [];

  const latestUnrestoredPush = (cust.pushHistory || []).find(h => h.status !== 'restored');
  const latestPushTime = latestUnrestoredPush?.timestamp || 0;
  const pushDayVNStr = latestPushTime > 0 ? getVietnamDateString(latestPushTime) : "";

  const orders = insight?.ordersHistory || (insight?.latestOrder ? [insight.latestOrder] : []);
  const latestPancakeOrder = orders[0] || null;
  const hasPancakeOrders = orders.length > 0 && !!latestPancakeOrder;
  let latestPancakeTime = 0;
  if (latestPancakeOrder) {
    const rawDate = latestPancakeOrder.insertedAt || latestPancakeOrder.updatedAt || "";
    latestPancakeTime = parseOrderTimestamp(rawDate);
  }
  const pancakeDayVNStr = getVietnamDateString(latestPancakeTime);

  return cust.pastItems
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      if (item.shipped || isGhostZeroPriceItem(item)) return false;
      const itTime = item.createdAt ? parseOrderTimestamp(item.createdAt) : (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || 0;
      if (!itTime) return false;
      const itDayVNStr = getVietnamDateString(itTime);

      // Nếu ngày lịch sử đẩy đơn lớn hơn hoặc bằng ngày đơn chốt -> đã đẩy xong, tự động hết giữ đơn
      if (latestPushTime > 0) {
        if (pushDayVNStr && itDayVNStr && pushDayVNStr >= itDayVNStr) return false;
        if (itTime <= latestPushTime + 60000) return false;
      }

      if (!hasPancakeOrders || latestPancakeTime <= 0) return true;
      if (pancakeDayVNStr && itDayVNStr && pancakeDayVNStr >= itDayVNStr) return false;
      return itTime > (latestPancakeTime + 120000);
    });
}
