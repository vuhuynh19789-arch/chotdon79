import React, { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore, CommentData, getFeedClearedAt, getGlobalFeedClearedAt, isCustomerGheLay } from '../store';
import { PLATFORMS, extractPriceFromContent, Platform, getShortId, normalizeUser, getClosedPriceForComment, removeVietnameseAccents } from '../lib/core';
import { openPancakeApp, extractPhoneFromText } from '../lib/pancakeDeepLink';
import { getCustomerInsight, getOrderStatusLabel, getCustomerActivePastItems } from '../lib/pancakeSync';
import { CopyButton } from './Modals';
import { CustomerAvatar, ThapChamIcon, GheLayBadge } from './UserAvatar';
import { Plus, PlusCircle, Edit3, Users, List, ChevronDown, ChevronUp, MessageSquare, LayoutGrid, Pin, Printer, RefreshCw } from 'lucide-react';
import { QuickAssignModal } from './QuickAssignModal';

interface FeedProps {
    searchKeyword: string;
    hostMode?: boolean;
    onOpenPrice: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
    onOpenProfile: (user: string, platform: Platform) => void;
    onOpenPancakeLink?: (user: string, platform: Platform, initialSearch?: string) => void;
    onScroll?: (isDown: boolean) => void;
    onOpenManualOrder?: () => void;
}

interface CommentRowProps {
    comment: CommentData;
    now: number;
    isBusy: boolean;
    onPrint: (c: CommentData, e?: React.MouseEvent) => void;
    onTogglePin: (platform: Platform, id: string, user: string) => void;
    onOpenPrice: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
    onOpenProfile: (user: string, platform: Platform) => void;
    onOpenPancakeLink?: (user: string, platform: Platform, initialSearch?: string) => void;
    onOpenQuickAssign?: (user: string, platform: Platform, commentPhone?: string) => void;
}

export interface UserCommentGroup {
    key: string;
    user: string;
    platform: Platform;
    avatar?: string;
    latestComment: CommentData;
    latestTs: number;
    comments: CommentData[];
    isPinned: boolean;
}

interface SubCommentRowProps {
    comment: CommentData;
    index: number;
    total: number;
    isBusy: boolean;
    now: number;
    onPrint: (c: CommentData, e?: React.MouseEvent) => void;
    onTogglePin: (platform: Platform, id: string, user: string) => void;
    onOpenPrice: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
    onOpenPancakeLink?: (user: string, platform: Platform, initialSearch?: string) => void;
    onOpenQuickAssign?: (user: string, platform: Platform, commentPhone?: string) => void;
}

const SubCommentRow = memo(function SubCommentRow({
    comment: c,
    index,
    total,
    isBusy,
    now,
    onPrint,
    onTogglePin,
    onOpenPrice,
    onOpenPancakeLink,
    onOpenQuickAssign
}: SubCommentRowProps) {
    const store = useStore();
    const pStore = store[c.platform] || store.tiktok;
    const count = (pStore.printed && pStore.printed[c.id]) || 0;
    const userName = normalizeUser(c.user);
    const isHost = pStore.tags && pStore.tags[userName] === 'HOST';
    const isCommentPinned = Boolean(pStore.pinned && pStore.pinned[c.id] && (pStore.pinned[c.id].expiry > now || isHost));
    const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
    const detectedPhone = extractPhoneFromText(contentStr);
    const extracted = extractPriceFromContent(contentStr);
    const closedPriceStr = getClosedPriceForComment(pStore.customers, userName, c.id);
    const pancakeLink = pStore.pancakeLinks?.[userName];
    const isLatest = index === 0;

    return (
        <div className={`p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
            isCommentPinned
                ? 'bg-[#2a1b1b] border-red-500/50 shadow-xs'
                : isLatest 
                ? 'bg-[#1a2736] border-cyan-500/40 shadow-xs' 
                : 'bg-[#121b25] border-white/5 hover:bg-[#162230]'
        }`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                        isCommentPinned
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : isLatest 
                            ? 'bg-[#00f2ea]/20 text-[#00f2ea] border border-[#00f2ea]/40' 
                            : 'bg-white/10 text-gray-400'
                    }`}>
                        #{total - index} {isLatest && '• Mới nhất'}
                    </span>
                    {c.time && (
                        <span className="text-[10px] text-gray-400 font-medium">
                            🕒 {c.time}
                        </span>
                    )}
                </div>

                <div 
                    onClick={() => onOpenPrice(c.id, userName, c.platform, extracted.price || closedPriceStr?.replace(/k/g, '') || undefined)}
                    className="text-red-300 hover:text-red-200 font-bold break-words mt-1 cursor-pointer text-sm"
                >
                    <span className="line-clamp-3 break-words inline-block max-w-full">{contentStr}</span>
                    {extracted.price ? (
                        <span className="ml-1.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-1.5 py-0.2 rounded border border-emerald-500/40 inline-flex items-center gap-0.5">
                            🏷️ {extracted.price}k
                        </span>
                    ) : closedPriceStr ? (
                        <span className="ml-1.5 bg-emerald-500/25 text-emerald-200 text-[10px] font-black px-1.5 py-0.2 rounded border border-emerald-500/50 inline-flex items-center gap-0.5 shadow-xs" title="Giá đơn đã chốt">
                            🏷️ {closedPriceStr}
                        </span>
                    ) : null}
                </div>

                {detectedPhone && (
                    <div className="flex items-center gap-1 mt-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                openPancakeApp(detectedPhone, true);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-blue-950/80 border border-blue-500/40 text-blue-300 text-[10px] font-semibold"
                        >
                            <span>💬 Zalo: {detectedPhone}</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                {pancakeLink ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openPancakeApp(pancakeLink, true);
                        }}
                        title="🥞 Mở Zalo/Pancake"
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center text-xs cursor-pointer shadow-xs active:scale-95 transition-all border border-orange-400/40"
                    >
                        <span>🥞</span>
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(c.platform, c.id, userName);
                    }}
                    title={isCommentPinned ? "Bỏ ghim bình luận này" : "Ghim bình luận này lên đầu"}
                    className={`p-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                        isCommentPinned
                            ? 'bg-red-500 text-white font-bold shadow-xs'
                            : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                    }`}
                >
                    <span>📌</span>
                </button>
                <button
                    disabled={isBusy}
                    onClick={(e) => onPrint(c, e)}
                    className={`h-8 sm:h-9 min-w-[50px] px-2 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs ${
                        isBusy ? 'bg-gray-500' : count > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    <Printer size={13} />
                    <span>{count === 0 ? 'IN' : `(${count})`}</span>
                </button>
            </div>
        </div>
    );
});

interface UserGroupRowProps {
    group: UserCommentGroup;
    isExpanded: boolean;
    onToggleExpand: (groupKey: string) => void;
    now: number;
    busyPrints: Record<string, boolean>;
    onPrint: (c: CommentData, e?: React.MouseEvent) => void;
    onTogglePin: (platform: Platform, id: string, user: string) => void;
    onToggleGroupPin: (group: UserCommentGroup) => void;
    onOpenPrice: (id: string | null, user: string, platform: Platform, defaultPrice?: string) => void;
    onOpenProfile: (user: string, platform: Platform) => void;
    onOpenPancakeLink?: (user: string, platform: Platform, initialSearch?: string) => void;
    onOpenQuickAssign?: (user: string, platform: Platform, commentPhone?: string) => void;
}

const UserGroupRow = memo(function UserGroupRow({
    group: g,
    isExpanded,
    onToggleExpand,
    now,
    busyPrints,
    onPrint,
    onTogglePin,
    onToggleGroupPin,
    onOpenPrice,
    onOpenProfile,
    onOpenPancakeLink,
    onOpenQuickAssign
}: UserGroupRowProps) {
    const store = useStore();
    const pStore = store[g.platform] || store.tiktok;
    const userName = normalizeUser(g.user);
    const isHost = pStore.tags && pStore.tags[userName] === 'HOST';
    const isPinned = g.isPinned;
    const cust = pStore.customers && pStore.customers[userName];
    const userTag = (pStore.tags && pStore.tags[userName]) || 'NORMAL';
    const nickname = pStore.nicknames?.[userName];
    const displayName = userName;
    const pancakeLink = pStore.pancakeLinks?.[userName];
    const latestC = g.latestComment;
    const latestCount = (pStore.printed && pStore.printed[latestC.id]) || 0;
    const latestContentStr = typeof latestC.content === 'object' ? JSON.stringify(latestC.content) : String(latestC.content || '');
    const detectedPhone = extractPhoneFromText(latestContentStr);
    const extracted = extractPriceFromContent(latestContentStr);
    const flowPrice = pStore.flowPrice;
    const latestClosedPriceStr = getClosedPriceForComment(pStore.customers, userName, latestC.id);

    const isClosedToday = Boolean(cust && cust.count > 0);

    // Theo yêu cầu h2: Nếu khách đã chốt hôm nay (cust.count > 0) thì KHÔNG hiện giỏ cũ, KHÔNG làm nền đỏ.
    // Chỉ khi khách CHƯA chốt hôm nay mà đang có giỏ cũ thì mới hiện giỏ cũ và viền đỏ cảnh báo.
    const activePastTuples = useMemo(() => {
        if (isClosedToday || !cust || !cust.pastItems || cust.pastItems.length === 0) return [];
        const hasUnshipped = cust.pastItems.some(it => !it.shipped);
        if (!hasUnshipped) return [];
        const activeInsight = getCustomerInsight(userName);
        return getCustomerActivePastItems(cust, activeInsight);
    }, [isClosedToday, cust, userName]);

    const hasOldCart = !isClosedToday && activePastTuples.length > 0;
    const pastTotalK = useMemo(() => {
        if (!hasOldCart) return 0;
        return activePastTuples.reduce((sum, { item }) => sum + (item.price || 0), 0);
    }, [hasOldCart, activePastTuples]);

    // Theo yêu cầu h2: Không cần làm nền đỏ nữa ("nhìn chật chội ko cần thiết phải làm nền đỏ nửa")
    const containerClass = isPinned 
        ? 'bg-[#2a1b1b] border-l-[6px] border-l-red-600 shadow-md my-1 py-3' 
        : 'bg-[#1c242f] hover:bg-[#202b38]';

    return (
        <div className={`p-3 border-b border-white/10 transition-colors duration-150 ${containerClass}`}>
            <div className="flex gap-2.5 items-start">
                <div className="flex flex-col items-center shrink-0 self-start mt-0.5">
                    <CustomerAvatar 
                        user={userName} 
                        platform={g.platform} 
                        avatarUrl={g.avatar}
                        tag={isHost ? 'HOST' : userTag}
                        size={isPinned ? 'lg' : 'md'}
                        onClick={() => onOpenProfile(userName, g.platform)}
                    />
                </div>

                <div className="flex-1 overflow-hidden min-w-0">
                    <div className="flex items-center flex-wrap gap-y-1">
                        <div 
                            onClick={() => onOpenProfile(userName, g.platform)}
                            className="inline-flex items-center gap-1 cursor-pointer truncate max-w-[200px] xs:max-w-[280px] sm:max-w-[380px] mr-0.5"
                            title={nickname ? `Khách: ${userName} (Tên gợi nhớ: ${nickname})` : `Khách: ${userName}`}
                        >
                            <b className={`text-gray-100 hover:underline truncate ${isPinned ? 'text-lg sm:text-xl' : 'text-base sm:text-[17px]'}`}>
                                {userName}
                            </b>
                        </div>
                        {pStore.ninhThuanTags?.[userName] && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-1 mx-0.5" title="Khách Ninh Thuận">
                                <ThapChamIcon className="w-2.5 h-2.5" />
                                <span>Ninh Thuận</span>
                            </span>
                        )}
                        {isCustomerGheLay(pStore.gheLayTags, userName, pStore.tags) && (
                            <GheLayBadge className="text-[10px] mx-0.5" />
                        )}
                        <CopyButton text={displayName} className="text-xs px-1" />
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleGroupPin(g);
                            }}
                            title={isPinned ? "Bỏ ghim khách này (bỏ ghim tất cả bình luận)" : "Ghim khách này lên đầu"}
                            className={`inline-flex items-center justify-center p-1 text-xs rounded transition-all cursor-pointer mx-0.5 shrink-0 ${
                                isPinned 
                                    ? 'bg-red-500 text-white font-bold shadow-sm' 
                                    : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                            }`}
                        >
                            <span>📌</span>
                        </button>

                        {cust && cust.count > 0 && (
                            <span className="text-blue-400 text-[13px] font-black mx-1 whitespace-nowrap">
                                ({cust.count} cái - {cust.total}k)
                            </span>
                        )}

                        {hasOldCart && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenProfile(userName, g.platform);
                                }}
                                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border border-amber-500/30 cursor-pointer mx-1 shrink-0 active:scale-95 transition-transform"
                                title="Khách đang có giỏ đơn cũ giữ từ các phiên trước (chưa chốt hôm nay) - Bấm xem chi tiết"
                            >
                                <span>⏳ Giỏ cũ: {activePastTuples.length} món</span>
                                {pastTotalK > 0 && <span>({pastTotalK}k)</span>}
                            </button>
                        )}
                    </div>

                    {/* Latest Comment Content */}
                    <div 
                        onClick={() => onOpenPrice(latestC.id, userName, g.platform, extracted.price || latestClosedPriceStr?.replace(/k/g, '') || undefined)}
                        className={`text-red-400 font-bold break-words mt-1 cursor-pointer flex items-center gap-1.5 flex-wrap ${isPinned ? 'text-lg' : 'text-sm'}`}
                    >
                        <span className="line-clamp-3 break-words inline-block max-w-full">{latestContentStr}</span>

                        {/* Interactive Dropdown Button Pill on comment line */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand(g.key);
                            }}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer border shadow-xs active:scale-95 ${
                                isExpanded
                                    ? 'bg-[#00f2ea]/25 text-[#00f2ea] border-[#00f2ea]/60 ring-1 ring-[#00f2ea]/30'
                                    : g.comments.length > 1
                                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                                    : 'bg-white/10 hover:bg-white/20 text-gray-300 border-white/15'
                            }`}
                            title={isExpanded ? "Thu gọn danh sách bình luận" : `Sổ xuống xem toàn bộ ${g.comments.length} bình luận của ${userName}`}
                        >
                            <MessageSquare size={11} className={g.comments.length > 1 ? 'text-amber-400' : 'text-gray-400'} />
                            <span>{g.comments.length} cmt</span>
                            {g.comments.length > 1 && (
                                isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} className="animate-bounce" />
                            )}
                        </button>

                        {isHost && extracted.price && (
                            <span className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-[11px] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow-xs">
                                👑 Host ra giá: {extracted.price}k
                            </span>
                        )}
                        {!isHost && extracted.price && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-black px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-0.5 shadow-xs">
                                🏷️ {extracted.price}k
                            </span>
                        )}
                        {!extracted.price && latestClosedPriceStr && (
                            <span className="bg-emerald-500/25 text-emerald-200 text-[11px] font-black px-1.5 py-0.5 rounded border border-emerald-500/50 inline-flex items-center gap-0.5 shadow-xs" title="Giá đơn đã chốt">
                                🏷️ {latestClosedPriceStr}
                            </span>
                        )}
                        {latestC.time && (
                            <span className="text-[11px] text-gray-500 font-normal">
                                ({latestC.time})
                            </span>
                        )}
                    </div>

                    {/* Quick Phone / Zalo / Pancake Action Chip for Latest */}
                    {detectedPhone && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openPancakeApp(detectedPhone, true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/70 border border-blue-500/40 text-blue-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer active:scale-95"
                                title="Mở App Zalo với số điện thoại này trên điện thoại"
                            >
                                <span>💬 Mở Zalo: {detectedPhone}</span>
                            </button>
                            {!pancakeLink && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onOpenPancakeLink) {
                                            onOpenPancakeLink(userName, g.platform, detectedPhone);
                                        } else {
                                            onOpenQuickAssign?.(userName, g.platform, detectedPhone);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-950/70 border border-orange-500/40 text-orange-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer active:scale-95"
                                    title="Gán số điện thoại này vào Pancake của khách"
                                >
                                    <span>🥞 Gán SĐT</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Action Buttons: Nằm ngang, nút in to hình vuông dễ bấm, đồng bộ với nút Zalo */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-1.5 self-center sm:self-start">
                    {/* Nút Zalo / Pancake (Hình vuông) */}
                    {pancakeLink ? (
                        <div className="relative flex items-center shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openPancakeApp(pancakeLink, true);
                                }}
                                title="🥞 Đã nối Zalo/Pancake (Bấm mở chat ngay)"
                                className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold flex flex-col items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 border border-orange-400/40 shadow-orange-950/40"
                            >
                                <span className="text-base sm:text-lg md:text-xl leading-none">🥞</span>
                                <span className="text-[10px] sm:text-[11px] md:text-[12px] font-black leading-none mt-0.5">Zalo</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenPancakeLink) {
                                        onOpenPancakeLink(userName, g.platform, detectedPhone || undefined);
                                    } else {
                                        onOpenQuickAssign?.(userName, g.platform, detectedPhone || undefined);
                                    }
                                }}
                                title="Sửa Link hoặc SĐT Zalo"
                                className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-[#111722] border border-orange-400/80 text-orange-300 hover:text-white flex items-center justify-center text-[10px] shadow-sm cursor-pointer hover:scale-110 transition-transform"
                            >
                                <Edit3 size={10} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenPancakeLink) {
                                    onOpenPancakeLink(userName, g.platform, detectedPhone || undefined);
                                } else {
                                    onOpenQuickAssign?.(userName, g.platform, detectedPhone || undefined);
                                }
                            }}
                            title="🥞 Gán Zalo / Pancake (Chọn khách đang inbox)"
                            className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 font-bold flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
                        >
                            <span className="text-base sm:text-lg md:text-xl leading-none">🥞</span>
                            <span className="text-[10px] sm:text-[11px] md:text-[12px] font-bold leading-none mt-0.5">Gán</span>
                        </button>
                    )}

                    {/* Nút IN: To, hình vuông, dễ bấm trên tablet */}
                    <button 
                        disabled={!!busyPrints[latestC.id]}
                        onClick={(e) => onPrint(latestC, e)}
                        className={`w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl font-bold text-white flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md shrink-0 ${
                            busyPrints[latestC.id] 
                                ? 'bg-gray-600 border border-gray-500 opacity-75' 
                                : latestCount > 0 
                                ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 shadow-emerald-950/50 ring-1 ring-emerald-400/30' 
                                : 'bg-blue-600 hover:bg-blue-500 border border-blue-400/40 shadow-blue-950/50'
                        }`}
                        title={latestCount > 0 ? `Đã in ${latestCount} lần (Bấm để in lại)` : "In cmt mới nhất"}
                    >
                        {busyPrints[latestC.id] ? (
                            <RefreshCw size={18} className="animate-spin" />
                        ) : latestCount > 0 ? (
                            <>
                                <Printer size={16} className="sm:size-[18px] opacity-95" />
                                <span className="text-[12px] sm:text-[13px] md:text-[14px] font-black leading-none mt-0.5">({latestCount})</span>
                            </>
                        ) : (
                            <>
                                <Printer size={16} className="sm:size-[18px]" />
                                <span className="text-[11px] sm:text-[12px] md:text-[13px] font-black tracking-wider leading-none mt-0.5">IN</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Expanded Dropdown Nested List of All Customer's Comments */}
            {isExpanded && (
                <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2 pl-2 sm:pl-3 border-l-2 border-l-[#00f2ea]/70 bg-black/30 p-2.5 rounded-xl">
                    <div className="flex items-center justify-between text-xs text-gray-300 font-bold mb-1 px-1">
                        <span className="flex items-center gap-1.5 text-[#00f2ea]">
                            <MessageSquare size={13} />
                            <span>Tất cả {g.comments.length} bình luận của @{userName}:</span>
                        </span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand(g.key);
                            }}
                            className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-md border border-white/10 cursor-pointer transition-colors"
                        >
                            <ChevronUp size={12} /> Thu gọn
                        </button>
                    </div>

                    <div className="space-y-1.5">
                        {g.comments.map((subC, idx) => (
                            <SubCommentRow 
                                key={`${subC.platform}_${subC.id}_${idx}`}
                                comment={subC}
                                index={idx}
                                total={g.comments.length}
                                isBusy={!!busyPrints[subC.id]}
                                now={now}
                                onPrint={onPrint}
                                onTogglePin={onTogglePin}
                                onOpenPrice={onOpenPrice}
                                onOpenPancakeLink={onOpenPancakeLink}
                                onOpenQuickAssign={onOpenQuickAssign}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

const CommentRow = memo(function CommentRow({
    comment: c,
    now,
    isBusy,
    onPrint,
    onTogglePin,
    onOpenPrice,
    onOpenProfile,
    onOpenPancakeLink,
    onOpenQuickAssign
}: CommentRowProps) {
    const store = useStore();
    const pStore = store[c.platform] || store.tiktok;
    const count = (pStore.printed && pStore.printed[c.id]) || 0;
    const userName = normalizeUser(c.user);
    const isHost = pStore.tags && pStore.tags[userName] === 'HOST';
    const isPinned = pStore.pinned && pStore.pinned[c.id] && (pStore.pinned[c.id].expiry > now || isHost);
    const cust = pStore.customers && pStore.customers[userName];
    const userTag = (pStore.tags && pStore.tags[userName]) || 'NORMAL';
    const nickname = pStore.nicknames?.[userName];
    const displayName = userName;
    const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
    const detectedPhone = extractPhoneFromText(contentStr);
    const pancakeLink = pStore.pancakeLinks?.[userName];
    const extracted = extractPriceFromContent(contentStr);
    const flowPrice = pStore.flowPrice;
    const closedPriceStr = getClosedPriceForComment(pStore.customers, userName, c.id);

    const isClosedToday = Boolean(cust && cust.count > 0);
    const activePastTuples = useMemo(() => {
        if (isClosedToday || !cust || !cust.pastItems || cust.pastItems.length === 0) return [];
        const hasUnshipped = cust.pastItems.some(it => !it.shipped);
        if (!hasUnshipped) return [];
        const activeInsight = getCustomerInsight(userName);
        return getCustomerActivePastItems(cust, activeInsight);
    }, [isClosedToday, cust, userName]);

    const hasOldCart = !isClosedToday && activePastTuples.length > 0;
    const pastTotalK = useMemo(() => {
        if (!hasOldCart) return 0;
        return activePastTuples.reduce((sum, { item }) => sum + (item.price || 0), 0);
    }, [hasOldCart, activePastTuples]);

    const containerClass = isPinned 
        ? 'bg-[#2a1b1b] border-l-[6px] border-l-red-600 shadow-md my-1 py-3' 
        : 'bg-[#1c242f] hover:bg-[#202b38]';

    return (
        <div className={`p-3 border-b border-white/10 flex gap-2.5 items-start transition-colors duration-150 ${containerClass}`}>
            <div className="flex flex-col items-center shrink-0 self-start mt-0.5">
                <CustomerAvatar 
                    user={userName} 
                    platform={c.platform} 
                    avatarUrl={c.avatar}
                    tag={isHost ? 'HOST' : userTag}
                    size={isPinned ? 'lg' : 'md'}
                    onClick={() => onOpenProfile(userName, c.platform)}
                />
            </div>
            <div className="flex-1 overflow-hidden min-w-0">
                <div className="flex items-center flex-wrap gap-y-1">
                    <div 
                        onClick={() => onOpenProfile(userName, c.platform)}
                        className="inline-flex items-center gap-1 cursor-pointer truncate max-w-[200px] xs:max-w-[280px] sm:max-w-[380px] mr-0.5"
                        title={nickname ? `Khách: ${userName} (Tên gợi nhớ: ${nickname})` : `Khách: ${userName}`}
                    >
                        <b className={`text-gray-100 hover:underline truncate ${isPinned ? 'text-lg sm:text-xl' : 'text-base sm:text-[17px]'}`}>
                            {userName}
                        </b>
                    </div>
                    {pStore.ninhThuanTags?.[userName] && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-1 mx-0.5" title="Khách Ninh Thuận">
                            <ThapChamIcon className="w-2.5 h-2.5" />
                            <span>Ninh Thuận</span>
                        </span>
                    )}
                    {isCustomerGheLay(pStore.gheLayTags, userName, pStore.tags) && (
                        <GheLayBadge className="text-[10px] mx-0.5" />
                    )}
                    <CopyButton text={displayName} className="text-xs px-1" />
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(c.platform, c.id, userName);
                        }}
                        title={isPinned ? "Bỏ ghim bình luận này" : "Ghim bình luận này lên đầu"}
                        className={`inline-flex items-center justify-center p-1 text-xs rounded transition-all cursor-pointer mx-0.5 shrink-0 ${
                            isPinned 
                                
                                ? 'bg-red-500 text-white font-bold shadow-sm' 
                                : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                        }`}
                    >
                        <span>📌</span>
                    </button>
                    {cust && cust.count > 0 && (
                        <span className="text-blue-400 text-[13px] font-black mx-1 whitespace-nowrap">
                            ({cust.count} cái - {cust.total}k)
                        </span>
                    )}
                    {hasOldCart && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenProfile(userName, c.platform);
                            }}
                            className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border border-amber-500/30 cursor-pointer mx-1 shrink-0 active:scale-95 transition-transform"
                            title="Khách đang có giỏ đơn cũ giữ từ các phiên trước (chưa chốt hôm nay) - Bấm xem chi tiết"
                        >
                            <span>⏳ Giỏ cũ: {activePastTuples.length} món</span>
                            {pastTotalK > 0 && <span>({pastTotalK}k)</span>}
                        </button>
                    )}
                </div>
                <div 
                    onClick={() => onOpenPrice(c.id, userName, c.platform, extracted.price || closedPriceStr?.replace(/k/g, '') || undefined)}
                    className={`text-red-400 font-bold break-words mt-1 cursor-pointer flex items-center gap-2 flex-wrap ${isPinned ? 'text-lg' : 'text-sm'}`}
                >
                    <span className="line-clamp-3 break-words inline-block max-w-full">{contentStr}</span>
                    {isHost && extracted.price && (
                        <span className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-[11px] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow-xs">
                            👑 Host ra giá: {extracted.price}k
                        </span>
                    )}
                    {!isHost && extracted.price && (
                        <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-black px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-0.5 shadow-xs">
                            🏷️ {extracted.price}k
                        </span>
                    )}
                    {!extracted.price && closedPriceStr && (
                        <span className="bg-emerald-500/25 text-emerald-200 text-[11px] font-black px-1.5 py-0.5 rounded border border-emerald-500/50 inline-flex items-center gap-0.5 shadow-xs" title="Giá đơn đã chốt">
                            🏷️ {closedPriceStr}
                        </span>
                    )}
                </div>

                {/* Quick Phone / Zalo / Pancake Action Chip */}
                {detectedPhone && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                openPancakeApp(detectedPhone, true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/70 border border-blue-500/40 text-blue-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer active:scale-95"
                            title="Mở App Zalo với số điện thoại này trên điện thoại"
                        >
                            <span>💬 Mở Zalo: {detectedPhone}</span>
                        </button>
                        {!pancakeLink && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenPancakeLink) {
                                        onOpenPancakeLink(userName, c.platform, detectedPhone);
                                    } else {
                                        onOpenQuickAssign?.(userName, c.platform, detectedPhone);
                                    }
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-950/70 border border-orange-500/40 text-orange-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer active:scale-95"
                                title="Gán số điện thoại này vào Pancake của khách"
                            >
                                <span>🥞 Gán SĐT</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Action Buttons: Nằm ngang, nút in to hình vuông dễ bấm, đồng bộ với nút Zalo */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-1.5 self-center sm:self-start">
                {/* Nút Zalo / Pancake (Hình vuông) */}
                {pancakeLink ? (
                    <div className="relative flex items-center shrink-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openPancakeApp(pancakeLink, true);
                            }}
                            title="🥞 Đã nối Zalo/Pancake (Bấm mở chat ngay)"
                            className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold flex flex-col items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 border border-orange-400/40 shadow-orange-950/40"
                        >
                            <span className="text-base sm:text-lg md:text-xl leading-none">🥞</span>
                            <span className="text-[10px] sm:text-[11px] md:text-[12px] font-black leading-none mt-0.5">Zalo</span>
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenPancakeLink) {
                                    onOpenPancakeLink(userName, c.platform, detectedPhone || undefined);
                                } else {
                                    onOpenQuickAssign?.(userName, c.platform, detectedPhone || undefined);
                                }
                            }}
                            title="Sửa Link hoặc SĐT Zalo"
                            className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-[#111722] border border-orange-400/80 text-orange-300 hover:text-white flex items-center justify-center text-[10px] shadow-sm cursor-pointer hover:scale-110 transition-transform"
                        >
                            <Edit3 size={10} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenPancakeLink) {
                                onOpenPancakeLink(userName, c.platform, detectedPhone || undefined);
                            } else {
                                onOpenQuickAssign?.(userName, c.platform, detectedPhone || undefined);
                            }
                        }}
                        title="🥞 Gán Zalo / Pancake (Chọn khách đang inbox)"
                        className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 font-bold flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
                    >
                        <span className="text-base sm:text-lg md:text-xl leading-none">🥞</span>
                        <span className="text-[10px] sm:text-[11px] md:text-[12px] font-bold leading-none mt-0.5">Gán</span>
                    </button>
                )}

                {/* Nút IN: To, hình vuông, dễ bấm trên tablet */}
                <button 
                    disabled={isBusy}
                    onClick={(e) => onPrint(c, e)}
                    className={`w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl font-bold text-white flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md shrink-0 ${
                        isBusy 
                            ? 'bg-gray-600 border border-gray-500 opacity-75' 
                            : count > 0 
                            ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 shadow-emerald-950/50 ring-1 ring-emerald-400/30' 
                            : 'bg-blue-600 hover:bg-blue-500 border border-blue-400/40 shadow-blue-950/50'
                    }`}
                    title={count > 0 ? `Đã in ${count} lần (Bấm để in lại)` : "In cmt mới nhất"}
                >
                    {isBusy ? (
                        <RefreshCw size={18} className="animate-spin" />
                    ) : count > 0 ? (
                        <>
                            <Printer size={16} className="sm:size-[18px] opacity-95" />
                            <span className="text-[12px] sm:text-[13px] md:text-[14px] font-black leading-none mt-0.5">({count})</span>
                        </>
                    ) : (
                        <>
                            <Printer size={16} className="sm:size-[18px]" />
                            <span className="text-[11px] sm:text-[12px] md:text-[13px] font-black tracking-wider leading-none mt-0.5">IN</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
});

export const Feed = memo(function Feed({ 
    searchKeyword, 
    hostMode,
    onOpenPrice, 
    onOpenProfile,
    onOpenPancakeLink,
    onScroll,
    onOpenManualOrder
}: FeedProps) {
    const store = useStore();
    const parentRef = useRef<HTMLDivElement>(null);
    const [busyPrints, setBusyPrints] = useState<Record<string, boolean>>({});
    const [now, setNow] = useState(Date.now());
    const [showAllTags, setShowAllTags] = useState(false);
    
    // Group By User Mode State (Persisted in localStorage)
    const [groupByUser, setGroupByUser] = useState<boolean>(() => {
        try {
            return localStorage.getItem('slp_feed_group_by_user') === 'true';
        } catch {
            return false;
        }
    });



    // Expanded groups state (keyed by `${platform}_${username}`)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const [quickAssignTarget, setQuickAssignTarget] = useState<{
        user: string;
        platform: Platform;
        commentPhone?: string;
    } | null>(null);
    const lastScrollYRef = useRef(0);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const currentY = e.currentTarget.scrollTop;
        if (onScroll) {
            if (currentY > lastScrollYRef.current + 5 && currentY > 20) {
                onScroll(true); // Lướt xuống
            } else if (currentY < lastScrollYRef.current - 5) {
                onScroll(false); // Lướt lên
            }
        }
        lastScrollYRef.current = currentY;
    }, [onScroll]);

    useEffect(() => {
        setShowAllTags(false);
    }, [searchKeyword]);

    const handleSetGroupBy = useCallback((val: boolean) => {
        setGroupByUser(val);
        try {
            localStorage.setItem('slp_feed_group_by_user', String(val));
        } catch {}
    }, []);

    const toggleExpandGroup = useCallback((groupKey: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupKey]: !prev[groupKey]
        }));
    }, []);

    const keyword = searchKeyword.trim().toLowerCase();
    const isTagSearch = keyword.startsWith('/');

    // Handle Tag Search View (/top10, /coc, /vip, etc.)
    const tagCustomers = useMemo(() => {
        if (!isTagSearch) return [];
        let list: { user: string; platform: Platform; c: any; tag: string }[] = [];
        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
            const pStore = store[p] || store.tiktok;
            const custs = pStore.customers || {};
            const tags = pStore.tags || {};
            Object.keys(custs).forEach(user => {
                const tag = tags[user];
                let match = false;
                if ((keyword === '/coc' || keyword === '/coc50') && tag === 'COC') match = true;
                else if ((keyword === '/coc' || keyword === '/coc100') && tag === 'COC_100') match = true;
                else if ((keyword === '/quen' || keyword === '/vip') && tag === 'VIP') match = true;
                else if (keyword === '/dao' && tag === 'DAO') match = true;
                else if (keyword === '/chan' && tag === 'CHAN') match = true;
                else if (keyword === '/bom' && tag === 'BOM') match = true;
                else if ((keyword === '/ghelay' || keyword === '/gl') && tag === 'GHE_LAY') match = true;
                else if (keyword.startsWith('/top')) {
                    if (custs[user] && custs[user].count > 0) match = true;
                }
                if (match) {
                    list.push({ user, platform: p, c: custs[user], tag });
                }
            });
        });

        if (keyword.startsWith('/top')) {
            const numMatch = keyword.match(/\d+/);
            const num = numMatch ? parseInt(numMatch[0]) : 10;
            list.sort((a, b) => (b.c.lastTime || 0) - (a.c.lastTime || 0));
            list = list.slice(0, num);
        } else {
            list.sort((a, b) => (b.c.lastTime || 0) - (a.c.lastTime || 0));
        }
        return list;
    }, [isTagSearch, keyword, store.tiktok.customers, store.facebook.customers, store.shopee.customers, store.tiktok.tags, store.facebook.tags, store.shopee.tags]);

    // 1. Build base deduplicated comments list (O(N) with Hash Set instead of O(N^2))
    const baseDeduplicatedComments = useMemo(() => {
        let items: CommentData[] = [];
        const seenIds = new Set<string>();
        const seenSignatures = new Set<string>();
        const globalClearedAt = getGlobalFeedClearedAt();

        (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
            const pStore = store[p] || store.tiktok;
            const effectiveClearedAt = Math.max(globalClearedAt, getFeedClearedAt(p));
            let platformComments = (pStore.comments || []).filter(c => {
                if (!c) return false;
                const cTs = Number(c.ts) || 0;
                if (effectiveClearedAt > 0) {
                    if (!cTs || cTs <= effectiveClearedAt) return false;
                }
                return true;
            });
            const tags = pStore.tags || {};

            if (hostMode) {
                platformComments = platformComments.filter(c => c && c.user && tags[normalizeUser(c.user)] === 'HOST');
            }

            platformComments.forEach(c => {
                if (!c) return;
                const safePlatform: Platform = (c.platform === 'facebook' || c.platform === 'shopee') ? c.platform : p;
                const cleanUser = normalizeUser(c.user);
                const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '').trim();
                const cTs = Number(c.ts) || 0;
                const idStr = c.id ? String(c.id) : '';

                // O(1) Chống trùng lặp tuyệt đối qua ID và Time-bucket signature
                if (idStr && seenIds.has(idStr)) return;

                const cleanUserNorm = cleanUser.toLowerCase();
                const contentNorm = contentStr.toLowerCase();
                const timeBucket = Math.floor(cTs / 25000);
                const sig1 = `${cleanUserNorm}_${contentNorm}_${timeBucket}`;
                const sig2 = `${cleanUserNorm}_${contentNorm}_${timeBucket - 1}`;
                const sig3 = `${cleanUserNorm}_${contentNorm}_${timeBucket + 1}`;

                if (seenSignatures.has(sig1) || seenSignatures.has(sig2) || seenSignatures.has(sig3)) {
                    return;
                }

                if (idStr) seenIds.add(idStr);
                seenSignatures.add(sig1);

                items.push({
                    ...c,
                    id: idStr || `c_${cleanUser}_${contentStr.slice(0, 20)}_${cTs}`,
                    user: cleanUser,
                    content: contentStr,
                    platform: safePlatform,
                    ts: cTs
                });
            });
        });

        // Filter out blocked users
        items = items.filter(c => {
            const pStore = store[c.platform] || store.tiktok;
            const tags = pStore.tags || {};
            return tags[normalizeUser(c.user)] !== 'CHAN';
        });

        // Sort by timestamp descending (newest first)
        items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        return items;
    }, [hostMode, store.tiktok.comments, store.facebook.comments, store.shopee.comments, store.tiktok.tags, store.facebook.tags, store.shopee.tags]);

    // 2. Build filtered and pinned comments feed (Instant <1ms search response)
    const displayList = useMemo(() => {
        if (isTagSearch) return [];

        let items = baseDeduplicatedComments;

        // Keyword filter: searches customer comment content, username, nickname, #id with & without Vietnamese accents
        if (keyword) {
            const isIdQuery = keyword.startsWith('#') || /^\d+$/.test(keyword);
            const targetId = keyword.startsWith('#') ? keyword.slice(1) : keyword;
            const kwNoAccent = removeVietnameseAccents(keyword);

            items = items.filter(c => {
                const pStore = store[c.platform] || store.tiktok;
                const userLower = (c as any)._ul || ((c as any)._ul = c.user.toLowerCase());
                const userNoAccent = (c as any)._una || ((c as any)._una = removeVietnameseAccents(userLower));
                const nick = pStore.nicknames?.[c.user] || '';
                const nickLower = nick ? ((c as any)._nl || ((c as any)._nl = nick.toLowerCase())) : '';
                const nickNoAccent = nickLower ? ((c as any)._nna || ((c as any)._nna = removeVietnameseAccents(nickLower))) : '';
                const shortId = (c as any)._sid || ((c as any)._sid = getShortId(c.user).toLowerCase());
                const contentRaw = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
                const contentLower = (c as any)._cl || ((c as any)._cl = contentRaw.toLowerCase());
                const contentNoAccent = (c as any)._cna || ((c as any)._cna = removeVietnameseAccents(contentLower));

                if (isIdQuery) {
                    if (shortId === targetId || ('#' + shortId) === keyword) return true;
                }

                // Check match with or without accents across content, user, and nickname
                const matchContent = contentLower.includes(keyword) || contentNoAccent.includes(kwNoAccent);
                const matchUser = userLower.includes(keyword) || userNoAccent.includes(kwNoAccent);
                const matchNick = (nickLower && nickLower.includes(keyword)) || (nickNoAccent && nickNoAccent.includes(kwNoAccent));

                return matchContent || matchUser || matchNick;
            });
        }

        // Separate pinned and normal comments
        const pinned: CommentData[] = [];
        const normal: CommentData[] = [];

        items.forEach(c => {
            const pStore = store[c.platform] || store.tiktok;
            const pState = pStore.pinned?.[c.id];
            if (pState && (pState.expiry > now || (pStore.tags && pStore.tags[c.user] === 'HOST'))) {
                pinned.push(c);
            } else {
                normal.push(c);
            }
        });

        return [...pinned, ...normal];
    }, [isTagSearch, keyword, baseDeduplicatedComments, now, store.tiktok.pinned, store.facebook.pinned, store.shopee.pinned, store.tiktok.tags, store.facebook.tags, store.shopee.tags, store.tiktok.nicknames, store.facebook.nicknames, store.shopee.nicknames]);

    // Build user-grouped comment list when in Group By User Mode
    const userGroupList = useMemo<UserCommentGroup[]>(() => {
        if (!groupByUser || isTagSearch) return [];

        const groupMap = new Map<string, UserCommentGroup>();

        displayList.forEach(c => {
            const cleanUser = normalizeUser(c.user);
            const safePlatform = c.platform;
            const groupKey = `${safePlatform}_${cleanUser.toLowerCase()}`;
            const cTs = Number(c.ts) || 0;

            let g = groupMap.get(groupKey);
            if (!g) {
                g = {
                    key: groupKey,
                    user: cleanUser,
                    platform: safePlatform,
                    avatar: c.avatar,
                    latestComment: c,
                    latestTs: cTs,
                    comments: [c],
                    isPinned: false
                };
                groupMap.set(groupKey, g);
            } else {
                g.comments.push(c);
                if (cTs > g.latestTs) {
                    g.latestTs = cTs;
                    g.latestComment = c;
                }
                if (!g.avatar && c.avatar) {
                    g.avatar = c.avatar;
                }
            }
        });

        const groups = Array.from(groupMap.values());

        // Sort comments inside each group by timestamp descending
        groups.forEach(g => {
            g.comments.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
            g.latestComment = g.comments[0];
            g.latestTs = Number(g.latestComment?.ts) || g.latestTs;

            const pStore = store[g.platform] || store.tiktok;
            const isHost = pStore.tags && pStore.tags[g.user] === 'HOST';
            const hasPinned = g.comments.some(c => {
                const pState = pStore.pinned?.[c.id];
                return pState && (pState.expiry > now || isHost);
            });
            g.isPinned = Boolean(hasPinned);
        });

        const pinnedGroups: UserCommentGroup[] = [];
        const normalGroups: UserCommentGroup[] = [];

        groups.forEach(g => {
            if (g.isPinned) pinnedGroups.push(g);
            else normalGroups.push(g);
        });

        // Sort groups by latestTs descending so when any user comments, they jump to top!
        pinnedGroups.sort((a, b) => b.latestTs - a.latestTs);
        normalGroups.sort((a, b) => b.latestTs - a.latestTs);

        return [...pinnedGroups, ...normalGroups];
    }, [groupByUser, isTagSearch, displayList, store, now]);

    const isAllExpanded = useMemo(() => {
        if (userGroupList.length === 0) return false;
        return userGroupList.every(g => expandedGroups[g.key]);
    }, [userGroupList, expandedGroups]);

    const handleToggleExpandAll = useCallback(() => {
        if (isAllExpanded) {
            setExpandedGroups({});
        } else {
            const next: Record<string, boolean> = {};
            userGroupList.forEach(g => {
                next[g.key] = true;
            });
            setExpandedGroups(next);
        }
    }, [isAllExpanded, userGroupList]);

    const activeItemCount = groupByUser ? userGroupList.length : displayList.length;

    // Virtualizer setup for comments list
    const rowVirtualizer = useVirtualizer({
        count: activeItemCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => (groupByUser ? 95 : 78),
        overscan: 8,
        getItemKey: (index) => {
            if (groupByUser) {
                const g = userGroupList[index];
                return g ? g.key : index;
            }
            const item = displayList[index];
            return item ? `${item.platform}_${item.id}` : index;
        }
    });

    const handlePrint = useCallback((c: CommentData, e?: React.MouseEvent) => {
        if (busyPrints[c.id]) return;
        setBusyPrints(prev => ({ ...prev, [c.id]: true }));
        
        const userName = normalizeUser(c.user);
        const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content) : String(c.content || '');
        let extracted = extractPriceFromContent(contentStr);
        if (extracted.price) {
            const commentContentToSave = contentStr.trim() || extracted.content;
            store.printNewOrder(c.platform, userName, commentContentToSave, extracted.price, c.time, c.id);
            if (e) {
                window.dispatchEvent(new CustomEvent('FLYING_PLUS_ONE', { detail: { x: e.clientX, y: e.clientY, platform: c.platform } }));
            }
            setTimeout(() => {
                setBusyPrints(prev => {
                    const next = {...prev}; delete next[c.id]; return next;
                });
            }, 600);
        } else {
            onOpenPrice(c.id, userName, c.platform);
            setBusyPrints(prev => {
                const next = {...prev}; delete next[c.id]; return next;
            });
        }
    }, [busyPrints, onOpenPrice, store]);

    const handleTogglePin = useCallback((platform: Platform, id: string, user: string) => {
        store.togglePin(platform, id, user);
    }, [store]);

    const handleToggleGroupPin = useCallback((g: UserCommentGroup) => {
        const userName = normalizeUser(g.user);
        const pStore = store[g.platform] || store.tiktok;
        const isHost = pStore.tags && pStore.tags[userName] === 'HOST';
        
        // Kiểm tra xem nhóm này hiện có bất kỳ bình luận nào đang được ghim không
        const pinnedCommentIds = g.comments.filter(c => {
            const pState = pStore.pinned?.[c.id];
            return pState && (pState.expiry > now || isHost);
        }).map(c => c.id);

        if (g.isPinned || pinnedCommentIds.length > 0) {
            // BỎ GHIM: Xoá tất cả bình luận được ghim của khách này
            store.unpinAllUserComments(g.platform, userName);
            g.comments.forEach(c => {
                store.unpinComment(g.platform, c.id);
            });
        } else {
            // GHIM: Ghim bình luận mới nhất của khách này
            const targetComment = g.latestComment || g.comments[0];
            if (targetComment) {
                store.togglePin(g.platform, targetComment.id, userName);
            }
        }
    }, [now, store]);

    const activeHostFlow = store.tiktok.flowPrice || store.facebook.flowPrice || store.shopee.flowPrice;
    const activeHostFlowPlatform: Platform = store.tiktok.flowPrice ? 'tiktok' : store.facebook.flowPrice ? 'facebook' : 'shopee';

    if (isTagSearch) {
        let headerText = `Danh sách khách hàng lọc theo "${keyword}"`;
        if (keyword === '/coc') headerText = 'Khách cọc gần đây';
        if (keyword === '/quen' || keyword === '/vip') headerText = 'Khách quen chốt gần nhất';
        if (keyword.startsWith('/top')) {
            const numMatch = keyword.match(/\d+/);
            const num = numMatch ? parseInt(numMatch[0]) : 10;
            headerText = `Top ${num} khách chốt gần nhất`;
        }

        return (
            <div ref={parentRef} className="flex-1 overflow-y-auto bg-[#0e1621] p-3 space-y-2">
                <div className="text-sm font-bold text-gray-300 pb-2 border-b border-white/10 flex items-center justify-between">
                    <span>{headerText} ({tagCustomers.length})</span>
                </div>
                {tagCustomers.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">Không tìm thấy khách hàng nào phù hợp</div>
                ) : (
                    <>
                        {(showAllTags ? tagCustomers : tagCustomers.slice(0, 10)).map((item, idx) => {
                            const pStore = store[item.platform] || store.tiktok;
                            const nickname = pStore.nicknames?.[item.user];
                            const displayName = nickname ? `(${nickname}) ${item.user}` : `#${getShortId(item.user)} ${item.user}`;
                            const commentWithAvatar = pStore.comments?.find(c => normalizeUser(c.user) === item.user && c.avatar);
                            const avatarUrl = commentWithAvatar?.avatar;
                            const pLink = pStore.pancakeLinks?.[item.user];

                            return (
                                <div key={idx} className="bg-[#1c242f] p-3 rounded-xl border border-white/5 flex items-center justify-between gap-2 shadow-sm">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <CustomerAvatar 
                                            user={item.user} 
                                            platform={item.platform} 
                                            avatarUrl={avatarUrl}
                                            tag={item.tag}
                                            size="md"
                                            onClick={() => onOpenProfile(item.user, item.platform)}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <div 
                                                    onClick={() => onOpenProfile(item.user, item.platform)} 
                                                    className="inline-flex items-center gap-1 cursor-pointer truncate max-w-[180px] xs:max-w-[240px]"
                                                    title={nickname ? `Khách: ${item.user} (Tên gợi nhớ: ${nickname})` : `Khách: ${item.user}`}
                                                >
                                                    <b className="text-gray-100 text-sm hover:underline truncate">
                                                        {item.user}
                                                    </b>
                                                </div>
                                                {pStore.ninhThuanTags?.[item.user] && (
                                                    <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-1" title="Khách Ninh Thuận">
                                                        <ThapChamIcon className="w-2.5 h-2.5" />
                                                        <span>Ninh Thuận</span>
                                                    </span>
                                                )}
                                                {isCustomerGheLay(pStore.gheLayTags, item.user, pStore.tags) && item.tag !== 'GHE_LAY' && (
                                                    <GheLayBadge className="text-[10px]" />
                                                )}
                                                <CopyButton text={displayName} className="text-xs px-1" />
                                            </div>
                                            <div className="text-xs text-blue-400 font-bold mt-0.5">
                                                {item.c.count || 0} cái - {item.c.total || 0}k
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {pLink && (
                                            <button 
                                                onClick={() => openPancakeApp(pLink, true)}
                                                className="bg-orange-600 hover:bg-orange-500 text-white p-2 rounded-lg text-xs font-bold transition-all shadow cursor-pointer active:scale-95 flex items-center gap-1"
                                                title="Mở Zalo/Pancake"
                                            >
                                                <span>🥞</span>
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => onOpenPrice(null, item.user, item.platform)}
                                            className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow cursor-pointer flex items-center gap-1 active:scale-95"
                                        >
                                            <PlusCircle size={14} /> Chốt
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {!showAllTags && tagCustomers.length > 10 && (
                            <button 
                                onClick={() => setShowAllTags(true)}
                                className="w-full py-2.5 bg-[#1c242f] hover:bg-[#253243] text-blue-400 text-xs font-bold rounded-xl border border-white/5 transition-all text-center mt-2 cursor-pointer"
                            >
                                Xem thêm {tagCustomers.length - 10} khách hàng khác...
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    }

    if (displayList.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 py-16 px-4 bg-[#0e1621]">
                <div className="text-3xl mb-2">{keyword ? '🔍' : '💬'}</div>
                <div className="text-sm font-bold text-white">
                    {keyword ? `Không tìm thấy bình luận nào khớp với "${searchKeyword}"` : 'Đang đợi dữ liệu bình luận từ Live...'}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                    {keyword ? 'Thử tìm theo từ khóa cmt khác, tên khách, hoặc mã số #id' : 'Bình luận mới từ TikTok và Facebook sẽ tự động hiển thị tại đây'}
                </div>
            </div>
        );
    }

    return (
        <div 
            ref={parentRef} 
            className="flex-1 overflow-y-auto bg-[#0e1621] will-change-scroll relative" 
            onScroll={handleScroll}
        >
            {/* Thanh hiển thị kết quả tìm kiếm trực tiếp trên Chat Live */}
            {keyword && (
                <div className="sticky top-0 z-30 bg-cyan-950/90 border-b border-cyan-500/40 px-3 py-1.5 flex items-center justify-between text-xs text-cyan-200 backdrop-blur-sm shadow-sm">
                    <span className="flex items-center gap-1.5 font-bold truncate">
                        <span>💬</span>
                        <span>Tìm thấy <strong className="text-white font-black text-sm">{displayList.length}</strong> bình luận khớp "{searchKeyword}"</span>
                    </span>
                    <span className="text-[10px] text-cyan-300 font-medium px-2 py-0.5 rounded-full bg-cyan-900/60 border border-cyan-500/30 shrink-0">
                        Đang lọc trên Live
                    </span>
                </div>
            )}

            {/* Mode Switcher & Display Filter Toolbar */}
            <div className="sticky top-0 z-20 bg-[#131d28]/95 backdrop-blur-md border-b border-white/10 px-3 py-2 flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">
                        Hiển thị:
                    </span>
                    <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 h-8 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleSetGroupBy(false)}
                            className={`h-full px-2 sm:px-2.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                !groupByUser 
                                    ? 'bg-blue-600 text-white shadow-sm' 
                                    : 'text-gray-400 hover:text-white'
                            }`}
                            title="Hiển thị từng bình luận theo thời gian thực (Mặc định)"
                        >
                            <List size={13} className="shrink-0" />
                            <span className="whitespace-nowrap">Mặc định</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSetGroupBy(true)}
                            className={`h-full px-2 sm:px-2.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                groupByUser 
                                    ? 'bg-[#00f2ea] text-black shadow-sm' 
                                    : 'text-gray-400 hover:text-white'
                            }`}
                            title="Gộp các bình luận của cùng một khách hàng lại với nhau"
                        >
                            <Users size={13} className="shrink-0" />
                            <span className="whitespace-nowrap">Gộp theo khách</span>
                        </button>
                    </div>

                    {/* Dấu ➕ to, cân đối, thẳng hàng ngay cạnh Gộp theo khách */}
                    <button
                        type="button"
                        onClick={() => onOpenManualOrder?.()}
                        className="h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center shadow-md transition-all cursor-pointer border border-blue-400/30 shrink-0"
                        title="Tạo mới đơn hàng / Thêm món thủ công (+)"
                    >
                        <Plus size={18} strokeWidth={2.8} />
                    </button>
                </div>

                {groupByUser ? (
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span className="text-[11px] text-gray-400 hidden sm:inline whitespace-nowrap">
                            {userGroupList.length} khách ({displayList.length} cmt)
                        </span>
                        {userGroupList.length > 0 && (
                            <button
                                type="button"
                                onClick={handleToggleExpandAll}
                                className="text-[11px] font-semibold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                title={isAllExpanded ? "Thu gọn tất cả" : "Mở rộng tất cả"}
                            >
                                {isAllExpanded ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
                                <span className="whitespace-nowrap">{isAllExpanded ? 'Thu gọn hết' : 'Mở rộng hết'}</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="text-[11px] text-gray-400 font-medium shrink-0 whitespace-nowrap">
                        💬 {displayList.length} bình luận
                    </div>
                )}
            </div>

            <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative'
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        if (groupByUser) {
                            const g = userGroupList[virtualRow.index];
                            if (!g) return null;
                            return (
                                <div
                                    key={virtualRow.key}
                                    ref={rowVirtualizer.measureElement}
                                    data-index={virtualRow.index}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`
                                    }}
                                >
                                    <UserGroupRow 
                                        group={g}
                                        isExpanded={Boolean(expandedGroups[g.key] || (keyword && !isTagSearch))}
                                        onToggleExpand={toggleExpandGroup}
                                        now={now}
                                        busyPrints={busyPrints}
                                        onPrint={handlePrint}
                                        onTogglePin={handleTogglePin}
                                        onToggleGroupPin={handleToggleGroupPin}
                                        onOpenPrice={onOpenPrice}
                                        onOpenProfile={onOpenProfile}
                                        onOpenPancakeLink={onOpenPancakeLink}
                                        onOpenQuickAssign={(u, p, phone) => {
                                            if (onOpenPancakeLink) {
                                                onOpenPancakeLink(u, p, phone);
                                            } else {
                                                setQuickAssignTarget({ user: u, platform: p, commentPhone: phone });
                                            }
                                        }}
                                    />
                                </div>
                            );
                        }

                        const c = displayList[virtualRow.index];
                        if (!c) return null;
                        return (
                            <div
                                key={virtualRow.key}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`
                                }}
                            >
                                <CommentRow 
                                    comment={c}
                                    now={now}
                                    isBusy={!!busyPrints[c.id]}
                                    onPrint={handlePrint}
                                    onTogglePin={handleTogglePin}
                                    onOpenPrice={onOpenPrice}
                                    onOpenProfile={onOpenProfile}
                                    onOpenPancakeLink={onOpenPancakeLink}
                                    onOpenQuickAssign={(u, p, phone) => {
                                        if (onOpenPancakeLink) {
                                            onOpenPancakeLink(u, p, phone);
                                        } else {
                                            setQuickAssignTarget({ user: u, platform: p, commentPhone: phone });
                                        }
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>{quickAssignTarget && (
                <QuickAssignModal
                    isOpen={!!quickAssignTarget}
                    user={quickAssignTarget.user}
                    platform={quickAssignTarget.platform}
                    commentPhone={quickAssignTarget.commentPhone}
                    onClose={() => setQuickAssignTarget(null)}
                    onOpenFullModal={() => {
                        const target = quickAssignTarget;
                        setQuickAssignTarget(null);
                        onOpenPancakeLink?.(target.user, target.platform);
                    }}
                />
            )}
        </div>
    );
});
