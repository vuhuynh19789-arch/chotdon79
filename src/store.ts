import { create } from 'zustand';
import { fbGet, fbPut, DEVICE_ID, PLATFORMS, Platform, printLabel, PrintLabelOptions, firebaseDb, getShortId, normalizeUser, extractPriceFromContent, addRecentClosedPrice, parsePriceAndQuantity } from './lib/core';
import { ref, onValue, set as rtdbSet } from 'firebase/database';

export type { Platform };

export interface OrderItem {
  id: string;
  content: string;
  price: number;
  unitPrice?: number;
  quantity?: number;
  sourceCommentId: string | null;
  createdAt?: number;
  shipped?: boolean;
}

export interface PushHistoryRecord {
  id: string;
  timestamp: number;
  dateStr: string;
  orderNumber?: string;
  pancakeOrderId?: string;
  items: OrderItem[];
  totalQuantity: number;
  totalPrice: number;
  totalAmountK?: number;
  shippingFee?: number;
  prepaid?: number;
  status: 'pushed' | 'restored';
}

export interface CustomerData {
  count: number;
  total: number;
  lastTime: number;
  items: OrderItem[];
  pastItems?: OrderItem[];
  pushHistory?: PushHistoryRecord[];
}

export interface CommentData {
  id: string;
  user: string;
  content: string;
  time: string;
  avatar?: string;
  ts?: number;
  platform: Platform;
  sessionId?: string;
  sessionTitle?: string;
  nickname?: string;
  comment?: string;
  pancakeConvId?: string;
  pancakePageId?: string;
  phone?: string;
  orderCount?: number;
  totalSpend?: number;
  province?: string;
  location?: string;
}

export interface PinnedData {
  user: string;
  expiry: number;
}

export interface FlowPriceData {
  price: string;
  hostUser: string;
  content: string;
  ts: number;
}

export type TagType = 'NORMAL' | 'VIP' | 'DAO' | 'BOM' | 'COC' | 'COC_100' | 'CHAN' | 'HOST' | 'GIU' | 'GHE_LAY';

export interface PlatformState {
  comments: CommentData[];
  customers: Record<string, CustomerData>;
  printed: Record<string, number>;
  pinned: Record<string, PinnedData>;
  tags: Record<string, TagType>;
  ninhThuanTags?: Record<string, boolean>;
  gheLayTags?: Record<string, boolean>;
  nicknames: Record<string, string>;
  pancakeLinks: Record<string, string>;
  flowPrice?: FlowPriceData | null;
  lastCommentsAt: number;
  lastCustomersAt: number;
  lastPrintedAt: number;
  lastPinnedAt: number;
  lastTagsAt: number;
  lastNinhThuanTagsAt?: number;
  lastGheLayTagsAt?: number;
  lastNicknamesAt: number;
  lastPancakeLinksAt: number;
  lastFlowPriceAt?: number;
}

export interface SessionHistoryEntry {
  id: string;
  date: string;
  totalRevenue: number;
  totalOrders: number;
  newCustomers: number;
  returningCustomers: number;
}

export interface PaymentSource {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'wallet' | 'other';
  icon?: string;
  balance: number;
  accountNumber?: string;
}

export interface ExpenseRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  amount: number;
  category: string;
  note?: string;
  createdAt: number;
  dateStr: string;
}

export interface AppState {
  tiktok: PlatformState;
  facebook: PlatformState;
  shopee: PlatformState;
  syncStatus: { text: string, color: string };
  isPolling: boolean;
  isPrintServer: boolean;
  history: SessionHistoryEntry[];
  
  paymentSources: PaymentSource[];
  expenses: ExpenseRecord[];
  addExpense: (data: { sourceId: string; amount: number; category: string; note?: string }) => {
    success: boolean;
    sourceName: string;
    amount: number;
    remainingBalance: number;
    expense: ExpenseRecord;
  };
  addPaymentSource: (data: { name: string; type: 'cash' | 'bank' | 'wallet' | 'other'; balance: number; accountNumber?: string; icon?: string }) => void;
  updateSourceBalance: (sourceId: string, newBalance: number) => void;
  deleteExpense: (expenseId: string) => void;
  deletePaymentSource: (sourceId: string) => void;

  setSyncStatus: (text: string, color: string) => void;
  initPolling: () => void;
  togglePrintServer: () => void;
  subscribePlatformData: (platform: Platform) => void;
  
  sweepExpiredPins: () => void;

  togglePin: (platform: Platform, commentId: string, user: string) => void;
  repostComment: (platform: Platform, content: string) => Promise<boolean>;
  refreshPlatform: (platform: Platform) => Promise<boolean>;
  unpinComment: (platform: Platform, commentId: string) => void;
  unpinAllUserComments: (platform: Platform, user: string) => void;
  markPrinted: (platform: Platform, commentId: string | null) => void;
  unmarkPrinted: (platform: Platform, commentId: string | null) => void;
  setCustomerTag: (platform: Platform, user: string, tag: TagType) => void;
  toggleNinhThuanTag: (platform: Platform, user: string) => void;
  setCustomerNinhThuanTag: (platform: Platform, user: string, enabled: boolean) => void;
  toggleGheLayTag: (platform: Platform, user: string) => void;
  setCustomerGheLayTag: (platform: Platform, user: string, enabled: boolean) => void;
  setCustomerNickname: (platform: Platform, user: string, nickname: string) => void;
  setCustomerPancakeLink: (platform: Platform, user: string, link: string) => void;
  setFlowPrice: (platform: Platform, price: string, hostUser?: string, content?: string) => void;
  clearFlowPrice: (platform: Platform) => void;
  
  recordOrder: (platform: Platform, user: string, price: number | string, content: string, sourceCommentId: string | null) => void;
  addCustomOrderItem: (platform: Platform, user: string, itemData: { content?: string, unitPrice: number, quantity: number, price?: number, sourceCommentId?: string | null, printNow?: boolean }) => void;
  addMultipleCustomOrderItems: (platform: Platform, user: string, items: Array<{ content?: string, unitPrice: number, quantity: number, price?: number, sourceCommentId?: string | null }>, printNow?: boolean) => void;
  initCustomer: (platform: Platform, user: string) => void;
  updateCustomerStats: (platform: Platform, user: string, newCount: number, newTotal: number) => void;
  printNewOrder: (platform: Platform, user: string, content: string, price: number | string, time: string, sourceCommentId: string | null, bypassDebounce?: boolean, skipPrint?: boolean, extraOptions?: PrintLabelOptions) => void;
  deleteOrderItem: (platform: Platform, user: string, itemIndex: number, isPast?: boolean, targetItemId?: string) => void;
  updateOrderItemQuantity: (platform: Platform, user: string, itemIndex: number, newQty: number, isPast?: boolean, targetItemId?: string) => void;
  updateOrderItemPriceAndQuantity: (platform: Platform, user: string, itemIndex: number, newUnitPrice: number, newQty: number, isPast?: boolean, targetItemId?: string) => void;
  duplicateOrderItem: (platform: Platform, user: string, itemIndex: number, isPast?: boolean, targetItemId?: string) => void;
  toggleCurrentItemShipped: (platform: Platform, user: string, itemIndex: number, forceState?: boolean) => void;
  markCurrentItemsShipped: (platform: Platform, user: string, itemIndices?: number[], shippedState?: boolean) => void;
  archiveShippedCurrentItems: (platform: Platform, user: string) => void;
  togglePastItemShipped: (platform: Platform, user: string, itemIndex: number) => void;
  markAllCustomerItemsShipped: (platform: Platform, user: string, archiveToPast?: boolean) => void;
  mergePastItems: (platform: Platform, user: string, itemIndices: number[]) => void;
  deletePastItems: (platform: Platform, user: string, itemIndices: number[]) => void;
  archiveCustomerItems: (platform: Platform, user: string) => void;
  clearShippedPastItems: (platform: Platform, user: string) => void;
  clearCustomerCart: (platform: Platform, user: string) => void;
  recordPushOrderHistory: (platform: Platform, user: string, recordData: { 
    orderNumber?: string; 
    pancakeOrderId?: string; 
    items: OrderItem[]; 
    shippingFee?: number; 
    prepaid?: number; 
    clearAllCart?: boolean;
    pushedCurrentIndices?: number[];
    pushedPastIndices?: number[];
  }) => void;
  restorePushOrderRecord: (platform: Platform, user: string, recordId: string) => void;
  deletePushOrderRecord: (platform: Platform, user: string, recordId: string) => void;
  groupCustomerItemsByPrice: (platform: Platform, user: string, isPast?: boolean) => void;
  resetSession: () => void;
  clearFeed: (platform?: Platform) => void;
  clearPreviousDayLive: () => void;
  startNewSession: () => void;
  addComment: (platform?: Platform, comment?: CommentData) => void;
  selectedSessionId: string;
  setSelectedSessionId: (id: string) => void;
}

export const getTodayDateKey = (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const getFeedClearedAt = (platform: Platform): number => {
    try {
        const pVal = Number(localStorage.getItem(`slp_feed_cleared_at_${platform}`)) || 0;
        const gVal = Number(localStorage.getItem('slp_feed_cleared_at_global')) || 0;
        return Math.max(pVal, gVal);
    } catch {
        return 0;
    }
};

export const getGlobalFeedClearedAt = (): number => {
    try {
        return Number(localStorage.getItem('slp_feed_cleared_at_global')) || 0;
    } catch {
        return 0;
    }
};

export const setFeedClearedAt = (platform: Platform, ts: number) => {
    try {
        localStorage.setItem(`slp_feed_cleared_at_${platform}`, String(ts));
    } catch {}
};

export const setGlobalFeedClearedAt = (ts: number) => {
    try {
        localStorage.setItem('slp_feed_cleared_at_global', String(ts));
        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
            localStorage.setItem(`slp_feed_cleared_at_${p}`, String(ts));
        });
    } catch {}
};

/**
 * Quản lý chu kỳ lưu bình luận 24h tính từ thời điểm mở phiên live đầu tiên trong ngày.
 * Ví dụ hôm nay live lúc 13h thì lưu tất cả các phiên đến 13h ngày hôm sau.
 * Nếu chủ live live sớm hơn vào hôm sau, chủ live có thể bấm xoá phiên hôm trước để reset chu kỳ mới.
 * Nếu không xoá, tự động dọn sạch sau đúng 24h.
 */
export const getLiveCycleStartedAt = (): number => {
    try {
        const val = localStorage.getItem('slp_live_cycle_started_at');
        if (val) {
            const num = Number(val);
            if (num > 0 && (Date.now() - num) < 24 * 60 * 60 * 1000) {
                return num;
            }
        }
    } catch {}
    return 0;
};

export const setLiveCycleStartedAt = (ts: number = Date.now()) => {
    try {
        localStorage.setItem('slp_live_cycle_started_at', String(ts));
    } catch {}
};

export const resetLiveCycle = () => {
    try {
        localStorage.removeItem('slp_live_cycle_started_at');
    } catch {}
};

export const isCommentInActiveLiveCycle = (ts: number): boolean => {
    if (!ts) return false;
    const now = Date.now();
    // Giữ bình luận trong vòng 48 giờ để đảm bảo không bị mất bình luận của các phiên live
    if (now - ts > 48 * 60 * 60 * 1000) return false;
    return true;
};

// Giữ lại tên isCommentFromToday để tương thích toàn hệ thống, nhưng áp dụng đúng quy tắc 24h từ phiên live đầu tiên
export const isCommentFromToday = (ts: number): boolean => {
    return isCommentInActiveLiveCycle(ts);
};

export const loadPlatformComments = (p: Platform): CommentData[] => {
    try {
        const val = localStorage.getItem(`slp_webapp_comments_${p}`);
        if (!val) return [];
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) return [];
        const effectiveClearedAt = getFeedClearedAt(p);
        return parsed.filter(c => {
            if (!c || !c.ts) return false;
            if (effectiveClearedAt > 0 && c.ts <= effectiveClearedAt) return false;
            return isCommentInActiveLiveCycle(c.ts);
        }).slice(0, 2000);
    } catch {
        return [];
    }
};

export const savePlatformComments = (p: Platform, comments: CommentData[]) => {
    try {
        const toSave = (comments || [])
            .filter(c => c && c.ts && isCommentInActiveLiveCycle(c.ts))
            .slice(0, 1500)
            .map(c => ({
                id: c.id,
                user: c.user,
                content: c.content,
                avatar: (c.avatar && c.avatar.length < 300) ? c.avatar : '',
                ts: c.ts,
                time: c.time,
                platform: c.platform
            }));
        localStorage.setItem(`slp_webapp_comments_${p}`, JSON.stringify(toSave));
    } catch (e) {
        try {
            const trimmed = (comments || []).slice(0, 300);
            localStorage.setItem(`slp_webapp_comments_${p}`, JSON.stringify(trimmed));
        } catch {}
    }
};

const DEFAULT_PAYMENT_SOURCES: PaymentSource[] = [
  { id: 'cash', name: 'Tiền mặt', type: 'cash', icon: '💵', balance: 5000000 },
  { id: 'mb_bank', name: 'Ngân hàng MB Bank', type: 'bank', icon: '🏦', balance: 10000000, accountNumber: '99998888666' },
  { id: 'momo', name: 'Ví MoMo', type: 'wallet', icon: '📱', balance: 2000000 }
];

export const loadPaymentSources = (): PaymentSource[] => {
  try {
    const val = localStorage.getItem('slp_payment_sources');
    if (!val) return DEFAULT_PAYMENT_SOURCES;
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PAYMENT_SOURCES;
  } catch {
    return DEFAULT_PAYMENT_SOURCES;
  }
};

export const savePaymentSources = (sources: PaymentSource[]) => {
  try {
    localStorage.setItem('slp_payment_sources', JSON.stringify(sources));
  } catch {}
};

export const loadExpenses = (): ExpenseRecord[] => {
  try {
    const val = localStorage.getItem('slp_expenses');
    if (!val) return [];
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveExpenses = (expenses: ExpenseRecord[]) => {
  try {
    localStorage.setItem('slp_expenses', JSON.stringify(expenses));
  } catch {}
};

const loadLocal = (key: string, def: any = {}) => {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(def));
    } catch {
        return def;
    }
};

export function isGhostZeroPriceItem(it: any): boolean {
    if (!it) return true;
    const price = Number(it.price) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    if (price > 0 || unitPrice > 0) return false;

    // Cả đơn giá và thành tiền đều <= 0
    const content = String(it.content || '').toLowerCase().trim();
    const id = String(it.id || '').toLowerCase();

    // Các món tự sinh do lỗi lệch count/archive hoặc clone giả lập
    if (id.includes('_archive_') || id.includes('_adj_') || id.includes('synth_')) {
        return true;
    }
    // Tên món chứa 0k hoặc trống / mặc định
    if (!content || content === '(không ghi chú)' || content.includes('(0k)') || content.includes('0k') || content.startsWith('sản phẩm 0') || content === 'đơn đã chốt' || content.startsWith('đơn đã chốt')) {
        return true;
    }
    // Trừ khi có từ khóa tặng/quà rõ ràng, còn lại mọi món 0đ đều là đơn ảo bị cộng dư
    const isGift = content.includes('tặng') || content.includes('tang') || content.includes('quà') || content.includes('qua') || content.includes('gift') || content.includes('free');
    return !isGift;
}

export function deduplicateOrderItems(items: OrderItem[]): OrderItem[] {
    if (!Array.isArray(items) || items.length === 0) return [];
    const idMap = new Map<string, OrderItem>();
    const commentMap = new Map<string, OrderItem>();
    const unique: OrderItem[] = [];

    for (const rawItem of items) {
        if (!rawItem || isGhostZeroPriceItem(rawItem)) continue;
        const id = String(rawItem.id || '').trim();
        const scId = rawItem.sourceCommentId ? String(rawItem.sourceCommentId).trim() : null;

        if (id && idMap.has(id)) continue;

        if (scId && commentMap.has(scId)) {
            // Gộp số lượng nếu phát hiện nhiều dòng cùng sourceCommentId
            const existing = commentMap.get(scId)!;
            const unitPrice = existing.unitPrice || (existing.quantity ? Math.round(existing.price / existing.quantity) : existing.price) || rawItem.unitPrice || rawItem.price;
            const addQty = rawItem.quantity || 1;
            existing.quantity = (existing.quantity || 1) + addQty;
            existing.unitPrice = unitPrice;
            existing.price = unitPrice * existing.quantity;
            continue;
        }

        const clone: OrderItem = { 
            ...rawItem, 
            quantity: Math.max(1, rawItem.quantity || 1), 
            unitPrice: rawItem.unitPrice || (rawItem.quantity && rawItem.price ? Math.round(rawItem.price / rawItem.quantity) : rawItem.price)
        };
        if (id) idMap.set(id, clone);
        if (scId) commentMap.set(scId, clone);
        unique.push(clone);
    }
    return unique;
}

// ========================================================
// 👤 PERSISTENT CUSTOMER AVATAR REGISTRY (High-Speed O(1) Lookup)
// ========================================================
const AVATAR_STORAGE_KEY = 'slp_webapp_avatars';
const customerAvatarRegistry = new Map<string, string>();

// Initialize from localStorage if available
try {
    const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([k, v]) => {
                if (typeof v === 'string' && v.trim()) {
                    customerAvatarRegistry.set(k.toLowerCase(), v.trim());
                }
            });
        }
    }
} catch {}

let avatarPersistTimeout: any = null;
function scheduleAvatarPersist() {
    if (avatarPersistTimeout) return;
    avatarPersistTimeout = setTimeout(() => {
        avatarPersistTimeout = null;
        try {
            const obj: Record<string, string> = {};
            let count = 0;
            // Store up to 1000 avatars persistently
            for (const [k, v] of customerAvatarRegistry.entries()) {
                if (count++ > 1000) break;
                obj[k] = v;
            }
            localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(obj));
        } catch {}
    }, 1500);
}

export function registerCustomerAvatar(rawUser: string, avatarUrl?: string | null, platform?: Platform) {
    if (!rawUser || !avatarUrl || typeof avatarUrl !== 'string') return;
    const trimmedUrl = avatarUrl.trim();
    if (!trimmedUrl) return;

    const clean = normalizeUser(rawUser).toLowerCase();
    if (!clean) return;

    customerAvatarRegistry.set(clean, trimmedUrl);
    if (platform) {
        customerAvatarRegistry.set(`${platform}:${clean}`, trimmedUrl);
    }

    scheduleAvatarPersist();
}

export function getCustomerAvatar(rawUser: string, platform?: Platform): string | null {
    if (!rawUser) return null;
    const clean = normalizeUser(rawUser).toLowerCase();
    if (!clean) return null;

    if (platform) {
        const pUrl = customerAvatarRegistry.get(`${platform}:${clean}`);
        if (pUrl) return pUrl;
    }
    return customerAvatarRegistry.get(clean) || null;
}

let hasSyncedPancakeAvatars = false;
export async function syncPancakeAvatarsToRegistry() {
    if (hasSyncedPancakeAvatars || typeof window === 'undefined') return;
    hasSyncedPancakeAvatars = true;
    try {
        const res = await fetch('/api/pancake/conversations-fast', { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.conversations)) {
            data.conversations.forEach((c: any) => {
                const name = c.from?.name || c.name;
                const avatar = c.from?.avatar_url || c.avatarUrl || c.customers?.[0]?.avatar_url;
                if (name && avatar) {
                    registerCustomerAvatar(name, avatar);
                }
            });
        }
    } catch {}
}

// Tự động đồng bộ trước toàn bộ avatar khách hàng từ Pancake ở chế độ ngầm sau khi tải trang
if (typeof window !== 'undefined') {
    setTimeout(syncPancakeAvatarsToRegistry, 1200);
}

// Giữ an toàn tuyệt đối cho giỏ hàng của khách hàng (chỉ xoá/lưu trữ khi người dùng bấm reset phiên thủ công)
const loadPlatformCustomers = (platform: Platform): Record<string, CustomerData> => {
    const data = loadLocal(`slp_webapp_session_${platform}`, {});
    if (!data || typeof data !== 'object') return {};
    
    const cleanCustomers: Record<string, CustomerData> = {};

    Object.entries(data).forEach(([user, cust]: [string, any]) => {
        if (!cust) return;
        const rawItems = Array.isArray(cust.items) ? cust.items : [];
        const rawPastItems = Array.isArray(cust.pastItems) ? cust.pastItems : [];
        const items = deduplicateOrderItems(rawItems);
        const pastItems = deduplicateOrderItems(rawPastItems);
        const count = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
        const total = items.reduce((sum, it) => sum + (it.price || 0), 0);

        cleanCustomers[user] = {
            count,
            total,
            lastTime: Number(cust.lastTime) || Date.now(),
            items,
            pastItems
        };
    });

    try {
        localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(cleanCustomers));
    } catch {}

    return cleanCustomers;
};

// Hàm quét sạch và loại bỏ vĩnh viễn mọi sản phẩm 0₫ ảo khỏi bộ nhớ phiên và store
export function scrubGhostItemsFromStore() {
    if (typeof window === 'undefined') return;
    const platforms: Platform[] = ['tiktok', 'facebook', 'shopee'];
    platforms.forEach(p => {
        const state = useStore.getState();
        const pStore = state[p];
        if (!pStore || !pStore.customers) return;
        let changed = false;
        const cleaned: Record<string, CustomerData> = {};
        Object.entries(pStore.customers).forEach(([u, c]) => {
            if (!c) return;
            const validCur = deduplicateOrderItems(c.items || []);
            const validPast = deduplicateOrderItems(c.pastItems || []);
            const newCount = validCur.reduce((s, it) => s + (it.quantity || 1), 0);
            const newTotal = validCur.reduce((s, it) => s + (it.price || 0), 0);
            if (validCur.length !== (c.items || []).length || validPast.length !== (c.pastItems || []).length || newCount !== c.count || newTotal !== c.total) {
                changed = true;
            }
            cleaned[u] = {
                ...c,
                items: validCur,
                pastItems: validPast,
                count: newCount,
                total: newTotal
            };
        });
        if (changed) {
            useStore.setState(s => ({ [p]: { ...s[p], customers: cleaned } }));
            try { localStorage.setItem(`slp_webapp_session_${p}`, JSON.stringify(cleaned)); } catch {}
        }
    });
}

export const detectHostFlowPrice = (
    comments: CommentData[],
    tags: Record<string, TagType>
): FlowPriceData | null => {
    if (!comments || comments.length === 0 || !tags) return null;
    const hostComments = comments.filter(c => {
        if (!c || !c.user) return false;
        const u = normalizeUser(c.user);
        return tags[u] === 'HOST';
    });
    if (hostComments.length === 0) return null;

    const sorted = [...hostComments].sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));

    for (const c of sorted) {
        const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
        const extracted = extractPriceFromContent(contentStr);
        if (extracted.price && extracted.price.trim() !== '') {
            return {
                price: extracted.price.trim(),
                hostUser: normalizeUser(c.user),
                content: contentStr,
                ts: Number(c.ts) || Date.now()
            };
        }
    }
    return null;
};

const PIN_DURATION_MS = 5 * 60 * 1000;
const pushTimers: Record<string, any> = {};
const localLocks: Record<string, number> = {};

const createPlatformState = (p: Platform): PlatformState => ({
    comments: loadPlatformComments(p),
    customers: loadPlatformCustomers(p),
    printed: loadLocal(`slp_webapp_printed_${p}`),
    pinned: loadLocal(`slp_webapp_pinned_${p}`),
    tags: loadLocal(`slp_webapp_tags_${p}`),
    ninhThuanTags: loadLocal(`slp_webapp_ninhthuan_${p}`, {}),
    gheLayTags: loadLocal(`slp_webapp_ghelay_${p}`, {}),
    nicknames: loadLocal(`slp_webapp_nicknames_${p}`),
    pancakeLinks: loadLocal(`slp_webapp_pancakelinks_${p}`),
    flowPrice: loadLocal(`slp_webapp_flowprice_${p}`, null),
    lastCommentsAt: 0, lastCustomersAt: 0, lastPrintedAt: 0, lastPinnedAt: 0, lastTagsAt: 0, lastNinhThuanTagsAt: 0, lastGheLayTagsAt: 0, lastNicknamesAt: 0, lastPancakeLinksAt: 0, lastFlowPriceAt: 0
});

export const useStore = create<AppState>((set, get) => {
    // Migrate old tags
    let oldTags = loadLocal('slp_webapp_tags', null);
    if (oldTags) {
        let hadOld = false;
        let migrated: any = { tiktok: loadLocal('slp_webapp_tags_tiktok'), facebook: loadLocal('slp_webapp_tags_facebook'), shopee: loadLocal('slp_webapp_tags_shopee') };
        Object.keys(oldTags).forEach(k => {
            let idx = k.indexOf('::'); if (idx < 0) return;
            let p = k.substring(0, idx) as Platform; let u = k.substring(idx + 2);
            if (migrated[p] && !migrated[p][u]) { migrated[p][u] = oldTags[k]; hadOld = true; }
        });
        if (hadOld) {
            Object.keys(PLATFORMS).forEach(p => localStorage.setItem(`slp_webapp_tags_${p}`, JSON.stringify(migrated[p as Platform])));
            localStorage.removeItem('slp_webapp_tags');
        }
    }

    const encodeKey = (key: string) => key.replace(/\./g, '___dot___').replace(/\#/g, '___hash___').replace(/\$/g, '___dollar___').replace(/\[/g, '___lbracket___').replace(/\]/g, '___rbracket___').replace(/\//g, '___slash___');
const decodeKey = (key: string) => key.replace(/___dot___/g, '.').replace(/___hash___/g, '#').replace(/___dollar___/g, '$').replace(/___lbracket___/g, '[').replace(/___rbracket___/g, ']').replace(/___slash___/g, '/');

const encodeKeys = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const res: any = {};
    for (const k in obj) res[encodeKey(k)] = obj[k];
    return res;
};

const decodeKeys = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const res: any = {};
    for (const k in obj) res[decodeKey(k)] = obj[k];
    return res;
};

    const deleteCustomerKeyFromRemote = async (platform: Platform, type: string, rawUser: string) => {
        const user = normalizeUser(rawUser);
        const room = PLATFORMS[platform].room;
        try {
            const remote = await fbGet(`rooms/${room}/${type}`);
            if (remote && typeof remote === 'object') {
                for (const devId in remote) {
                    if (remote[devId]?.data) {
                        for (const k in remote[devId].data) {
                            const decodedK = decodeKey(k);
                            if (
                                decodedK === user ||
                                decodedK === rawUser ||
                                normalizeUser(decodedK).toLowerCase() === user.toLowerCase()
                            ) {
                                await fbPut(`rooms/${room}/${type}/${devId}/data/${k}`, null);
                            }
                        }
                    }
                    const decodedDevId = decodeKey(devId);
                    if (
                        decodedDevId === user ||
                        decodedDevId === rawUser ||
                        normalizeUser(decodedDevId).toLowerCase() === user.toLowerCase()
                    ) {
                        await fbPut(`rooms/${room}/${type}/${devId}`, null);
                    }
                }
            }
        } catch (e) {
            console.error(`deleteCustomerKeyFromRemote error for ${type}/${user}`, e);
        }
    };

    const pushData = (platform: Platform, type: string, data: any, updatedAt: number, immediate: boolean = false) => {
        const key = `${platform}_${type}`;
        localLocks[key] = Date.now();
        clearTimeout(pushTimers[key]);
        const doPush = async () => {
             const room = PLATFORMS[platform].room;
             try {
                 const encodedData = encodeKeys(data);
                 await fbPut(`rooms/${room}/${type}/${DEVICE_ID}`, { data: encodedData, updatedAt, deviceId: DEVICE_ID });
                 if (type === 'customers') get().setSyncStatus("🟢 Đã đồng bộ", "#28a745");
             } catch (e) {
                 if (type === 'customers') get().setSyncStatus("🔴 Lỗi đồng bộ", "#dc3545");
             }
        };
        if (immediate) {
            doPush();
        } else {
            pushTimers[key] = setTimeout(doPush, 300);
        }
    };

    return {
        tiktok: createPlatformState('tiktok'),
        facebook: createPlatformState('facebook'),
        shopee: createPlatformState('shopee'),
        syncStatus: { text: "⏳ Đang kết nối...", color: "#888" },
        isPolling: false,
        isPrintServer: localStorage.getItem('slp_webapp_printserver') === 'true',
        history: loadLocal('slp_webapp_history', []),
        selectedSessionId: 'all',
        setSelectedSessionId: (id: string) => set({ selectedSessionId: id }),

        paymentSources: loadPaymentSources(),
        expenses: loadExpenses(),

        addExpense: ({ sourceId, amount, category, note }) => {
          const currentSources = get().paymentSources;
          const targetSource = currentSources.find(s => s.id === sourceId) || currentSources[0];
          
          const sourceName = targetSource ? targetSource.name : 'Nguồn tiền';
          const currentBalance = targetSource ? targetSource.balance : 0;
          const newBalance = currentBalance - amount;

          const updatedSources = currentSources.map(s => {
            if (s.id === (targetSource ? targetSource.id : sourceId)) {
              return { ...s, balance: newBalance };
            }
            return s;
          });

          const now = new Date();
          const dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

          const newExpense: ExpenseRecord = {
            id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            sourceId: targetSource ? targetSource.id : sourceId,
            sourceName,
            amount,
            category: category || 'Chi khác',
            note: note || '',
            createdAt: Date.now(),
            dateStr
          };

          const updatedExpenses = [newExpense, ...get().expenses];

          set({
            paymentSources: updatedSources,
            expenses: updatedExpenses
          });

          savePaymentSources(updatedSources);
          saveExpenses(updatedExpenses);

          return {
            success: true,
            sourceName,
            amount,
            remainingBalance: newBalance,
            expense: newExpense
          };
        },

        addPaymentSource: ({ name, type, balance, accountNumber, icon }) => {
          const iconByTypes: Record<string, string> = {
            cash: '💵',
            bank: '🏦',
            wallet: '📱',
            other: '💳'
          };
          const newSource: PaymentSource = {
            id: 'src_' + Date.now(),
            name,
            type,
            balance: Number(balance) || 0,
            accountNumber: accountNumber || '',
            icon: icon || iconByTypes[type] || '💳'
          };
          const updated = [...get().paymentSources, newSource];
          set({ paymentSources: updated });
          savePaymentSources(updated);
        },

        updateSourceBalance: (sourceId, newBalance) => {
          const updated = get().paymentSources.map(s => s.id === sourceId ? { ...s, balance: Number(newBalance) || 0 } : s);
          set({ paymentSources: updated });
          savePaymentSources(updated);
        },

        deleteExpense: (expenseId) => {
          const targetExp = get().expenses.find(e => e.id === expenseId);
          if (!targetExp) return;

          const updatedSources = get().paymentSources.map(s => {
            if (s.id === targetExp.sourceId) {
              return { ...s, balance: s.balance + targetExp.amount };
            }
            return s;
          });

          const updatedExpenses = get().expenses.filter(e => e.id !== expenseId);

          set({
            paymentSources: updatedSources,
            expenses: updatedExpenses
          });

          savePaymentSources(updatedSources);
          saveExpenses(updatedExpenses);
        },

        deletePaymentSource: (sourceId) => {
          const updated = get().paymentSources.filter(s => s.id !== sourceId);
          set({ paymentSources: updated });
          savePaymentSources(updated);
        },

        setSyncStatus: (text, color) => set({ syncStatus: { text, color } }),


        subscribePlatformData: (platform: Platform) => {
            const room = PLATFORMS[platform].room;
            
            const mergeData = (remote: any, type?: string) => {
                const merged: any = {};
                if (!remote) return merged;

                let deletedMap: Record<string, number> = {};
                if (type) {
                    try {
                        deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_${type}_${platform}`) || '{}');
                    } catch {}
                }

                const isItemDeleted = (rawKey: string, updatedAt: number = 0) => {
                    const k = String(rawKey);
                    const normK = normalizeUser(k);
                    const lowerK = k.toLowerCase();
                    const lowerNormK = normK.toLowerCase();
                    const delTs = deletedMap[k] || deletedMap[normK] || deletedMap[lowerK] || deletedMap[lowerNormK] || 0;
                    if (!delTs) return false;
                    return updatedAt <= delTs;
                };

                const devices = Object.values(remote).sort((a: any, b: any) => (a.updatedAt || 0) - (b.updatedAt || 0));
                devices.forEach((d: any) => {
                    if (d && d.data && typeof d.data === 'object') {
                        const decoded = decodeKeys(d.data);
                        const devUpdated = Number(d.updatedAt) || 0;
                        for (const k in decoded) {
                            const val = decoded[k];
                            if (val === "" || val == null) continue;
                            if (isItemDeleted(k, devUpdated)) {
                                continue;
                            }
                            merged[k] = val;
                        }
                    } else if (d && typeof d === 'object') {
                        for (const k in d) {
                            if (k === 'updatedAt' || k === 'deviceId' || k === 'data') continue;
                            const val = d[k];
                            if (val === "" || val == null) continue;
                            const decodedK = decodeKey(k);
                            if (isItemDeleted(decodedK, Number(remote.updatedAt) || 0)) {
                                continue;
                            }
                            merged[decodedK] = val;
                        }
                    }
                });
                return merged;
            };

            const mergeCustomers = (remote: any) => {
                const merged: any = {};
                if (!remote) return merged;
                Object.values(remote).forEach((deviceInfo: any) => {
                    if (!deviceInfo || !deviceInfo.data) return;
                    Object.entries(decodeKeys(deviceInfo.data)).forEach(([rawUser, custData]: [any, any]) => {
                        const user = normalizeUser(rawUser);
                        if (!merged[user] || custData.lastTime > merged[user].lastTime) {
                            const cd = { ...custData };
                            const rawItems = Array.isArray(cd.items) ? cd.items : [];
                            const rawPast = Array.isArray(cd.pastItems) ? cd.pastItems : [];
                            cd.items = deduplicateOrderItems(rawItems);
                            
                            const now = Date.now();
                            const sixtyDays = 60 * 24 * 60 * 60 * 1000;
                            cd.pastItems = deduplicateOrderItems(rawPast).filter((item: any) => {
                                const t = item.createdAt || (item.id ? parseInt(String(item.id).substring(0,13)) : 0) || now;
                                return (now - t) <= sixtyDays;
                            });

                            cd.count = cd.items.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0);
                            cd.total = cd.items.reduce((sum: number, it: any) => sum + (it.price || 0), 0);
                            merged[user] = cd;
                        }
                    });
                });
                return merged;
            };

            // 1. Comments Listener
            const commentsRef = ref(firebaseDb, `rooms/${room}/comments`);
            onValue(commentsRef, (snapshot) => {
                get().setSyncStatus("🟢 Đã kết nối (Realtime)", "#28a745");
                const data = snapshot.val();
                if (!data) return;

                const remoteClearedAt = Number(data.clearedAt) || 0;
                if (remoteClearedAt > getFeedClearedAt(platform)) {
                    setFeedClearedAt(platform, remoteClearedAt);
                }
                const effectiveClearedAt = Math.max(getFeedClearedAt(platform), getGlobalFeedClearedAt(), remoteClearedAt);

                const rawComments = Array.isArray(data.data) 
                    ? data.data 
                    : Array.isArray(data) 
                        ? data 
                        : typeof data === 'object' 
                            ? Object.values(data).filter((x: any) => x && typeof x === 'object' && (x.user || x.nickname || x.uniqueId || x.content || x.comment))
                            : [];
                const seenIds = new Set<string>();
                const seenSignatures = new Set<string>();
                const commentsData: any[] = [];
                const nowTs = Date.now();
                for (const c of rawComments) {
                    if (!c) continue;
                    const rawContent = c.content || c.comment || c.text || c.msg || '';
                    if (!rawContent) continue;
                    const rawUser = c.user || c.nickname || c.uniqueId || 'Khách';
                    const cleanUser = normalizeUser(rawUser);
                    const cleanContent = typeof rawContent === 'object' ? JSON.stringify(rawContent) : String(rawContent).trim();
                    const cleanAvatar = c.avatar || (typeof c.user === 'object' && (c.user.profilePictureUrl || c.user.avatarThumb?.urlList?.[0])) || '';
                    let ts = Number(c.ts) || 0;
                    const idStr = c.id ? String(c.id) : `c_${cleanUser}_${cleanContent.slice(0, 25)}_${Math.floor((ts || nowTs) / 10000)}`;
                    if (!ts) {
                        const numMatch = idStr.match(/\d{13}/);
                        if (numMatch) {
                            const numId = parseInt(numMatch[0], 10);
                            if (numId > 1600000000000 && numId < 3000000000000) {
                                ts = numId;
                            }
                        }
                    }
                    const finalTs = ts || nowTs;

                    // Nếu đã từng có lệnh xoá feed, bình luận không rõ timestamp hoặc cũ hơn thời điểm xoá sẽ bị loại bỏ
                    if (effectiveClearedAt > 0) {
                        if (!finalTs || finalTs <= effectiveClearedAt) {
                            continue;
                        }
                    }

                    // Bỏ qua comment của ngày cũ
                    if (finalTs && !isCommentFromToday(finalTs)) {
                        continue;
                    }

                    // Chống trùng lặp: loại trừ nếu đã có comment cùng ID hoặc cùng User + Nội dung trong vòng 20s
                    const isDup = seenIds.has(idStr) || commentsData.some(existing => {
                        if (existing.id && idStr && String(existing.id) === idStr) return true;
                        if (existing.user.toLowerCase() === cleanUser.toLowerCase() && 
                            existing.content.toLowerCase() === cleanContent.toLowerCase() && 
                            Math.abs((existing.ts || 0) - finalTs) <= 20000) {
                            return true;
                        }
                        return false;
                    });

                    if (!isDup) {
                        seenIds.add(idStr);
                        if (cleanAvatar) {
                            registerCustomerAvatar(cleanUser, cleanAvatar, platform);
                        }
                        commentsData.push({
                            ...c,
                            id: idStr,
                            user: cleanUser,
                            content: cleanContent,
                            avatar: cleanAvatar,
                            ts: finalTs,
                            platform
                        });
                    }
                }
                if (commentsData.length > 0) {
                    const state = get()[platform];
                    const currentComments = (state.comments || []).filter(c => {
                        const cTs = c.ts || 0;
                        if (effectiveClearedAt > 0 && (!cTs || cTs <= effectiveClearedAt)) return false;
                        return isCommentFromToday(cTs);
                    });

                    // Hợp nhất các bình luận mới cục bộ (vừa được thêm trong 30s) mà chưa kịp lên Firebase
                    const merged = [...commentsData];
                    for (const ex of currentComments) {
                        const exTs = ex.ts || 0;
                        if (nowTs - exTs > 30000) continue; // Chỉ giữ comment rất mới chưa kịp sync
                        const isAlreadyInMerged = merged.some(m => 
                            (m.id && ex.id && String(m.id) === String(ex.id)) ||
                            (m.user.toLowerCase() === ex.user.toLowerCase() && 
                             m.content.toLowerCase() === ex.content.toLowerCase() && 
                             Math.abs((m.ts || 0) - exTs) <= 20000)
                        );
                        if (!isAlreadyInMerged) {
                            merged.push(ex);
                        }
                    }
                    // Sắp xếp bình luận mới nhất lên đầu
                    merged.sort((a, b) => (b.ts || 0) - (a.ts || 0));

                    const detectedFlow = detectHostFlowPrice(merged, state.tags || {});
                    savePlatformComments(platform, merged);
                    set(s => ({ 
                        [platform]: { 
                            ...s[platform], 
                            lastCommentsAt: data.updatedAt || nowTs, 
                            comments: merged.slice(0, 2000),
                            ...(detectedFlow ? { flowPrice: detectedFlow } : {})
                        } 
                    }));
                } else {
                    // Không có bình luận hợp lệ hoặc vừa bấm xoá feed phiên cũ
                    savePlatformComments(platform, []);
                    set(s => ({ [platform]: { ...s[platform], comments: [], lastCommentsAt: nowTs } }));
                }
            }, (error) => {
                console.error("Firebase Comments Realtime Error:", error);
                get().setSyncStatus("🔴 Bị chặn quyền (Hết hạn Rule)", "#dc3545");
            });

            // 1b. Realtime Cleared_At Listener (Lắng nghe sự kiện xoá feed từ các máy khác)
            const clearedRef = ref(firebaseDb, `rooms/${room}/cleared_at`);
            onValue(clearedRef, (snapshot) => {
                const val = snapshot.val();
                if (!val) return;
                const remoteClearedAt = Number(val.clearedAt || val) || 0;
                if (remoteClearedAt > getFeedClearedAt(platform)) {
                    setFeedClearedAt(platform, remoteClearedAt);
                    set(s => ({
                        [platform]: {
                            ...s[platform],
                            comments: (s[platform].comments || []).filter(c => (c.ts || 0) > remoteClearedAt)
                        }
                    }));
                }
            });

            // 2. Customers Listener
            const customersRef = ref(firebaseDb, `rooms/${room}/customers`);
            onValue(customersRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_customers`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedCustomers = mergeCustomers(data);
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastCustomersAt) {
                    set(s => ({ [platform]: { ...s[platform], lastCustomersAt: latestUpdatedAt, customers: mergedCustomers } }));
                    localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(mergedCustomers));
                }
            });

            // 3. Printed Listener
            const printedRef = ref(firebaseDb, `rooms/${room}/printed`);
            onValue(printedRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_printed`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedPrinted = mergeData(data, 'printed');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastPrintedAt) {
                    set(s => ({ [platform]: { ...s[platform], lastPrintedAt: latestUpdatedAt, printed: mergedPrinted } }));
                    localStorage.setItem(`slp_webapp_printed_${platform}`, JSON.stringify(mergedPrinted));
                }
            });

            // 4. Pinned Listener
            const pinnedRef = ref(firebaseDb, `rooms/${room}/pinned`);
            onValue(pinnedRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_pinned`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedPinned = mergeData(data, 'pinned');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastPinnedAt) {
                    set(s => ({ [platform]: { ...s[platform], lastPinnedAt: latestUpdatedAt, pinned: mergedPinned } }));
                    localStorage.setItem(`slp_webapp_pinned_${platform}`, JSON.stringify(mergedPinned));
                }
            });

            // 5. Nicknames Listener
            const nicknamesRef = ref(firebaseDb, `rooms/${room}/nicknames`);
            onValue(nicknamesRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_nicknames`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedNicknames = mergeData(data, 'nicknames');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastNicknamesAt) {
                    set(s => ({ [platform]: { ...s[platform], lastNicknamesAt: latestUpdatedAt, nicknames: mergedNicknames } }));
                    localStorage.setItem(`slp_webapp_nicknames_${platform}`, JSON.stringify(mergedNicknames));
                }
            });

            // 6. Tags Listener
            const tagsRef = ref(firebaseDb, `rooms/${room}/tags`);
            onValue(tagsRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_tags`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedTags = mergeData(data, 'tags');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastTagsAt) {
                    const detectedFlow = detectHostFlowPrice(state.comments || [], mergedTags);
                    set(s => ({ 
                        [platform]: { 
                            ...s[platform], 
                            lastTagsAt: latestUpdatedAt, 
                            tags: mergedTags,
                            ...(detectedFlow ? { flowPrice: detectedFlow } : {})
                        } 
                    }));
                    localStorage.setItem(`slp_webapp_tags_${platform}`, JSON.stringify(mergedTags));
                }
            });

            // 6b. Ninh Thuận Tags Listener (Đồng bộ tag Ninh Thuận realtime)
            const ntTagsRef = ref(firebaseDb, `rooms/${room}/ninh_thuan_tags`);
            onValue(ntTagsRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_ninh_thuan_tags`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedNtTags = mergeData(data, 'ninh_thuan_tags');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastNinhThuanTagsAt) {
                    set(s => ({ 
                        [platform]: { 
                            ...s[platform], 
                            lastNinhThuanTagsAt: latestUpdatedAt, 
                            ninhThuanTags: mergedNtTags
                        } 
                    }));
                    localStorage.setItem(`slp_webapp_ninhthuan_${platform}`, JSON.stringify(mergedNtTags));
                }
            });

            // 6c. Ghé Lấy Tags Listener (Đồng bộ tag Ghé Lấy realtime)
            const gheLayTagsRef = ref(firebaseDb, `rooms/${room}/ghe_lay_tags`);
            onValue(gheLayTagsRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_ghe_lay_tags`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedGlTags = mergeData(data, 'ghe_lay_tags');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastGheLayTagsAt) {
                    set(s => ({ 
                        [platform]: { 
                            ...s[platform], 
                            lastGheLayTagsAt: latestUpdatedAt, 
                            gheLayTags: mergedGlTags
                        } 
                    }));
                    localStorage.setItem(`slp_webapp_ghelay_${platform}`, JSON.stringify(mergedGlTags));
                }
            });

            // 7. Pancake Links Listener
            const pancakeLinksRef = ref(firebaseDb, `rooms/${room}/pancake_links`);
            onValue(pancakeLinksRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_pancake_links`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const mergedLinks = mergeData(data, 'pancake_links');
                let latestUpdatedAt = 0;
                Object.values(data).forEach((d: any) => { if (d && d.updatedAt > latestUpdatedAt) latestUpdatedAt = d.updatedAt; });
                if (latestUpdatedAt !== state.lastPancakeLinksAt) {
                    set(s => ({ [platform]: { ...s[platform], lastPancakeLinksAt: latestUpdatedAt, pancakeLinks: mergedLinks } }));
                    localStorage.setItem(`slp_webapp_pancakelinks_${platform}`, JSON.stringify(mergedLinks));
                }
            });

            // 8. Flow Price Listener (Realtime host price across devices)
            const flowPriceRef = ref(firebaseDb, `rooms/${room}/flow_price`);
            onValue(flowPriceRef, (snapshot) => {
                if (Date.now() - (localLocks[`${platform}_flow_price`] || 0) <= 3000) return;
                const data = snapshot.val();
                if (!data) return;
                const state = get()[platform];
                const remoteFlow = data.data !== undefined ? data.data : data;
                const latestUpdatedAt = Number(data.updatedAt) || Date.now();
                if (latestUpdatedAt !== state.lastFlowPriceAt) {
                    set(s => ({ 
                        [platform]: { 
                            ...s[platform], 
                            lastFlowPriceAt: latestUpdatedAt, 
                            flowPrice: remoteFlow ? {
                                price: String(remoteFlow.price || ''),
                                hostUser: String(remoteFlow.hostUser || ''),
                                content: String(remoteFlow.content || ''),
                                ts: Number(remoteFlow.ts) || Date.now()
                            } : null 
                        } 
                    }));
                    if (remoteFlow) {
                        try {
                            localStorage.setItem(`slp_webapp_flowprice_${platform}`, JSON.stringify(remoteFlow));
                        } catch {}
                    } else {
                        try {
                            localStorage.removeItem(`slp_webapp_flowprice_${platform}`);
                        } catch {}
                    }
                }
            });
        },

        togglePrintServer: () => {
        set(s => {
            const next = !s.isPrintServer;
            localStorage.setItem('slp_webapp_printserver', String(next));
            return { isPrintServer: next };
        });
    },
    initPolling: () => {
            if (get().isPolling) return;
            set({ isPolling: true });
            
            const platforms: Platform[] = ['tiktok', 'facebook', 'shopee'];
            platforms.forEach(p => get().subscribePlatformData(p));
            setInterval(() => get().sweepExpiredPins(), 1000);
        },

        sweepExpiredPins: () => {
            let changed = false;
            const now = Date.now();
            ['tiktok', 'facebook', 'shopee'].forEach((p) => {
                const platform = p as Platform;
                const state = get()[platform];
                const newPinned = { ...state.pinned };
                let pChanged = false;
                Object.keys(newPinned).forEach(id => {
                    const entry = newPinned[id];
                    const isHost = entry.user && state.tags[entry.user] === 'HOST';
                    if (entry.expiry <= now) {
                        if (isHost) {
                            newPinned[id] = { ...entry, expiry: now + 1000 * 60 * 60 * 24 * 365 };
                            pChanged = true;
                            changed = true;
                        } else {
                            delete newPinned[id];
                            pChanged = true;
                            changed = true;
                            if (entry.user) {
                                get().setCustomerTag(platform, entry.user, 'DAO');
                            }
                        }
                    }
                });
                if (pChanged) {
                    set(s => ({ [platform]: { ...s[platform], pinned: newPinned } }));
                    localStorage.setItem(`slp_webapp_pinned_${platform}`, JSON.stringify(newPinned));
                }
            });
        },

        togglePin: (platform, commentId, user) => {
            const state = get()[platform];
            const newPinned = { ...state.pinned };
            const isHost = state.tags[user] === 'HOST';
            if (newPinned[commentId] && (newPinned[commentId].expiry > Date.now() || isHost)) {
                delete newPinned[commentId];
            } else {
                newPinned[commentId] = { user, expiry: isHost ? Date.now() + 1000 * 60 * 60 * 24 * 365 : Date.now() + PIN_DURATION_MS };
            }
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], pinned: newPinned, lastPinnedAt: now } }));
            localStorage.setItem(`slp_webapp_pinned_${platform}`, JSON.stringify(newPinned));
            pushData(platform, 'pinned', newPinned, now);
        },

        repostComment: async (platform, content) => {
            if (!content) return false;
            const room = PLATFORMS[platform].room;
            const commandId = DEVICE_ID + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const payload = { content: content, commandId: commandId, updatedAt: Date.now(), slowMode: true, typingDelay: 300 };
            
            let dispatched = false;
            try {
                // 1. Gửi trực tiếp qua Firebase WebSocket Realtime Database SDK (không phụ thuộc fetch/CORS)
                const commandRef = ref(firebaseDb, `rooms/${room}/replyCommand`);
                await rtdbSet(commandRef, payload);
                dispatched = true;
            } catch (sdkErr) {
                console.warn("Gửi replyCommand qua Firebase SDK cảnh báo:", sdkErr);
            }

            try {
                // 2. Gửi song song đến các endpoint REST dự phòng với Promise.allSettled để không bao giờ quăng TypeError
                await Promise.allSettled([
                    fbPut(`rooms/${room}/replyCommand`, payload),
                    fetch(`https://hienpham-live-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/${room}/replyCommand.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                ]);
                dispatched = true;
            } catch (netErr) {
                console.warn("Gửi replyCommand REST cảnh báo:", netErr);
            }

            return dispatched;
        },

        
        refreshPlatform: async (platform) => {
            const room = PLATFORMS[platform].room;
            const commandId = DEVICE_ID + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const refreshPayload = { 
                commandId: commandId, 
                action: 'reload_page', 
                updatedAt: Date.now(),
                reason: 'live_restart' 
            };
            const reloadPayload = { 
                commandId: commandId, 
                action: 'f5', 
                updatedAt: Date.now() 
            };
            try {
                // 1. Gửi lệnh qua cả 2 Database Firebase Realtime (spry-shade & hienpham-live)
                await Promise.all([
                    fbPut(`rooms/${room}/refreshCommand`, refreshPayload).catch(() => {}),
                    fbPut(`rooms/${room}/reloadBrowserCommand`, reloadPayload).catch(() => {}),
                    fetch(`https://hienpham-live-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/${room}/refreshCommand.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(refreshPayload)
                    }).catch(() => {}),
                    fetch(`https://hienpham-live-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/${room}/reloadBrowserCommand.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reloadPayload)
                    }).catch(() => {})
                ]);

                // 2. Gửi lệnh qua API Backend TV Box & Local Server
                const endpoints = [
                    '/api/tiktok/reload-browser',
                    'https://caotiktok.home79.cloud/api/tiktok/reload-browser'
                ];
                endpoints.forEach(ep => {
                    fetch(ep, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ commandId, reason: 'live_restart' })
                    }).catch(() => {});
                });

                // 3. Phát sự kiện nội bộ trình duyệt và tab chéo
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tiktok_live_reload_browser', { detail: { commandId, reason: 'live_restart' } }));
                    try {
                        localStorage.setItem('tiktok_f5_trigger', JSON.stringify({ commandId, timestamp: Date.now() }));
                    } catch(e) {}
                    try {
                        if (typeof BroadcastChannel !== 'undefined') {
                            const bc = new BroadcastChannel('tiktok_f5_channel');
                            bc.postMessage({ commandId, timestamp: Date.now() });
                            setTimeout(() => bc.close(), 1000);
                        }
                    } catch(e) {}
                }

                return true;
            } catch (e) {
                console.error("Gửi lệnh làm mới thất bại", e);
                return false;
            }
        },

        unpinComment: (platform, commentId) => {
            if (!commentId) return;
            const state = get()[platform];
            const newPinned = { ...state.pinned };
            if (newPinned[commentId]) {
                delete newPinned[commentId];
                const now = Date.now();
                set(s => ({ [platform]: { ...s[platform], pinned: newPinned, lastPinnedAt: now } }));
                localStorage.setItem(`slp_webapp_pinned_${platform}`, JSON.stringify(newPinned));
                pushData(platform, 'pinned', newPinned, now);
            }
        },

        unpinAllUserComments: (platform, rawUser) => {
            if (!rawUser) return;
            const user = normalizeUser(rawUser).toLowerCase();
            const state = get()[platform];
            const newPinned = { ...state.pinned };
            let hasChanged = false;
            Object.keys(newPinned).forEach(id => {
                const entry = newPinned[id];
                if (entry && normalizeUser(entry.user).toLowerCase() === user) {
                    delete newPinned[id];
                    hasChanged = true;
                }
            });
            if (hasChanged) {
                const now = Date.now();
                set(s => ({ [platform]: { ...s[platform], pinned: newPinned, lastPinnedAt: now } }));
                localStorage.setItem(`slp_webapp_pinned_${platform}`, JSON.stringify(newPinned));
                pushData(platform, 'pinned', newPinned, now);
            }
        },

        markPrinted: (platform, commentId) => {
            if (!commentId) return;
            const state = get()[platform];
            const newPrinted = { ...state.printed };
            newPrinted[commentId] = (newPrinted[commentId] || 0) + 1;
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], printed: newPrinted, lastPrintedAt: now } }));
            localStorage.setItem(`slp_webapp_printed_${platform}`, JSON.stringify(newPrinted));
            pushData(platform, 'printed', newPrinted, now);
        },

        unmarkPrinted: (platform, commentId) => {
            if (!commentId) return;
            const state = get()[platform];
            const newPrinted = { ...state.printed };
            if (newPrinted[commentId]) {
                newPrinted[commentId] -= 1;
                if (newPrinted[commentId] <= 0) delete newPrinted[commentId];
                const now = Date.now();
                set(s => ({ [platform]: { ...s[platform], printed: newPrinted, lastPrintedAt: now } }));
                localStorage.setItem(`slp_webapp_printed_${platform}`, JSON.stringify(newPrinted));
                pushData(platform, 'printed', newPrinted, now);
            }
        },

        setCustomerNickname: (platform, rawUser, nickname) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const newNicknames = { ...state.nicknames };
            const cleanNick = (nickname || '').trim();
            const now = Date.now();

            const keysToDelete = Object.keys(newNicknames).filter(k => 
                k === user || 
                k === rawUser || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase()
            );

            if (cleanNick) {
                keysToDelete.forEach(k => { if (k !== user) delete newNicknames[k]; });
                newNicknames[user] = cleanNick;
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_nicknames_${platform}`) || '{}');
                    delete deletedMap[user];
                    delete deletedMap[rawUser];
                    delete deletedMap[user.toLowerCase()];
                    keysToDelete.forEach(k => delete deletedMap[k]);
                    localStorage.setItem(`slp_webapp_deleted_nicknames_${platform}`, JSON.stringify(deletedMap));
                } catch {}
                set(s => ({ [platform]: { ...s[platform], nicknames: newNicknames, lastNicknamesAt: now } }));
                localStorage.setItem(`slp_webapp_nicknames_${platform}`, JSON.stringify(newNicknames));
                pushData(platform, "nicknames", newNicknames, now);
            } else {
                // Xoá tên gợi nhớ vĩnh viễn (không bị merge lại từ thiết bị khác khi tải lại app)
                keysToDelete.forEach(k => delete newNicknames[k]);
                delete newNicknames[user];
                delete newNicknames[rawUser];

                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_nicknames_${platform}`) || '{}');
                    deletedMap[user] = now;
                    deletedMap[rawUser] = now;
                    deletedMap[user.toLowerCase()] = now;
                    keysToDelete.forEach(k => { deletedMap[k] = now; });
                    localStorage.setItem(`slp_webapp_deleted_nicknames_${platform}`, JSON.stringify(deletedMap));
                } catch {}

                set(s => ({ [platform]: { ...s[platform], nicknames: newNicknames, lastNicknamesAt: now } }));
                localStorage.setItem(`slp_webapp_nicknames_${platform}`, JSON.stringify(newNicknames));
                // Đồng bộ ngay lập tức để không bị mất khi đóng app tức thì
                pushData(platform, "nicknames", newNicknames, now, true);

                // Dọn sạch key này trên tất cả thiết bị trên Firebase RTDB
                deleteCustomerKeyFromRemote(platform, "nicknames", user);
                if (rawUser && rawUser !== user) {
                    deleteCustomerKeyFromRemote(platform, "nicknames", rawUser);
                }
            }
        },

        setCustomerPancakeLink: (platform, rawUser, link) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const currentLinks = state.pancakeLinks || {};
            const cleanLink = (link || '').trim();
            const newLinks = { ...currentLinks };
            const now = Date.now();

            const keysToDelete = Object.keys(newLinks).filter(k => 
                k === user || 
                k === rawUser || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase()
            );

            if (cleanLink) {
                keysToDelete.forEach(k => { if (k !== user) delete newLinks[k]; });
                newLinks[user] = cleanLink;
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_pancake_links_${platform}`) || '{}');
                    delete deletedMap[user];
                    delete deletedMap[rawUser];
                    keysToDelete.forEach(k => delete deletedMap[k]);
                    localStorage.setItem(`slp_webapp_deleted_pancake_links_${platform}`, JSON.stringify(deletedMap));
                } catch {}
                set(s => ({ [platform]: { ...s[platform], pancakeLinks: newLinks, lastPancakeLinksAt: now } }));
                localStorage.setItem(`slp_webapp_pancakelinks_${platform}`, JSON.stringify(newLinks));
                pushData(platform, "pancake_links", newLinks, now);
            } else {
                keysToDelete.forEach(k => delete newLinks[k]);
                delete newLinks[user];
                delete newLinks[rawUser];
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_pancake_links_${platform}`) || '{}');
                    deletedMap[user] = now;
                    deletedMap[rawUser] = now;
                    keysToDelete.forEach(k => { deletedMap[k] = now; });
                    localStorage.setItem(`slp_webapp_deleted_pancake_links_${platform}`, JSON.stringify(deletedMap));
                } catch {}
                set(s => ({ [platform]: { ...s[platform], pancakeLinks: newLinks, lastPancakeLinksAt: now } }));
                localStorage.setItem(`slp_webapp_pancakelinks_${platform}`, JSON.stringify(newLinks));
                pushData(platform, "pancake_links", newLinks, now, true);
                deleteCustomerKeyFromRemote(platform, "pancake_links", user);
            }
        },

        setFlowPrice: (platform, price, hostUser = '', content = '') => {
            const cleanPrice = (price || '').trim();
            const now = Date.now();
            if (cleanPrice) {
                addRecentClosedPrice(cleanPrice);
            }
            const flowObj: FlowPriceData | null = cleanPrice ? {
                price: cleanPrice,
                hostUser: hostUser ? normalizeUser(hostUser) : 'HOST',
                content: content || `${cleanPrice}k`,
                ts: now
            } : null;
            set(s => ({
                [platform]: {
                    ...s[platform],
                    flowPrice: flowObj,
                    lastFlowPriceAt: now
                }
            }));
            if (flowObj) {
                try {
                    localStorage.setItem(`slp_webapp_flowprice_${platform}`, JSON.stringify(flowObj));
                } catch {}
            } else {
                try {
                    localStorage.removeItem(`slp_webapp_flowprice_${platform}`);
                } catch {}
            }
            pushData(platform, 'flow_price', flowObj, now);
        },

        clearFlowPrice: (platform) => {
            const now = Date.now();
            set(s => ({
                [platform]: {
                    ...s[platform],
                    flowPrice: null,
                    lastFlowPriceAt: now
                }
            }));
            try {
                localStorage.removeItem(`slp_webapp_flowprice_${platform}`);
            } catch {}
            pushData(platform, 'flow_price', null, now);
        },

        setCustomerTag: (platform, rawUser, tag) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const prevTag = state.tags?.[user];
            const newTags = { ...state.tags, [user]: tag };
            const now = Date.now();
            
            // Nếu chọn tag chính GHE_LAY, tự động bật gheLayTags và tắt Ninh Thuận
            if (tag === 'GHE_LAY') {
                get().setCustomerGheLayTag(platform, user, true);
            } else if (prevTag === 'GHE_LAY') {
                get().setCustomerGheLayTag(platform, user, false);
            }

            // Check if user is set to HOST, auto-detect latest price from their comments
            let newFlowPrice = state.flowPrice;
            if (tag === 'HOST') {
                const hostComments = (state.comments || []).filter(c => normalizeUser(c.user) === user);
                for (const hc of hostComments) {
                    const contentStr = typeof hc.content === 'object' ? JSON.stringify(hc.content) : String(hc.content || '');
                    const extracted = extractPriceFromContent(contentStr);
                    if (extracted.price && extracted.price.trim() !== '') {
                        newFlowPrice = {
                            price: extracted.price.trim(),
                            hostUser: user,
                            content: contentStr,
                            ts: Number(hc.ts) || now
                        };
                        try {
                            localStorage.setItem(`slp_webapp_flowprice_${platform}`, JSON.stringify(newFlowPrice));
                        } catch {}
                        pushData(platform, 'flow_price', newFlowPrice, now);
                        break;
                    }
                }
            } else if (prevTag === 'HOST' && state.flowPrice?.hostUser === user) {
                // If Host unassigned, check if another HOST exists or clear
                const remainingFlow = detectHostFlowPrice(state.comments || [], newTags);
                newFlowPrice = remainingFlow;
                if (remainingFlow) {
                    try {
                        localStorage.setItem(`slp_webapp_flowprice_${platform}`, JSON.stringify(remainingFlow));
                    } catch {}
                } else {
                    try {
                        localStorage.removeItem(`slp_webapp_flowprice_${platform}`);
                    } catch {}
                }
                pushData(platform, 'flow_price', remainingFlow, now);
            }

            set(s => ({ 
                [platform]: { 
                    ...s[platform], 
                    tags: newTags, 
                    lastTagsAt: now,
                    flowPrice: newFlowPrice
                } 
            }));
            localStorage.setItem(`slp_webapp_tags_${platform}`, JSON.stringify(newTags));
            pushData(platform, 'tags', newTags, now);
            
            if (tag === 'COC' || tag === 'COC_100') {
                try {
                    const depositMap = JSON.parse(localStorage.getItem('slp_deposit_timestamps') || '{}');
                    depositMap[`${platform}_${user}`] = now;
                    localStorage.setItem('slp_deposit_timestamps', JSON.stringify(depositMap));
                } catch {}

                const newPinned = { ...state.pinned };
                let pinnedChanged = false;
                Object.keys(newPinned).forEach(commentId => {
                    if (newPinned[commentId].user === user) {
                        delete newPinned[commentId];
                        pinnedChanged = true;
                    }
                });
                if (pinnedChanged) {
                    set(s => ({ [platform]: { ...s[platform], pinned: newPinned, lastPinnedAt: now } }));
                    localStorage.setItem(`slp_webapp_pinned_${platform}`, JSON.stringify(newPinned));
                    pushData(platform, 'pinned', newPinned, now);
                }

                // TỰ ĐỘNG NHẢY BÌNH LUẬN CẢM ƠN KHI GẮN TAG CỌC
                if (prevTag !== 'COC' && prevTag !== 'COC_100') {
                    try {
                        const isAutoThankEnabled = localStorage.getItem('slp_auto_thank_deposit') !== 'false';
                        if (isAutoThankEnabled) {
                            const displayName = state.nicknames?.[user] || user;
                            const template = localStorage.getItem('slp_thank_deposit_template') || 'thanks {name} nha';
                            const thankContent = template
                                .replace(/\{name\}/gi, displayName)
                                .replace(/\{user\}/gi, displayName)
                                .replace(/\{nick\}/gi, displayName)
                                .replace(/\{ten\}/gi, displayName);

                            // 1. Gửi lệnh bình luận trực tiếp ra luồng Live (TikTok/FB)
                            get().repostComment(platform, thankContent);

                            // 2. Nhảy bình luận cảm ơn vào feed của phần mềm để chủ shop & các máy phụ thấy ngay
                            const thankComment: CommentData = {
                                id: `coc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                                user: '🤖 Bot Chốt Đơn',
                                content: `💧 ${thankContent}`,
                                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&fit=crop&q=80',
                                ts: Date.now(),
                                platform: platform,
                            };
                            get().addComment(platform, thankComment);
                        }
                    } catch (err) {
                        console.error('Lỗi khi tự động gửi bình luận cảm ơn cọc:', err);
                    }
                }
            }
        },

        toggleNinhThuanTag: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const currentVal = isCustomerNinhThuan(state.ninhThuanTags, user);
            const nextVal = !currentVal;
            get().setCustomerNinhThuanTag(platform, user, nextVal);
        },

        setCustomerNinhThuanTag: (platform, rawUser, enabled) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newNtTags = { ...(state.ninhThuanTags || {}) };
            const now = Date.now();
            const keysToHandle = Array.from(new Set([user, rawUser, user.toLowerCase()])).filter(Boolean);

            let newTags = state.tags ? { ...state.tags } : {};
            let tagsChanged = false;
            let newGheLayTags = state.gheLayTags ? { ...state.gheLayTags } : {};
            let gheLayChanged = false;

            if (enabled) {
                newNtTags[user] = true;
                // Xoá đánh dấu xoá cũ của Ninh Thuận nếu có
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_ninh_thuan_tags_${platform}`) || '{}');
                    keysToHandle.forEach(k => delete deletedMap[k]);
                    localStorage.setItem(`slp_webapp_deleted_ninh_thuan_tags_${platform}`, JSON.stringify(deletedMap));
                } catch {}

                // Ninh Thuận và Ghé lấy không chọn đồng thời -> Tự động tắt Ghé lấy triệt để
                keysToHandle.forEach(k => {
                    if (newGheLayTags[k]) {
                        delete newGheLayTags[k];
                        gheLayChanged = true;
                    }
                    if (newTags[k] === 'GHE_LAY') {
                        newTags[k] = 'NORMAL';
                        tagsChanged = true;
                    }
                });

                if (gheLayChanged || tagsChanged) {
                    try {
                        const delGlMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_ghe_lay_tags_${platform}`) || '{}');
                        keysToHandle.forEach(k => { delGlMap[k] = now; });
                        localStorage.setItem(`slp_webapp_deleted_ghe_lay_tags_${platform}`, JSON.stringify(delGlMap));
                    } catch {}
                    deleteCustomerKeyFromRemote(platform, 'ghe_lay_tags', user);
                    if (rawUser && rawUser !== user) deleteCustomerKeyFromRemote(platform, 'ghe_lay_tags', rawUser);
                }
            } else {
                // Tắt tag Ninh Thuận vĩnh viễn
                keysToHandle.forEach(k => delete newNtTags[k]);
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_ninh_thuan_tags_${platform}`) || '{}');
                    keysToHandle.forEach(k => { deletedMap[k] = now; });
                    localStorage.setItem(`slp_webapp_deleted_ninh_thuan_tags_${platform}`, JSON.stringify(deletedMap));
                } catch {}
                deleteCustomerKeyFromRemote(platform, 'ninh_thuan_tags', user);
                if (rawUser && rawUser !== user) deleteCustomerKeyFromRemote(platform, 'ninh_thuan_tags', rawUser);
            }

            set(s => ({
                [platform]: {
                    ...s[platform],
                    ninhThuanTags: newNtTags,
                    lastNinhThuanTagsAt: now,
                    ...(gheLayChanged ? { gheLayTags: newGheLayTags, lastGheLayTagsAt: now } : {}),
                    ...(tagsChanged ? { tags: newTags, lastTagsAt: now } : {})
                }
            }));

            localStorage.setItem(`slp_webapp_ninhthuan_${platform}`, JSON.stringify(newNtTags));
            pushData(platform, 'ninh_thuan_tags', newNtTags, now, true);

            if (gheLayChanged) {
                localStorage.setItem(`slp_webapp_ghelay_${platform}`, JSON.stringify(newGheLayTags));
                pushData(platform, 'ghe_lay_tags', newGheLayTags, now, true);
            }
            if (tagsChanged) {
                localStorage.setItem(`slp_webapp_tags_${platform}`, JSON.stringify(newTags));
                pushData(platform, 'tags', newTags, now, true);
            }
        },

        toggleGheLayTag: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const currentVal = isCustomerGheLay(state.gheLayTags, user, state.tags);
            const nextVal = !currentVal;
            get().setCustomerGheLayTag(platform, user, nextVal);
        },

        setCustomerGheLayTag: (platform, rawUser, enabled) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newGheLayTags = { ...(state.gheLayTags || {}) };
            const now = Date.now();
            const keysToHandle = Array.from(new Set([user, rawUser, user.toLowerCase()])).filter(Boolean);

            let newTags = state.tags ? { ...state.tags } : {};
            let tagsChanged = false;
            let newNtTags = state.ninhThuanTags ? { ...state.ninhThuanTags } : {};
            let ntChanged = false;

            if (enabled) {
                newGheLayTags[user] = true;
                // Xoá đánh dấu xoá cũ của Ghé lấy nếu có
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_ghe_lay_tags_${platform}`) || '{}');
                    keysToHandle.forEach(k => delete deletedMap[k]);
                    localStorage.setItem(`slp_webapp_deleted_ghe_lay_tags_${platform}`, JSON.stringify(deletedMap));
                } catch {}

                // Ghé lấy và Ninh Thuận không chọn đồng thời -> Tự động tắt Ninh Thuận triệt để
                keysToHandle.forEach(k => {
                    if (newNtTags[k]) {
                        delete newNtTags[k];
                        ntChanged = true;
                    }
                });

                if (ntChanged) {
                    try {
                        const delNtMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_ninh_thuan_tags_${platform}`) || '{}');
                        keysToHandle.forEach(k => { delNtMap[k] = now; });
                        localStorage.setItem(`slp_webapp_deleted_ninh_thuan_tags_${platform}`, JSON.stringify(delNtMap));
                    } catch {}
                    deleteCustomerKeyFromRemote(platform, 'ninh_thuan_tags', user);
                    if (rawUser && rawUser !== user) deleteCustomerKeyFromRemote(platform, 'ninh_thuan_tags', rawUser);
                }
            } else {
                // Tắt tag Ghé lấy vĩnh viễn
                keysToHandle.forEach(k => {
                    delete newGheLayTags[k];
                    if (newTags[k] === 'GHE_LAY') {
                        newTags[k] = 'NORMAL';
                        tagsChanged = true;
                    }
                });
                try {
                    const deletedMap = JSON.parse(localStorage.getItem(`slp_webapp_deleted_ghe_lay_tags_${platform}`) || '{}');
                    keysToHandle.forEach(k => { deletedMap[k] = now; });
                    localStorage.setItem(`slp_webapp_deleted_ghe_lay_tags_${platform}`, JSON.stringify(deletedMap));
                } catch {}
                deleteCustomerKeyFromRemote(platform, 'ghe_lay_tags', user);
                if (rawUser && rawUser !== user) deleteCustomerKeyFromRemote(platform, 'ghe_lay_tags', rawUser);
            }

            set(s => ({
                [platform]: {
                    ...s[platform],
                    gheLayTags: newGheLayTags,
                    lastGheLayTagsAt: now,
                    ...(ntChanged ? { ninhThuanTags: newNtTags, lastNinhThuanTagsAt: now } : {}),
                    ...(tagsChanged ? { tags: newTags, lastTagsAt: now } : {})
                }
            }));

            localStorage.setItem(`slp_webapp_ghelay_${platform}`, JSON.stringify(newGheLayTags));
            pushData(platform, 'ghe_lay_tags', newGheLayTags, now, true);

            if (ntChanged) {
                localStorage.setItem(`slp_webapp_ninhthuan_${platform}`, JSON.stringify(newNtTags));
                pushData(platform, 'ninh_thuan_tags', newNtTags, now, true);
            }
            if (tagsChanged) {
                localStorage.setItem(`slp_webapp_tags_${platform}`, JSON.stringify(newTags));
                pushData(platform, 'tags', newTags, now, true);
            }
        },

        recordOrder: (platform, rawUser, price, content, sourceCommentId) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };

            // Phân tích chính xác đơn giá, số lượng và tổng tiền (hỗ trợ "99", "99*2", "2*99", "99x2", ...)
            const { unitPrice, quantity: parsedQty, totalPrice } = parsePriceAndQuantity(price);
            if (unitPrice > 0) {
                addRecentClosedPrice(unitPrice);
            }
            if (!newCusts[user]) newCusts[user] = { count: 0, total: 0, lastTime: Date.now(), items: [], pastItems: [] };
            const cust = newCusts[user];
            
            const existingItems = deduplicateOrderItems(cust.items || []);

            // Kiểm tra xem đơn hàng cho bình luận này đã từng chốt trong giỏ chưa
            const existingItemIdx = sourceCommentId ? existingItems.findIndex(it => it.sourceCommentId === sourceCommentId) : -1;

            let updatedItems: OrderItem[];

            if (existingItemIdx >= 0) {
                // Người dùng bấm IN lần thứ 2, 3... trên cùng bình luận -> Tăng số lượng sản phẩm lên đúng số lần bấm in!
                const existing = existingItems[existingItemIdx];
                const baseUnitPrice = existing.unitPrice 
                    || (existing.quantity && existing.price ? Math.round(existing.price / existing.quantity) : existing.price) 
                    || (unitPrice > 0 ? unitPrice : totalPrice);
                const addQty = parsedQty > 0 ? parsedQty : 1;
                const newQty = (existing.quantity || 1) + addQty;
                const newLineTotal = baseUnitPrice * newQty;

                const updatedItem: OrderItem = {
                    ...existing,
                    content: existing.content || (content && content.trim() !== "" && content.trim() !== "(Không ghi chú)" ? content.trim() : ""),
                    unitPrice: baseUnitPrice,
                    quantity: newQty,
                    price: newLineTotal,
                    shipped: false
                };

                updatedItems = [...existingItems];
                updatedItems[existingItemIdx] = updatedItem;
            } else {
                // Thêm món mới vào giỏ hàng
                const newItemId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                const finalUnitPrice = unitPrice > 0 ? unitPrice : totalPrice;
                const finalQty = parsedQty > 0 ? parsedQty : 1;
                const finalLineTotal = totalPrice > 0 ? totalPrice : (finalUnitPrice * finalQty);

                // Bỏ qua nếu đơn giá và thành tiền đều <= 0 và không phải quà tặng (chặn tuyệt đối cộng dư 1 sản phẩm 0₫)
                const cleanContentCheck = (content && content.trim() !== "" && content.trim() !== "(Không ghi chú)") ? content.trim() : "";
                const isGiftContent = cleanContentCheck.toLowerCase().match(/tặng|tang|quà|qua|gift|free/);
                if (finalUnitPrice <= 0 && finalLineTotal <= 0 && !isGiftContent) {
                    return;
                }

                const newItem: OrderItem = {
                    id: newItemId,
                    content: cleanContentCheck,
                    unitPrice: finalUnitPrice,
                    quantity: finalQty,
                    price: finalLineTotal,
                    sourceCommentId: sourceCommentId || null,
                    createdAt: Date.now(),
                    shipped: false
                };
                updatedItems = [...existingItems, newItem];
            }

            newCusts[user] = {
                ...cust,
                count: updatedItems.reduce((sum, it) => sum + (it.quantity || 1), 0),
                total: updatedItems.reduce((sum, it) => sum + (it.price || 0), 0),
                lastTime: Date.now(),
                items: updatedItems
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        addCustomOrderItem: (platform, rawUser, itemData) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const unitPrice = Math.max(0, itemData.unitPrice || 0);
            const quantity = Math.max(1, itemData.quantity || 1);
            const totalLinePrice = itemData.price !== undefined && itemData.price > 0 
                ? itemData.price 
                : (unitPrice * quantity);

            const cleanContent = (itemData.content && itemData.content.trim() !== "" && itemData.content.trim() !== "(Không ghi chú)") ? itemData.content.trim() : "";
            const isGift = cleanContent.toLowerCase().match(/tặng|tang|quà|qua|gift|free/);
            if (unitPrice <= 0 && totalLinePrice <= 0 && !isGift) {
                return;
            }

            if (unitPrice > 0) {
                addRecentClosedPrice(unitPrice);
            }
            const matchingKey = Object.keys(newCusts).find(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            ) || user;
            if (!newCusts[matchingKey]) newCusts[matchingKey] = { count: 0, total: 0, lastTime: Date.now(), items: [], pastItems: [] };
            const cust = newCusts[matchingKey];
            const existingItems = deduplicateOrderItems(cust.items || []);

            const newItemId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const newItem: OrderItem = {
                id: newItemId,
                content: cleanContent,
                unitPrice,
                quantity,
                price: totalLinePrice,
                sourceCommentId: itemData.sourceCommentId || null,
                createdAt: Date.now(),
                shipped: false
            };

            const updatedItems = [...existingItems, newItem];

            newCusts[matchingKey] = {
                ...cust,
                count: updatedItems.reduce((sum, it) => sum + (it.quantity || 1), 0),
                total: updatedItems.reduce((sum, it) => sum + (it.price || 0), 0),
                lastTime: Date.now(),
                items: updatedItems
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);

            if (itemData.sourceCommentId) {
                get().markPrinted(platform, itemData.sourceCommentId);
                get().unpinComment(platform, itemData.sourceCommentId);
            }

            if (itemData.printNow) {
                const nickname = get()[platform].nicknames?.[user];
                const isGl = isCustomerGheLay(get()[platform].gheLayTags, user, get()[platform].tags);
                const time = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
                const printContent = newItem.content ? `${newItem.content} (${unitPrice}k x ${quantity})` : `(${unitPrice}k x ${quantity})`;
                printLabel(nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`, printContent, totalLinePrice, time, PLATFORMS[platform].label, true, isGl);
            }
        },

        addMultipleCustomOrderItems: (platform, rawUser, items, printNow = true) => {
            const user = normalizeUser(rawUser);
            if (!user || !items || items.length === 0) return;
            const validIncoming = items.filter(it => {
                const u = Math.max(0, it.unitPrice || 0);
                const p = it.price !== undefined ? it.price : 0;
                const c = (it.content || '').toLowerCase();
                const isGift = c.match(/tặng|tang|quà|qua|gift|free/);
                return u > 0 || p > 0 || isGift;
            });
            if (validIncoming.length === 0) return;

            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKey = Object.keys(newCusts).find(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            ) || user;
            if (!newCusts[matchingKey]) newCusts[matchingKey] = { count: 0, total: 0, lastTime: Date.now(), items: [], pastItems: [] };
            const cust = newCusts[matchingKey];
            const existingItems = deduplicateOrderItems(cust.items || []);

            const nowTime = Date.now();
            const createdOrderItems: OrderItem[] = validIncoming.map((it, idx) => {
                const unitPrice = Math.max(0, it.unitPrice || 0);
                const quantity = Math.max(1, it.quantity || 1);
                const totalLinePrice = it.price !== undefined && it.price > 0
                    ? it.price
                    : (unitPrice * quantity);

                if (unitPrice > 0) {
                    addRecentClosedPrice(unitPrice);
                }

                return {
                    id: `${nowTime}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
                    content: (it.content && it.content.trim() !== "" && it.content.trim() !== "(Không ghi chú)") ? it.content.trim() : "",
                    unitPrice,
                    quantity,
                    price: totalLinePrice,
                    sourceCommentId: it.sourceCommentId || null,
                    createdAt: nowTime + idx,
                    shipped: false
                };
            });

            const updatedItems = [...existingItems, ...createdOrderItems];

            newCusts[matchingKey] = {
                ...cust,
                count: updatedItems.reduce((sum, it) => sum + (it.quantity || 1), 0),
                total: updatedItems.reduce((sum, it) => sum + (it.price || 0), 0),
                lastTime: Date.now(),
                items: updatedItems
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);

            createdOrderItems.forEach(item => {
                if (item.sourceCommentId) {
                    get().markPrinted(platform, item.sourceCommentId);
                    get().unpinComment(platform, item.sourceCommentId);
                }
            });

            if (printNow) {
                const nickname = get()[platform].nicknames?.[user];
                const isGl = isCustomerGheLay(get()[platform].gheLayTags, user, get()[platform].tags);
                const time = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
                const customerLabel = nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`;
                
                createdOrderItems.forEach(item => {
                    const printContent = item.content ? `${item.content} (${item.unitPrice}k x ${item.quantity})` : `(${item.unitPrice}k x ${item.quantity})`;
                    printLabel(customerLabel, printContent, item.price, time, PLATFORMS[platform].label, true, isGl);
                });
            }
        },

        initCustomer: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            if (!newCusts[user]) {
                newCusts[user] = { count: 0, total: 0, lastTime: Date.now(), items: [], pastItems: [] };
                const now = Date.now();
                set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
                localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
                pushData(platform, 'customers', newCusts, now);
            }
        },
        updateCustomerStats: (platform, rawUser, newCount, newTotal) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            if (!newCusts[user]) return;
            const cust = newCusts[user];

            const targetCount = newCount >= 0 ? newCount : 0;
            const targetTotal = newTotal >= 0 ? newTotal : 0;
            const currentItems = cust.items || [];
            let updatedItems = [...currentItems];

            // Reconcile items array if count is manually adjusted
            const currentTotalQty = currentItems.reduce((s, it) => s + (it.quantity || 1), 0);
            const currentSum = currentItems.reduce((s, it) => s + (it.price || 0), 0);

            if (targetCount === 0) {
                updatedItems = [];
            } else if (targetCount > currentTotalQty && targetTotal > currentSum) {
                const diffCount = targetCount - currentTotalQty;
                const diffPrice = Math.max(0, targetTotal - currentSum);
                const avgPrice = diffCount > 0 ? Math.round(diffPrice / diffCount) : 0;
                if (avgPrice > 0) {
                    for (let i = 0; i < diffCount; i++) {
                        updatedItems.push({
                            id: `${Date.now()}_adj_${i}`,
                            content: `Đơn đã chốt (${avgPrice}k)`,
                            price: avgPrice,
                            unitPrice: avgPrice,
                            quantity: 1,
                            sourceCommentId: null,
                            createdAt: Date.now(),
                            shipped: false
                        });
                    }
                }
            } else if (targetCount < currentTotalQty && currentItems.length > 0) {
                // Giảm bớt nếu bị chỉnh giảm
                let remainingToKeep = targetCount;
                const trimmed: OrderItem[] = [];
                for (const it of currentItems) {
                    const q = it.quantity || 1;
                    if (remainingToKeep <= 0) break;
                    if (q <= remainingToKeep) {
                        trimmed.push(it);
                        remainingToKeep -= q;
                    } else {
                        const unitPrice = it.unitPrice || (it.price ? Math.round(it.price / q) : 0);
                        trimmed.push({
                            ...it,
                            quantity: remainingToKeep,
                            price: unitPrice * remainingToKeep
                        });
                        remainingToKeep = 0;
                        break;
                    }
                }
                updatedItems = trimmed;
            }

            newCusts[user] = {
                ...cust,
                count: targetCount,
                total: targetTotal,
                items: updatedItems,
                lastTime: Date.now(),
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        printNewOrder: (platform, rawUser, content, price, time, sourceCommentId, bypassDebounce, skipPrint, extraOptions) => {
            const user = normalizeUser(rawUser);
            get().recordOrder(platform, user, price, content, sourceCommentId);
            if (sourceCommentId) {
                get().markPrinted(platform, sourceCommentId);
                get().unpinComment(platform, sourceCommentId);
            }
            if (!skipPrint) {
                const nickname = get()[platform].nicknames?.[user];
                const isGl = isCustomerGheLay(get()[platform].gheLayTags, user, get()[platform].tags);
                const { unitPrice, quantity, totalPrice } = parsePriceAndQuantity(price);
                const printPrice = totalPrice > 0 ? totalPrice : (unitPrice > 0 ? unitPrice : (parseInt(String(price)) || 0));
                const formula = quantity > 1 ? `${unitPrice}*${quantity}` : String(printPrice);
                const printContent = quantity > 1 
                    ? (content ? `${content} (${unitPrice}k x ${quantity})` : `(${unitPrice}k x ${quantity})`)
                    : content;

                let phone = extraOptions?.phone;
                let province = extraOptions?.province;
                if (!phone || !province) {
                    const comments = get()[platform].comments || [];
                    const found = comments.find(c => c.id === sourceCommentId || normalizeUser(c.user) === user);
                    if (found) {
                        if (!phone && found.phone) phone = found.phone;
                        if (!province && (found.province || found.location)) province = found.province || found.location;
                    }
                }

                printLabel(
                    nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`, 
                    printContent, 
                    formula, 
                    time, 
                    PLATFORMS[platform].label, 
                    bypassDebounce, 
                    isGl,
                    {
                        phone,
                        province,
                        quantity,
                        unitPrice,
                        orderCount: extraOptions?.orderCount
                    }
                );
            }
        },

                toggleCurrentItemShipped: (platform, rawUser, itemIndex, forceState) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.items || !cust.items[itemIndex]) return;
            const newCusts = { ...state.customers };
            const newItems = [...cust.items];
            const isShipped = forceState !== undefined ? forceState : !newItems[itemIndex].shipped;
            newItems[itemIndex] = { ...newItems[itemIndex], shipped: isShipped };
            
            newCusts[user] = {
                ...cust,
                items: newItems,
                lastTime: Date.now()
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        markCurrentItemsShipped: (platform, rawUser, itemIndices, shippedState = true) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.items) return;
            const newCusts = { ...state.customers };
            const indicesToUpdate = itemIndices && itemIndices.length > 0
                ? new Set(itemIndices)
                : new Set(cust.items.map((_, i) => i));
            const newItems = cust.items.map((it, idx) => {
                if (indicesToUpdate.has(idx)) {
                    return { ...it, shipped: shippedState };
                }
                return it;
            });
            newCusts[user] = {
                ...cust,
                items: newItems,
                lastTime: Date.now()
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        archiveShippedCurrentItems: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.items) return;
            const newCusts = { ...state.customers };
            const now = Date.now();
            const shippedItems = cust.items.filter(it => it.shipped).map(it => ({ ...it, createdAt: it.createdAt || now }));
            const remainingItems = cust.items.filter(it => !it.shipped);
            if (shippedItems.length === 0) return;
            const existingPast = cust.pastItems || [];
            newCusts[user] = {
                ...cust,
                count: remainingItems.reduce((sum, it) => sum + (it.quantity || 1), 0),
                total: remainingItems.reduce((sum, it) => sum + (it.price || 0), 0),
                lastTime: now,
                items: remainingItems,
                pastItems: [...existingPast, ...shippedItems]
            };
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        markAllCustomerItemsShipped: (platform, rawUser, archiveToPast = false) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust) return;
            const newCusts = { ...state.customers };
            const now = Date.now();
            const currentItems = (cust.items || []).map(it => ({ ...it, shipped: true, createdAt: it.createdAt || now }));
            const existingPast = (cust.pastItems || []).map(it => ({ ...it, shipped: true }));
            
            if (archiveToPast) {
                newCusts[user] = {
                    ...cust,
                    count: 0,
                    total: 0,
                    lastTime: now,
                    items: [],
                    pastItems: [...existingPast, ...currentItems]
                };
            } else {
                newCusts[user] = {
                    ...cust,
                    items: currentItems,
                    lastTime: now
                };
            }
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        togglePastItemShipped: (platform, rawUser, itemIndex) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.pastItems || !cust.pastItems[itemIndex]) return;
            const newCusts = { ...state.customers };
            const newPastItems = [...cust.pastItems];
            newPastItems[itemIndex] = { ...newPastItems[itemIndex], shipped: !newPastItems[itemIndex].shipped };
            newCusts[user] = { ...cust, pastItems: newPastItems, lastTime: Date.now() };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        mergePastItems: (platform, rawUser, itemIndices) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.pastItems) return;
            const newCusts = { ...state.customers };
            const newItems = [...(cust.items || [])];
            const newPastItems = [...cust.pastItems];
            
            // Extract items to merge
            const itemsToMerge = itemIndices.map(idx => newPastItems[idx]);
            // Remove them from pastItems, sorting indices descending to avoid shifting issues
            itemIndices.sort((a,b) => b - a).forEach(idx => {
                newPastItems.splice(idx, 1);
            });
            
            // Add to items and update counts
            itemsToMerge.forEach(item => {
                const itemTime = item.createdAt || (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || Date.now();
                const d = new Date(itemTime);
                const dateStr = d.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'});
                // Gắn thêm ngày vào nội dung nếu chưa có
                const newContent = item.content.includes(`(${dateStr})`) ? item.content : `${item.content} (${dateStr})`;
                newItems.push({ ...item, content: newContent, id: Date.now().toString() + Math.random().toString(), createdAt: Date.now() });
            });
            
            newCusts[user] = {
                ...cust,
                items: newItems,
                pastItems: newPastItems,
                count: newItems.reduce((sum, it) => sum + (it.quantity || 1), 0),
                total: newItems.reduce((sum, it) => sum + (it.price || 0), 0),
                lastTime: Date.now()
            };
            
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        deletePastItems: (platform, user, itemIndices) => {
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.pastItems) return;
            const newCusts = { ...state.customers };
            const newPastItems = [...cust.pastItems];
            
            itemIndices.sort((a,b) => b - a).forEach(idx => {
                newPastItems.splice(idx, 1);
            });
            
            newCusts[user] = {
                ...cust,
                pastItems: newPastItems,
                lastTime: Date.now()
            };
            
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        clearShippedPastItems: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust) return;
            const newCusts = { ...state.customers };
            const now = Date.now();
            newCusts[user] = {
                ...cust,
                pastItems: []
            };
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        archiveCustomerItems: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust) return;
            const newCusts = { ...state.customers };
            const now = Date.now();
            const currentItems = cust.items || [];
            const existingPast = cust.pastItems || [];
            const archivedItems = currentItems.map(it => ({
                ...it,
                createdAt: it.createdAt || cust.lastTime || now,
                shipped: true
            }));
            newCusts[user] = {
                ...cust,
                count: 0,
                total: 0,
                lastTime: now,
                items: [],
                pastItems: [...existingPast, ...archivedItems]
            };
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        deleteOrderItem: (platform, rawUser, itemIndex, isPast = false, targetItemId?: string) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKey = Object.keys(newCusts).find(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            ) || user;
            const cust = newCusts[matchingKey];
            if (!cust) return;
            
            let removedCommentId: string | null = null;
            if (isPast) {
                const newPast = [...(cust.pastItems || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = newPast.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < newPast.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !newPast[targetIdx]) return;
                const removed = newPast[targetIdx];
                removedCommentId = removed.sourceCommentId;
                newPast.splice(targetIdx, 1);
                newCusts[matchingKey] = { ...cust, pastItems: newPast, lastTime: Date.now() };
            } else {
                const newItems = [...(cust.items || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = newItems.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < newItems.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !newItems[targetIdx]) return;
                const removed = newItems[targetIdx];
                removedCommentId = removed.sourceCommentId;
                newItems.splice(targetIdx, 1);
                
                const newCount = newItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
                const newTotal = newItems.reduce((sum, it) => sum + (it.price || 0), 0);
                
                newCusts[matchingKey] = { ...cust, count: newCount, total: newTotal, items: newItems, lastTime: Date.now() };
            }
            
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
            if (removedCommentId) {
                const remainingHasIt = 
                    (newCusts[matchingKey].items || []).some(it => it?.sourceCommentId === removedCommentId) ||
                    (newCusts[matchingKey].pastItems || []).some(it => it?.sourceCommentId === removedCommentId);
                if (!remainingHasIt) {
                    get().unmarkPrinted(platform, removedCommentId);
                }
            }
        },

        updateOrderItemQuantity: (platform, rawUser, itemIndex, newQty, isPast = false, targetItemId?: string) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKey = Object.keys(newCusts).find(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            ) || user;
            const cust = newCusts[matchingKey];
            if (!cust) return;

            if (isPast) {
                const newPast = [...(cust.pastItems || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = newPast.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < newPast.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !newPast[targetIdx]) return;

                if (newQty <= 0) {
                    newPast.splice(targetIdx, 1);
                } else {
                    const it = newPast[targetIdx];
                    const unitPrice = it.unitPrice || (it.quantity && it.price ? Math.round(it.price / it.quantity) : it.price) || 0;
                    newPast[targetIdx] = {
                        ...it,
                        unitPrice,
                        quantity: newQty,
                        price: unitPrice * newQty
                    };
                }
                newCusts[matchingKey] = { ...cust, pastItems: newPast, lastTime: Date.now() };
            } else {
                const newItems = [...(cust.items || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = newItems.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < newItems.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !newItems[targetIdx]) return;

                if (newQty <= 0) {
                    const removed = newItems[targetIdx];
                    newItems.splice(targetIdx, 1);
                    if (removed.sourceCommentId) {
                        get().unmarkPrinted(platform, removed.sourceCommentId);
                    }
                } else {
                    const it = newItems[targetIdx];
                    const unitPrice = it.unitPrice || (it.quantity && it.price ? Math.round(it.price / it.quantity) : it.price) || 0;
                    newItems[targetIdx] = {
                        ...it,
                        unitPrice,
                        quantity: newQty,
                        price: unitPrice * newQty
                    };
                }
                const newCount = newItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
                const newTotal = newItems.reduce((sum, it) => sum + (it.price || 0), 0);
                newCusts[matchingKey] = { ...cust, count: newCount, total: newTotal, items: newItems, lastTime: Date.now() };
            }

            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        updateOrderItemPriceAndQuantity: (platform, rawUser, itemIndex, newUnitPrice, newQty, isPast = false, targetItemId?: string) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKey = Object.keys(newCusts).find(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            ) || user;
            const cust = newCusts[matchingKey];
            if (!cust) return;

            const unitPrice = Math.max(0, newUnitPrice);
            const qty = Math.max(1, newQty);
            const totalLinePrice = unitPrice * qty;

            if (isPast) {
                const newPast = [...(cust.pastItems || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = newPast.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < newPast.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !newPast[targetIdx]) return;

                newPast[targetIdx] = {
                    ...newPast[targetIdx],
                    unitPrice,
                    quantity: qty,
                    price: totalLinePrice
                };
                newCusts[matchingKey] = { ...cust, pastItems: newPast, lastTime: Date.now() };
            } else {
                const newItems = [...(cust.items || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = newItems.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < newItems.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !newItems[targetIdx]) return;

                newItems[targetIdx] = {
                    ...newItems[targetIdx],
                    unitPrice,
                    quantity: qty,
                    price: totalLinePrice
                };
                const newCount = newItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
                const newTotal = newItems.reduce((sum, it) => sum + (it.price || 0), 0);
                newCusts[matchingKey] = { ...cust, count: newCount, total: newTotal, items: newItems, lastTime: Date.now() };
            }

            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        duplicateOrderItem: (platform, rawUser, itemIndex, isPast = false, targetItemId?: string) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKey = Object.keys(newCusts).find(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            ) || user;
            const cust = newCusts[matchingKey];
            if (!cust) return;

            if (isPast) {
                const list = [...(cust.pastItems || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = list.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < list.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !list[targetIdx]) return;

                const src = list[targetIdx];
                const unitPrice = src.unitPrice || (src.quantity && src.price ? Math.round(src.price / src.quantity) : src.price) || 0;
                const duplicated: OrderItem = {
                    id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    content: src.content || '',
                    unitPrice: unitPrice,
                    quantity: 1,
                    price: unitPrice,
                    sourceCommentId: null, // Tạo món độc lập mới
                    createdAt: Date.now(),
                    shipped: false
                };
                // Chèn ngay sau món được nhân bản
                list.splice(targetIdx + 1, 0, duplicated);
                newCusts[matchingKey] = { ...cust, pastItems: list, lastTime: Date.now() };
            } else {
                const list = [...(cust.items || [])];
                let targetIdx = -1;
                if (targetItemId) {
                    targetIdx = list.findIndex(it => it && (it.id === targetItemId || it.sourceCommentId === targetItemId));
                }
                if (targetIdx === -1 && itemIndex >= 0 && itemIndex < list.length) {
                    targetIdx = itemIndex;
                }
                if (targetIdx === -1 || !list[targetIdx]) return;

                const src = list[targetIdx];
                const unitPrice = src.unitPrice || (src.quantity && src.price ? Math.round(src.price / src.quantity) : src.price) || 0;
                const duplicated: OrderItem = {
                    id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    content: src.content || '',
                    unitPrice: unitPrice,
                    quantity: 1,
                    price: unitPrice,
                    sourceCommentId: null, // Tạo món độc lập mới trong giỏ
                    createdAt: Date.now(),
                    shipped: false
                };
                list.splice(targetIdx + 1, 0, duplicated);
                const newCount = list.reduce((sum, it) => sum + (it.quantity || 1), 0);
                const newTotal = list.reduce((sum, it) => sum + (it.price || 0), 0);
                newCusts[matchingKey] = { ...cust, count: newCount, total: newTotal, items: list, lastTime: Date.now() };
            }

            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        clearCustomerCart: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            
            const matchingKeys = Object.keys(newCusts).filter(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase() || 
                k.toLowerCase() === String(rawUser).toLowerCase() || 
                k.toLowerCase() === user.toLowerCase()
            );

            if (matchingKeys.length === 0 && !newCusts[user]) return;

            // Collect all sourceCommentIds
            const commentIdsToClear = new Set<string>();
            matchingKeys.forEach(k => {
                const c = newCusts[k];
                if (c) {
                    (c.items || []).forEach(it => { if (it?.sourceCommentId) commentIdsToClear.add(it.sourceCommentId); });
                    (c.pastItems || []).forEach(it => { if (it?.sourceCommentId) commentIdsToClear.add(it.sourceCommentId); });
                }
            });

            // Also check comments from this user in state.comments
            (state.comments || []).forEach(c => {
                if (c && normalizeUser(c.user) === user && state.printed?.[c.id]) {
                    commentIdsToClear.add(c.id);
                }
            });

            // Wipe out printed flags completely
            const newPrinted = { ...state.printed };
            commentIdsToClear.forEach(cid => {
                delete newPrinted[cid];
            });

            const now = Date.now();
            matchingKeys.forEach(k => {
                const c = newCusts[k];
                newCusts[k] = {
                    ...c,
                    count: 0,
                    total: 0,
                    items: [],
                    pastItems: [],
                    lastTime: now
                };
            });
            if (!newCusts[user]) {
                newCusts[user] = { count: 0, total: 0, items: [], pastItems: [], lastTime: now };
            }

            set(s => ({ 
                [platform]: { 
                    ...s[platform], 
                    customers: newCusts, 
                    lastCustomersAt: now,
                    printed: newPrinted,
                    lastPrintedAt: now
                } 
            }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            localStorage.setItem(`slp_webapp_printed_${platform}`, JSON.stringify(newPrinted));
            pushData(platform, 'customers', newCusts, now);
            pushData(platform, 'printed', newPrinted, now);
        },

        recordPushOrderHistory: (platform, rawUser, recordData) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKeys = Object.keys(newCusts).filter(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase()
            );
            const targetKey = matchingKeys[0] || user;
            const cust = newCusts[targetKey] || { count: 0, total: 0, items: [], pastItems: [], lastTime: Date.now() };

            const now = Date.now();
            const dateStr = new Date(now).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const totalQty = recordData.items.reduce((s, it) => s + (it.quantity || 1), 0);
            const totalPrice = recordData.items.reduce((s, it) => s + (it.price || 0), 0);

            const newRecord: PushHistoryRecord = {
                id: `push_${now}_${Math.random().toString(36).substring(2, 7)}`,
                timestamp: now,
                dateStr,
                orderNumber: recordData.orderNumber,
                pancakeOrderId: recordData.pancakeOrderId,
                items: recordData.items,
                totalQuantity: totalQty,
                totalPrice,
                shippingFee: recordData.shippingFee,
                prepaid: recordData.prepaid,
                status: 'pushed'
            };

            const existingHistory = cust.pushHistory || [];
            const updatedHistory = [newRecord, ...existingHistory].slice(0, 5);

            // Xoá các món đã đẩy khỏi items và pastItems
            // Khi đã đẩy đơn: nếu đẩy hết hoặc ngày đẩy đơn >= ngày chốt thì xoá sạch giỏ hàng ko còn giữ gì nữa
            const isClearAll = Boolean(recordData.clearAllCart) || 
                ((cust.items || []).length === 0 && (cust.pastItems || []).length === 0) ||
                ((recordData.pushedCurrentIndices?.length ?? 0) >= (cust.items || []).length && (recordData.pushedPastIndices?.length ?? 0) >= (cust.pastItems || []).length);

            const pushedIds = new Set(recordData.items.map(it => it.id).filter(Boolean));
            const remainingCurrent = isClearAll ? [] : (cust.items || []).filter((it, idx) => {
                if (recordData.pushedCurrentIndices?.includes(idx)) return false;
                if (it.id && pushedIds.has(it.id)) return false;
                return true;
            });
            const remainingPast = isClearAll ? [] : (cust.pastItems || []).filter((it, idx) => {
                if (recordData.pushedPastIndices?.includes(idx)) return false;
                if (it.id && pushedIds.has(it.id)) return false;
                return true;
            });
            const newCount = remainingCurrent.reduce((s, it) => s + (it.quantity || 1), 0);
            const newTotal = remainingCurrent.reduce((s, it) => s + (it.price || 0), 0);

            const updatedCust: CustomerData = {
                ...cust,
                items: remainingCurrent,
                pastItems: remainingPast,
                count: newCount,
                total: newTotal,
                pushHistory: updatedHistory,
                lastTime: now
            };

            matchingKeys.forEach(k => {
                newCusts[k] = updatedCust;
            });
            if (!newCusts[user]) {
                newCusts[user] = updatedCust;
            }

            // Lưu vào kho lưu trữ vĩnh viễn (Master Pushed Orders History) không bao giờ mất
            try {
                const masterRaw = localStorage.getItem('slp_pushed_orders_master_history');
                const masterList = masterRaw ? JSON.parse(masterRaw) : [];
                const masterRecord = {
                    ...newRecord,
                    user,
                    platform,
                    nickname: state.nicknames?.[user] || ''
                };
                localStorage.setItem('slp_pushed_orders_master_history', JSON.stringify([masterRecord, ...masterList.filter((m: any) => m.id !== newRecord.id)].slice(0, 500)));
            } catch {}

            set(s => ({ 
                [platform]: { 
                    ...s[platform], 
                    customers: newCusts, 
                    lastCustomersAt: now 
                } 
            }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        restorePushOrderRecord: (platform, rawUser, recordId) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKeys = Object.keys(newCusts).filter(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase()
            );
            const targetKey = matchingKeys[0] || user;
            const cust = newCusts[targetKey];
            if (!cust || !cust.pushHistory) return;

            const recIdx = cust.pushHistory.findIndex(r => r.id === recordId);
            if (recIdx === -1) return;

            const rec = cust.pushHistory[recIdx];
            const updatedHistory = [...cust.pushHistory];
            updatedHistory[recIdx] = { ...rec, status: 'restored' };

            // Khôi phục các sản phẩm vào phần đang giữ (pastItems)
            const now = Date.now();
            const restoredItems: OrderItem[] = rec.items.map(it => ({
                ...it,
                id: it.id || `restored_${now}_${Math.random().toString(36).substring(2, 7)}`,
                shipped: false,
                createdAt: it.createdAt || now
            }));

            const existingPast = cust.pastItems || [];
            const newPastItems = [...existingPast, ...restoredItems];

            const updatedCust: CustomerData = {
                ...cust,
                pastItems: newPastItems,
                pushHistory: updatedHistory,
                lastTime: now
            };

            matchingKeys.forEach(k => {
                newCusts[k] = updatedCust;
            });
            if (!newCusts[user]) {
                newCusts[user] = updatedCust;
            }

            set(s => ({ 
                [platform]: { 
                    ...s[platform], 
                    customers: newCusts, 
                    lastCustomersAt: now 
                } 
            }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        deletePushOrderRecord: (platform, rawUser, recordId) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const newCusts = { ...state.customers };
            const matchingKeys = Object.keys(newCusts).filter(k => 
                k === rawUser || 
                k === user || 
                normalizeUser(k) === user || 
                normalizeUser(k).toLowerCase() === user.toLowerCase()
            );
            const targetKey = matchingKeys[0] || user;
            const cust = newCusts[targetKey];
            if (!cust || !cust.pushHistory) return;

            const updatedHistory = cust.pushHistory.filter(r => r.id !== recordId);
            const now = Date.now();
            const updatedCust: CustomerData = {
                ...cust,
                pushHistory: updatedHistory,
                lastTime: now
            };

            matchingKeys.forEach(k => {
                newCusts[k] = updatedCust;
            });
            if (!newCusts[user]) {
                newCusts[user] = updatedCust;
            }

            set(s => ({ 
                [platform]: { 
                    ...s[platform], 
                    customers: newCusts, 
                    lastCustomersAt: now 
                } 
            }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        groupCustomerItemsByPrice: (platform, rawUser, isPast = false) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust) return;
            const newCusts = { ...state.customers };
            const now = Date.now();

            if (isPast) {
                const past = cust.pastItems || [];
                if (past.length <= 1) return;
                const priceMap = new Map<number, OrderItem>();
                for (const it of past) {
                    const qty = Math.max(1, it.quantity || 1);
                    const unitPrice = it.unitPrice || (it.price ? Math.round(it.price / qty) : 0);
                    if (priceMap.has(unitPrice)) {
                        const ex = priceMap.get(unitPrice)!;
                        ex.quantity = (ex.quantity || 1) + qty;
                        ex.price = unitPrice * ex.quantity;
                        if (it.content && !ex.content.includes(it.content)) {
                            if (!ex.content || ex.content.startsWith('Sản phẩm ')) {
                                ex.content = it.content;
                            } else {
                                ex.content = `${ex.content}, ${it.content}`;
                            }
                        }
                    } else {
                        priceMap.set(unitPrice, {
                            ...it,
                            unitPrice,
                            quantity: qty,
                            price: unitPrice * qty
                        });
                    }
                }
                newCusts[user] = {
                    ...cust,
                    pastItems: Array.from(priceMap.values()),
                    lastTime: now
                };
            } else {
                const current = cust.items || [];
                if (current.length <= 1) return;
                const priceMap = new Map<number, OrderItem>();
                for (const it of current) {
                    const qty = Math.max(1, it.quantity || 1);
                    const unitPrice = it.unitPrice || (it.price ? Math.round(it.price / qty) : 0);
                    if (priceMap.has(unitPrice)) {
                        const ex = priceMap.get(unitPrice)!;
                        ex.quantity = (ex.quantity || 1) + qty;
                        ex.price = unitPrice * ex.quantity;
                        if (it.content && !ex.content.includes(it.content)) {
                            if (!ex.content || ex.content.startsWith('Sản phẩm ')) {
                                ex.content = it.content;
                            } else {
                                ex.content = `${ex.content}, ${it.content}`;
                            }
                        }
                    } else {
                        priceMap.set(unitPrice, {
                            ...it,
                            unitPrice,
                            quantity: qty,
                            price: unitPrice * qty
                        });
                    }
                }
                const grouped = Array.from(priceMap.values());
                const newCount = grouped.reduce((sum, it) => sum + (it.quantity || 1), 0);
                const newTotal = grouped.reduce((sum, it) => sum + (it.price || 0), 0);
                newCusts[user] = {
                    ...cust,
                    items: grouped,
                    count: newCount,
                    total: newTotal,
                    lastTime: now
                };
            }

            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(`slp_webapp_session_${platform}`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },

        resetSession: () => {
            const now = Date.now();
            const platforms: Platform[] = ['tiktok', 'facebook', 'shopee'];
            
            let totalRev = 0;
            let totalOrd = 0;
            let newCust = 0;
            let retCust = 0;
            platforms.forEach(p => {
                const custs = get()[p].customers;
                Object.entries(custs).forEach(([user, data]) => {
                    const c = data as CustomerData;
                    if (c.count > 0) {
                        totalRev += c.total;
                        totalOrd += c.count;
                        if (get()[p].tags[user] === 'VIP') retCust++;
                        else newCust++;
                    }
                });
            });
            
            if (totalOrd > 0) {
                const entry = {
                    id: now.toString(),
                    date: new Date().toISOString(),
                    totalRevenue: totalRev,
                    totalOrders: totalOrd,
                    newCustomers: newCust,
                    returningCustomers: retCust
                };
                set(s => {
                    const newHistory = [entry, ...s.history].slice(0, 30);
                    localStorage.setItem('slp_webapp_history', JSON.stringify(newHistory));
                    return { history: newHistory };
                });
            }

            platforms.forEach(p => {
                const state = get()[p];
                const newCusts = { ...state.customers };
                const newTags = { ...state.tags };
                let tagsChanged = false;

                Object.keys(newCusts).forEach(name => {
                    const cust = newCusts[name];
                    const currentItems = cust.items || [];
                    const existingPastItems = cust.pastItems || [];

                    // Reconcile items to ensure no orders are lost when archiving
                    let itemsToArchive = currentItems.map(it => ({
                        ...it,
                        createdAt: it.createdAt || cust.lastTime || now
                    }));

                    const currentItemTotalQty = itemsToArchive.reduce((s, it) => s + (it.quantity || 1), 0);
                    const currentSum = itemsToArchive.reduce((s, it) => s + (it.price || 0), 0);

                    if (cust.count > currentItemTotalQty && cust.total > currentSum) {
                        const diffCount = Math.max(0, cust.count - currentItemTotalQty);
                        const diffPrice = Math.max(0, cust.total - currentSum);
                        const avgPrice = diffCount > 0 ? Math.round(diffPrice / diffCount) : 0;
                        if (avgPrice > 0) {
                            for (let i = 0; i < diffCount; i++) {
                                itemsToArchive.push({
                                    id: `${now}_archive_${i}`,
                                    content: `Đơn đã chốt (${avgPrice}k)`,
                                    price: avgPrice,
                                    unitPrice: avgPrice,
                                    quantity: 1,
                                    sourceCommentId: null,
                                    createdAt: cust.lastTime || now,
                                    shipped: false
                                });
                            }
                        }
                    }

                    // Keep past items safely for at least 60 days
                    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
                    const mergedPastItems = [...existingPastItems, ...itemsToArchive].filter(item => {
                        const t = item.createdAt || (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || cust.lastTime || now;
                        return t >= sixtyDaysAgo;
                    });

                    newCusts[name] = { 
                        ...cust,
                        count: 0, 
                        total: 0, 
                        lastTime: now, 
                        items: [],
                        pastItems: mergedPastItems,
                        pushHistory: cust.pushHistory || []
                    };
                    
                    if (newTags[name] === 'COC' || newTags[name] === 'COC_100') {
                        newTags[name] = 'VIP';
                        tagsChanged = true;
                    }
                });
                
                set(s => ({ [p]: { ...s[p], comments: [], customers: newCusts, printed: {}, pinned: {}, lastCommentsAt: now, lastCustomersAt: now, lastPrintedAt: now, lastPinnedAt: now, ...(tagsChanged ? { tags: newTags, lastTagsAt: now } : {}) } }));
                localStorage.setItem(`slp_webapp_session_${p}`, JSON.stringify(newCusts));
                localStorage.setItem(`slp_webapp_printed_${p}`, JSON.stringify({}));
                localStorage.setItem(`slp_webapp_pinned_${p}`, JSON.stringify({}));
                if (tagsChanged) localStorage.setItem(`slp_webapp_tags_${p}`, JSON.stringify(newTags));
                
                pushData(p, 'comments', [], now);
                pushData(p, 'customers', newCusts, now);
                pushData(p, 'printed', {}, now);
                pushData(p, 'pinned', {}, now);
                if (tagsChanged) pushData(p, 'tags', newTags, now);
            });
        },

        clearFeed: (targetPlatform?: Platform) => {
            const now = Date.now();
            const platforms: Platform[] = targetPlatform ? [targetPlatform] : ['tiktok', 'facebook', 'shopee'];

            if (!targetPlatform) {
                setGlobalFeedClearedAt(now);
                setLiveCycleStartedAt(now);
            }

            platforms.forEach(p => {
                setFeedClearedAt(p, now);
                savePlatformComments(p, []);
                set(s => ({ [p]: { ...s[p], comments: [], lastCommentsAt: now } }));
                const room = PLATFORMS[p].room;

                // Xoá trực tiếp Firebase RTDB cho phòng này
                fbPut(`rooms/${room}/comments`, { data: [], updatedAt: now, clearedAt: now, deviceId: DEVICE_ID }).catch(() => {});
                fbPut(`rooms/${room}/cleared_at`, { clearedAt: now, updatedAt: now, deviceId: DEVICE_ID }).catch(() => {});
                // Gửi tín hiệu xoá feed đến Armbian TV box qua target_channel
                fbPut(`rooms/${room}/target_channel`, { action: "clear_feed", clearedAt: now, requestedAt: now }).catch(() => {});
            });

            try {
                localStorage.setItem('slp_webapp_last_reset', new Date().toLocaleDateString('en-GB'));
            } catch {}

            // Kích hoạt xoá cache bình luận trên backend server (SSE và API status)
            try {
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                fetch(`${baseUrl}/api/tiktok/clear-comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clearedAt: now, platform: targetPlatform || 'all' })
                }).catch(() => {});
                fetch(`${baseUrl}/api/facebook/clear-comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clearedAt: now, platform: targetPlatform || 'all' })
                }).catch(() => {});
            } catch {}
        },

        clearPreviousDayLive: () => {
            const now = Date.now();
            try {
                localStorage.removeItem('slp_manual_session_breaks');
            } catch {}
            (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
                savePlatformComments(p, []);
            });
            setGlobalFeedClearedAt(now);
            setLiveCycleStartedAt(now);
            get().clearFeed();
        },

        startNewSession: () => {
            const now = Date.now();
            try {
                const val = localStorage.getItem('slp_manual_session_breaks');
                const parsed = val ? JSON.parse(val) : [];
                const updated = Array.isArray(parsed) ? [...parsed, now] : [now];
                localStorage.setItem('slp_manual_session_breaks', JSON.stringify(updated));
            } catch {}
        },

        addComment: (platform: Platform, comment: CommentData) => {
            const now = Date.now();
            const commentTs = comment.ts || now;
            const effectiveClearedAt = getFeedClearedAt(platform);
            // Chỉ thêm comment của ngày hôm nay và mới hơn thời điểm xóa feed
            if (!isCommentFromToday(commentTs)) return;
            if (effectiveClearedAt > 0 && commentTs <= effectiveClearedAt) return;

            const state = get()[platform];
            const prev = (state.comments || []).filter(c => 
                isCommentFromToday(c.ts || 0) && (!effectiveClearedAt || (c.ts || 0) > effectiveClearedAt)
            );
            const cleanUser = normalizeUser(comment.user);
            const cleanContent = typeof comment.content === 'object' ? JSON.stringify(comment.content) : String(comment.content || '');
            const isDuplicate = prev.some(c => 
                (c.id && comment.id && c.id === comment.id) ||
                (normalizeUser(c.user).toLowerCase() === cleanUser.toLowerCase() &&
                 String(c.content || '').trim().toLowerCase() === cleanContent.trim().toLowerCase() &&
                 Math.abs((c.ts || 0) - commentTs) <= 20000)
            );
            if (isDuplicate) return;
            const cleanAvatar = comment.avatar || (typeof comment.user === 'object' && ((comment.user as any).profilePictureUrl || (comment.user as any).avatarThumb?.urlList?.[0])) || '';
            if (cleanAvatar) {
                registerCustomerAvatar(cleanUser, cleanAvatar, platform);
            }
            const normalizedComment: CommentData = {
                ...comment,
                user: cleanUser,
                content: cleanContent,
                avatar: cleanAvatar,
                ts: commentTs
            };
            const updated = [normalizedComment, ...prev].slice(0, 2000);
            
            // TÍNH NĂNG FLOW GIÁ: Bắt giá tự động khi nick HOST gắn vương miện bình luận có giá
            const isHost = state.tags && state.tags[cleanUser] === 'HOST';
            let newFlowPrice = state.flowPrice;
            if (isHost) {
                const extracted = extractPriceFromContent(cleanContent);
                if (extracted.price && extracted.price.trim() !== '') {
                    newFlowPrice = {
                        price: extracted.price.trim(),
                        hostUser: cleanUser,
                        content: cleanContent,
                        ts: commentTs
                    };
                    try {
                        localStorage.setItem(`slp_webapp_flowprice_${platform}`, JSON.stringify(newFlowPrice));
                    } catch {}
                    pushData(platform, 'flow_price', newFlowPrice, now);
                }
            }

            savePlatformComments(platform, updated);
            set(s => ({ [platform]: { ...s[platform], comments: updated, lastCommentsAt: now, flowPrice: newFlowPrice } }));
            pushData(platform, 'comments', updated, now);
        }
    };
});

export function isCustomerNinhThuan(ninhThuanTags?: Record<string, boolean>, user?: string): boolean {
    if (!ninhThuanTags || !user) return false;
    const clean = normalizeUser(user);
    const cleanLower = clean.toLowerCase();
    const userLower = user.toLowerCase();
    return Boolean(
        ninhThuanTags[clean] || 
        ninhThuanTags[user] || 
        ninhThuanTags[cleanLower] || 
        ninhThuanTags[userLower]
    );
}

export function isCustomerGheLay(gheLayTags?: Record<string, boolean>, user?: string, tags?: Record<string, TagType>): boolean {
    if (!user) return false;
    const clean = normalizeUser(user);
    const cleanLower = clean.toLowerCase();
    const userLower = user.toLowerCase();
    if (gheLayTags && (gheLayTags[clean] || gheLayTags[user] || gheLayTags[cleanLower] || gheLayTags[userLower])) return true;
    if (tags && (tags[clean] === 'GHE_LAY' || tags[user] === 'GHE_LAY' || tags[cleanLower] === 'GHE_LAY' || tags[userLower] === 'GHE_LAY')) return true;
    return false;
}

