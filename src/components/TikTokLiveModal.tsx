import React, { useState, useEffect } from 'react';
import { 
  X, 
  Radio, 
  Users, 
  MessageSquare, 
  AlertCircle, 
  Loader2, 
  ExternalLink, 
  History, 
  Wifi, 
  WifiOff, 
  Sparkles, 
  Zap, 
  Crown, 
  Printer, 
  Heart, 
  Bot, 
  ArrowRightLeft, 
  CheckCircle2, 
  RefreshCw, 
  Server, 
  Globe, 
  ToggleLeft, 
  ToggleRight, 
  ShieldCheck, 
  ShieldAlert,
  ArrowLeft,
  Check,
  Copy
} from 'lucide-react';
import { 
  getTikTokStatus, 
  subscribeTikTokStatus, 
  connectTikTokLive, 
  disconnectTikTokLive, 
  claimMasterRole, 
  TikTokLiveStatus, 
  fetchTikTokStatus, 
  DEFAULT_TIKTOK_CHANNEL, 
  DEFAULT_BACKEND_URL, 
  getApiBaseUrl, 
  setCustomBackendUrl, 
  resetBackendUrlToDefault, 
  isFailoverEnabled, 
  setFailoverEnabled, 
  triggerRemoteServerUpdate,
  triggerRemoteBrowserReload,
  updateLiveConfig,
  getCrawlerMode,
  isMuteNotLiveAlert,
  CrawlerMode
} from '../lib/tiktokLiveClient';
import { useStore } from '../store';
import { normalizeUser, normalizeContent } from '../lib/core';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

interface TikTokLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  onOpenAutoComment?: () => void;
}

export const TikTokLiveModal: React.FC<TikTokLiveModalProps> = ({ isOpen, onClose, onBack, onOpenAutoComment }) => {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose: onBack || onClose, enabled: isOpen });
  const [username, setUsername] = useState(DEFAULT_TIKTOK_CHANNEL);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState<TikTokLiveStatus>(getTikTokStatus());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recentChannels, setRecentChannels] = useState<string[]>([]);
  const [isClaimingMaster, setIsClaimingMaster] = useState(false);
  const [showBackendConfig, setShowBackendConfig] = useState(false);
  const [backendUrl, setBackendUrl] = useState(getApiBaseUrl());
  const [isSavedUrl, setIsSavedUrl] = useState(false);
  const [failoverOn, setFailoverOn] = useState<boolean>(isFailoverEnabled());
  const [showSuperScraper, setShowSuperScraper] = useState(false);
  const [hasCopiedSuperScript, setHasCopiedSuperScript] = useState(false);
  const [crawlerMode, setCrawlerMode] = useState<CrawlerMode>(getCrawlerMode());
  const [muteNotLive, setMuteNotLive] = useState<boolean>(isMuteNotLiveAlert());
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  
  const comments = useStore((s) => s.tiktok.comments);

  const SUPER_SCRAPER_SCRIPT = `// ==UserScript==
// @name         TikTok Live Super Scraper & Auto F5 Bot
// @namespace    https://hienpham-live.app/
// @version      3.5
// @description  Siêu cào bình luận TikTok Live trực tiếp từ trình duyệt 0ms, tự động đẩy về App Chốt Đơn & Auto F5
// @match        *://*.tiktok.com/*
// @match        *://tiktok.com/*
// @include      *://*.tiktok.com/*
// @include      *://tiktok.com/*
// @connect      *
// @connect      firebasedatabase.app
// @connect      *.firebasedatabase.app
// @connect      caotiktok.home79.cloud
// @connect      *.home79.cloud
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';
  const ROOM = "hienpham_live";
  const DB_COMMENTS_ENDPOINTS = [
    "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + ROOM + "/comments.json"
  ];
  const DB_COMMAND_ENDPOINTS = [
    "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + ROOM + "/refreshCommand.json",
    "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + ROOM + "/reloadBrowserCommand.json"
  ];
  const DB_REPLY_ENDPOINTS = [
    "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/" + ROOM + "/replyCommand.json"
  ];

  console.log("%c⚡ [TikTok Super-Scraper v3.5] Khởi động bộ cào bình luận trực tiếp & Auto F5...", "background:#111; color:#00f2ea; font-size:14px; font-weight:bold; padding:4px 8px; border-radius:4px;");

  function sendHttpRequest(url, method = 'GET', data = null) {
    return new Promise((resolve) => {
      const gmXhr = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest : 
                    (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
      if (gmXhr) {
        try {
          gmXhr({
            method: method,
            url: url + (method === 'GET' ? (url.includes('?') ? '&' : '?') + '_t=' + Date.now() : ''),
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
            data: data ? JSON.stringify(data) : undefined,
            timeout: 5000,
            onload: function(res) {
              try { resolve(res.status >= 200 && res.status < 300 ? JSON.parse(res.responseText) : null); } catch(e) { resolve(null); }
            },
            onerror: function() { resolve(null); },
            ontimeout: function() { resolve(null); }
          });
          return;
        } catch(e) {}
      }

      fetch(url + (method === 'GET' ? (url.includes('?') ? '&' : '?') + '_t=' + Date.now() : ''), {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined,
        cache: 'no-store'
      })
      .then(r => r.json())
      .then(resolve)
      .catch(() => resolve(null));
    });
  }

  let hudEl = null;
  let totalScrapedCount = 0;
  function createFloatingHud() {
    if (document.getElementById('tt-autocmt-hud')) return;
    hudEl = document.createElement('div');
    hudEl.id = 'tt-autocmt-hud';
    hudEl.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:999999;background:rgba(15,23,42,0.92);border:1px solid rgba(0,242,234,0.6);border-radius:12px;padding:6px 14px;font-family:sans-serif;font-size:11px;color:#f8fafc;box-shadow:0 8px 24px rgba(0,0,0,0.6);display:flex;align-items:center;gap:10px;backdrop-filter:blur(8px);pointer-events:auto;';
    
    hudEl.innerHTML = \`
      <span id="tt-hud-dot" style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 10px #10b981;display:inline-block;animation:pulse 1.5s infinite;"></span>
      <span id="tt-hud-text" style="font-weight:700;color:#00f2ea;">🟢 ĐANG CÀO LIVE: <b id="tt-hud-count">0</b> CMT</span>
      <button id="tt-hud-f5btn" style="background:#3b82f6;border:none;color:#fff;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;">F5 Lại</button>
    \`;
    document.body.appendChild(hudEl);

    document.getElementById('tt-hud-f5btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  function setHudStatus(text, color, dotColor) {
    createFloatingHud();
    const textEl = document.getElementById('tt-hud-text');
    const dotEl = document.getElementById('tt-hud-dot');
    if (textEl) {
      textEl.innerHTML = text;
      if (color) textEl.style.color = color;
    }
    if (dotEl && dotColor) {
      dotEl.style.background = dotColor;
      dotEl.style.boxShadow = '0 0 10px ' + dotColor;
    }
  }

  function updateHudScrapedCount(count) {
    createFloatingHud();
    const countEl = document.getElementById('tt-hud-count');
    if (countEl) countEl.innerText = String(count);
  }

  setTimeout(createFloatingHud, 1000);

  const processedCommentHashes = new Set();
  const collectedComments = [];
  let syncDebounce = null;
  let directBroadcast = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      directBroadcast = new BroadcastChannel('tiktok_live_direct_feed');
    }
  } catch(e) {}

  function normalizeCommentUser(u) {
    if (!u) return 'Khách';
    return String(u).trim().replace(/^@/, '');
  }

  function broadcastAndSyncComment(commentItem) {
    totalScrapedCount++;
    updateHudScrapedCount(totalScrapedCount);

    if (directBroadcast) {
      try { directBroadcast.postMessage(commentItem); } catch(e) {}
    }
    try {
      localStorage.setItem('slp_direct_comment_tiktok', JSON.stringify(commentItem));
    } catch(e) {}

    collectedComments.unshift(commentItem);
    if (collectedComments.length > 150) collectedComments.pop();

    if (!syncDebounce) {
      syncDebounce = setTimeout(async () => {
        syncDebounce = null;
        for (const url of DB_COMMENTS_ENDPOINTS) {
          try {
            await sendHttpRequest(url, 'PUT', {
              data: collectedComments.slice(0, 150),
              updatedAt: Date.now(),
              deviceId: 'browser_tampermonkey_v3.5'
            });
          } catch(err) {}
        }
      }, 150);
    }
  }

  function extractCommentFromElement(el) {
    if (!el || el.nodeType !== 1) return null;
    const textAll = (el.innerText || el.textContent || '').trim();
    if (!textAll) return null;
    if (textAll.includes('đã tham gia') || textAll.includes('joined') || textAll.includes('đã thích') || textAll.includes('liked the LIVE') || textAll.includes('đã chia sẻ') || textAll.includes('shared the LIVE') || textAll.includes('đã gửi') || textAll.includes('sent a')) {
      return null;
    }

    let userEl = el.querySelector('[data-e2e="comment-username"]') || 
                 el.querySelector('span[class*="SpanUsername"]') || 
                 el.querySelector('span[class*="SpanNickname"]') || 
                 el.querySelector('span[class*="username"]') || 
                 el.querySelector('span[class*="nickname"]') ||
                 el.querySelector('a[href*="/@"]') ||
                 el.querySelector('strong') ||
                 el.querySelector('b');
    
    let username = userEl ? (userEl.innerText || userEl.textContent || '').trim() : '';
    let commentText = '';

    let textEl = el.querySelector('[data-e2e="comment-text"]') || 
                 el.querySelector('span[class*="SpanCommentText"]') || 
                 el.querySelector('span[class*="SpanText"]') || 
                 el.querySelector('span[class*="comment-text"]') ||
                 el.querySelector('div[class*="text"]');
                 
    if (textEl) {
      commentText = (textEl.innerText || textEl.textContent || '').trim();
    } else if (username && textAll.startsWith(username)) {
      commentText = textAll.substring(username.length).replace(/^[:\s\-]+/, '').trim();
    } else {
      commentText = textAll;
    }

    if (!commentText) return null;
    if (!username) username = 'Khách';

    username = normalizeCommentUser(username);
    const hash = username.toLowerCase() + ':::' + commentText.toLowerCase();
    if (processedCommentHashes.has(hash)) return null;
    processedCommentHashes.add(hash);
    if (processedCommentHashes.size > 2000) {
      const firstEntry = processedCommentHashes.values().next().value;
      processedCommentHashes.delete(firstEntry);
    }

    let imgEl = el.querySelector('img[src*="tiktokcdn"]') || el.querySelector('img');
    let avatarUrl = imgEl ? (imgEl.getAttribute('src') || '') : '';
    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

    return {
      id: 'tt_dom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      user: username,
      nickname: username,
      uniqueId: username,
      content: commentText,
      comment: commentText,
      time: timeStr,
      avatar: avatarUrl,
      ts: Date.now(),
      platform: 'tiktok'
    };
  }

  function scanChatContainer() {
    const chatItems = document.querySelectorAll(
      '[data-e2e="chat-message"], div[class*="DivCommentItemContainer"], div[class*="DivItemContainer"], div[class*="ChatMessage"], div[class*="tiktok-webcast-chat-item"], div[class*="chat-item"], div[class*="webcast-chat"]'
    );
    chatItems.forEach((itemEl) => {
      const parsed = extractCommentFromElement(itemEl);
      if (parsed) {
        broadcastAndSyncComment(parsed);
      }
    });
  }

  function initCommentObserver() {
    const targetNode = document.body;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const parsed = extractCommentFromElement(node);
            if (parsed) broadcastAndSyncComment(parsed);
            if (node.querySelectorAll) {
              const children = node.querySelectorAll('[data-e2e="chat-message"], div[class*="DivCommentItemContainer"], div[class*="DivItemContainer"], div[class*="ChatMessage"], div[class*="chat-item"]');
              children.forEach(cNode => {
                const cParsed = extractCommentFromElement(cNode);
                if (cParsed) broadcastAndSyncComment(cParsed);
              });
            }
          }
        }
      }
    });

    observer.observe(targetNode, { childList: true, subtree: true });
    setInterval(scanChatContainer, 400);
  }

  setTimeout(initCommentObserver, 1500);

  // Auto F5 & Remote Command
  let lastRefreshId = "";
  try {
    lastRefreshId = (typeof GM_getValue !== 'undefined' ? GM_getValue('last_f5_id') : null) || 
                    sessionStorage.getItem('last_f5_id') || 
                    localStorage.getItem('last_f5_id') || "";
  } catch(e) {}

  let isReloading = false;
  function doForceReload(cmdId, source) {
    if (isReloading) return;
    isReloading = true;
    lastRefreshId = cmdId;
    try {
      if (typeof GM_setValue !== 'undefined') GM_setValue('last_f5_id', cmdId);
      sessionStorage.setItem('last_f5_id', cmdId);
      localStorage.setItem('last_f5_id', cmdId);
    } catch(e) {}

    setHudStatus("🔄 NHẬN LỆNH F5! ĐANG TẢI LẠI...", "#f59e0b", "#f59e0b");
    setTimeout(() => {
      try { window.location.reload(true); } catch(e) { window.location.reload(); }
    }, 150);
  }

  setInterval(async () => {
    if (isReloading) return;
    for (const url of DB_COMMAND_ENDPOINTS) {
      try {
        const data = await sendHttpRequest(url);
        if (data && data.commandId && data.commandId !== lastRefreshId) {
          const age = Date.now() - (data.updatedAt || 0);
          if (Math.abs(age) < 120000 || !data.updatedAt) {
            doForceReload(data.commandId, "Firebase");
            return;
          }
        }
      } catch (e) {}
    }
  }, 1000);

  let lastReplyId = "";
  setInterval(async () => {
    if (isReloading) return;
    for (const url of DB_REPLY_ENDPOINTS) {
      try {
        const data = await sendHttpRequest(url);
        if (data && data.commandId && data.commandId !== lastReplyId) {
          const age = Date.now() - (data.updatedAt || 0);
          if (Math.abs(age) < 60000 && data.content) {
            lastReplyId = data.commandId;
            postTikTokComment(data.content);
            return;
          }
        }
      } catch (e) {}
    }
  }, 1000);

  function postTikTokComment(text) {
    try {
      const input = document.querySelector('div[contenteditable="true"]') || 
                    document.querySelector('textarea') || 
                    document.querySelector('[data-e2e="comment-input"]') ||
                    document.querySelector('input[placeholder*="bình luận" i]') ||
                    document.querySelector('input[placeholder*="comment" i]');
      if (!input) return;
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => {
        const sendBtn = document.querySelector('button[data-e2e="comment-post"]') || 
                        document.querySelector('button[type="submit"]') ||
                        document.querySelector('.comment-send-btn');
        if (sendBtn && !sendBtn.disabled) sendBtn.click();
        else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }, 350);
    } catch (err) {}
  }
})();`;

  // Initialize and load recent channels
  useEffect(() => {
    try {
      const saved = localStorage.getItem('slp_tiktok_channels');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentChannels(parsed);
        }
      }
      const last = localStorage.getItem('slp_last_tiktok_channel');
      if (last) {
        setUsername(last);
      }
    } catch {}

    fetchTikTokStatus();
    const unsubscribe = subscribeTikTokStatus((newStatus) => {
      setStatus(newStatus);
      setFailoverOn(newStatus.isFailoverEnabled);
      setCrawlerMode(newStatus.crawlerMode);
      setMuteNotLive(newStatus.muteNotLiveAlert);
      // Only update input if user is NOT actively typing/editing
      if (!isEditing && newStatus.username && newStatus.isConnected) {
        setUsername(newStatus.username);
      }
      if (newStatus.lastError && !newStatus.muteNotLiveAlert && newStatus.crawlerMode !== 'browser_dom') {
        setErrorMsg(newStatus.lastError);
      } else {
        setErrorMsg(null);
      }
    });

    return () => unsubscribe();
  }, [isEditing]);

  const handleSwitchCrawlerMode = async (newMode: CrawlerMode) => {
    setCrawlerMode(newMode);
    setIsCloudSyncing(true);
    try {
      await updateLiveConfig({
        mode: newMode,
        channel: username || DEFAULT_TIKTOK_CHANNEL,
      });
      if (newMode === 'browser_dom') {
        setErrorMsg(null);
      } else {
        fetchTikTokStatus();
      }
    } finally {
      setTimeout(() => setIsCloudSyncing(false), 500);
    }
  };

  const handleToggleMuteNotLive = async () => {
    const nextMute = !muteNotLive;
    setMuteNotLive(nextMute);
    setIsCloudSyncing(true);
    try {
      await updateLiveConfig({
        muteNotLiveAlert: nextMute,
      });
      if (nextMute) {
        setErrorMsg(null);
      }
    } finally {
      setTimeout(() => setIsCloudSyncing(false), 500);
    }
  };

  const handleToggleFailover = () => {
    const next = !failoverOn;
    setFailoverOn(next);
    setFailoverEnabled(next);
  };

  if (!isOpen) return null;

  const sanitizeUsername = (val: string) => {
    let v = val.trim();
    v = v.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '');
    v = v.replace(/\/live.*$/i, '');
    v = v.replace(/^@+/, '');
    return v;
  };

  const handleConnect = async (targetUser?: string) => {
    const rawUser = targetUser !== undefined ? targetUser : username;
    const userToConnect = sanitizeUsername(rawUser) || DEFAULT_TIKTOK_CHANNEL;
    
    if (!userToConnect) {
      setErrorMsg('Vui lòng nhập tên tài khoản TikTok (ví dụ: @hienpham.965286096 hoặc tên shop của bạn)');
      return;
    }

    setUsername(userToConnect);
    setIsEditing(false);
    setIsLoading(true);
    setErrorMsg(null);

    const res = await connectTikTokLive(userToConnect);
    setIsLoading(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Không thể kết nối. Hãy chắc chắn kênh này đang phát Live!');
    } else {
      // Khi kết nối hoặc Live lại thành công -> Tự động phát lệnh F5 đến trình duyệt cmt
      triggerRemoteBrowserReload('tiktok', 'live_reconnect').catch(() => {});
      try {
        const saved = localStorage.getItem('slp_tiktok_channels');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRecentChannels(parsed);
        }
      } catch {}
    }
  };

  const handleTakeOverMaster = async () => {
    setIsClaimingMaster(true);
    try {
      await claimMasterRole(username || DEFAULT_TIKTOK_CHANNEL);
    } catch (e: any) {
      setErrorMsg(e.message || 'Lỗi khi chuyển quyền máy chủ');
    }
    setIsClaimingMaster(false);
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    await disconnectTikTokLive();
    setIsLoading(false);
  };

  const handleSelectRecentChannel = (ch: string) => {
    setUsername(ch);
    setErrorMsg(null);
    setIsEditing(false);
    if (!status.isConnected) {
      handleConnect(ch);
    }
  };

  const handleCloseOrBack = () => {
    if (onBack) {
      onBack();
    } else {
      onClose();
    }
  };

  const isMaster = status.isMaster;
  const masterName = status.masterInfo?.masterDeviceName || 'Máy cào đang hoạt động';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={handleCloseOrBack}
      {...touchHandlers}
    >
      <div 
        style={modalStyle}
        className="bg-[#182230] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#121924]">
          <div className="flex items-center gap-2 sm:gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 -ml-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer"
                title="Quay lại Smart Live Monitor"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00f2ea]/20 to-[#ff0050]/20 border border-[#00f2ea]/30 flex items-center justify-center shadow-inner shrink-0">
              <Radio className={`w-5 h-5 ${status.isConnected ? 'text-[#00f2ea] animate-pulse' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">Cào TikTok Live Đa Máy</h3>
                {status.isConnected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    ĐANG KẾT NỐI
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Tự động bắt comment & chia tải máy chủ thông minh</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleCloseOrBack}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            title={onBack ? "Quay lại Smart Live Monitor" : "Đóng"}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Distributed Cluster Status Banner with On/Off Toggle */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            !failoverOn 
              ? 'bg-[#101722] border-emerald-500/30 text-slate-200 shadow-sm'
              : isMaster
                ? 'bg-amber-950/30 border-amber-500/30 text-amber-200 shadow-sm'
                : 'bg-blue-950/30 border-blue-500/30 text-blue-200 shadow-sm'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 flex-1">
                <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                  !failoverOn
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : isMaster
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {!failoverOn ? (
                    <Printer size={18} />
                  ) : isMaster ? (
                    <Crown size={18} />
                  ) : (
                    <ShieldAlert size={18} />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5 flex-wrap">
                    <span>
                      {!failoverOn 
                        ? '🖨️ MÁY PHỤ (CHỈ NHẬN & IN BILL)' 
                        : isMaster 
                          ? '👑 MÁY CÀO CHÍNH (MASTER CRAWLER)' 
                          : '🛡️ MÁY PHỤ (CÀO DỰ PHÒNG ĐANG BẬT)'}
                    </span>
                    {!failoverOn && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-md border border-emerald-500/30">
                        ĐÃ TẮT CÀO DỰ PHÒNG
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                    {!failoverOn ? (
                      <>
                        Máy này <strong className="text-white">chỉ nhận dữ liệu & in</strong>, không cào lặp lại. Toàn bộ bình luận được kéo trực tiếp từ <strong>Máy Chủ TV Box (caotiktok.home79.cloud)</strong> và Firebase.
                      </>
                    ) : isMaster ? (
                      'Thiết bị này đang trực tiếp cào live từ TikTok và phân phối cho toàn bộ các máy khác.'
                    ) : (
                      `Đang lấy dữ liệu từ: ${masterName}. Nếu máy chủ ngắt kết nối >12s, máy này sẽ tự động thay thế làm máy cào.`
                    )}
                  </p>
                </div>
              </div>

              {/* Toggle switch for Failover Crawler */}
              <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-white/5">
                <button
                  type="button"
                  onClick={handleToggleFailover}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                    failoverOn
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/15'
                  }`}
                  title={failoverOn ? 'Bấm để TẮT cào dự phòng trên máy này (tiết kiệm pin & RAM)' : 'Bấm để BẬT cào dự phòng tự cứu'}
                >
                  {failoverOn ? (
                    <>
                      <ToggleRight size={18} className="text-emerald-400" />
                      <span>Cào dự phòng: BẬT</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={18} className="text-gray-400" />
                      <span>Cào dự phòng: TẮT</span>
                    </>
                  )}
                </button>

                {failoverOn && !isMaster && (
                  <button
                    onClick={handleTakeOverMaster}
                    disabled={isClaimingMaster}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                    title="Chuyển quyền cào live sang máy này"
                  >
                    {isClaimingMaster ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightLeft size={12} />}
                    <span>Làm Máy Chủ</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-gray-400">
              <CheckCircle2 size={12} className={!failoverOn ? 'text-emerald-400 shrink-0' : 'text-cyan-400 shrink-0'} />
              <span>
                {!failoverOn
                  ? '✓ Trạng thái tối ưu: TV Box cào chính 24/7, máy này hoàn toàn rảnh tay chỉ để in bill.'
                  : 'Chế độ tự cứu (Failover): Nếu máy chủ TV Box bị cúp điện/mất mạng >12s, máy này sẽ tự động thế chỗ.'}
              </span>
            </div>
          </div>

          {/* TV Box 24/7 Dedicated Server Status Card */}
          <div className="p-3 bg-[#0d141e] border border-white/10 rounded-xl flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-[#00f2ea]/10 text-[#00f2ea] shrink-0">
                <Server size={16} />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span>Máy Chủ Cào 24/7:</span>
                  <span className="text-[#00f2ea] font-mono text-[11px] bg-[#00f2ea]/10 px-1.5 py-0.5 rounded border border-[#00f2ea]/20 truncate">
                    {backendUrl || DEFAULT_BACKEND_URL}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${status.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span className="truncate">
                    {status.isConnected
                      ? `Đang cào trực tiếp kênh @${status.username} • Đã đồng bộ ${status.totalCommentsCount || comments.length} comment`
                      : `TV Box đang trực tuyến • Sẵn sàng đồng bộ comment`}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                fetchTikTokStatus();
              }}
              className="p-1.5 px-2.5 text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
              title="Kiểm tra và làm mới trạng thái máy chủ"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Kiểm tra</span>
            </button>
          </div>

          {/* Smart Crawler Mode Switch & Cloud Sync Card */}
          <div className="bg-gradient-to-r from-[#111923] via-[#14202c] to-[#111923] border border-white/10 rounded-xl p-3.5 space-y-3 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={16} className="text-[#00f2ea]" />
                <span className="font-bold text-xs text-white">Chế Độ Cào & Đồng Bộ Hệ Thống</span>
              </div>
              <div className="flex items-center gap-1.5">
                {isCloudSyncing ? (
                  <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" /> Đang đồng bộ máy in...
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle2 size={11} /> Đồng bộ máy in: BẬT
                  </span>
                )}
              </div>
            </div>

            {/* 2-Way Mode Switcher (Nút gạt chuyển chế độ) */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => handleSwitchCrawlerMode('tvbox')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  crawlerMode === 'tvbox'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 border border-blue-400/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Server size={14} />
                  <span>🖥️ Máy Chủ Cào Tự Động (0ms)</span>
                </div>
                <span className="text-[10px] font-normal opacity-80">Cloud Server & TV Box 24/7</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchCrawlerMode('browser_dom')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  crawlerMode === 'browser_dom'
                    ? 'bg-[#00f2ea] text-black shadow-lg shadow-cyan-950/40 border border-cyan-300'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Zap size={14} className={crawlerMode === 'browser_dom' ? 'text-black fill-black' : ''} />
                  <span>⚡ Siêu Cào Trình Duyệt (Dự phòng)</span>
                </div>
                <span className="text-[10px] font-normal opacity-80">Tampermonkey / F12 Console</span>
              </button>
            </div>

            {/* Mute "Not Live / Error" Alert Switch */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5 bg-black/20 p-2.5 rounded-lg">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <span>🔇 Tắt cảnh báo "Chưa live / Mất kết nối TV Box"</span>
                  {muteNotLive && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                      ĐÃ TẮT CẢNH BÁO
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Bật tùy chọn này để không bị thông báo đỏ làm phiền khi TikTok siết server hoặc đang live mà báo chưa live.
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleMuteNotLive}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  muteNotLive ? 'bg-amber-500' : 'bg-gray-700'
                }`}
                title={muteNotLive ? 'Bật lại cảnh báo' : 'Tắt cảnh báo'}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    muteNotLive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="text-[10px] text-gray-400 flex items-center gap-1.5 pt-0.5">
              <span className="text-cyan-400">💡</span>
              <span><strong>Đồng bộ tự động:</strong> Bạn đổi cài đặt ở máy Admin này, tất cả máy in đơn phụ sẽ tự động nhận diện và cập nhật theo ngay lập tức.</span>
            </div>
          </div>

          {/* Status Monitor Card */}
          <div className={`p-4 rounded-xl border transition-all ${
            (status.isConnected || crawlerMode === 'browser_dom')
              ? 'bg-gradient-to-br from-emerald-950/40 via-[#162529] to-[#121c24] border-emerald-500/30 shadow-lg shadow-emerald-950/20' 
              : 'bg-[#131a24] border-white/5'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(status.isConnected || crawlerMode === 'browser_dom') ? (
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <span>
                      {crawlerMode === 'browser_dom' ? '⚡ Siêu Cào Trình Duyệt: ' : 'Đang kết nối: '}
                      @{status.username || username || DEFAULT_TIKTOK_CHANNEL}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-400 font-medium text-sm">
                    <WifiOff className="w-4 h-4 text-gray-500" />
                    <span>Chưa kết nối luồng Live</span>
                  </div>
                )}
              </div>
              {(status.isConnected || crawlerMode === 'browser_dom') && (status.username || username) && (
                <a 
                  href={`https://www.tiktok.com/@${status.username || username}/live`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-[#00f2ea] hover:underline flex items-center gap-1 font-medium bg-[#00f2ea]/10 px-2 py-1 rounded-md border border-[#00f2ea]/20"
                >
                  Xem Live <ExternalLink size={12} />
                </a>
              )}
            </div>

            {/* Live Stats: Viewers, Comments, Likes */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5">
              <div className="bg-black/30 rounded-lg p-2.5 flex flex-col items-center text-center">
                <Users className="w-4 h-4 text-cyan-400 mb-1" />
                <div className="text-[10px] text-gray-400">Mắt xem</div>
                <div className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
                  {(status.isConnected || crawlerMode === 'browser_dom') ? (status.viewerCount > 0 ? status.viewerCount.toLocaleString('vi-VN') : 'Live') : '--'}
                </div>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 flex flex-col items-center text-center">
                <MessageSquare className="w-4 h-4 text-amber-400 mb-1" />
                <div className="text-[10px] text-gray-400">Comment</div>
                <div className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
                  {(status.isConnected || crawlerMode === 'browser_dom') ? (status.totalCommentsCount || comments.length).toLocaleString('vi-VN') : comments.length}
                </div>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 flex flex-col items-center text-center">
                <Heart className="w-4 h-4 text-pink-500 fill-pink-500 mb-1" />
                <div className="text-[10px] text-gray-400">Thả tim</div>
                <div className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
                  {status.totalLikesCount ? status.totalLikesCount.toLocaleString('vi-VN') : '0'}
                </div>
              </div>
            </div>
          </div>

          {/* Connection Form */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
              <label htmlFor="tiktok-username-input" className="flex items-center gap-1.5">
                <span>Tên Kênh TikTok Live</span>
                <span className="text-[10px] text-[#00f2ea] font-normal">(Nhập ID hoặc dán link Live)</span>
              </label>
              {username && (
                <button
                  type="button"
                  onClick={() => {
                    setUsername('');
                    setIsEditing(true);
                    setErrorMsg(null);
                  }}
                  className="text-[11px] text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded transition-colors"
                >
                  Xóa trống ✕
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#00f2ea] font-bold text-sm pointer-events-none">@</span>
              <input
                id="tiktok-username-input"
                type="text"
                value={username}
                onFocus={() => setIsEditing(true)}
                onBlur={() => {
                  setTimeout(() => setIsEditing(false), 200);
                }}
                onChange={(e) => {
                  setIsEditing(true);
                  setUsername(e.target.value);
                  setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConnect();
                }}
                placeholder="Nhập ID kênh TikTok, ví dụ: hienpham.965286096"
                disabled={isLoading}
                className="w-full pl-8 pr-20 py-2.5 sm:py-3 bg-[#0f151d] border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-[#00f2ea] focus:ring-1 focus:ring-[#00f2ea] placeholder-gray-500 transition-all font-medium"
              />
              
              <div className="absolute right-2 flex items-center gap-1">
                {username ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('');
                      setIsEditing(true);
                    }}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    title="Xóa tên kênh"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          setUsername(sanitizeUsername(text));
                          setIsEditing(true);
                        }
                      } catch {}
                    }}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-200 rounded-md text-[10px] font-bold transition-all"
                  >
                    Dán
                  </button>
                )}
              </div>
            </div>

            {/* Quick Channel Chips */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <History size={11} />
                <span>Gợi ý / Kênh gần đây:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Default Channel */}
                <button
                  type="button"
                  onClick={() => handleSelectRecentChannel(DEFAULT_TIKTOK_CHANNEL)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1 ${
                    username.toLowerCase() === DEFAULT_TIKTOK_CHANNEL.toLowerCase()
                      ? 'bg-[#00f2ea]/20 border-[#00f2ea]/50 text-[#00f2ea]'
                      : 'bg-[#0f151d] border-white/10 text-gray-300 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  <span className="text-[10px] text-[#00f2ea]">⭐</span>
                  <span>@{DEFAULT_TIKTOK_CHANNEL}</span>
                </button>

                {/* Other saved recent channels */}
                {recentChannels
                  .filter((ch) => ch.toLowerCase() !== DEFAULT_TIKTOK_CHANNEL.toLowerCase())
                  .slice(0, 4)
                  .map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => handleSelectRecentChannel(ch)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1 ${
                        username.toLowerCase() === ch.toLowerCase()
                          ? 'bg-[#00f2ea]/20 border-[#00f2ea]/50 text-[#00f2ea]'
                          : 'bg-[#0f151d] border-white/10 text-gray-300 hover:bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <span>@{ch}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Super Scraper Browser DOM 0ms Assistant */}
          <div className="bg-gradient-to-r from-[#121f2d] to-[#122624] border border-[#00f2ea]/30 rounded-xl text-xs overflow-hidden shadow-lg shadow-cyan-950/20">
            <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#00f2ea]/20 text-[#00f2ea]">
                  <Zap size={15} />
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>⚡ Siêu Cào Trực Tiếp DOM 0ms</span>
                    <span className="text-[10px] bg-[#00f2ea]/20 text-[#00f2ea] px-1.5 py-0.5 rounded font-mono font-bold">Tampermonkey v3.5</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Cứu nguy khi TikTok siết server • Cào trực tiếp từ tab Live về máy chốt đơn 0ms!
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPER_SCRAPER_SCRIPT);
                    setHasCopiedSuperScript(true);
                    setTimeout(() => setHasCopiedSuperScript(false), 3000);
                  }}
                  className="px-3 py-1.5 bg-[#00f2ea] hover:bg-[#00c4cc] text-black font-extrabold text-xs rounded-lg transition-all shadow cursor-pointer active:scale-95 flex items-center gap-1.5"
                >
                  {hasCopiedSuperScript ? (
                    <>
                      <Check size={13} />
                      <span>Đã Copy Mã!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy Script Tampermonkey</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSuperScraper(!showSuperScraper)}
                  className="p-1.5 px-2 bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-all"
                >
                  {showSuperScraper ? 'Ẩn Hướng Dẫn ▲' : 'Xem Hướng Dẫn ▼'}
                </button>
              </div>
            </div>

            {showSuperScraper && (
              <div className="p-3 pt-2 border-t border-white/10 bg-black/30 space-y-2 text-gray-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0b1219] p-2.5 rounded-lg border border-white/5 space-y-1">
                    <strong className="text-[#00f2ea] flex items-center gap-1">
                      <span>Cách 1: Chạy trực tiếp F12 Console (Nhanh nhất - 5 giây)</span>
                    </strong>
                    <p className="text-gray-400 leading-relaxed">
                      1. Bấm nút <strong>Copy Script</strong> ở trên.<br />
                      2. Mở tab TikTok Live đang xem trên Chrome/Cốc Cốc.<br />
                      3. Bấm <strong>F12</strong> (hoặc Chuột phải ➔ <em>Kiểm tra / Inspect</em>) ➔ Chọn tab <strong>Console</strong>.<br />
                      4. Dán mã (`Ctrl + V`) rồi bấm <strong>Enter</strong>. Bình luận sẽ đổ về máy chốt đơn 0ms!
                    </p>
                  </div>

                  <div className="bg-[#0b1219] p-2.5 rounded-lg border border-white/5 space-y-1">
                    <strong className="text-emerald-400 flex items-center gap-1">
                      <span>Cách 2: Cài Tampermonkey (Tự động 100%)</span>
                    </strong>
                    <p className="text-gray-400 leading-relaxed">
                      1. Cài tiện ích <strong>Tampermonkey</strong> trên Chrome/Edge/Cốc Cốc.<br />
                      2. Bấm vào Tampermonkey ➔ <em>Tạo Script mới (Create a new script)</em>.<br />
                      3. Dán toàn bộ mã vừa Copy và bấm <strong>Lưu (Ctrl + S)</strong>.<br />
                      4. Mỗi khi mở tab Live TikTok, script tự động cào bình luận và tự F5 khi có live mới.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Features explanation: Auto-Comment & Tim */}
          <div className="p-3 bg-[#121a24] border border-white/5 rounded-xl space-y-2 text-xs">
            <div className="font-bold text-gray-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-pink-400">
                <Heart size={14} className="fill-pink-400" /> Thả Tim & Auto Comment
              </span>
              {onOpenAutoComment && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenAutoComment();
                  }}
                  className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Bot size={12} /> Cài đặt Auto Comment
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              • <strong>Thả tim:</strong> Hệ thống tự động bắt số lượt tim từ người xem trên TikTok và tạo hiệu ứng tim bay trực tiếp lên màn hình.<br />
              • <strong>Auto Comment:</strong> Bạn có thể cấu hình kịch bản tự động mồi chốt đơn, thông báo cú pháp, hoặc nhắc nhở số điện thoại định kỳ.
            </p>
          </div>

          {/* Backend Server Configuration (For Vercel or Custom Hosts) */}
          <div className="bg-[#121a24] border border-white/5 rounded-xl text-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBackendConfig(!showBackendConfig)}
              className="w-full p-3 flex items-center justify-between text-gray-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2 font-semibold text-xs">
                <Server size={14} className="text-[#00f2ea]" />
                <span>Máy Chủ Cào (Backend Node.js)</span>
              </div>
              <span className="text-[11px] text-cyan-400 font-medium">
                {showBackendConfig ? 'Thu gọn ▲' : 'Cấu hình URL (Vercel) ▼'}
              </span>
            </button>

            {showBackendConfig && (
              <div className="p-3 pt-0 border-t border-white/5 space-y-2.5 bg-black/20">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Nếu bạn triển khai frontend lên <strong className="text-white">Vercel (inlivess.vercel.app)</strong>, hãy nhập địa chỉ máy chủ Node.js (ví dụ link Google Cloud Run / Render) để kết nối luồng cào TikTok:
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Globe size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={backendUrl}
                      onChange={(e) => {
                        setBackendUrl(e.target.value);
                        setIsSavedUrl(false);
                      }}
                      placeholder="https://caotiktok.home79.cloud"
                      className="w-full pl-7 pr-3 py-1.5 bg-[#0a0e14] border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00f2ea]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBackendUrl(backendUrl);
                      setIsSavedUrl(true);
                      fetchTikTokStatus();
                      setTimeout(() => setIsSavedUrl(false), 3000);
                    }}
                    className="px-3 py-1.5 bg-[#00f2ea] hover:bg-[#00c4cc] text-black font-bold text-xs rounded-lg transition-all shrink-0 cursor-pointer"
                  >
                    {isSavedUrl ? '✓ Đã Lưu' : 'Lưu URL'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetBackendUrlToDefault();
                      setBackendUrl(DEFAULT_BACKEND_URL);
                      setIsSavedUrl(false);
                      fetchTikTokStatus();
                    }}
                    className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer"
                    title="Đặt lại về TV Box caotiktok.home79.cloud"
                  >
                    TV Box Mặc định
                  </button>
                </div>

                {/* Nút chọn nhanh Máy Chủ Cloud vs TV Box */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBackendUrl('');
                      setBackendUrl('');
                      setIsSavedUrl(true);
                      fetchTikTokStatus();
                      setTimeout(() => setIsSavedUrl(false), 3000);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      (!backendUrl || backendUrl === 'cloud' || backendUrl === '')
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/40'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <span>☁️ Dùng Máy Chủ Web Cloud (0ms - Khuyên Dùng)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBackendUrl(DEFAULT_BACKEND_URL);
                      setBackendUrl(DEFAULT_BACKEND_URL);
                      setIsSavedUrl(true);
                      fetchTikTokStatus();
                      setTimeout(() => setIsSavedUrl(false), 3000);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      backendUrl === DEFAULT_BACKEND_URL
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-950/40'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <span>🖥️ Dùng TV Box (caotiktok.home79.cloud)</span>
                  </button>
                </div>

                {/* Remote TV Box Updater & Shell Command */}
                <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="space-y-0.5">
                      <span className="text-gray-200 font-bold text-[11px] flex items-center gap-1.5 text-[#00f2ea]">
                        <RefreshCw size={12} className="animate-spin-slow" /> Cập nhật TV Box từ xa (OTA):
                      </span>
                      <div className="text-[10px] text-emerald-400 font-medium">
                        ✓ Phiên bản hiện tại: v2.4.0 (Hỗ trợ TikTok + Facebook 24/7)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async (e) => {
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        const originalText = btn.innerText;
                        btn.innerText = 'Đang đẩy mã nguồn...';
                        try {
                          const res = await triggerRemoteServerUpdate();
                          alert(res.message || (res.success ? 'Đã nạp mã nguồn mới và TV Box đang tự khởi động lại!' : 'Lỗi cập nhật'));
                          if (res.success) {
                            setTimeout(() => fetchTikTokStatus(), 3500);
                          }
                        } finally {
                          btn.disabled = false;
                          btn.innerText = originalText;
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition-all shadow cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      ⚡ Cập nhật TV Box từ xa (1-Click)
                    </button>
                  </div>

                  <div className="bg-[#080d14] p-2.5 rounded-lg border border-white/5 space-y-1.5 text-[10px]">
                    <div className="text-gray-300 font-semibold flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>Hoạt động từ xa: <strong>Không cần cùng mạng Wi-Fi hay SSH</strong></span>
                    </div>
                    <p className="text-gray-400 leading-relaxed">
                      Lệnh cập nhật sẽ được đẩy trực tiếp qua <strong>Cloudflare Tunnel (caotiktok.home79.cloud)</strong> và cầu nối <strong>Firebase RTDB</strong>. Bạn có thể bấm cập nhật từ bất kỳ đâu (kể cả qua mạng 4G khi ở ngoài).
                    </p>
                    <div className="pt-1 flex items-center gap-1.5 text-gray-500">
                      <span>Lệnh thủ công dự phòng nếu cắm cáp LAN/SSH:</span>
                      <code className="text-emerald-400 font-mono bg-black/40 px-1 py-0.5 rounded">curl -fsSL https://inlivess.vercel.app/update.sh | bash</code>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 bg-red-950/50 border border-red-500/40 rounded-xl space-y-2 text-red-200 text-xs animate-shake shadow-lg">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={17} className="shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1 leading-relaxed font-medium">
                  {errorMsg}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-red-500/20 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    resetBackendUrlToDefault();
                    setBackendUrl(DEFAULT_BACKEND_URL);
                    setErrorMsg(null);
                    handleConnect();
                  }}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-gray-200 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Server size={12} />
                  <span>Dùng TV Box mặc định</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConnect()}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-red-800/80 hover:bg-red-700 text-white rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                  <span>Thử kết nối lại</span>
                </button>
              </div>
            </div>
          )}

          {/* Real-time Comments Stream Preview */}
          {status.isConnected && comments.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>Bình luận vừa cào được ({comments.slice(0, 5).length})</span>
                <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  Trực tiếp
                </span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {comments.slice(0, 5).map((c, i) => {
                  const userName = normalizeUser(c.user);
                  const contentStr = normalizeContent(c.content);
                  return (
                    <div key={`${c.id || 'cmt'}_${i}`} className="p-2 bg-white/5 border border-white/5 rounded-lg flex items-center gap-2.5 text-xs">
                      {c.avatar ? (
                        <img src={c.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#00f2ea]/20 text-[#00f2ea] flex items-center justify-center font-bold text-[10px] shrink-0">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-white mr-1.5">{userName}:</span>
                        <span className="text-gray-300 truncate">{contentStr}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0">{c.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Action Buttons */}
        <div className="p-4 border-t border-white/10 bg-[#121924] flex flex-col sm:flex-row items-center gap-2.5">
          {status.isConnected ? (
            <>
              {username && sanitizeUsername(username).toLowerCase() !== (status.username || '').toLowerCase() ? (
                <button
                  onClick={() => handleConnect()}
                  disabled={isLoading}
                  className="w-full sm:flex-1 py-3 bg-gradient-to-r from-[#00f2ea] to-[#00c4cc] hover:brightness-110 active:scale-98 text-black text-sm font-extrabold rounded-xl transition-all shadow-lg shadow-[#00f2ea]/20 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                  <span>Chuyển Sang Kênh @{sanitizeUsername(username)}</span>
                </button>
              ) : null}

              <button
                onClick={handleDisconnect}
                disabled={isLoading}
                className={`py-3 bg-red-600 hover:bg-red-500 active:scale-98 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 ${
                  username && sanitizeUsername(username).toLowerCase() !== (status.username || '').toLowerCase()
                    ? 'w-full sm:w-auto px-5'
                    : 'w-full'
                }`}
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <WifiOff size={18} />}
                <span>Dừng Cào / Ngắt Kết Nối</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleConnect()}
              disabled={isLoading || !username.trim()}
              className="w-full py-3 bg-gradient-to-r from-[#00f2ea] to-[#00c4cc] hover:brightness-110 active:scale-98 text-black text-sm font-extrabold rounded-xl transition-all shadow-lg shadow-[#00f2ea]/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Đang kết nối @{sanitizeUsername(username) || DEFAULT_TIKTOK_CHANNEL}...</span>
                </>
              ) : (
                <>
                  <Radio size={18} />
                  <span>Bắt Đầu Cào Kênh @{sanitizeUsername(username) || DEFAULT_TIKTOK_CHANNEL}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

