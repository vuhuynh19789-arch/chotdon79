import { PWAInstallButton } from './components/PWAInstallButton';
import PrintServer from "./components/PrintServer";
import React, { useEffect, useState, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import { MoreVertical, Search as SearchIcon, Home, MessageSquare, Users, PlusCircle, Maximize, Trash2, RefreshCw, Bot, ShoppingCart, BarChart3, Radio, Tv, Bell, Sliders } from 'lucide-react';
import { useStore, getCustomerAvatar, isGhostZeroPriceItem, scrubGhostItemsFromStore, isCustomerGheLay, isCustomerNinhThuan } from './store';
import { PLATFORMS, Platform, getShortId, normalizeUser, addRecentSearchPrice, extractPriceFromContent, removeVietnameseAccents, APP_VERSION } from './lib/core';
import { SearchBar, SearchSuggestionItem } from './components/SearchBar';
import { PriceModal, ManualModal, ListModal, ProfileModal, CustomersModal, LiveEfficiencyModal } from './components/Modals';
import { AlertsHubModal } from './components/AlertsHubModal';
import { MinigameModal } from './components/Minigame';
import { AutoCommentModal, useAutoComment } from './components/AutoComment';
import { AutoCloseModal, useAutoClose } from './components/AutoClose';
import { TikTokLiveModal } from './components/TikTokLiveModal';
import { FacebookLiveModal } from './components/FacebookLiveModal';
import { ClearFeedModal } from './components/ClearFeedModal';
import { ResetSessionModal } from './components/ResetSessionModal';
import { SmartLiveMonitor } from './components/SmartLiveMonitor';
import { LiveSupervisorModal } from './components/LiveSupervisorModal';
import { OrderPushSettingsModal } from './components/OrderPushSettingsModal';
import { 
  startDistributedMasterCoordinator, 
  subscribeTikTokStatus, 
  fetchTikTokStatus, 
  TikTokLiveStatus, 
  getTikTokStatus, 
  DEFAULT_TIKTOK_CHANNEL 
} from './lib/tiktokLiveClient';
import {
  initFacebookMasterCoordinator,
  subscribeFacebookStatus,
  fetchFacebookStatus,
  FacebookLiveStatus,
  getFacebookStatus
} from './lib/facebookLiveClient';
import { Feed } from './components/Feed';
import { CustomerAvatar } from './components/UserAvatar';
import { PancakeLinkModal } from './components/PancakeLinkModal';
import { PancakeSyncModal } from './components/PancakeSyncModal';
import { openPancakeApp } from './lib/pancakeDeepLink';
import { getCustomerInsight, getCustomerActivePastItems } from './lib/pancakeSync';
import { ErrorBoundary } from './components/ErrorBoundary';

const COMMANDS = [
    { cmd: '/top10', desc: 'Top 10 khách chốt gần nhất' },
    { cmd: '/cam', desc: 'Top 10 khách chốt Shopee' },
    { cmd: '/tik', desc: 'Top 10 khách chốt TikTok' },
    { cmd: '/face', desc: 'Top 10 khách chốt Facebook' }
];

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('printserver') === 'true') {
      return <PrintServer />;
  }
  const store = useStore();
  const [tabSearches, setTabSearches] = useState<Record<number, string>>({
      0: '',
      1: '',
      2: '',
      3: '',
      4: ''
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<any>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<number>(() => {
      try {
          const savedTab = sessionStorage.getItem('slp_active_tab');
          if (savedTab !== null) {
              const n = parseInt(savedTab, 10);
              if (!isNaN(n) && n >= 0 && n <= 4) return n;
          }
      } catch {}
      return 0;
  });
  const [isNavVisible, setIsNavVisible] = useState(true);
  const navTimerRef = useRef<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [showSmartLiveMonitor, setShowSmartLiveMonitor] = useState(false);
  const [liveModalSource, setLiveModalSource] = useState<'direct' | 'monitor'>('direct');
  const [showTikTokLiveModal, setShowTikTokLiveModal] = useState(false);
  const [tikTokStatus, setTikTokStatus] = useState<TikTokLiveStatus>(getTikTokStatus());
  const [showFacebookLiveModal, setShowFacebookLiveModal] = useState(false);
  const [facebookStatus, setFacebookStatus] = useState<FacebookLiveStatus>(getFacebookStatus());
  const [showOrderPushSettingsModal, setShowOrderPushSettingsModal] = useState(false);
  const lastScrollLeftRef = useRef(0);

  // Auto-hide navigation after 5 seconds of inactivity/appearance
  const resetNavTimer = useCallback(() => {
      if (navTimerRef.current) {
          clearTimeout(navTimerRef.current);
      }
      setIsNavVisible(true);
      navTimerRef.current = setTimeout(() => {
          setIsNavVisible(false);
      }, 5000);
  }, []);

  // Khởi tạo tab: khôi phục tab đang mở nếu vừa quay lại từ app ngoài (Pancake/Zalo), nếu không thì mặc định tab 0
  useEffect(() => {
      let initTab = 0;
      try {
          const savedTab = sessionStorage.getItem('slp_active_tab');
          if (savedTab !== null) {
              const n = parseInt(savedTab, 10);
              if (!isNaN(n) && n >= 0 && n <= 4) initTab = n;
          }
      } catch {}

      setActiveTab(initTab);
      if (scrollContainerRef.current) {
          const w = scrollContainerRef.current.clientWidth || window.innerWidth;
          scrollContainerRef.current.scrollLeft = initTab * w;
      }
      const timer = setTimeout(() => {
          if (scrollContainerRef.current) {
              const w = scrollContainerRef.current.clientWidth || window.innerWidth;
              scrollContainerRef.current.scrollLeft = initTab * w;
          }
      }, 50);
      resetNavTimer();

      // Initialize TikTok Live stream & distributed master coordinator
      startDistributedMasterCoordinator();
      fetchTikTokStatus();
      const unsubTikTok = subscribeTikTokStatus((s) => setTikTokStatus(s));

      // Initialize Facebook Live coordinator
      initFacebookMasterCoordinator();
      fetchFacebookStatus();
      const unsubFacebook = subscribeFacebookStatus((s) => setFacebookStatus(s));

      return () => {
          clearTimeout(timer);
          unsubTikTok();
          unsubFacebook();
          if (navTimerRef.current) clearTimeout(navTimerRef.current);
      };
  }, [resetNavTimer]);

  // Unified scroll direction callback
  const handleContentScroll = useCallback((isDown: boolean) => {
      resetNavTimer();
  }, [resetNavTimer]);

  // Optimized smooth scrolling without scroll-snap fighting
  const goToTab = useCallback((index: number) => {
      setActiveTab(index);
      try {
          sessionStorage.setItem('slp_active_tab', String(index));
      } catch {}
      resetNavTimer();
      const container = scrollContainerRef.current;
      if (!container) return;

      // Mark programmatic scroll to pause onScroll event state updates
      isProgrammaticScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

      const targetLeft = index * container.clientWidth;

      // Temporarily disable CSS scroll-snap to prevent mobile browser snap collision
      container.style.scrollSnapType = 'none';

      // Perform high-performance smooth scroll
      container.scrollTo({
          left: targetLeft,
          behavior: 'smooth'
      });

      const finalizeScroll = () => {
          if (container) {
              container.scrollLeft = targetLeft;
              container.style.scrollSnapType = 'x mandatory';
          }
          isProgrammaticScrollRef.current = false;
      };

      // Listen for scrollend if supported, with timeout fallback for wide mobile browser support
      if ('onscrollend' in window) {
          const handleScrollEnd = () => {
              container.removeEventListener('scrollend', handleScrollEnd);
              finalizeScroll();
          };
          container.addEventListener('scrollend', handleScrollEnd, { once: true });
          scrollTimeoutRef.current = setTimeout(() => {
              container.removeEventListener('scrollend', handleScrollEnd);
              finalizeScroll();
          }, 380);
      } else {
          scrollTimeoutRef.current = setTimeout(finalizeScroll, 320);
      }
  }, [resetNavTimer]);

  // Optimized gesture-based scroll detection using rAF throttling + Swipe detection
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (!el.clientWidth) return;

      const currentLeft = el.scrollLeft;
      // Khi lướt ngang sang trái hoặc phải -> hiện thanh điều hướng ngay lập tức
      if (Math.abs(currentLeft - lastScrollLeftRef.current) > 15) {
          resetNavTimer();
          lastScrollLeftRef.current = currentLeft;
      }

      if (isProgrammaticScrollRef.current) return;

      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

      scrollRafRef.current = requestAnimationFrame(() => {
          const tabIndex = Math.round(el.scrollLeft / el.clientWidth);
          if (tabIndex !== activeTab && tabIndex >= 0 && tabIndex <= 4) {
              setActiveTab(tabIndex);
              try {
                  sessionStorage.setItem('slp_active_tab', String(tabIndex));
              } catch {}
              resetNavTimer();
          }
      });
  }, [activeTab, resetNavTimer]);

  useEffect(() => {
      const handleResize = () => {
          setWindowHeight(window.innerHeight);
          if (scrollContainerRef.current) {
              const el = scrollContainerRef.current;
              el.style.scrollSnapType = 'none';
              el.scrollLeft = activeTab * el.clientWidth;
              requestAnimationFrame(() => {
                  if (scrollContainerRef.current) {
                      scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
                  }
              });
          }
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);
      return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('orientationchange', handleResize);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      };
  }, [activeTab]);
  
  // Modals state với cơ chế tự động khôi phục khi quay lại từ App Pancake / Zalo
  const [activeModal, setActiveModal] = useState<'stats' | 'manual' | 'list' | 'customers' | 'profile' | 'price' | 'minigame' | 'autocomment' | 'autoclose' | null>(() => {
      try {
          const savedModal = sessionStorage.getItem('slp_active_modal');
          const savedUser = sessionStorage.getItem('slp_profile_user');
          const time = Number(sessionStorage.getItem('slp_modal_time') || '0');
          if (savedModal === 'profile' && savedUser && (Date.now() - time < 3600000)) {
              return 'profile';
          }
      } catch {}
      return null;
  });
  const [listFilter, setListFilter] = useState<Platform | null>(null);
  const [profileUser, setProfileUser] = useState<{user: string, platform: Platform} | null>(() => {
      try {
          const savedUser = sessionStorage.getItem('slp_profile_user');
          const time = Number(sessionStorage.getItem('slp_modal_time') || '0');
          if (savedUser && (Date.now() - time < 3600000)) {
              const parsed = JSON.parse(savedUser);
              if (parsed && parsed.user && parsed.platform) {
                  return parsed;
              }
          }
      } catch {}
      return null;
  });
  const [pancakeModalUser, setPancakeModalUser] = useState<{user: string, platform: Platform, initialSearch?: string} | null>(null);

  // Mở hồ sơ khách với lưu trữ phiên để giữ nguyên trạng thái nếu mở app khác
  const handleOpenProfile = useCallback((user: string, platform: Platform) => {
      const clean = normalizeUser(user);
      setProfileUser({ user: clean, platform });
      setActiveModal('profile');
      try {
          sessionStorage.setItem('slp_active_modal', 'profile');
          sessionStorage.setItem('slp_profile_user', JSON.stringify({ user: clean, platform }));
          sessionStorage.setItem('slp_modal_time', String(Date.now()));
          sessionStorage.setItem('slp_active_tab', String(activeTab));
      } catch {}
  }, [activeTab]);

  const handleCloseProfile = useCallback(() => {
      setProfileUser(null);
      setActiveModal(null);
      try {
          sessionStorage.removeItem('slp_active_modal');
          sessionStorage.removeItem('slp_profile_user');
          sessionStorage.removeItem('slp_modal_time');
      } catch {}
  }, []);

  const autoComment = useAutoComment();
  const autoClose = useAutoClose();
  const [pendingPrint, setPendingPrint] = useState<{id: string | null, user: string, platform: Platform, defaultPrice?: string} | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hostMode, setHostMode] = useState(false);
  const [showClearFeedModal, setShowClearFeedModal] = useState(false);
  const [showResetSessionModal, setShowResetSessionModal] = useState(false);
  const [showPancakeSyncModal, setShowPancakeSyncModal] = useState(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
      setToastNotification(msg);
      setTimeout(() => {
          setToastNotification(prev => prev === msg ? null : prev);
      }, 4500);
  }, []);

  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        triggerToast(String(customEvent.detail));
      }
    };
    window.addEventListener('app_toast_notification', handleCustomToast);
    return () => window.removeEventListener('app_toast_notification', handleCustomToast);
  }, [triggerToast]);

  useEffect(() => {
    store.initPolling();
    scrubGhostItemsFromStore();
    
    // Prevent screen sleep safely
    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
                wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
            }
        } catch {
            // Silently ignore permissions policy disallow or ungranted permissions
        }
    };
    requestWakeLock();
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
            wakeLockSentinel.release().catch(() => {});
        }
    };
  }, []);




  // Đảm bảo không tự động xoá dữ liệu chốt đơn khi mở máy hoặc sang ngày mới
  // Mọi thao tác reset phiên chốt đơn PHẢI do người dùng chủ động bấm trong modal ResetSessionModal
  useEffect(() => {
      const todayStr = new Date().toLocaleDateString('en-GB');
      localStorage.setItem('slp_webapp_last_reset', todayStr);
  }, []);

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => {
              console.log(`Error attempting to enable fullscreen: ${err.message}`);
          });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
          }
      }
  };

  // Calculate totals for header with debug logging for items with price=0 or quantity=0
  let totalCount = 0;
  let totalRevenue = 0;
  const platformStats = { tiktok: { c: 0, r: 0 }, facebook: { c: 0, r: 0 }, shopee: { c: 0, r: 0 } };
  const zeroItemsDetected: Array<{ platform: Platform; user: string; index: number; item: any; reason: string }> = [];

  (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
    const pStore = store[p];
    if (!pStore) return;
    const custs = (pStore.customers || {}) as Record<string, any>;
    Object.entries(custs).forEach(([userName, c]) => {
        if (!c) return;
        const rawItems = Array.isArray(c.items) ? c.items : [];

        // Kiểm tra và ghi log từng item có price = 0 hoặc quantity = 0
        rawItems.forEach((it: any, itIdx: number) => {
            const pVal = Number(it?.price);
            const uVal = Number(it?.unitPrice);
            const qVal = Number(it?.quantity);
            if (pVal === 0 || uVal === 0 || qVal === 0 || isNaN(pVal) || pVal < 0 || qVal < 0) {
                const reason = `price=${it?.price}, unitPrice=${it?.unitPrice}, quantity=${it?.quantity}, content="${it?.content || ''}"`;
                zeroItemsDetected.push({ platform: p, user: userName, index: itIdx, item: it, reason });
                console.warn(`[DEBUG TÍNH TỔNG] ⚠️ Phát hiện item 0₫/SL=0 tại @${userName} (${p}):`, {
                    user: userName,
                    platform: p,
                    itemIndex: itIdx,
                    id: it?.id,
                    content: it?.content,
                    price: it?.price,
                    unitPrice: it?.unitPrice,
                    quantity: it?.quantity,
                    isGhost: isGhostZeroPriceItem(it)
                });
            }
        });

        // Kiểm tra nếu khách có count > 0 nhưng total = 0
        if ((c.count || 0) > 0 && (c.total || 0) === 0) {
            console.warn(`[DEBUG TÍNH TỔNG] ⚠️ Khách @${userName} (${p}) có count=${c.count} nhưng total=0:`, c);
        }

        const validItems = rawItems.filter((it: any) => !isGhostZeroPriceItem(it));
        let custQty = 0;
        if (validItems.length > 0) {
            custQty = validItems.reduce((s: number, it: any) => {
                const q = (it && typeof it.quantity === 'number') ? it.quantity : 1;
                return s + (q > 0 ? q : 0);
            }, 0);
        } else if (!Array.isArray(c.items) && (c.total || 0) > 0) {
            custQty = c.count || 0;
        }
        platformStats[p].c += custQty;
        platformStats[p].r += c.total || 0;
    });
    totalCount += platformStats[p].c;
    totalRevenue += platformStats[p].r;
  });

  // Tổng hợp kết quả đếm ra console nếu có item 0₫ hoặc khi totalCount được tính
  useEffect(() => {
    if (zeroItemsDetected.length > 0) {
        console.group(`🚨 [TỔNG HỢP GIỎ HÀNG] Có ${zeroItemsDetected.length} items 0₫ hoặc quantity=0:`);
        zeroItemsDetected.forEach(z => {
            console.log(`[${z.platform.toUpperCase()}] @${z.user} -> #${z.index + 1}: ${z.reason}`, z.item);
        });
        console.log(`📊 Kết quả header: totalCount = ${totalCount} cái | totalRevenue = ${totalRevenue}k`);
        console.groupEnd();
    }
  }, [zeroItemsDetected.length, totalCount, totalRevenue]);

  const totalHeldWarningsCount = useMemo(() => {
      let count = 0;
      const now = Date.now();
      const twoDaysMs = 2 * 86400000;
      (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
          const pStore = store[p];
          if (!pStore) return;
          const custs = pStore.customers || {};
          Object.keys(custs).forEach(rawUser => {
              const user = normalizeUser(rawUser);
              const cust = custs[rawUser];
              if (!cust) return;
              const activeInsight = getCustomerInsight(user);
              const activePast = getCustomerActivePastItems(cust, activeInsight);
              const activeCur = (cust.items || []).filter(it => it && !it.shipped);
              const totalActive = [...activeCur, ...activePast.map(t => t.item).filter(Boolean)];
              if (totalActive.length === 1) {
                  const timestamps = totalActive.map(it => (it && it.createdAt) || (it && it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || cust.lastTime || now).filter(ts => !isNaN(ts) && ts > 0);
                  const oldestTs = timestamps.length > 0 ? Math.min(...timestamps) : now;
                  if (activePast.length > 0 || (now - oldestTs >= twoDaysMs)) {
                      count++;
                  }
              }
          });
      });
      return count;
  }, [store]);

  const tabSearchContext = useMemo(() => {
      switch (activeTab) {
          case 0:
              return {
                  badge: '💬 Chat Live',
                  badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
                  placeholder: 'Tìm nội dung cmt, tên khách trên Live... (hoặc /top10)'
              };
          case 1:
              return {
                  badge: '🛒 Giỏ hàng',
                  badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                  placeholder: 'Tìm giỏ hàng theo tên khách, #id, tên món chốt...'
              };
          case 2:
              return {
                  badge: '👥 Khách hàng',
                  badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                  placeholder: 'Tìm khách hàng theo tên, biệt danh, #id, SĐT...'
              };
          case 3:
              return {
                  badge: '📊 Hiệu quả',
                  badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                  placeholder: 'Tìm số liệu khách trong bảng hiệu quả...'
              };
          case 4:
              return {
                  badge: '🔔 Thông báo',
                  badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                  placeholder: 'Tìm cảnh báo giữ đơn, lịch sử đẩy đơn, khách cọc...'
              };
          default:
              return {
                  badge: '🔍 Tìm',
                  badgeColor: 'bg-white/10 text-gray-300 border-white/20',
                  placeholder: 'Tìm kiếm...'
              };
      }
  }, [activeTab]);

  const currentSearch = tabSearches[activeTab] || '';
  const [hiddenCrossTabSuggestionKey, setHiddenCrossTabSuggestionKey] = useState<string | null>(null);

  // Gợi ý tìm kiếm liên trang (ví dụ tìm ở tab Khách/Giỏ rồi chuyển sang tab Chat)
  const otherTabWithSearch = useMemo(() => {
      return Object.entries(tabSearches).find(([tabIdx, str]) => Number(tabIdx) !== activeTab && str && str.trim());
  }, [tabSearches, activeTab]);

  const currentSuggestionKey = (!currentSearch && otherTabWithSearch) 
      ? `${activeTab}_${otherTabWithSearch[0]}_${otherTabWithSearch[1]}` 
      : null;

  // Tự động ẩn thanh gợi ý tìm kiếm liên trang sau 3 giây nếu người dùng không bấm
  useEffect(() => {
      if (!currentSuggestionKey) return;
      if (hiddenCrossTabSuggestionKey === currentSuggestionKey) return;

      const timer = setTimeout(() => {
          setHiddenCrossTabSuggestionKey(currentSuggestionKey);
      }, 3000);

      return () => clearTimeout(timer);
  }, [currentSuggestionKey, hiddenCrossTabSuggestionKey]);

  const handleSearchChange = useCallback((val: string) => {
      setHiddenCrossTabSuggestionKey(null);
      setTabSearches(prev => ({ ...prev, [activeTab]: val }));
      if (val.trim()) {
          const numMatch = val.trim().match(/^(\d+)\s*(k|ka|ca|cành)?$/i);
          if (numMatch && parseInt(numMatch[1], 10) >= 5) {
              addRecentSearchPrice(numMatch[1]);
          } else {
              const extracted = extractPriceFromContent(val);
              if (extracted.price && parseInt(extracted.price, 10) >= 5) {
                  addRecentSearchPrice(extracted.price);
              }
          }
      }
  }, [activeTab]);

  const handleClearSearch = useCallback(() => {
      setHiddenCrossTabSuggestionKey(null);
      setTabSearches(prev => ({ ...prev, [activeTab]: '' }));
      setIsSearchFocused(false);
  }, [activeTab]);

  const handleSelectSuggestion = useCallback((item: SearchSuggestionItem) => {
      // Chỉ load và lọc theo trang hiện tại đang đứng
      setTabSearches(prev => ({ ...prev, [activeTab]: item.user }));
      setIsSearchFocused(false);
  }, [activeTab]);

  // Tìm kiếm gợi ý khách hàng y hệt như ô tìm tên ở mục Tạo mới
  const searchSuggestions = useMemo(() => {
      const raw = currentSearch.trim();
      if (!raw || raw.startsWith('/')) return [];
      const keyword = raw.toLowerCase();
      const kwNoAccent = removeVietnameseAccents(keyword);
      const isIdSearch = keyword.startsWith('#') || /^\d+$/.test(keyword);
      const targetId = keyword.startsWith('#') ? keyword.slice(1) : keyword;

      const results: SearchSuggestionItem[] = [];
      const seenUsers = new Set<string>();

      (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
          const pStore = store[p];
          if (!pStore) return;
          const custs = pStore.customers || {};
          const nicks = pStore.nicknames || {};
          const tags = pStore.tags || {};

          Object.entries(custs).forEach(([rawUser, data]) => {
              const clean = normalizeUser(rawUser);
              const dedupeKey = `${p}_${clean.toLowerCase()}`;
              if (seenUsers.has(dedupeKey)) return;

              const nick = nicks[clean] || nicks[rawUser] || '';
              const tag = tags[clean] || tags[rawUser] || 'NORMAL';
              const shortId = getShortId(clean).toLowerCase();
              const userLower = clean.toLowerCase();
              const userNoAccent = removeVietnameseAccents(userLower);
              const nickLower = nick.toLowerCase();
              const nickNoAccent = removeVietnameseAccents(nickLower);

              let match = false;
              if (isIdSearch) {
                  if (shortId === targetId || ('#' + shortId) === keyword || shortId.includes(targetId)) {
                      match = true;
                  }
              } else {
                  if (
                      userLower.includes(keyword) ||
                      userNoAccent.includes(kwNoAccent) ||
                      nickLower.includes(keyword) ||
                      nickNoAccent.includes(kwNoAccent)
                  ) {
                      match = true;
                  }
              }

              if (match) {
                  seenUsers.add(dedupeKey);
                  const isNt = isCustomerNinhThuan(pStore.ninhThuanTags, clean);
                  const isGl = isCustomerGheLay(pStore.gheLayTags, clean, pStore.tags);
                  results.push({
                      user: clean,
                      nickname: nick,
                      shortId,
                      platform: p,
                      tag,
                      isNinhThuan: isNt,
                      isGheLay: isGl,
                      count: (data as any)?.count || 0,
                      total: (data as any)?.total || 0,
                      lastTime: (data as any)?.lastTime || 0
                  });
              }
          });
      });

      // Nếu đang ở tab Chat Live, tìm thêm cả khách đang bình luận trên live
      if (activeTab === 0) {
          (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
              const pStore = store[p];
              if (!pStore || !pStore.comments) return;
              pStore.comments.slice(0, 100).forEach(c => {
                  if (!c || !c.user) return;
                  const clean = normalizeUser(c.user);
                  const dedupeKey = `${p}_${clean.toLowerCase()}`;
                  if (seenUsers.has(dedupeKey)) return;

                  const shortId = getShortId(clean).toLowerCase();
                  const userLower = clean.toLowerCase();
                  const userNoAccent = removeVietnameseAccents(userLower);

                  let match = false;
                  if (isIdSearch) {
                      if (shortId === targetId || ('#' + shortId) === keyword || shortId.includes(targetId)) {
                          match = true;
                      }
                  } else {
                      if (userLower.includes(keyword) || userNoAccent.includes(kwNoAccent)) {
                          match = true;
                      }
                  }

                  if (match) {
                      seenUsers.add(dedupeKey);
                      const isNt = isCustomerNinhThuan(pStore.ninhThuanTags, clean);
                      const isGl = isCustomerGheLay(pStore.gheLayTags, clean, pStore.tags);
                      results.push({
                          user: clean,
                          nickname: pStore.nicknames?.[clean] || '',
                          shortId,
                          platform: p,
                          tag: pStore.tags?.[clean] || 'NORMAL',
                          isNinhThuan: isNt,
                          isGheLay: isGl,
                          count: pStore.customers?.[clean]?.count || 0,
                          total: pStore.customers?.[clean]?.total || 0,
                          lastTime: Number(c.ts) || 0
                      });
                  }
              });
          });
      }

      results.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
      return results.slice(0, 8);
  }, [currentSearch, activeTab, store.tiktok.customers, store.facebook.customers, store.shopee.customers, store.tiktok.nicknames, store.facebook.nicknames, store.shopee.nicknames, store.tiktok.tags, store.facebook.tags, store.shopee.tags, store.tiktok.ninhThuanTags, store.facebook.ninhThuanTags, store.shopee.ninhThuanTags, store.tiktok.comments, store.facebook.comments, store.shopee.comments]);

  return (
    <div className="w-full max-w-5xl xl:max-w-6xl mx-auto bg-[#0e1621] flex flex-col relative overflow-hidden shadow-2xl h-[100dvh] min-h-[100dvh]">
        {/* Header */}
        <div className="bg-[#1c242f] text-white py-2 shrink-0 z-50 shadow-md border-b border-white/5">
            {/* Main Header Bar */}
            <div className="flex items-center justify-between px-3 gap-2">
                {/* Left: Brand & TikTok Live Status */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-white text-[16px] sm:text-[17px] font-black tracking-tight flex items-center gap-1">
                            <span>Chốt Đơn</span>
                            <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.2 rounded shadow-xs">
                                {APP_VERSION}
                            </span>
                        </span>
                        <span 
                            className="w-2 h-2 rounded-full shrink-0" 
                            style={{ backgroundColor: store.syncStatus.color }}
                            title={store.syncStatus.text}
                        />
                    </div>

                    {/* Smart Live Monitor: Unified Health Status Dashboard & Quick Override */}
                    <SmartLiveMonitor 
                        isOpen={showSmartLiveMonitor}
                        onOpen={() => setShowSmartLiveMonitor(true)}
                        onClose={() => setShowSmartLiveMonitor(false)}
                        onOpenTikTokModal={() => {
                            setLiveModalSource('monitor');
                            setShowSmartLiveMonitor(false);
                            setShowTikTokLiveModal(true);
                        }}
                        onOpenFacebookModal={() => {
                            setLiveModalSource('monitor');
                            setShowSmartLiveMonitor(false);
                            setShowFacebookLiveModal(true);
                        }}
                    />
                </div>

                {/* Right: Summary Card & Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button 
                        onClick={() => goToTab(1)}
                        className="bg-[#232e3c] hover:bg-[#2c3a4b] active:scale-95 rounded-xl px-2.5 py-1 text-center cursor-pointer border border-white/10 shadow-sm transition-all flex flex-col justify-center shrink-0"
                        title="Xem danh sách & thống kê giỏ hàng"
                    >
                        <div className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider leading-none">TỔNG CHUNG</div>
                        <div className="text-[13px] font-black text-white leading-tight mt-0.5 whitespace-nowrap">
                            {totalCount} <span className="text-[10px] font-normal text-gray-400">cái</span> <span className="text-gray-500 font-normal mx-0.5">|</span> {totalRevenue}k
                        </div>
                    </button>

                    <div className="relative">
                        <button 
                            onClick={() => setShowMenu(!showMenu)} 
                            className="p-1.5 text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-white/5 active:scale-95 cursor-pointer"
                        >
                            <MoreVertical size={20} />
                        </button>
                        {showMenu && (
                        <div className="absolute right-0 top-full mt-1 w-64 bg-[#232e3c] rounded-xl shadow-2xl border border-white/10 overflow-hidden z-[100] animate-in fade-in zoom-in duration-200">
                            <div className="p-2 border-b border-white/5 bg-emerald-950/30 flex items-center justify-between">
                                <PWAInstallButton className="py-1" />
                                <span className="text-[10px] font-mono font-bold text-amber-300 bg-black/40 border border-amber-500/30 px-2 py-0.5 rounded-md">
                                    Phiên bản: {APP_VERSION}
                                </span>
                            </div>
                            <button 
                                onClick={() => { setShowMenu(false); setLiveModalSource('direct'); setShowTikTokLiveModal(true); }} 
                                className="w-full text-left px-4 py-3 text-[14px] text-white hover:bg-white/10 flex items-center gap-3 bg-gradient-to-r from-[#00f2ea]/10 to-transparent border-b border-white/5"
                            >
                                <Radio size={18} className={tikTokStatus.isConnected ? "text-[#00f2ea] animate-pulse" : "text-[#00f2ea]"} />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">Cào TikTok Live</span>
                                        {tikTokStatus.isConnected && (
                                            <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded-full border border-emerald-500/30">LIVE</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                        {tikTokStatus.isConnected ? `@${tikTokStatus.username} (${tikTokStatus.viewerCount} mắt)` : 'Hút comment TikTok trực tiếp'}
                                    </div>
                                </div>
                            </button>
                            <button 
                                onClick={() => { setShowMenu(false); setLiveModalSource('direct'); setShowFacebookLiveModal(true); }} 
                                className="w-full text-left px-4 py-3 text-[14px] text-white hover:bg-white/10 flex items-center gap-3 bg-gradient-to-r from-blue-600/10 to-transparent border-b border-white/5"
                            >
                                <Tv size={18} className={facebookStatus.isConnected ? "text-blue-400 animate-pulse" : "text-blue-400"} />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">Cào Facebook Live</span>
                                        {facebookStatus.isConnected && (
                                            <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-1.5 py-0.2 rounded-full border border-blue-500/30">LIVE</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                        {facebookStatus.isConnected ? `${facebookStatus.target} (${facebookStatus.totalCommentsCount} cmt)` : 'Nhập link live / ID Fanpage'}
                                    </div>
                                </div>
                            </button>
                            <button onClick={() => { setShowMenu(false); setActiveModal('autocomment'); }} className="w-full text-left px-4 py-3 text-[14px] text-white hover:bg-white/10 flex items-center gap-3">
                                <Bot size={18} className="text-[#4ade80]" />
                                <span>Auto Comment</span>
                            </button>
                            <button 
                                onClick={() => { setShowMenu(false); setShowOrderPushSettingsModal(true); }} 
                                className="w-full text-left px-4 py-3 text-[14px] text-white hover:bg-white/10 flex items-center gap-3 bg-gradient-to-r from-amber-500/10 to-transparent border-t border-b border-white/5 cursor-pointer"
                            >
                                <Sliders size={18} className="text-amber-400" />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-amber-300">Cài đặt API Đẩy Đơn</span>
                                        <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">Mới</span>
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                        Lưu trên App • Đẩy trực tiếp • Không nghẽn Vercel
                                    </div>
                                </div>
                            </button>
                            <button onClick={() => { setShowMenu(false); toggleFullscreen(); }} className="w-full text-left px-4 py-3 text-[14px] text-white hover:bg-white/10 flex items-center gap-3">
                                <Maximize size={18} className="text-gray-400" />
                                <span>Toàn màn hình</span>
                            </button>
                            <button onClick={async (e) => { 
                                const b = e.currentTarget; const icon = b.querySelector('svg');
                                if(icon) icon.classList.add('animate-spin');
                                await store.refreshPlatform('tiktok'); 
                                setShowMenu(false);
                            }} className="w-full text-left px-4 py-3 text-[14px] text-white hover:bg-white/10 flex items-center gap-3 border-t border-white/5">
                                <RefreshCw size={18} className="text-blue-400" />
                                <span>Làm mới dữ liệu</span>
                            </button>
                            <button onClick={() => { 
                                setShowMenu(false);
                                setShowResetSessionModal(true);
                            }} className="w-full text-left px-4 py-3 text-[14px] text-amber-400 hover:bg-white/10 flex items-center gap-3 border-t border-white/5 cursor-pointer">
                                <Trash2 size={18} />
                                <span>Reset số liệu phiên</span>
                            </button>
                            <button onClick={() => { 
                                setShowMenu(false);
                                setShowClearFeedModal(true);
                            }} className="w-full text-left px-4 py-3 text-[14px] text-[#ff6b6b] hover:bg-white/10 flex items-center gap-3 cursor-pointer">
                                <Trash2 size={18} />
                                <span>Xoá Feed (Bắt đầu live mới)</span>
                            </button>
                        </div>
                    )}
                    </div>
                </div>
            </div>

            {/* Search Bar under Stats - Instant access & Contextual for active tab */}
            <div className="px-3 pt-2 pb-1">
                <SearchBar
                    value={currentSearch}
                    badgeLabel={tabSearchContext.badge}
                    badgeColorClass={tabSearchContext.badgeColor}
                    placeholder={tabSearchContext.placeholder}
                    suggestions={searchSuggestions}
                    onSelectSuggestion={handleSelectSuggestion}
                    onSearchChange={handleSearchChange}
                    isFocused={isSearchFocused}
                    onFocus={() => {
                        setIsSearchFocused(true);
                    }}
                    onBlur={() => {
                        setTimeout(() => {
                            setIsSearchFocused(false);
                        }, 200);
                    }}
                    onClear={handleClearSearch}
                />
            </div>


        </div>

        {/* Quick Commands Overlay - Only shows autocomplete when typing slash commands like /top10 */}
        {currentSearch.startsWith('/') && COMMANDS.filter(c => c.cmd.startsWith(currentSearch.toLowerCase()) && c.cmd !== currentSearch.toLowerCase()).length > 0 ? (
            <div 
                onMouseDown={(e) => e.preventDefault()}
                className="bg-[#1c242f] border-b border-white/10 z-50 absolute w-full shadow-2xl transition-all duration-200 bottom-[58px] overflow-y-auto top-[96px] sm:top-[98px]"
            >
                <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5 bg-[#131d2a]">
                    <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                        ⌨️ Lệnh tìm kiếm nhanh
                    </span>
                    <button 
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleClearSearch} 
                        className="text-xs text-gray-400 hover:text-white cursor-pointer px-2 py-1 rounded hover:bg-white/5"
                    >
                        Đóng
                    </button>
                </div>
                {COMMANDS.filter(c => c.cmd.startsWith(currentSearch.toLowerCase()) && c.cmd !== currentSearch.toLowerCase()).map((c, idx) => (
                    <div 
                        key={idx} 
                        className="flex items-center gap-3 px-4 py-3 border-t border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { handleSearchChange(c.cmd); document.querySelector('input')?.focus(); }}
                    >
                        <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg font-bold text-xs border border-blue-500/30">{c.cmd}</span>
                        <span className="text-sm font-medium text-gray-300">{c.desc}</span>
                    </div>
                ))}
            </div>
        ) : null}


        <style>{`
            @keyframes pulse-red-green {
                0% { background-color: #ef4444; }
                50% { background-color: #22c55e; }
                100% { background-color: #ef4444; }
            }
            .animate-red-green {
                animation: pulse-red-green 1.5s infinite;
            }
        `}</style>
        
        
        <div 
            ref={scrollContainerRef} 
            onScroll={handleScroll} 
            onTouchStart={resetNavTimer}
            onTouchMove={resetNavTimer}
            onPointerDown={resetNavTimer}
            className="flex-1 flex overflow-x-auto snap-x snap-mandatory hide-scrollbar relative select-none"
            style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorX: 'contain',
                touchAction: 'pan-x pan-y'
            }}
        >
            {/* TAB 0: HOME / FEED */}
            <div className="w-full shrink-0 snap-center h-full flex flex-col relative overflow-hidden">
                <ErrorBoundary>
                    <Feed 
                        searchKeyword={tabSearches[0] || ''} 
                        hostMode={hostMode} 
                        onOpenPrice={(id, user, platform, defaultPrice) => {
                            setPendingPrint({ id, user, platform, defaultPrice });
                            setActiveModal('price');
                        }}
                        onOpenProfile={handleOpenProfile}
                        onOpenPancakeLink={(user, platform, initialSearch) => {
                            setPancakeModalUser({ user, platform, initialSearch });
                        }}
                        onScroll={handleContentScroll}
                        onOpenManualOrder={() => setIsManualModalOpen(true)}
                    />
                </ErrorBoundary>
            </div>

            {/* TAB 1: LIST / CART */}
            <div className="w-full shrink-0 snap-center h-full flex flex-col bg-transparent relative overflow-hidden">
                <ErrorBoundary>
                    <ListModal 
                        isPage={true}
                        filterPlatform={listFilter} 
                        searchKeyword={tabSearches[1] || ''} 
                        onClose={() => {}} 
                        onOpenProfile={handleOpenProfile} 
                        onOpenPrice={(id, u, p) => {
                            setPendingPrint({ id, user: u, platform: p });
                            setActiveModal('price');
                        }}
                        onOpenPancakeLink={(user, platform, initialSearch) => {
                            setPancakeModalUser({ user, platform, initialSearch });
                        }}
                        onScroll={handleContentScroll}
                        onSetFilter={setListFilter}
                    />
                </ErrorBoundary>
            </div>

            {/* TAB 2: CUSTOMERS */}
            <div className="w-full shrink-0 snap-center h-full bg-transparent relative overflow-hidden">
                <ErrorBoundary>
                    <CustomersModal 
                        isPage={true}
                        searchKeyword={tabSearches[2] || ''} 
                        onClose={() => {}} 
                        onOpenProfile={handleOpenProfile} 
                        onOpenNewOrder={(u, p) => { 
                            setPendingPrint({ id: null, user: u, platform: p }); 
                            setActiveModal('price'); 
                        }} 
                        onOpenPancakeLink={(user, platform, initialSearch) => {
                            setPancakeModalUser({ user, platform, initialSearch });
                        }}
                        onScroll={handleContentScroll}
                    />
                </ErrorBoundary>
            </div>

            {/* TAB 3: EFFICIENCY / STATS */}
            <div className="w-full shrink-0 snap-center h-full bg-transparent relative overflow-hidden">
                <ErrorBoundary>
                    <LiveEfficiencyModal 
                        isPage={true}
                        searchKeyword={tabSearches[3] || ''}
                        onClose={() => {}} 
                        onOpenProfile={handleOpenProfile} 
                        onOpenPrice={(id, u, p) => {
                            setPendingPrint({ id, user: u, platform: p });
                            setActiveModal('price');
                        }}
                        onScroll={handleContentScroll}
                    />
                </ErrorBoundary>
            </div>

            {/* TAB 4: ALERTS / NOTIFICATIONS & WARNINGS HUB */}
            <div className="w-full shrink-0 snap-center h-full bg-transparent relative overflow-hidden">
                <ErrorBoundary>
                    <AlertsHubModal 
                        isPage={true}
                        searchKeyword={tabSearches[4] || ''}
                        onClose={() => {
                            goToTab(0);
                        }} 
                        onOpenProfile={handleOpenProfile} 
                        onOpenPrice={(id, u, p) => {
                            setPendingPrint({ id, user: u, platform: p });
                            setActiveModal('price');
                        }}
                        onOpenPancakeLink={(user, platform, initialSearch) => {
                            setPancakeModalUser({ user, platform, initialSearch });
                        }}
                        onScroll={handleContentScroll}
                    />
                </ErrorBoundary>
            </div>
        </div>

        {/* Bottom Navigation with 5s Auto-hide and Full-width Bottom Alignment */}
        <div 
            onTouchStart={resetNavTimer}
            onMouseEnter={resetNavTimer}
            onClick={resetNavTimer}
            className={`fixed bottom-0 left-0 right-0 w-full bg-[#0e1621]/95 backdrop-blur-2xl z-50 flex justify-around items-center border-t border-white/10 rounded-t-2xl px-1 sm:px-4 ios-bottom-nav shadow-[0_-6px_30px_rgba(0,0,0,0.6)] transform-gpu transition-all duration-300 ease-out ${
                isNavVisible 
                    ? 'translate-y-0 opacity-100 pointer-events-auto scale-100' 
                    : 'translate-y-[110%] opacity-0 pointer-events-none scale-[0.98]'
            }`}
        >
            <button onClick={() => goToTab(0)} className="flex flex-col items-center justify-center flex-1 min-w-0 py-1 relative cursor-pointer active:scale-95 transition-transform">
                <div className={`w-[32px] sm:w-[42px] h-7 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 ${activeTab === 0 ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
                    <Home size={17} />
                </div>
                <span className={`text-[8.5px] xs:text-[9.5px] sm:text-[11px] mt-0.5 font-bold transition-all duration-300 whitespace-nowrap leading-none tracking-tighter text-center ${activeTab === 0 ? 'text-blue-400 font-black scale-105' : 'text-gray-400'}`}>Chat</span>
            </button>

            <button onClick={() => goToTab(1)} className="flex flex-col items-center justify-center flex-1 min-w-0 py-1 relative cursor-pointer active:scale-95 transition-transform">
                <div className={`w-[32px] sm:w-[42px] h-7 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 ${activeTab === 1 ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
                    <div className="relative">
                        <ShoppingCart size={17} />
                    </div>
                </div>
                <span className={`text-[8.5px] xs:text-[9.5px] sm:text-[11px] mt-0.5 font-bold transition-all duration-300 whitespace-nowrap leading-none tracking-tighter text-center ${activeTab === 1 ? 'text-blue-400 font-black scale-105' : 'text-gray-400'}`}>Giỏ hàng</span>
            </button>

            <button onClick={() => goToTab(2)} className="flex flex-col items-center justify-center flex-1 min-w-0 py-1 relative cursor-pointer active:scale-95 transition-transform">
                <div className={`w-[32px] sm:w-[42px] h-7 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 ${activeTab === 2 ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
                    <Users size={17} />
                </div>
                <span className={`text-[8.5px] xs:text-[9.5px] sm:text-[11px] mt-0.5 font-bold transition-all duration-300 whitespace-nowrap leading-none tracking-tighter text-center ${activeTab === 2 ? 'text-blue-400 font-black scale-105' : 'text-gray-400'}`}>Khách hàng</span>
            </button>

            <button onClick={() => goToTab(3)} className="flex flex-col items-center justify-center flex-1 min-w-0 py-1 relative cursor-pointer active:scale-95 transition-transform">
                <div className={`w-[32px] sm:w-[42px] h-7 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 ${activeTab === 3 ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
                    <BarChart3 size={17} />
                </div>
                <span className={`text-[8.5px] xs:text-[9.5px] sm:text-[11px] mt-0.5 font-bold transition-all duration-300 whitespace-nowrap leading-none tracking-tighter text-center ${activeTab === 3 ? 'text-blue-400 font-black scale-105' : 'text-gray-400'}`}>Hiệu quả</span>
            </button>

            <button onClick={() => goToTab(4)} className="flex flex-col items-center justify-center flex-1 min-w-0 py-1 relative cursor-pointer active:scale-95 transition-transform">
                <div className={`w-[32px] sm:w-[42px] h-7 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 relative ${activeTab === 4 ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
                    <Bell size={17} />
                    {totalHeldWarningsCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-black px-1 rounded-full min-w-[15px] h-[15px] flex items-center justify-center border border-[#0e1621] shadow-xs animate-pulse">
                            {totalHeldWarningsCount > 99 ? '99+' : totalHeldWarningsCount}
                        </span>
                    )}
                </div>
                <span className={`text-[8.5px] xs:text-[9.5px] sm:text-[11px] mt-0.5 font-bold transition-all duration-300 whitespace-nowrap leading-none tracking-tighter text-center ${activeTab === 4 ? 'text-blue-400 font-black scale-105' : 'text-gray-400'}`}>Thông báo</span>
            </button>
        </div>

        {/* Subtle Quick Reveal Touch Bar with Fade Animation */}
        <div 
            onClick={resetNavTimer}
            onTouchStart={resetNavTimer}
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-40 px-8 py-2 cursor-pointer flex items-center justify-center transition-all duration-500 transform-gpu active:scale-90 ${
                !isNavVisible ? 'opacity-70 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'
            }`}
            title="Bấm hoặc lướt để hiện thanh điều hướng"
        >
            <div className="w-14 h-1.5 bg-white/40 hover:bg-white/70 rounded-full shadow-lg backdrop-blur-sm transition-colors"></div>
        </div>

        {/* Modals */}
        
        
        
        {activeModal === 'price' && pendingPrint && (
            <PriceModal 
                pendingPrint={pendingPrint} 
                onClose={() => {
                    setPendingPrint(null);
                    if (profileUser) {
                        setActiveModal('profile');
                    } else {
                        setActiveModal(null);
                    }
                }} 
            />
        )}
        {activeModal === 'profile' && profileUser && (
            <ProfileModal 
                user={profileUser.user} 
                platform={profileUser.platform} 
                onClose={handleCloseProfile} 
                onOpenPrice={(id, u, p) => {
                    setPendingPrint({ id, user: u, platform: p });
                    setActiveModal('price');
                }}
                onOpenPancakeLink={(user, platform, initialSearch) => {
                    setPancakeModalUser({ user, platform, initialSearch });
                }}
            />
        )}
        {activeModal === 'minigame' && (
            <MinigameModal 
                onClose={() => setActiveModal(null)} 
                onOpenProfile={handleOpenProfile}
                onOpenPrice={(id, u, p) => { setPendingPrint({id, user: u, platform: p}); setActiveModal('price'); }}
            />
        )}
        {activeModal === 'autoclose' && (
            <AutoCloseModal 
                config={autoClose.config} 
                saveConfig={autoClose.saveConfig} 
                onClose={() => setActiveModal(null)} 
            />
        )}
        {activeModal === 'autocomment' && (
            <AutoCommentModal 
                config={autoComment.config} 
                saveConfig={autoComment.saveConfig} 
                onClose={() => setActiveModal(null)} 
            />
        )}
        {isManualModalOpen && (
            <ManualModal 
                isPage={false}
                initialSearch=""
                onClose={() => setIsManualModalOpen(false)} 
                onSaved={() => {
                    setIsManualModalOpen(false);
                    goToTab(1); // Khi bấm lưu thì tự nhảy về trang giỏ hàng để kiểm tra đơn
                }}
                onOpenProfile={handleOpenProfile} 
            />
        )}
        <TikTokLiveModal 
            isOpen={showTikTokLiveModal} 
            onClose={() => {
                setShowTikTokLiveModal(false);
                if (liveModalSource === 'monitor') {
                    setShowSmartLiveMonitor(true);
                }
            }} 
            onBack={() => {
                setShowTikTokLiveModal(false);
                setShowSmartLiveMonitor(true);
            }}
            onOpenAutoComment={() => setActiveModal('autocomment')}
        />

        <FacebookLiveModal 
            isOpen={showFacebookLiveModal} 
            onClose={() => {
                setShowFacebookLiveModal(false);
                if (liveModalSource === 'monitor') {
                    setShowSmartLiveMonitor(true);
                }
            }} 
            onBack={() => {
                setShowFacebookLiveModal(false);
                setShowSmartLiveMonitor(true);
            }}
        />

        <LiveSupervisorModal />

        <ClearFeedModal 
            isOpen={showClearFeedModal} 
            onClose={() => setShowClearFeedModal(false)} 
            onSuccess={(msg) => triggerToast(msg)} 
        />

        <ResetSessionModal 
            isOpen={showResetSessionModal} 
            onClose={() => setShowResetSessionModal(false)} 
            onSuccess={(msg) => triggerToast(msg)} 
        />

        {pancakeModalUser && (
            <PancakeLinkModal 
                isOpen={!!pancakeModalUser}
                user={pancakeModalUser.user}
                platform={pancakeModalUser.platform}
                initialSearch={pancakeModalUser.initialSearch}
                onClose={() => setPancakeModalUser(null)}
                onSuccess={(msg) => triggerToast(msg)}
            />
        )}

        <PancakeSyncModal 
            isOpen={showPancakeSyncModal} 
            onClose={() => setShowPancakeSyncModal(false)} 
        />

        <OrderPushSettingsModal
            isOpen={showOrderPushSettingsModal}
            onClose={() => setShowOrderPushSettingsModal(false)}
            onSuccess={(msg) => triggerToast(msg)}
        />

        {toastNotification && (
            <div className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[9999] w-[94%] max-w-lg bg-gradient-to-r from-[#0f2d20] via-[#143d2b] to-[#0f2d20] border-2 border-emerald-400 text-white p-3 sm:p-3.5 rounded-2xl shadow-[0_14px_45px_rgba(0,0,0,0.9)] flex items-center gap-3 animate-in fade-in slide-in-from-top-6 duration-300 backdrop-blur-md pointer-events-none">
                <span className="w-9 h-9 rounded-xl bg-emerald-500/25 border border-emerald-400/60 flex items-center justify-center text-lg shrink-0 shadow-inner">
                    🎉
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-widest font-black text-emerald-300">THÔNG BÁO ĐẨY ĐƠN</div>
                    <div className="text-xs sm:text-sm font-black text-white truncate mt-0.5">{toastNotification}</div>
                </div>
            </div>
        )}
    </div>
  );
}
