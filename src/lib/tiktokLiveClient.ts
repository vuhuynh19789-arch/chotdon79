import { useStore, CommentData, registerCustomerAvatar } from '../store';
import { DEVICE_ID, firebaseDb, normalizeUser } from './core';
import { ref, onValue, set as fbSet } from 'firebase/database';

export const DEFAULT_TIKTOK_CHANNEL = 'hienpham.965286096';
export const DEFAULT_BACKEND_URL = 'https://caotiktok.home79.cloud';

export type CrawlerMode = 'tvbox' | 'browser_dom';

export interface LiveSyncConfig {
  mode: CrawlerMode;
  channel: string;
  isStopped: boolean;
  muteNotLiveAlert: boolean;
  backendUrl?: string;
  updatedAt: number;
  updatedBy?: string;
}

let currentLiveConfig: LiveSyncConfig = {
  mode: (typeof localStorage !== 'undefined' && localStorage.getItem('slp_crawler_mode') === 'browser_dom') ? 'browser_dom' : 'tvbox',
  channel: (typeof localStorage !== 'undefined' && localStorage.getItem('slp_last_tiktok_channel')) || DEFAULT_TIKTOK_CHANNEL,
  isStopped: false,
  muteNotLiveAlert: (typeof localStorage !== 'undefined' && localStorage.getItem('slp_mute_not_live') === 'true'),
  backendUrl: DEFAULT_BACKEND_URL,
  updatedAt: Date.now(),
  updatedBy: DEVICE_ID
};

export function getCrawlerMode(): CrawlerMode {
  return currentLiveConfig.mode;
}

export function isMuteNotLiveAlert(): boolean {
  return currentLiveConfig.muteNotLiveAlert;
}

export function getLiveSyncConfig(): LiveSyncConfig {
  return { ...currentLiveConfig };
}

// Đồng bộ toàn bộ Cấu hình (Chế độ Cào, Tên Kênh, Tắt cảnh báo, URL) lên Firebase RTDB cho tất cả máy phụ / máy in
export async function updateLiveConfig(partial: Partial<LiveSyncConfig>): Promise<void> {
  currentLiveConfig = {
    ...currentLiveConfig,
    ...partial,
    updatedAt: Date.now(),
    updatedBy: DEVICE_ID
  };

  try {
    localStorage.setItem('slp_crawler_mode', currentLiveConfig.mode);
    localStorage.setItem('slp_mute_not_live', currentLiveConfig.muteNotLiveAlert ? 'true' : 'false');
    if (currentLiveConfig.channel) {
      localStorage.setItem('slp_last_tiktok_channel', currentLiveConfig.channel);
    }
  } catch {}

  // Bắn lên Firebase để tất cả máy in & máy phụ đồng bộ 100%
  try {
    const configRef = ref(firebaseDb, 'rooms/hienpham_live/live_config');
    await fbSet(configRef, currentLiveConfig);

    // Đồng thời cập nhật target_channel cho TV Box nếu ở chế độ TV Box
    const chanRef = ref(firebaseDb, 'rooms/hienpham_live/target_channel');
    await fbSet(chanRef, {
      channel: currentLiveConfig.channel,
      isStopped: currentLiveConfig.isStopped,
      mode: currentLiveConfig.mode,
      muteNotLiveAlert: currentLiveConfig.muteNotLiveAlert,
      action: currentLiveConfig.isStopped ? 'stop' : 'start',
      requestedAt: Date.now(),
      requestedBy: DEVICE_ID
    });
  } catch (err) {
    console.warn('Lỗi đồng bộ cấu hình lên Firebase:', err);
  }

  if (currentLiveConfig.mode === 'browser_dom') {
    currentStatus.isConnected = true;
    currentStatus.username = currentLiveConfig.channel;
    currentStatus.lastError = null;
  }

  notifyStatusListeners();
}

// Check if user enabled distributed failover crawler on this secondary device
export function isFailoverEnabled(): boolean {
  try {
    const val = localStorage.getItem('slp_failover_enabled');
    // Default to false: since user has a 24/7 dedicated TV Box crawler, client-side crawl is OFF by default!
    return val === 'true';
  } catch {
    return false;
  }
}

export function setFailoverEnabled(enabled: boolean) {
  try {
    localStorage.setItem('slp_failover_enabled', enabled ? 'true' : 'false');
  } catch {}
  if (!enabled && isThisDeviceMaster) {
    releaseMasterRole();
  }
  notifyStatusListeners();
}

// Active working backend tracking
let activeWorkingBackendUrl: string | null = null;

export function getActiveApiBaseUrl(): string {
  if (activeWorkingBackendUrl !== null) {
    return activeWorkingBackendUrl;
  }
  return getApiBaseUrl();
}

export function setActiveWorkingBackendUrl(url: string | null) {
  activeWorkingBackendUrl = url;
}

// Backend API URL Resolver (supports Cloud Server 0ms or TV Box Tunnel)
export function getApiBaseUrl(): string {
  try {
    const customUrl = localStorage.getItem('slp_backend_url');
    if (customUrl !== null) {
      const trimmed = customUrl.trim();
      if (trimmed === 'cloud' || trimmed === 'local' || trimmed === 'origin' || trimmed === '') {
        return '';
      }
      let url = trimmed.replace(/\/+$/, '');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      // If current page is HTTPS, force backend URL to HTTPS to avoid Mixed Content error
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        url = url.replace('http://', 'https://');
      }
      return url;
    }
  } catch {}

  const metaEnv = (import.meta as any)?.env;
  if (metaEnv?.VITE_BACKEND_API_URL) {
    let envUrl = String(metaEnv.VITE_BACKEND_API_URL).trim().replace(/\/+$/, '');
    if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
      envUrl = 'https://' + envUrl;
    }
    return envUrl;
  }

  // Nếu đang mở trên Web Full-Stack (Cloud Run / Localhost / VPS), dùng luôn máy chủ Cloud ("") siêu tốc 0ms!
  if (typeof window !== 'undefined') {
    const host = window.location.host.toLowerCase();
    if (!host.includes('vercel.app')) {
      return '';
    }
  }

  // Mặc định cho Vercel: kết nối TV Box Cloudflare Tunnel
  return DEFAULT_BACKEND_URL;
}

export function resetBackendUrlToDefault() {
  try {
    localStorage.removeItem('slp_backend_url');
  } catch {}
  activeWorkingBackendUrl = null;
  if (eventSource) {
    try { eventSource.close(); } catch {}
    eventSource = null;
  }
  notifyStatusListeners();
  initTikTokEventSource();
}

export function setCustomBackendUrl(url: string) {
  try {
    if (url && url.trim()) {
      localStorage.setItem('slp_backend_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.setItem('slp_backend_url', '');
    }
  } catch {}
  activeWorkingBackendUrl = null;
  if (eventSource) {
    try {
      eventSource.close();
    } catch {}
    eventSource = null;
  }
  initTikTokEventSource();
}

export interface CrawlerMasterInfo {
  masterDeviceId: string;
  masterDeviceName: string;
  channel: string;
  lastHeartbeat: number;
  status: 'active' | 'standby';
}

export interface TikTokLiveStatus {
  isConnected: boolean;
  username: string;
  roomId: string | null;
  viewerCount: number;
  totalCommentsCount: number;
  totalLikesCount: number;
  connectedAt: number | null;
  lastError: string | null;
  isMaster: boolean;
  masterInfo: CrawlerMasterInfo | null;
  isFailoverEnabled: boolean;
  crawlerMode: CrawlerMode;
  muteNotLiveAlert: boolean;
  isSyncedWithAdmin: boolean;
}

let eventSource: EventSource | null = null;
let reconnectTimer: any = null;
let statusListeners: Array<(status: TikTokLiveStatus) => void> = [];
let likeListeners: Array<(likeData: { user: string; likeCount: number; totalLikes: number }) => void> = [];

let isMasterCoordinatorRunning = false;
let heartbeatInterval: any = null;
let electionCheckInterval: any = null;

let currentMasterInfo: CrawlerMasterInfo | null = null;
let isThisDeviceMaster = false;

// Get friendly device name
function getDeviceLabel(): string {
  try {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const idShort = DEVICE_ID.substring(DEVICE_ID.length - 4).toUpperCase();
    return isMobile ? `📱 Điện thoại (#${idShort})` : `💻 Máy tính (#${idShort})`;
  } catch {
    return `Thiết bị #${DEVICE_ID.substring(0, 6)}`;
  }
}

let currentStatus: TikTokLiveStatus = {
  isConnected: currentLiveConfig.mode === 'browser_dom',
  username: currentLiveConfig.channel || DEFAULT_TIKTOK_CHANNEL,
  roomId: null,
  viewerCount: 0,
  totalCommentsCount: 0,
  totalLikesCount: 0,
  connectedAt: null,
  lastError: null,
  isMaster: false,
  masterInfo: null,
  isFailoverEnabled: false,
  crawlerMode: currentLiveConfig.mode,
  muteNotLiveAlert: currentLiveConfig.muteNotLiveAlert,
  isSyncedWithAdmin: true,
};

function notifyStatusListeners() {
  const failoverOn = isFailoverEnabled();
  let effectiveError = currentStatus.lastError;
  if (currentLiveConfig.mode === 'browser_dom') {
    effectiveError = null;
  } else if (currentLiveConfig.muteNotLiveAlert && effectiveError) {
    const lowerErr = effectiveError.toLowerCase();
    if (lowerErr.includes('chưa phát live') || lowerErr.includes('không live') || lowerErr.includes('not live') || lowerErr.includes('chưa live')) {
      effectiveError = null;
    }
  }

  const payload: TikTokLiveStatus = {
    ...currentStatus,
    isConnected: currentLiveConfig.mode === 'browser_dom' ? true : currentStatus.isConnected,
    username: currentLiveConfig.channel || currentStatus.username,
    lastError: effectiveError,
    crawlerMode: currentLiveConfig.mode,
    muteNotLiveAlert: currentLiveConfig.muteNotLiveAlert,
    isSyncedWithAdmin: true,
    isMaster: failoverOn ? isThisDeviceMaster : false,
    masterInfo: currentMasterInfo,
    isFailoverEnabled: failoverOn,
  };
  statusListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error(e);
    }
  });
}

export function subscribeTikTokStatus(callback: (status: TikTokLiveStatus) => void) {
  statusListeners.push(callback);
  const failoverOn = isFailoverEnabled();
  let effectiveError = currentStatus.lastError;
  if (currentLiveConfig.mode === 'browser_dom') {
    effectiveError = null;
  } else if (currentLiveConfig.muteNotLiveAlert && effectiveError) {
    const lowerErr = effectiveError.toLowerCase();
    if (lowerErr.includes('chưa phát live') || lowerErr.includes('không live') || lowerErr.includes('not live') || lowerErr.includes('chưa live')) {
      effectiveError = null;
    }
  }

  callback({
    ...currentStatus,
    isConnected: currentLiveConfig.mode === 'browser_dom' ? true : currentStatus.isConnected,
    username: currentLiveConfig.channel || currentStatus.username,
    lastError: effectiveError,
    crawlerMode: currentLiveConfig.mode,
    muteNotLiveAlert: currentLiveConfig.muteNotLiveAlert,
    isSyncedWithAdmin: true,
    isMaster: failoverOn ? isThisDeviceMaster : false,
    masterInfo: currentMasterInfo,
    isFailoverEnabled: failoverOn,
  });
  return () => {
    statusListeners = statusListeners.filter((cb) => cb !== callback);
  };
}

export function subscribeTikTokLikes(callback: (likeData: { user: string; likeCount: number; totalLikes: number }) => void) {
  likeListeners.push(callback);
  return () => {
    likeListeners = likeListeners.filter((cb) => cb !== callback);
  };
}

export function getTikTokStatus(): TikTokLiveStatus {
  const failoverOn = isFailoverEnabled();
  let effectiveError = currentStatus.lastError;
  if (currentLiveConfig.mode === 'browser_dom') {
    effectiveError = null;
  } else if (currentLiveConfig.muteNotLiveAlert && effectiveError) {
    const lowerErr = effectiveError.toLowerCase();
    if (lowerErr.includes('chưa phát live') || lowerErr.includes('không live') || lowerErr.includes('not live') || lowerErr.includes('chưa live')) {
      effectiveError = null;
    }
  }

  return {
    ...currentStatus,
    isConnected: currentLiveConfig.mode === 'browser_dom' ? true : currentStatus.isConnected,
    username: currentLiveConfig.channel || currentStatus.username,
    lastError: effectiveError,
    crawlerMode: currentLiveConfig.mode,
    muteNotLiveAlert: currentLiveConfig.muteNotLiveAlert,
    isSyncedWithAdmin: true,
    isMaster: failoverOn ? isThisDeviceMaster : false,
    masterInfo: currentMasterInfo,
    isFailoverEnabled: failoverOn,
  };
}

export async function fetchTikTokStatus(): Promise<TikTokLiveStatus> {
  if (currentLiveConfig.mode === 'browser_dom') {
    currentStatus.isConnected = true;
    currentStatus.username = currentLiveConfig.channel;
    currentStatus.lastError = null;
    notifyStatusListeners();
    return getTikTokStatus();
  }

  const primaryBase = getActiveApiBaseUrl();
  const candidateUrls: string[] = [primaryBase];
  if (!candidateUrls.includes('')) candidateUrls.push('');
  if (!candidateUrls.includes(DEFAULT_BACKEND_URL)) candidateUrls.push(DEFAULT_BACKEND_URL);

  let successData: any = null;
  let successfulBase: string = primaryBase;

  for (const base of candidateUrls) {
    try {
      const url = base ? `${base}/api/tiktok/status` : '/api/tiktok/status';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (!text.trim().startsWith('<')) {
          try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object') {
              successData = data;
              successfulBase = base;
              break;
            }
          } catch {}
        }
      }
    } catch {}
  }

  if (successData) {
    setActiveWorkingBackendUrl(successfulBase);
    let rawError = successData.lastError || null;
    if (currentLiveConfig.muteNotLiveAlert && rawError) {
      const lErr = rawError.toLowerCase();
      if (lErr.includes('chưa phát live') || lErr.includes('không live') || lErr.includes('not live') || lErr.includes('chưa live')) {
        rawError = null;
      }
    }

    currentStatus = {
      ...currentStatus,
      isConnected: Boolean(successData.isConnected),
      username: successData.username || currentLiveConfig.channel || DEFAULT_TIKTOK_CHANNEL,
      roomId: successData.roomId || null,
      viewerCount: successData.viewerCount || 0,
      totalCommentsCount: successData.totalCommentsCount || successData.commentsCount || 0,
      totalLikesCount: successData.totalLikesCount || 0,
      connectedAt: successData.connectedAt || null,
      lastError: rawError,
    };

    // Sync any recent comments from backend directly into store
    if (Array.isArray(successData.recentComments) && successData.recentComments.length > 0) {
      const effectiveClearedAt = Math.max(
        Number(localStorage.getItem('slp_feed_cleared_at_tiktok')) || 0,
        successData.clearedAt || 0
      );
      const state = useStore.getState();
      const currentComments = (state.tiktok.comments || []).filter(c => !effectiveClearedAt || (c.ts || 0) > effectiveClearedAt);
      const seenIds = new Set(currentComments.map((c) => String(c.id)));
      const incoming: CommentData[] = [];
      for (const item of successData.recentComments) {
        if (!item) continue;
        const itemTs = item.ts || Date.now();
        if (effectiveClearedAt > 0 && itemTs <= effectiveClearedAt) continue;
        const rawContent = item.content || item.comment || item.text || item.msg || '';
        if (!rawContent) continue;
        const rawUser = item.user || item.nickname || item.uniqueId || 'Khách';
        const cleanUser = normalizeUser(rawUser);
        const cleanContent = typeof rawContent === 'object' ? JSON.stringify(rawContent) : String(rawContent || '');
        const cleanAvatar = item.avatar || (typeof item.user === 'object' && ((item.user as any).profilePictureUrl || (item.user as any).avatarThumb?.urlList?.[0])) || '';
        const rawId = item.id ? String(item.id) : `tt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        if (cleanAvatar) {
          registerCustomerAvatar(cleanUser, cleanAvatar, 'tiktok');
        }
        if (!seenIds.has(rawId)) {
          seenIds.add(rawId);
          incoming.push({
            id: rawId,
            user: cleanUser,
            content: cleanContent,
            time: item.time || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            avatar: cleanAvatar,
            ts: itemTs,
            platform: 'tiktok',
          });
        }
      }
      if (incoming.length > 0) {
        useStore.setState({
          tiktok: {
            ...state.tiktok,
            comments: [...incoming, ...currentComments].slice(0, 250),
            lastCommentsAt: Date.now(),
          },
        });
      }
    }

    notifyStatusListeners();
  } else {
    currentStatus.lastError = 'Không thể kết nối máy chủ cào (TV Box hoặc Web Cloud). Đang thử kết nối lại...';
    notifyStatusListeners();
  }
  return getTikTokStatus();
}

// Write heartbeat as Master
async function sendMasterHeartbeat(channel: string) {
  try {
    const masterRef = ref(firebaseDb, 'rooms/hienpham_live/crawler_master');
    const info: CrawlerMasterInfo = {
      masterDeviceId: DEVICE_ID,
      masterDeviceName: getDeviceLabel(),
      channel: channel || DEFAULT_TIKTOK_CHANNEL,
      lastHeartbeat: Date.now(),
      status: 'active',
    };
    await fbSet(masterRef, info);
    currentMasterInfo = info;
    isThisDeviceMaster = true;
    notifyStatusListeners();
  } catch (err) {
    console.warn('Failed to send crawler master heartbeat:', err);
  }
}

// Claim Master role and start live crawler
export async function claimMasterRole(channelToConnect: string = DEFAULT_TIKTOK_CHANNEL) {
  console.log(`[Master Coordinator] Thiết bị ${DEVICE_ID} nhận vai trò Máy Cào Chính (Master) cho kênh @${channelToConnect}`);
  isThisDeviceMaster = true;
  await sendMasterHeartbeat(channelToConnect);

  // Start heartbeat interval
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (isThisDeviceMaster) {
      sendMasterHeartbeat(channelToConnect);
    }
  }, 4000);

  // Trigger connect on server
  try {
    await connectTikTokLive(channelToConnect);
  } catch (e) {
    console.warn('Auto-connect on master claim error:', e);
  }
}

// Release Master role (e.g., on manual switch)
export async function releaseMasterRole() {
  isThisDeviceMaster = false;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  try {
    const masterRef = ref(firebaseDb, 'rooms/hienpham_live/crawler_master');
    await fbSet(masterRef, {
      masterDeviceId: '',
      masterDeviceName: '',
      channel: currentStatus.username || DEFAULT_TIKTOK_CHANNEL,
      lastHeartbeat: 0,
      status: 'standby',
    });
  } catch {}
  notifyStatusListeners();
}

// Initialize Distributed Master-Slave Coordinator
export function startDistributedMasterCoordinator() {
  if (isMasterCoordinatorRunning) return;
  isMasterCoordinatorRunning = true;

  initTikTokEventSource();

  // Listen to Firebase live_config state (Tất cả máy in & máy phụ đồng bộ 100% với Admin)
  const configRef = ref(firebaseDb, 'rooms/hienpham_live/live_config');
  onValue(configRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const modeChanged = data.mode && data.mode !== currentLiveConfig.mode;
      const channelChanged = data.channel && data.channel !== currentLiveConfig.channel;
      const muteChanged = typeof data.muteNotLiveAlert === 'boolean' && data.muteNotLiveAlert !== currentLiveConfig.muteNotLiveAlert;

      currentLiveConfig = {
        ...currentLiveConfig,
        mode: data.mode === 'browser_dom' ? 'browser_dom' : 'tvbox',
        channel: data.channel || currentLiveConfig.channel || DEFAULT_TIKTOK_CHANNEL,
        isStopped: Boolean(data.isStopped),
        muteNotLiveAlert: Boolean(data.muteNotLiveAlert),
        backendUrl: data.backendUrl || currentLiveConfig.backendUrl || DEFAULT_BACKEND_URL,
        updatedAt: data.updatedAt || Date.now(),
        updatedBy: data.updatedBy || 'admin'
      };

      try {
        localStorage.setItem('slp_crawler_mode', currentLiveConfig.mode);
        localStorage.setItem('slp_mute_not_live', currentLiveConfig.muteNotLiveAlert ? 'true' : 'false');
        if (currentLiveConfig.channel) {
          localStorage.setItem('slp_last_tiktok_channel', currentLiveConfig.channel);
        }
      } catch {}

      if (currentLiveConfig.mode === 'browser_dom') {
        currentStatus.isConnected = true;
        currentStatus.username = currentLiveConfig.channel;
        currentStatus.lastError = null;
      }

      notifyStatusListeners();
    }
  });

  // Listen to Firebase Master state
  const masterRef = ref(firebaseDb, 'rooms/hienpham_live/crawler_master');
  onValue(masterRef, (snapshot) => {
    const data: CrawlerMasterInfo | null = snapshot.val();
    currentMasterInfo = data;
    const now = Date.now();

    if (!isFailoverEnabled()) {
      // Failover is disabled on this secondary device
      isThisDeviceMaster = false;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    } else if (data && data.masterDeviceId === DEVICE_ID) {
      // This device is acknowledged as Master
      isThisDeviceMaster = true;
    } else if (data && data.masterDeviceId && (now - (data.lastHeartbeat || 0) < 12000)) {
      // Another device is actively Master
      isThisDeviceMaster = false;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    } else {
      // No active master or previous master timed out (>12s)
      isThisDeviceMaster = false;
    }
    notifyStatusListeners();
  });

  // Periodically check if master is alive; if dead for >12s, take over ONLY if failover is enabled!
  if (electionCheckInterval) clearInterval(electionCheckInterval);
  electionCheckInterval = setInterval(async () => {
    if (!isFailoverEnabled()) {
      return;
    }
    const now = Date.now();
    const isMasterDead = !currentMasterInfo || !currentMasterInfo.masterDeviceId || (now - (currentMasterInfo.lastHeartbeat || 0) > 12000);

    if (isMasterDead && !isThisDeviceMaster) {
      console.log('[Master Coordinator] Máy cào cũ đã tắt/offline. Tự động chuyển quyền Máy Cào Chính sang thiết bị này!');
      const targetChannel = currentMasterInfo?.channel || localStorage.getItem('slp_last_tiktok_channel') || DEFAULT_TIKTOK_CHANNEL;
      await claimMasterRole(targetChannel);
    }
  }, 5000);

  // Graceful cleanup on window close
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (isThisDeviceMaster) {
        // Soft release so next device can claim quickly
        try {
          const masterRef = ref(firebaseDb, 'rooms/hienpham_live/crawler_master');
          fbSet(masterRef, {
            masterDeviceId: '',
            masterDeviceName: '',
            channel: currentStatus.username || DEFAULT_TIKTOK_CHANNEL,
            lastHeartbeat: 0,
            status: 'standby',
          });
        } catch {}
      }
    });
  }
}

export async function connectTikTokLive(username: string): Promise<{ success: boolean; error?: string }> {
  const cleanName = username.trim().replace(/^@+/, '') || DEFAULT_TIKTOK_CHANNEL;
  if (!cleanName) {
    return { success: false, error: 'Vui lòng nhập tên tài khoản TikTok' };
  }

  // Also sync desired channel to Firebase so all devices & TV Box pick it up and resume
  try {
    const chanRef = ref(firebaseDb, 'rooms/hienpham_live/target_channel');
    await fbSet(chanRef, {
      channel: cleanName,
      isStopped: false,
      action: 'start',
      requestedAt: Date.now(),
      requestedBy: DEVICE_ID
    });
  } catch {}

  // List of URLs to try in priority order:
  // 1. Current configured URL (from localStorage or env)
  // 2. Default TV Box tunnel (https://caotiktok.home79.cloud)
  // 3. Current origin (relative /api/tiktok/connect)
  const candidateUrls: string[] = [];
  const primaryUrl = getApiBaseUrl();
  if (primaryUrl) candidateUrls.push(primaryUrl);
  if (!candidateUrls.includes(DEFAULT_BACKEND_URL)) candidateUrls.push(DEFAULT_BACKEND_URL);
  if (typeof window !== 'undefined' && !candidateUrls.includes('')) candidateUrls.push('');

  let lastResText = '';
  let lastErrorMsg = '';
  let successfulBaseUrl = '';
  let data: any = null;

  for (const base of candidateUrls) {
    try {
      const targetUrl = base ? `${base}/api/tiktok/connect` : '/api/tiktok/connect';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username: cleanName, syncFirebaseRoom: 'hienpham_live' }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const resText = await res.text();
      lastResText = resText;

      let parsed: any = {};
      try {
        parsed = JSON.parse(resText);
      } catch {
        // HTML error page or 404
        if (resText.trim().startsWith('<') || res.status === 404) {
          continue; // Try next URL
        }
      }

      if (res.ok && (parsed.success || parsed.username)) {
        successfulBaseUrl = base;
        data = parsed;
        break;
      } else if (parsed && parsed.error) {
        lastErrorMsg = parsed.error;
      }
    } catch (e: any) {
      console.warn(`Connect attempt failed on ${base || 'relative'}:`, e);
      lastErrorMsg = e?.message || 'Lỗi kết nối';
    }
  }

  if (!data) {
    let friendlyError = lastErrorMsg || 'Không thể kết nối máy chủ cào TikTok';
    if (friendlyError === 'Failed to fetch' || friendlyError.includes('NetworkError') || friendlyError.includes('aborted')) {
      friendlyError = `Không thể kết nối đến Máy Chủ TV Box (${primaryUrl || DEFAULT_BACKEND_URL}). Vui lòng kiểm tra TV Box có đang cắm điện/mạng hoặc bấm "Đặt lại URL mặc định" bên dưới!`;
    } else if (friendlyError.includes('is not valid JSON') || friendlyError.includes('Unexpected token') || friendlyError.includes('The page') || lastResText.trim().startsWith('<')) {
      friendlyError = `Kênh @${cleanName} hiện tại CHƯA BẬT LIVE hoặc TikTok yêu cầu xác minh. Vui lòng mở Live trên app TikTok và bấm Thử kết nối lại!`;
    }
    currentStatus.lastError = friendlyError;
    notifyStatusListeners();
    return { success: false, error: friendlyError };
  }

  const isActuallyLive = Boolean(data.isConnected && data.roomId) || (data.isConnected === true);
  currentStatus.isConnected = isActuallyLive;
  currentStatus.username = cleanName;
  currentStatus.roomId = data.roomId || null;
  currentStatus.lastError = isActuallyLive ? null : (data.lastError || `Kênh @${cleanName} hiện chưa phát live.`);
  notifyStatusListeners();

  // Save working backend
  setActiveWorkingBackendUrl(successfulBaseUrl);
  if (successfulBaseUrl && successfulBaseUrl !== primaryUrl && successfulBaseUrl === DEFAULT_BACKEND_URL) {
    try {
      localStorage.setItem('slp_backend_url', DEFAULT_BACKEND_URL);
    } catch {}
  } else if (successfulBaseUrl === '' && primaryUrl !== '') {
    console.log('[TikTok Live Client] TV Box không phản hồi, tự động dùng Máy Chủ Web Cloud tốc độ cao (0ms).');
  }

  // Save to history of connected channels
  try {
    const historyStr = localStorage.getItem('slp_tiktok_channels') || '[]';
    const history: string[] = JSON.parse(historyStr);
    const updated = [cleanName, ...history.filter((u) => u.toLowerCase() !== cleanName.toLowerCase())].slice(0, 10);
    localStorage.setItem('slp_tiktok_channels', JSON.stringify(updated));
    localStorage.setItem('slp_last_tiktok_channel', cleanName);
  } catch {}

  initTikTokEventSource();
  return { success: isActuallyLive, error: isActuallyLive ? undefined : currentStatus.lastError || undefined };
}

export async function disconnectTikTokLive(): Promise<{ success: boolean }> {
  // Sync stop signal to Firebase so TV Box and any remote nodes stop instantly
  try {
    const chanRef = ref(firebaseDb, 'rooms/hienpham_live/target_channel');
    await fbSet(chanRef, {
      channel: currentStatus.username || DEFAULT_TIKTOK_CHANNEL,
      isStopped: true,
      action: 'stop',
      requestedAt: Date.now(),
      requestedBy: DEVICE_ID
    });
  } catch {}

  const candidateUrls: string[] = [];
  const primaryUrl = getApiBaseUrl();
  if (primaryUrl) candidateUrls.push(primaryUrl);
  if (!candidateUrls.includes(DEFAULT_BACKEND_URL)) candidateUrls.push(DEFAULT_BACKEND_URL);
  if (typeof window !== 'undefined' && !candidateUrls.includes('')) candidateUrls.push('');

  for (const base of candidateUrls) {
    try {
      const targetUrl = base ? `${base}/api/tiktok/disconnect` : '/api/tiktok/disconnect';
      await fetch(targetUrl, { method: 'POST' });
    } catch (err) {
      console.warn(`Disconnect attempt failed on ${base || 'relative'}:`, err);
    }
  }

  currentStatus.isConnected = false;
  currentStatus.lastError = 'Đã dừng cào (máy chủ đang nghỉ). Bấm "Bắt đầu cào" để cào lại.';
  notifyStatusListeners();
  return { success: true };
}

export async function triggerRemoteServerUpdate(): Promise<{ success: boolean; message: string }> {
  try {
    let rawCode = '';
    let dataUrl: string | null = null;

    // 1. Cố gắng lấy mã nguồn mới nhất từ endpoint public hoặc Firebase RTDB
    try {
      const fetchLocal = await fetch('/armbian-server.cjs', { cache: 'no-store' });
      if (fetchLocal.ok) {
        const txt = await fetchLocal.text();
        if (txt && txt.includes('express') && txt.length > 5000) {
          rawCode = txt;
        }
      }
    } catch {}

    if (!rawCode) {
      try {
        const fbCodeRes = await fetch('https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/server_code/code.json');
        if (fbCodeRes.ok) {
          const txt = await fbCodeRes.json();
          if (typeof txt === 'string' && txt.includes('express') && txt.length > 5000) {
            rawCode = txt;
          }
        }
      } catch {}
    }

    if (rawCode) {
      try {
        const b64 = btoa(unescape(encodeURIComponent(rawCode)));
        dataUrl = `data:text/plain;base64,${b64}`;
      } catch {}
    }

    // 2. Gửi lệnh qua Firebase RTDB cho TV Box đang chạy nền
    const chanRef = ref(firebaseDb, 'rooms/hienpham_live/target_channel');
    await fbSet(chanRef, {
      action: 'update',
      isUpdating: true,
      updateUrl: dataUrl,
      requestedAt: Date.now(),
      requestedBy: DEVICE_ID
    });

    // 3. Gửi lệnh trực tiếp tới TV Box qua Cloudflare Tunnel (caotiktok.home79.cloud)
    const candidateUrls: string[] = [];
    const primaryUrl = getApiBaseUrl();
    if (primaryUrl) candidateUrls.push(primaryUrl);
    if (!candidateUrls.includes(DEFAULT_BACKEND_URL)) candidateUrls.push(DEFAULT_BACKEND_URL);
    if (typeof window !== 'undefined' && !candidateUrls.includes('')) candidateUrls.push('');

    let successMsg = '';
    for (const base of candidateUrls) {
      // Cách 1: Thử đẩy trực tiếp mã nguồn qua /api/server/deploy
      if (rawCode) {
        try {
          const deployTarget = base ? `${base}/api/server/deploy` : '/api/server/deploy';
          const deployRes = await fetch(deployTarget, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: rawCode })
          });
          if (deployRes.ok) {
            const data = await deployRes.json();
            if (data && (data.success || data.updated)) {
              successMsg = data.message || 'Đã nạp mã nguồn mới và TV Box đang tự khởi động lại!';
              break;
            }
          }
        } catch {}
      }

      // Cách 2: Gọi /api/server/update với updateUrl
      try {
        const targetUrl = base ? `${base}/api/server/update` : '/api/server/update';
        const updateRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updateUrl: dataUrl })
        });
        if (updateRes.ok) {
          const data = await updateRes.json();
          if (data && (data.success || data.updated)) {
            successMsg = data.message || 'Đã gửi lệnh cập nhật thành công!';
            break;
          }
        }
      } catch {}
    }

    return {
      success: true,
      message: successMsg || 'Đã gửi lệnh cập nhật từ xa tới TV Box! TV Box sẽ tự khởi động lại trong vài giây.'
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi gửi lệnh cập nhật' };
  }
}

export function initTikTokEventSource() {
  if (eventSource) {
    return;
  }

  try {
    const baseUrl = getActiveApiBaseUrl();
    eventSource = new EventSource(baseUrl ? `${baseUrl}/api/tiktok/stream` : '/api/tiktok/stream');

    eventSource.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        currentStatus = { ...currentStatus, ...data };
        notifyStatusListeners();
      } catch {}
    });

    eventSource.addEventListener('viewers', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.viewerCount > 0) {
          currentStatus.viewerCount = data.viewerCount;
          notifyStatusListeners();
        }
      } catch {}
    });

    eventSource.addEventListener('like', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.totalLikes) {
          currentStatus.totalLikesCount = data.totalLikes;
        } else {
          currentStatus.totalLikesCount += (data.likeCount || 1);
        }
        notifyStatusListeners();
        likeListeners.forEach((fn) => {
          try {
            fn(data);
          } catch {}
        });
      } catch {}
    });

    eventSource.addEventListener('error', (e: any) => {
      if (e.data) {
        try {
          const parsed = JSON.parse(e.data);
          currentStatus.lastError = parsed.error || 'Lỗi cào dữ liệu TikTok';
          notifyStatusListeners();
        } catch {}
      }
    });

    eventSource.addEventListener('clear_comments', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const clearedAt = parsed.clearedAt || Date.now();
        try {
          localStorage.setItem('slp_feed_cleared_at_tiktok', String(clearedAt));
        } catch {}
        const state = useStore.getState();
        useStore.setState({
          tiktok: {
            ...state.tiktok,
            comments: [],
            lastCommentsAt: clearedAt
          }
        });
      } catch {}
    });

    // Lắng nghe lệnh Auto F5 từ các thiết bị khác hoặc khi Live lại
    eventSource.addEventListener('reload_browser', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[TikTok Live] 🔄 Nhận được tín hiệu Auto F5:', data);
        window.dispatchEvent(new CustomEvent('tiktok_live_reload_browser', { detail: data }));
      } catch {}
    });

    const handleCommentMessage = (e: MessageEvent) => {
      try {
        const item = JSON.parse(e.data);
        if (!item) return;
        const itemTs = item.ts || Date.now();
        const effectiveClearedAt = Number(localStorage.getItem('slp_feed_cleared_at_tiktok')) || 0;
        if (effectiveClearedAt > 0 && itemTs <= effectiveClearedAt) {
          return; // Bỏ qua cmt phiên live trước
        }

        const rawContent = item.content || item.comment || item.text || item.msg || '';
        if (!rawContent) return;

        const rawUser = item.user || item.nickname || item.uniqueId || 'Khách';
        const cleanUser = normalizeUser(rawUser);
        const cleanContent = typeof rawContent === 'object' ? JSON.stringify(rawContent) : String(rawContent || '');
        const cleanAvatar = item.avatar || (typeof item.user === 'object' && ((item.user as any).profilePictureUrl || (item.user as any).avatarThumb?.urlList?.[0])) || '';

        const rawId = item.id ? String(item.id) : `tt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const comment: CommentData = {
          id: rawId,
          user: cleanUser,
          content: cleanContent,
          time: item.time || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          avatar: cleanAvatar,
          ts: itemTs,
          platform: 'tiktok',
        };

        // Add to store comments in real time
        const state = useStore.getState();
        const currentComments = (state.tiktok.comments || []).filter(c => !effectiveClearedAt || (c.ts || 0) > effectiveClearedAt);
        
        // Avoid duplicates if already present by id or by user+content signature
        const timeBucket = Math.floor(itemTs / 3500);
        const incomingSig = `${cleanUser.toLowerCase()}_${cleanContent.toLowerCase()}_${timeBucket}`;
        
        const isDuplicate = currentComments.some((c) => {
          if (String(c.id) === rawId) return true;
          const cBucket = Math.floor((c.ts || 0) / 3500);
          const cSig = `${normalizeUser(c.user).toLowerCase()}_${String(c.content || '').trim().toLowerCase()}_${cBucket}`;
          return cSig === incomingSig;
        });

        if (!isDuplicate) {
          const newComments = [comment, ...currentComments].slice(0, 250);
          useStore.setState({
            tiktok: {
              ...state.tiktok,
              comments: newComments,
              lastCommentsAt: Date.now(),
            },
          });
        }
      } catch (err) {
        console.error('Error handling TikTok chat event:', err);
      }
    };

    eventSource.addEventListener('chat', handleCommentMessage);
    eventSource.addEventListener('comment', handleCommentMessage);

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      clearTimeout(reconnectTimer);
      // Nếu máy chủ ngoài (TV Box / tunnel) bị lỗi hoặc 502, tự động fallback sang Máy Chủ Web Cloud ("")
      const currentUrl = getActiveApiBaseUrl();
      if (currentUrl && currentUrl !== '') {
        console.warn(`[TikTok Live Client] SSE mất kết nối tới ${currentUrl}. Tự động chuyển về Máy Chủ Web Cloud...`);
        setActiveWorkingBackendUrl('');
        reconnectTimer = setTimeout(() => {
          initTikTokEventSource();
        }, 1500);
      } else {
        reconnectTimer = setTimeout(() => {
          initTikTokEventSource();
        }, 5000);
      }
    };
  } catch (err) {
    console.error('Failed to init TikTok EventSource:', err);
  }
}

// 0ms Direct Browser Live Scraper Listener (BroadcastChannel + LocalStorage)
try {
  if (typeof BroadcastChannel !== 'undefined') {
    const liveBc = new BroadcastChannel('tiktok_live_direct_feed');
    liveBc.onmessage = (ev) => {
      if (ev.data && (ev.data.content || ev.data.comment || ev.data.text)) {
        const item = ev.data;
        const rawContent = item.content || item.comment || item.text || '';
        const rawUser = item.user || item.nickname || item.uniqueId || 'Khách';
        const cleanUser = normalizeUser(rawUser);
        const cleanContent = typeof rawContent === 'object' ? JSON.stringify(rawContent) : String(rawContent || '');
        const cleanAvatar = item.avatar || '';
        const itemTs = item.ts || Date.now();
        const effectiveClearedAt = Number(localStorage.getItem('slp_feed_cleared_at_tiktok')) || 0;
        if (effectiveClearedAt > 0 && itemTs <= effectiveClearedAt) return;

        const rawId = item.id ? String(item.id) : `tt_direct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        if (cleanAvatar) {
          registerCustomerAvatar(cleanUser, cleanAvatar, 'tiktok');
        }
        const comment: CommentData = {
          id: rawId,
          user: cleanUser,
          content: cleanContent,
          time: item.time || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          avatar: cleanAvatar,
          ts: itemTs,
          platform: 'tiktok',
        };

        const state = useStore.getState();
        const currentComments = (state.tiktok.comments || []).filter(c => !effectiveClearedAt || (c.ts || 0) > effectiveClearedAt);
        const timeBucket = Math.floor(itemTs / 3500);
        const incomingSig = `${cleanUser.toLowerCase()}_${cleanContent.toLowerCase()}_${timeBucket}`;
        
        const isDuplicate = currentComments.some((c) => {
          if (String(c.id) === rawId) return true;
          const cBucket = Math.floor((c.ts || 0) / 3500);
          const cSig = `${normalizeUser(c.user).toLowerCase()}_${String(c.content || '').trim().toLowerCase()}_${cBucket}`;
          return cSig === incomingSig;
        });

        if (!isDuplicate) {
          useStore.setState({
            tiktok: {
              ...state.tiktok,
              comments: [comment, ...currentComments].slice(0, 250),
              lastCommentsAt: Date.now(),
            },
          });
        }
      }
    };
  }
} catch (e) {}

window.addEventListener('storage', (e) => {
  if (e.key === 'slp_direct_comment_tiktok' && e.newValue) {
    try {
      const item = JSON.parse(e.newValue);
      if (item && (item.content || item.comment)) {
        const rawContent = item.content || item.comment || item.text || '';
        const rawUser = item.user || item.nickname || item.uniqueId || 'Khách';
        const cleanUser = normalizeUser(rawUser);
        const cleanContent = typeof rawContent === 'object' ? JSON.stringify(rawContent) : String(rawContent || '');
        const cleanAvatar = item.avatar || '';
        const itemTs = item.ts || Date.now();
        const effectiveClearedAt = Number(localStorage.getItem('slp_feed_cleared_at_tiktok')) || 0;
        if (effectiveClearedAt > 0 && itemTs <= effectiveClearedAt) return;

        if (cleanAvatar) {
          registerCustomerAvatar(cleanUser, cleanAvatar, 'tiktok');
        }
        const rawId = item.id ? String(item.id) : `tt_direct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const comment: CommentData = {
          id: rawId,
          user: cleanUser,
          content: cleanContent,
          time: item.time || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          avatar: cleanAvatar,
          ts: itemTs,
          platform: 'tiktok',
        };

        const state = useStore.getState();
        const currentComments = (state.tiktok.comments || []).filter(c => !effectiveClearedAt || (c.ts || 0) > effectiveClearedAt);
        const timeBucket = Math.floor(itemTs / 3500);
        const incomingSig = `${cleanUser.toLowerCase()}_${cleanContent.toLowerCase()}_${timeBucket}`;
        
        const isDuplicate = currentComments.some((c) => {
          if (String(c.id) === rawId) return true;
          const cBucket = Math.floor((c.ts || 0) / 3500);
          const cSig = `${normalizeUser(c.user).toLowerCase()}_${String(c.content || '').trim().toLowerCase()}_${cBucket}`;
          return cSig === incomingSig;
        });

        if (!isDuplicate) {
          useStore.setState({
            tiktok: {
              ...state.tiktok,
              comments: [comment, ...currentComments].slice(0, 250),
              lastCommentsAt: Date.now(),
            },
          });
        }
      }
    } catch (err) {}
  }
});

/**
 * Gửi lệnh Auto F5 đến tất cả các trình duyệt đang chạy bot CMT hoặc tab livestream
 */
export async function triggerRemoteBrowserReload(platform: string = 'tiktok', reason: string = 'live_restart'): Promise<{ success: boolean; message: string }> {
  try {
    const store = useStore.getState();
    const targetPlatform = (platform === 'facebook' || platform === 'shopee' ? platform : 'tiktok') as any;
    await store.refreshPlatform(targetPlatform);
    return {
      success: true,
      message: 'Đã gửi lệnh Auto F5 thành công tới các trình duyệt đang chạy CMT!'
    };
  } catch (e: any) {
    return {
      success: false,
      message: e?.message || 'Không thể gửi lệnh F5'
    };
  }
}

