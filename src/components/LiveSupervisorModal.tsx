import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  X, 
  Radio
} from 'lucide-react';
import { 
  getTikTokStatus, 
  subscribeTikTokStatus, 
  connectTikTokLive, 
  TikTokLiveStatus,
  DEFAULT_TIKTOK_CHANNEL,
  isMuteNotLiveAlert
} from '../lib/tiktokLiveClient';

interface LiveSupervisorModalProps {
  onOpenManualModal?: () => void;
}

export const LiveSupervisorModal: React.FC<LiveSupervisorModalProps> = () => {
  const [status, setStatus] = useState<TikTokLiveStatus>(getTikTokStatus());
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'connected' | 'offline' | 'scanning'>('connected');
  
  const connectedStartTimeRef = useRef<number>(0);
  const prevConnectedRef = useRef<boolean>(getTikTokStatus().isConnected && Boolean(getTikTokStatus().roomId));
  const toastTimeoutRef = useRef<any>(null);
  const lastToastTimeRef = useRef<number>(0);

  // Lắng nghe trạng thái TikTok Live theo thời gian thực
  // CHỈ hiện toast 1 lần duy nhất khi kênh thực sự BẮT ĐẦU LIVE (có roomId)
  // Tuyệt đối không loop popup khi phiên live kết thúc hoặc khi chưa live
  useEffect(() => {
    const unsub = subscribeTikTokStatus((newStatus) => {
      setStatus(newStatus);

      // Nếu đang ở chế độ cào Tampermonkey (browser_dom) hoặc người dùng bật Mute cảnh báo -> không hiện toast làm phiền
      if (newStatus.crawlerMode === 'browser_dom' || isMuteNotLiveAlert() || newStatus.muteNotLiveAlert) {
        setShowToast(false);
        return;
      }

      const isActuallyLive = Boolean(newStatus.isConnected && newStatus.roomId);
      const now = Date.now();

      // Trường hợp: Kênh VỪA BẮT ĐẦU LIVE THÀNH CÔNG (từ offline -> online có roomId)
      if (isActuallyLive && !prevConnectedRef.current) {
        prevConnectedRef.current = true;
        connectedStartTimeRef.current = now;
        
        // Cooldown tối thiểu 30s giữa các thông báo kết nối
        if (now - lastToastTimeRef.current > 30000) {
          lastToastTimeRef.current = now;
          setToastType('connected');
          setToastMessage(`✅ Kênh @${newStatus.username} Đang Live! Đã kết nối cào bình luận.`);
          setShowToast(true);

          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
          }, 3500);
        }
      } 
      // Trường hợp: Trước đó ĐANG LIVE THẬT SỰ (>15s) mà phiên live vừa kết thúc
      else if (!isActuallyLive && prevConnectedRef.current) {
        const liveDuration = now - connectedStartTimeRef.current;
        prevConnectedRef.current = false;
        
        // Chỉ hiện thông báo kết thúc nếu phiên live đã diễn ra ít nhất 15 giây (tránh chớp tắt do thử kết nối)
        if (liveDuration >= 15000 && (now - lastToastTimeRef.current > 30000)) {
          lastToastTimeRef.current = now;
          setToastType('offline');
          setToastMessage(`ℹ️ Phiên Live @${newStatus.username || 'TikTok'} vừa kết thúc.`);
          setShowToast(true);

          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
          }, 3000);
        }
      }
    });

    return () => {
      unsub();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Nếu không có toast thì không render gì để không chiếm DOM / không chặn click
  if (!showToast) {
    return null;
  }

  return (
    <div className="fixed top-14 sm:top-16 left-0 right-0 mx-auto z-[9999] w-[92%] max-w-md animate-slide-down pointer-events-none">
      <div className={`pointer-events-auto p-3 rounded-2xl backdrop-blur-xl border shadow-2xl flex items-center justify-between gap-3 text-xs sm:text-sm font-medium transition-all ${
        toastType === 'connected' 
          ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50' 
          : 'bg-amber-950/90 border-amber-500/40 text-amber-200 shadow-amber-950/50'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {toastType === 'connected' ? (
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 size={16} />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Radio size={16} />
            </div>
          )}
          <div className="truncate flex-1">
            <span className="font-semibold block truncate">{toastMessage}</span>
          </div>
        </div>
        <button 
          onClick={() => setShowToast(false)}
          className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 shrink-0 cursor-pointer"
          title="Đóng thông báo"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
