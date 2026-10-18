const express = require("express");
const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");
const { TikTokLiveConnection } = require("tiktok-live-connector");

const CURRENT_SERVER_VERSION = "2.9.0";
const UPDATE_SOURCES = [
  "https://inlivess.vercel.app/armbian-server.cjs",
  "https://raw.githubusercontent.com/haingontayux-cloud/tiktok-live-print/main/public/armbian-server.cjs"
];

// =========================================================
// BỘ GIÁP CHỐNG SẬP TOÀN DIỆN (ANTI-CRASH & SELF-HEALING)
// =========================================================
process.on("uncaughtException", (err) => {
  const msg = err && err.message ? err.message : String(err);
  console.error("🛡️ [Anti-Crash Guard] Đã chặn lỗi ngoại lệ (Uncaught Exception):", msg);
});

process.on("unhandledRejection", (reason, promise) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  console.error("🛡️ [Anti-Crash Guard] Đã chặn lỗi Promise Rejection:", msg);
});

// Giám sát RAM định kỳ để không bị OOM Killer của Linux ngắt tiến trình
setInterval(() => {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    if (heapUsedMB > 180 || rssMB > 250) {
      console.warn(`⚠️ [Memory Warning] Bộ nhớ đang dùng cao (${heapUsedMB}MB Heap / ${rssMB}MB RSS), tự động dọn dẹp cache...`);
      if (global.gc) {
        global.gc();
      }
    }
  } catch (e) {}
}, 30000);

// ==========================================
// CẤU HÌNH MÁY CHỦ LƯU VĨNH VIỄN TRÊN DISK
// ==========================================
const CONFIG_FILE = path.join(__dirname, "server_config.json");
let serverConfig = {
  fbTarget: "https://www.facebook.com/100546631959960",
  fbPageId: "100546631959960",
  fbToken: "",
  ttUser: "hienpham.965286096",
  printerIp: "192.168.1.198",
  printerPort: 9100,
  printerAutoCut: true,
  printerMode: "lan",
  printerAutoPrintOnOrder: false
};

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    serverConfig = { ...serverConfig, ...saved };
    console.log("=> 💾 [Server Config] Đã tải cấu hình lưu từ đĩa:", {
      fbTarget: serverConfig.fbTarget,
      fbPageId: serverConfig.fbPageId,
      hasToken: !!serverConfig.fbToken
    });
  }
} catch (e) {
  console.warn("[Server Config] Chưa có file cấu hình cũ, sử dụng mặc định.");
}

function saveServerConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfig, null, 2), "utf8");
    console.log("=> 💾 [Server Config] Đã ghi đè cấu hình mới vào đĩa thành công.");
  } catch (e) {
    console.error("[Server Config] Lỗi lưu cấu hình:", e.message);
  }
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

// ==========================================
// 1. TIKTOK LIVE ENGINE (24/7)
// ==========================================
let currentRoom = "hienpham_live";
let liveState = {
  isConnected: false,
  isStopped: false,
  username: "hienpham.965286096",
  roomId: null,
  viewerCount: 0,
  totalLikesCount: 0,
  totalCommentsCount: 0,
  connectedAt: null,
  lastError: null,
  recentComments: [],
  serverVersion: CURRENT_SERVER_VERSION
};

let currentConn = null;
let sseClients = [];
let isAttempting = false;
let isUpdating = false;
let nextAllowedAttemptTime = 0;
let lastHandledRequestTime = 0;
let lastHandledClearTime = 0;

// ==========================================
// 2. FACEBOOK LIVE ENGINE (24/7)
// ==========================================
let currentFbRoom = "hienpham_live_fb";
let fbLiveState = {
  isConnected: false,
  isStopped: false,
  target: "",            // Link bài live, Video ID, hoặc Fanpage ID
  videoId: null,
  pageId: null,
  accessToken: "",       // Page Access Token (nếu có)
  totalCommentsCount: 0,
  connectedAt: null,
  lastError: null,
  recentComments: [],
  serverVersion: CURRENT_SERVER_VERSION
};

let fbPollTimer = null;
let fbAutoDetectTimer = null;
let fbSeenCommentIds = new Set();
let fbSseClients = [];
let lastFbHandledRequestTime = 0;
let lastFbHandledClearTime = 0;
let pendingFbCommentsQueue = [];
let syncFbDebounceTimer = null;

// ==========================================
// AUTO-UPDATER (OTA)
// ==========================================
async function performSelfUpdate(forcedUrl = null) {
  if (isUpdating) return { success: false, error: "Đang trong tiến trình cập nhật..." };
  isUpdating = true;
  console.log("[Auto-Updater] 🔄 Đang kiểm tra bản cập nhật mới cho máy chủ TV Box...");
  
  const sources = forcedUrl ? [forcedUrl, ...UPDATE_SOURCES] : UPDATE_SOURCES;
  
  try {
    for (const src of sources) {
      try {
        console.log("[Auto-Updater] Đang tải từ:", src);
        const res = await fetch(src, { headers: { "Cache-Control": "no-cache" } });
        if (res.ok) {
          const text = await res.text();
          if (text && text.includes("express") && text.includes("TikTokLiveConnection") && text.length > 5000) {
            const currentFilePath = __filename;
            let currentCode = "";
            try {
              currentCode = fs.readFileSync(currentFilePath, "utf8");
            } catch (e) {}

            if (text.trim() !== currentCode.trim()) {
              console.log("[Auto-Updater] 🚀 Đã tìm thấy mã nguồn mới! Đang ghi đè file...");
              fs.writeFileSync(currentFilePath, text, "utf8");

              liveState.lastError = "Máy chủ vừa cập nhật mã nguồn mới! Đang tự động khởi động lại...";
              broadcast("status", liveState);
              await sendHeartbeat();
              await sendFbHeartbeat();

              setTimeout(() => {
                console.log("[Auto-Updater] Khởi động lại process server qua PM2...");
                process.exit(0); // PM2 tự động restart ngay lập tức
              }, 1200);

              return { success: true, updated: true, message: "Đã cập nhật mã nguồn mới v" + CURRENT_SERVER_VERSION + " thành công! Máy chủ đang khởi động lại." };
            } else {
              console.log("[Auto-Updater] ✅ Máy chủ đã ở phiên bản mới nhất.");
              return { success: true, updated: false, message: "Máy chủ hiện đã ở phiên bản mới nhất (v" + CURRENT_SERVER_VERSION + ")." };
            }
          }
        }
      } catch (err) {
        console.warn("[Auto-Updater] Thử nguồn thất bại (" + src + "):", err.message);
      }
    }

    // Nguồn dự phòng tự động từ Firebase RTDB server_code
    try {
      console.log("[Auto-Updater] Thử tải mã nguồn trực tiếp từ Firebase RTDB...");
      const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/server_code/code.json";
      const fbRes = await fetch(fbUrl);
      if (fbRes.ok) {
        const rawCode = await fbRes.json();
        if (typeof rawCode === "string" && rawCode.includes("express") && rawCode.includes("TikTokLiveConnection") && rawCode.length > 5000) {
          const currentFilePath = __filename;
          let currentCode = "";
          try {
            currentCode = fs.readFileSync(currentFilePath, "utf8");
          } catch (e) {}

          if (rawCode.trim() !== currentCode.trim()) {
            console.log("[Auto-Updater] 🚀 Đã cập nhật thành công từ Firebase RTDB! Đang ghi đè file...");
            fs.writeFileSync(currentFilePath, rawCode, "utf8");
            liveState.lastError = "Máy chủ vừa cập nhật mã nguồn mới từ Firebase! Đang khởi động lại...";
            broadcast("status", liveState);
            await sendHeartbeat();
            await sendFbHeartbeat();

            setTimeout(() => {
              console.log("[Auto-Updater] Khởi động lại process server qua PM2...");
              process.exit(0);
            }, 1200);

            return { success: true, updated: true, message: "Đã cập nhật mã nguồn mới từ Firebase thành công! Máy chủ đang khởi động lại." };
          }
        }
      }
    } catch (fbErr) {
      console.warn("[Auto-Updater] Thử tải từ Firebase RTDB thất bại:", fbErr.message);
    }
  } finally {
    isUpdating = false;
  }
  return { success: false, error: "Không thể tải mã nguồn mới từ các máy chủ cập nhật." };
}

function broadcast(event, data) {
  const payload = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  sseClients.forEach((client) => {
    try { client.res.write(payload); } catch (e) {}
  });
}

function broadcastFb(event, data) {
  const payload = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  fbSseClients.forEach((client) => {
    try { client.res.write(payload); } catch (e) {}
  });
}

// ==========================================
// TIKTOK LOGIC & FIREBASE SYNC
// ==========================================
async function sendHeartbeat() {
  try {
    const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + currentRoom + "/crawler_master.json";
    await fetch(fbUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeDeviceId: "armbian_tvbox",
        activeDeviceName: "TV Box Armbian (24/7)",
        channel: liveState.username,
        isConnected: liveState.isConnected,
        isStopped: !!liveState.isStopped,
        roomId: liveState.roomId,
        viewerCount: liveState.viewerCount,
        totalCommentsCount: liveState.totalCommentsCount,
        lastHeartbeat: Date.now(),
        status: liveState.isStopped ? "stopped" : (liveState.isConnected ? "active" : "standby"),
        lastError: liveState.lastError
      })
    });
  } catch (e) {}
}

let pendingCommentsQueue = [];
let syncDebounceTimer = null;

function syncToFirebase(item, room = "hienpham_live") {
  const itemTs = Number(item.ts) || Date.now();
  if (lastHandledClearTime > 0 && itemTs <= lastHandledClearTime) {
    return;
  }
  
  // Deduplicate before adding to pendingCommentsQueue
  const cleanUser = String(item.user || item.nickname || "").trim().toLowerCase();
  const cleanContent = String(item.content || item.comment || "").trim().toLowerCase();
  const timeBucket = Math.floor(itemTs / 3500);
  const incomingSig = cleanUser + "_" + cleanContent + "_" + timeBucket;
  const incomingId = String(item.id || "");

  const isDup = pendingCommentsQueue.some((existing) => {
    if (incomingId && String(existing.id) === incomingId) return true;
    const exTs = Number(existing.ts) || 0;
    const exBucket = Math.floor(exTs / 3500);
    const exUser = String(existing.user || existing.nickname || "").trim().toLowerCase();
    const exContent = String(existing.content || existing.comment || "").trim().toLowerCase();
    return (exUser + "_" + exContent + "_" + exBucket) === incomingSig;
  });

  if (!isDup) {
    pendingCommentsQueue.unshift(item);
    if (pendingCommentsQueue.length > 150) pendingCommentsQueue.pop();
  }

  if (!syncDebounceTimer) {
    syncDebounceTimer = setTimeout(async () => {
      syncDebounceTimer = null;
      try {
        const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + room + "/comments.json";
        await fetch(fbUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: pendingCommentsQueue.slice(0, 150),
            updatedAt: Date.now(),
            deviceId: "armbian_tvbox"
          })
        });
      } catch (err) {
        console.error("Lỗi Firebase sync TikTok:", err.message);
      }
    }, 100);
  }
}

async function syncTargetChannelToFirebase(cleanChannel, room = "hienpham_live", isStopped = false) {
  try {
    const url = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + room + "/target_channel.json";
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: cleanChannel,
        isStopped: isStopped,
        action: isStopped ? "stop" : "start",
        requestedAt: Date.now(),
        requestedBy: "armbian_tvbox"
      })
    });
  } catch (e) {}
}

async function checkRemoteTargetChannel() {
  try {
    const url = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + currentRoom + "/target_channel.json";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        const reqTime = Number(data.requestedAt) || 0;
        
        if ((data.action === "update" || data.isUpdating === true) && reqTime > lastHandledRequestTime) {
          console.log("=> 🔄 Nhận lệnh CẬP NHẬT MÃ NGUỒN từ xa qua Firebase.");
          lastHandledRequestTime = reqTime;
          performSelfUpdate(data.updateUrl);
          return;
        }

        if (data.action === "clear_feed" || data.action === "clear_comments" || (data.clearedAt && Number(data.clearedAt) > lastHandledClearTime)) {
          const clearTs = Number(data.clearedAt || data.requestedAt) || Date.now();
          if (clearTs > lastHandledClearTime) {
            lastHandledClearTime = clearTs;
            console.log("=> 🧹 [Armbian] Nhận lệnh XOÁ FEED TIKTOK từ xa qua Firebase:", clearTs);
            pendingCommentsQueue = [];
            liveState.recentComments = [];
            liveState.totalCommentsCount = 0;
            broadcast("status", liveState);
            broadcast("clear_comments", { clearedAt: clearTs });
          }
        }

        if (data.isStopped === true || data.action === "stop") {
          if (reqTime > lastHandledRequestTime && !liveState.isStopped) {
            console.log("=> 🛑 Nhận lệnh DỪNG CÀO TIKTOK từ xa qua Firebase.");
            lastHandledRequestTime = reqTime;
            stopTikTok(true);
            return;
          }
        }

        const rawChan = data.channel || data.username || "";
        if (rawChan) {
          const targetClean = rawChan.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, "").replace(/\/live.*$/i, "").replace(/^@+/, "").trim();
          if (targetClean && (reqTime > lastHandledRequestTime || (targetClean.toLowerCase() !== (liveState.username || "").toLowerCase() && !liveState.isStopped))) {
            if (data.action === "start" || data.isStopped === false || targetClean.toLowerCase() !== (liveState.username || "").toLowerCase()) {
              console.log("=> 🚀 Nhận lệnh BẮT ĐẦU cào TikTok từ xa: @" + targetClean);
              lastHandledRequestTime = reqTime || Date.now();
              startTikTok(targetClean, currentRoom, true);
            }
          }
        }
      }
    }
  } catch (e) {}
}

function stopTikTok(isRemoteCommand = false) {
  console.log("=> 🛑 Đã dừng cào TikTok @" + liveState.username);
  if (currentConn) {
    try {
      if (typeof currentConn.removeAllListeners === 'function') {
        currentConn.removeAllListeners();
      }
      currentConn.disconnect();
    } catch (e) {}
    currentConn = null;
  }
  isAttempting = false;
  liveState.isConnected = false;
  liveState.isStopped = true;
  liveState.roomId = null;
  liveState.lastError = "Đã dừng cào TikTok (đang nghỉ).";
  
  broadcast("status", liveState);
  sendHeartbeat();

  if (!isRemoteCommand) {
    lastHandledRequestTime = Date.now();
    syncTargetChannelToFirebase(liveState.username, currentRoom, true);
  }
}

async function startTikTok(user, syncRoom = "hienpham_live", isRemoteCommand = false) {
  if (currentConn) {
    try {
      if (typeof currentConn.removeAllListeners === 'function') {
        currentConn.removeAllListeners();
      }
      currentConn.disconnect();
    } catch (e) {}
    currentConn = null;
  }
  
  const clean = (user || "hienpham.965286096").replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, "").replace(/\/live.*$/i, "").replace(/^@+/, "").trim();
  
  liveState.username = clean;
  currentRoom = syncRoom;
  liveState.isConnected = false;
  liveState.isStopped = false;
  liveState.roomId = null;
  liveState.viewerCount = 0;
  liveState.totalLikesCount = 0;
  liveState.totalCommentsCount = 0;
  liveState.recentComments = [];
  liveState.lastError = "Đang khởi tạo kết nối TikTok @" + clean + "...";
  nextAllowedAttemptTime = 0;
  
  broadcast("status", liveState);
  sendHeartbeat();

  if (!isRemoteCommand) {
    lastHandledRequestTime = Date.now();
    syncTargetChannelToFirebase(clean, syncRoom, false);
  }

  setTimeout(() => {
    attemptConnect();
  }, 200);
}

async function attemptConnect() {
  if (isAttempting) return;
  if (Date.now() < nextAllowedAttemptTime) return;
  
  isAttempting = true;
  const clean = liveState.username;

  try {
    console.log("[TikTok 24/7] Kiểm tra trạng thái kênh @" + clean + "...");
    
    if (currentConn) {
      try {
        if (typeof currentConn.removeAllListeners === 'function') {
          currentConn.removeAllListeners();
        }
        currentConn.disconnect();
      } catch (e) {}
      currentConn = null;
    }

    const conn = new TikTokLiveConnection(clean, {
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

    let isLive = true; // Mặc định thử kết nối trực tiếp
    try {
      isLive = await conn.fetchIsLive();
    } catch (e) {
      const fetchErrMsg = e && e.message ? e.message : String(e);
      // Nếu lỗi do mạng hoặc Euler sign server, vẫn cho phép thử kết nối trực tiếp thay vì kết luận kênh không live
      if (fetchErrMsg.includes("retry-after") || fetchErrMsg.includes("RateLimit") || fetchErrMsg.includes("Too many")) {
        throw e;
      }
      isLive = true;
    }

    if (!isLive) {
      liveState.isConnected = false;
      liveState.roomId = null;
      liveState.lastError = "Kênh @" + clean + " hiện CHƯA PHÁT LIVE. Máy chủ đang tự động dò tìm...";
      console.log("[TikTok 24/7] Kênh @" + clean + " chưa Live. Sẽ tự động dò lại sau.");
      broadcast("status", liveState);
      sendHeartbeat();
      isAttempting = false;
      return;
    }

    console.log("[TikTok 24/7] Kênh @" + clean + " ĐANG BẬT LIVE! Đang kết nối phòng...");
    currentConn = conn;

    conn.on("connected", (state) => {
      liveState.isConnected = true;
      liveState.roomId = state && state.roomId ? String(state.roomId) : null;
      liveState.connectedAt = Date.now();
      liveState.lastError = null;
      console.log("=> ✅ ĐÃ KẾT NỐI THÀNH CÔNG TIKTOK LIVE @" + clean + " (Room ID: " + (liveState.roomId || "") + ")");
      broadcast("status", liveState);
      sendHeartbeat();
    });

    conn.on("chat", (data) => {
      if (!data) return;
      const usr = data.nickname || (data.user && data.user.nickname) || data.uniqueId || (data.user && data.user.uniqueId) || (data.userDetails && data.userDetails.nickname) || "Khách";
      const uId = data.uniqueId || (data.user && data.user.uniqueId) || "";
      const msg = (data.comment || data.content || data.text || (data.commentDetails && data.commentDetails.text) || "").trim();
      if (!msg) return;

      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");
      const avatar = data.profilePictureUrl || (data.user && (data.user.profilePictureUrl || (data.user.avatarThumb && data.user.avatarThumb.urlList && data.user.avatarThumb.urlList[0]))) || "";
      
      const item = {
        id: String(data.msgId || ("tt_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5))),
        user: usr,
        nickname: usr,
        uniqueId: uId,
        content: msg,
        comment: msg,
        time: timeStr,
        avatar: avatar,
        ts: Date.now(),
        platform: "tiktok"
      };

      liveState.totalCommentsCount += 1;
      liveState.recentComments.unshift(item);
      if (liveState.recentComments.length > 50) liveState.recentComments.pop();

      console.log("[TikTok][" + usr + "]: " + msg);
      broadcast("chat", item);
      broadcast("comment", item);
      syncToFirebase(item, currentRoom);
    });

    conn.on("roomUser", (data) => {
      if (data) {
        const count = typeof data.viewerCount === "number" ? data.viewerCount : (Number(data.totalUser) || Number(data.total) || 0);
        if (count > 0) {
          liveState.viewerCount = count;
          broadcast("viewers", { viewerCount: count });
        }
      }
    });

    conn.on("like", (data) => {
      if (data && data.totalLikes) liveState.totalLikesCount = data.totalLikes;
      broadcast("like", data);
    });

    conn.on("disconnected", () => {
      console.log("=> Mất kết nối TikTok Live @" + clean);
      liveState.isConnected = false;
      broadcast("status", liveState);
      sendHeartbeat();
    });

    conn.on("streamEnd", () => {
      console.log("=> Phiên TikTok Live @" + clean + " đã kết thúc.");
      liveState.isConnected = false;
      liveState.lastError = "Phiên Live vừa kết thúc. Máy chủ đang chờ phiên Live kế tiếp...";
      broadcast("status", liveState);
      sendHeartbeat();
    });

    conn.on("error", (err) => {
      const errTxt = err && err.message ? err.message : String(err);
      console.warn("[TikTok Warning @" + clean + "]:", errTxt);
    });

    const state = await conn.connect();
    liveState.isConnected = true;
    liveState.roomId = state && state.roomId ? String(state.roomId) : null;
    liveState.lastError = null;
    broadcast("status", liveState);
    sendHeartbeat();
  } catch (err) {
    const raw = err && err.message ? err.message : String(err || "");
    console.error("Lỗi kết nối TikTok @" + clean + ":", raw);
    
    let friendlyError = raw;
    if (raw.includes("Empty Cookies") || raw.includes("fetchSignedWebSocketFromEulerRoute") || raw.includes("sign server") || raw.includes("Signature")) {
      friendlyError = "Máy chủ chữ ký TikTok đang tải lại kết nối. (Bình luận vẫn đang được thu thập qua Tampermonkey). Sẽ tự thử lại...";
      nextAllowedAttemptTime = Date.now() + 10000;
    } else if (raw.includes("retry-after") || raw.includes("RateLimit") || raw.includes("Too many connections") || raw.includes("SignatureRateLimitError") || raw.includes("reading 'retry-after'")) {
      friendlyError = "TikTok đang tạm giới hạn kết nối (Rate Limit). Vui lòng đợi 30 giây...";
      nextAllowedAttemptTime = Date.now() + 30000;
    } else if (raw.includes("Unexpected server response: 200") || raw.includes("is not valid JSON") || raw.includes("Unexpected token") || raw.includes("The page")) {
      friendlyError = "Kênh @" + clean + " hiện chưa bật Live hoặc vừa kết thúc Live.";
    } else if (raw.includes("LIVE_NOT_FOUND") || raw.includes("not live") || raw.includes("offline")) {
      friendlyError = "Kênh @" + clean + " hiện không phát trực tiếp.";
    } else if (raw.includes("USER_NOT_FOUND") || raw.includes("User not found")) {
      friendlyError = "Không tìm thấy tài khoản TikTok @" + clean;
    }

    liveState.isConnected = false;
    liveState.roomId = null;
    liveState.lastError = friendlyError;
    broadcast("status", liveState);
    sendHeartbeat();
  } finally {
    isAttempting = false;
  }
}

// ==========================================
// 3. FACEBOOK LIVE CRAWLER ENGINE
// ==========================================

// Trích xuất Video ID hoặc Page ID từ đường dẫn Facebook (Hỗ trợ link share /v/, /r/, fb.watch và chuyển hướng 302)
async function resolveAndExtractFacebookIds(input) {
  if (!input) return { videoId: null, pageId: null, resolvedUrl: input };
  let str = input.trim();
  
  // Nếu là số nguyên thuần túy (Video ID)
  if (/^\d{10,25}$/.test(str)) {
    return { videoId: str, pageId: null, resolvedUrl: str };
  }

  // Nếu là link rút gọn share hoặc fb.watch -> Giải quyết redirect HTTP HEAD/GET
  if (str.includes("/share/") || str.includes("fb.watch") || str.includes("/sharer/")) {
    try {
      const res = await fetch(str, {
        method: "HEAD",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      const loc = res.headers.get("location");
      if (loc) {
        str = loc;
        console.log("=> 🔗 [Facebook] Đã giải quyết link share sang link gốc:", str);
      }
    } catch (e) {
      try {
        const res2 = await fetch(str, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (res2.url && res2.url !== str) {
          str = res2.url;
          console.log("=> 🔗 [Facebook] Đã giải quyết link share qua GET redirect:", str);
        }
      } catch (e2) {}
    }
  }

  let videoId = null;
  let pageId = null;

  // Pattern 0: story.php?story_fbid=123456
  const matchStoryFbid = str.match(/story_fbid=(\d+)/);
  if (matchStoryFbid) videoId = matchStoryFbid[1];

  const matchIdParam = str.match(/[?&]id=(\d+)/);
  if (matchIdParam && !pageId) pageId = matchIdParam[1];

  // Pattern 1: facebook.com/.../videos/123456/
  const matchVideos = str.match(/\/videos\/(\d+)/);
  if (matchVideos && !videoId) videoId = matchVideos[1];

  // Pattern 2: facebook.com/watch/live/?v=123456 hoặc ?v=123456
  const matchV = str.match(/[?&]v=(\d+)/);
  if (matchV && !videoId) videoId = matchV[1];

  // Pattern 3: facebook.com/watch/?v=123456 hoặc /watch/123456
  const matchWatch = str.match(/\/watch\/(?:live\/\?v=|\?v=)?(\d+)/);
  if (matchWatch && !videoId) videoId = matchWatch[1];

  // Pattern 4: facebook.com/.../posts/123456 hoặc /permalink/123456
  const matchPosts = str.match(/\/(?:posts|permalink)\/(\d+)/);
  if (matchPosts && !videoId) videoId = matchPosts[1];

  // Pattern 5: Page username / ID (loại trừ các từ khóa hệ thống của FB như 'share', 'watch', 'live'...)
  const matchPage = str.match(/facebook\.com\/([a-zA-Z0-9._-]+)\/?/);
  if (matchPage && !['watch', 'live', 'video', 'videos', 'story', 'stories', 'share', 'sharer', 'permalink.php', 'photo.php', 'story.php'].includes(matchPage[1])) {
    pageId = matchPage[1];
  }

  return { videoId, pageId: pageId || null, resolvedUrl: str };
}

// Bản đồng bộ dự phòng cho extractFacebookIds
function extractFacebookIds(input) {
  if (!input) return { videoId: null, pageId: null };
  const str = input.trim();
  
  if (/^\d{10,25}$/.test(str)) {
    return { videoId: str, pageId: null };
  }

  let videoId = null;
  let pageId = null;

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

  return { videoId, pageId: pageId || null };
}

// Gửi Heartbeat Facebook lên Firebase
async function sendFbHeartbeat() {
  try {
    const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + currentFbRoom + "/crawler_master.json";
    await fetch(fbUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeDeviceId: "armbian_tvbox_fb",
        activeDeviceName: "TV Box Armbian Facebook (24/7)",
        target: fbLiveState.target,
        videoId: fbLiveState.videoId,
        isConnected: fbLiveState.isConnected,
        isStopped: !!fbLiveState.isStopped,
        totalCommentsCount: fbLiveState.totalCommentsCount,
        lastHeartbeat: Date.now(),
        status: fbLiveState.isStopped ? "stopped" : (fbLiveState.isConnected ? "active" : "standby"),
        lastError: fbLiveState.lastError
      })
    });
  } catch (e) {}
}

// Đồng bộ bình luận Facebook lên Firebase RTDB
function syncFbToFirebase(item, room = "hienpham_live_fb") {
  const itemTs = Number(item.ts) || Date.now();
  if (lastFbHandledClearTime > 0 && itemTs <= lastFbHandledClearTime) {
    return;
  }
  pendingFbCommentsQueue.unshift(item);
  if (pendingFbCommentsQueue.length > 150) pendingFbCommentsQueue.pop();

  if (!syncFbDebounceTimer) {
    syncFbDebounceTimer = setTimeout(async () => {
      syncFbDebounceTimer = null;
      try {
        const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + room + "/comments.json";
        await fetch(fbUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: pendingFbCommentsQueue.slice(0, 150),
            updatedAt: Date.now(),
            deviceId: "armbian_tvbox"
          })
        });
      } catch (err) {
        console.error("Lỗi Firebase sync Facebook:", err.message);
      }
    }, 100);
  }
}

// Quét bình luận trực tiếp từ Facebook Live Video ID
async function pollFacebookLiveComments() {
  if (fbLiveState.isStopped) return;

  const vId = fbLiveState.videoId;
  const token = fbLiveState.accessToken ? fbLiveState.accessToken.trim() : (serverConfig.fbToken ? serverConfig.fbToken.trim() : "");

  // 1. NẾU TOKEN LÀ PANCAKE PUBLIC API (bắt đầu bằng eyJ...)
  if (token.startsWith("eyJ")) {
    let pageId = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      if (payload && payload.id) pageId = String(payload.id);
    } catch (e) {}
    if (!pageId) pageId = serverConfig.fbPageId || "100546631959960";

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const sinceSec = nowSec - 7 * 86400;
      const untilSec = nowSec + 3600;
      const pUrl = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations?access_token=${encodeURIComponent(token)}&since=${sinceSec}&until=${untilSec}&page_number=1`;
      const pRes = await fetch(pUrl);
      if (pRes.ok) {
        const pJson = await pRes.json();
        const convos = pJson.conversations || pJson.data || [];
        for (const c of convos) {
          if (vId && c.post_id && !c.post_id.includes(vId)) {
            continue;
          }
          const cId = String(c.id || c.comment_id || "");
          if (!cId || fbSeenCommentIds.has(cId)) continue;
          fbSeenCommentIds.add(cId);

          if (fbSeenCommentIds.size > 2500) {
            const first = fbSeenCommentIds.values().next().value;
            fbSeenCommentIds.delete(first);
          }

          const rawUser = c.from?.name || c.customer?.name || c.customers?.[0]?.name || "Khách FB";
          const rawContent = (c.message || c.snippet || "").trim();
          if (!rawContent) continue;

          const now = new Date(c.inserted_at || c.updated_at || c.created_time || Date.now());
          const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");
          const fbId = c.from?.id || c.customers?.[0]?.fb_id || "";
          const avatarUrl = c.customer?.avatar_url || (fbId ? `https://graph.facebook.com/${fbId}/picture?type=small` : "");

          const item = {
            id: "pancake_" + cId,
            user: rawUser,
            nickname: rawUser,
            content: rawContent,
            comment: rawContent,
            time: timeStr,
            avatar: avatarUrl,
            ts: now.getTime() || Date.now(),
            platform: "facebook"
          };

          fbLiveState.recentComments.unshift(item);
          if (fbLiveState.recentComments.length > 100) fbLiveState.recentComments.pop();
          fbLiveState.totalCommentsCount++;

          broadcastFb("comment", item);
          syncFbToFirebase(item, currentFbRoom);
        }

        fbLiveState.isConnected = true;
        fbLiveState.lastError = null;
        broadcastFb("status", fbLiveState);
        sendFbHeartbeat();
        return;
      }
    } catch (errPancake) {
      console.warn("[Pancake] Lỗi cào Pancake:", errPancake.message);
    }
  }

  // 2. FACEBOOK GRAPH API (Token bắt đầu bằng EAA...)
  if (!vId) return;
  if (!token) {
    fbLiveState.isConnected = false;
    fbLiveState.lastError = `Đã nhận diện Video Live #${vId}. Facebook yêu cầu Page Token hoặc Pancake Token để cào bình luận. Bạn có thể cài đặt trực tiếp trên TV Box.`;
    broadcastFb("status", fbLiveState);
    sendFbHeartbeat();
    return;
  }

  try {
    let comments = [];

    // Dùng Facebook Graph API v21.0 với Page Token hoặc User Token
    const url = `https://graph.facebook.com/v21.0/${vId}/comments?order=reverse_chronological&limit=50&fields=id,from{id,name,picture},message,created_time&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        comments = json.data;
      }
      fbLiveState.isConnected = true;
      fbLiveState.lastError = null;
    } else {
      const errJson = await res.json().catch(() => ({}));
      if (errJson && errJson.error) {
        const code = errJson.error.code;
        let msg = errJson.error.message || "Lỗi xác thực Token";
        if (code === 190) {
          msg = "Facebook Access Token đã hết hạn! Vui lòng làm mới Token.";
        } else if (code === 100) {
          msg = "Không tìm thấy bài Live hoặc Video ID không tồn tại trên Facebook.";
        } else if (code === 104) {
          msg = "Facebook yêu cầu Token hợp lệ để đọc bình luận bài viết.";
        } else if (code === 200) {
          // Thử tự động đổi sang Page Access Token nếu token hiện tại là User Token
          try {
            const pageTok = await resolvePageAccessToken(token, fbLiveState.target || fbLiveState.pageId || vId);
            if (pageTok && pageTok !== token) {
              console.log("=> 🔄 [Facebook] Đã phát hiện Page Token thay thế sau lỗi #200! Đang tự động kết nối lại...");
              fbLiveState.accessToken = pageTok;
              serverConfig.fbToken = pageTok;
              saveServerConfig();
              return pollFacebookLiveComments();
            }
          } catch (eSwap) {}
          msg = "(#200) Thiếu quyền đọc bình luận! Vui lòng nhập Page Access Token hoặc Pancake Token trên máy chủ TV Box.";
        }
        fbLiveState.lastError = `[Facebook] ${msg}`;
        broadcastFb("status", fbLiveState);
        sendFbHeartbeat();
      }
    }

    if (comments && comments.length > 0) {
      fbLiveState.isConnected = true;
      fbLiveState.lastError = null;

      // Xử lý từ cũ đến mới (đảo ngược vì API trả về reverse_chronological)
      const reversed = [...comments].reverse();
      for (const c of reversed) {
        const cId = String(c.id);
        if (fbSeenCommentIds.has(cId)) continue;
        fbSeenCommentIds.add(cId);

        // Giới hạn bộ nhớ seen
        if (fbSeenCommentIds.size > 2000) {
          const first = fbSeenCommentIds.values().next().value;
          fbSeenCommentIds.delete(first);
        }

        const rawUser = (c.from && c.from.name) || "Khách Facebook";
        const rawContent = (c.message || "").trim();
        if (!rawContent) continue;

        const now = new Date(c.created_time || Date.now());
        const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");
        const avatarUrl = (c.from && c.from.picture && c.from.picture.data && c.from.picture.data.url) || `https://graph.facebook.com/${c.from?.id || ''}/picture?type=small`;

        const item = {
          id: "fb_" + cId,
          user: rawUser,
          nickname: rawUser,
          content: rawContent,
          comment: rawContent,
          time: timeStr,
          avatar: avatarUrl,
          ts: now.getTime() || Date.now(),
          platform: "facebook"
        };

        fbLiveState.totalCommentsCount += 1;
        fbLiveState.recentComments.unshift(item);
        if (fbLiveState.recentComments.length > 50) fbLiveState.recentComments.pop();

        console.log("[Facebook][" + rawUser + "]: " + rawContent);
        broadcastFb("chat", item);
        broadcastFb("comment", item);
        syncFbToFirebase(item, currentFbRoom);
      }

      broadcastFb("status", fbLiveState);
    }
  } catch (err) {
    console.warn("[Facebook Poll Warning]:", err.message);
  }
}

// Tự động phát hiện phiên Live mới nhất của Fanpage
async function autoDetectFanpageLive() {
  if (fbLiveState.isStopped || !fbLiveState.pageId || fbLiveState.isConnected) return;

  const page = fbLiveState.pageId;
  const token = fbLiveState.accessToken ? fbLiveState.accessToken.trim() : "";

  try {
    console.log("[Facebook 24/7] Đang kiểm tra phiên Live mới trên Fanpage:", page);
    if (token) {
      const url = `https://graph.facebook.com/v21.0/${page}/live_videos?status=LIVE_NOW&fields=id,status,creation_time,video{id}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json && json.data && json.data.length > 0) {
          const liveItem = json.data[0];
          const newVideoId = (liveItem.video && liveItem.video.id) || liveItem.id;
          if (newVideoId && newVideoId !== fbLiveState.videoId) {
            console.log("=> 🚀 [Facebook] ĐÃ PHÁT HIỆN BUỔI LIVE MỚI CỦA FANPAGE! Video ID:", newVideoId);
            fbLiveState.videoId = String(newVideoId);
            fbLiveState.isConnected = true;
            fbLiveState.connectedAt = Date.now();
            fbLiveState.lastError = null;
            fbSeenCommentIds.clear();
            broadcastFb("status", fbLiveState);
            sendFbHeartbeat();
          }
        } else {
          fbLiveState.isConnected = false;
          fbLiveState.lastError = "Fanpage hiện chưa bật Live. Máy chủ đang tự động chờ phiên Live mới...";
          broadcastFb("status", fbLiveState);
          sendFbHeartbeat();
        }
      }
    } else {
      fbLiveState.isConnected = false;
      fbLiveState.lastError = `Đang theo dõi Fanpage ${page}. Facebook yêu cầu Page Token để tự động dò tìm Live và lấy bình luận.`;
      broadcastFb("status", fbLiveState);
      sendFbHeartbeat();
    }
  } catch (e) {
    console.warn("[Facebook AutoDetect Warning]:", e.message);
  }
}

// Tự động chuyển đổi User Token sang Page Token nếu là tài khoản quản lý Fanpage
async function resolvePageAccessToken(token, targetHint = "") {
  if (!token) return token;
  try {
    const accUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token.trim())}`;
    const accRes = await fetch(accUrl);
    if (accRes.ok) {
      const accJson = await accRes.json();
      const pages = accJson.data || [];
      if (Array.isArray(pages) && pages.length > 0) {
        const hintLower = (targetHint || "").toLowerCase();
        const matched = pages.find(p => 
          hintLower.includes(p.id) || 
          (p.name && hintLower.includes(p.name.toLowerCase())) ||
          (p.name && p.name.toLowerCase().includes("hiền")) ||
          (p.name && p.name.toLowerCase().includes("hien"))
        ) || pages[0];

        if (matched && matched.access_token) {
          console.log(`=> 🔑 [Facebook] Tự động trích xuất Page Token của: "${matched.name}" (ID: ${matched.id})`);
          return matched.access_token;
        }
      }
    }
  } catch (err) {
    console.warn("[Facebook] Lỗi trích xuất Page Token:", err.message);
  }
  return token;
}

// Bắt đầu cào Facebook Live
async function startFacebookLive(targetInput, token = "", syncRoom = "hienpham_live_fb") {
  const { videoId, pageId, resolvedUrl } = await resolveAndExtractFacebookIds(targetInput);
  
  fbLiveState.target = targetInput || "";
  fbLiveState.videoId = videoId;
  fbLiveState.pageId = pageId;
  fbLiveState.resolvedUrl = resolvedUrl || targetInput;

  let activeToken = token ? token.trim() : (fbLiveState.accessToken || serverConfig.fbToken || "");
  if (activeToken) {
    if (!activeToken.startsWith("eyJ")) {
      activeToken = await resolvePageAccessToken(activeToken, targetInput || pageId || videoId);
    }
    fbLiveState.accessToken = activeToken;
    serverConfig.fbToken = activeToken;
  }
  if (targetInput) serverConfig.fbTarget = targetInput;
  if (pageId) serverConfig.fbPageId = pageId;
  saveServerConfig();

  currentFbRoom = syncRoom;
  fbLiveState.isStopped = false;
  fbLiveState.totalCommentsCount = 0;
  fbLiveState.recentComments = [];
  fbSeenCommentIds.clear();

  if (videoId) {
    if (fbLiveState.accessToken) {
      fbLiveState.isConnected = true;
      fbLiveState.lastError = `Đang kết nối Video Live #${videoId}...`;
    } else {
      fbLiveState.isConnected = false;
      fbLiveState.lastError = `Đã nhận diện Video Live #${videoId}. Cần có Facebook Token để đọc bình luận!`;
    }
  } else if (pageId) {
    fbLiveState.isConnected = false;
    fbLiveState.lastError = `Đang theo dõi Fanpage ${pageId}. Đang chờ phiên Live...`;
  } else {
    fbLiveState.isConnected = false;
    fbLiveState.lastError = "Không tìm thấy Video ID hoặc Fanpage từ link.";
  }

  console.log("=> 📘 Bắt đầu cào Facebook Live:", { targetInput, videoId, pageId, hasToken: !!fbLiveState.accessToken });
  broadcastFb("status", fbLiveState);
  sendFbHeartbeat();

  if (fbPollTimer) clearInterval(fbPollTimer);
  fbPollTimer = setInterval(pollFacebookLiveComments, 1500);

  if (fbAutoDetectTimer) clearInterval(fbAutoDetectTimer);
  fbAutoDetectTimer = setInterval(autoDetectFanpageLive, 10000);

  // Chạy ngay 1 lượt kiểm tra
  if (videoId) {
    pollFacebookLiveComments();
  } else {
    autoDetectFanpageLive();
  }
}

// Dừng cào Facebook Live
function stopFacebookLive() {
  console.log("=> 🛑 Đã dừng cào Facebook Live.");
  if (fbPollTimer) clearInterval(fbPollTimer);
  if (fbAutoDetectTimer) clearInterval(fbAutoDetectTimer);
  fbPollTimer = null;
  fbAutoDetectTimer = null;

  fbLiveState.isConnected = false;
  fbLiveState.isStopped = true;
  fbLiveState.lastError = "Đã dừng cào Facebook Live.";
  broadcastFb("status", fbLiveState);
  sendFbHeartbeat();
}

// Kiểm tra lệnh Facebook từ xa qua Firebase RTDB
async function checkRemoteFbTargetChannel() {
  try {
    const url = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + currentFbRoom + "/target_channel.json";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        const reqTime = Number(data.requestedAt) || 0;
        if (data.action === "clear_feed" || data.action === "clear_comments" || (data.clearedAt && Number(data.clearedAt) > lastFbHandledClearTime)) {
          const clearTs = Number(data.clearedAt || data.requestedAt) || Date.now();
          if (clearTs > lastFbHandledClearTime) {
            lastFbHandledClearTime = clearTs;
            console.log("=> 🧹 [Armbian] Nhận lệnh XOÁ FEED FACEBOOK từ xa qua Firebase:", clearTs);
            pendingFbCommentsQueue = [];
            fbLiveState.recentComments = [];
            fbLiveState.totalCommentsCount = 0;
            broadcastFb("status", fbLiveState);
            broadcastFb("clear_comments", { clearedAt: clearTs });
          }
        }

        if (data.isStopped === true || data.action === "stop") {
          if (reqTime > lastFbHandledRequestTime && !fbLiveState.isStopped) {
            console.log("=> 🛑 Nhận lệnh DỪNG CÀO FACEBOOK từ xa qua Firebase.");
            lastFbHandledRequestTime = reqTime;
            stopFacebookLive();
            return;
          }
        }

        const rawTarget = data.target || data.url || data.videoId || data.pageId || "";
        if (rawTarget && reqTime > lastFbHandledRequestTime) {
          lastFbHandledRequestTime = reqTime;
          console.log("=> 🚀 Nhận lệnh BẮT ĐẦU cào Facebook từ xa:", rawTarget);
          await startFacebookLive(rawTarget, data.accessToken || fbLiveState.accessToken, currentFbRoom);
        }
      }
    }
  } catch (e) {}
}

// ==========================================
// BACKGROUND TIMERS & INTERVALS
// ==========================================
setInterval(async () => {
  await checkRemoteTargetChannel();
  await checkRemoteFbTargetChannel();
}, 3000);

setInterval(async () => {
  if (!liveState.isConnected && !liveState.isStopped && liveState.username) {
    await attemptConnect();
  }
  await sendHeartbeat();
  await sendFbHeartbeat();
}, 10000);

// Tự động kiểm tra bản cập nhật mới mỗi 60 phút
setInterval(async () => {
  try {
    await performSelfUpdate();
  } catch (e) {}
}, 60 * 60 * 1000);

// ==========================================
// API ROUTES
// ==========================================

// ==========================================
// 3. MÁY IN LAN XPRINTER K80 (CỔNG 9100)
// ==========================================
function sendToLanPrinter(printerIp, printerPort = 9100, buffer, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const ip = (printerIp || serverConfig.printerIp || "192.168.1.198").trim();
    const port = Number(printerPort || serverConfig.printerPort || 9100);

    if (!ip) {
      return reject(new Error("Chưa cấu hình địa chỉ IP máy in LAN"));
    }

    const socket = new net.Socket();
    let isSettled = false;

    socket.setTimeout(timeoutMs);

    socket.connect(port, ip, () => {
      console.log(`[LAN Printer] ✅ Kết nối thành công tới ${ip}:${port}, đang bắn ${buffer.length} bytes ESC/POS...`);
      socket.write(buffer, (err) => {
        if (err) {
          socket.destroy();
          if (!isSettled) {
            isSettled = true;
            reject(err);
          }
          return;
        }
        // Đợi 150ms để máy in nhận trọn vẹn dữ liệu trước khi ngắt socket
        setTimeout(() => {
          socket.end();
          if (!isSettled) {
            isSettled = true;
            resolve({ success: true, bytes: buffer.length });
          }
        }, 150);
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      if (!isSettled) {
        isSettled = true;
        let msg = err.message;
        if (err.code === "ECONNREFUSED") {
          msg = `Máy in từ chối kết nối (${ip}:${port}). Hãy kiểm tra cổng 9100 hoặc khởi động lại máy in.`;
        } else if (err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH") {
          msg = `Không tìm thấy máy in tại ${ip}:${port} (Timeout). Hãy kiểm tra dây mạng LAN/WiFi và nguồn máy in.`;
        }
        console.error(`[LAN Printer] ❌ Lỗi kết nối ${ip}:${port}:`, msg);
        reject(new Error(msg));
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      if (!isSettled) {
        isSettled = true;
        const msg = `Hết thời gian chờ kết nối máy in (${ip}:${port}, timeout ${timeoutMs}ms).`;
        console.error(`[LAN Printer] ❌ Timeout:`, msg);
        reject(new Error(msg));
      }
    });
  });
}

function generateTestReceiptBuffer(printerIp, autoCut = true) {
  const parts = [];
  // 1. Reset / Initialize printer
  parts.push(Buffer.from([0x1B, 0x40])); // ESC @
  
  // 2. Center alignment
  parts.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1
  
  // 3. Double size header
  parts.push(Buffer.from([0x1D, 0x21, 0x11])); // GS ! 0x11 (Double width & height)
  parts.push(Buffer.from("XPRINTER K80 LAN\n", "ascii"));
  
  // 4. Normal text
  parts.push(Buffer.from([0x1D, 0x21, 0x00])); // GS ! 0x00
  parts.push(Buffer.from("IN TRUC TIEP QUA PORT 9100\n", "ascii"));
  parts.push(Buffer.from("================================\n", "ascii"));
  
  // 5. Left alignment for info
  parts.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0
  parts.push(Buffer.from(`May chu: Armbian TV Box 24/7\n`, "ascii"));
  parts.push(Buffer.from(`IP May in: ${printerIp}:9100\n`, "ascii"));
  parts.push(Buffer.from(`Thoi gian: ${new Date().toLocaleString('vi-VN')}\n`, "ascii"));
  parts.push(Buffer.from(`Trang thai: KET NOI THANH CONG\n`, "ascii"));
  parts.push(Buffer.from("--------------------------------\n", "ascii"));
  
  // 6. Center alignment for success message
  parts.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1
  parts.push(Buffer.from([0x1B, 0x45, 0x01])); // ESC E 1 (Bold ON)
  parts.push(Buffer.from("TEST IN HOAN TAT 100%!\n", "ascii"));
  parts.push(Buffer.from([0x1B, 0x45, 0x00])); // ESC E 0 (Bold OFF)
  parts.push(Buffer.from("Khong can app trung gian RawBT\n", "ascii"));
  parts.push(Buffer.from("Toc do in tuc thi 0.1s\n", "ascii"));
  parts.push(Buffer.from("================================\n\n\n\n", "ascii"));
  
  // 7. Auto cut paper
  if (autoCut) {
    parts.push(Buffer.from([0x1D, 0x56, 0x41, 0x10])); // GS V 65 16 (Feed and cut)
  }
  
  return Buffer.concat(parts);
}

// Lắng nghe hàng đợi in từ Firebase (để điện thoại in từ xa hoặc khi ở 4G)
let isProcessingPrintQueue = false;
async function pollLanPrintQueue() {
  if (isProcessingPrintQueue) return;
  try {
    const queueUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/hienpham_live/lan_print_queue.json";
    const res = await fetch(queueUrl);
    if (!res.ok) return;
    const queue = await res.json();
    if (!queue || typeof queue !== "object") return;

    isProcessingPrintQueue = true;
    for (const [jobId, job] of Object.entries(queue)) {
      if (!job || !job.rawBase64) continue;
      try {
        console.log(`[LAN Print Queue] 🖨️ Nhận lệnh in từ Firebase (Job: ${jobId})...`);
        const ip = job.ip || serverConfig.printerIp || "192.168.1.198";
        const port = Number(job.port || serverConfig.printerPort || 9100);
        const buffer = Buffer.from(job.rawBase64, "base64");
        await sendToLanPrinter(ip, port, buffer, 5000);
        console.log(`[LAN Print Queue] ✅ Đã in xong Job: ${jobId}`);
      } catch (printErr) {
        console.error(`[LAN Print Queue] ❌ Lỗi in Job ${jobId}:`, printErr.message);
      } finally {
        // Xóa job đã xử lý
        try {
          await fetch(`https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/hienpham_live/lan_print_queue/${jobId}.json`, {
            method: "DELETE"
          });
        } catch (delErr) {}
      }
    }
  } catch (e) {
  } finally {
    isProcessingPrintQueue = false;
  }
}

setInterval(pollLanPrintQueue, 2000);


// ==========================================
// LAN PRINTER APIs (PORT 9100)
// ==========================================

app.get("/api/network/interfaces", (req, res) => {
  const nets = os.networkInterfaces();
  const results = {};
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }
  res.json({ success: true, interfaces: results, all: nets });
});


// Quét tự động máy in cổng 9100 trên toàn bộ dải mạng LAN 192.168.1.x
app.get("/api/print/scan", async (req, res) => {
  const baseSubnet = "192.168.1.";
  const foundPrinters = [];
  const targetPort = 9100;
  
  console.log(`[LAN Scanner] 🔍 Bắt đầu quét máy in cổng ${targetPort} trên dải ${baseSubnet}1-254...`);

  function checkIpPort(ip, port = 9100, timeout = 600) {
    return new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(timeout);
      s.connect(port, ip, () => {
        s.destroy();
        resolve({ ip, open: true });
      });
      s.on("error", () => {
        s.destroy();
        resolve({ ip, open: false });
      });
      s.on("timeout", () => {
        s.destroy();
        resolve({ ip, open: false });
      });
    });
  }

  // Quét theo cụm 30 IPs song song để cực nhanh (~3 giây xong toàn bộ 254 IP)
  const allIps = [];
  for (let i = 1; i <= 254; i++) {
    allIps.push(`${baseSubnet}${i}`);
  }

  const batchSize = 35;
  for (let i = 0; i < allIps.length; i += batchSize) {
    const batch = allIps.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(ip => checkIpPort(ip, targetPort, 800)));
    for (const r of results) {
      if (r.open) {
        foundPrinters.push(r.ip);
        console.log(`[LAN Scanner] 🎯 TÌM THẤY MÁY IN TẠI IP: ${r.ip}:${targetPort}`);
      }
    }
  }

  // Nếu tìm thấy duy nhất 1 máy in, tự động gán vào cấu hình
  if (foundPrinters.length === 1 && serverConfig.printerIp !== foundPrinters[0]) {
    serverConfig.printerIp = foundPrinters[0];
    saveServerConfig();
  }

  res.json({
    success: true,
    serverIp: "192.168.1.53",
    foundPrinters,
    currentConfigIp: serverConfig.printerIp,
    message: foundPrinters.length > 0 
      ? `Đã tìm thấy ${foundPrinters.length} máy in đang mở cổng 9100: ${foundPrinters.join(", ")}` 
      : `Không tìm thấy máy in nào mở cổng 9100 trên dải ${baseSubnet}1-254.`
  });
});

app.get("/api/print/config", (req, res) => {
  res.json({
    success: true,
    printerIp: serverConfig.printerIp || "192.168.1.198",
    printerPort: serverConfig.printerPort || 9100,
    printerAutoCut: serverConfig.printerAutoCut !== false,
    printerMode: serverConfig.printerMode || "lan",
    printerAutoPrintOnOrder: !!serverConfig.printerAutoPrintOnOrder
  });
});

app.post("/api/print/config", (req, res) => {
  const { printerIp, printerPort, printerAutoCut, printerMode, printerAutoPrintOnOrder } = req.body || {};
  if (printerIp) serverConfig.printerIp = printerIp.trim();
  if (printerPort) serverConfig.printerPort = Number(printerPort) || 9100;
  if (typeof printerAutoCut === "boolean") serverConfig.printerAutoCut = printerAutoCut;
  if (printerMode) serverConfig.printerMode = printerMode;
  if (typeof printerAutoPrintOnOrder === "boolean") serverConfig.printerAutoPrintOnOrder = printerAutoPrintOnOrder;
  
  saveServerConfig();
  console.log("=> 🖨️ [Server Config] Đã lưu cấu hình máy in:", {
    ip: serverConfig.printerIp,
    port: serverConfig.printerPort,
    autoCut: serverConfig.printerAutoCut,
    mode: serverConfig.printerMode
  });
  
  res.json({
    success: true,
    message: "Đã lưu cấu hình máy in thành công!",
    config: {
      printerIp: serverConfig.printerIp,
      printerPort: serverConfig.printerPort,
      printerAutoCut: serverConfig.printerAutoCut,
      printerMode: serverConfig.printerMode,
      printerAutoPrintOnOrder: serverConfig.printerAutoPrintOnOrder
    }
  });
});

app.post("/api/print/test", async (req, res) => {
  try {
    const ip = (req.body?.ip || serverConfig.printerIp || "192.168.1.198").trim();
    const port = Number(req.body?.port || serverConfig.printerPort || 9100);
    const cut = req.body?.cut !== false;

    if (req.body?.ip && req.body.ip !== serverConfig.printerIp) {
      serverConfig.printerIp = req.body.ip.trim();
      saveServerConfig();
    }

    console.log(`[LAN Printer] 🖨️ Đang in phiếu test K80 tới ${ip}:${port}...`);
    const testBuf = generateTestReceiptBuffer(ip, cut);
    await sendToLanPrinter(ip, port, testBuf, 4000);

    res.json({
      success: true,
      message: `Đã in phiếu test thành công trên máy in ${ip}:${port}!`
    });
  } catch (err) {
    console.error("[LAN Printer] ❌ Lỗi in phiếu test:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Không thể kết nối tới máy in."
    });
  }
});

app.post("/api/print/lan", async (req, res) => {
  try {
    const ip = (req.body?.ip || serverConfig.printerIp || "192.168.1.198").trim();
    const port = Number(req.body?.port || serverConfig.printerPort || 9100);
    const cut = req.body?.cut !== false;
    const { rawBase64, text } = req.body || {};

    let buffer = null;
    if (rawBase64) {
      buffer = Buffer.from(rawBase64, "base64");
    } else if (text) {
      const parts = [
        Buffer.from([0x1B, 0x40]),
        Buffer.from(text, "utf8"),
        Buffer.from("\n\n\n")
      ];
      if (cut) {
        parts.push(Buffer.from([0x1D, 0x56, 0x41, 0x10]));
      }
      buffer = Buffer.concat(parts);
    } else {
      return res.status(400).json({ success: false, error: "Thiếu dữ liệu in (rawBase64 hoặc text)" });
    }

    console.log(`[LAN Printer] 🖨️ Đang in lệnh ${buffer.length} bytes tới ${ip}:${port}...`);
    await sendToLanPrinter(ip, port, buffer, 5000);
    res.json({ success: true, message: `Đã in thành công tới máy in ${ip}:${port}!` });
  } catch (err) {
    console.error("[LAN Printer] ❌ Lỗi in LAN:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Không thể in qua mạng LAN."
    });
  }
});

app.get("/api/server/version", (req, res) => {
  res.json({
    version: CURRENT_SERVER_VERSION,
    isUpdating,
    tiktok: {
      isConnected: liveState.isConnected,
      isStopped: liveState.isStopped,
      channel: liveState.username
    },
    facebook: {
      isConnected: fbLiveState.isConnected,
      isStopped: fbLiveState.isStopped,
      target: fbLiveState.target,
      videoId: fbLiveState.videoId
    }
  });
});

app.post("/api/server/update", async (req, res) => {
  const { updateUrl } = req.body || {};
  const result = await performSelfUpdate(updateUrl);
  res.json(result);
});

// Nhận trực tiếp mã nguồn đẩy từ trình duyệt web (Direct Code Deployment)
app.post("/api/server/deploy", async (req, res) => {
  try {
    let { code, codeBase64 } = req.body || {};
    if (!code && codeBase64) {
      code = Buffer.from(codeBase64, "base64").toString("utf8");
    }
    if (!code || typeof code !== "string" || !code.includes("express") || code.length < 5000) {
      return res.status(400).json({ success: false, error: "Mã nguồn đẩy lên không hợp lệ hoặc thiếu thư viện cốt lõi." });
    }

    const currentFilePath = __filename;
    let currentCode = "";
    try {
      currentCode = fs.readFileSync(currentFilePath, "utf8");
    } catch (e) {}

    if (code.trim() === currentCode.trim()) {
      return res.json({ success: true, updated: false, message: "Máy chủ hiện đã ở phiên bản mới nhất." });
    }

    fs.writeFileSync(currentFilePath, code, "utf8");
    console.log("=> 🚀 [Direct Deploy] Đã ghi đè mã nguồn mới thành công! Khởi động lại process...");
    res.json({ success: true, updated: true, message: "Đã nạp mã nguồn mới thành công! Máy chủ TV Box đang khởi động lại..." });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// TikTok APIs
app.get("/api/tiktok/status", (req, res) => {
  res.json({
    ...liveState,
    recentComments: liveState.recentComments.slice(0, 40),
    activeClientsCount: sseClients.length
  });
});

app.post("/api/tiktok/connect", async (req, res) => {
  const { username, syncFirebaseRoom = "hienpham_live" } = req.body || {};
  const user = username || liveState.username;
  startTikTok(user, syncFirebaseRoom, false);
  res.json({ 
    success: true, 
    username: user, 
    isConnected: Boolean(liveState.isConnected),
    roomId: liveState.roomId,
    isStopped: false 
  });
});

app.post("/api/tiktok/clear-comments", (req, res) => {
  const clearTs = Number(req.body?.clearedAt) || Date.now();
  lastHandledClearTime = Math.max(lastHandledClearTime, clearTs);
  pendingCommentsQueue = [];
  liveState.recentComments = [];
  liveState.totalCommentsCount = 0;
  broadcast("status", liveState);
  broadcast("clear_comments", { clearedAt: clearTs });
  try {
    const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + currentRoom + "/comments.json";
    fetch(fbUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [],
        updatedAt: clearTs,
        clearedAt: clearTs,
        deviceId: "armbian_tvbox"
      })
    }).catch(() => {});
  } catch (e) {}
  res.json({ success: true, clearedAt: clearTs });
});

app.post("/api/facebook/clear-comments", (req, res) => {
  const clearTs = Number(req.body?.clearedAt) || Date.now();
  lastFbHandledClearTime = Math.max(lastFbHandledClearTime, clearTs);
  pendingFbCommentsQueue = [];
  fbLiveState.recentComments = [];
  fbLiveState.totalCommentsCount = 0;
  broadcastFb("status", fbLiveState);
  broadcastFb("clear_comments", { clearedAt: clearTs });
  try {
    const fbUrl = "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + currentFbRoom + "/comments.json";
    fetch(fbUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [],
        updatedAt: clearTs,
        clearedAt: clearTs,
        deviceId: "armbian_tvbox"
      })
    }).catch(() => {});
  } catch (e) {}
  res.json({ success: true, clearedAt: clearTs });
});

app.post("/api/tiktok/disconnect", (req, res) => {
  stopTikTok(false);
  res.json({ success: true, isStopped: true });
});

app.post("/api/tiktok/reload-browser", (req, res) => {
  const { commandId = `cmd_f5_${Date.now()}`, reason = "live_restart" } = req.body || {};
  console.log(`[TikTok Live] 🔄 Phát lệnh Auto F5 tới tất cả trình duyệt cmt (Lý do: ${reason})`);
  broadcast("reload_browser", {
    commandId,
    reason,
    timestamp: Date.now()
  });
  res.json({ success: true, commandId, message: "Đã phát lệnh Auto F5 tới các trình duyệt chạy CMT thành công!" });
});

app.get("/api/tiktok/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const client = { id: Date.now(), res };
  sseClients.push(client);
  res.write("event: status\ndata: " + JSON.stringify(liveState) + "\n\n");
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== client.id);
  });
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const client = { id: Date.now(), res };
  sseClients.push(client);
  res.write("event: status\ndata: " + JSON.stringify(liveState) + "\n\n");
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== client.id);
  });
});

// Facebook APIs
app.get("/api/facebook/status", (req, res) => {
  res.json({
    ...fbLiveState,
    recentComments: fbLiveState.recentComments.slice(0, 40),
    activeClientsCount: fbSseClients.length,
    serverConfig: {
      fbTarget: serverConfig.fbTarget,
      fbPageId: serverConfig.fbPageId,
      hasToken: !!(serverConfig.fbToken || fbLiveState.accessToken)
    }
  });
});

app.get("/api/server/config", (req, res) => {
  res.json({
    success: true,
    config: {
      fbTarget: serverConfig.fbTarget,
      fbPageId: serverConfig.fbPageId,
      hasFbToken: !!serverConfig.fbToken,
      ttUser: serverConfig.ttUser
    }
  });
});

app.post("/api/facebook/resolve-url", async (req, res) => {
  try {
    const { url } = req.body || {};
    const resolved = await resolveAndExtractFacebookIds(url);
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ error: err.message, videoId: null, pageId: null });
  }
});

app.post("/api/facebook/connect", async (req, res) => {
  const { target, accessToken, pageId, syncFirebaseRoom = "hienpham_live_fb" } = req.body || {};
  if (target) serverConfig.fbTarget = target;
  if (pageId) serverConfig.fbPageId = pageId;
  if (accessToken && accessToken.trim()) serverConfig.fbToken = accessToken.trim();
  saveServerConfig();

  const tokenToUse = (accessToken && accessToken.trim()) || serverConfig.fbToken || fbLiveState.accessToken || "";
  await startFacebookLive(target || serverConfig.fbTarget, tokenToUse, syncFirebaseRoom);
  res.json({ success: true, target: target || serverConfig.fbTarget, isStopped: false });
});

app.post("/api/facebook/disconnect", (req, res) => {
  stopFacebookLive();
  res.json({ success: true, isStopped: true });
});

app.post("/api/facebook/clear-comments", (req, res) => {
  fbLiveState.recentComments = [];
  fbLiveState.totalCommentsCount = 0;
  broadcastFb("status", fbLiveState);
  res.json({ success: true });
});

app.get("/api/facebook/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const client = { id: Date.now(), res };
  fbSseClients.push(client);
  res.write("event: status\ndata: " + JSON.stringify(fbLiveState) + "\n\n");
  req.on("close", () => {
    fbSseClients = fbSseClients.filter((c) => c.id !== client.id);
  });
});

// ==========================================
// 4. UNIFIED WEB DASHBOARD (TIKTOK + FACEBOOK)
// ==========================================
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Máy Chủ Cào Live 24/7 (TikTok & Facebook)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #070d19; color: #f1f5f9; min-height: 100vh; margin: 0; padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .card { background: #111c2e; border: 1px solid #1e293b; border-radius: 20px; padding: 20px; max-width: 580px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .header { text-align: center; margin-bottom: 16px; }
    .tabs { display: flex; gap: 8px; background: #0b1320; padding: 4px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #1e293b; }
    .tab-btn { flex: 1; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 13px; text-align: center; cursor: pointer; border: none; background: transparent; color: #94a3b8; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .tab-btn.active { background: #1e293b; color: #38bdf8; shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .tab-btn.fb.active { color: #60a5fa; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: 9999px; font-weight: bold; font-size: 12px; margin-bottom: 8px; }
    .online { background: #065f46; color: #34d399; }
    .offline { background: #7f1d1d; color: #f87171; }
    .stopped { background: #334155; color: #cbd5e1; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    h1 { margin: 0 0 4px 0; font-size: 19px; }
    p { margin: 0; color: #64748b; font-size: 12px; }
    .version-tag { display: inline-block; background: #1e293b; color: #38bdf8; font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: bold; margin-top: 4px; }
    .form-group { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
    input { flex: 1; min-width: 180px; background: #090f1d; border: 1px solid #334155; color: white; padding: 10px 14px; border-radius: 10px; font-size: 13px; outline: none; }
    input:focus { border-color: #38bdf8; }
    button { color: white; border: none; padding: 10px 14px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 13px; transition: 0.2s; }
    .btn-connect { background: #2563eb; }
    .btn-connect:hover { background: #1d4ed8; }
    .btn-stop { background: #dc2626; }
    .btn-stop:hover { background: #b91c1c; }
    .btn-update { background: #0f766e; }
    .btn-update:hover { background: #0d9488; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #090f1d; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 12px; border: 1px solid #1e293b; }
    .grid div { display: flex; flex-direction: column; }
    .label { color: #64748b; margin-bottom: 2px; }
    .val { font-weight: bold; color: #f8fafc; font-size: 13px; word-break: break-all; }
    .comments-box { background: #090f1d; border-radius: 12px; padding: 10px; max-height: 200px; overflow-y: auto; font-size: 12px; border: 1px solid #1e293b; }
    .cmt { padding: 5px 6px; border-bottom: 1px solid #152238; display: flex; gap: 6px; align-items: baseline; }
    .cmt-usr { font-weight: bold; color: #38bdf8; min-width: 80px; }
    .cmt-usr-fb { font-weight: bold; color: #60a5fa; min-width: 80px; }
    .cmt-txt { color: #e2e8f0; flex: 1; word-break: break-word; }
    .empty { color: #64748b; text-align: center; padding: 20px 0; }
    .actions { display: flex; gap: 8px; margin-top: 12px; flex-direction: column; }
    .test-btn { width: 100%; background: #059669; }
    .test-btn:hover { background: #047857; }
    .hint { font-size: 11px; color: #94a3b8; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div id="badge" class="badge offline">
        <span class="dot"></span>
        <span id="badge-text">ĐANG KHỞI TẠO...</span>
      </div>
      <h1>Máy Chủ Cào Live 24/7 (Đa Nền Tảng)</h1>
      <p>TV Box Amlogic S905W (Armbian Linux) • TikTok & Facebook</p>
      <div class="version-tag">Phiên bản: v${CURRENT_SERVER_VERSION} (Hỗ trợ Facebook Live)</div>
    </div>

    <!-- Switch Tab TikTok vs Facebook -->
    <div class="tabs">
      <button id="tabTt" class="tab-btn active" onclick="switchPlatform('tiktok')">🎵 TikTok Live</button>
      <button id="tabFb" class="tab-btn fb" onclick="switchPlatform('facebook')">📘 Facebook Fanpage</button>
    </div>

    <!-- PANEL TIKTOK -->
    <div id="panelTt">
      <div class="form-group">
        <input type="text" id="usernameInput" placeholder="Nhập ID TikTok (vd: hienpham.965286096)">
        <button id="btnConnectTt" class="btn-connect" onclick="changeTikTokChannel()">Cào Kênh Này</button>
        <button class="btn-stop" onclick="stopTikTokCrawler()">Dừng Cào</button>
      </div>

      <div class="grid">
        <div><span class="label">Kênh TikTok:</span><span id="lbl-tt-user" class="val">--</span></div>
        <div><span class="label">Room ID:</span><span id="lbl-tt-room" class="val">--</span></div>
        <div><span class="label">Mắt xem:</span><span id="lbl-tt-viewers" class="val">0</span></div>
        <div><span class="label">Bình luận:</span><span id="lbl-tt-cmts" class="val">0</span></div>
      </div>
    </div>

    <!-- PANEL FACEBOOK -->
    <div id="panelFb" style="display: none;">
      <div style="background: #0d1527; border: 1px solid #1e2d4d; border-radius: 12px; padding: 14px; margin-bottom: 12px;">
        <div style="font-size: 13px; font-weight: bold; color: #60a5fa; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span>⚙️ Cấu hình Cào Live Facebook 24/7</span>
          <span id="lbl-token-status" style="font-size: 11px; padding: 2px 8px; border-radius: 6px; background: #1e293b; color: #94a3b8;">Chưa lưu Token</span>
        </div>
        
        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">1. ID Fanpage (Hiền Phạm Shop):</label>
          <input type="text" id="fbPageIdInput" placeholder="100546631959960" value="${serverConfig.fbPageId || '100546631959960'}" style="width: 100%; box-sizing: border-box; background: #070d19; border: 1px solid #1e293b; color: #fff; padding: 7px 10px; border-radius: 8px; font-size: 12px;">
        </div>

        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">2. Link bài Live đang phát (hoặc Video ID):</label>
          <input type="text" id="fbTargetInput" placeholder="https://www.facebook.com/... hoặc mã Video ID" value="${serverConfig.fbTarget || ''}" style="width: 100%; box-sizing: border-box; background: #070d19; border: 1px solid #1e293b; color: #fff; padding: 7px 10px; border-radius: 8px; font-size: 12px;">
        </div>

        <div style="margin-bottom: 10px;">
          <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">3. Token (Facebook Page Token hoặc Pancake eyJ...):</label>
          <input type="password" id="fbTokenInput" placeholder="${serverConfig.fbToken ? '•••••••• (Đã lưu token trên máy chủ)' : 'Dán mã Token (EAA... hoặc eyJ...)'}" style="width: 100%; box-sizing: border-box; background: #070d19; border: 1px solid #1e293b; color: #fff; padding: 7px 10px; border-radius: 8px; font-size: 12px; font-family: monospace;">
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">💡 Token được lưu an toàn trực tiếp trên TV Box, App chốt đơn chỉ cần mở là tự động cào.</div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="btnConnectFb" class="btn-connect" style="background: #2563eb; flex: 1; padding: 9px;" onclick="changeFbChannel()">💾 Lưu Cấu Hình & Bắt Đầu Cào</button>
          <button class="btn-stop" style="padding: 9px 14px;" onclick="stopFbCrawler()">⏹ Dừng Cào</button>
        </div>
      </div>

      <div class="grid" style="margin-top: 10px;">
        <div><span class="label">Mục tiêu FB:</span><span id="lbl-fb-target" class="val">--</span></div>
        <div><span class="label">Video ID:</span><span id="lbl-fb-vid" class="val">--</span></div>
        <div><span class="label">Trạng thái:</span><span id="lbl-fb-status" class="val">--</span></div>
        <div><span class="label">Bình luận:</span><span id="lbl-fb-cmts" class="val">0</span></div>
      </div>
    </div>

    <!-- Comments Box -->
    <div style="font-weight: bold; font-size: 12px; margin-bottom: 6px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
      <span id="cmtTitle">Bình luận trực tiếp:</span>
      <button onclick="clearCurrentComments()" style="background: transparent; color: #64748b; padding: 2px 6px; font-size: 11px; border: 1px solid #1e293b; border-radius: 4px;">Xoá danh sách</button>
    </div>
    <div id="cmtList" class="comments-box">
      <div class="empty">Đang chờ bình luận từ Live...</div>
    </div>

    <div class="actions">
      <button class="test-btn" onclick="sendTestComment()">Gửi 1 bình luận thử nghiệm lên App Chốt Đơn</button>
      <button id="btnUpdate" class="btn-update" onclick="triggerUpdate()">🔄 Kiểm tra & Cập Nhật Mới (OTA v${CURRENT_SERVER_VERSION})</button>
    </div>
  </div>

  <script>
    let activePlatform = 'tiktok';
    let isUserTyping = false;
    const ttInput = document.getElementById("usernameInput");
    const fbInput = document.getElementById("fbTargetInput");

    [ttInput, fbInput].forEach(inp => {
      inp.addEventListener("focus", () => { isUserTyping = true; });
      inp.addEventListener("blur", () => { isUserTyping = false; });
    });

    function switchPlatform(p) {
      activePlatform = p;
      document.getElementById("tabTt").className = "tab-btn " + (p === 'tiktok' ? 'active' : '');
      document.getElementById("tabFb").className = "tab-btn fb " + (p === 'facebook' ? 'active' : '');
      document.getElementById("panelTt").style.display = p === 'tiktok' ? 'block' : 'none';
      document.getElementById("panelFb").style.display = p === 'facebook' ? 'block' : 'none';
      document.getElementById("cmtTitle").innerText = p === 'tiktok' ? 'Bình luận TikTok Live:' : 'Bình luận Facebook Live:';
      updateStatus();
    }

    async function triggerUpdate() {
      const btn = document.getElementById("btnUpdate");
      btn.disabled = true;
      btn.innerText = "Đang tải và cập nhật...";
      try {
        const res = await fetch("/api/server/update", { method: "POST" });
        const data = await res.json();
        alert(data.message || (data.success ? "Cập nhật thành công!" : "Máy chủ đã ở bản mới nhất."));
      } catch (e) {
        alert("Lỗi kiểm tra cập nhật: " + e.message);
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.innerText = "🔄 Kiểm tra & Cập Nhật Mới (OTA v${CURRENT_SERVER_VERSION})";
          updateStatus();
        }, 2000);
      }
    }

    async function updateStatus() {
      try {
        if (activePlatform === 'tiktok') {
          const res = await fetch("/api/tiktok/status");
          const data = await res.json();
          
          const badge = document.getElementById("badge");
          const badgeText = document.getElementById("badge-text");
          if (data.isConnected) {
            badge.className = "badge online";
            badgeText.innerText = "TIKTOK: ĐANG LIVE";
          } else if (data.isStopped) {
            badge.className = "badge stopped";
            badgeText.innerText = "TIKTOK: ĐÃ DỪNG";
          } else {
            badge.className = "badge offline";
            badgeText.innerText = data.lastError ? "TIKTOK: ĐANG CHỜ" : "CHƯA KẾT NỐI";
          }

          document.getElementById("lbl-tt-user").innerText = "@" + (data.username || "Chưa có");
          document.getElementById("lbl-tt-room").innerText = data.roomId ? data.roomId : (data.isConnected ? "Đã kết nối" : "Chờ kết nối...");
          document.getElementById("lbl-tt-viewers").innerText = data.viewerCount || 0;
          document.getElementById("lbl-tt-cmts").innerText = data.totalCommentsCount || 0;

          if (!isUserTyping && !ttInput.value) {
            ttInput.value = data.username || "";
          }

          renderComments(data.recentComments, 'tiktok');
        } else {
          const res = await fetch("/api/facebook/status");
          const data = await res.json();

          const badge = document.getElementById("badge");
          const badgeText = document.getElementById("badge-text");
          if (data.isConnected) {
            badge.className = "badge online";
            badgeText.innerText = "FACEBOOK: ĐANG CÀO LIVE";
          } else if (data.isStopped) {
            badge.className = "badge stopped";
            badgeText.innerText = "FACEBOOK: ĐÃ DỪNG";
          } else {
            badge.className = "badge offline";
            badgeText.innerText = data.lastError ? "FACEBOOK: ĐANG CHỜ" : "CHƯA KẾT NỐI";
          }

          document.getElementById("lbl-fb-target").innerText = data.target || "Chưa có";
          document.getElementById("lbl-fb-vid").innerText = data.videoId || "Chưa lấy được";
          document.getElementById("lbl-fb-status").innerText = data.isConnected ? "Đang trực tiếp" : (data.isStopped ? "Đã dừng" : (data.lastError || "Đang chờ live"));
          document.getElementById("lbl-fb-cmts").innerText = data.totalCommentsCount || 0;

          const tokBadge = document.getElementById("lbl-token-status");
          if (tokBadge && data.serverConfig) {
            if (data.serverConfig.hasToken) {
              tokBadge.style.background = "#065f46";
              tokBadge.style.color = "#34d399";
              tokBadge.innerText = "✓ Đã lưu Token";
            } else {
              tokBadge.style.background = "#1e293b";
              tokBadge.style.color = "#94a3b8";
              tokBadge.innerText = "Chưa lưu Token";
            }
          }

          if (!isUserTyping && !fbInput.value) {
            fbInput.value = data.target || "";
          }

          renderComments(data.recentComments, 'facebook');
        }
      } catch (e) {}
    }

    function renderComments(recentComments, platform) {
      const list = document.getElementById("cmtList");
      if (recentComments && recentComments.length > 0) {
        list.innerHTML = recentComments.map(function(c) {
          const u = c.user || c.nickname || 'Khách';
          const m = c.content || c.comment || '';
          const usrClass = platform === 'facebook' ? 'cmt-usr-fb' : 'cmt-usr';
          return '<div class="cmt"><span class="' + usrClass + '">' + u + ':</span><span class="cmt-txt">' + m + '</span></div>';
        }).join("");
      } else {
        list.innerHTML = '<div class="empty">Chưa có bình luận nào...</div>';
      }
    }

    async function changeTikTokChannel() {
      const u = ttInput.value.trim();
      if (!u) return alert("Vui lòng nhập tên kênh TikTok!");
      try {
        await fetch("/api/tiktok/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u })
        });
      } catch (e) {}
      setTimeout(updateStatus, 1000);
    }

    async function stopTikTokCrawler() {
      try { await fetch("/api/tiktok/disconnect", { method: "POST" }); } catch (e) {}
      setTimeout(updateStatus, 500);
    }

    async function changeFbChannel() {
      const t = fbInput.value.trim();
      const tok = document.getElementById("fbTokenInput") ? document.getElementById("fbTokenInput").value.trim() : "";
      const pId = document.getElementById("fbPageIdInput") ? document.getElementById("fbPageIdInput").value.trim() : "";
      if (!t && !pId) return alert("Vui lòng nhập Link bài Live hoặc ID Fanpage!");
      try {
        const btn = document.getElementById("btnConnectFb");
        btn.disabled = true;
        btn.innerText = "Đang lưu...";
        await fetch("/api/facebook/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: t, accessToken: tok, pageId: pId })
        });
        alert("✅ Đã lưu cấu hình và khởi động cào Facebook Live trên TV Box!");
      } catch (e) {
        alert("Lỗi: " + e.message);
      } finally {
        const btn = document.getElementById("btnConnectFb");
        if (btn) {
          btn.disabled = false;
          btn.innerText = "💾 Lưu Cấu Hình & Bắt Đầu Cào";
        }
      }
      setTimeout(updateStatus, 1000);
    }

    async function stopFbCrawler() {
      try { await fetch("/api/facebook/disconnect", { method: "POST" }); } catch (e) {}
      setTimeout(updateStatus, 500);
    }

    async function clearCurrentComments() {
      const url = activePlatform === 'facebook' ? "/api/facebook/clear-comments" : "/api/tiktok/clear-comments";
      try { await fetch(url, { method: "POST" }); } catch (e) {}
      updateStatus();
    }

    async function sendTestComment() {
      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0")+":"+String(now.getSeconds()).padStart(2,"0");
      const room = activePlatform === 'facebook' ? "hienpham_live_fb" : "hienpham_live";
      const testItem = {
        id: "test_" + Date.now(),
        user: activePlatform === 'facebook' ? "Khách Thử Nghiệm FB" : "Khách Thử Nghiệm TikTok",
        nickname: activePlatform === 'facebook' ? "Khách Thử Nghiệm FB" : "Khách Thử Nghiệm TikTok",
        content: "Cọc 1 áo thun freesize 0988776655",
        comment: "Cọc 1 áo thun freesize 0988776655",
        time: timeStr,
        platform: activePlatform
      };
      await fetch("https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + room + "/comments.json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [testItem], updatedAt: Date.now(), deviceId: "armbian_tvbox" })
      });
      alert("Đã gửi thử nghiệm thành công lên phòng " + room + "! Hãy mở App chốt đơn kiểm tra!");
      updateStatus();
    }

    updateStatus();
    setInterval(updateStatus, 2000);
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server TikTok & Facebook Live (v" + CURRENT_SERVER_VERSION + ") đang chạy trên port " + PORT);
  sendHeartbeat();
  sendFbHeartbeat();
});
