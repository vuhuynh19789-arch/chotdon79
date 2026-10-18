import React, { useState, useEffect, memo } from 'react';
import { Platform, PLATFORMS, normalizeUser } from '../lib/core';
import { useStore, getCustomerAvatar } from '../store';
import { getAvatarFromMemory, getAvatarFromCache, cacheRemoteAvatar } from '../lib/avatarCache';

export function ThapChamIcon({ className = "w-3 h-3" }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Tháp Chàm Ninh Thuận">
            {/* Chóp nhọn búp sen đỉnh tháp vàng kim */}
            <path d="M10 1L11.5 4H8.5L10 1Z" fill="#FDE047" />
            {/* Tầng mái 3 */}
            <path d="M7.8 4.2H12.2L13 6.8H7L7.8 4.2Z" fill="#FDBA74" />
            {/* Tầng mái 2 */}
            <path d="M6.5 6.8H13.5L14.5 10H5.5L6.5 6.8Z" fill="#FB923C" />
            {/* Thân tháp chính tầng 1 */}
            <path d="M5 10H15L15.8 17.5H4.2L5 10Z" fill="#EA580C" />
            {/* Vòm cổng tháp đặc trưng */}
            <path d="M8.2 17.5V13.2C8.2 12.3 9 11.5 10 11.5C11 11.5 11.8 12.3 11.8 13.2V17.5H8.2Z" fill="#431407" />
            {/* Chân đế tháp gạch nung */}
            <rect x="3.2" y="17.5" width="13.6" height="1.8" rx="0.5" fill="#C2410C" />
        </svg>
    );
}

export function GheLayBadge({ className = '' }: { className?: string }) {
    return (
        <span 
            className={`px-1.5 py-0.2 rounded font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shrink-0 inline-flex items-center gap-1 shadow-xs select-none ${className}`}
            title="Khách ghé lấy (0đ phí ship)"
        >
            <span>🛵</span>
            <span>Ghé lấy</span>
        </span>
    );
}

interface CustomerAvatarProps {
    user: any;
    platform?: Platform;
    avatarUrl?: string | null;
    tag?: string;
    isNinhThuan?: boolean;
    isGheLay?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showPlatformBadge?: boolean;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}

const AVATAR_PALETTES = [
    { bg: 'bg-emerald-600', text: 'text-white' },
    { bg: 'bg-blue-600', text: 'text-white' },
    { bg: 'bg-purple-600', text: 'text-white' },
    { bg: 'bg-amber-600', text: 'text-white' },
    { bg: 'bg-rose-600', text: 'text-white' },
    { bg: 'bg-cyan-600', text: 'text-white' },
    { bg: 'bg-indigo-600', text: 'text-white' },
    { bg: 'bg-teal-600', text: 'text-white' },
];

export function getAvatarColor(user: any) {
    const cleanUser = normalizeUser(user);
    let hash = 0;
    for (let i = 0; i < cleanUser.length; i++) {
        hash = (hash << 5) - hash + cleanUser.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % AVATAR_PALETTES.length;
    return AVATAR_PALETTES[index];
}

export function getInitials(user: any) {
    const clean = normalizeUser(user).replace(/^[#@\s_]+/, '').trim();
    if (!clean) return '👤';
    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

export function getTagBorderClass(tag?: string) {
    switch (tag) {
        case 'HOST':
            return 'border-2 border-yellow-400 ring-2 ring-yellow-400/40';
        case 'VIP':
            return 'border-2 border-amber-400 ring-2 ring-amber-400/30';
        case 'COC':
            return 'border-2 border-cyan-400 ring-2 ring-cyan-400/30';
        case 'COC_100':
            return 'border-2 border-blue-400 ring-2 ring-blue-500/40';
        case 'DAO':
            return 'border-2 border-gray-400 ring-1 ring-gray-400/30';
        case 'BOM':
            return 'border-2 border-red-500 ring-2 ring-red-500/30';
        case 'CHAN':
            return 'border-2 border-red-700 ring-2 ring-red-800/40';
        case 'GIU':
            return 'border-2 border-amber-400 ring-2 ring-amber-500/40';
        case 'GHE_LAY':
            return 'border-2 border-emerald-400 ring-2 ring-emerald-500/40';
        default:
            return 'border-2 border-white/20';
    }
}

export const CustomerAvatar: React.FC<CustomerAvatarProps> = memo(({
    user,
    platform,
    avatarUrl,
    tag = 'NORMAL',
    isNinhThuan,
    isGheLay,
    size = 'md',
    showPlatformBadge = true,
    className = '',
    onClick
}) => {
    const cleanUser = normalizeUser(user);
    const userKey = cleanUser ? `${platform || 'all'}:${cleanUser}` : '';

    // Nhận diện khách Ghé Lấy để hiển thị biểu tượng Xe Máy 🛵 trên avatar
    const storeGl = useStore(state => {
        if (!platform || !cleanUser) return false;
        return Boolean(state[platform]?.gheLayTags?.[cleanUser] || state[platform]?.tags?.[cleanUser] === 'GHE_LAY');
    });
    const effectiveIsGl = isGheLay !== undefined ? isGheLay : storeGl;

    // Nhận diện khách Ninh Thuận để hiển thị biểu tượng Tháp Chàm trên avatar (Không chọn đồng thời với Ghé lấy)
    const storeNt = useStore(state => {
        if (!platform || !cleanUser) return false;
        return Boolean(state[platform]?.ninhThuanTags?.[cleanUser]);
    });
    const rawIsNt = isNinhThuan !== undefined ? isNinhThuan : storeNt;
    const effectiveIsNt = rawIsNt && !effectiveIsGl;

    // 1. O(1) Instant Lookup: direct prop or global customer avatar registry (Zero store subscriptions)
    const effectiveAvatarUrl = avatarUrl || getCustomerAvatar(cleanUser, platform);

    // 2. Tra cứu tức thì từ bộ nhớ đệm Memory Cache (0ms - chống chớp giật 100% khi cuộn)
    const initialCached = getAvatarFromMemory(effectiveAvatarUrl, cleanUser);
    const [currentSrc, setCurrentSrc] = useState<string | null>(initialCached || effectiveAvatarUrl || null);
    const [imgError, setImgError] = useState(false);

    // 3. Cập nhật currentSrc tức thì khi props thay đổi
    useEffect(() => {
        setImgError(false);
        const targetUrl = avatarUrl || getCustomerAvatar(cleanUser, platform);
        const mem = getAvatarFromMemory(targetUrl, cleanUser);
        if (mem) {
            setCurrentSrc(mem);
        } else if (targetUrl) {
            setCurrentSrc(targetUrl);
        } else {
            setCurrentSrc(null);
        }
    }, [cleanUser, platform, avatarUrl]);

    const handleImgError = () => {
        // Nếu URL trực tiếp lỗi (do CORS, hết hạn CDN hoặc chặn hotlink), thử qua avatar proxy
        if (currentSrc && !currentSrc.startsWith('data:') && !currentSrc.includes('/api/proxy-avatar')) {
            const proxy = `/api/proxy-avatar?url=${encodeURIComponent(currentSrc)}&name=${encodeURIComponent(cleanUser)}`;
            setCurrentSrc(proxy);
        } else {
            setImgError(true);
        }
    };

    const sizeClasses = {
        sm: 'w-7 h-7 text-[10px]',
        md: 'w-10 h-10 text-xs',
        lg: 'w-12 h-12 text-sm',
        xl: 'w-20 h-20 text-2xl'
    }[size];

    const palette = getAvatarColor(user);
    const initials = getInitials(user);
    const borderClass = getTagBorderClass(tag);
    const isLarge = size === 'lg' || size === 'xl';

    const hasValidImage = !!currentSrc && !imgError;

    return (
        <div 
            onClick={onClick}
            className={`relative shrink-0 select-none pb-1 ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''} ${className}`}
        >
            {/* Main Avatar Circle */}
            <div className={`${sizeClasses} rounded-full overflow-hidden flex items-center justify-center font-black ${borderClass} shadow-md transition-all ${hasValidImage ? 'bg-[#0e1621]' : `${palette.bg} ${palette.text}`}`}>
                {hasValidImage ? (
                    <img 
                        src={currentSrc!} 
                        alt={cleanUser} 
                        onError={handleImgError} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                    />
                ) : (
                    <span>{initials}</span>
                )}
            </div>

            {/* Biểu tượng Tháp Chàm ở góc trên bên trái avatar cho khách Ninh Thuận */}
            {effectiveIsNt && (
                <span 
                    className={`absolute -top-1.5 -left-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-amber-300/80 bg-gradient-to-tr from-orange-700 via-amber-600 to-yellow-500 text-white ${
                        isLarge ? 'w-5 h-5 p-0.5' : 'w-4 h-4 p-[1px]'
                    }`}
                    title="Khách Ninh Thuận (Tháp Chàm)"
                >
                    <ThapChamIcon className={isLarge ? "w-3.5 h-3.5" : "w-2.5 h-2.5"} />
                </span>
            )}

            {/* Biểu tượng Ghé lấy🛵 trên avatar */}
            {effectiveIsGl && (
                <span 
                    className={`absolute ${effectiveIsNt ? '-bottom-1.5 -left-1' : '-top-1.5 -left-1'} z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-emerald-300 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Khách ghé lấy (0đ phí ship)"
                >
                    🛵
                </span>
            )}

            {/* Tag Badge at Top-Right Corner (VIP Crown, Host Crown, Water Drop for Cọc, etc.) */}
            {tag === 'HOST' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-yellow-200 bg-gradient-to-tr from-yellow-500 to-amber-600 text-white ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Chủ phòng (HOST)"
                >
                    👑
                </span>
            )}
            {tag === 'VIP' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-amber-200 bg-gradient-to-tr from-amber-500 to-orange-500 text-white ${
                        isLarge ? 'text-[10px] px-1.5 py-0.5' : 'text-[8px] px-1 py-[0.5px]'
                    }`}
                    title="Khách quen (VIP)"
                >
                    👑 VIP
                </span>
            )}
            {tag === 'COC' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-cyan-200 bg-gradient-to-tr from-cyan-500 to-blue-600 text-white ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Đã cọc 50k"
                >
                    💧
                </span>
            )}
            {tag === 'COC_100' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-blue-200 bg-gradient-to-tr from-blue-600 to-indigo-700 text-white ${
                        isLarge ? 'px-1.5 py-0.5 text-[9px]' : 'px-1 py-[0.5px] text-[7.5px]'
                    }`}
                    title="Đã cọc 100k"
                >
                    💧100k
                </span>
            )}
            {tag === 'DAO' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-gray-400 bg-gray-700 text-white ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Khách dạo"
                >
                    👻
                </span>
            )}
            {tag === 'BOM' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-red-300 bg-red-600 text-white ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Khách BOM"
                >
                    ⚠️
                </span>
            )}
            {tag === 'CHAN' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-red-500 bg-black text-red-400 ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Đã chặn"
                >
                    ⛔
                </span>
            )}
            {tag === 'GIU' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-amber-300 bg-gradient-to-tr from-amber-500 to-orange-600 text-white ${
                        isLarge ? 'px-1.5 py-0.5 text-[9px]' : 'px-1 py-[0.5px] text-[7.5px]'
                    }`}
                    title="Đang giữ hàng"
                >
                    📦
                </span>
            )}
            {tag === 'GHE_LAY' && (
                <span 
                    className={`absolute -top-1.5 -right-1 z-20 font-black rounded-full flex items-center justify-center shadow-lg border border-emerald-300 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white ${
                        isLarge ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'
                    }`}
                    title="Khách ghé lấy (0đ phí ship)"
                >
                    🛵
                </span>
            )}

            {/* Platform Badge positioned BELOW the avatar (Centered) */}
            {showPlatformBadge && platform && PLATFORMS[platform] && (
                <span 
                    className={`absolute -bottom-1 left-1/2 -translate-x-1/2 z-20 text-[8px] px-1 py-[0.5px] rounded-full text-white font-black border border-[#0e1621] leading-none shadow-md whitespace-nowrap ${PLATFORMS[platform].bgClass}`}
                    title={PLATFORMS[platform].label}
                >
                    {PLATFORMS[platform].label}
                </span>
            )}
        </div>
    );
});
