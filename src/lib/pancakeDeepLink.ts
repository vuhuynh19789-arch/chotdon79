/**
 * pancakeDeepLink.ts
 * Tiện ích hỗ trợ liên kết khách chốt đơn với Pancake & Zalo
 * Chuyển đổi và kích hoạt mở thẳng ứng dụng Pancake (vn.pancake.app) hoặc Zalo trên điện thoại
 */
import { markExternalAppOpened } from './backHandler';

export interface ParsedPancakeContact {
    type: 'pancake_url' | 'phone_zalo' | 'custom_url' | 'empty';
    raw: string;
    webUrl: string;
    mobileIntentUrl: string;
    iosSchemeUrl: string;
    zaloAppUrl?: string;
    phone?: string;
    conversationId?: string;
    pageId?: string;
    label: string;
}

/**
 * Kiểm tra xem thiết bị hiện tại có phải điện thoại (Android / iOS) hay không
 */
export function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function isAndroidDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android/i.test(navigator.userAgent || '');
}

export function isIOSDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

/**
 * Tự động bóc tách (unwrap) các liên kết chuyển hướng trung gian
 * (như continue, redirect, Facebook l.php?u=, TikTok link?target=, Pancake redirect, v.v.)
 * để lấy trực tiếp URL đích cuối cùng, giảm độ trễ và tránh màn hình chờ trung gian.
 */
export function unwrapRedirectUrl(urlStr: string): string {
    if (!urlStr) return '';
    let current = urlStr.trim();
    
    // Lặp tối đa 5 lần để xử lý các redirect lồng nhau nếu có
    for (let i = 0; i < 5; i++) {
        try {
            // Giải mã URI nếu chuỗi bị encode (%3A%2F%2F)
            if (current.includes('%3A%2F%2F') || current.includes('%3a%2f%2f') || current.includes('%2F%2F')) {
                const decoded = decodeURIComponent(current);
                if (/^https?:\/\//i.test(decoded)) {
                    current = decoded;
                }
            }

            let urlObj: URL;
            if (/^https?:\/\//i.test(current)) {
                urlObj = new URL(current);
            } else if (current.includes('pages.fm') || current.includes('pancake.vn') || current.includes('pos.pages.fm')) {
                urlObj = new URL('https://' + current.replace(/^\/+/, ''));
            } else {
                break;
            }

            // Danh sách các tham số truy vấn chuyển hướng phổ biến
            const redirectParams = [
                'target', 'u', 'url', 'continue', 'dest', 'destination', 
                'redirect', 'redirect_uri', 'redirect_url', 'next', 'to', 'link', 'r'
            ];
            let foundTarget: string | null = null;

            for (const param of redirectParams) {
                const val = urlObj.searchParams.get(param);
                if (val) {
                    let decodedVal = val;
                    try { decodedVal = decodeURIComponent(val); } catch {}
                    if (/^https?:\/\//i.test(decodedVal) || decodedVal.includes('pages.fm') || decodedVal.includes('pancake.vn') || decodedVal.includes('zalo.me')) {
                        foundTarget = decodedVal;
                        break;
                    }
                }
            }

            // Quét tất cả query params nếu có chứa domain Pancake / Zalo
            if (!foundTarget) {
                for (const [_, val] of urlObj.searchParams.entries()) {
                    let decodedVal = val;
                    try { decodedVal = decodeURIComponent(val); } catch {}
                    if (decodedVal.includes('pages.fm') || decodedVal.includes('pancake.vn') || decodedVal.includes('pos.pages.fm')) {
                        if (!/^https?:\/\//i.test(decodedVal)) {
                            decodedVal = 'https://' + decodedVal.replace(/^https?:\/\//i, '');
                        }
                        foundTarget = decodedVal;
                        break;
                    }
                }
            }

            // Quét trong pathname dạng /continue/https://... hoặc /redirect/https://...
            if (!foundTarget) {
                const matchInPath = urlObj.pathname.match(/\/(?:continue|redirect|link|goto|out)\/(https?[:\/%].+)/i);
                if (matchInPath && matchInPath[1]) {
                    try {
                        foundTarget = decodeURIComponent(matchInPath[1]);
                    } catch {
                        foundTarget = matchInPath[1];
                    }
                }
            }

            if (foundTarget && foundTarget !== current) {
                current = foundTarget.trim();
            } else {
                break;
            }
        } catch {
            break;
        }
    }

    return current;
}

/**
 * Chuẩn hóa và nhận diện link Pancake hoặc Số điện thoại Zalo
 */
export function parsePancakeContact(input: string): ParsedPancakeContact {
    const rawInput = (input || '').trim();
    if (!rawInput) {
        return {
            type: 'empty',
            raw: '',
            webUrl: '',
            mobileIntentUrl: '',
            iosSchemeUrl: '',
            label: 'Chưa liên kết'
        };
    }

    // Tự động gỡ bỏ các wrapper trung gian redirect / continue
    const unwrapUrl = unwrapRedirectUrl(rawInput);
    const raw = unwrapUrl || rawInput;

    // 1. Kiểm tra nếu là Số điện thoại Việt Nam (Zalo)
    const cleanDigits = raw.replace(/\D/g, '');
    const isPhone = /^(0|\+?84)(3|5|7|8|9)\d{8}$/.test(raw.replace(/[\s\.\-]/g, '')) || 
                    (cleanDigits.length >= 10 && cleanDigits.length <= 11 && (cleanDigits.startsWith('0') || cleanDigits.startsWith('84')));

    if (isPhone) {
        let stdPhone = cleanDigits;
        if (stdPhone.startsWith('84')) {
            stdPhone = '0' + stdPhone.substring(2);
        }
        const webUrl = `https://zalo.me/${stdPhone}`;
        const zaloAppUrl = `zalo://chat?phone=${stdPhone}`;
        return {
            type: 'phone_zalo',
            raw,
            webUrl,
            mobileIntentUrl: zaloAppUrl,
            iosSchemeUrl: zaloAppUrl,
            zaloAppUrl,
            phone: stdPhone,
            label: `Zalo: ${stdPhone}`
        };
    }

    // 1b. Kiểm tra nếu là raw Conversation ID Zalo hoặc Facebook
    if (/^pzl_[ug]_[0-9]+_[0-9]+/.test(raw)) {
        const pzMatch = raw.match(/pzl_[ug]_([0-9]+)_/);
        const pId = pzMatch && pzMatch[1] ? `pzl_${pzMatch[1]}` : 'pzl_2007152536191688636';
        const webUrl = `https://pages.fm/${pId}/inbox?c_id=${raw}`;
        const iosSchemeUrl = `pancake://pages/${pId}/conversations/${raw}`;
        const mobileIntentUrl = `intent://pages.fm/${pId}/inbox?c_id=${raw}#Intent;scheme=https;package=vn.pancake.app;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
        return {
            type: 'pancake_url',
            raw,
            webUrl,
            mobileIntentUrl,
            iosSchemeUrl,
            pageId: pId,
            conversationId: raw,
            label: `Zalo Chat #${raw.slice(-4)}`
        };
    }

    const rawFbMatch = raw.match(/^(?:fb_)?([0-9]{10,})_([0-9]{10,})$/);
    if (rawFbMatch) {
        const pId = rawFbMatch[1];
        const cId = `${rawFbMatch[1]}_${rawFbMatch[2]}`;
        const webUrl = `https://pages.fm/${pId}/inbox?c_id=${cId}`;
        const iosSchemeUrl = `pancake://pages/${pId}/conversations/${cId}`;
        const mobileIntentUrl = `intent://pages.fm/${pId}/inbox?c_id=${cId}#Intent;scheme=https;package=vn.pancake.app;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
        return {
            type: 'pancake_url',
            raw,
            webUrl,
            mobileIntentUrl,
            iosSchemeUrl,
            pageId: pId,
            conversationId: cId,
            label: `FB Chat #${cId.slice(-4)}`
        };
    }

    // 2. Kiểm tra nếu là link Pancake (pages.fm / pancake.vn / pos.pages.fm)
    let webUrl = raw;
    if (!/^https?:\/\//i.test(webUrl)) {
        webUrl = 'https://' + webUrl;
    }

    let urlObj: URL | null = null;
    try {
        urlObj = new URL(webUrl);
    } catch {
        // Không thể parse URL, giữ nguyên
    }

    const host = urlObj ? urlObj.host.toLowerCase() : '';
    const pathname = urlObj ? urlObj.pathname : '';

    // Trích xuất Page ID & Conversation ID nếu có
    // Dạng 1: https://pancake.vn/<page_id>?c_id=<conversation_id>
    // Dạng 2: /<page_id>/conversations/<conversation_id>
    // Dạng 3: /conversations/<page_id>/<conversation_id>
    let pageId: string | undefined;
    let conversationId: string | undefined;

    if (urlObj) {
        const cIdQuery = urlObj.searchParams.get('c_id') || urlObj.searchParams.get('conversation_id');
        if (cIdQuery) {
            conversationId = cIdQuery;
            const segments = pathname.replace(/^\/+/, '').split('/');
            if (segments[0] && segments[0] !== 'pages' && segments[0] !== 'conversations') {
                pageId = segments[0];
            }
        }
        
        if (!pageId || !conversationId) {
            const convMatch = pathname.match(/\/?([^\/]+)\/conversations\/([^\/\?]+)/) ||
                              pathname.match(/\/conversations\/([^\/]+)\/([^\/\?]+)/);
            if (convMatch) {
                pageId = convMatch[1];
                conversationId = convMatch[2];
            }
        }
    }

    // Nếu có cả pageId và conversationId, chuẩn hóa sang link Pancake chính thức
    if (pageId && conversationId && (host.includes('pancake.vn') || host.includes('pages.fm'))) {
        webUrl = `https://pancake.vn/${pageId}?c_id=${conversationId}`;
    }

    // Chuẩn hóa Android Intent URL cho Pancake app: package = vn.pancake.app
    // Cú pháp Intent chuẩn: intent://<host_and_path>#Intent;scheme=https;package=vn.pancake.app;S.browser_fallback_url=<fallback>;end
    const hostAndPath = webUrl.replace(/^https?:\/\//i, '');
    const mobileIntentUrl = `intent://${hostAndPath}#Intent;scheme=https;package=vn.pancake.app;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
    
    // Custom schemes cho iOS / Pancake
    const iosSchemeUrl = `pancake://${hostAndPath}`;

    const isPancake = host.includes('pages.fm') || host.includes('pancake.vn') || host.includes('pos.pages.fm');

    return {
        type: isPancake ? 'pancake_url' : 'custom_url',
        raw,
        webUrl,
        mobileIntentUrl,
        iosSchemeUrl,
        conversationId,
        pageId,
        label: isPancake ? (conversationId ? `Pancake #${conversationId.slice(-4)}` : 'Hội thoại Pancake') : 'Liên kết ngoài'
    };
}

/**
 * Kích hoạt mở hội thoại trên thiết bị:
 * - Trên điện thoại Android: Sử dụng Intent gọi thẳng app Pancake (vn.pancake.app) hoặc Zalo
 * - Trên iPhone: Sử dụng Universal link hoặc App Scheme, có fallback Web
 * - Trên Máy tính (PC): Mở tab web Pancake / Zalo bình thường
 */
export function openPancakeApp(input: string, openFallbackPrompt = false): void {
    const contact = parsePancakeContact(input);
    if (!contact.raw) return;

    // Đánh dấu để chặn nút Back Android vô tình đóng modal khi quay về Chotdon
    markExternalAppOpened();

    // 1. Nếu là số điện thoại Zalo
    if (contact.type === 'phone_zalo') {
        if (isMobileDevice()) {
            const link = document.createElement('a');
            link.href = contact.zaloAppUrl!;
            link.target = '_blank';
            link.setAttribute('rel', 'noopener noreferrer');
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                if (document.body.contains(link)) document.body.removeChild(link);
            }, 300);
        } else {
            window.open(contact.webUrl, '_blank');
        }
        return;
    }

    // 2. Nếu là máy tính (PC / Desktop): Mở web Pancake / pages.fm ngay trong tab mới
    if (!isMobileDevice()) {
        window.open(contact.webUrl, '_blank');
        return;
    }

    // 3. Nếu là điện thoại Android: Dùng Android Intent để gọi thẳng App Pancake (vn.pancake.app)
    if (isAndroidDevice()) {
        const intentUrl = contact.mobileIntentUrl;
        
        // Tạo thẻ a ẩn có target="_blank" để giữ nguyên phiên làm việc và không chiếm quyền trang hiện tại
        const link = document.createElement('a');
        link.href = intentUrl;
        link.target = '_blank';
        link.setAttribute('rel', 'noopener noreferrer');
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
        }, 300);
        return;
    }

    // 4. Nếu là iPhone / iPad (iOS)
    if (isIOSDevice()) {
        const link = document.createElement('a');
        link.href = contact.iosSchemeUrl;
        link.target = '_blank';
        link.setAttribute('rel', 'noopener noreferrer');
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
        }, 300);
        return;
    }

    // Thiết bị khác
    window.open(contact.webUrl, '_blank');
}

/**
 * Trích xuất số điện thoại Việt Nam từ văn bản bình luận
 * Hỗ trợ các định dạng: 09xx, 03xx, 07xx, 08xx, 05xx, +84, 84
 * Hỗ trợ có dấu cách, dấu chấm, dấu gạch nối (ví dụ: 0987.654.321, 098 765 4321)
 * Hỗ trợ lách kiểm duyệt (dùng chữ o/O thay cho số 0 ở đầu)
 */
export function extractPhoneFromText(text: string): string | null {
    if (!text || typeof text !== 'string') return null;
    
    // 1. Chuẩn hoá chữ cái o/O thay cho số 0 (người xem live thường gõ o98..., O9...)
    const normalized = text.replace(/([oO])(?=[35789]\d{7,9})/g, '0');

    // 2. Tìm SĐT có tiền tố chuẩn Việt Nam: 0 hoặc (+84 / 84 / 0084), theo sau là đầu số 3, 5, 7, 8, 9 và 8 chữ số
    // Cho phép khoảng trắng, dấu chấm, gạch ngang xen giữa
    const standardMatch = normalized.match(/(?:(?:\+|00)?84|0)[\s\.\-]*(?:[35789])(?:[\s\.\-]*\d){8}(?!\d)/);
    if (standardMatch && standardMatch[0]) {
        let clean = standardMatch[0].replace(/[\s\.\-\+]/g, '');
        if (clean.startsWith('0084')) clean = '0' + clean.slice(4);
        else if (clean.startsWith('84')) clean = '0' + clean.slice(2);
        if (clean.length === 10 && clean.startsWith('0')) {
            return clean;
        }
    }

    // 3. Tìm chuỗi 10 số liền nhau bắt đầu bằng 0
    const tenDigitsMatch = normalized.match(/\b0[35789]\d{8}\b/);
    if (tenDigitsMatch) {
        return tenDigitsMatch[0];
    }

    // 4. Fallback tìm dãy số cách nhau bởi dấu cách/chấm nếu gom lại đúng 10 số đầu 0
    const numberTokens = normalized.match(/[0-9\s\.\-]{10,20}/g);
    if (numberTokens) {
        for (const token of numberTokens) {
            let digits = token.replace(/[\s\.\-]/g, '');
            if (digits.startsWith('84') && digits.length === 11) digits = '0' + digits.slice(2);
            if (digits.length === 10 && /^0[35789]\d{8}$/.test(digits)) {
                return digits;
            }
        }
    }

    return null;
}
