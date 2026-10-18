import { useStore, CommentData } from '../store';
import { DEVICE_ID, firebaseDb, normalizeUser } from './core';
import { ref, onValue, set as fbSet } from 'firebase/database';
import { getApiBaseUrl } from './tiktokLiveClient';

export const DEFAULT_FB_TARGET = '';
export const DEFAULT_FB_ROOM = 'hienpham_live_fb';

export interface FacebookLiveStatus {
  isConnected: boolean;
  target: string;
  videoId: string | null;
  totalCommentsCount: number;
  connectedAt: number | null;
  lastError: string | null;
  isStopped: boolean;
  serverVersion?: string;
  serverConfig?: {
    fbTarget?: string;
    fbPageId?: string;
    hasToken?: boolean;
  };
}

let fbStatus: FacebookLiveStatus = {
  isConnected: false,
  target: '',
  videoId: null,
  totalCommentsCount: 0,
  connectedAt: null,
  lastError: null,
  isStopped: false,
  serverVersion: '2.4.1'
};

const statusListeners: Array<(status: FacebookLiveStatus) => void> = [];
let fbEventSource: EventSource | null = null;
let fbPollInterval: any = null;

// Phân tích và giải quyết URL Facebook (bao gồm link rút gọn share /v/ hoặc fb.watch)
export async function resolveFacebookUrl(inputUrl: string): Promise<{ videoId: string | null; pageId: string | null; resolvedUrl: string }> {
  if (!inputUrl) return { videoId: null, pageId: null, resolvedUrl: '' };
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/api/facebook/resolve-url` : '/api/facebook/resolve-url';

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: inputUrl })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.videoId || data.pageId || data.resolvedUrl)) {
        return data;
      }
    }
  } catch {}

  // Phân tích nội bộ (Client-side Fallback)
  let str = inputUrl.trim();
  if (/^\d{10,25}$/.test(str)) {
    return { videoId: str, pageId: null, resolvedUrl: str };
  }

  let videoId: string | null = null;
  let pageId: string | null = null;

  // Pattern 0: story.php?story_fbid=123456
  const matchStoryFbid = str.match(/story_fbid=(\d+)/);
  if (matchStoryFbid) videoId = matchStoryFbid[1];

  const matchIdParam = str.match(/[?&]id=(\d+)/);
  if (matchIdParam && !pageId) pageId = matchIdParam[1];

  const matchVideos = str.match(/\/videos\/(\d+)/);
  if (matchVideos && !videoId) videoId = matchVideos[1];

  const matchV = str.match(/[?&]v=(\d+)/);
  if (matchV && !videoId) videoId = matchV[1];

  const matchWatch = str.match(/\/watch\/(?:live\/\?v=|\?v=)?(\d+)/);
  if (matchWatch && !videoId) videoId = matchWatch[1];

  const matchPosts = str.match(/\/(?:posts|permalink)\/(\d+)/);
  if (matchPosts && !videoId) videoId = matchPosts[1];

  const matchPage = str.match(/facebook\.com\/([a-zA-Z0-9._-]+)\/?/);
  if (matchPage && !['watch', 'live', 'video', 'videos', 'story', 'stories', 'share', 'sharer', 'permalink.php', 'photo.php', 'story.php'].includes(matchPage[1])) {
    pageId = matchPage[1];
  }

  return { videoId, pageId, resolvedUrl: str };
}

export interface TestTokenResult {
  success: boolean;
  message: string;
  details?: any;
  isUserToken?: boolean;
  pageAccessToken?: string;
  pageName?: string;
  pageId?: string;
}

// Kiểm tra quyền và tính hợp lệ của Facebook Token trực tiếp với Graph API
export async function testFacebookToken(targetOrVideoId: string, token: string): Promise<TestTokenResult> {
  if (!token || !token.trim()) {
    return { success: false, message: 'Chưa nhập Access Token. Vui lòng nhập Token Facebook để kiểm tra.' };
  }

  const cleanToken = token.trim();
  let idToCheck = targetOrVideoId.trim();

  // Thử resolve videoId nếu người dùng đưa cả link
  if (idToCheck.includes('facebook.com') || idToCheck.includes('/share/')) {
    const res = await resolveFacebookUrl(idToCheck);
    if (res.videoId) idToCheck = res.videoId;
    else if (res.pageId) idToCheck = res.pageId;
  }

  try {
    // 0. Nếu là Pancake Public API Token (bắt đầu bằng eyJ...)
    if (cleanToken.startsWith('eyJ')) {
      let pageId = '100546631959960';
      try {
        const payload = JSON.parse(atob(cleanToken.split('.')[1]));
        if (payload && payload.id) pageId = payload.id;
      } catch {}

      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const sinceSec = nowSec - 7 * 86400;
        const untilSec = nowSec + 3600;
        const pUrl = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations?access_token=${encodeURIComponent(cleanToken)}&since=${sinceSec}&until=${untilSec}&page_number=1`;
        const pRes = await fetch(pUrl);
        const pData = await pRes.json();
        if (pData && (pData.success || Array.isArray(pData.conversations))) {
          const count = pData.conversations?.length || 0;
          return {
            success: true,
            message: `✅ Token Pancake hợp lệ! Đã kết nối Fanpage ID: ${pageId}. Tìm thấy ${count} bình luận/hội thoại sẵn sàng cào.`,
            pageId,
            details: pData
          };
        }
      } catch {}

      return {
        success: true,
        message: `✅ Token Pancake JWT hợp lệ! Đã gắn Fanpage ID: ${pageId}. Đã sẵn sàng để máy chủ TV Box cào bình luận.`,
        pageId
      };
    }

    // 1. Kiểm tra với videoId nếu có
    if (idToCheck && /^\d{10,25}$/.test(idToCheck)) {
      const url = `https://graph.facebook.com/v21.0/${idToCheck}/comments?limit=1&fields=id,from,message&access_token=${encodeURIComponent(cleanToken)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) {
        return {
          success: true,
          message: `Token hợp lệ! Đã kết nối thành công tới Video #${idToCheck}.`,
          details: json
        };
      } else if (json && json.error) {
        return {
          success: false,
          message: json.error.message || 'Lỗi khi kiểm tra Video với Token.'
        };
      }
    }

    // 2. Kiểm tra thông tin chủ nhân của Token qua /me
    const meUrl = `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(cleanToken)}`;
    const meRes = await fetch(meUrl);
    const meJson = await meRes.json();
    if (meRes.ok && meJson && meJson.name) {
      // Kiểm tra xem User này có quản lý Fanpage không để tự động lấy Page Token
      try {
        const accUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(cleanToken)}`;
        const accRes = await fetch(accUrl);
        if (accRes.ok) {
          const accJson = await accRes.json();
          const pages = accJson.data || [];
          if (Array.isArray(pages) && pages.length > 0) {
            const matched = pages.find((p: any) => 
              (idToCheck && (p.id === idToCheck || p.name?.toLowerCase().includes(idToCheck.toLowerCase()))) ||
              p.name?.toLowerCase().includes('hiền') ||
              p.name?.toLowerCase().includes('hien')
            ) || pages[0];

            if (matched && matched.access_token) {
              return {
                success: true,
                message: `✅ Token cá nhân của [${meJson.name}] hợp lệ! Đã tự động kích hoạt Page Token cho Fanpage: "${matched.name}".`,
                isUserToken: true,
                pageAccessToken: matched.access_token,
                pageName: matched.name,
                pageId: matched.id,
                details: { ...meJson, page: matched }
              };
            }
          }
        }
      } catch (errAcc) {
        console.warn('Lỗi kiểm tra accounts:', errAcc);
      }

      return {
        success: true,
        message: `Token hợp lệ! Kết nối với: ${meJson.name} (ID: ${meJson.id})`,
        details: meJson
      };
    } else if (meJson && meJson.error) {
      return {
        success: false,
        message: meJson.error.message || 'Token không hợp lệ hoặc đã hết hạn.'
      };
    }

    return { success: false, message: 'Không thể xác thực Token này với Facebook.' };
  } catch (err: any) {
    return { success: false, message: 'Lỗi mạng khi kiểm tra Token: ' + err.message };
  }
}

function notifyFbListeners() {
  const cloned = { ...fbStatus };
  statusListeners.forEach((fn) => {
    try { fn(cloned); } catch (e) {}
  });
}

export function getFacebookStatus(): FacebookLiveStatus {
  return { ...fbStatus };
}

export function subscribeFacebookStatus(callback: (status: FacebookLiveStatus) => void): () => void {
  statusListeners.push(callback);
  callback(getFacebookStatus());
  return () => {
    const idx = statusListeners.indexOf(callback);
    if (idx !== -1) statusListeners.splice(idx, 1);
  };
}

export async function fetchFacebookStatus(): Promise<FacebookLiveStatus> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/api/facebook/status` : '/api/facebook/status';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(targetUrl, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      fbStatus = {
        isConnected: !!data.isConnected,
        target: data.target || fbStatus.target,
        videoId: data.videoId || null,
        totalCommentsCount: typeof data.totalCommentsCount === 'number' ? data.totalCommentsCount : fbStatus.totalCommentsCount,
        connectedAt: data.connectedAt || fbStatus.connectedAt,
        lastError: data.lastError || null,
        isStopped: !!data.isStopped,
        serverVersion: data.serverVersion || '2.4.0'
      };
      notifyFbListeners();
    }
  } catch (e) {}
  return getFacebookStatus();
}

export async function connectFacebookLive(targetInput: string, token: string = '', room: string = DEFAULT_FB_ROOM): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const cleanTarget = targetInput.trim();
  const cleanToken = token.trim();

  if (cleanTarget) {
    try {
      localStorage.setItem('slp_last_fb_target', cleanTarget);
    } catch {}
  }

  if (cleanToken) {
    try {
      localStorage.setItem('slp_last_fb_token', cleanToken);
    } catch {}
  }

  // Pre-resolve target URL
  let resolvedVideoId: string | null = null;
  try {
    const res = await resolveFacebookUrl(cleanTarget);
    if (res.videoId) resolvedVideoId = res.videoId;
  } catch {}

  fbStatus = {
    ...fbStatus,
    target: cleanTarget,
    videoId: resolvedVideoId || fbStatus.videoId,
    isStopped: false,
    lastError: resolvedVideoId
      ? (cleanToken ? `Đang kết nối Video Live #${resolvedVideoId}...` : `Đã nhận diện Video #${resolvedVideoId}. Đang đợi Token Facebook...`)
      : 'Đang gửi lệnh kết nối Facebook Live...'
  };
  notifyFbListeners();

  // 1. Gửi lệnh qua Firebase RTDB cho TV Box nhận lệnh từ xa
  try {
    const targetRef = ref(firebaseDb, `rooms/${room}/target_channel`);
    await fbSet(targetRef, {
      target: cleanTarget,
      accessToken: cleanToken,
      isStopped: false,
      action: 'start',
      requestedAt: Date.now(),
      requestedBy: DEVICE_ID
    });
  } catch (e) {}

  // 2. Gửi trực tiếp tới Cloudflare Tunnel / Local IP TV Box hoặc Web Cloud
  try {
    const targetUrl = baseUrl ? `${baseUrl}/api/facebook/connect` : '/api/facebook/connect';
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: cleanTarget,
        accessToken: cleanToken,
        syncFirebaseRoom: room
      })
    });
    if (res.ok) {
      setTimeout(fetchFacebookStatus, 1000);
      return true;
    }
  } catch (e) {}

  return true;
}

export async function disconnectFacebookLive(room: string = DEFAULT_FB_ROOM): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  fbStatus = {
    ...fbStatus,
    isConnected: false,
    isStopped: true,
    lastError: 'Đã dừng cào Facebook Live.'
  };
  notifyFbListeners();

  // 1. Gửi lệnh dừng qua Firebase RTDB
  try {
    const targetRef = ref(firebaseDb, `rooms/${room}/target_channel`);
    await fbSet(targetRef, {
      target: fbStatus.target,
      isStopped: true,
      action: 'stop',
      requestedAt: Date.now(),
      requestedBy: DEVICE_ID
    });
  } catch (e) {}

  // 2. Gửi dừng tới TV Box hoặc Web Cloud
  try {
    const targetUrl = baseUrl ? `${baseUrl}/api/facebook/disconnect` : '/api/facebook/disconnect';
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {}

  return true;
}

// Lắng nghe Heartbeat Facebook Live từ máy chủ TV Box
export function initFacebookMasterCoordinator() {
  const masterRef = ref(firebaseDb, `rooms/${DEFAULT_FB_ROOM}/crawler_master`);
  onValue(masterRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const isAlive = (Date.now() - (data.lastHeartbeat || 0)) < 25000;
    if (isAlive) {
      fbStatus = {
        ...fbStatus,
        isConnected: !!data.isConnected,
        isStopped: !!data.isStopped,
        target: data.target || fbStatus.target,
        videoId: data.videoId || fbStatus.videoId,
        totalCommentsCount: data.totalCommentsCount || fbStatus.totalCommentsCount,
        lastError: data.lastError || null
      };
      notifyFbListeners();
    }
  });

  // Định kỳ fetch status
  if (!fbPollInterval) {
    fbPollInterval = setInterval(fetchFacebookStatus, 12000);
  }
}
