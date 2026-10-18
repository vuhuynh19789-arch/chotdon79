import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Tv, 
  Activity, 
  Pause, 
  Play, 
  RefreshCw, 
  Sliders, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ChevronRight, 
  Wifi, 
  WifiOff, 
  Server, 
  Zap, 
  ShieldAlert, 
  Users, 
  MessageSquare,
  Sparkles,
  Loader2
} from 'lucide-react';
import { 
  getTikTokStatus, 
  subscribeTikTokStatus, 
  fetchTikTokStatus, 
  connectTikTokLive, 
  disconnectTikTokLive, 
  TikTokLiveStatus, 
  DEFAULT_TIKTOK_CHANNEL,
  getApiBaseUrl,
  triggerRemoteServerUpdate,
  triggerRemoteBrowserReload
} from '../lib/tiktokLiveClient';
import { 
  getFacebookStatus, 
  subscribeFacebookStatus, 
  fetchFacebookStatus, 
  connectFacebookLive, 
  disconnectFacebookLive, 
  FacebookLiveStatus 
} from '../lib/facebookLiveClient';

interface SmartLiveMonitorProps {
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onOpenTikTokModal: () => void;
  onOpenFacebookModal: () => void;
}

export const SmartLiveMonitor: React.FC<SmartLiveMonitorProps> = ({
  isOpen,
  onOpen,
  onClose,
  onOpenTikTokModal,
  onOpenFacebookModal
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isModalOpen = isOpen !== undefined ? isOpen : internalIsOpen;

  const handleOpenModal = () => {
    if (onOpen) onOpen();
    else setInternalIsOpen(true);
  };

  const handleCloseModal = () => {
    if (onClose) onClose();
    else setInternalIsOpen(false);
  };

  const [tikTokStatus, setTikTokStatus] = useState<TikTokLiveStatus>(getTikTokStatus());
  const [facebookStatus, setFacebookStatus] = useState<FacebookLiveStatus>(getFacebookStatus());
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  useEffect(() => {
    const unsubTikTok = subscribeTikTokStatus((s) => setTikTokStatus(s));
    const unsubFacebook = subscribeFacebookStatus((s) => setFacebookStatus(s));

    return () => {
      unsubTikTok();
      unsubFacebook();
    };
  }, []);

  const isTikTokActive = tikTokStatus.isConnected;
  const isFacebookActive = facebookStatus.isConnected;
  const activeChannelsCount = (isTikTokActive ? 1 : 0) + (isFacebookActive ? 1 : 0);
  const isAllPaused = !isTikTokActive && !isFacebookActive && (facebookStatus.isStopped || tikTokStatus.lastError?.includes('dừng'));
  const totalComments = (tikTokStatus.totalCommentsCount || 0) + (facebookStatus.totalCommentsCount || 0);

  // Manual Override: Pause all scanning simultaneously
  const handlePauseAll = async () => {
    setIsActionLoading(true);
    try {
      await Promise.all([
        disconnectTikTokLive(),
        disconnectFacebookLive()
      ]);
      await Promise.all([
        fetchTikTokStatus(),
        fetchFacebookStatus()
      ]);
    } catch (e) {
      console.error('Error pausing all streams:', e);
    } finally {
      setIsActionLoading(false);
      setLastRefreshedAt(Date.now());
    }
  };

  // Manual Override: Resume all scanning simultaneously with last saved targets
  const handleResumeAll = async () => {
    setIsActionLoading(true);
    try {
      const lastTikTok = localStorage.getItem('slp_last_tiktok_channel') || DEFAULT_TIKTOK_CHANNEL;
      const lastFbTarget = localStorage.getItem('slp_last_fb_target') || '';
      const lastFbToken = localStorage.getItem('slp_last_fb_token') || '';

      const promises: Promise<any>[] = [connectTikTokLive(lastTikTok)];
      if (lastFbTarget) {
        promises.push(connectFacebookLive(lastFbTarget, lastFbToken));
      }
      await Promise.all(promises);
      triggerRemoteBrowserReload('tiktok', 'resume_all').catch(() => {});
      setTimeout(() => {
        fetchTikTokStatus();
        fetchFacebookStatus();
      }, 1200);
    } catch (e) {
      console.error('Error resuming streams:', e);
    } finally {
      setIsActionLoading(false);
      setLastRefreshedAt(Date.now());
    }
  };

  const handleManualRefresh = async () => {
    setIsActionLoading(true);
    await Promise.all([
      fetchTikTokStatus(),
      fetchFacebookStatus()
    ]);
    setIsActionLoading(false);
    setLastRefreshedAt(Date.now());
  };

  return (
    <>
      {/* Unified Compact Trigger Widget in App Header */}
      <div className="flex items-center gap-1 shrink max-w-[110px] xs:max-w-[150px] sm:max-w-none min-w-0">
        <button
          onClick={handleOpenModal}
          className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold transition-all border shadow-sm cursor-pointer select-none active:scale-95 max-w-full overflow-hidden ${
            activeChannelsCount === 2
              ? 'bg-gradient-to-r from-emerald-950/80 via-[#00f2ea]/15 to-blue-900/60 border-emerald-500/50 text-emerald-300 hover:border-emerald-400'
              : activeChannelsCount === 1
              ? isTikTokActive
                ? 'bg-[#00f2ea]/15 border-[#00f2ea]/40 text-[#00f2ea] hover:bg-[#00f2ea]/25'
                : 'bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30'
              : isAllPaused
              ? 'bg-red-950/40 border-red-500/30 text-red-300 hover:bg-red-900/40'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
          }`}
          title="Smart Live Monitor: Quản lý & giám sát cào Live TikTok & Facebook 24/7"
        >
          {/* Pulsing Status Dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            {activeChannelsCount > 0 && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                activeChannelsCount === 2 ? 'bg-emerald-400' : isTikTokActive ? 'bg-[#00f2ea]' : 'bg-blue-400'
              }`}></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              activeChannelsCount === 2 
                ? 'bg-emerald-400' 
                : activeChannelsCount === 1 
                ? isTikTokActive ? 'bg-[#00f2ea]' : 'bg-blue-400' 
                : isAllPaused ? 'bg-red-500' : 'bg-gray-500'
            }`}></span>
          </span>

          {/* Combined Visual Labels */}
          <div className="flex items-center gap-1 truncate font-semibold text-[11px]">
            {activeChannelsCount === 2 ? (
              <>
                <span className="text-emerald-300 font-extrabold flex items-center gap-0.5">
                  <Activity size={12} className="animate-pulse" />
                  2 Live
                </span>
                <span className="text-gray-400">|</span>
                <span className="text-[10px] text-white/90 truncate">💬{totalComments}</span>
              </>
            ) : isTikTokActive ? (
              <>
                <Radio size={11} className="text-[#00f2ea] shrink-0" />
                <span className="truncate max-w-[70px]">@{tikTokStatus.username || DEFAULT_TIKTOK_CHANNEL}</span>
                <span className="text-[10px] text-white/80 shrink-0">👁️{tikTokStatus.viewerCount > 999 ? (tikTokStatus.viewerCount / 1000).toFixed(1) + 'k' : tikTokStatus.viewerCount}</span>
              </>
            ) : isFacebookActive ? (
              <>
                <Tv size={11} className="text-blue-400 shrink-0" />
                <span className="truncate max-w-[70px]">FB Live</span>
                <span className="text-[10px] text-white/80 shrink-0">💬{facebookStatus.totalCommentsCount}</span>
              </>
            ) : isAllPaused ? (
              <>
                <Pause size={11} className="text-red-400 shrink-0" />
                <span>Tạm Dừng Cào</span>
              </>
            ) : (
              <>
                <Zap size={11} className="text-amber-400 shrink-0" />
                <span>Live</span>
              </>
            )}
          </div>

          <Sliders size={11} className="text-gray-400 group-hover:text-white transition-colors shrink-0 ml-0.5 opacity-70" />
        </button>

        {/* Quick Pause/Resume Mini Icon for Header (Fast 1-Click Toggle) */}
        {activeChannelsCount > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePauseAll();
            }}
            disabled={isActionLoading}
            className="p-1 rounded-full bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 active:scale-90 transition-all cursor-pointer shrink-0"
            title="Tạm dừng tất cả cào Live"
          >
            {isActionLoading ? <Loader2 size={11} className="animate-spin" /> : <Pause size={11} />}
          </button>
        ) : isAllPaused ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleResumeAll();
            }}
            disabled={isActionLoading}
            className="p-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 active:scale-90 transition-all cursor-pointer shrink-0"
            title="Tiếp tục cào tất cả"
          >
            {isActionLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          </button>
        ) : null}
      </div>

      {/* Smart Live Monitor Full Dashboard Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-[#182230] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#121924]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600/30 via-[#00f2ea]/20 to-blue-600/30 border border-white/10 flex items-center justify-center shadow-inner">
                  <Activity className={`w-5 h-5 ${activeChannelsCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-gray-400'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-wide">Smart Live Monitor</h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 border border-white/10">
                      v2.4.0
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Trung tâm điều khiển & giám sát cào Live đa nền tảng</p>
                </div>
              </div>
              <button 
                onClick={handleCloseModal}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Overall Health Status Banner */}
              <div className={`p-4 rounded-xl border transition-all ${
                activeChannelsCount === 2
                  ? 'bg-gradient-to-r from-emerald-950/60 via-[#182230] to-blue-950/60 border-emerald-500/40 text-emerald-100 shadow-lg shadow-emerald-950/20'
                  : activeChannelsCount === 1
                  ? 'bg-blue-950/40 border-blue-500/40 text-blue-100'
                  : isAllPaused
                  ? 'bg-red-950/40 border-red-500/40 text-red-100'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-100'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${
                      activeChannelsCount > 0 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : isAllPaused 
                        ? 'bg-red-500/20 text-red-400' 
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {activeChannelsCount > 0 ? <Wifi size={22} /> : isAllPaused ? <WifiOff size={22} /> : <AlertTriangle size={22} />}
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider font-bold opacity-75">
                        Tình trạng quét bình luận
                      </div>
                      <div className="text-sm sm:text-base font-extrabold flex items-center gap-2 mt-0.5">
                        {activeChannelsCount === 2 ? (
                          <span className="text-emerald-300">Đang cào song song 2 luồng (TikTok & FB)</span>
                        ) : activeChannelsCount === 1 ? (
                          <span>Đang cào {isTikTokActive ? 'TikTok Live' : 'Facebook Live'}</span>
                        ) : isAllPaused ? (
                          <span className="text-red-300">Đã tạm dừng toàn bộ luồng cào</span>
                        ) : (
                          <span>Đang chờ hoặc chưa kết nối live</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleManualRefresh}
                    disabled={isActionLoading}
                    className="p-2 text-gray-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all active:scale-95 shrink-0 cursor-pointer"
                    title="Làm mới trạng thái"
                  >
                    <RefreshCw size={16} className={isActionLoading ? 'animate-spin text-cyan-400' : ''} />
                  </button>
                </div>

                {/* Master Manual Override Action */}
                <div className="mt-3.5 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-300 font-medium">
                    ⚡ Điều khiển nhanh:
                  </div>
                  <div className="flex items-center gap-2">
                    {activeChannelsCount > 0 ? (
                      <button
                        onClick={handlePauseAll}
                        disabled={isActionLoading}
                        className="px-3 py-1.5 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-red-950/40 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                        <span>Tạm Dừng Tất Cả (Pause All)</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleResumeAll}
                        disabled={isActionLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/40 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        <span>Bắt Đầu / Tiếp Tục Cào</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Combined Metrics Bar */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#121924] p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Tổng Comment</div>
                  <div className="text-lg font-black text-white mt-0.5">{totalComments}</div>
                  <div className="text-[10px] text-emerald-400 font-semibold">TikTok + Facebook</div>
                </div>
                <div className="bg-[#121924] p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Mắt Xem TikTok</div>
                  <div className="text-lg font-black text-[#00f2ea] mt-0.5">{tikTokStatus.viewerCount}</div>
                  <div className="text-[10px] text-gray-400">Trực tiếp</div>
                </div>
                <div className="bg-[#121924] p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Máy Chủ Cào</div>
                  <div className="text-lg font-black text-blue-400 mt-0.5">Armbian TV Box</div>
                  <div className="text-[10px] text-gray-400 font-mono truncate">{getApiBaseUrl() ? 'Cloudflare Tunnel' : 'Chế độ Web'}</div>
                </div>
              </div>

              {/* Platform 1: TikTok Live Health Card */}
              <div className="bg-[#121924] border border-white/10 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${tikTokStatus.crawlerMode === 'browser_dom' ? 'bg-amber-400/20 text-amber-300' : 'bg-[#00f2ea]/15 text-[#00f2ea]'}`}>
                      {tikTokStatus.crawlerMode === 'browser_dom' ? <Zap size={16} /> : <Radio size={16} />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                        <span>TikTok Live Engine</span>
                        {tikTokStatus.crawlerMode === 'browser_dom' ? (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/40">
                            ⚡ DOM 0ms
                          </span>
                        ) : isTikTokActive ? (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-[#00f2ea]/20 text-[#00f2ea] border border-[#00f2ea]/40 animate-pulse">
                            TV BOX
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {tikTokStatus.crawlerMode === 'browser_dom' ? (
                          <span className="text-amber-300/90 font-medium">Siêu Cào Trình Duyệt: @{tikTokStatus.username || DEFAULT_TIKTOK_CHANNEL}</span>
                        ) : isTikTokActive ? (
                          `@${tikTokStatus.username || DEFAULT_TIKTOK_CHANNEL}`
                        ) : (
                          'Chưa kết nối live'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isTikTokActive ? (
                      <button
                        onClick={async () => {
                          await disconnectTikTokLive();
                          fetchTikTokStatus();
                        }}
                        className="px-2 py-1 bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-300 rounded-lg text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                        title="Tạm dừng TikTok"
                      >
                        Tắt
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          const target = localStorage.getItem('slp_last_tiktok_channel') || DEFAULT_TIKTOK_CHANNEL;
                          await connectTikTokLive(target);
                          fetchTikTokStatus();
                        }}
                        className="px-2 py-1 bg-[#00f2ea]/20 hover:bg-[#00f2ea]/30 text-[#00f2ea] rounded-lg text-xs font-bold border border-[#00f2ea]/30 transition-colors cursor-pointer"
                        title="Bật TikTok"
                      >
                        Bật
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleCloseModal();
                        onOpenTikTokModal();
                      }}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Chi tiết</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-white/5">
                  <div className="text-gray-400">
                    Bình luận đã nhận: <strong className="text-white font-bold">{tikTokStatus.totalCommentsCount || 0}</strong>
                  </div>
                  <div className="text-gray-400 text-right">
                    Mắt xem: <strong className="text-[#00f2ea] font-bold">{tikTokStatus.viewerCount || 0}</strong>
                  </div>
                </div>
              </div>

              {/* Platform 2: Facebook Live Health Card */}
              <div className="bg-[#121924] border border-white/10 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
                      <Tv size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Facebook Live Engine</span>
                        {isFacebookActive && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[170px]">
                        {isFacebookActive ? (facebookStatus.videoId ? `Video #${facebookStatus.videoId}` : facebookStatus.target) : 'Chưa kết nối live'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isFacebookActive ? (
                      <button
                        onClick={async () => {
                          await disconnectFacebookLive();
                          fetchFacebookStatus();
                        }}
                        className="px-2 py-1 bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-300 rounded-lg text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                        title="Tạm dừng Facebook"
                      >
                        Tắt
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          const target = localStorage.getItem('slp_last_fb_target') || '';
                          const token = localStorage.getItem('slp_last_fb_token') || '';
                          if (target) {
                            await connectFacebookLive(target, token);
                            fetchFacebookStatus();
                          } else {
                            handleCloseModal();
                            onOpenFacebookModal();
                          }
                        }}
                        className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 rounded-lg text-xs font-bold border border-blue-500/30 transition-colors cursor-pointer"
                        title="Bật Facebook"
                      >
                        Bật
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleCloseModal();
                        onOpenFacebookModal();
                      }}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Chi tiết</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-white/5">
                  <div className="text-gray-400">
                    Bình luận đã nhận: <strong className="text-white font-bold">{facebookStatus.totalCommentsCount || 0}</strong>
                  </div>
                  <div className="text-gray-400 text-right truncate">
                    Mục tiêu: <span className="text-blue-300 font-semibold">{facebookStatus.target || 'Chưa nhập link'}</span>
                  </div>
                </div>
              </div>

              {/* Platform 3: TV Box Server Remote Health Card */}
              <div className="bg-[#0b1018] border border-white/10 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400">
                      <Server size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Máy chủ TV Box (24/7)</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          v2.4.0 ONLINE
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        caotiktok.home79.cloud (Cloudflare Tunnel)
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={async (e) => {
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      const origText = btn.innerText;
                      btn.innerText = 'Đang gửi...';
                      try {
                        const res = await triggerRemoteServerUpdate();
                        alert(res.message || 'Đã nạp bản cập nhật từ xa tới TV Box!');
                      } finally {
                        btn.disabled = false;
                        btn.innerText = origText;
                      }
                    }}
                    className="px-2.5 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 rounded-lg text-xs font-bold border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw size={12} />
                    <span>Cập nhật OTA (1-Click)</span>
                  </button>
                </div>

                <div className="text-[10px] text-gray-400 pt-1 border-t border-white/5 flex items-center justify-between">
                  <span>Cập nhật từ xa không cần SSH & không cần cùng mạng Wi-Fi</span>
                  <span className="text-emerald-400 font-semibold">Tự động khởi động lại PM2</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-[#121924] flex items-center justify-between">
              <div className="text-[11px] text-gray-400">
                Đồng bộ tự động qua Firebase RTDB
              </div>
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
