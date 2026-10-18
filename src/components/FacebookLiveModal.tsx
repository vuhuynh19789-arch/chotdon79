import React, { useState, useEffect } from 'react';
import { 
  X, 
  Radio, 
  Users, 
  MessageSquare, 
  AlertCircle, 
  Loader2, 
  ExternalLink, 
  RefreshCw, 
  Server, 
  Globe, 
  Tv, 
  CheckCircle2, 
  ArrowLeft, 
  ShieldCheck, 
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import {
  getFacebookStatus,
  subscribeFacebookStatus,
  connectFacebookLive,
  disconnectFacebookLive,
  FacebookLiveStatus,
  fetchFacebookStatus,
  DEFAULT_FB_ROOM,
  resolveFacebookUrl,
  testFacebookToken
} from '../lib/facebookLiveClient';
import {
  getApiBaseUrl,
  setCustomBackendUrl,
  resetBackendUrlToDefault,
  DEFAULT_BACKEND_URL,
  triggerRemoteServerUpdate
} from '../lib/tiktokLiveClient';
import { useStore } from '../store';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

interface FacebookLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
}

export const FacebookLiveModal: React.FC<FacebookLiveModalProps> = ({ isOpen, onClose, onBack }) => {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose: onBack || onClose, enabled: isOpen });
  const [target, setTarget] = useState<string>(() => {
    try {
      return localStorage.getItem('slp_last_fb_target') || '';
    } catch {
      return '';
    }
  });
  const [token, setToken] = useState<string>(() => {
    try {
      return localStorage.getItem('slp_last_fb_token') || '';
    } catch {
      return '';
    }
  });

  const [status, setStatus] = useState<FacebookLiveStatus>(getFacebookStatus());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Rút gọn: Mặc định ẩn cài đặt nâng cao để giao diện gọn gàng, đưa lên máy chủ
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backendUrl, setBackendUrl] = useState(getApiBaseUrl());
  const [isSavedUrl, setIsSavedUrl] = useState(false);

  // Link Resolution State
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedInfo, setResolvedInfo] = useState<{ videoId: string | null; pageId: string | null; resolvedUrl: string } | null>(null);

  // Token Testing State
  const [isTestingToken, setIsTestingToken] = useState(false);
  const [tokenTestResult, setTokenTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const commentsFb = useStore((s) => s.facebook.comments);

  // Tự động phân tích link Facebook
  useEffect(() => {
    const trimmed = target.trim();
    if (!trimmed) {
      setResolvedInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsResolving(true);
      try {
        const info = await resolveFacebookUrl(trimmed);
        setResolvedInfo(info);
      } catch {
        setResolvedInfo(null);
      } finally {
        setIsResolving(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [target]);

  useEffect(() => {
    fetchFacebookStatus();
    const unsubscribe = subscribeFacebookStatus((newStatus) => {
      setStatus(newStatus);
      if (newStatus.target && !target) {
        setTarget(newStatus.target);
      }
      if (newStatus.lastError) {
        setErrorMsg(newStatus.lastError);
      } else if (newStatus.isConnected) {
        setErrorMsg(null);
      }
    });

    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  // Dán từ bộ nhớ tạm
  const handlePasteTarget = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setTarget(text.trim());
          setErrorMsg(null);
        }
      }
    } catch {
      // Fallback
    }
  };

  const handlePasteToken = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setToken(text.trim());
          setTokenTestResult(null);
        }
      }
    } catch {
      // Fallback
    }
  };

  const handleTestToken = async () => {
    if (!token.trim()) {
      setTokenTestResult({ success: false, message: 'Vui lòng nhập Token trước khi kiểm tra.' });
      return;
    }
    setIsTestingToken(true);
    setTokenTestResult(null);
    const targetToCheck = (resolvedInfo && resolvedInfo.videoId) || target;
    const res: any = await testFacebookToken(targetToCheck, token.trim());
    setTokenTestResult(res);
    setIsTestingToken(false);

    if (res.success && res.pageAccessToken && res.pageAccessToken !== token.trim()) {
      setToken(res.pageAccessToken);
      try {
        localStorage.setItem('slp_last_fb_token', res.pageAccessToken);
      } catch {}
    }
  };

  const handleConnect = async () => {
    const cleanTarget = target.trim();
    if (!cleanTarget) {
      setErrorMsg('Vui lòng nhập Link bài Live Facebook hoặc Video ID!');
      return;
    }

    try {
      localStorage.setItem('slp_last_fb_target', cleanTarget);
      if (token.trim()) localStorage.setItem('slp_last_fb_token', token.trim());
    } catch {}

    setIsLoading(true);
    setErrorMsg(null);
    
    // Gửi lệnh cào tới máy chủ (nếu token rỗng, máy chủ tự dùng token đã lưu trên máy chủ)
    await connectFacebookLive(cleanTarget, token.trim());
    setIsLoading(false);
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    await disconnectFacebookLive();
    setIsLoading(false);
  };

  const handleClearComments = () => {
    useStore.setState((s) => ({
      facebook: {
        ...s.facebook,
        comments: []
      }
    }));
  };

  const handleCloseOrBack = () => {
    if (onBack) {
      onBack();
    } else {
      onClose();
    }
  };

  const isServerRunning = status.isConnected && !status.isStopped;
  const hasServerToken = status.serverConfig?.hasToken || !!token.trim();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={handleCloseOrBack}
      {...touchHandlers}
    >
      <div 
        style={modalStyle}
        className="bg-[#141c28] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#0e1520]">
          <div className="flex items-center gap-2 sm:gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 -ml-1 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                title="Quay lại"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Radio size={20} className={isServerRunning ? "animate-pulse text-blue-400" : "text-gray-400"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Cào Facebook Live</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  TV Box 24/7
                </span>
              </div>
              <p className="text-xs text-gray-400">Tự động bắt bình luận & chốt đơn bài Live Fanpage</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* Card Trạng Thái Máy Chủ TV Box */}
          <div className="bg-[#0d1420] border border-white/10 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-3.5 h-3.5 rounded-full ${
                  isServerRunning ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : (status.isStopped ? 'bg-gray-500' : 'bg-amber-500 animate-pulse')
                }`} />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Máy chủ TV Box:</span>
                  <span className={isServerRunning ? "text-emerald-400" : (status.isStopped ? "text-gray-400" : "text-amber-400")}>
                    {isServerRunning ? "Đang cào bài Live" : (status.isStopped ? "Đã dừng" : "Đang chờ phiên Live")}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>Bình luận: <strong className="text-cyan-400">{status.totalCommentsCount || commentsFb.length}</strong></span>
                  <span>•</span>
                  <span>Token: <strong className={hasServerToken ? "text-emerald-400" : "text-gray-400"}>{hasServerToken ? "✓ Đã lưu trên máy chủ" : "Chưa cấu hình"}</strong></span>
                </div>
              </div>
            </div>

            {/* Link mở thẳng trang web của TV Box để cài đặt nâng cao nếu muốn */}
            <a
              href={backendUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shrink-0 cursor-pointer"
              title="Mở giao diện quản trị máy chủ TV Box trên trình duyệt"
            >
              <span>Mở Web TV Box</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Ô Nhập Link Bài Live */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <span>Link bài Live hoặc Video ID:</span>
              </label>
              {isResolving && (
                <span className="text-[11px] text-blue-400 flex items-center gap-1 font-medium">
                  <Loader2 size={11} className="animate-spin" /> Đang nhận diện link...
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setErrorMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect();
                  }}
                  placeholder="Dán link bài Live đang phát trên Fanpage..."
                  className="w-full pl-3.5 pr-16 py-2.5 bg-[#090e17] border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={handlePasteTarget}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  title="Dán nhanh từ clipboard"
                >
                  <ClipboardPaste size={13} />
                  <span>Dán</span>
                </button>
              </div>

              {isServerRunning ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                  <span>Dừng Cào</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isLoading || !target.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
                >
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />}
                  <span>Bắt Đầu Cào</span>
                </button>
              )}
            </div>

            {/* Thông tin video ID nhận diện được */}
            {resolvedInfo && resolvedInfo.videoId && (
              <div className="text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
                <CheckCircle2 size={13} className="shrink-0" />
                <span>Đã nhận diện Video ID: <strong>#{resolvedInfo.videoId}</strong></span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-start gap-2 animate-shake">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1 leading-relaxed font-medium">
                {errorMsg}
              </div>
            </div>
          )}

          {/* Khung Xem Bình Luận Thời Gian Thực */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
              <div className="flex items-center gap-1.5">
                <MessageSquare size={14} className="text-blue-400" />
                <span>Bình luận cào được ({commentsFb.length}):</span>
              </div>
              {commentsFb.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearComments}
                  className="text-[11px] text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Xóa danh sách</span>
                </button>
              )}
            </div>

            <div className="bg-[#090e17] border border-white/10 rounded-xl p-3 h-44 overflow-y-auto space-y-2 text-xs custom-scrollbar">
              {commentsFb.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center space-y-1">
                  <p>Chưa có bình luận nào.</p>
                  <p className="text-[11px] text-gray-600">Dán link bài Live và bấm "Bắt Đầu Cào" để máy chủ bắt đầu cào.</p>
                </div>
              ) : (
                commentsFb.slice(0, 50).map((cmt, idx) => (
                  <div key={cmt.id || idx} className="p-2 rounded-lg bg-white/5 border border-white/5 space-y-1 hover:border-white/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-400">{cmt.user}</span>
                      <span className="text-[10px] text-gray-500">{cmt.time}</span>
                    </div>
                    <p className="text-gray-200 text-xs font-medium">{cmt.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cài Đặt Nâng Cao (Gập Lại Mặc Định Để Tránh Rối Web App) */}
          <div className="border border-white/10 rounded-xl bg-[#0e1520] overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-3 flex items-center justify-between text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 font-semibold">
                <SlidersHorizontal size={14} className="text-blue-400" />
                <span>Cài đặt nâng cao (Token / Máy chủ TV Box)</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-blue-400">
                <span>{showAdvanced ? 'Thu gọn' : 'Mở rộng'}</span>
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showAdvanced && (
              <div className="p-4 pt-1 border-t border-white/10 space-y-3.5 bg-black/20 animate-fadeIn">
                {/* Token Settings */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-gray-300">
                      Token (Page Token EAA... hoặc Pancake eyJ...):
                    </label>
                    <span className="text-[10px] text-emerald-400">Lưu vĩnh viễn trên máy chủ</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value);
                        setTokenTestResult(null);
                      }}
                      placeholder="Dán mã Token Facebook hoặc Pancake..."
                      className="flex-1 px-3 py-1.5 bg-[#090e17] border border-white/10 rounded-lg text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={handlePasteToken}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Dán
                    </button>
                    <button
                      type="button"
                      onClick={handleTestToken}
                      disabled={isTestingToken || !token.trim()}
                      className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                    >
                      {isTestingToken ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                      <span>Kiểm tra</span>
                    </button>
                  </div>

                  {tokenTestResult && (
                    <div className={`p-2 rounded-lg border text-[11px] font-medium ${
                      tokenTestResult.success ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' : 'bg-red-950/40 border-red-500/30 text-red-200'
                    }`}>
                      {tokenTestResult.message}
                    </div>
                  )}
                </div>

                {/* TV Box Server URL Config */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <label className="text-[11px] font-bold text-gray-300 flex items-center gap-1">
                    <Server size={12} className="text-cyan-400" />
                    <span>Địa chỉ máy chủ TV Box (Cloudflare Tunnel / Local IP):</span>
                  </label>

                  <div className="flex gap-2">
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
                        className="w-full pl-7 pr-3 py-1.5 bg-[#090e17] border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomBackendUrl(backendUrl);
                        setIsSavedUrl(true);
                        fetchFacebookStatus();
                        setTimeout(() => setIsSavedUrl(false), 3000);
                      }}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                    >
                      {isSavedUrl ? '✓ Đã Lưu' : 'Lưu'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetBackendUrlToDefault();
                        setBackendUrl(DEFAULT_BACKEND_URL);
                        setIsSavedUrl(false);
                        fetchFacebookStatus();
                      }}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Mặc định
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-400">Cập nhật phần mềm TV Box từ xa:</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await triggerRemoteServerUpdate();
                        alert(res.message || (res.success ? 'Đã gửi lệnh cập nhật!' : 'Lỗi cập nhật'));
                        if (res.success) setTimeout(() => fetchFacebookStatus(), 3000);
                      }}
                      className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 rounded text-[11px] font-bold cursor-pointer"
                    >
                      ⚡ Cập nhật 1-Click
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#0e1520] flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <Tv size={14} className="text-gray-400" />
            <span>TV Box Amlogic S905W (v{status.serverVersion || '2.5.0'})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
