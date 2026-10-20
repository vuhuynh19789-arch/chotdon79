import React, { useState, useMemo, useEffect } from 'react';
import { 
    Clock, 
    Check, 
    Copy, 
    ArrowUpRight, 
    Tag, 
    ExternalLink, 
    Sparkles, 
    Send,
    Bell,
    CheckCircle2,
    Calendar
} from 'lucide-react';
import { useStore, OrderItem, PushHistoryRecord, getCustomerAvatar } from '../store';
import { PLATFORMS, Platform, normalizeUser, getShortId, removeVietnameseAccents } from '../lib/core';
import { CustomerAvatar } from './UserAvatar';
import { openPancakeApp } from '../lib/pancakeDeepLink';
import { getCustomerInsight, formatDateTime, parseOrderTimestamp, getVietnamDateString } from '../lib/pancakeSync';
import { PancakeOrderPushModal } from './PancakeOrderPushModal';

interface AlertsHubProps {
    searchKeyword?: string;
    onOpenProfile: (user: string, platform: Platform) => void;
    onOpenPrice?: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
    onOpenPancakeLink?: (user: string, platform: Platform, initialSearch?: string) => void;
    onScroll?: (isDown: boolean) => void;
    onClose?: () => void;
    isPage?: boolean;
}

type TabType = 'all' | 'remind' | 'push' | 'deposit';

// 1. Nhắc khách item
interface RemindCustomerItem {
    type: 'remind';
    id: string;
    timestamp: number;
    user: string;
    platform: Platform;
    displayName: string;
    nickname?: string;
    avatarUrl?: string;
    tag: string;
    totalAmountK: number;
    daysHeld: number;
    orderDateStr: string;
    activeItems: OrderItem[];
    primaryItem?: OrderItem;
    pLink?: string;
}

// 2. Đẩy đơn item
interface PushSuccessItem {
    type: 'push';
    id: string;
    timestamp: number;
    user: string;
    platform: Platform;
    displayName: string;
    nickname?: string;
    avatarUrl?: string;
    tag: string;
    qty: number;
    priceK: number;
    record: PushHistoryRecord;
    pLink?: string;
}

// 3. Cọc item
interface DepositItem {
    type: 'deposit';
    id: string;
    timestamp: number;
    user: string;
    platform: Platform;
    displayName: string;
    nickname?: string;
    avatarUrl?: string;
    tag: string;
    amountText: string;
    pLink?: string;
    timeAgoText: string;
}

type NotificationItem = RemindCustomerItem | PushSuccessItem | DepositItem;

// Helper format date: DD/MM/YYYY
function formatDateDDMM(ts: number): string {
    if (!ts) return 'Hôm nay';
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

// Helper format relative time
function formatRelativeTime(ts: number, now: number): string {
    if (!ts) return 'Vừa xong';
    const diffMs = now - ts;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'Vừa xong';
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Hôm qua';
    return `${diffDays} ngày trước`;
}

// Pancake Logo icon component
function PancakeLogo({ className = "w-4 h-4" }: { className?: string }) {
    return (
        <span className={`inline-flex items-center justify-center font-bold text-sm select-none ${className}`}>
            🥞
        </span>
    );
}

export function AlertsHubModal({
    searchKeyword = '',
    onOpenProfile,
    onOpenPrice,
    onOpenPancakeLink,
    onScroll,
    onClose,
    isPage = false
}: AlertsHubProps) {
    const store = useStore();
    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
    const [copiedCustomer, setCopiedCustomer] = useState<string | null>(null);

    // State for quick deposit add
    const [depositSearchUser, setDepositSearchUser] = useState('');
    const [depositPlatform, setDepositPlatform] = useState<Platform>('tiktok');

    // Push Target state
    const [pushTarget, setPushTarget] = useState<{
        user: string;
        platform: Platform;
        selectedCurrent: Set<number>;
        selectedPast: Set<number>;
    } | null>(null);

    const now = Date.now();
    const query = (searchKeyword || '').trim().toLowerCase();
    const queryNoAccent = removeVietnameseAccents(query);

    // =========================================================================
    // 1. NHẮC KHÁCH: Khách có 1c giữ quá 3 ngày (activeItems = 1, daysHeld >= 3)
    // =========================================================================
    const remindList = useMemo<RemindCustomerItem[]>(() => {
        const list: RemindCustomerItem[] = [];

        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
            if (platformFilter !== 'all' && p !== platformFilter) return;
            const pStore = store[p];
            if (!pStore) return;
            const custs = pStore.customers || {};
            const pTags = pStore.tags || {};
            const pNicks = pStore.nicknames || {};
            const pLinks = pStore.pancakeLinks || {};

            Object.keys(custs).forEach(rawUser => {
                const user = normalizeUser(rawUser);
                const cust = custs[rawUser];
                if (!cust) return;

                let activeInsight: any = null;
                try {
                    activeInsight = getCustomerInsight(user);
                } catch {
                    activeInsight = null;
                }

                const pushHistory = Array.isArray(cust.pushHistory) ? cust.pushHistory : [];
                const latestUnrestoredPush = pushHistory.find((h: any) => h && h.status !== 'restored');
                const latestPushTime = Number(latestUnrestoredPush?.timestamp) || 0;
                const pushDayVNStr = latestPushTime > 0 ? getVietnamDateString(latestPushTime) : '';

                const orders = (activeInsight?.ordersHistory && Array.isArray(activeInsight.ordersHistory))
                    ? activeInsight.ordersHistory
                    : (activeInsight?.latestOrder ? [activeInsight.latestOrder] : []);
                const latestPancakeOrder = orders && orders[0] ? orders[0] : null;
                const latestPancakeTime = latestPancakeOrder ? parseOrderTimestamp(latestPancakeOrder.insertedAt || latestPancakeOrder.updatedAt || '') : 0;
                const pancakeDayVNStr = latestPancakeTime > 0 ? getVietnamDateString(latestPancakeTime) : '';

                const getItemTimestamp = (it: OrderItem | any): number => {
                    if (!it) return Number(cust.lastTime) || 0;
                    if (it.createdAt) return Number(it.createdAt);
                    if (it.id) {
                        const match = String(it.id).match(/^(\d{13})/);
                        if (match) return parseInt(match[1], 10);
                    }
                    return Number(cust.lastTime) || 0;
                };

                const isActiveItem = (it: OrderItem | any) => {
                    if (!it || it.shipped) return false;
                    const itTime = getItemTimestamp(it);
                    if (!itTime) return false;
                    const itDayVNStr = getVietnamDateString(itTime);

                    if (latestPushTime > 0) {
                        if (pushDayVNStr && itDayVNStr && pushDayVNStr >= itDayVNStr) return false;
                        if (itTime <= latestPushTime + 60000) return false;
                    }
                    if (latestPancakeTime > 0) {
                        if (pancakeDayVNStr && itDayVNStr && pancakeDayVNStr >= itDayVNStr) return false;
                        if (itTime <= latestPancakeTime + 120000) return false;
                    }
                    return true;
                };

                const rawCurrent = Array.isArray(cust.items) ? cust.items : [];
                const rawPast = Array.isArray(cust.pastItems) ? cust.pastItems : [];
                const currentActive = rawCurrent.filter(isActiveItem);
                const pastActive = rawPast.filter(isActiveItem);
                const allActive = [...currentActive, ...pastActive];

                // YÊU CẦU 1: Đúng 1 cái
                if (allActive.length !== 1) return;

                // Tìm thời gian ngày chốt của món
                const primaryItem = allActive[0];
                if (!primaryItem) return;

                const oldestTs = getItemTimestamp(primaryItem) || Number(cust.lastTime) || now;
                const diffMs = now - oldestTs;

                // Giữ quá 3 ngày (>= 3 ngày hoặc 3 * 86400000)
                const isOver3Days = diffMs >= 3 * 86400000;
                if (!isOver3Days) return;

                const daysHeld = Math.max(3, Math.floor(diffMs / 86400000));
                const orderDateStr = formatDateDDMM(oldestTs);
                const totalAmountK = Number(primaryItem.price) || 0;

                const tag = pTags[user] || 'NORMAL';
                const avatarUrl = getCustomerAvatar(user, p) || undefined;
                const nickname = pNicks[user];
                const displayName = nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`;
                const pLink = pLinks[user];

                if (query) {
                    const userLower = user.toLowerCase();
                    const userNoAcc = removeVietnameseAccents(userLower);
                    const nickLower = (nickname || '').toLowerCase();
                    const nickNoAcc = removeVietnameseAccents(nickLower);
                    const shortId = getShortId(user).toLowerCase();
                    const matchesUser = userLower.includes(query) || userNoAcc.includes(queryNoAccent) || nickLower.includes(query) || nickNoAcc.includes(queryNoAccent) || shortId === query || ('#' + shortId) === query;
                    const matchesItem = (primaryItem.content || '').toLowerCase().includes(query);
                    if (!matchesUser && !matchesItem) return;
                }

                list.push({
                    type: 'remind',
                    id: `remind-${p}-${user}`,
                    timestamp: oldestTs,
                    user,
                    platform: p,
                    displayName,
                    nickname,
                    avatarUrl,
                    tag,
                    totalAmountK,
                    daysHeld,
                    orderDateStr,
                    activeItems: allActive,
                    primaryItem,
                    pLink
                });
            });
        });

        // Sắp xếp giữ lâu nhất lên đầu
        return list.sort((a, b) => (Number(b.daysHeld) || 0) - (Number(a.daysHeld) || 0));
    }, [store, platformFilter, query, queryNoAccent, now]);

    // =========================================================================
    // 2. ĐẨY ĐƠN: Avatar [Tên] vừa đẩy đơn thành công 2sp: 189k, xem đơn tại pancake
    // =========================================================================
    const pushSuccessList = useMemo<PushSuccessItem[]>(() => {
        const list: PushSuccessItem[] = [];

        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
            if (platformFilter !== 'all' && p !== platformFilter) return;
            const pStore = store[p];
            if (!pStore) return;
            const custs = pStore.customers || {};
            const pTags = pStore.tags || {};
            const pNicks = pStore.nicknames || {};
            const pLinks = pStore.pancakeLinks || {};

            Object.keys(custs).forEach(rawUser => {
                const user = normalizeUser(rawUser);
                const cust = custs[rawUser];
                if (!cust || !Array.isArray(cust.pushHistory) || cust.pushHistory.length === 0) return;

                const tag = pTags[user] || 'NORMAL';
                const avatarUrl = getCustomerAvatar(user, p) || undefined;
                const nickname = pNicks[user];
                const displayName = nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`;
                const pLink = pLinks[user];

                cust.pushHistory.forEach((rec, recIdx) => {
                    if (!rec || rec.status === 'restored') return; // Bỏ qua đơn đã hoàn lại

                    const recItems = Array.isArray(rec.items) ? rec.items : [];
                    const qty = Number(rec.totalQuantity) || recItems.reduce((sum, it) => sum + (Number(it?.quantity) || 1), 0);
                    const priceK = Number(rec.totalPrice) || Number((rec as any).totalAmountK) || 0;
                    const recTimestamp = Number(rec.timestamp) || now;

                    if (query) {
                        const userLower = user.toLowerCase();
                        const userNoAcc = removeVietnameseAccents(userLower);
                        const nickLower = (nickname || '').toLowerCase();
                        const orderNum = (rec.orderNumber || '').toLowerCase();
                        const pancakeId = (rec.pancakeOrderId || '').toLowerCase();
                        const matchesUser = userLower.includes(query) || userNoAcc.includes(queryNoAccent) || nickLower.includes(query);
                        const matchesOrder = orderNum.includes(query) || pancakeId.includes(query);
                        const matchesItem = recItems.some(it => (it?.content || '').toLowerCase().includes(query));
                        if (!matchesUser && !matchesOrder && !matchesItem) return;
                    }

                    list.push({
                        type: 'push',
                        id: `push-${rec.id || `${user}-${recTimestamp}-${recIdx}`}`,
                        timestamp: recTimestamp,
                        user,
                        platform: p,
                        displayName,
                        nickname,
                        avatarUrl,
                        tag,
                        qty,
                        priceK,
                        record: rec,
                        pLink
                    });
                });
            });
        });

        // 2. Bổ sung từ Master History trong LocalStorage nếu có đơn bị sót do reset phiên
        try {
            const masterRaw = localStorage.getItem('slp_pushed_orders_master_history');
            if (masterRaw) {
                const masterList = JSON.parse(masterRaw);
                if (Array.isArray(masterList)) {
                    const existingPushIds = new Set(list.map(it => it.record?.id || it.id));
                    masterList.forEach((mRec: any) => {
                        if (!mRec || mRec.status === 'restored') return;
                        const recId = mRec.id;
                        if (recId && existingPushIds.has(recId)) return;

                        const p = (mRec.platform || 'tiktok') as Platform;
                        if (platformFilter !== 'all' && p !== platformFilter) return;

                        const user = normalizeUser(mRec.user || '');
                        const pStore = store[p];
                        const nickname = mRec.nickname || pStore?.nicknames?.[user] || '';
                        const displayName = nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`;
                        const tag = pStore?.tags?.[user] || 'NORMAL';
                        const avatarUrl = getCustomerAvatar(user, p) || undefined;
                        const pLink = pStore?.pancakeLinks?.[user];
                        const recItems = Array.isArray(mRec.items) ? mRec.items : [];
                        const qty = Number(mRec.totalQuantity) || recItems.reduce((sum: number, it: any) => sum + (Number(it?.quantity) || 1), 0);
                        const priceK = Number(mRec.totalPrice) || 0;
                        const recTimestamp = Number(mRec.timestamp) || now;

                        if (query) {
                            const userLower = user.toLowerCase();
                            const userNoAcc = removeVietnameseAccents(userLower);
                            const nickLower = (nickname || '').toLowerCase();
                            const orderNum = (mRec.orderNumber || '').toLowerCase();
                            const pancakeId = (mRec.pancakeOrderId || '').toLowerCase();
                            const matchesUser = userLower.includes(query) || userNoAcc.includes(queryNoAccent) || nickLower.includes(query);
                            const matchesOrder = orderNum.includes(query) || pancakeId.includes(query);
                            const matchesItem = recItems.some(it => (it?.content || '').toLowerCase().includes(query));
                            if (!matchesUser && !matchesOrder && !matchesItem) return;
                        }

                        list.push({
                            type: 'push',
                            id: `push-master-${recId || `${user}-${recTimestamp}`}`,
                            timestamp: recTimestamp,
                            user,
                            platform: p,
                            displayName,
                            nickname,
                            avatarUrl,
                            tag,
                            qty,
                            priceK,
                            record: mRec,
                            pLink
                        });
                    });
                }
            }
        } catch {}

        // Sắp xếp đơn mới đẩy nhất lên đầu
        return list.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    }, [store, platformFilter, query, queryNoAccent, now]);

    // Thống kê hiệu quả đẩy đơn: SL đơn đẩy, Doanh thu, Số cái để đi
    const pushSummary = useMemo(() => {
        const totalOrders = pushSuccessList.length;
        const totalQty = pushSuccessList.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
        const totalRevenueK = pushSuccessList.reduce((sum, item) => sum + (Number(item.priceK) || 0), 0);
        return { totalOrders, totalQty, totalRevenueK };
    }, [pushSuccessList]);

    // =========================================================================
    // 3. CỌC: Khách mới cọc của 3 ngày gần nhất. Avatar Cảm ơn chị .... đã cọc 50k hoặc 100k
    // =========================================================================
    const depositList = useMemo<DepositItem[]>(() => {
        const list: DepositItem[] = [];

        let depositTimestamps: Record<string, number> = {};
        try {
            const raw = localStorage.getItem('slp_deposit_timestamps');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    depositTimestamps = parsed;
                }
            }
        } catch {}

        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
            if (platformFilter !== 'all' && p !== platformFilter) return;
            const pStore = store[p];
            if (!pStore) return;
            const tags = pStore.tags || {};
            const custs = pStore.customers || {};
            const pNicks = pStore.nicknames || {};
            const pLinks = pStore.pancakeLinks || {};

            Object.keys(tags).forEach(rawUser => {
                const user = normalizeUser(rawUser);
                const tag = tags[rawUser];
                if (tag !== 'COC' && tag !== 'COC_100') return;

                const cust = custs[rawUser] || custs[user];
                const key = `${p}_${user}`;
                // Lấy thời điểm cọc từ map, hoặc từ cust.lastTime, hoặc fallback trong 3 ngày
                const depositTs = Number(depositTimestamps[key]) || Number(cust?.lastTime) || (now - 86400000);

                // YÊU CẦU 3: Khách mới cọc của 3 ngày gần nhất (<= 3 ngày)
                const diffMs = now - depositTs;
                if (isNaN(diffMs) || diffMs > 3 * 86400000) return;

                const avatarUrl = getCustomerAvatar(user, p) || undefined;
                const nickname = pNicks[user];
                const displayName = nickname ? `(${nickname}) ${user}` : `#${getShortId(user)} ${user}`;
                const pLink = pLinks[user];
                const amountText = tag === 'COC_100' ? '100k' : '50k';
                const timeAgoText = formatRelativeTime(depositTs, now);

                if (query) {
                    const userLower = user.toLowerCase();
                    const userNoAcc = removeVietnameseAccents(userLower);
                    const nickLower = (nickname || '').toLowerCase();
                    const matchesUser = userLower.includes(query) || userNoAcc.includes(queryNoAccent) || nickLower.includes(query);
                    if (!matchesUser) return;
                }

                list.push({
                    type: 'deposit',
                    id: `deposit-${p}-${user}`,
                    timestamp: depositTs,
                    user,
                    platform: p,
                    displayName,
                    nickname,
                    avatarUrl,
                    tag,
                    amountText,
                    pLink,
                    timeAgoText
                });
            });
        });

        // Sắp xếp cọc mới nhất lên đầu
        return list.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    }, [store, platformFilter, query, queryNoAccent, now]);

    // =========================================================================
    // TẤT CẢ LÀ HIỂN THỊ HẾT THÔNG BÁO (Combined Unified List)
    // =========================================================================
    const allNotifications = useMemo<NotificationItem[]>(() => {
        const combined = [...remindList, ...pushSuccessList, ...depositList];
        // Sắp xếp theo timestamp giảm dần (mới nhất lên trước)
        return combined.sort((a, b) => b.timestamp - a.timestamp);
    }, [remindList, pushSuccessList, depositList]);

    const [toastMsg, setToastMsg] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 2000);
    };

    // Unified Pancake Action:
    // - Có link: Sao chép link vào clipboard & mở Pancake
    // - Chưa có link: Mở hộp thoại chat liên kết Pancake (PancakeLinkModal)
    const handlePancakeClick = (user: string, platform: Platform, pLink?: string) => {
        if (pLink) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(pLink);
            }
            setCopiedCustomer(user);
            setTimeout(() => setCopiedCustomer(null), 1500);
            showToast('Đã sao chép link Pancake & đang mở... 🥞');
            openPancakeApp(pLink, true);
        } else {
            if (onOpenPancakeLink) {
                onOpenPancakeLink(user, platform);
            } else {
                showToast('Chưa có liên kết Pancake cho khách này');
            }
        }
    };

    return (
        <div className={`w-full h-full flex flex-col bg-[#0b121c] text-white overflow-hidden ${isPage ? '' : 'fixed inset-0 z-50'}`}>
            {/* Top Navigation Bar: Tất cả, Nhắc khách, Đẩy đơn, Cọc */}
            <div className="bg-[#0e1622]/95 backdrop-blur-md border-b border-white/10 px-3 py-2 shrink-0 z-10 shadow-sm flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
                    {/* Nút TẤT CẢ (hiển thị hết thông báo) */}
                    <button
                        type="button"
                        onClick={() => setActiveTab('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                            activeTab === 'all'
                                ? 'bg-blue-600 text-white shadow-md ring-1 ring-blue-400/50'
                                : 'bg-[#15202e] text-gray-300 hover:text-white border border-white/10'
                        }`}
                    >
                        <span>🔔 Tất cả</span>
                        <span className="bg-black/40 text-blue-300 border border-blue-400/30 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                            {allNotifications.length}
                        </span>
                    </button>

                    {/* 1. Nhắc khách */}
                    <button
                        type="button"
                        onClick={() => setActiveTab('remind')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                            activeTab === 'remind'
                                ? 'bg-amber-600 text-white shadow-md ring-1 ring-amber-400/50'
                                : 'bg-[#15202e] text-amber-300 hover:text-white border border-amber-500/20'
                        }`}
                    >
                        <span>⏰ 1. Nhắc khách</span>
                        <span className="bg-amber-950/80 text-amber-300 border border-amber-400/30 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                            {remindList.length}
                        </span>
                    </button>

                    {/* 2. Đẩy đơn */}
                    <button
                        type="button"
                        onClick={() => setActiveTab('push')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                            activeTab === 'push'
                                ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400/50'
                                : 'bg-[#15202e] text-emerald-300 hover:text-white border border-emerald-500/20'
                        }`}
                    >
                        <span>🚀 2. Đẩy đơn</span>
                        <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                            {pushSuccessList.length}
                        </span>
                    </button>

                    {/* 3. Cọc */}
                    <button
                        type="button"
                        onClick={() => setActiveTab('deposit')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                            activeTab === 'deposit'
                                ? 'bg-cyan-600 text-white shadow-md ring-1 ring-cyan-400/50'
                                : 'bg-[#15202e] text-cyan-300 hover:text-white border border-cyan-500/20'
                        }`}
                    >
                        <span>💧 3. Cọc</span>
                        <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-400/30 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                            {depositList.length}
                        </span>
                    </button>
                </div>

                {/* Sàn Filter */}
                <div className="flex items-center gap-1.5 ml-auto">
                    <select
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value as any)}
                        className="bg-[#15202e] border border-white/15 text-xs font-bold rounded-lg px-2.5 py-1 text-gray-200 outline-none cursor-pointer"
                    >
                        <option value="all">🌐 Tất cả sàn</option>
                        <option value="tiktok">🎵 TikTok</option>
                        <option value="shopee">🛒 Shopee</option>
                        <option value="facebook">📘 Facebook</option>
                    </select>
                </div>
            </div>

            {/* Quick Add Deposit Input (chỉ hiện khi xem tab Cọc) */}
            {activeTab === 'deposit' && (
                <div className="bg-[#101926] px-3 py-2 border-b border-white/10 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1">
                        <Tag size={13} />
                        <span>Gán cọc mới:</span>
                    </span>
                    <select
                        value={depositPlatform}
                        onChange={(e) => setDepositPlatform(e.target.value as any)}
                        className="bg-[#1c242f] border border-white/15 text-xs rounded-lg px-2 py-1 text-gray-200 outline-none"
                    >
                        <option value="tiktok">TikTok</option>
                        <option value="shopee">Shopee</option>
                        <option value="facebook">Facebook</option>
                    </select>
                    <input
                        type="text"
                        value={depositSearchUser}
                        onChange={(e) => setDepositSearchUser(e.target.value)}
                        placeholder="Nhập tên khách..."
                        className="bg-[#1c242f] border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-500 outline-none flex-1 min-w-[120px]"
                    />
                    {depositSearchUser.trim() && (
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    const clean = normalizeUser(depositSearchUser);
                                    store.setCustomerTag(depositPlatform, clean, 'COC');
                                    setDepositSearchUser('');
                                }}
                                className="px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-xs"
                            >
                                + Cọc 50k
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const clean = normalizeUser(depositSearchUser);
                                    store.setCustomerTag(depositPlatform, clean, 'COC_100');
                                    setDepositSearchUser('');
                                }}
                                className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer shadow-xs"
                            >
                                + Cọc 100k
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Notification Stream */}
            <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-3 space-y-2.5 pb-24">
                {/* Banner Thống kê hiệu quả đẩy đơn */}
                {activeTab === 'push' && (
                    <div className="bg-gradient-to-r from-emerald-950/80 via-[#132431] to-emerald-950/80 border border-emerald-500/35 rounded-2xl p-3 shadow-md mb-2">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
                            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                                <span>🚀</span>
                                <span>HIỆU QUẢ ĐẨY ĐƠN (PANCAKE POS)</span>
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">
                                Tổng hợp gần đây
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center divide-x divide-white/10">
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SL Đơn Đẩy</div>
                                <div className="text-lg sm:text-2xl font-black text-emerald-400 font-mono mt-0.5">
                                    {pushSummary.totalOrders} <span className="text-xs font-normal text-gray-300">đơn</span>
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Doanh Thu</div>
                                <div className="text-lg sm:text-2xl font-black text-amber-300 font-mono mt-0.5 truncate">
                                    {pushSummary.totalRevenueK.toLocaleString('vi-VN')}k
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Số Cái Để Đi</div>
                                <div className="text-lg sm:text-2xl font-black text-cyan-300 font-mono mt-0.5">
                                    {pushSummary.totalQty} <span className="text-xs font-normal text-gray-300">cái</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 1. TAB TẤT CẢ HOẶC DANH SÁCH RỖNG */}
                {activeTab === 'all' && allNotifications.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-xs italic bg-[#101926]/50 rounded-2xl border border-dashed border-white/10">
                        🎉 Hiện tại chưa có thông báo nào mới!
                    </div>
                )}

                {activeTab === 'remind' && remindList.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-xs italic bg-[#101926]/50 rounded-2xl border border-dashed border-white/10">
                        🎉 Không có khách nào đang giữ 1 cái quá 3 ngày!
                    </div>
                )}

                {activeTab === 'push' && pushSuccessList.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-xs italic bg-[#101926]/50 rounded-2xl border border-dashed border-white/10">
                        Chưa có lịch sử đẩy đơn thành công nào gần đây.
                    </div>
                )}

                {activeTab === 'deposit' && depositList.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-xs italic bg-[#101926]/50 rounded-2xl border border-dashed border-white/10">
                        Chưa có khách nào mới cọc trong 3 ngày gần nhất.
                    </div>
                )}

                {/* RENDER ITEMS */}
                {(activeTab === 'all' ? allNotifications : activeTab === 'remind' ? remindList : activeTab === 'push' ? pushSuccessList : depositList).map((item) => {
                    // =========================================================
                    // 1. NHẮC KHÁCH CARD
                    // "Khách A có 1 c 89k (ngày chốt) đã (ngày hiện tại - ngày chốt) chưa thấy chốt gì thêm .logo pancake để chát nhắc khách"
                    // Gọn gàng tối giản: bỏ khoanh tròn, bỏ món phụ, logo Pancake sao chép & mở chat liên kết, bấm xem hồ sơ
                    // =========================================================
                    if (item.type === 'remind') {
                        return (
                            <div
                                key={item.id}
                                onClick={() => onOpenProfile(item.user, item.platform)}
                                className="bg-[#141e2c] hover:bg-[#182436] p-3 rounded-2xl border border-amber-500/25 shadow-sm transition-all flex items-start gap-3 cursor-pointer group"
                            >
                                {/* Avatar Khách */}
                                <div className="shrink-0 pt-0.5">
                                    <CustomerAvatar
                                        user={item.user}
                                        platform={item.platform}
                                        avatarUrl={item.avatarUrl}
                                        tag={item.tag}
                                        size="md"
                                        onClick={() => onOpenProfile(item.user, item.platform)}
                                    />
                                </div>

                                {/* Nội dung thông báo Nhắc Khách: gọn gàng tối giản */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-gray-400">
                                            {PLATFORMS[item.platform]?.label || item.platform}
                                        </span>
                                    </div>

                                    {/* Dòng chữ: Khách A có 1 c 89k (ngày chốt) đã ... ngày chưa thấy chốt gì thêm */}
                                    <p className="text-xs sm:text-sm font-semibold text-white mt-0.5 leading-snug">
                                        <span className="text-amber-200 font-bold">{item.displayName}</span> có <strong className="text-amber-300 font-mono">1 c {item.totalAmountK}k</strong> (chốt ngày <span className="text-gray-300 font-mono">{item.orderDateStr}</span>) đã <strong className="text-rose-400 font-mono underline">{item.daysHeld} ngày</strong> chưa thấy chốt gì thêm.
                                    </p>
                                </div>

                                {/* Hành động: Logo Pancake (sao chép & mở hộp thoại liên kết) + Nút xem hồ sơ */}
                                <div className="shrink-0 flex items-center gap-1.5 self-center">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePancakeClick(item.user, item.platform, item.pLink);
                                        }}
                                        title={item.pLink ? "Sao chép link & Mở Pancake" : "Mở hộp thoại liên kết chat Pancake"}
                                        className="w-8 h-8 rounded-xl bg-orange-600/80 hover:bg-orange-500 text-white font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm border border-orange-400/30"
                                    >
                                        {copiedCustomer === item.user ? (
                                            <Check size={15} className="text-white" />
                                        ) : (
                                            <PancakeLogo className="w-4 h-4" />
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenProfile(item.user, item.platform);
                                        }}
                                        className="px-2.5 py-1.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                                    >
                                        Hồ sơ →
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    // =========================================================
                    // 2. ĐẨY ĐƠN CARD
                    // "Avatar Anh Vũ vửa đẩy đơn thành công 2sp:189k xem đơn tại pancake .hoặc click vô nôi dung thông báo xem hồ sơ anh vũ"
                    // Gọn gàng tối giản: bỏ khoanh tròn, bỏ mã đơn phụ, logo Pancake sao chép & mở link, bấm xem hồ sơ
                    // =========================================================
                    if (item.type === 'push') {
                        const timeStr = formatRelativeTime(item.timestamp, now);

                        return (
                            <div
                                key={item.id}
                                onClick={() => onOpenProfile(item.user, item.platform)}
                                className="bg-[#141e2c] hover:bg-[#182436] p-3 rounded-2xl border border-emerald-500/25 shadow-sm transition-all flex items-start gap-3 cursor-pointer group"
                            >
                                {/* Avatar */}
                                <div className="shrink-0 pt-0.5">
                                    <CustomerAvatar
                                        user={item.user}
                                        platform={item.platform}
                                        avatarUrl={item.avatarUrl}
                                        tag={item.tag}
                                        size="md"
                                        onClick={() => onOpenProfile(item.user, item.platform)}
                                    />
                                </div>

                                {/* Nội dung thông báo: [Tên] vừa đẩy đơn thành công 2sp: 189k */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-gray-400">
                                            {timeStr} · {PLATFORMS[item.platform]?.label || item.platform}
                                        </span>
                                    </div>

                                    <p className="text-xs sm:text-sm font-semibold text-white mt-0.5 leading-snug">
                                        <span className="text-emerald-200 font-bold">{item.displayName}</span> vừa đẩy đơn thành công <strong className="text-emerald-300 font-mono">{item.qty} sp : {item.priceK}k</strong>
                                    </p>
                                </div>

                                {/* Hành động: Logo Pancake (sao chép & mở link) + Nút xem hồ sơ */}
                                <div className="shrink-0 flex items-center gap-1.5 self-center">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePancakeClick(item.user, item.platform, item.pLink);
                                        }}
                                        title={item.pLink ? "Sao chép link & Mở Pancake" : "Mở hộp thoại liên kết chat Pancake"}
                                        className="w-8 h-8 rounded-xl bg-orange-600/80 hover:bg-orange-500 text-white font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm border border-orange-400/30"
                                    >
                                        {copiedCustomer === item.user ? (
                                            <Check size={15} className="text-white" />
                                        ) : (
                                            <PancakeLogo className="w-4 h-4" />
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenProfile(item.user, item.platform);
                                        }}
                                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                                    >
                                        Hồ sơ →
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    // =========================================================
                    // 3. CỌC CARD
                    // "hiện thị khách mới cọc của 3 ngày gần nhất .avtar cảm ơn chị .... đã cọc 50k hoặc 100k"
                    // Gọn gàng tối giản: bỏ khoanh tròn, bỏ dòng "đã nhận cọc", logo Pancake đúng chuẩn, bấm xem hồ sơ luôn
                    // =========================================================
                    if (item.type === 'deposit') {
                        return (
                            <div
                                key={item.id}
                                onClick={() => onOpenProfile(item.user, item.platform)}
                                className="bg-[#141e2c] hover:bg-[#182436] p-3 rounded-2xl border border-cyan-500/25 shadow-sm transition-all flex items-start gap-3 cursor-pointer group"
                            >
                                {/* Avatar */}
                                <div className="shrink-0 pt-0.5">
                                    <CustomerAvatar
                                        user={item.user}
                                        platform={item.platform}
                                        avatarUrl={item.avatarUrl}
                                        tag={item.tag}
                                        size="md"
                                        onClick={() => onOpenProfile(item.user, item.platform)}
                                    />
                                </div>

                                {/* Nội dung: Cảm ơn chị .... đã cọc 50k hoặc 100k */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-gray-400">
                                            {item.timeAgoText} · {PLATFORMS[item.platform]?.label || item.platform}
                                        </span>
                                    </div>

                                    <p className="text-xs sm:text-sm font-semibold text-white mt-0.5 leading-snug">
                                        Cảm ơn chị <span className="text-cyan-200 font-bold">{item.displayName}</span> đã cọc <strong className="text-cyan-300 font-mono text-sm">{item.amountText}</strong> ❤️
                                    </p>
                                </div>

                                {/* Hành động: Logo Pancake + Nút xem hồ sơ */}
                                <div className="shrink-0 flex items-center gap-1.5 self-center">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePancakeClick(item.user, item.platform, item.pLink);
                                        }}
                                        title={item.pLink ? "Sao chép link & Mở Pancake" : "Mở hộp thoại liên kết chat Pancake"}
                                        className="w-8 h-8 rounded-xl bg-orange-600/80 hover:bg-orange-500 text-white font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm border border-orange-400/30"
                                    >
                                        {copiedCustomer === item.user ? (
                                            <Check size={15} className="text-white" />
                                        ) : (
                                            <PancakeLogo className="w-4 h-4" />
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenProfile(item.user, item.platform);
                                        }}
                                        className="px-2.5 py-1.5 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                                    >
                                        Hồ sơ →
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}
            </div>

            {/* Toast thông báo sao chép */}
            {toastMsg && (
                <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-[#1e293b]/95 backdrop-blur-md text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xl border border-orange-500/40 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <PancakeLogo className="w-4 h-4" />
                    <span>{toastMsg}</span>
                </div>
            )}
        </div>
    );
}
