import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle, X, Sparkles, Zap, ShieldCheck } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string; compact?: boolean }> = ({ className = '', compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already running as installed standalone app
  if (isInstalled) {
    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-semibold ${className}`}>
        <CheckCircle size={13} />
        <span>Đã cài App</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all cursor-pointer active:scale-95 ${className}`}
        title="Cài đặt ứng dụng về điện thoại (chạy nhanh như App APK)"
      >
        <Download size={14} className="animate-bounce" />
        <span>{compact ? "Cài App" : "📲 Cài App về máy (Chạy siêu nhanh)"}</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0e1622] border border-emerald-500/30 p-5 text-white shadow-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Smartphone size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Cài Đặt App Vào Điện Thoại</h3>
                  <p className="text-[11px] text-emerald-400 font-medium">Chạy mượt như App APK · Tải siêu nhanh</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Why it makes app faster */}
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-black/30 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-start gap-1.5 text-gray-300">
                <Zap size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Mở tức thì:</strong> Lưu sẵn vào bộ nhớ máy, không bị load lại trang từ đầu</span>
              </div>
              <div className="flex items-start gap-1.5 text-gray-300">
                <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Toàn màn hình:</strong> Giao diện độc lập như App gốc, không dính thanh địa chỉ web</span>
              </div>
            </div>

            {/* Direct Install button if browser supports prompt */}
            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  await install();
                  setShowModal(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer active:scale-98 transition-all"
              >
                <Download size={16} />
                <span>Bấm vào đây để Cài Đặt Ngay</span>
              </button>
            )}

            {/* Step-by-step instructions for Android & iOS */}
            <div className="space-y-2.5 text-xs text-gray-200">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <span>📌 Hướng dẫn thêm vào màn hình chính (2 bước):</span>
              </div>

              {isIOS ? (
                <div className="bg-[#15202e] p-3 rounded-xl border border-white/10 space-y-2 text-[11.5px] leading-relaxed">
                  <p>
                    <strong>Bước 1:</strong> Bấm vào biểu tượng <strong>Chia sẻ (Share)</strong> <span className="text-blue-400">⎙</span> ở thanh dưới trình duyệt Safari.
                  </p>
                  <p>
                    <strong>Bước 2:</strong> Cuộn xuống và chọn <strong className="text-emerald-400">"Thêm vào MH chính" (Add to Home Screen)</strong>.
                  </p>
                  <p className="text-[10.5px] text-gray-400">
                    👉 App sẽ xuất hiện ngay trên màn hình iPhone/iPad của bạn với biểu tượng icon riêng.
                  </p>
                </div>
              ) : (
                <div className="bg-[#15202e] p-3 rounded-xl border border-white/10 space-y-2 text-[11.5px] leading-relaxed">
                  <p>
                    <strong>Bước 1:</strong> Bấm vào dấu <strong>3 chấm (⋮)</strong> ở góc trên bên phải trình duyệt Chrome (hoặc Samsung Internet).
                  </p>
                  <p>
                    <strong>Bước 2:</strong> Chọn <strong className="text-emerald-400">"Cài đặt ứng dụng"</strong> hoặc <strong className="text-emerald-400">"Thêm vào màn hình chính"</strong>.
                  </p>
                  <p className="text-[10.5px] text-gray-400">
                    👉 Android sẽ tự động tạo gói ứng dụng (WebAPK) cài vào máy, chạy mượt mà không lo bị chậm!
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </div>
      )}
    </>
  );
};
