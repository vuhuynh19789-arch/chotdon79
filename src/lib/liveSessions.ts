import { CommentData, getLiveCycleStartedAt, setLiveCycleStartedAt } from '../store';
import { Platform } from './core';

export interface SavedCustomerOrder {
    user: string;
    platform: Platform;
    count: number;
    total: number;
    tag?: string;
    nickname?: string;
    phone?: string;
    pancakeLink?: string;
    items: Array<{
        id: string;
        content: string;
        price: number;
        createdAt?: number;
    }>;
}

export interface SavedLiveSession {
    id: string;
    name: string;
    note?: string;
    startTime: number;
    endTime: number;
    savedAt: number;
    totalRevenue: number;
    totalOrders: number;
    totalComments: number;
    totalCustomers: number;
    newCustomersCount: number;
    vipCustomersCount: number;
    customers: SavedCustomerOrder[];
}

export interface LiveSessionInfo {
    id: string;
    index: number;
    name: string;
    title: string;
    startTime: number;
    endTime: number;
    timeRangeStr: string;
    dateStr: string;
    commentsCount: number;
    closedCount?: number;
    totalRevenue?: number;
    isCurrent: boolean;
    commentIds: Set<string>;
}

// Khoảng cách thời gian nghỉ tự nhiên giữa 2 bình luận để tự động tách phiên (45 phút)
const SESSION_GAP_MS = 45 * 60 * 1000;

const SAVED_SESSIONS_STORAGE_KEY = 'slp_saved_live_sessions';

/**
 * Lấy danh sách các phiên live đã lưu
 */
export const getSavedLiveSessions = (): SavedLiveSession[] => {
    try {
        const val = localStorage.getItem(SAVED_SESSIONS_STORAGE_KEY);
        if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch {}
    return [];
};

/**
 * Lưu một phiên live vào danh sách
 */
export const saveLiveSession = (session: SavedLiveSession): SavedLiveSession[] => {
    try {
        const current = getSavedLiveSessions();
        // Kiểm tra xem đã tồn tại id chưa, nếu có thì ghi đè, nếu không thì thêm lên đầu
        const filtered = current.filter(s => s.id !== session.id);
        const updated = [session, ...filtered];
        localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, JSON.stringify(updated));

        // Đồng bộ vào slp_webapp_history để giữ tương thích với báo cáo thống kê
        try {
            const historyVal = localStorage.getItem('slp_webapp_history');
            const historyList = historyVal ? JSON.parse(historyVal) : [];
            const historyEntry = {
                id: session.id,
                date: new Date(session.savedAt).toISOString(),
                totalRevenue: session.totalRevenue,
                totalOrders: session.totalOrders,
                newCustomers: session.newCustomersCount,
                returningCustomers: session.vipCustomersCount
            };
            const updatedHistory = [historyEntry, ...historyList.filter((h: any) => h.id !== session.id)].slice(0, 50);
            localStorage.setItem('slp_webapp_history', JSON.stringify(updatedHistory));
        } catch {}

        return updated;
    } catch {
        return getSavedLiveSessions();
    }
};

/**
 * Xoá một phiên live đã lưu
 */
export const deleteSavedLiveSession = (sessionId: string): SavedLiveSession[] => {
    try {
        const current = getSavedLiveSessions();
        const updated = current.filter(s => s.id !== sessionId);
        localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch {
        return getSavedLiveSessions();
    }
};

/**
 * Cập nhật thông tin phiên live đã lưu (tên, ghi chú)
 */
export const updateSavedLiveSession = (sessionId: string, updates: Partial<SavedLiveSession>): SavedLiveSession[] => {
    try {
        const current = getSavedLiveSessions();
        const updated = current.map(s => {
            if (s.id === sessionId) {
                return { ...s, ...updates };
            }
            return s;
        });
        localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch {
        return getSavedLiveSessions();
    }
};

/**
 * Lấy danh sách các mốc phân phiên thủ công do chủ live bấm tạo
 */
export const getManualSessionBreaks = (): number[] => {
    try {
        const val = localStorage.getItem('slp_manual_session_breaks');
        if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                const now = Date.now();
                return parsed.filter(t => typeof t === 'number' && (now - t) <= 48 * 60 * 60 * 1000);
            }
        }
    } catch {}
    return [];
};

/**
 * Thêm một mốc phân phiên live mới thủ công
 */
export const addManualSessionBreak = (ts: number = Date.now()) => {
    try {
        const current = getManualSessionBreaks();
        const updated = [...current, ts].sort((a, b) => a - b);
        localStorage.setItem('slp_manual_session_breaks', JSON.stringify(updated));
    } catch {}
};

/**
 * Xoá toàn bộ mốc phân phiên
 */
export const clearManualSessionBreaks = () => {
    try {
        localStorage.removeItem('slp_manual_session_breaks');
    } catch {}
};

export function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDateTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Tự động phân chia danh sách bình luận thành các phiên live cụ thể
 */
export function segmentCommentsIntoSessions(
    comments: CommentData[],
    isCommentClosedFn?: (c: CommentData) => boolean,
    getCommentRevenueFn?: (c: CommentData) => number
): {
    sessions: LiveSessionInfo[];
    commentSessionMap: Map<string, LiveSessionInfo>;
} {
    if (!comments || comments.length === 0) {
        return { sessions: [], commentSessionMap: new Map() };
    }

    const sorted = [...comments].filter(c => c && c.ts).sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    if (sorted.length === 0) {
        return { sessions: [], commentSessionMap: new Map() };
    }

    const manualBreaks = getManualSessionBreaks();
    const clusters: CommentData[][] = [];
    let currentCluster: CommentData[] = [];
    let lastCommentTs = 0;

    for (const c of sorted) {
        const cTs = Number(c.ts) || 0;
        if (!cTs) continue;

        let shouldBreak = false;

        if (currentCluster.length > 0 && lastCommentTs > 0) {
            if (cTs - lastCommentTs > SESSION_GAP_MS) {
                shouldBreak = true;
            }

            if (!shouldBreak) {
                const hasManualBreak = manualBreaks.some(brk => brk > lastCommentTs && brk <= cTs);
                if (hasManualBreak) {
                    shouldBreak = true;
                }
            }
        }

        if (shouldBreak && currentCluster.length > 0) {
            clusters.push(currentCluster);
            currentCluster = [c];
        } else {
            currentCluster.push(c);
        }

        lastCommentTs = cTs;
    }

    if (currentCluster.length > 0) {
        clusters.push(currentCluster);
    }

    const sessions: LiveSessionInfo[] = [];
    const commentSessionMap = new Map<string, LiveSessionInfo>();
    const now = Date.now();

    clusters.forEach((cluster, idx) => {
        const sessionIndex = idx + 1;
        const startTime = Number(cluster[0].ts) || now;
        const endTime = Number(cluster[cluster.length - 1].ts) || startTime;
        const id = `session_${sessionIndex}_${startTime}`;
        const name = `Phiên ${sessionIndex}`;
        const timeRangeStr = `${formatTime(startTime)} - ${formatTime(endTime)}`;
        const dateStr = formatDate(startTime);
        const title = `${name} • ${timeRangeStr}`;

        const isCurrent = (idx === clusters.length - 1) && (now - endTime <= 30 * 60 * 1000);

        const commentIds = new Set<string>();
        let closedCount = 0;
        let totalRevenue = 0;

        cluster.forEach(c => {
            commentIds.add(c.id);
            if (isCommentClosedFn && isCommentClosedFn(c)) {
                closedCount++;
            }
            if (getCommentRevenueFn) {
                totalRevenue += getCommentRevenueFn(c);
            }
        });

        const sessionInfo: LiveSessionInfo = {
            id,
            index: sessionIndex,
            name,
            title,
            startTime,
            endTime,
            timeRangeStr,
            dateStr,
            commentsCount: cluster.length,
            closedCount,
            totalRevenue,
            isCurrent,
            commentIds
        };

        sessions.push(sessionInfo);
        cluster.forEach(c => {
            commentSessionMap.set(c.id, sessionInfo);
        });
    });

    sessions.sort((a, b) => b.startTime - a.startTime);

    return { sessions, commentSessionMap };
}

/**
 * Tạo nội dung báo cáo văn bản để gửi qua Zalo / Telegram
 */
export function generateSessionReportText(session: SavedLiveSession): string {
    const lines: string[] = [];
    lines.push(`📊 [BÁO CÁO PHIÊN LIVE] - ${session.name}`);
    lines.push(`⏰ Thời gian: ${formatTime(session.startTime)} - ${formatTime(session.endTime)} (${formatDate(session.startTime)})`);
    if (session.note) lines.push(`📝 Ghi chú: ${session.note}`);
    lines.push(`---------------------------------`);
    lines.push(`💰 Tổng doanh thu: ${session.totalRevenue.toLocaleString('vi-VN')}k`);
    lines.push(`📦 Tổng đơn chốt: ${session.totalOrders} món`);
    lines.push(`👥 Số khách chốt: ${session.totalCustomers} khách (${session.newCustomersCount} mới, ${session.vipCustomersCount} quen/VIP)`);
    lines.push(`💬 Tổng bình luận: ${session.totalComments}`);
    lines.push(`---------------------------------`);
    lines.push(`📋 DANH SÁCH KHÁCH HÀNG:`);

    session.customers.forEach((c, idx) => {
        const phoneStr = c.phone ? ` - 📞 ${c.phone}` : '';
        const tagStr = c.tag ? ` [${c.tag}]` : '';
        lines.push(`${idx + 1}. ${c.user}${tagStr}${phoneStr}: ${c.count} món - ${c.total}k`);
        if (c.items && c.items.length > 0) {
            c.items.forEach(it => {
                lines.push(`   └ ${it.content} (${it.price}k)`);
            });
        }
    });

    return lines.join('\n');
}

/**
 * Xuất dữ liệu phiên live ra file CSV
 */
export function exportSessionToCSV(session: SavedLiveSession) {
    const rows: string[][] = [
        ['BÁO CÁO PHIÊN LIVE', session.name],
        ['Thời gian bắt đầu', new Date(session.startTime).toLocaleString('vi-VN')],
        ['Thời gian kết thúc', new Date(session.endTime).toLocaleString('vi-VN')],
        ['Tổng doanh thu (k)', String(session.totalRevenue)],
        ['Tổng số món chốt', String(session.totalOrders)],
        ['Số khách chốt', String(session.totalCustomers)],
        ['Tổng bình luận', String(session.totalComments)],
        [],
        ['STT', 'Tên khách hàng', 'Số điện thoại', 'Kênh', 'Thẻ phân loại', 'Số lượng món', 'Tổng tiền (k)', 'Chi tiết các món']
    ];

    session.customers.forEach((c, idx) => {
        const itemsDetail = (c.items || []).map(it => `${it.content} (${it.price}k)`).join('; ');
        rows.push([
            String(idx + 1),
            c.user,
            c.phone || '',
            c.platform,
            c.tag || 'Thường',
            String(c.count),
            String(c.total),
            `"${itemsDetail.replace(/"/g, '""')}"`
        ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = session.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `Phien_Live_${safeName}_${formatDate(session.startTime).replace('/', '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
