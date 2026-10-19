import compression from "compression";
import express from "express";
import path from "path";
import fs from "fs";
import net from "net";
import { exec } from "child_process";
import { TikTokLiveConnection } from "tiktok-live-connector";

process.on("uncaughtException", (err) => {
  const msg = err && err.message ? err.message : String(err);
  console.error("🛡️ [Server Anti-Crash] Đã chặn lỗi Uncaught Exception:", msg);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason && (reason as any).message ? (reason as any).message : String(reason);
  console.error("🛡️ [Server Anti-Crash] Đã chặn lỗi Unhandled Rejection:", msg);
});

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(compression());
app.use(express.json());

// Chuẩn hóa req.url khi chạy trên Vercel Serverless Function
app.use((req, _res, next) => {
  if (req.query && req.query.__route) {
    const rawRoute = Array.isArray(req.query.__route) ? req.query.__route.join('/') : String(req.query.__route);
    const queryIdx = req.url ? req.url.indexOf('?') : -1;
    const queryPart = queryIdx !== -1 ? req.url.slice(queryIdx) : '';
    req.url = `/api/${rawRoute}${queryPart}`;
  }
  next();
});

interface SSEClient {
  id: string;
  res: express.Response;
}

interface TikTokLiveState {
  isConnected: boolean;
  isStopped?: boolean;
  username: string;
  roomId: string | null;
  viewerCount: number;
  totalCommentsCount: number;
  connectedAt: number | null;
  lastError: string | null;
}

let activeTikTokConnection: any = null;
let currentTikTokState: TikTokLiveState = {
  isConnected: false,
  isStopped: false,
  username: "",
  roomId: null,
  viewerCount: 0,
  totalCommentsCount: 0,
  connectedAt: null,
  lastError: null,
};

let sseClients: SSEClient[] = [];
let recentComments: any[] = [];

// Helper to broadcast SSE event to all connected web clients
function broadcastSSE(eventType: string, data: any) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(payload);
    } catch (err) {
      console.error(`Failed to send SSE to client ${client.id}`, err);
    }
  });
}

// Lưu trữ chu kỳ 24h từ lúc mở phiên live đầu tiên trong ngày
let serverLiveCycleStartedAt: number = 0;
let serverFeedClearedAt: number = 0;

// Helper to verify if comment timestamp is within the 24-hour active cycle
const isTsWithin24h = (ts: number): boolean => {
  if (!ts) return false;
  const now = Date.now();
  // 1. Bình luận trong vòng 24 giờ qua
  if (now - ts > 24 * 60 * 60 * 1000) return false;
  // 2. Không được cũ hơn thời điểm chủ shop chủ động bấm xoá feed
  if (serverFeedClearedAt > 0 && ts <= serverFeedClearedAt) return false;
  return true;
};

// Tự động kiểm tra chu kỳ 24h tính từ phiên live đầu tiên (ví dụ 13h hôm nay -> 13h hôm sau)
setInterval(() => {
  const now = Date.now();
  // Nếu đã có phiên live và đã trôi qua đúng 24h kể từ phiên live đầu tiên
  if (serverLiveCycleStartedAt > 0 && (now - serverLiveCycleStartedAt) >= 24 * 60 * 60 * 1000) {
    // Chỉ tự động xoá nếu trong 30 phút qua không có cmt mới (tránh ngắt phiên đang live dở)
    const lastCommentTs = recentComments[0]?.ts || 0;
    if (now - lastCommentTs > 30 * 60 * 1000) {
      console.log(`[Server] Đã đủ 24h kể từ phiên live đầu tiên (${new Date(serverLiveCycleStartedAt).toLocaleString('vi-VN')}), tự động làm sạch bình luận để đón phiên ngày mới.`);
      serverLiveCycleStartedAt = 0;
      serverFeedClearedAt = now;
      recentComments.length = 0;
      if (currentTikTokState) {
        currentTikTokState.totalCommentsCount = 0;
        broadcastSSE("status", currentTikTokState);
      }
      broadcastSSE("clear_comments", { clearedAt: serverFeedClearedAt, reason: "24h_cycle_expired" });
      const firebaseUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app";
      fetch(`${firebaseUrl}/rooms/hienpham_live/comments.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [],
          updatedAt: serverFeedClearedAt,
          clearedAt: serverFeedClearedAt,
          deviceId: 'server_24h_cleanup'
        })
      }).catch(() => {});
    }
  }
}, 30000);

let serverPendingComments: any[] = [];
let syncServerDebounceTimer: any = null;
let isInitialFirebaseLoaded = false;

// Pre-load current comments from Firebase once on startup
async function initServerCommentsCache(room: string = "hienpham_live") {
  if (isInitialFirebaseLoaded) return;
  try {
    const firebaseUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app";
    const res = await fetch(`${firebaseUrl}/rooms/${room}/comments.json`);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        serverPendingComments = json.data.slice(0, 300);
      }
      if (json && json.clearedAt) {
        serverFeedClearedAt = Math.max(serverFeedClearedAt, Number(json.clearedAt) || 0);
      }
    }
    isInitialFirebaseLoaded = true;
  } catch (err) {
    console.warn("[Server] Không thể tải cache bình luận ban đầu từ Firebase:", err);
  }
}

// Khởi tạo cache ngầm sau 2 giây
setTimeout(() => initServerCommentsCache("hienpham_live"), 2000);

function syncCommentToFirebase(commentObj: any, room: string = "hienpham_live") {
  const commentTs = commentObj.ts || Date.now();
  const effectiveClearedAt = serverFeedClearedAt;
  if (effectiveClearedAt > 0 && commentTs <= effectiveClearedAt) {
    return; // Bỏ qua bình luận thuộc phiên live cũ đã xoá feed
  }

  if (!serverLiveCycleStartedAt) {
    serverLiveCycleStartedAt = commentTs || Date.now();
  }

  const idStr = String(commentObj.id || `tt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
  const cleanUser = String(commentObj.user || '').trim().toLowerCase();
  const cleanText = String(commentObj.content || commentObj.comment || '').trim().toLowerCase();
  const timeBucket = Math.floor(commentTs / 3500);
  const sig = `${cleanUser}_${cleanText}_${timeBucket}`;

  // Kiểm tra trùng lặp nhanh trong bộ nhớ
  const isDup = serverPendingComments.some(item => {
    if (!item) return false;
    if (String(item.id) === idStr) return true;
    const itemTs = item.ts || 0;
    const itemBucket = Math.floor(itemTs / 3500);
    const itemUser = String(item.user || '').trim().toLowerCase();
    const itemText = String(item.content || item.comment || '').trim().toLowerCase();
    return `${itemUser}_${itemText}_${itemBucket}` === sig;
  });

  if (!isDup) {
    const newEntry = {
      id: idStr,
      user: commentObj.user,
      uniqueId: commentObj.uniqueId || commentObj.user,
      content: commentObj.content,
      time: commentObj.time,
      avatar: commentObj.avatar || '',
      ts: commentTs,
      platform: 'tiktok'
    };
    serverPendingComments.unshift(newEntry);
    if (serverPendingComments.length > 500) {
      serverPendingComments.length = 500;
    }
  }

  // Gom nhóm đẩy Firebase theo lô (Batch Debounce 120ms) - Tốc độ siêu tốc, không nghẽn mạng!
  if (!syncServerDebounceTimer) {
    syncServerDebounceTimer = setTimeout(async () => {
      syncServerDebounceTimer = null;
      try {
        const firebaseUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app";
        const trimmed = serverPendingComments
          .filter(item => {
            if (!item || !item.id) return false;
            const itemTs = item.ts || 0;
            if (itemTs && !isTsWithin24h(itemTs)) return false;
            if (serverFeedClearedAt > 0 && itemTs <= serverFeedClearedAt) return false;
            return true;
          })
          .slice(0, 300);

        await fetch(`${firebaseUrl}/rooms/${room}/comments.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: trimmed,
            updatedAt: Date.now(),
            clearedAt: serverFeedClearedAt,
            deviceId: 'cloud_server_daemon'
          })
        });
      } catch (err: any) {
        console.warn("[Server] Lỗi khi sync bình luận lên Firebase:", err?.message || err);
      }
    }, 120);
  }
}

// Clean username helper (removes @, URLs, trailing slashes)
function cleanTikTokUsername(input: string): string {
  if (!input) return "";
  let clean = input.trim();
  clean = clean.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '');
  clean = clean.replace(/\/live.*$/i, '');
  clean = clean.replace(/^@+/, '');
  clean = clean.split('/')[0].split('?')[0].trim();
  return clean;
}

// Disconnect TikTok Live helper
async function disconnectActiveTikTok() {
  if (activeTikTokConnection) {
    try {
      if (typeof activeTikTokConnection.removeAllListeners === 'function') {
        activeTikTokConnection.removeAllListeners();
      }
      activeTikTokConnection.disconnect();
    } catch (e) {
      console.warn("Error disconnecting active TikTok connection:", e);
    }
    activeTikTokConnection = null;
  }
  currentTikTokState = {
    isConnected: false,
    isStopped: true,
    username: currentTikTokState.username || "",
    roomId: null,
    viewerCount: 0,
    totalCommentsCount: 0,
    connectedAt: null,
    lastError: "Đã dừng cào (máy chủ đang nghỉ). Bấm 'Bắt đầu cào' để cào lại.",
  };
  broadcastSSE("status", currentTikTokState);
}

// Setup TikTok Live Connection
async function connectToTikTokLive(username: string, syncFirebaseRoom: string = "hienpham_live") {
  const targetUser = cleanTikTokUsername(username);
  if (!targetUser) {
    throw new Error("Tên tài khoản TikTok không hợp lệ");
  }

  // Disconnect existing if any
  if (activeTikTokConnection) {
    await disconnectActiveTikTok();
  }

  // If changing channel, reset comments
  if (currentTikTokState.username && currentTikTokState.username.toLowerCase() !== targetUser.toLowerCase()) {
    recentComments.length = 0;
  }

  console.log(`[TikTok Live] Đang kết nối tới kênh @${targetUser}...`);
  currentTikTokState = {
    isConnected: false,
    isStopped: false,
    username: targetUser,
    roomId: null,
    viewerCount: 0,
    totalCommentsCount: 0,
    connectedAt: Date.now(),
    lastError: null,
  };
  broadcastSSE("status", currentTikTokState);

  const connection: any = new (TikTokLiveConnection as any)(targetUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false,
    clientParams: {
      app_language: "vi-VN",
      webcast_language: "vi-VN"
    },
    requestHeaders: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
  });

  activeTikTokConnection = connection;

  connection.on("connected", (state: any) => {
    console.log(`[TikTok Live] ✅ Đã kết nối thành công tới @${targetUser} (Room ID: ${state?.roomId || 'N/A'})`);
    currentTikTokState.isConnected = true;
    currentTikTokState.roomId = state?.roomId ? String(state.roomId) : null;
    currentTikTokState.lastError = null;
    broadcastSSE("status", currentTikTokState);
    broadcastSSE("system", {
      type: "connected",
      message: `Đã kết nối thành công phòng Live của @${targetUser}`,
      timestamp: Date.now()
    });
  });

  connection.on("disconnected", () => {
    console.log(`[TikTok Live] ⚠️ Đã ngắt kết nối với @${targetUser}`);
    currentTikTokState.isConnected = false;
    broadcastSSE("status", currentTikTokState);
    broadcastSSE("system", {
      type: "disconnected",
      message: `Đã ngắt kết nối với @${targetUser}`,
      timestamp: Date.now()
    });
  });

  connection.on("streamEnd", () => {
    console.log(`[TikTok Live] 🔴 Phiên Live của @${targetUser} đã kết thúc.`);
    currentTikTokState.isConnected = false;
    broadcastSSE("status", currentTikTokState);
    broadcastSSE("system", {
      type: "streamEnd",
      message: `Phiên Live của @${targetUser} đã kết thúc`,
      timestamp: Date.now()
    });
  });

  connection.on("roomUser", (data: any) => {
    if (data) {
      const count = typeof data.viewerCount === 'number' 
        ? data.viewerCount 
        : (Number(data.totalUser) || Number(data.total) || 0);
      if (count > 0) {
        currentTikTokState.viewerCount = count;
        broadcastSSE("viewers", { viewerCount: count });
      }
    }
  });

  connection.on("like", (data: any) => {
    if (data) {
      const totalLikes = Number(data.totalLikeCount) || Number(data.total) || 0;
      const likeCount = Number(data.likeCount) || 1;
      const user = data.user?.nickname || data.nickname || "Khách";
      broadcastSSE("like", {
        user,
        likeCount,
        totalLikes,
        timestamp: Date.now()
      });
    }
  });

  connection.on("chat", async (data: any) => {
    const commentText = (data.content || data.comment || data.text || "").trim();
    if (!commentText) return;

    const displayName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || "TikTok_User";
    const uniqueId = data.user?.displayId || data.uniqueId || displayName;
    const avatarUrl = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || "";
    const commentId = data.common?.msgId 
      ? String(data.common.msgId) 
      : (data.msgId ? String(data.msgId) : `tt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const commentPayload = {
      id: commentId,
      user: displayName,
      uniqueId: uniqueId,
      content: commentText,
      time: timeStr,
      avatar: avatarUrl,
      ts: Date.now(),
      platform: "tiktok"
    };

    currentTikTokState.totalCommentsCount += 1;
    recentComments.unshift(commentPayload);
    if (recentComments.length > 200) recentComments.pop();

    // Broadcast in real-time to all open web sessions
    broadcastSSE("chat", commentPayload);

    // Sync to Firebase for cross-device & print server
    if (syncFirebaseRoom) {
      syncCommentToFirebase(commentPayload, syncFirebaseRoom);
    }
  });

  connection.on("error", (err: any) => {
    const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    console.warn(`[TikTok Live Warning @${targetUser}]:`, errMsg);
    currentTikTokState.lastError = errMsg;
    broadcastSSE("error", { error: errMsg });
  });

  try {
    let isLive = true;
    try {
      isLive = await connection.fetchIsLive();
    } catch (e: any) {
      const fetchErrMsg = e?.message || String(e || "");
      if (fetchErrMsg.includes("retry-after") || fetchErrMsg.includes("RateLimit") || fetchErrMsg.includes("Too many")) {
        throw e;
      }
      isLive = true;
    }

    if (!isLive) {
      const offlineMsg = `Kênh @${targetUser} hiện CHƯA BẬT LIVE trên TikTok. Hãy mở phát trực tiếp trên ứng dụng TikTok rồi thử lại.`;
      console.log(`[TikTok Live Info @${targetUser}]: Kênh chưa phát Live.`);
      currentTikTokState.isConnected = false;
      currentTikTokState.lastError = offlineMsg;
      broadcastSSE("status", currentTikTokState);
      return {
        success: false,
        isOffline: true,
        username: targetUser,
        error: offlineMsg
      };
    }

    const state = await connection.connect();
    currentTikTokState.isConnected = true;
    currentTikTokState.roomId = state?.roomId ? String(state.roomId) : null;
    currentTikTokState.lastError = null;
    broadcastSSE("status", currentTikTokState);
    return {
      success: true,
      isConnected: true,
      username: targetUser,
      roomId: currentTikTokState.roomId,
      state: currentTikTokState
    };
  } catch (err: any) {
    const rawMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err || ""));
    console.warn(`[TikTok Live Info @${targetUser}]:`, rawMsg);

    // Humanize technical TikTok API errors into clear Vietnamese guidance
    let friendlyMsg = "Không thể kết nối phòng Live. Vui lòng kiểm tra lại tên kênh và đảm bảo kênh đang phát trực tiếp.";
    if (rawMsg.includes("Empty Cookies") || rawMsg.includes("fetchSignedWebSocketFromEulerRoute") || rawMsg.includes("sign server") || rawMsg.includes("Signature")) {
      friendlyMsg = "Máy chủ chữ ký TikTok đang tải lại. (Bình luận vẫn được thu thập trực tiếp qua Tampermonkey).";
    } else if (rawMsg.includes("retry-after") || rawMsg.includes("RateLimit") || rawMsg.includes("Too many connections") || rawMsg.includes("SignatureRateLimitError") || rawMsg.includes("reading 'retry-after'")) {
      friendlyMsg = `TikTok đang tạm giới hạn kết nối (Rate Limit). Vui lòng đợi 30 giây rồi thử lại.`;
    } else if (rawMsg.includes("Unexpected server response: 200") || rawMsg.includes("is not valid JSON") || rawMsg.includes("Unexpected token") || rawMsg.includes("The page")) {
      friendlyMsg = `Kênh @${targetUser} hiện tại CHƯA BẬT LIVE hoặc vừa kết thúc Live. Vui lòng mở Live trên ứng dụng TikTok và thử lại!`;
    } else if (rawMsg.includes("LIVE_NOT_FOUND") || rawMsg.includes("not live") || rawMsg.includes("offline") || rawMsg.includes("room not found")) {
      friendlyMsg = `Kênh @${targetUser} hiện đang không phát Live trực tiếp.`;
    } else if (rawMsg.includes("USER_NOT_FOUND") || rawMsg.includes("User not found")) {
      friendlyMsg = `Không tìm thấy tài khoản TikTok @${targetUser}. Vui lòng kiểm tra lại ID kênh.`;
    } else if (rawMsg.includes("ETIMEDOUT") || rawMsg.includes("ECONNRESET") || rawMsg.includes("fetch failed") || rawMsg.includes("timeout")) {
      friendlyMsg = "Mất kết nối tới máy chủ TikTok. Vui lòng thử lại sau vài giây.";
    } else if (rawMsg) {
      friendlyMsg = rawMsg;
    }

    currentTikTokState.isConnected = false;
    currentTikTokState.roomId = null;
    currentTikTokState.lastError = friendlyMsg;
    broadcastSSE("status", currentTikTokState);
    return {
      success: false,
      isOffline: true,
      username: targetUser,
      error: friendlyMsg
    };
  }
}

// ==========================================
// BACKGROUND CLOUD COORDINATOR (Tự động kết nối & Duy trì cào 24/7)
// ==========================================
let lastHandledCloudRequestTime = 0;
let lastCloudAttemptTime = 0;

setInterval(async () => {
  try {
    const firebaseUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app";
    
    // 1. Gửi Heartbeat lên Firebase để máy in & các client biết Máy Chủ Cloud đang hoạt động
    try {
      await fetch(`${firebaseUrl}/rooms/hienpham_live/crawler_master.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeDeviceId: "cloud_server_node",
          activeDeviceName: "☁️ Máy Chủ Web Cloud (0ms)",
          masterDeviceId: "cloud_server_node",
          masterDeviceName: "☁️ Máy Chủ Web Cloud (0ms)",
          channel: currentTikTokState.username || "hienpham.965286096",
          isConnected: currentTikTokState.isConnected,
          isStopped: !!currentTikTokState.isStopped,
          roomId: currentTikTokState.roomId,
          viewerCount: currentTikTokState.viewerCount,
          totalCommentsCount: currentTikTokState.totalCommentsCount,
          lastHeartbeat: Date.now(),
          status: currentTikTokState.isStopped ? "stopped" : (currentTikTokState.isConnected ? "active" : "standby"),
          lastError: currentTikTokState.lastError
        })
      });
    } catch {}

    // 2. Đọc kênh mục tiêu và lệnh điều khiển từ Firebase
    const res = await fetch(`${firebaseUrl}/rooms/hienpham_live/target_channel.json`);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        const reqTime = Number(data.requestedAt) || 0;

        // Xử lý lệnh xoá feed
        if (data.action === "clear_feed" || data.action === "clear_comments" || (data.clearedAt && Number(data.clearedAt) > serverFeedClearedAt)) {
          const clearTs = Number(data.clearedAt || data.requestedAt) || Date.now();
          if (clearTs > serverFeedClearedAt) {
            serverFeedClearedAt = clearTs;
            console.log("=> 🧹 [Cloud Server] Nhận lệnh XOÁ FEED qua Firebase:", clearTs);
            recentComments.length = 0;
            serverPendingComments = [];
            currentTikTokState.totalCommentsCount = 0;
            broadcastSSE("status", currentTikTokState);
            broadcastSSE("clear_comments", { clearedAt: clearTs });
          }
        }

        // Xử lý lệnh dừng
        if (data.isStopped === true || data.action === "stop") {
          if (reqTime > lastHandledCloudRequestTime && !currentTikTokState.isStopped) {
            console.log("=> 🛑 [Cloud Server] Nhận lệnh DỪNG CÀO từ Firebase");
            lastHandledCloudRequestTime = reqTime;
            disconnectActiveTikTok();
            return;
          }
        }

        // Tự động kết nối nếu đang có live và chưa kết nối
        const targetChannel = data.channel || data.username || "hienpham.965286096";
        const now = Date.now();
        if (targetChannel && !currentTikTokState.isStopped && (!activeTikTokConnection || !currentTikTokState.isConnected)) {
          if (now - lastCloudAttemptTime > 15000) {
            lastCloudAttemptTime = now;
            console.log(`=> 🚀 [Cloud Server] Tự động kết nối TikTok Live cho kênh @${targetChannel}...`);
            connectToTikTokLive(targetChannel, "hienpham_live").catch(err => {
              console.warn("[Cloud Server] Tự động kết nối chưa thành công:", err?.message || err);
            });
          }
        }
      }
    }
  } catch (err: any) {
    // Ignored
  }
}, 8000);

// API Routes & Health Checks
app.get(["/api/health", "/healthz", "/_health", "/health"], (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});

// TV Box Armbian 1-click script downloader
app.get("/armbian-server.cjs", (_req, res) => {
  const filePath = path.join(process.cwd(), "public", "armbian-server.cjs");
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    return res.sendFile(filePath);
  }
  res.status(404).send("// armbian-server.cjs not found");
});

app.get("/api/tiktok/status", (_req, res) => {
  const filteredComments = recentComments.filter(c => !serverFeedClearedAt || (c.ts || 0) > serverFeedClearedAt);
  res.json({
    ...currentTikTokState,
    recentComments: filteredComments.slice(0, 30),
    clearedAt: serverFeedClearedAt,
    activeClientsCount: sseClients.length
  });
});

const handleClearFeed = async (req: express.Request, res: express.Response) => {
  const reqClearedAt = Number(req.body?.clearedAt) || Date.now();
  serverFeedClearedAt = Math.max(serverFeedClearedAt, reqClearedAt);
  serverLiveCycleStartedAt = Date.now();
  recentComments.length = 0;
  currentTikTokState.totalCommentsCount = 0;
  broadcastSSE("status", currentTikTokState);
  broadcastSSE("clear_comments", { clearedAt: serverFeedClearedAt });

  // Xoá sạch toàn bộ comments trên Firebase RTDB cho tất cả các phòng live
  try {
    const firebaseUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app";
    await Promise.all([
      fetch(`${firebaseUrl}/rooms/hienpham_live/comments.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [], updatedAt: serverFeedClearedAt, clearedAt: serverFeedClearedAt, deviceId: 'server_clear' })
      }),
      fetch(`${firebaseUrl}/rooms/hienpham_live_fb/comments.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [], updatedAt: serverFeedClearedAt, clearedAt: serverFeedClearedAt, deviceId: 'server_clear' })
      }),
      fetch(`${firebaseUrl}/rooms/hienpham_live_shopee/comments.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [], updatedAt: serverFeedClearedAt, clearedAt: serverFeedClearedAt, deviceId: 'server_clear' })
      }),
      fetch(`${firebaseUrl}/rooms/hienpham_live/cleared_at.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearedAt: serverFeedClearedAt, updatedAt: serverFeedClearedAt, deviceId: 'server_clear' })
      }),
      fetch(`${firebaseUrl}/rooms/hienpham_live_fb/cleared_at.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearedAt: serverFeedClearedAt, updatedAt: serverFeedClearedAt, deviceId: 'server_clear' })
      }),
      fetch(`${firebaseUrl}/rooms/hienpham_live/target_channel.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_feed', clearedAt: serverFeedClearedAt, requestedAt: serverFeedClearedAt })
      }),
      fetch(`${firebaseUrl}/rooms/hienpham_live_fb/target_channel.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_feed', clearedAt: serverFeedClearedAt, requestedAt: serverFeedClearedAt })
      })
    ]);
  } catch (err) {
    console.warn("Failed to clear Firebase comments in API:", err);
  }

  res.json({ success: true, clearedAt: serverFeedClearedAt });
};

app.post("/api/tiktok/clear-comments", handleClearFeed);
app.post("/api/facebook/clear-comments", handleClearFeed);

app.post("/api/tiktok/connect", async (req, res) => {
  const { username, syncFirebaseRoom = "hienpham_live" } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, error: "Vui lòng nhập tên tài khoản TikTok" });
  }

  try {
    const result = await connectToTikTokLive(username, syncFirebaseRoom);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Lỗi kết nối TikTok Live" });
  }
});

app.post("/api/tiktok/disconnect", async (_req, res) => {
  try {
    await disconnectActiveTikTok();
    return res.json({ success: true, message: "Đã ngắt kết nối TikTok Live" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Lỗi khi ngắt kết nối" });
  }
});

// Gửi lệnh Auto F5 đến tất cả các trình duyệt đang chạy bot cmt / tab livestream
app.post("/api/tiktok/reload-browser", (req, res) => {
  const { commandId = `cmd_f5_${Date.now()}`, reason = "live_restart" } = req.body || {};
  console.log(`[TikTok Live] 🔄 Phát lệnh Auto F5 tới tất cả trình duyệt cmt (Lý do: ${reason})`);
  broadcastSSE("reload_browser", {
    commandId,
    reason,
    timestamp: Date.now()
  });
  return res.json({ success: true, commandId, message: "Đã phát lệnh Auto F5 tới các trình duyệt chạy CMT thành công!" });
});

// Server-Sent Events (SSE) stream for real-time live comments
app.get("/api/tiktok/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  // Send initial state & recent comments
  res.write(`event: status\ndata: ${JSON.stringify(currentTikTokState)}\n\n`);
  if (recentComments.length > 0) {
    res.write(`event: initial_comments\ndata: ${JSON.stringify(recentComments.slice(0, 50))}\n\n`);
  }

  // Heartbeat keep-alive every 15 seconds
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeatTimer);
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

app.post("/api/facebook/resolve-url", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.json({ videoId: null, pageId: null, resolvedUrl: url });
    let str = String(url).trim();

    if (/^\d{10,25}$/.test(str)) {
      return res.json({ videoId: str, pageId: null, resolvedUrl: str });
    }

    if (str.includes("/share/") || str.includes("fb.watch") || str.includes("/sharer/")) {
      try {
        const headRes = await fetch(str, {
          method: "HEAD",
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const loc = headRes.headers.get("location");
        if (loc) {
          str = loc;
        }
      } catch {
        try {
          const getRes = await fetch(str, {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });
          if (getRes.url && getRes.url !== str) str = getRes.url;
        } catch {}
      }
    }

    let videoId: string | null = null;
    let pageId: string | null = null;

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

    res.json({ videoId, pageId, resolvedUrl: str });
  } catch (err: any) {
    res.status(500).json({ error: err.message, videoId: null, pageId: null });
  }
});

// ==========================================
// CÁC ENDPOINT MÁY IN LAN XPRINTER K80 (CỔNG 9100)
// ==========================================
let serverPrinterConfig = {
  printerIp: "192.168.1.200",
  printerPort: 9100,
  printerEnabled: true,
  autoCut: true
};

function sendEscPosToLanPrinter(printerIp: string, port: number = 9100, buffer: Buffer, timeoutMs: number = 4500): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve, reject) => {
    if (!printerIp) {
      return reject(new Error("Chưa có địa chỉ IP máy in LAN!"));
    }
    const client = new net.Socket();
    let isSettled = false;

    client.setTimeout(timeoutMs);

    client.connect(port, printerIp, () => {
      client.write(buffer, () => {
        setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            client.end();
            resolve({ success: true, message: `Đã in thành công ra Xprinter K80 (${printerIp}:${port})` });
          }
        }, 120);
      });
    });

    client.on("timeout", () => {
      if (!isSettled) {
        isSettled = true;
        client.destroy();
        reject(new Error(`Hết thời gian chờ (timeout) máy in ${printerIp}:${port}. Vui lòng kiểm tra cáp mạng LAN hoặc bật máy in.`));
      }
    });

    client.on("error", (err) => {
      if (!isSettled) {
        isSettled = true;
        client.destroy();
        reject(new Error(`Không thể kết nối máy in ${printerIp}:${port}: ${err.message}`));
      }
    });
  });
}

function createTestReceiptBuffer(printerIp: string, port: number): Buffer {
  const ESC = 0x1B;
  const GS = 0x1D;

  const init = Buffer.from([ESC, 0x40]);
  const center = Buffer.from([ESC, 0x61, 0x01]);
  const left = Buffer.from([ESC, 0x61, 0x00]);
  const boldOn = Buffer.from([ESC, 0x45, 0x01]);
  const boldOff = Buffer.from([ESC, 0x45, 0x00]);
  const doubleSize = Buffer.from([GS, 0x21, 0x11]);
  const normalSize = Buffer.from([GS, 0x21, 0x00]);
  const feedAndCut = Buffer.from([ESC, 0x64, 0x04, GS, 0x56, 0x42, 0x00]);
  const beep = Buffer.from([ESC, 0x42, 0x01, 0x02]);

  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const lines = [
    init,
    center,
    boldOn,
    Buffer.from("HIEN PHAM SHOP\n", "utf8"),
    Buffer.from("0965.286.096\n", "utf8"),
    Buffer.from("--------------------------------\n", "utf8"),
    doubleSize,
    Buffer.from("XPRINTER K80 (LAN)\n", "utf8"),
    normalSize,
    Buffer.from("TEST IN TRUC TIEP CONG 9100\n", "utf8"),
    Buffer.from("--------------------------------\n", "utf8"),
    left,
    boldOff,
    Buffer.from(`May chu: Armbian TV Box S905W\n`, "utf8"),
    Buffer.from(`IP May in: ${printerIp}:${port}\n`, "utf8"),
    Buffer.from(`Trang thai: KET NOI TOT (LAN)\n`, "utf8"),
    Buffer.from(`Che do in: Giong TPOS / Pancake\n`, "utf8"),
    Buffer.from(`Khong can RawBT / In ngam 100%\n`, "utf8"),
    Buffer.from(`Thoi gian: ${now}\n`, "utf8"),
    center,
    Buffer.from("================================\n", "utf8"),
    Buffer.from("CHUC SHOP BUON MAY BAN DAT!\n\n", "utf8"),
    beep,
    feedAndCut
  ];

  return Buffer.concat(lines);
}

app.get("/api/print/config", (_req, res) => {
  res.json(serverPrinterConfig);
});

app.post("/api/print/config", (req, res) => {
  const { printerIp, printerPort, printerEnabled, autoCut } = req.body || {};
  if (printerIp) serverPrinterConfig.printerIp = printerIp.trim();
  if (printerPort) serverPrinterConfig.printerPort = parseInt(printerPort) || 9100;
  if (printerEnabled !== undefined) serverPrinterConfig.printerEnabled = !!printerEnabled;
  if (autoCut !== undefined) serverPrinterConfig.autoCut = !!autoCut;
  res.json({ success: true, message: "Đã lưu cấu hình máy in!", config: serverPrinterConfig });
});

app.post("/api/print/lan", async (req, res) => {
  try {
    const { printerIp, port, escposBase64 } = req.body || {};
    const targetIp = (printerIp || serverPrinterConfig.printerIp || "192.168.1.200").trim();
    const targetPort = port || serverPrinterConfig.printerPort || 9100;

    if (!escposBase64) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu in (escposBase64)!" });
    }

    const buffer = Buffer.from(escposBase64, "base64");
    console.log(`=> 🖨️ [In LAN K80] Nhận lệnh in ${buffer.length} bytes tới ${targetIp}:${targetPort}`);

    const result = await sendEscPosToLanPrinter(targetIp, targetPort, buffer);
    res.json(result);
  } catch (err: any) {
    console.error("=> ❌ [In LAN K80 Thất bại]:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/print/test", async (req, res) => {
  try {
    const { printerIp, port } = req.body || {};
    const targetIp = (printerIp || serverPrinterConfig.printerIp || "192.168.1.200").trim();
    const targetPort = port || serverPrinterConfig.printerPort || 9100;

    console.log(`=> 🧪 [Test In K80] Đang gửi phiếu test tới ${targetIp}:${targetPort}...`);
    const testBuf = createTestReceiptBuffer(targetIp, targetPort);
    const result = await sendEscPosToLanPrinter(targetIp, targetPort, testBuf);
    res.json(result);
  } catch (err: any) {
    console.error("=> ❌ [Test In K80 Lỗi]:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Proxy Avatar Endpoint (CORS bypass & persistent browser caching for TikTok/Zalo/FB avatars)
app.get("/api/proxy-avatar", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

  const sendSvgFallback = (nameText: string) => {
    const raw = (nameText || "KH").trim().replace(/^[#@\s_]+/, "");
    const initials = (raw.slice(0, 2) || "KH").toUpperCase();
    const colors = [
      ["#059669", "#10b981"],
      ["#2563eb", "#3b82f6"],
      ["#7c3aed", "#8b5cf6"],
      ["#d97706", "#f59e0b"],
      ["#e11d48", "#f43f5e"],
      ["#0891b2", "#06b6d4"]
    ];
    let hash = 0;
    for (let i = 0; i < raw.length; i++) hash = (hash << 5) - hash + raw.charCodeAt(i);
    const [c1, c2] = colors[Math.abs(hash) % colors.length];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><circle cx="64" cy="64" r="64" fill="url(#bg)"/><text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="44" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initials}</text></svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    return res.send(svg);
  };

  try {
    const rawUrl = req.query.url as string;
    const nameParam = (req.query.name as string || "").trim();
    if (!rawUrl) return sendSvgFallback(nameParam);
    const targetUrl = decodeURIComponent(rawUrl);
    if (!/^https?:\/\//i.test(targetUrl)) return sendSvgFallback(nameParam);

    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": ""
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!resp.ok) {
      return sendSvgFallback(nameParam);
    }

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    const buffer = Buffer.from(await resp.arrayBuffer());
    return res.send(buffer);
  } catch {
    return sendSvgFallback((req.query.name as string) || "KH");
  }
});

// ==========================================
// 🥞 PANCAKE API PROXY & SMART SYNC SERVICE
// ==========================================
const DEFAULT_PANCAKE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSWFtaGllbiBoaWVucGhhbTIuMCIsImV4cCI6MTc5Njg4MjYxMiwiYXBwbGljYXRpb24iOjEsInVpZCI6ImI5Y2IyMzQwLTRlMWItNGQ4NS05YWMyLTAxMjRiYjJkOTFlYyIsInNlc3Npb25faWQiOiI4OTFhNTAyMC02ZjU4LTRhMjMtOWVjNi0wNTZkMWU0NGM2ZjAiLCJpYXQiOjE3ODkxMDY2MTIsInBhbmNha2VfaWQiOiI3MTdkMjIwNS0wN2NkLTQxN2YtOGNlZi1hZmNlODgwODgwMzQiLCJmYl9pZCI6IjE0NTkyNjMxMTQ2ODI1NCIsImxvZ2luX3Nlc3Npb24iOm51bGwsImZiX25hbWUiOiJJYW1oaWVuIGhpZW5waGFtMi4wIn0.NABY5AILX_Bhy0ijUQc6o852SYPwnEjClqcFuPLAF-4";

// Endpoint cung cấp cấu hình chuẩn từ Server để người dùng đồng bộ trực tiếp vào App Settings
app.get("/api/pancake/server-config", async (_req, res) => {
  try {
    res.json({
      success: true,
      token: DEFAULT_PANCAKE_TOKEN,
      shopId: "30093990",
      shopName: "Phạm Ngọc Hiền Store",
      warehouseId: "9872be82-80b0-4486-9260-2b625b2e0325",
      proxyUrl: "/api/pancake/push-order"
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/pancake/pages", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const response = await fetch(`https://pages.fm/api/v1/pages?access_token=${token}`);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pancake/pages/:pageId/conversations", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId } = req.params;
    const pageSize = req.query.page_size || "100";
    const type = req.query.type as string;
    const unreadFirst = req.query.unread_first as string;
    let url = `https://pages.fm/api/v1/pages/${pageId}/conversations?access_token=${token}&page_size=${pageSize}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (unreadFirst) url += `&unread_first=${encodeURIComponent(unreadFirst)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pancake/pages/:pageId/conversations/:convId/messages", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId, convId } = req.params;
    const customerId = req.query.customer_id as string || "";
    const url = `https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}/messages?access_token=${token}${customerId ? `&customer_id=${customerId}` : ""}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Memory cache cho danh sách Pages của user để tăng tốc độ và tránh timeout
let cachedAllPages: { token: string; data: any[]; timestamp: number } | null = null;

// Helper lấy danh sách TẤT CẢ các Pages (Facebook, Zalo, Instagram, etc.) kết nối vào Pancake
async function getAllPancakePages(token: string): Promise<any[]> {
  const now = Date.now();
  if (cachedAllPages && cachedAllPages.token === token && (now - cachedAllPages.timestamp < 30000)) {
    return cachedAllPages.data;
  }
  try {
    const pRes = await fetch(`https://pages.fm/api/v1/pages?access_token=${token}`, { signal: AbortSignal.timeout(4000) });
    if (!pRes.ok) return cachedAllPages?.data || [];
    const pData: any = await pRes.json();
    const allPages: any[] = Array.isArray(pData) ? pData : [
      ...(pData.pages || []),
      ...(pData.data || []),
      ...(pData.categorized?.personal_zalo || []),
      ...(pData.categorized?.zalo || []),
      ...(pData.categorized?.zalo_oa || []),
      ...(pData.categorized?.activated || [])
    ];
    const map = new Map<string, any>();
    allPages.forEach(p => {
      if (p && p.id && !map.has(String(p.id))) {
        map.set(String(p.id), p);
      }
    });
    const result = Array.from(map.values());
    cachedAllPages = { token, data: result, timestamp: now };
    return result;
  } catch {
    return cachedAllPages?.data || [];
  }
}

// Helper lấy danh sách Zalo pages active
async function getActiveZaloPages(token: string) {
  const allPages = await getAllPancakePages(token);
  const map = new Map<string, any>();
  for (const p of allPages) {
    if (!p || !p.id) continue;
    const id = String(p.id).toLowerCase();
    const plat = String(p.platform || p.platform_type || p.service || '').toLowerCase();
    if (plat === 'facebook' || plat === 'fb' || plat === 'instagram' || plat === 'ig' || plat === 'shopee' || plat === 'lazada') {
      continue;
    }
    if (/^\d{10,}$/.test(id) && (plat === 'facebook' || plat === 'fb' || !plat)) {
      continue;
    }
    if (plat.includes('zalo') || plat.includes('pzl') || id.startsWith('pzl_') || id.startsWith('zalo_') || plat.includes('personal') || map.size === 0) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
  }
  return Array.from(map.values());
}

app.get("/api/pancake/pages/:pageId/conversations/:convId", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId, convId } = req.params;
    
    // Thử fetch với pageId ban đầu
    let response = await fetch(`https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}?access_token=${token}`);
    let data = await response.json();
    
    // Nếu pageId không hợp lệ (ví dụ link dùng alias pzl_84965286096), tự động fallback qua các trang Zalo active
    if (!data || data.message === 'page_id không hợp lệ' || data.error || !data.conversation) {
      const activePages = await getActiveZaloPages(token);
      for (const p of activePages) {
        if (p.id === pageId) continue;
        try {
          const fallbackRes = await fetch(`https://pages.fm/api/v1/pages/${p.id}/conversations/${convId}?access_token=${token}`);
          const fallbackData = await fallbackRes.json();
          if (fallbackData && fallbackData.conversation) {
            return res.json(fallbackData);
          }
        } catch {}
      }
    }
    
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pancake/pages/:pageId/conversations/:convId/messages", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId, convId } = req.params;
    const body = req.body;
    let response = await fetch(`https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}/messages?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let data = await response.json();
    
    if (data.message === 'page_id không hợp lệ' || data.error) {
      const activePages = await getActiveZaloPages(token);
      for (const p of activePages) {
        if (p.id === pageId) continue;
        try {
          const fbRes = await fetch(`https://pages.fm/api/v1/pages/${p.id}/conversations/${convId}/messages?access_token=${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          const fbData = await fbRes.json();
          if (fbData && fbData.success) {
            return res.json(fbData);
          }
        } catch {}
      }
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pancake/pages/:pageId/customers/:custId", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId, custId } = req.params;
    const response = await fetch(`https://pages.fm/api/v1/pages/${pageId}/customers/${custId}?access_token=${token}`);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint cập nhật tên khách / ghi chú hội thoại trên Pancake Pages & POS
app.post("/api/pancake/update-customer-name", async (req, res) => {
  try {
    const token = (req.query.token as string || req.body.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId, convId, customerId, newName, shopId } = req.body || {};

    if (!newName) {
      return res.status(400).json({ success: false, error: "Thiếu tên mới cần cập nhật" });
    }

    let updated = false;

    // 1. Cập nhật trên Pages.fm nếu có pageId & customerId
    if (pageId && customerId) {
      try {
        const updateCustRes = await fetch(`https://pages.fm/api/v1/pages/${pageId}/customers/${customerId}?access_token=${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName })
        });
        if (updateCustRes.ok) {
          const data = await updateCustRes.json();
          if (data && (data.success || data.customer || data.id)) {
            updated = true;
          }
        }
      } catch (e: any) {
        console.warn("Pages.fm update customer error:", e.message);
      }
    }

    // 2. Thêm ghi chú vào hội thoại Pages.fm nếu có convId
    if (pageId && convId) {
      try {
        await fetch(`https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}/notes?access_token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Khách chốt đơn: ${newName}`, text: `Khách chốt đơn: ${newName}` })
        });
      } catch (e: any) {
        console.warn("Pages.fm add note error:", e.message);
      }
    }

    // 3. Cập nhật trên POS nếu có shopId & customerId
    if (shopId && customerId) {
      try {
        await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/customers/${customerId}?access_token=${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName })
        });
      } catch (e: any) {
        console.warn("POS update customer error:", e.message);
      }
    }

    return res.json({ success: true, updated, newName });
  } catch (err: any) {
    console.error("Lỗi update-customer-name Pancake:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/pancake/shops", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const response = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pancake/shops/:shopId/orders", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { shopId } = req.params;
    const pageSize = req.query.page_size || "100";
    const pageNumber = req.query.page_number || "1";
    const response = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?access_token=${token}&page_size=${pageSize}&page_number=${pageNumber}`);
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fast aggregated Zalo Inbox endpoint (Parallel Fetching & Smart Server Cache)
let cachedZaloPages: { timestamp: number; token: string; pages: any[] } | null = null;

app.get(["/api/pancake/zalo-inbox-fast", "/api/pancake/conversations-fast"], async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const platformReq = String(req.query.platform || req.query.type || '').toLowerCase();
    const now = Date.now();

    // 1. Lấy danh sách Pages theo nền tảng
    let targetPages: any[] = [];
    if (platformReq === 'facebook' || platformReq === 'fb') {
      const allPages = await getAllPancakePages(token);
      targetPages = allPages.filter((p: any) => {
        const plat = String(p.platform || p.platform_type || p.service || '').toLowerCase();
        const id = String(p.id || '').toLowerCase();
        return plat === 'facebook' || plat === 'fb' || (!id.startsWith('pzl_') && /^\d{10,}$/.test(id));
      });
    } else if (platformReq === 'zalo') {
      if (cachedZaloPages && cachedZaloPages.token === token && (now - cachedZaloPages.timestamp < 20000)) {
        targetPages = cachedZaloPages.pages;
      } else {
        targetPages = await getActiveZaloPages(token);
        cachedZaloPages = { timestamp: now, token, pages: targetPages };
      }
    } else {
      // Mặc định hoặc all: Lấy cả Zalo và Facebook pages
      targetPages = await getAllPancakePages(token);
    }

    if (targetPages.length === 0) {
      return res.json({ success: true, conversations: [], pages: [] });
    }

    // 2. Fetch song song các trang hội thoại để lấy đầy đủ tin nhắn cá nhân (Đặc biệt: type=INBOX để lấy khách lạ)
    const convPromises = targetPages.map(async (page) => {
      try {
        const queryUrls = [
          `https://pages.fm/api/v1/pages/${page.id}/conversations?access_token=${token}&type=INBOX&page_size=100`,
          `https://pages.fm/api/v1/pages/${page.id}/conversations?access_token=${token}&page_size=100`,
          `https://pages.fm/api/v1/pages/${page.id}/conversations?access_token=${token}&type=INBOX&unread_first=true&page_size=100`,
          `https://pages.fm/api/v1/pages/${page.id}/conversations?access_token=${token}&unread_first=true&page_size=100`
        ];
        const pageReqs = queryUrls.map(u => fetch(u).catch(() => null));
        const responses = await Promise.all(pageReqs);
        
        let list: any[] = [];
        for (const r of responses) {
          if (r && r.ok) {
            const cData: any = await r.json();
            if (cData && Array.isArray(cData.conversations)) {
              list.push(...cData.conversations);
            }
          }
        }

        // Lấy thêm các hội thoại từ đơn hàng POS gần nhất để không bao giờ bị thiếu khách Zalo thực tế
        try {
          const recentOrders = await getCachedOrFreshPosOrders(token);
          const posConvIds = [...new Set(recentOrders.map((o: any) => o.conversation_id).filter((cid: any) => cid && String(cid).startsWith('pzl_u_')))];
          const existingIds = new Set(list.map((c: any) => c.id));
          const missingConvIds = posConvIds.filter(cid => !existingIds.has(cid));
          
          if (missingConvIds.length > 0) {
            const extraReqs = missingConvIds.slice(0, 80).map(cid =>
              fetch(`https://pages.fm/api/v1/pages/${page.id}/conversations/${cid}?access_token=${token}`)
                .then(res => res.ok ? res.json() : null)
                .then(d => (d && (d.id || d.conversation?.id)) ? (d.conversation || d) : null)
                .catch(() => null)
            );
            const extraConvs = await Promise.all(extraReqs);
            extraConvs.forEach(c => {
              if (c && c.id) list.push(c);
            });
          }
        } catch {}
        
        // Khử trùng lặp ID và lọc triệt để tin nhắn hệ thống / sinh nhật / nhóm / quảng cáo sỉ
        const convMap = new Map<string, any>();
        list.forEach((c: any) => {
          if (!c || !c.id || convMap.has(c.id)) return;

          const s = (c.snippet || '').toLowerCase().trim();
          const name = (c.from?.name || c.customers?.[0]?.name || '').toLowerCase().trim();
          const fromId = (c.from?.id || '').toLowerCase();
          const id = String(c.id).toLowerCase();

          // 1. Lọc tài khoản hệ thống Zalo
          if (name === 'zalo' || name.includes('hệ thống') || name.includes('thông báo zalo') || fromId === 'zalo') {
            return;
          }

          // 2. Lọc thông báo sinh nhật tự động & tin nhắn hệ thống mẫu
          if (
            s.includes('sinh nhật của') ||
            s.includes('sinh nhat cua') ||
            s.includes('hãy gửi lời chúc') ||
            s.includes('hay gui loi chuc') ||
            s.includes('chúc mừng sinh nhật') ||
            s.includes('chuc mung sinh nhat') ||
            s.includes('chúc tốt đẹp') ||
            s.includes('gửi lời chúc') ||
            s.includes('thời tiết hôm nay') ||
            s.includes('zalo official account') ||
            s.includes('đã thêm bạn từ danh bạ') ||
            s.includes('[system message]') ||
            s.includes('tin nhắn từ hệ thống')
          ) {
            return;
          }

          // 3. Lọc nhóm chat (Group chat)
          if (
            c.type === 'GROUP' ||
            c.from?.is_group === true ||
            id.startsWith('pzl_g_') ||
            fromId.startsWith('pzl_g_') ||
            s.includes('zalo.me/g/') ||
            name.startsWith('lớp ') ||
            name.startsWith('nhóm ') ||
            name.includes('lớp ') ||
            name.includes('nhóm ')
          ) {
            return;
          }

          // 4. Lọc quảng cáo hàng sỉ / broadcast mẫu mới
          if (
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
            s.startsWith('[link] 💥')
          ) {
            return;
          }

          // 5. Đánh dấu cờ [Đã nhận] (đã mua & nhận hàng thành công) thay vì xóa bỏ hoàn toàn
          const rawTags = Array.isArray(c.tags) ? c.tags : [];
          const isReceived = rawTags.some((t: any) => {
            if (t === -3 || t === 3 || t === '-3' || t === '3') return true;
            const tagStr = String(t?.name || t?.text || t?.label || t || '').toLowerCase().trim();
            return tagStr.includes('đã nhận') || tagStr.includes('da nhan') || tagStr.includes('giao thành công') || tagStr.includes('hoàn thành');
          });

          // 6. Nhận diện khách lạ chuẩn xác (từ Pancake is_stranger, tags, hoặc history)
          const isStranger = c.from?.is_stranger === true || rawTags.some((t: any) => {
            const tagStr = String(t?.name || t?.text || t?.label || t || '').toLowerCase().trim();
            return tagStr.includes('người lạ') || tagStr.includes('nguoi la');
          });

          convMap.set(c.id, { 
            ...c, 
            _page_id: page.id, 
            _page_name: page.name,
            is_received: isReceived,
            is_stranger: isStranger
          });
        });
        return Array.from(convMap.values());
      } catch {
        return [];
      }
    });

    const results = await Promise.all(convPromises);
    const flatConversations = results.flat();

    // Sắp xếp hội thoại theo thời gian cập nhật mới nhất
    flatConversations.sort((a, b) => {
      const tA = new Date(a.updated_at || a.inserted_at || 0).getTime();
      const tB = new Date(b.updated_at || b.inserted_at || 0).getTime();
      return tB - tA;
    });

    res.json({
      success: true,
      pages: targetPages,
      conversations: flatConversations
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cache POS Orders in Memory (quét đa trang để không bao giờ bị sót đơn hàng cũ/mới)
let cachedPosOrders: { timestamp: number; token: string; orders: any[] } | null = null;

async function getCachedOrFreshPosOrders(token: string): Promise<any[]> {
  const now = Date.now();
  if (cachedPosOrders && cachedPosOrders.token === token && (now - cachedPosOrders.timestamp < 15000)) {
    return cachedPosOrders.orders;
  }

  try {
    const sRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`);
    if (!sRes.ok) return cachedPosOrders?.orders || [];
    const sData = await sRes.json();
    const shops = sData.shops || [];

    const orderPromises = shops.map(async (s: any) => {
      let shopOrders: any[] = [];
      // Lấy 3 trang đầu tiên (mỗi trang 100 đơn = 300 đơn gần nhất)
      const pagePromises = [1, 2, 3].map(async (pageNum) => {
        try {
          const ordRes = await fetch(`https://pos.pages.fm/api/v1/shops/${s.id}/orders?access_token=${token}&page_size=100&page_number=${pageNum}`);
          if (ordRes.ok) {
            const oData = await ordRes.json();
            return oData.data || [];
          }
        } catch {}
        return [];
      });
      const pageResults = await Promise.all(pagePromises);
      return pageResults.flat();
    });

    const allShopResults = await Promise.all(orderPromises);
    const flatOrders = allShopResults.flat();

    // Khử trùng lặp theo ID đơn hàng
    const orderMap = new Map<string, any>();
    flatOrders.forEach((o: any) => {
      if (o && o.id && !orderMap.has(String(o.id))) {
        orderMap.set(String(o.id), o);
      }
    });

    const uniqueOrders = Array.from(orderMap.values());
    cachedPosOrders = { timestamp: now, token, orders: uniqueOrders };
    return uniqueOrders;
  } catch (err) {
    console.error("Lỗi get POS orders cache:", err);
    return cachedPosOrders?.orders || [];
  }
}

// Helper kiểm tra SĐT chủ shop
function isShopPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const d = String(phone).replace(/\D/g, '');
  return d.endsWith('965286096') || d.endsWith('937789496');
}

// Endpoint tra cứu toàn bộ đơn hàng POS cho khách hàng thông minh (Multi-Criteria Smart Matcher)
app.get(["/api/pancake/customer-orders-lookup", "/api/pancake/customer-insight"], async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const rawLink = (req.query.link as string || "").trim();
    const pageIdReq = (req.query.page_id as string || "").trim();
    const convIdReq = (req.query.conv_id as string || "").trim();
    const custIdReq = (req.query.customer_id as string || "").trim();
    const phoneReq = (req.query.phone as string || "").trim();
    const userNameReq = (req.query.user_name as string || "").trim();

    // Bóc tách link nếu có
    let pageId = pageIdReq === 'undefined' || pageIdReq === 'null' ? '' : pageIdReq;
    let convId = convIdReq === 'undefined' || convIdReq === 'null' ? '' : convIdReq;
    if (rawLink) {
      if (/^pzl_[ug]_[0-9]+_[0-9]+/.test(rawLink)) {
        if (!convId) convId = rawLink;
        const pzMatch = rawLink.match(/pzl_[ug]_([0-9]+)_/);
        if (!pageId && pzMatch && pzMatch[1]) pageId = `pzl_${pzMatch[1]}`;
      } else {
        const fbMatch = rawLink.match(/^(?:fb_)?([0-9]{10,})_([0-9]{10,})$/);
        if (fbMatch) {
          if (!pageId) pageId = fbMatch[1];
          if (!convId) convId = `${fbMatch[1]}_${fbMatch[2]}`;
        }
      }

      try {
        const urlObj = new URL(rawLink.startsWith('http') ? rawLink : `https://${rawLink}`);
        if (urlObj.searchParams.has('page_id') && !pageId) pageId = urlObj.searchParams.get('page_id')!;
        if (urlObj.searchParams.has('pageId') && !pageId) pageId = urlObj.searchParams.get('pageId')!;
        if (urlObj.searchParams.has('mailbox_id') && !pageId) pageId = urlObj.searchParams.get('mailbox_id')!;
        if (urlObj.searchParams.has('asset_id') && !pageId) pageId = urlObj.searchParams.get('asset_id')!;
        if (urlObj.searchParams.has('c_id') && !convId) convId = urlObj.searchParams.get('c_id')!;
        if (urlObj.searchParams.has('conversation_id') && !convId) convId = urlObj.searchParams.get('conversation_id')!;
        if (urlObj.searchParams.has('conv_id') && !convId) convId = urlObj.searchParams.get('conv_id')!;
        if (urlObj.searchParams.has('selected_item_id') && !convId) convId = urlObj.searchParams.get('selected_item_id')!;
      } catch {}

      const match1 = rawLink.match(/pages\.fm\/([^\/?#]+)/i) || rawLink.match(/pancake\.vn\/([^\/?#]+)/i);
      if (match1 && !['inbox', 'conversations', 'pages', 'settings'].includes(match1[1]) && !pageId) pageId = match1[1];
      const match2 = rawLink.match(/[?&](?:c_id|conversation_id|conv_id|cid|selected_item_id)=([^&#]+)/i);
      if (match2 && !convId) convId = match2[1];

      const matchFbMsg = rawLink.match(/(?:facebook\.com\/messages\/t|m\.me)\/([a-zA-Z0-9_.-]+)/i);
      if (matchFbMsg && !convId) convId = matchFbMsg[1];
    }

    // Nếu convId có dạng fb_pageId_senderId hoặc pageId_senderId (Facebook Messenger)
    if (convId) {
      if (convId.startsWith('fb_')) {
        const afterFb = convId.slice(3);
        const parts = afterFb.split('_');
        if (parts.length >= 2 && /^\d{10,}$/.test(parts[0])) {
          if (!pageId) pageId = parts[0];
          convId = afterFb;
        }
      } else if (convId.includes('_') && !pageId) {
        const parts = convId.split('_');
        if (/^\d{10,}$/.test(parts[0])) {
          pageId = parts[0];
        }
      }
    }

    // Luôn chuẩn hóa pageId theo conversation ID nếu convId thuộc Zalo (pzl_u_{PAGE_ID}_{USER_ID})
    if (convId && convId.startsWith('pzl_')) {
      const pzMatch = convId.match(/pzl_[ug]_([0-9]+)_/);
      if (pzMatch && pzMatch[1]) {
        pageId = `pzl_${pzMatch[1]}`;
      } else if (!pageId) {
        pageId = 'pzl_2007152536191688636';
      }
    }

    let customerInfo: any = null;
    let convDataObj: any = null;

    // 1. Lấy chi tiết conversation từ Pancake Pages
    if (convId) {
      if (pageId) {
        try {
          const cRes = await fetch(`https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}?access_token=${token}`, { signal: AbortSignal.timeout(4000) });
          if (cRes.ok) {
            const cData = await cRes.json();
            if (cData && (cData.conversation || cData.id)) {
              convDataObj = cData.conversation || cData;
              customerInfo = convDataObj.customers?.[0] || convDataObj.from || null;
            }
          }
        } catch {}
      }

      if (!customerInfo) {
        const allPages = await getAllPancakePages(token);
        const pagesToSearch = allPages.slice(0, 10);
        const lookups = pagesToSearch.map(async (p) => {
          try {
            const pTok = p.access_token || p.page_access_token || token;
            const cRes = await fetch(`https://pages.fm/api/v1/pages/${p.id}/conversations/${convId}?access_token=${pTok}`, { signal: AbortSignal.timeout(4000) });
            if (cRes.ok) {
              const cData = await cRes.json();
              if (cData && (cData.conversation || cData.id)) {
                return { pageId: String(p.id), data: cData.conversation || cData };
              }
            }
          } catch {}
          return null;
        });

        const results = await Promise.allSettled(lookups);
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            convDataObj = r.value.data;
            customerInfo = convDataObj.customers?.[0] || convDataObj.from || null;
            pageId = r.value.pageId;
            break;
          }
        }
      }
    }

    // Bóc tách thông tin khách hàng từ conversation
    const custId = customerInfo?.id || custIdReq || "";
    const fromId = convDataObj?.from?.id || customerInfo?.fb_id || "";
    
    // Tìm số điện thoại khách hàng thực tế (tuyệt đối không lấy số chủ shop)
    let custPhone = customerInfo?.phone_number || convDataObj?.phone_number || (phoneReq !== 'undefined' ? phoneReq : '') || "";
    if (!custPhone && customerInfo?.phone_numbers && Array.isArray(customerInfo.phone_numbers) && customerInfo.phone_numbers.length > 0) {
      custPhone = customerInfo.phone_numbers[0];
    }
    if (!custPhone && convDataObj?.recent_phone_numbers && Array.isArray(convDataObj.recent_phone_numbers)) {
      const pObj = convDataObj.recent_phone_numbers.find((p: any) => p && p.phone_number && !isShopPhone(p.phone_number));
      if (pObj) custPhone = pObj.phone_number;
    }
    if (!custPhone && convDataObj?.snippet) {
      const sMatch = convDataObj.snippet.match(/(?:0|\+?84)(?:3|5|7|8|9)\d{8}/);
      if (sMatch && !isShopPhone(sMatch[0])) custPhone = sMatch[0];
    }

    if (isShopPhone(custPhone)) {
      custPhone = "";
    }
    
    // Ưu tiên phonebook_name (tên bạn đã đặt trong danh bạ Zalo, ví dụ "Chồng")
    const custName = customerInfo?.phonebook_name || convDataObj?.from?.phonebook_name || customerInfo?.name || convDataObj?.from?.name || userNameReq || "";
    const custAddress = customerInfo?.current_address?.full_address || customerInfo?.full_address || "";

    // 2. Tải toàn bộ đơn hàng POS
    const allPosOrders = await getCachedOrFreshPosOrders(token);

    // Chuẩn hóa số điện thoại (chỉ lấy các chữ số, lấy 9 số cuối)
    const normPhone = (p: string) => {
      const clean = (p || '').replace(/\D/g, '');
      if (clean.length >= 9) return clean.slice(-9);
      return '';
    };
    const targetPhoneDigits = normPhone(custPhone);

    // Trích xuất user unique ID từ conversationId
    let userUniqueId = "";
    if (convId) {
      const parts = convId.split('_');
      userUniqueId = parts[parts.length - 1] || "";
    }

    const cleanReqName = (userNameReq || custName || '').trim().toLowerCase();

    // 3. Khớp đơn hàng CHÍNH XÁC (KHÔNG match lỏng lẻo gây nhận nhầm đơn của khách khác)
    const matchedOrders = allPosOrders.filter((o: any) => {
      // a. Khớp chính xác theo conversation_id
      if (convId && o.conversation_id) {
        const oConv = String(o.conversation_id).trim();
        const cConv = String(convId).trim();
        if (oConv === cConv) return true;
        if (oConv.replace(/^fb_/, '') === cConv.replace(/^fb_/, '')) return true;
        if (userUniqueId && userUniqueId.length >= 6) {
          if (oConv.endsWith(userUniqueId) || oConv.includes(userUniqueId)) return true;
        }
      }

      // b. Khớp chính xác theo customer_id (UUID hoặc fb_id của Zalo / FB user)
      if (custId && (String(o.customer_id) === String(custId) || String(o.customer?.id) === String(custId))) {
        return true;
      }
      if (fromId && (String(o.customer?.fb_id) === String(fromId) || String(o.customer?.id) === String(fromId))) {
        return true;
      }
      if (userUniqueId && userUniqueId.length >= 6 && (String(o.customer?.fb_id) === userUniqueId || String(o.customer?.id) === userUniqueId)) {
        return true;
      }

      // c. Khớp chính xác theo số điện thoại (chỉ khi có SĐT thực sự khác SĐT shop)
      if (targetPhoneDigits && targetPhoneDigits.length >= 9 && !isShopPhone(targetPhoneDigits)) {
        const oPhone = normPhone(o.bill_phone_number || o.customer?.phone_number || o.shipping_address?.phone_number || '');
        if (oPhone && oPhone.length >= 9 && oPhone === targetPhoneDigits) {
          return true;
        }
      }

      // d. Khớp tên người nhận (TUYỆT ĐỐI CHỈ khi CÙNG conversation_id hoặc CÙNG SĐT)
      if (cleanReqName && cleanReqName.length >= 3 && targetPhoneDigits && targetPhoneDigits.length >= 9) {
        const oName = String(o.bill_full_name || o.shipping_address?.full_name || o.customer?.name || '').trim().toLowerCase();
        if (oName && (oName === cleanReqName || oName === cleanReqName.replace(/\s+/g, ''))) {
          const oPhone = normPhone(o.bill_phone_number || o.customer?.phone_number || o.shipping_address?.phone_number || '');
          if (oPhone === targetPhoneDigits) return true;
        }
      }

      return false;
    });

    // Sắp xếp đơn hàng mới nhất lên đầu
    matchedOrders.sort((a: any, b: any) => {
      const tA = new Date(a.inserted_at || a.updated_at || 0).getTime();
      const tB = new Date(b.inserted_at || b.updated_at || 0).getTime();
      return tB - tA;
    });

    // Định dạng danh sách đơn hàng trả về
    const ordersHistory = matchedOrders.map((o: any) => {
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
        partnerName: o.partner?.service_partner?.name || o.partner?.name,
        partnerStatus: o.partner?.partner_status,
        trackingCode: o.partner?.extend_code || o.tracking_code || o.order_number_vtp,
        totalPrice: Number(o.total_price || o.total_cost || 0),
        billFullName: o.bill_full_name || o.customer?.name || custName,
        billPhoneNumber: o.bill_phone_number || custPhone,
        billAddress: o.shipping_address?.full_address || o.full_address || o.bill_address || custAddress,
        insertedAt: o.inserted_at || o.updated_at || "",
        note: o.note || o.notes || o.customer_notes || "",
        isSuccess,
        items
      };
    });

    const successfulOrders = ordersHistory.filter(o => o.isSuccess);

    // 4. Tra cứu thông tin tổng thể khách hàng trực tiếp từ Pancake POS Customer Profile (nếu có SĐT)
    let posShopCustomer: any = null;
    const searchTarget = (custPhone && !isShopPhone(custPhone)) ? custPhone : '';
    if (searchTarget) {
      try {
        const sRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          const shopId = sData.shops?.[0]?.id;
          if (shopId) {
            const custRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/customers?access_token=${token}&search=${encodeURIComponent(searchTarget)}`);
            if (custRes.ok) {
              const cData = await custRes.json();
              const items = cData.data || cData.customers || [];
              const matchedCust = items.find((c: any) => {
                const pList = Array.isArray(c.phone_numbers) ? c.phone_numbers : [c.phone_number, c.phone].filter(Boolean);
                return pList.some((p: any) => String(p).replace(/\D/g, '').endsWith(targetPhoneDigits));
              });
              if (matchedCust && matchedCust.shop_customer) {
                posShopCustomer = matchedCust.shop_customer;
              }
            }
          }
        }
      } catch (err) {
        console.warn("Lỗi tra cứu shop_customer POS:", err);
      }
    }

    const totalSuccessfulSpent = successfulOrders.reduce((sum: number, o: any) => sum + (o.totalPrice || 0), 0);
    const totalSpent = posShopCustomer?.purchased_amount ?? (totalSuccessfulSpent > 0 ? totalSuccessfulSpent : ordersHistory.reduce((sum: number, o: any) => sum + (o.totalPrice || 0), 0));
    const succeedOrderCount = posShopCustomer?.succeed_order_count ?? successfulOrders.length;
    const returnedOrderCount = posShopCustomer?.returned_order_count ?? 0;
    const totalOrdersCount = posShopCustomer?.order_count ?? ordersHistory.length;
    const isReturningCustomer = (succeedOrderCount >= 2) || (totalOrdersCount >= 2);
    const latestOrder = ordersHistory[0] || null;

    res.json({
      success: true,
      insight: {
        customerId: custId,
        matchedName: custName || userNameReq || latestOrder?.billFullName || "",
        matchedPhone: custPhone || (latestOrder && !isShopPhone(latestOrder.billPhoneNumber) ? latestOrder.billPhoneNumber : ""),
        matchedAddress: custAddress || latestOrder?.billAddress || "",
        totalSpent,
        purchasedAmount: totalSpent,
        succeedOrderCount,
        returnedOrderCount,
        totalOrdersCount,
        isReturningCustomer,
        ordersHistory,
        successfulOrders,
        latestOrder,
        conversationId: convId,
        pageId
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cache danh sách sản phẩm / variation của shop
let cachedShopVariations: { timestamp: number; shopId: string | number; variations: any[] } | null = null;

async function getShopVariations(shopId: number | string, token: string): Promise<any[]> {
  if (cachedShopVariations && cachedShopVariations.shopId === shopId && Date.now() - cachedShopVariations.timestamp < 600000) {
    return cachedShopVariations.variations;
  }

  const variationsList: any[] = [];
  const seenIds = new Set<string>();

  // Tải nhiều trang (tối đa 4 trang = 1000 sản phẩm/biến thể)
  for (let page = 1; page <= 4; page++) {
    try {
      const res1 = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/products/variations?access_token=${token}&page_size=250&page_number=${page}`);
      if (res1.ok) {
        const d1 = await res1.json();
        const list = d1.data || d1.variations || (Array.isArray(d1) ? d1 : []);
        if (Array.isArray(list) && list.length > 0) {
          list.forEach((v: any) => {
            if (v && v.id && !seenIds.has(String(v.id))) {
              seenIds.add(String(v.id));
              // Chuẩn hóa tên sản phẩm và tên variation để dễ dàng tìm kiếm
              const prodName = v.product?.name || v.product_name || v.name || '';
              const varName = v.variation_name || v.name || '';
              variationsList.push({
                ...v,
                product_name: prodName,
                variation_name: varName
              });
            }
          });
        } else {
          break;
        }
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  // Nếu rỗng, thử endpoint /variations
  if (variationsList.length === 0) {
    try {
      const res2 = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/variations?access_token=${token}&page_size=250`);
      if (res2.ok) {
        const d2 = await res2.json();
        const list = d2.data || d2.variations || (Array.isArray(d2) ? d2 : []);
        if (Array.isArray(list)) {
          list.forEach((v: any) => {
            if (v && v.id && !seenIds.has(String(v.id))) {
              seenIds.add(String(v.id));
              const prodName = v.product?.name || v.product_name || v.name || '';
              const varName = v.variation_name || v.name || '';
              variationsList.push({
                ...v,
                product_name: prodName,
                variation_name: varName
              });
            }
          });
        }
      }
    } catch {}
  }

  cachedShopVariations = {
    timestamp: Date.now(),
    shopId,
    variations: variationsList
  };

  return variationsList;
}

async function createProductOnPancake(shopId: number | string, token: string, name: string, priceVnd: number, customBarcode?: string) {
  const priceK = priceVnd > 1000 ? Math.round(priceVnd / 1000) : priceVnd;
  const actualPriceVnd = priceVnd > 1000 ? priceVnd : priceVnd * 1000;
  const targetBarcode = customBarcode || `0${priceK}`;
  const cleanName = `sản phẩm ${priceK}`;

  console.log(`=> 📦 [Tạo SP Pancake POS] Shop: ${shopId} | Tên: ${cleanName} | Barcode: ${targetBarcode} | Giá: ${actualPriceVnd}đ`);

  const payloads = [
    // Format 1: Direct product fields with variations
    {
      name: cleanName,
      retail_price: actualPriceVnd,
      display_id: targetBarcode,
      barcode: targetBarcode,
      weight: 200,
      variations: [
        {
          name: targetBarcode,
          retail_price: actualPriceVnd,
          display_id: targetBarcode,
          barcode: targetBarcode,
          weight: 200
        }
      ]
    },
    // Format 2: Product wrapper (standard Pancake POS API)
    {
      product: {
        name: cleanName,
        retail_price: actualPriceVnd,
        display_id: targetBarcode,
        barcode: targetBarcode,
        weight: 200,
        variations: [
          {
            name: targetBarcode,
            retail_price: actualPriceVnd,
            display_id: targetBarcode,
            barcode: targetBarcode,
            weight: 200
          }
        ]
      }
    },
    // Format 3: Simple product without variations array
    {
      name: cleanName,
      retail_price: actualPriceVnd,
      display_id: targetBarcode,
      barcode: targetBarcode,
      weight: 200
    }
  ];

  for (const pl of payloads) {
    try {
      const res = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/products?access_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pl)
      });

      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch {}

      console.log(`=> 📦 [Pancake Create Product Result Status ${res.status}]`, data || resText.slice(0, 100));

      if (data && (data.success || data.product || data.data || data.id)) {
        const prod = data.product || data.data || data;
        const variation = prod.variations?.[0] || prod;
        const varId = variation.id || prod.id;
        if (varId) {
          const createdVar = {
            id: varId,
            product_id: prod.id,
            name: prod.name || cleanName,
            product_name: prod.name || cleanName,
            variation_name: variation.name || targetBarcode,
            barcode: targetBarcode,
            display_id: targetBarcode,
            retail_price: actualPriceVnd
          };

          if (cachedShopVariations && cachedShopVariations.variations) {
            cachedShopVariations.variations.unshift(createdVar);
          }

          return {
            success: true,
            productId: prod.id,
            variationId: varId,
            name: prod.name || cleanName,
            barcode: targetBarcode,
            displayId: targetBarcode,
            price: actualPriceVnd
          };
        }
      }
    } catch (err: any) {
      console.warn("Lỗi thử payload tạo SP:", err.message);
    }
  }

  // Nếu sản phẩm hoặc barcode đã tồn tại trên Pancake POS, tìm lại từ kho
  try {
    cachedShopVariations = null; // Clear cache to refresh
    const refreshedVars = await getShopVariations(shopId, token);
    const existingVar = refreshedVars.find((v: any) => {
      const vBarcode = String(v.barcode || '').trim();
      const vDisplayId = String(v.display_id || v.sku || '').trim();
      const vName = String(v.variation_name || v.name || '').trim().toLowerCase();
      const pName = String(v.product_name || v.product?.name || '').trim().toLowerCase();
      const priceMatch = (Number(v.retail_price) === actualPriceVnd || Number(v.retail_price_currency_original) === actualPriceVnd);
      return vBarcode === targetBarcode || vBarcode === `${priceK}` || vDisplayId === targetBarcode || vDisplayId === `${priceK}` || vName === `sản phẩm ${priceK}` || pName === `sản phẩm ${priceK}` || priceMatch;
    });
    if (existingVar) {
      return {
        success: true,
        productId: existingVar.product_id,
        variationId: existingVar.id,
        name: existingVar.product_name || existingVar.name || cleanName,
        barcode: existingVar.barcode || targetBarcode,
        displayId: existingVar.display_id || targetBarcode,
        price: actualPriceVnd
      };
    }
  } catch (err: any) {
    console.error("Không thể tải lại variations:", err.message);
  }

  return null;
}

// Helper gửi tin nhắn trực tiếp vào hội thoại Pancake Pages / Zalo / Facebook của khách
async function sendPancakeConversationMessage(pageId: string, convId: string, token: string, text: string): Promise<boolean> {
  if (!convId || !text) return false;

  let cleanConvId = convId.trim();
  let cleanPageId = pageId ? pageId.trim() : "";

  // Chuẩn hóa ID nếu có prefix fb_
  if (cleanConvId.startsWith('fb_')) {
    const afterFb = cleanConvId.slice(3);
    const parts = afterFb.split('_');
    if (parts.length >= 2 && /^\d{10,}$/.test(parts[0])) {
      if (!cleanPageId) cleanPageId = parts[0];
      cleanConvId = afterFb;
    }
  } else if (cleanConvId.includes('_') && !cleanPageId) {
    const parts = cleanConvId.split('_');
    if (/^\d{10,}$/.test(parts[0])) {
      cleanPageId = parts[0];
    }
  }

  // Nếu convId thuộc Zalo (pzl_u_{PAGE_ID}_{USER_ID})
  if (cleanConvId.startsWith('pzl_')) {
    const pzMatch = cleanConvId.match(/pzl_[ug]_([0-9]+)_/);
    if (pzMatch && pzMatch[1]) {
      cleanPageId = `pzl_${pzMatch[1]}`;
    }
  }

  console.log(`=> 💬 [Bắt đầu gửi tin nhắn Pancake] Page: ${cleanPageId} | Conv: ${cleanConvId}`);

  // 1. Lấy danh sách Pages đã cache để lấy token
  let allPages: any[] = [];
  try {
    allPages = await getAllPancakePages(token);
  } catch {}

  const targetPage = allPages.find(p => String(p.id) === String(cleanPageId));

  // Tập hợp danh sách các trang cần thử (ưu tiên targetPage, sau đó tối đa 2 trang khác)
  const candidatePages: { pageId: string; tokens: string[] }[] = [];
  if (cleanPageId) {
    const tokens = [token];
    if (targetPage) {
      const pageToken = targetPage.access_token || targetPage.page_access_token || targetPage.settings?.page_access_token;
      if (pageToken && pageToken !== token) tokens.unshift(pageToken);
    }
    candidatePages.push({ pageId: cleanPageId, tokens });
  }

  // Thêm tối đa 2 trang khác làm fallback phòng khi pageId ban đầu sai
  let fallbackCount = 0;
  for (const p of allPages) {
    if (fallbackCount >= 2) break;
    if (String(p.id) !== String(cleanPageId)) {
      const tokens = [token];
      const pt = p.access_token || p.page_access_token || p.settings?.page_access_token;
      if (pt && pt !== token) tokens.unshift(pt);
      candidatePages.push({ pageId: String(p.id), tokens });
      fallbackCount++;
    }
  }

  const payloads = [
    { message: text, type: "text" },
    { content: text, type: "text" },
    { text: text },
    { message: { text } }
  ];

  for (const pageCandidate of candidatePages) {
    for (const t of pageCandidate.tokens) {
      for (const pl of payloads) {
        try {
          const res = await fetch(`https://pages.fm/api/v1/pages/${pageCandidate.pageId}/conversations/${cleanConvId}/messages?access_token=${t}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pl),
            signal: AbortSignal.timeout(4000)
          });
          const resText = await res.text();
          let data: any = null;
          try {
            data = JSON.parse(resText);
          } catch {}

          if (res.ok && (!data || (data.success !== false && !data.error && !data.message?.includes('không hợp lệ')))) {
            console.log(`=> ✅ [Đã gửi tin nhắn Pancake thành công!] Page: ${pageCandidate.pageId} | Conv: ${cleanConvId}`);
            return true;
          }
        } catch {}
      }
    }
  }

  console.warn(`=> ⚠️ [Không thể gửi tin nhắn vào hội thoại Pancake] Conv: ${cleanConvId}`);
  return false;
}

// Endpoint gửi tin nhắn tùy chọn vào hội thoại Pancake Pages
app.post("/api/pancake/send-message", async (req, res) => {
  try {
    const token = (req.query.token as string || req.body.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const { pageId = "", conversationId, message } = req.body || {};
    if (!conversationId || !message) {
      return res.status(400).json({ success: false, error: "Thiếu conversationId hoặc nội dung tin nhắn" });
    }
    const success = await sendPancakeConversationMessage(pageId, conversationId, token, message);
    if (success) {
      return res.json({ success: true, message: "Đã gửi tin nhắn vào hội thoại Pancake thành công!" });
    } else {
      return res.status(500).json({ success: false, error: "Không thể gửi tin nhắn vào Pancake Pages (hội thoại có thể đã hết hạn 24h hoặc bị chặn)" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper tra cứu khách hàng trong Pancake POS theo số điện thoại (chuẩn xác 100%)
async function findPancakePosCustomerByPhone(shopId: number | string, token: string, phone: string) {
  const cleanDigits = phone.replace(/\D/g, '');
  if (cleanDigits.length < 9) return null;
  // BẢO VỆ: Tuyệt đối không dùng số của shop để tra cứu thông tin khách hàng
  if (isShopPhone(cleanDigits)) return null;

  const target9 = cleanDigits.slice(-9);

  // 1. Tìm trong danh sách khách hàng của shop Pancake POS
  try {
    const urls = [
      `https://pos.pages.fm/api/v1/shops/${shopId}/customers?access_token=${token}&search=${cleanDigits}`,
      `https://pos.pages.fm/api/v1/shops/${shopId}/customers?access_token=${token}&phone_number=${cleanDigits}`,
      `https://pos.pages.fm/api/v1/shops/${shopId}/customers?access_token=${token}&q=${cleanDigits}`
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const list = json.data || json.customers || (Array.isArray(json) ? json : []);
          if (Array.isArray(list) && list.length > 0) {
            const matched = list.find((c: any) => {
              const pList = Array.isArray(c.phone_numbers) ? c.phone_numbers : [c.phone_number, c.phone].filter(Boolean);
              return pList.some((p: any) => {
                const s = String(p).replace(/\D/g, '');
                return s.endsWith(target9) && !isShopPhone(s);
              });
            });
            if (matched) {
              const addr = matched.current_address?.full_address || matched.full_address || matched.address || "";
              console.log(`=> 👤 [Pancake POS Tìm thấy Khách] Tên: ${matched.name} | SĐT: ${cleanDigits} | ID: ${matched.id}`);
              return {
                id: matched.id,
                name: matched.name || "",
                phone: cleanDigits,
                address: addr,
                current_address: matched.current_address,
                page_id: matched.page_id
              };
            }
          }
        }
      } catch {}
    }
  } catch {}

  // 2. Tìm trong đơn hàng cũ gần nhất của shop theo số điện thoại
  try {
    const ordRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?access_token=${token}&phone_number=${cleanDigits}&page_size=15`);
    if (ordRes.ok) {
      const ordJson = await ordRes.json();
      const orders = ordJson.data || ordJson.orders || [];
      if (Array.isArray(orders) && orders.length > 0) {
        const matchedOrd = orders.find((o: any) => {
          const oPhone = String(o.bill_phone_number || o.customer?.phone_number || o.shipping_address?.phone_number || '').replace(/\D/g, '');
          return oPhone && oPhone.endsWith(target9) && !isShopPhone(oPhone);
        });
        if (matchedOrd) {
          const name = matchedOrd.bill_full_name || matchedOrd.customer?.name || "";
          const addr = matchedOrd.shipping_address?.full_address || matchedOrd.full_address || "";
          console.log(`=> 📦 [Pancake POS Tìm thấy qua Đơn cũ] Tên: ${name} | SĐT: ${cleanDigits} | Đơn #${matchedOrd.id}`);
          return {
            id: matchedOrd.customer_id || matchedOrd.customer?.id || "",
            name: name,
            phone: cleanDigits,
            address: addr,
            shipping_address: matchedOrd.shipping_address,
            page_id: matchedOrd.page_id,
            conversation_id: matchedOrd.conversation_id
          };
        }
      }
    }
  } catch {}

  return null;
}

// Endpoint tra cứu thông tin khách hàng từ Pancake POS theo Số điện thoại
app.get("/api/pancake/customer-by-phone", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const phone = (req.query.phone as string || "").trim();
    let shopId = req.query.shop_id as string || "";

    if (!phone || isShopPhone(phone)) {
      return res.json({ success: false, message: "Số điện thoại không hợp lệ hoặc là số của shop" });
    }

    if (!shopId) {
      try {
        const sRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.shops && sData.shops.length > 0) {
            shopId = sData.shops[0].id;
          }
        }
      } catch {}
    }

    const cust = await findPancakePosCustomerByPhone(shopId || 30093990, token, phone);
    if (cust) {
      return res.json({ success: true, customer: cust });
    } else {
      return res.json({ success: false, message: "Chưa có hồ sơ khách này trên Pancake POS" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint lấy danh sách variations / sản phẩm của Shop từ Pancake POS
app.get("/api/pancake/variations", async (req, res) => {
  try {
    const token = (req.query.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    let shopId = req.query.shop_id as string || "";

    if (!shopId) {
      try {
        const sRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.shops && sData.shops.length > 0) {
            shopId = sData.shops[0].id;
          }
        }
      } catch {}
    }

    if (!shopId) {
      return res.status(400).json({ success: false, error: "Không tìm thấy Shop ID Pancake POS" });
    }

    const rawVariations = await getShopVariations(shopId, token);
    const variations = rawVariations.map((v: any) => {
      const prodName = v.product_name || v.product?.name || "";
      const varName = v.variation_name || v.name || "";
      const fullName = prodName && varName && prodName !== varName ? `${prodName} - ${varName}` : (prodName || varName || "Sản phẩm");
      return {
        id: v.id,
        productId: v.product_id || v.product?.id,
        name: fullName,
        productName: prodName || fullName,
        variationName: varName,
        displayId: v.display_id || v.sku || v.product_display_id || "",
        barcode: v.barcode || v.display_id || "",
        retailPrice: Number(v.retail_price || v.price || 0),
        remainQuantity: v.remain_quantity ?? v.quantity ?? null,
        weight: v.weight || 100
      };
    });

    res.json({ success: true, shopId, variations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint tạo nhanh sản phẩm mới trên Pancake POS
app.post("/api/pancake/create-product", async (req, res) => {
  try {
    const token = (req.query.token as string || req.body.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    let shopId = req.body.shopId || req.query.shop_id as string || "";
    const { name, price = 0, sku, barcode } = req.body || {};

    if (!name && !price) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập tên hoặc giá sản phẩm" });
    }

    if (!shopId) {
      try {
        const sRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.shops && sData.shops.length > 0) {
            shopId = sData.shops[0].id;
          }
        }
      } catch {}
    }

    const targetBarcode = barcode || sku;
    const result = await createProductOnPancake(shopId || 30093990, token, name, Number(price), targetBarcode);
    if (result) {
      return res.json({ success: true, product: result, message: "Tạo sản phẩm trên Pancake POS thành công!" });
    } else {
      return res.status(500).json({ success: false, error: "Không thể tạo sản phẩm trên Pancake POS" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint đẩy đơn hàng từ phiên Live / giỏ hàng vào Pancake POS
app.post("/api/pancake/push-order", async (req, res) => {
  try {
    const token = (req.query.token as string || req.body.token as string || DEFAULT_PANCAKE_TOKEN).trim();
    const {
      user = "",
      nickname = "",
      platform = "tiktok",
      pancakeLink = "",
      phone: bodyPhone = "",
      pageId: bodyPageId = "",
      conversationId: bodyConvId = "",
      items = [],
      shopId: customShopId,
      customCustomerInfo = {},
      sendNotificationMessage = true
    } = req.body || {};

    if (!user && !pancakeLink && !bodyPhone && !customCustomerInfo.phone && (!items || items.length === 0)) {
      return res.status(400).json({ success: false, error: "Thiếu thông tin khách hàng hoặc danh sách sản phẩm" });
    }

    // 1. Phân tích Pancake Link để lấy pageId và convId, hoặc trích xuất số điện thoại
    let pageId = bodyPageId || customCustomerInfo.pageId || "";
    let convId = bodyConvId || customCustomerInfo.conversationId || "";
    let extractedPhone = (bodyPhone || customCustomerInfo.phone || "").trim();

    const rawLink = (pancakeLink || "").trim();
    if (rawLink) {
      // 0a. Nếu rawLink chính là raw Zalo conversation ID
      if (/^pzl_[ug]_[0-9]+_[0-9]+/.test(rawLink)) {
        if (!convId) convId = rawLink;
        const pzMatch = rawLink.match(/pzl_[ug]_([0-9]+)_/);
        if (!pageId && pzMatch && pzMatch[1]) pageId = `pzl_${pzMatch[1]}`;
      } else {
        // 0b. Nếu rawLink là Facebook conversation ID dạng pageId_senderId
        const fbMatch = rawLink.match(/^(?:fb_)?([0-9]{10,})_([0-9]{10,})$/);
        if (fbMatch) {
          if (!pageId) pageId = fbMatch[1];
          if (!convId) convId = `${fbMatch[1]}_${fbMatch[2]}`;
        }
      }

      // 0c. Nếu rawLink là số điện thoại
      const cleanDigits = rawLink.replace(/\D/g, '');
      if ((cleanDigits.length === 10 && cleanDigits.startsWith('0')) || (cleanDigits.length === 11 && cleanDigits.startsWith('84')) || (cleanDigits.length === 9 && !rawLink.includes('/'))) {
        const std = cleanDigits.startsWith('84') ? '0' + cleanDigits.slice(2) : (cleanDigits.length === 9 ? '0' + cleanDigits : cleanDigits);
        if (!extractedPhone) extractedPhone = std;
      }

      try {
        const urlObj = new URL(rawLink.startsWith('http') ? rawLink : `https://${rawLink}`);
        if (urlObj.searchParams.has('page_id') && !pageId) pageId = urlObj.searchParams.get('page_id')!;
        if (urlObj.searchParams.has('pageId') && !pageId) pageId = urlObj.searchParams.get('pageId')!;
        if (urlObj.searchParams.has('p_id') && !pageId) pageId = urlObj.searchParams.get('p_id')!;
        if (urlObj.searchParams.has('mailbox_id') && !pageId) pageId = urlObj.searchParams.get('mailbox_id')!;
        if (urlObj.searchParams.has('asset_id') && !pageId) pageId = urlObj.searchParams.get('asset_id')!;

        if (urlObj.searchParams.has('c_id') && !convId) convId = urlObj.searchParams.get('c_id')!;
        if (urlObj.searchParams.has('conversation_id') && !convId) convId = urlObj.searchParams.get('conversation_id')!;
        if (urlObj.searchParams.has('conv_id') && !convId) convId = urlObj.searchParams.get('conv_id')!;
        if (urlObj.searchParams.has('cid') && !convId) convId = urlObj.searchParams.get('cid')!;
        if (urlObj.searchParams.has('selected_item_id') && !convId) convId = urlObj.searchParams.get('selected_item_id')!;
        if (urlObj.searchParams.has('phone') && !extractedPhone) extractedPhone = urlObj.searchParams.get('phone')!;
      } catch {}

      // Pattern: pages.fm/:pageId/inbox?c_id=:convId hoặc pancake.vn/:pageId?c_id=:convId
      const matchPagesFm = rawLink.match(/(?:pages\.fm|pancake\.vn)\/([a-zA-Z0-9_.-]+)\/(?:inbox|conversations|c)(?:\/([a-zA-Z0-9_.-]+))?/i);
      if (matchPagesFm) {
        if (!['inbox', 'conversations', 'pages', 'settings', 'p'].includes(matchPagesFm[1]) && !pageId) {
          pageId = matchPagesFm[1];
        }
        if (matchPagesFm[2] && !convId) {
          convId = matchPagesFm[2];
        }
      }

      // Pattern: pancake.vn/:pageId?c_id=:convId hoặc pages.fm/:pageId?c_id=:convId (không có /inbox)
      if (!pageId) {
        const matchDirectPage = rawLink.match(/(?:pages\.fm|pancake\.vn)\/([a-zA-Z0-9_.-]+)(?:\?|$|\/)/i);
        if (matchDirectPage && !['inbox', 'conversations', 'pages', 'settings', 'p'].includes(matchDirectPage[1])) {
          pageId = matchDirectPage[1];
        }
      }

      // Pattern Meta Business Suite / Facebook Inbox
      if (!convId) {
        const matchMetaItem = rawLink.match(/[?&]selected_item_id=([a-zA-Z0-9_.-]+)/i);
        if (matchMetaItem) convId = matchMetaItem[1];
      }
      if (!pageId) {
        const matchMetaPage = rawLink.match(/[?&](?:mailbox_id|asset_id|page_id)=([0-9]+)/i);
        if (matchMetaPage) pageId = matchMetaPage[1];
      }

      // Pattern Facebook Messenger links: facebook.com/messages/t/:id hoặc m.me/:id
      const matchFbMessenger = rawLink.match(/(?:facebook\.com\/messages\/t|m\.me)\/([a-zA-Z0-9_.-]+)/i);
      if (matchFbMessenger && !convId) {
        convId = matchFbMessenger[1];
      }

      // Pattern deep link: pancake://pages/:pageId/conversations/:convId
      const matchDeep = rawLink.match(/pancake:\/\/(?:pages\/([a-zA-Z0-9_.-]+)\/)?(?:conversations|inbox)\/([a-zA-Z0-9_.-]+)/i);
      if (matchDeep) {
        if (matchDeep[1] && !pageId) pageId = matchDeep[1];
        if (matchDeep[2] && !convId) convId = matchDeep[2];
      }

      // Pattern: /conversations/:convId hoặc /inbox/:convId
      const matchConv = rawLink.match(/(?:conversations|inbox|c)\/([a-zA-Z0-9_.-]+)/i);
      if (matchConv && !convId) {
        convId = matchConv[1];
      }

      if (!convId) {
        const matchCId = rawLink.match(/[?&](?:c_id|conversation_id|conv_id|cid)=([a-zA-Z0-9_.-]+)/i);
        if (matchCId) convId = matchCId[1];
      }

      if (!pageId) {
        const matchPage = rawLink.match(/[?&](?:page_id|pageId|p_id)=([a-zA-Z0-9_.-]+)/i);
        if (matchPage) pageId = matchPage[1];
      }

      // Nếu link chứa số điện thoại hoặc link Zalo
      if (!extractedPhone) {
        const phoneMatch = rawLink.match(/phone=([0-9+]+)/i) || rawLink.match(/(?:zalo\.me\/|\+?84|0)(3|5|7|8|9)\d{8}/i);
        if (phoneMatch) {
          extractedPhone = phoneMatch[0].replace(/\D/g, '');
        } else {
          const cleanDigits = rawLink.replace(/\D/g, '');
          if (cleanDigits.length >= 9 && cleanDigits.length <= 11) {
            extractedPhone = cleanDigits;
          }
        }
      }
    }

    // Format pageId_senderId hoặc fb_pageId_senderId trong Facebook Pancake
    if (convId) {
      if (convId.startsWith('fb_')) {
        const afterFb = convId.slice(3);
        const parts = afterFb.split('_');
        if (parts.length >= 2 && /^\d{10,}$/.test(parts[0])) {
          pageId = parts[0];
          convId = afterFb;
        }
      } else if (convId.includes('_')) {
        const parts = convId.split('_');
        if (parts.length >= 2 && /^\d{10,}$/.test(parts[0])) {
          pageId = parts[0];
        }
      }
    }

    if (pageId === 'phamngochienshop') {
      pageId = '100546631959960';
    }

    // Luôn chuẩn hóa pageId theo conversation ID nếu convId thuộc Zalo (pzl_u_{PAGE_ID}_{USER_ID})
    if (convId && convId.startsWith('pzl_')) {
      const pzMatch = convId.match(/pzl_[ug]_([0-9]+)_/);
      if (pzMatch && pzMatch[1]) {
        pageId = `pzl_${pzMatch[1]}`;
      }
    }

    // Chuẩn hóa số điện thoại dạng 0xxxxxxxxx (loại trừ số chủ shop)
    let normPhone = "";
    if (extractedPhone) {
      if (isShopPhone(extractedPhone)) {
        extractedPhone = "";
      } else {
        const d = extractedPhone.replace(/\D/g, '');
        if (d.startsWith('84') && d.length >= 11) {
          normPhone = '0' + d.slice(2);
        } else if (d.startsWith('0') && d.length >= 10) {
          normPhone = d;
        } else if (d.length === 9) {
          normPhone = '0' + d;
        } else {
          normPhone = d;
        }
      }
    }

    // Tự động tìm kiếm conversation trong các Pages (Facebook, Zalo) theo SĐT nếu chưa có convId (chỉ khi có SĐT khách hợp lệ)
    if ((!convId || !pageId) && normPhone && !isShopPhone(normPhone)) {
      try {
        const allPages = await getAllPancakePages(token);
        const pagesToSearch = allPages.slice(0, 5);
        for (const p of pagesToSearch) {
          try {
            const zRes = await fetch(`https://pages.fm/api/v1/pages/${p.id}/conversations?q=${normPhone}&access_token=${p.access_token || token}&page_size=3`, { signal: AbortSignal.timeout(3500) });
            if (zRes.ok) {
              const zData = await zRes.json();
              const list = zData.conversations || zData.data || [];
              if (list.length > 0) {
                convId = list[0].id;
                pageId = String(p.id);
                console.log(`=> 🔗 [Tìm thấy hội thoại Pancake theo SĐT] Page: ${pageId} | Conv: ${convId}`);
                break;
              }
            }
          } catch {}
        }
      } catch {}
    }

    let customerInfo: any = null;
    let convDataObj: any = null;

    // Lấy chi tiết conversation từ Pancake Pages nếu có convId
    if (convId) {
      if (pageId) {
        try {
          const cRes = await fetch(`https://pages.fm/api/v1/pages/${pageId}/conversations/${convId}?access_token=${token}`, { signal: AbortSignal.timeout(4000) });
          if (cRes.ok) {
            const cData = await cRes.json();
            if (cData && (cData.conversation || cData.id)) {
              convDataObj = cData.conversation || cData;
              customerInfo = convDataObj.customers?.[0] || convDataObj.from || null;
            }
          }
        } catch {}
      }

      if (!customerInfo) {
        const allPages = await getAllPancakePages(token);
        const pagesToSearch = allPages.slice(0, 8);
        const convLookups = pagesToSearch.map(async (p) => {
          try {
            const cRes = await fetch(`https://pages.fm/api/v1/pages/${p.id}/conversations/${convId}?access_token=${p.access_token || token}`, { signal: AbortSignal.timeout(4000) });
            if (cRes.ok) {
              const cData = await cRes.json();
              if (cData && (cData.conversation || cData.id)) {
                return { pageId: String(p.id), data: cData.conversation || cData };
              }
            }
          } catch {}
          return null;
        });

        const cResults = await Promise.allSettled(convLookups);
        for (const r of cResults) {
          if (r.status === 'fulfilled' && r.value) {
            convDataObj = r.value.data;
            customerInfo = convDataObj.customers?.[0] || convDataObj.from || null;
            pageId = r.value.pageId;
            console.log(`=> 🔗 [Tìm thấy hội thoại Pancake trên Page] Page: ${pageId} | Conv: ${convId}`);
            break;
          }
        }
      }
    }

    // Lấy Shop ID và kho mặc định
    let shopId = customShopId || 30093990;
    let warehouseId = "9872be82-80b0-4486-9260-2b625b2e0325";

    if (!customShopId) {
      try {
        const sRes = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`, { signal: AbortSignal.timeout(4000) });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.shops && sData.shops.length > 0) {
            shopId = sData.shops[0].id;
            if (sData.shops[0].default_warehouse_when_auto_create_orders) {
              warehouseId = sData.shops[0].default_warehouse_when_auto_create_orders;
            }
          }
        }
      } catch {}
    }

    // Tải danh sách variations thật từ shop Pancake POS
    const shopVariations = await getShopVariations(shopId, token);
    const firstActiveVarId = shopVariations[0]?.id || "bf05b2ef-8d50-4658-9701-63786bd4bc61";

    // 🔍 BƯỚC 1: TRA CỨU & XÁC ĐỊNH KHÁCH HÀNG
    const convCust = customerInfo || convDataObj?.from || null;
    const convCustName = (customerInfo?.phonebook_name || convDataObj?.from?.phonebook_name || customerInfo?.name || convDataObj?.from?.name || "").trim();
    const convCustId = convDataObj?.customers?.[0]?.id || customerInfo?.id || undefined;
    const convCustFbId = convDataObj?.from?.id || customerInfo?.fb_id || convDataObj?.customers?.[0]?.fb_id || (convId && convId.includes('_') ? convId.split('_').pop() : undefined);
    
    // Tìm SĐT của tài khoản Zalo / FB trong hội thoại
    let convCustPhone = "";
    if (customerInfo?.phone_number) {
      convCustPhone = String(customerInfo.phone_number).replace(/\D/g, '');
    } else if (customerInfo?.phone_numbers && Array.isArray(customerInfo.phone_numbers) && customerInfo.phone_numbers.length > 0) {
      convCustPhone = String(customerInfo.phone_numbers[0]).replace(/\D/g, '');
    } else if (convDataObj?.from?.phone) {
      convCustPhone = String(convDataObj.from.phone).replace(/\D/g, '');
    } else if (convDataObj?.phone_number) {
      convCustPhone = String(convDataObj.phone_number).replace(/\D/g, '');
    } else if (convDataObj?.recent_phone_numbers && Array.isArray(convDataObj.recent_phone_numbers) && convDataObj.recent_phone_numbers.length > 0) {
      const pObj = convDataObj.recent_phone_numbers.find((p: any) => p && p.phone_number);
      if (pObj) convCustPhone = String(pObj.phone_number).replace(/\D/g, '');
    }
    // Trích xuất SĐT từ snippet hoặc tin nhắn gần nhất
    if (!convCustPhone && convDataObj?.snippet) {
      const sMatch = convDataObj.snippet.match(/(?:0|\+?84)(?:3|5|7|8|9)\d{8}/);
      if (sMatch) convCustPhone = sMatch[0].replace(/\D/g, '');
    }

    const cleanUser = String(user || '').trim();

    // Xác định chính xác finalPageId và finalConvId
    let finalPageId = convDataObj?.page_id ? String(convDataObj.page_id) : (pageId || undefined);
    let finalConvId = convDataObj?.id ? String(convDataObj.id) : (convId || undefined);

    // Chuẩn hóa Zalo Page ID nếu convId bắt đầu bằng pzl_
    if (finalConvId && finalConvId.startsWith('pzl_')) {
      const pzMatch = finalConvId.match(/pzl_[ug]_([0-9]+)_/);
      if (pzMatch && pzMatch[1]) {
        finalPageId = `pzl_${pzMatch[1]}`;
      } else if (!finalPageId) {
        finalPageId = 'pzl_2007152536191688636';
      }
    }

    const isZalo = Boolean((finalConvId && finalConvId.startsWith('pzl_')) || (finalPageId && String(finalPageId).startsWith('pzl_')));
    const orderSources = isZalo ? "-8" : "-1";

    // Chuẩn hóa fbFormattedId (bắt buộc đúng cấu trúc cho Pancake POS)
    let fbFormattedId: string | undefined = undefined;
    if (isZalo) {
      if (convDataObj?.from?.id) {
        fbFormattedId = String(convDataObj.from.id);
      } else if (convDataObj?.customers?.[0]?.fb_id) {
        fbFormattedId = String(convDataObj.customers[0].fb_id);
      } else if (finalConvId && finalConvId.startsWith('pzl_u_')) {
        const uId = finalConvId.split('_').pop();
        fbFormattedId = `pzl_u_${uId}`;
      }
    } else {
      const realFbUserId = convDataObj?.from?.id || convDataObj?.customers?.[0]?.fb_id || (finalConvId && finalConvId.includes('_') ? finalConvId.split('_').pop() : undefined);
      if (realFbUserId) {
        fbFormattedId = String(realFbUserId);
        if (finalPageId && !fbFormattedId.startsWith(`${finalPageId}_`)) {
          fbFormattedId = `${finalPageId}_${fbFormattedId}`;
        }
      }
    }

    // Tra cứu khách hàng chuẩn xác trong Pancake POS theo fb_id hoặc SĐT
    let matchedCust: any = null;
    let shopCustomerId: string | undefined = undefined;

    // 1. Tìm theo fb_id (chính xác tuyệt đối cho Zalo & Facebook Fanpage)
    if (fbFormattedId) {
      try {
        const custRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/customers?fb_id=${encodeURIComponent(fbFormattedId)}&access_token=${token}`, { signal: AbortSignal.timeout(4000) });
        if (custRes.ok) {
          const cData = await custRes.json();
          const items = cData.data || cData.customers || [];
          matchedCust = items.find((c: any) => c.fb_id === fbFormattedId) || null;
        }
      } catch {}
    }

    // 2. Tìm theo số điện thoại (chỉ khi có SĐT thực tế khác SĐT shop)
    const rawTargetPhone = (customCustomerInfo.phone || convCustPhone || normPhone || '').replace(/\D/g, '');
    let validPhone: string | undefined = undefined;
    if (rawTargetPhone && !isShopPhone(rawTargetPhone)) {
      if (rawTargetPhone.length === 10 && rawTargetPhone.startsWith('0')) validPhone = rawTargetPhone;
      else if (rawTargetPhone.length === 11 && rawTargetPhone.startsWith('84')) validPhone = '0' + rawTargetPhone.slice(2);
      else if (rawTargetPhone.length === 9) validPhone = '0' + rawTargetPhone;
    }

    if (!matchedCust && validPhone) {
      try {
        const custRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/customers?access_token=${token}&search=${encodeURIComponent(validPhone)}`, { signal: AbortSignal.timeout(4000) });
        if (custRes.ok) {
          const cData = await custRes.json();
          const items = cData.data || cData.customers || [];
          matchedCust = items.find((c: any) => {
            const pList = Array.isArray(c.phone_numbers) ? c.phone_numbers : [c.phone_number, c.phone].filter(Boolean);
            return pList.some((p: any) => String(p).replace(/\D/g, '').endsWith(validPhone!.slice(-9)));
          }) || null;
        }
      } catch {}
    }

    if (matchedCust) {
      shopCustomerId = matchedCust.shop_customer?.id || matchedCust.shop_customer_id;
      console.log(`=> 🎯 [Tìm thấy Khách POS chuẩn xác] ID: ${matchedCust.id} | ShopCustID: ${shopCustomerId} | Tên: ${matchedCust.name} | FbID: ${matchedCust.fb_id}`);
    }

    // Xác định tên người nhận: Ưu tiên TUYỆT ĐỐI thông tin trong modal
    let chosenName = "";
    if (customCustomerInfo.name && customCustomerInfo.name.trim()) {
      chosenName = customCustomerInfo.name.trim();
    } else if (convCustName) {
      chosenName = convCustName;
    } else if (nickname && nickname.trim()) {
      chosenName = nickname.trim();
    } else {
      chosenName = cleanUser || "Khách chốt Live";
    }

    // Xác định SĐT người nhận: Ưu tiên SĐT do người dùng xác nhận trong modal
    let chosenPhone = "";
    if (customCustomerInfo.phone && customCustomerInfo.phone.trim() && !isShopPhone(customCustomerInfo.phone)) {
      chosenPhone = customCustomerInfo.phone.trim();
    } else if (validPhone) {
      chosenPhone = validPhone;
    } else if (convCustPhone && !isShopPhone(convCustPhone)) {
      chosenPhone = convCustPhone;
    }

    // Định nghĩa chính xác ID và Tên khách hàng dùng cho payload
    const finalCustId = matchedCust?.id || convCustId || undefined;
    const finalCustName = chosenName;

    // Xây dựng shipping_address đầy đủ và an toàn (tuyệt đối không lấy nhầm của khách khác)
    let shippingAddr: any = {};
    let finalShopCustAddrId: string | undefined = undefined;

    if (customCustomerInfo.address && customCustomerInfo.address.trim()) {
      shippingAddr = {
        full_name: chosenName,
        phone_number: chosenPhone || undefined,
        full_address: customCustomerInfo.address.trim()
      };
      // Khi đã có địa chỉ cụ thể, không truyền ID cũ để tránh liên kết sai
      finalShopCustAddrId = undefined;
    } else if (matchedCust) {
      // Chỉ khi matchedCust đúng chính xác là khách này
      const savedAddrs: any[] = matchedCust.shop_customer?.shop_customer_addresses || [];
      if (savedAddrs.length > 0) {
        const firstSaved = savedAddrs[0];
        shippingAddr = {
          address: firstSaved.address || null,
          commune_id: firstSaved.commune_id || null,
          district_id: firstSaved.district_id || null,
          province_id: firstSaved.province_id || null,
          country_code: firstSaved.country_code || 84,
          full_name: chosenName,
          phone_number: chosenPhone || undefined,
          full_address: firstSaved.full_address || ""
        };
        finalShopCustAddrId = firstSaved.id;
      } else {
        shippingAddr = {
          full_name: chosenName,
          phone_number: chosenPhone || undefined,
          full_address: customerInfo?.current_address?.full_address || customerInfo?.full_address || ""
        };
      }
    } else {
      shippingAddr = {
        full_name: chosenName,
        phone_number: chosenPhone || undefined,
        full_address: customerInfo?.current_address?.full_address || customerInfo?.full_address || ""
      };
    }

    console.log(`=> 🎯 [Xác nhận khách tạo đơn Pancake POS] Tên: "${chosenName}" | SĐT: ${chosenPhone || '(Trống/Chưa có)'} | ĐC: "${shippingAddr.full_address || 'Chưa có'}" | Conv: ${finalConvId} | Page: ${finalPageId} | CustID: ${matchedCust?.id || 'None'} | ShopCustID: ${shopCustomerId || 'None'} | AddrID: ${finalShopCustAddrId || 'None'} | Source: ${orderSources} (${isZalo ? 'Zalo' : 'Facebook'})`);

    // 2. Chuẩn hóa danh sách sản phẩm
    let totalItemsPrice = 0;
    const itemLines: string[] = [];

    items.forEach((it: any, idx: number) => {
      const p = Number(it.price) || 0;
      const priceVnd = p > 1000 ? p : p * 1000;
      const qty = Number(it.quantity) || 1;
      const itemTotal = priceVnd * qty;
      totalItemsPrice += itemTotal;

      const pastTag = it.isPast ? " [Giữ phiên trước]" : "";
      const content = it.content && it.content.trim() ? it.content.trim() : `Sản phẩm ${p}k`;
      itemLines.push(`${idx + 1}. ${content} (${p > 1000 ? Math.round(p / 1000) : p}k x ${qty})${pastTag}`);
    });

    // 3. BƯỚC 2: XỬ LÝ SẢN PHẨM THEO ĐÚNG QUY TRÌNH BARCODE 0(giá_sp)
    const posItems: any[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const p = Number(it.price) || 0;
      const priceK = p > 1000 ? Math.round(p / 1000) : p;
      const priceVnd = p > 1000 ? p : p * 1000;
      const qty = Number(it.quantity) || 1;
      const content = (it.content || `Sản phẩm ${priceK}k`).trim();

      const targetBarcode = `0${priceK}`;
      const altBarcode = `${priceK}`;

      let targetVarId = it.variationId || it.variation_id || "";

      if (!targetVarId && shopVariations.length > 0) {
        const barcodeMatch = shopVariations.find((v: any) => {
          const vBarcode = String(v.barcode || '').trim();
          const vDisplayId = String(v.display_id || v.sku || '').trim();
          const vName = String(v.variation_name || v.name || '').trim().toLowerCase();
          const pName = String(v.product_name || v.product?.name || '').trim().toLowerCase();
          const priceMatch = (Number(v.retail_price) === priceVnd || Number(v.retail_price_currency_original) === priceVnd);

          const isBarcodeExact = (vBarcode === targetBarcode || vBarcode === altBarcode || vDisplayId === targetBarcode || vDisplayId === altBarcode);
          const isNameExact = (vName === `sản phẩm ${priceK}` || pName === `sản phẩm ${priceK}` || vName === `sp ${priceK}k` || vName === `0${priceK}` || pName === `0${priceK}` || pName === `${priceK}`);
          return isBarcodeExact || isNameExact || priceMatch;
        });

        if (barcodeMatch) {
          targetVarId = barcodeMatch.id;
          console.log(`=> 🎯 [Đã tìm thấy SP có Barcode ${targetBarcode} / Giá ${priceVnd}đ] (Var ID: ${targetVarId})`);
        }
      }

      if (!targetVarId) {
        console.log(`=> ➕ [Tạo mới SP Pancake POS] Barcode: ${targetBarcode} | Giá: ${priceVnd}đ`);
        const createdProd = await createProductOnPancake(shopId, token, `sản phẩm ${priceK}`, priceVnd, targetBarcode);
        if (createdProd && createdProd.variationId) {
          targetVarId = createdProd.variationId;
          console.log(`=> ✅ [Đã tạo SP Pancake POS thành công] Barcode: ${targetBarcode} -> Var ID mới: ${targetVarId}`);
        }
      }

      if (!targetVarId) {
        targetVarId = firstActiveVarId;
      }

      const cleanItemNote = (!content || content === "(Không ghi chú)" || content.trim() === "" || content.toLowerCase().includes("không ghi chú")) ? undefined : content.trim();

      const itemObj: any = {
        variation_id: targetVarId,
        price: priceVnd,
        quantity: qty
      };
      if (cleanItemNote) {
        itemObj.note = cleanItemNote;
      }

      posItems.push(itemObj);
    }

    // 🚚 XÁC ĐỊNH PHÍ VẬN CHUYỂN MẶC ĐỊNH:
    // Nếu địa chỉ là tỉnh Ninh Thuận: 15.000₫, các tỉnh khác: 20.000₫
    const rawAddrText = (
      String(shippingAddr.full_address || '') + ' ' + 
      String(shippingAddr.address || '') + ' ' + 
      String(shippingAddr.province_name || '') + ' ' +
      String(customCustomerInfo.address || '')
    ).toLowerCase();
    const normAddrText = rawAddrText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const isNinhThuan = 
      String(shippingAddr.province_id) === '705' || 
      normAddrText.includes('ninh thuan') || 
      normAddrText.includes('phan rang') || 
      normAddrText.includes('thap cham');

    let assignedShippingFee = isNinhThuan ? 15000 : 20000;
    if (req.body.tag === 'GHE_LAY' || req.body.isGheLay) {
      assignedShippingFee = 0;
    }
    if (typeof req.body.shippingFee === 'number' && req.body.shippingFee >= 0) {
      assignedShippingFee = req.body.shippingFee;
    }

    // 💳 XÁC ĐỊNH TIỀN CỌC TRƯỚC (CHUYỂN KHOẢN):
    // Tag COC (Cọc 50): 50.000₫ | Tag COC_100 (Cọc 100): 100.000₫
    let assignedPrepaid = 0;
    if (typeof req.body.prepaid === 'number' && req.body.prepaid >= 0) {
      assignedPrepaid = req.body.prepaid;
    } else if (req.body.tag === 'COC') {
      assignedPrepaid = 50000;
    } else if (req.body.tag === 'COC_100') {
      assignedPrepaid = 100000;
    }

    // 4. Gửi request tạo đơn lên Pancake POS với đầy đủ customer_fb_id, conversation_id, page_id, order_sources, shipping_fee, prepaid
    const createPayload: any = {
      page_id: finalPageId || undefined,
      conversation_id: finalConvId || undefined,
      shop_customer_id: shopCustomerId || undefined,
      shop_customer_address_id: finalShopCustAddrId || undefined,
      customer_id: finalCustId || undefined,
      customer_fb_id: fbFormattedId || undefined,
      fb_id: fbFormattedId || undefined,
      psid: fbFormattedId || undefined,
      customer: {
        id: finalCustId || undefined,
        fb_id: fbFormattedId || undefined,
        psid: fbFormattedId || undefined,
        page_id: finalPageId || undefined,
        name: chosenName,
        phone: chosenPhone || undefined,
        phone_numbers: chosenPhone ? [chosenPhone] : undefined
      },
      warehouse_id: warehouseId,
      bill_full_name: chosenName,
      bill_phone_number: chosenPhone || undefined,
      shipping_address: shippingAddr,
      shipping_fee: assignedShippingFee,
      prepaid: assignedPrepaid > 0 ? assignedPrepaid : undefined,
      items: posItems.length > 0 ? posItems : undefined,
      order: {
        warehouse_id: warehouseId,
        bill_full_name: chosenName,
        bill_phone_number: chosenPhone || undefined,
        shipping_address: shippingAddr,
        shipping_fee: assignedShippingFee,
        prepaid: assignedPrepaid > 0 ? assignedPrepaid : undefined,
        items: posItems.length > 0 ? posItems : undefined,
        page_id: finalPageId || undefined,
        conversation_id: finalConvId || undefined,
        order_sources: orderSources
      },
      status: 0,
      order_sources: orderSources,
      is_send_message: true,
      send_message: true,
      auto_send_order_message: true,
      auto_send_message: true
    };

    console.log(`=> 🥞 [Tạo đơn Pancake POS] Shop: ${shopId} | Khách: ${chosenName} (${chosenPhone || 'Chưa SĐT'}) | Số món: ${posItems.length} | Tiền hàng: ${totalItemsPrice}đ | Ship: ${assignedShippingFee}đ | Cọc (CK): ${assignedPrepaid}đ | COD: ${Math.max(0, totalItemsPrice + assignedShippingFee - assignedPrepaid)}đ | Conv: ${finalConvId} | FbID: ${fbFormattedId} | Source: ${orderSources}`);

    let createRes: Response;
    let resText = "";
    let createData: any = null;

    try {
      createRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?access_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
        signal: AbortSignal.timeout(12000)
      });
      resText = await createRes.text();
      try {
        createData = JSON.parse(resText);
      } catch {}
    } catch (fetchErr: any) {
      console.error("Lỗi gửi yêu cầu tạo đơn Pancake:", fetchErr);
      return res.json({
        success: false,
        error: `Không thể kết nối đến Pancake POS: ${fetchErr?.message || 'Quá thời gian phản hồi'}`
      });
    }

    // Nếu gặp lỗi Rate exceeded (429) hoặc mạng bị nghẽn, tự động chờ 1.2s và thử lại
    if (createRes.status === 429 || resText.includes("Rate exceeded") || createData?.message === "Rate exceeded") {
      console.warn("=> ⚠️ Pancake POS báo Rate exceeded (429), đang tự động chờ 1.2s và thử lại...");
      await new Promise(r => setTimeout(r, 1200));
      try {
        createRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?access_token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPayload),
          signal: AbortSignal.timeout(12000)
        });
        resText = await createRes.text();
        try {
          createData = JSON.parse(resText);
        } catch {}
      } catch {}
    }

    // Nếu gặp lỗi trùng mã custom_id ngẫu nhiên của shop, thử lại sau 400ms
    if ((!createRes.ok || !createData?.success) && createData?.error && String(createData.error).includes("trùng")) {
      console.warn("=> ⚠️ Pancake POS báo trùng custom_id, đang tự động thử lại...");
      await new Promise(r => setTimeout(r, 400));
      try {
        const retryRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?access_token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPayload),
          signal: AbortSignal.timeout(12000)
        });
        const retryText = await retryRes.text();
        const retryData = JSON.parse(retryText);
        if (retryData && retryData.success) {
          createData = retryData;
        }
      } catch {}
    }

    if (!createData) {
      console.error("Pancake POS response text (non-JSON):", resText);
      return res.json({
        success: false,
        error: `Pancake POS phản hồi lỗi (${createRes?.status || 500}): ${resText.slice(0, 150)}`
      });
    }

    if (!createData.success) {
      console.error("=> ❌ Pancake POS từ chối:", createData);
      return res.json({
        success: false,
        error: createData?.message || createData?.error || "Pancake POS từ chối tạo đơn. Vui lòng kiểm tra lại SĐT hoặc địa chỉ."
      });
    }

    // Invalidate cached POS orders để lần quét kế tiếp có ngay đơn mới
    cachedPosOrders = null;

    const createdOrder = createData.data || createData;
    const orderCode = createdOrder.display_id || createdOrder.id;

    console.log(`=> ✅ [Tạo đơn Pancake POS thành công] Mã đơn: #${orderCode} | Số món: ${createdOrder.items?.length || posItems.length}`);

    // 5. TỰ ĐỘNG GỬI TIN NHẮN THÔNG BÁO TẠO ĐƠN THÀNH CÔNG CHO KHÁCH TRÊN PANCAKE / ZALO / FB
    let messageSent = false;
    let messageError = "";
    if (finalPageId && finalConvId && sendNotificationMessage !== false) {
      try {
        const itemNotices: string[] = [];
        items.forEach((it: any) => {
          const p = Number(it.price) || 0;
          const priceK = p > 1000 ? Math.round(p / 1000) : p;
          const qty = Number(it.quantity) || 1;
          const hasCustom = it.content && it.content.trim() && it.content.trim() !== "(Không ghi chú)" && !it.content.toLowerCase().includes("không ghi chú");
          const name = hasCustom ? it.content.trim() : `Sản phẩm ${priceK}k`;
          itemNotices.push(`  + ${name} (${priceK}k x ${qty})`);
        });

        const finalShipFee = (createdOrder && typeof createdOrder.shipping_fee === 'number') 
          ? createdOrder.shipping_fee 
          : assignedShippingFee;
        const finalPrepaid = (createdOrder && typeof createdOrder.prepaid === 'number')
          ? createdOrder.prepaid
          : assignedPrepaid;
        const finalTotalPayment = (createdOrder && typeof createdOrder.total_price === 'number')
          ? createdOrder.total_price
          : (totalItemsPrice + finalShipFee);
        const finalCod = (createdOrder && typeof createdOrder.cod === 'number')
          ? createdOrder.cod
          : Math.max(0, finalTotalPayment - finalPrepaid);

        let autoMsg = `Dạ em chào ${chosenName || finalCustName}, Shop đã tạo đơn thành công cho mình trên Live ạ! ❤️\n\n` +
          `📦 Mã đơn hàng: #${orderCode}\n` +
          `🛍️ Chi tiết sản phẩm (${items.length} món):\n${itemNotices.join('\n')}\n` +
          `💰 Tiền hàng: ${totalItemsPrice.toLocaleString('vi-VN')}đ\n` +
          `🚚 Phí vận chuyển: ${finalShipFee.toLocaleString('vi-VN')}đ\n`;

        if (finalPrepaid > 0) {
          autoMsg += `💳 Đã trừ cọc chuyển khoản: -${finalPrepaid.toLocaleString('vi-VN')}đ\n`;
        }

        autoMsg += `💵 Còn lại thu COD: ${finalCod.toLocaleString('vi-VN')}đ\n\n` +
          `Shop sẽ sớm đóng gói và gửi hàng cho mình nhé. Cảm ơn chị yêu đã ủng hộ shop ạ! 🥰`;

        messageSent = await sendPancakeConversationMessage(finalPageId, finalConvId, token, autoMsg);
        if (!messageSent) {
          messageError = "Chưa gửi được tin nhắn tự động (hội thoại có thể đã hết hạn 24h hoặc bị chặn)";
        }
      } catch (err: any) {
        console.warn("Lỗi gửi tin nhắn báo đơn:", err.message);
        messageError = err.message;
      }
    }

    return res.json({
      success: true,
      order: createdOrder,
      messageSent,
      messageError: messageError || undefined,
      conversationId: finalConvId,
      pageId: finalPageId,
      message: messageSent 
        ? `Đã tạo đơn #${orderCode} trên Pancake POS & Gửi tin nhắn báo khách thành công!`
        : `Đã tạo đơn #${orderCode} trên Pancake POS thành công!`
    });
  } catch (err: any) {
    console.error("Lỗi push-order Pancake:", err);
    res.json({ success: false, error: err.message || "Lỗi khi tạo đơn Pancake POS" });
  }
});

// Endpoint kích hoạt pm2 restart all hoặc restart server từ xa
app.all("/api/admin/restart-server", (_req, res) => {
  res.json({ success: true, message: "Đang khởi động lại tiến trình server (pm2 restart all)..." });
  setTimeout(() => {
    try {
      exec("pm2 restart all || pm2 restart 0 || pm2 restart server", (err: any, stdout: any, stderr: any) => {
        console.log("[Remote Restart]", stdout || stderr || err);
      });
    } catch {
      process.exit(0);
    }
  }, 800);
});


// Vite & Static serving setup
async function startServer() {
  const isCompiledCjs = typeof __filename !== "undefined" && __filename.endsWith(".cjs");
  
  // Resolve dist directory and index.html across multiple potential execution environments
  const candidateDirs = [
    typeof __dirname !== "undefined" ? __dirname : "",
    typeof __dirname !== "undefined" ? path.join(__dirname, "dist") : "",
    path.join(process.cwd(), "dist"),
    process.cwd()
  ].filter(Boolean);

  let distDir: string | null = null;
  let distIndexPath: string | null = null;

  for (const dir of candidateDirs) {
    const candidateIndex = path.join(dir, "index.html");
    if (fs.existsSync(candidateIndex)) {
      distDir = dir;
      distIndexPath = candidateIndex;
      break;
    }
  }

  const isDevCommand = Boolean(
    process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes("dev")
  );
  // Production mode is active if running compiled CJS bundle, explicitly set via NODE_ENV,
  // or if dist directory exists and we are not explicitly running dev.
  const isProduction = isCompiledCjs || process.env.NODE_ENV === "production" || (!isDevCommand && !!distIndexPath);

  if (isProduction && distDir && distIndexPath) {
    console.log(`[Production Server] Phục vụ tệp tĩnh từ: ${distDir}`);
    app.use(
      express.static(distDir, {
        maxAge: "1y",
        immutable: true,
        index: false,
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith(".html") ||
            filePath.endsWith(".webmanifest") ||
            filePath.endsWith("sw.js") ||
            filePath.endsWith("registerSW.js")
          ) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
          }
        }
      })
    );

    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        return next();
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(distIndexPath!);
    });
  } else {
    try {
      const vitePkg = "vite";
      const { createServer } = await import(vitePkg);
      const vite = await createServer({
        server: { 
          middlewareMode: true,
          hmr: false,
          watch: null,
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn("Could not start Vite dev middleware, falling back to static:", err);
      if (distDir && distIndexPath) {
        app.use(express.static(distDir));
        app.get("*", (req, res, next) => {
          if (req.path.startsWith("/api/")) return next();
          res.sendFile(distIndexPath!);
        });
      } else {
        const rootIndex = path.join(process.cwd(), "index.html");
        if (fs.existsSync(rootIndex)) {
          app.get("*", (req, res, next) => {
            if (req.path.startsWith("/api/")) return next();
            res.sendFile(rootIndex);
          });
        }
      }
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Auto-sync TV Box server script to Firebase RTDB server_code.json
    try {
      const armbianPath = path.join(process.cwd(), "public", "armbian-server.cjs");
      if (fs.existsSync(armbianPath)) {
        const armbianCode = fs.readFileSync(armbianPath, "utf-8");
        fetch("https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/server_code.json", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: armbianCode, updatedAt: Date.now(), version: "2.4.0" })
        }).then(() => console.log("[Firebase RTDB] Đã cập nhật server_code.json thành công.")).catch(() => {});
      }
    } catch {}

    // Auto-connect to default TikTok live channel hienpham.965286096
    setTimeout(async () => {
      try {
        console.log("[TikTok Live Daemon] Kiểm tra kênh mặc định @hienpham.965286096...");
        const res = await connectToTikTokLive("hienpham.965286096", "hienpham_live");
        if (res.success) {
          console.log("[TikTok Live Daemon] ✅ Kênh @hienpham.965286096 đang phát Live và đã kết nối!");
        } else {
          console.log("[TikTok Live Daemon] ℹ️ Kênh @hienpham.965286096 hiện đang Offline (chưa phát Live). Sẵn sàng kết nối khi bạn mở Live.");
        }
      } catch (err: any) {
        console.log("[TikTok Live Daemon] Kênh mặc định đang ở chế độ chờ:", err?.message || err);
      }
    }, 2000);
  });
}

// Khởi động server nếu chạy trong container / local (không phải Vercel serverless function)
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export { app, startServer };
export default app;
