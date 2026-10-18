import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, set, get as rtdbGet } from "firebase/database";
import { getPrinterConfig, canvasToEscPos, uint8ArrayToBase64, dispatchLanPrint } from "./escposPrinter";
export const FIREBASE_URL = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app";
export const firebaseApp = initializeApp({
    databaseURL: FIREBASE_URL
});
export const firebaseDb = getDatabase(firebaseApp);
export const SHOP_NAME = "Hiền Phạm | 0965.286.096";
export const APP_VERSION = "v2.6.0";

export type Platform = 'tiktok' | 'facebook' | 'shopee';

export const PLATFORMS: Record<Platform, { room: string; label: string; colorClass: string; bgClass: string; borderClass: string }> = {
    tiktok:   { room: "hienpham_live",        label: "🎵 TikTok",   colorClass: "text-[#00f2ea]", bgClass: "bg-[#111]", borderClass: "border-[#111]" },
    facebook: { room: "hienpham_live_fb",     label: "📘 Facebook", colorClass: "text-white", bgClass: "bg-[#1877f2]", borderClass: "border-[#1877f2]" },
    shopee:   { room: "hienpham_live_shopee", label: "🛒 Shopee",   colorClass: "text-white", bgClass: "bg-[#ee4d2d]", borderClass: "border-[#ee4d2d]" }
};

export const DEVICE_ID = (() => {
    let id = localStorage.getItem('slp_webapp_device_id');
    if (!id) {
        id = 'web_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('slp_webapp_device_id', id);
    }
    return id;
})();

export async function fbGet(path: string) {
    try {
        const res = await fetch(`${FIREBASE_URL}/${path}.json`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn("fbGet fetch network warning, falling back to RTDB SDK get:", e);
    }
    try {
        const snapshot = await rtdbGet(ref(firebaseDb, path));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (err) {
        console.warn("fbGet SDK get warning:", err);
        return null;
    }
}

export async function fbPut(path: string, body: any) {
    let succeeded = false;
    let result: any = null;
    try {
        const res = await fetch(`${FIREBASE_URL}/${path}.json`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        if (res.ok) {
            result = await res.json();
            succeeded = true;
        }
    } catch (e) {
        console.warn("fbPut fetch network warning, falling back to Firebase RTDB SDK set:", e);
    }
    if (!succeeded) {
        try {
            await set(ref(firebaseDb, path), body);
            result = body;
            succeeded = true;
        } catch (err) {
            console.warn("fbPut SDK set warning:", err);
        }
    }
    return result;
}

export function parsePriceAndQuantity(priceInput: number | string): { unitPrice: number; quantity: number; totalPrice: number } {
    if (typeof priceInput === 'number') {
        const p = Math.max(0, Math.round(priceInput));
        return { unitPrice: p, quantity: 1, totalPrice: p };
    }
    const str = String(priceInput || '').trim();
    if (!str) return { unitPrice: 0, quantity: 1, totalPrice: 0 };

    // Hỗ trợ định dạng nhân SL: "99*2", "2*99", "99x2", "2 x 99", "99×2"
    const mulMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:k|ka|ca|cành)?\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*(?:k|ka|ca|cành)?$/i);
    if (mulMatch) {
        let n1 = parseFloat(mulMatch[1]);
        let n2 = parseFloat(mulMatch[2]);
        let unitPrice = n1;
        let qty = n2;
        if (n1 < 10 && n2 >= 10 && Number.isInteger(n1)) {
            unitPrice = n2;
            qty = n1;
        }
        const roundedPrice = Math.round(unitPrice);
        const roundedQty = Math.max(1, Math.round(qty));
        return {
            unitPrice: roundedPrice,
            quantity: roundedQty,
            totalPrice: roundedPrice * roundedQty
        };
    }

    const num = parseFloat(str.replace(/k|ka|ca|cành/gi, '').trim()) || 0;
    const rounded = Math.round(num);
    return { unitPrice: rounded, quantity: 1, totalPrice: rounded };
}

export function extractPriceFromContent(text: string) {
    if (!text || typeof text !== 'string') return { price: "", content: "" };

    // 1. Ưu tiên bóc tách công thức nhân: "99*2", "áo 99*2", "2*99", "99x2", "99 x 2"
    const mulRegex = /(?:^|\s)(\d+)\s*(?:k|ka|ca|cành)?\s*[*xX×]\s*(\d+)\s*(?:k|ka|ca|cành)?(?:\s|$)/i;
    const mulMatch = text.match(mulRegex);
    if (mulMatch) {
        let n1 = parseInt(mulMatch[1], 10);
        let n2 = parseInt(mulMatch[2], 10);
        if (n1 > 0 && n2 > 0) {
            let unitPrice = n1;
            let qty = n2;
            if (n1 < 10 && n2 >= 10) {
                unitPrice = n2;
                qty = n1;
            }
            if (unitPrice >= 10) {
                const fullFormula = `${unitPrice}*${qty}`;
                const matchedRaw = mulMatch[0].trim();
                const lastIdx = text.lastIndexOf(matchedRaw);
                const content = (text.substring(0, lastIdx) + " " + text.substring(lastIdx + matchedRaw.length)).replace(/\s+/g, ' ').trim();
                return { price: fullFormula, content: content || text };
            }
        }
    }

    let pureNumMatch = text.match(/^(\d+)\s*(k|ka|ca|cành)?$/i);
    if (pureNumMatch) {
        if (parseInt(pureNumMatch[1], 10) >= 10) return { price: pureNumMatch[1], content: text };
    }
    
    let endRegex = /\s+(\d+)\s*(k|ka|ca|cành)?$/i;
    let match = text.match(endRegex);
    if (match) {
        if (parseInt(match[1], 10) >= 10) {
            let price = match[1];
            let content = text.replace(endRegex, '').trim();
            return { price, content };
        }
    }
    
    let numbers = text.match(/\d+/g);
    if (numbers) {
        for (let i = numbers.length - 1; i >= 0; i--) {
            if (parseInt(numbers[i], 10) >= 10) {
                let price = numbers[i];
                let lastIdx = text.lastIndexOf(price);
                let content = text.substring(0, lastIdx).trim() + " " + text.substring(lastIdx + price.length).replace(/k|ka|ca|cành/i, '').trim();
                content = content.replace(/\s+/g, ' ').trim();
                return { price, content };
            }
        }
    }
    
    return { price: "", content: text };
}

export function removeVietnameseAccents(str: string): string {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
}

export function getRecentSearchPrices(): string[] {
    try {
        const raw = localStorage.getItem('slp_recent_search_prices');
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr.filter(p => typeof p === 'string' && p.trim()).slice(0, 3);
        }
    } catch {}
    return [];
}

export function addRecentSearchPrice(priceStr: string) {
    if (!priceStr || !priceStr.trim()) return;
    const clean = priceStr.trim().replace(/k|ka|ca|cành/gi, '').trim();
    if (!clean || isNaN(Number(clean))) return;
    try {
        const current = getRecentSearchPrices();
        const next = [clean, ...current.filter(p => p !== clean)].slice(0, 3);
        localStorage.setItem('slp_recent_search_prices', JSON.stringify(next));
    } catch {}
}

export function getRecentClosedPrices(): string[] {
    try {
        const raw = localStorage.getItem('slp_recent_closed_prices');
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr.filter(p => typeof p === 'string' && p.trim()).slice(0, 5);
        }
    } catch {}
    return [];
}

export function getLastClosedPrice(): string {
    try {
        const last = localStorage.getItem('slp_last_closed_price');
        if (last && last.trim()) return last.trim();
        const list = getRecentClosedPrices();
        if (list.length > 0) return list[0];
    } catch {}
    return '';
}

export function addRecentClosedPrice(priceStr: string | number) {
    if (priceStr === undefined || priceStr === null) return;
    const clean = String(priceStr).trim().replace(/k|ka|ca|cành/gi, '').trim();
    if (!clean) return;
    try {
        localStorage.setItem('slp_last_closed_price', clean);
        const current = getRecentClosedPrices();
        const next = [clean, ...current.filter(p => p !== clean)].slice(0, 5);
        localStorage.setItem('slp_recent_closed_prices', JSON.stringify(next));
    } catch {}
}

export function getClosedPriceForComment(
    customers: Record<string, any> | undefined, 
    userName: string, 
    commentId: string | null
): string | null {
    if (!customers || !userName || !commentId) return null;
    const clean = normalizeUser(userName);
    const matchingKey = Object.keys(customers).find(k => 
        k === clean || 
        normalizeUser(k) === clean || 
        k.toLowerCase() === clean.toLowerCase() || 
        normalizeUser(k).toLowerCase() === clean.toLowerCase()
    );
    const cust = matchingKey ? customers[matchingKey] : customers[clean];
    if (!cust) return null;

    if (Array.isArray(cust.items)) {
        const currentMatches = cust.items.filter((it: any) => it && it.sourceCommentId === commentId);
        if (currentMatches.length > 0) {
            return currentMatches.map((it: any) => (it.price && it.price > 0) ? `${it.price}k` : 'Ko giá').join(' + ');
        }
    }

    if (Array.isArray(cust.pastItems)) {
        const pastMatches = cust.pastItems.filter((it: any) => it && it.sourceCommentId === commentId);
        if (pastMatches.length > 0) {
            return pastMatches.map((it: any) => (it.price && it.price > 0) ? `${it.price}k` : 'Ko giá').join(' + ');
        }
    }

    return null;
}

function fitPriceFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number) {
    let size = maxSize;
    ctx.font = `900 ${size}px Arial`;
    while (ctx.measureText(text).width > maxWidth && size > 26) {
        size -= 2;
        ctx.font = `900 ${size}px Arial`;
    }
    return size;
}

function wrapText(ctx: CanvasRenderingContext2D, t: string, mw: number) {
    let w = t.split(' '), ll = [], l = w[0];
    for (let i = 1; i < w.length; i++) {
        if (ctx.measureText(l + " " + w[i]).width < mw) l += " " + w[i];
        else { ll.push(l); l = w[i]; }
    }
    ll.push(l);
    return ll;
}

let lastPrintSignature = "";
let lastPrintTime = 0;

export function executePrint(canvas: HTMLCanvasElement, platformLabel: string) {
    try {
        const cfg = getPrinterConfig();
        const b64 = canvas.toDataURL("image/jpeg", 0.6).split(',')[1];
        pushPrintJobToFirebase(platformLabel, b64);

        if (cfg.printerMode === 'lan') {
            const escposBytes = canvasToEscPos(canvas, cfg.autoCut);
            const escposBase64 = uint8ArrayToBase64(escposBytes);
            dispatchLanPrint(escposBase64, cfg);
        } else if (cfg.printerMode === 'browser') {
            const dataUri = `data:image/jpeg;base64,${b64}`;
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc) {
                doc.write(`<html><head><style>@page{margin:0;}body{margin:0;padding:0;}img{width:100%;max-width:576px;}</style></head><body><img src="${dataUri}" onload="window.print();" /></body></html>`);
                doc.close();
                setTimeout(() => { document.body.removeChild(iframe); }, 3000);
            }
        } else {
            // Default RawBT
            const dataUri = `data:image/jpeg;base64,${b64}`;
            const url = `rawbt:${dataUri}#${Date.now()}`;
            try {
                const a = document.createElement('a');
                a.href = url;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch {
                window.location.href = url;
            }
        }
    } catch (e) {
        console.error("Execute print failed", e);
    }
}

export function extractCleanUsername(rawUser: string): string {
    if (!rawUser) return '';
    let u = String(rawUser).trim();
    u = u.replace(/^#\d+\s+/, '');
    u = u.replace(/^\([^)]*\)\s*/, '');
    u = u.replace(/^\[[^\]]*\]\s*/, '');
    u = u.replace(/\s*\([^)]*\)$/, '');
    u = u.replace(/\s*\[[^\]]*\]$/, '');
    return u.trim();
}

export function checkCustomerIsGheLay(rawUser: string): boolean {
    if (!rawUser) return false;
    if (typeof rawUser !== 'string') return false;
    if (rawUser.includes('GHÉ LẤY') || rawUser.includes('Ghé lấy') || rawUser.includes('🛵')) return true;

    try {
        const full = rawUser.trim();
        const clean = extractCleanUsername(rawUser);
        const platforms: Platform[] = ['tiktok', 'facebook', 'shopee'];
        for (const p of platforms) {
            const glRaw = localStorage.getItem(`slp_webapp_ghelay_${p}`);
            if (glRaw) {
                const gl = JSON.parse(glRaw);
                if (gl[full] || gl[clean]) return true;
                for (const k in gl) {
                    if (k.toLowerCase() === clean.toLowerCase() || k.toLowerCase() === full.toLowerCase()) {
                        if (gl[k]) return true;
                    }
                }
            }
            const tagsRaw = localStorage.getItem(`slp_webapp_tags_${p}`);
            if (tagsRaw) {
                const tags = JSON.parse(tagsRaw);
                if (tags[full] === 'GHE_LAY' || tags[clean] === 'GHE_LAY') return true;
                for (const k in tags) {
                    if (k.toLowerCase() === clean.toLowerCase() || k.toLowerCase() === full.toLowerCase()) {
                        if (tags[k] === 'GHE_LAY') return true;
                    }
                }
            }
        }
    } catch (e) {
        console.error("checkCustomerIsGheLay error", e);
    }
    return false;
}

export function drawBlackBadge(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    w: number, 
    h: number, 
    text: string
) {
    ctx.save();
    // Khung chữ nhật nền đen bo góc nhẹ
    ctx.fillStyle = "#000";
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    // Chữ trắng đậm nét nổi bật trên nền đen
    ctx.fillStyle = "#fff";
    ctx.font = "900 32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
}

export function cleanUserForPrint(rawUser: string): string {
    let u = (rawUser || '').trim();
    if (!u) return 'Khách';
    return u.replace(/\s*\(ghé lấy\)/gi, '').replace(/\s*-\s*ghé lấy/gi, '').trim() || 'Khách';
}

export function formatUserForPrint(rawUser: string, isGheLay?: boolean): string {
    return cleanUserForPrint(rawUser);
}

export function printLabel(
    user: string, 
    content: string, 
    priceValue: string | number, 
    time: string, 
    platformLabel: string, 
    bypassDebounce?: boolean,
    isGheLayParam?: boolean
) {
    const isGheLay = isGheLayParam !== undefined ? Boolean(isGheLayParam) : checkCustomerIsGheLay(user);
    const baseUser = cleanUserForPrint(user);
    let sig = `${baseUser}|${content}|${priceValue}|${isGheLay}`;
    let now = Date.now();
    if (!bypassDebounce && sig === lastPrintSignature && (now - lastPrintTime) < 3000) return;
    lastPrintSignature = sig; lastPrintTime = now;

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = 780; canvas.width = w;
        const priceColWidth = 300; const rightColX = w - priceColWidth - 15; const leftColWidth = rightColX - 20;

        ctx.font = "bold 35px Arial";
        const lines = (!content || content.trim() === "") ? [] : wrapText(ctx, content, leftColWidth);

        let pNum = parseInt(priceValue as string) || 0;
        let hasPrice = pNum > 0;

        ctx.font = "900 55px Arial";
        const userLines = wrapText(ctx, baseUser, leftColWidth);

        // Kích thước badge GHÉ LẤY nền đen chữ trắng
        const badgeText = "GHÉ LẤY";
        ctx.font = "900 32px Arial";
        const badgeTextWidth = ctx.measureText(badgeText).width;
        const badgePaddingX = 14;
        const badgeWidth = badgeTextWidth + (badgePaddingX * 2);
        const badgeHeight = 44;

        ctx.font = "900 55px Arial";
        const lastUserLineWidth = userLines.length > 0 ? ctx.measureText(userLines[userLines.length - 1]).width : 0;
        const badgeFitsOnSameLine = isGheLay && (lastUserLineWidth + 14 + badgeWidth <= leftColWidth);
        const badgeNeedsOwnLine = isGheLay && !badgeFitsOnSameLine;

        let headerHeight = 110;
        let userHeight = (userLines.length * 60) + (badgeNeedsOwnLine ? 50 : 0);
        let leftHeight = userHeight + 10 + (lines.length * 45);
        let rightHeight = hasPrice ? 130 : 0;
        canvas.height = headerHeight + Math.max(leftHeight, rightHeight) + 10;

        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = "#000";

        let y = 45; ctx.textAlign = "center";
        if (SHOP_NAME) {
            ctx.font = "bold 45px Arial";
            ctx.fillText(SHOP_NAME.toUpperCase(), w / 2, y);
            y += 40;
        }

        ctx.font = "25px Arial"; ctx.textAlign = "left"; ctx.fillText("(" + time + ")", 10, y);
        ctx.textAlign = "center"; ctx.fillText("Ngày: " + new Date().toLocaleDateString('vi-VN'), w / 2, y);
        ctx.textAlign = "right"; ctx.font = "bold italic 25px Arial"; ctx.fillText("WebApp - " + (platformLabel || ""), w - 10, y);

        y += 20; ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke(); y += 25;

        let startContentY = y;
        let textY = startContentY - 10;
        userLines.forEach((l, lIdx) => { 
            textY += 60; 
            ctx.fillStyle = "#000";
            ctx.font = "900 55px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(l, 10, textY, leftColWidth);

            // Nếu vừa trên cùng dòng với tên khách
            if (lIdx === userLines.length - 1 && badgeFitsOnSameLine) {
                const badgeX = 10 + lastUserLineWidth + 14;
                const badgeY = textY - 43;
                drawBlackBadge(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeText);
            }
        });

        // Nếu tên khách dài không vừa cùng dòng thì vẽ ngay dòng bên dưới tên khách
        if (badgeNeedsOwnLine) {
            textY += 50;
            const badgeX = 10;
            const badgeY = textY - 43;
            drawBlackBadge(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeText);
        }
        
        textY += 10;
        ctx.fillStyle = "#000";
        ctx.font = "bold 35px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        if (lines.length > 0) lines.forEach(l => { textY += 45; ctx.fillText(l, 10, textY, leftColWidth); });

        if (hasPrice) {
            let priceText = pNum + ".000đ";
            fitPriceFont(ctx, priceText, priceColWidth - 10, 110);
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(priceText, rightColX + priceColWidth / 2, startContentY + 75);
        }

        executePrint(canvas, platformLabel);
    } catch (e) {
        console.error("Print failed", e);
    }
}


export function printMultipleLabels(labels: {user: string, content: string, priceValue: string | number, time: string, platformLabel: string, isGheLay?: boolean}[]) {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = 780;
        canvas.width = w;
        const priceColWidth = 300; const rightColX = w - priceColWidth - 15; const leftColWidth = rightColX - 20;

        const badgeText = "GHÉ LẤY";
        ctx.font = "900 32px Arial";
        const badgeTextWidth = ctx.measureText(badgeText).width;
        const badgePaddingX = 14;
        const badgeWidth = badgeTextWidth + (badgePaddingX * 2);
        const badgeHeight = 44;

        let totalHeight = 0;
        const heights = labels.map(label => {
            const isGheLay = label.isGheLay !== undefined ? Boolean(label.isGheLay) : checkCustomerIsGheLay(label.user);
            const baseUser = cleanUserForPrint(label.user);
            ctx.font = "bold 35px Arial";
            const lines = (!label.content || label.content.trim() === "") ? [] : wrapText(ctx, label.content, leftColWidth);
            let pNum = parseInt(label.priceValue as string) || 0;
            let hasPrice = pNum > 0;
            ctx.font = "900 55px Arial";
            const userLines = wrapText(ctx, baseUser, leftColWidth);

            const lastUserLineWidth = userLines.length > 0 ? ctx.measureText(userLines[userLines.length - 1]).width : 0;
            const badgeFitsOnSameLine = isGheLay && (lastUserLineWidth + 14 + badgeWidth <= leftColWidth);
            const badgeNeedsOwnLine = isGheLay && !badgeFitsOnSameLine;

            let headerHeight = 110;
            let userHeight = (userLines.length * 60) + (badgeNeedsOwnLine ? 50 : 0);
            let leftHeight = userHeight + 10 + (lines.length * 45);
            let rightHeight = hasPrice ? 130 : 0;
            let h = headerHeight + Math.max(leftHeight, rightHeight) + 10;
            totalHeight += h;
            return { h, lines, userLines, hasPrice, pNum, isGheLay, badgeFitsOnSameLine, badgeNeedsOwnLine, lastUserLineWidth };
        });

        canvas.height = totalHeight;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = "#000";

        let currentY = 0;

        labels.forEach((label, idx) => {
            const { h, lines, userLines, hasPrice, pNum, isGheLay, badgeFitsOnSameLine, badgeNeedsOwnLine, lastUserLineWidth } = heights[idx];
            let y = currentY + 45;

            ctx.textAlign = "center";
            if (SHOP_NAME) {
                ctx.font = "bold 45px Arial";
                ctx.fillText(SHOP_NAME.toUpperCase(), w / 2, y);
                y += 40;
            }

            ctx.font = "25px Arial"; ctx.textAlign = "left"; ctx.fillText("(" + label.time + ")", 10, y);
            ctx.textAlign = "center"; ctx.fillText("Ngày: " + new Date().toLocaleDateString('vi-VN'), w / 2, y);
            ctx.textAlign = "right"; ctx.font = "bold italic 25px Arial"; ctx.fillText("WebApp - " + (label.platformLabel || ""), w - 10, y);

            y += 20; ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke(); y += 25;

            let startContentY = y;
            let textY = startContentY - 10;
            userLines.forEach((l, lIdx) => { 
                textY += 60; 
                ctx.fillStyle = "#000";
                ctx.font = "900 55px Arial";
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
                ctx.fillText(l, 10, textY, leftColWidth);

                if (lIdx === userLines.length - 1 && badgeFitsOnSameLine) {
                    const badgeX = 10 + lastUserLineWidth + 14;
                    const badgeY = textY - 43;
                    drawBlackBadge(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeText);
                }
            });

            if (badgeNeedsOwnLine) {
                textY += 50;
                const badgeX = 10;
                const badgeY = textY - 43;
                drawBlackBadge(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeText);
            }

            textY += 10;
            ctx.fillStyle = "#000";
            ctx.font = "bold 35px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            if (lines.length > 0) lines.forEach(l => { textY += 45; ctx.fillText(l, 10, textY, leftColWidth); });

            if (hasPrice) {
                let priceText = pNum + ".000đ";
                fitPriceFont(ctx, priceText, priceColWidth - 10, 110);
                ctx.textAlign = "center";
                ctx.textBaseline = "alphabetic";
                ctx.fillText(priceText, rightColX + priceColWidth / 2, startContentY + 75);
            }

            currentY += h;

            if (idx < labels.length - 1) {
                ctx.beginPath();
                ctx.setLineDash([15, 15]);
                ctx.moveTo(0, currentY);
                ctx.lineTo(w, currentY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        executePrint(canvas, labels[0]?.platformLabel || "");
    } catch (e) {
        console.error("Print failed", e);
    }
}


export function printBill(
    user: string, 
    items: {content: string, price: number}[], 
    total: number, 
    platformLabel: string, 
    time: string,
    isGheLayParam?: boolean,
    shippingFee?: number,
    prepaid?: number
) {
    try {
        const isGl = isGheLayParam !== undefined ? Boolean(isGheLayParam) : checkCustomerIsGheLay(user);
        const baseUser = cleanUserForPrint(user);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = 780; canvas.width = w;

        // Kích thước badge GHÉ LẤY nền đen chữ trắng
        const badgeText = "GHÉ LẤY";
        ctx.font = "900 32px Arial";
        const badgeTextWidth = ctx.measureText(badgeText).width;
        const badgePaddingX = 14;
        const badgeWidth = badgeTextWidth + (badgePaddingX * 2);
        const badgeHeight = 44;

        ctx.font = "900 55px Arial";
        const userLines = wrapText(ctx, baseUser, w - 20);
        const lastUserLineWidth = userLines.length > 0 ? ctx.measureText(userLines[userLines.length - 1]).width : 0;
        const badgeFitsOnSameLine = isGl && (lastUserLineWidth + 16 + badgeWidth <= (w - 20));
        const badgeNeedsOwnLine = isGl && !badgeFitsOnSameLine;

        // Calculate heights
        let headerHeight = 110;
        let userHeight = (userLines.length * 60) + (badgeNeedsOwnLine ? 50 : 0);
        
        ctx.font = "bold 35px Arial";
        let itemsHeight = 0;
        const itemsWrap = items.map((item) => {
            const line = `Sản phẩm ${item.price}k`;
            const wrapped = wrapText(ctx, line, w - 300);
            itemsHeight += wrapped.length * 45;
            return { wrapped, price: item.price };
        });

        const hasFeeOrDeposit = (shippingFee !== undefined && shippingFee > 0) || (prepaid !== undefined && prepaid > 0);
        let totalSectionHeight = hasFeeOrDeposit ? 230 : 140;
        
        canvas.height = headerHeight + userHeight + 20 + itemsHeight + 20 + totalSectionHeight + 20;

        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = "#000";

        let y = 45; ctx.textAlign = "center";
        
        // Header (using global SHOP_NAME)
        if (SHOP_NAME) {
            ctx.font = "bold 45px Arial";
            ctx.fillText(SHOP_NAME.toUpperCase(), w / 2, y);
            y += 40;
        }

        ctx.font = "25px Arial"; ctx.textAlign = "left"; ctx.fillText("(" + time + ")", 10, y);
        ctx.textAlign = "center"; ctx.fillText("Ngày: " + new Date().toLocaleDateString('vi-VN'), w / 2, y);
        ctx.textAlign = "right"; ctx.font = "bold italic 25px Arial"; ctx.fillText("WebApp - " + (platformLabel || ""), w - 10, y);

        y += 20; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke(); y += 25;

        // User kèm badge GHÉ LẤY nền đen chữ trắng
        userLines.forEach((l, lIdx) => { 
            ctx.fillStyle = "#000";
            ctx.font = "900 55px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(l, 10, y + 45); 

            if (lIdx === userLines.length - 1 && badgeFitsOnSameLine) {
                const badgeX = 10 + lastUserLineWidth + 16;
                const badgeY = y + 45 - 43;
                drawBlackBadge(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeText);
            }
            y += 60; 
        });

        if (badgeNeedsOwnLine) {
            const badgeX = 10;
            const badgeY = y + 45 - 43;
            drawBlackBadge(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeText);
            y += 50;
        }
        
        y += 10;
        
        // Items
        ctx.font = "bold 35px Arial";
        itemsWrap.forEach(it => {
            it.wrapped.forEach((l, lIdx) => {
                ctx.textAlign = "left";
                ctx.fillText(l, 10, y + 35);
                
                if (lIdx === it.wrapped.length - 1) {
                    let priceText = `x 1      ${it.price}.000`;
                    
                    // Draw dotted line
                    let textWidth = ctx.measureText(l).width;
                    let priceWidth = ctx.measureText(priceText).width;
                    
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([6, 8]);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = "#aaa";
                    let startX = 10 + textWidth + 15;
                    let endX = w - 10 - priceWidth - 15;
                    if (endX > startX) {
                        ctx.moveTo(startX, y + 25);
                        ctx.lineTo(endX, y + 25);
                        ctx.stroke();
                    }
                    ctx.restore();

                    ctx.textAlign = "right";
                    ctx.fillText(priceText, w - 10, y + 35);
                }
                y += 45;
            });
        });

        y += 10; 
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke(); 
        y += 45;

        // Total Section
        const itemsTotalVnd = total * 1000;
        const fee = shippingFee || 0;
        const prep = prepaid || 0;
        const codVnd = Math.max(0, itemsTotalVnd + fee - prep);

        if (hasFeeOrDeposit) {
            ctx.textAlign = "left"; ctx.font = "bold 32px Arial";
            ctx.fillText(`Tiền hàng (${items.length} món):`, 10, y + 15);
            ctx.textAlign = "right"; ctx.font = "bold 32px Arial";
            ctx.fillText(`${itemsTotalVnd.toLocaleString('vi-VN')}đ`, w - 10, y + 15);
            y += 40;

            if (fee > 0) {
                ctx.textAlign = "left"; ctx.font = "bold 30px Arial";
                ctx.fillText(`Phí ship:`, 10, y + 15);
                ctx.textAlign = "right"; ctx.font = "bold 30px Arial";
                ctx.fillText(`+${fee.toLocaleString('vi-VN')}đ`, w - 10, y + 15);
                y += 38;
            }

            if (prep > 0) {
                ctx.textAlign = "left"; ctx.font = "bold 30px Arial";
                ctx.fillText(`Đã cọc:`, 10, y + 15);
                ctx.textAlign = "right"; ctx.font = "bold 30px Arial";
                ctx.fillText(`-${prep.toLocaleString('vi-VN')}đ`, w - 10, y + 15);
                y += 38;
            }

            ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, y + 5); ctx.lineTo(w - 10, y + 5); ctx.stroke();
            y += 25;

            ctx.textAlign = "left"; ctx.font = "bold 45px Arial";
            ctx.fillText("THU HỘ (COD)", 10, y + 35);
            ctx.textAlign = "right"; ctx.font = "900 65px Arial";
            ctx.fillText(`${codVnd.toLocaleString('vi-VN')}đ`, w - 10, y + 35);
        } else {
            ctx.textAlign = "left"; ctx.font = "bold 50px Arial";
            ctx.fillText("TỔNG CỘNG", 10, y + 35);
            
            ctx.font = "bold 35px Arial";
            ctx.fillStyle = "#444";
            ctx.fillText(`SL: ${items.length} MÓN`, 10, y + 85);
            
            ctx.fillStyle = "#000";
            ctx.textAlign = "right"; ctx.font = "900 70px Arial";
            ctx.fillText(`${total}.000đ`, w - 10, y + 70);
        }

        executePrint(canvas, platformLabel);
    } catch (e) {
        console.error("Print bill failed", e);
    }
}

export function normalizeUser(u: any): string {
    if (!u) return 'Khách';
    if (typeof u === 'string') return u.trim() || 'Khách';
    if (typeof u === 'object') {
        const name = u.nickname || u.uniqueId || u.displayId || u.idStr || (u.id ? String(u.id) : '') || u.name;
        if (name && typeof name === 'string') return name.trim() || 'Khách';
        if (name && typeof name === 'object') return normalizeUser(name);
        return 'Khách';
    }
    return String(u).trim() || 'Khách';
}

export function normalizeContent(c: any): string {
    if (c == null) return '';
    if (typeof c === 'string') return c;
    if (typeof c === 'number' || typeof c === 'boolean') return String(c);
    if (typeof c === 'object') {
        if (typeof c.text === 'string') return c.text;
        if (typeof c.comment === 'string') return c.comment;
        if (c.content) return normalizeContent(c.content);
        try {
            return JSON.stringify(c);
        } catch {
            return '';
        }
    }
    return String(c);
}

export function getShortId(name: any): string {
    const cleanName = normalizeUser(name).toLowerCase().trim();
    if (!cleanName || cleanName === 'khách') return '1000';
    let hash = 5381;
    for (let i = 0; i < cleanName.length; i++) {
        hash = ((hash << 5) + hash) + cleanName.charCodeAt(i);
        hash |= 0;
    }
    const num = (Math.abs(hash) % 9000) + 1000;
    return num.toString();
}

export async function pushPrintJobToFirebase(platformLabel: string, b64: string) {
    let room = "";
    for (const key in PLATFORMS) {
        if (PLATFORMS[key as Platform].label === platformLabel || platformLabel.includes(PLATFORMS[key as Platform].label)) {
            room = PLATFORMS[key as Platform].room;
            break;
        }
    }
    if (!room) room = "default_print_room";
    
    try {
        const queueRef = ref(firebaseDb, `rooms/${room}/print_queue`);
        const newJobRef = push(queueRef);
        await set(newJobRef, {
            dataUri: `data:image/jpeg;base64,${b64}`,
            timestamp: Date.now()
        });
        
        // Cấp quyền xoá các job cũ sau 1 giờ để đỡ nặng DB
    } catch (e) {
        console.error("Push print job failed", e);
    }
}

export function isPhuShipItem(content?: string): boolean {
    if (!content) return false;
    const c = content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return c.includes("phu ship") || c.includes("phu thu ship");
}
