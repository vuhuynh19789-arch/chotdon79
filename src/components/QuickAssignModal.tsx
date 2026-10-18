import React, { useState, useEffect, useRef } from 'react';
import { X, Check, ExternalLink, Sparkles, Clipboard, Phone, Link2, Trash2 } from 'lucide-react';
import { Platform } from '../lib/core';
import { useStore } from '../store';
import { openPancakeApp } from '../lib/pancakeDeepLink';
import { syncSingleCustomerPancakeOrders, getCustomerInsight, getOrderStatusLabel } from '../lib/pancakeSync';

interface QuickAssignModalProps {
  isOpen: boolean;
  user: string;
  platform: Platform;
  commentPhone?: string;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
  onOpenFullModal?: () => void;
}

export const QuickAssignModal: React.FC<QuickAssignModalProps> = ({
  isOpen,
  user,
  platform,
  commentPhone,
  onClose,
  onSuccess,
  onOpenFullModal
}) => {
  const store = useStore();
  const cleanUser = user.replace(/^@+/, '').trim();
  const existingLink = store[platform]?.pancakeLinks?.[cleanUser] || '';
  const customerData = store[platform]?.customers?.[cleanUser];
  const insight = getCustomerInsight(cleanUser);

  const [inputVal, setInputVal] = useState(existingLink);
  const [isSyncing, setIsSyncing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputVal(existingLink || commentPhone || '');
      // Tự động focus vào ô input khi mở
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, existingLink, commentPhone]);

  if (!isOpen) return null;

  // Dán từ clipboard
  const handlePasteClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setInputVal(text.trim());
        }
      }
    } catch {
      // Ignore clipboard permission issues
    }
  };

  // Lưu và đồng bộ ngay lập tức
  const handleSave = async (valueToSave?: string) => {
    const finalVal = (valueToSave !== undefined ? valueToSave : inputVal).trim();
    if (!finalVal) {
      // Nếu xóa rỗng -> gỡ liên kết
      store.setCustomerPancakeLink(platform, cleanUser, "");
      onSuccess?.(`Đã gỡ liên kết Pancake cho @${cleanUser}`);
      onClose();
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Lưu ngay vào store của platform
      store.setCustomerPancakeLink(platform, cleanUser, finalVal);

      // 2. Chạy đồng bộ thông tin đơn hàng POS ngay lập tức
      await syncSingleCustomerPancakeOrders(cleanUser, platform, finalVal);

      onSuccess?.(`Đã gán và đồng bộ Pancake cho @${cleanUser} thành công!`);
      onClose();
    } catch (err: any) {
      console.error("Lỗi gán Pancake:", err);
      onSuccess?.(`Đã lưu liên kết cho @${cleanUser}!`);
      onClose();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleRemove = () => {
    store.setCustomerPancakeLink(platform, cleanUser, "");
    onSuccess?.(`Đã gỡ liên kết Pancake cho @${cleanUser}`);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-[#18202d] border border-orange-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#111722] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-base shadow-inner">
              🥞
            </div>
            <div>
              <h3 className="text-white font-bold text-sm leading-tight flex items-center gap-1.5">
                <span>Gán Zalo / Pancake</span>
                {existingLink && (
                  <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    ✓ Đã có
                  </span>
                )}
              </h3>
              <p className="text-gray-400 text-xs">
                Khách: <strong className="text-white">@{cleanUser}</strong>
                {customerData?.count ? (
                  <span className="text-emerald-400 ml-1 font-semibold">
                    ({customerData.count} cái - {customerData.total}k)
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5">
          {/* Input field */}
          <div>
            <label className="text-xs font-bold text-gray-200 block mb-1.5 flex items-center justify-between">
              <span>Nhập Số điện thoại hoặc Link Pancake:</span>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 cursor-pointer font-normal px-1.5 py-0.5 rounded bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
              >
                <Clipboard size={12} />
                <span>Dán từ bộ nhớ tạm</span>
              </button>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="VD: 0987654321 hoặc https://pages.fm/... hoặc https://pancake.vn/..."
                className="w-full bg-[#0d131c] border border-orange-500/40 focus:border-orange-400 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 font-mono shadow-inner"
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={() => setInputVal('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Chèn số điện thoại Zalo hoặc link chat Pancake rồi bấm <strong className="text-orange-300">Lưu</strong> hoặc nhấn <kbd className="bg-white/10 px-1 py-0.5 rounded text-[10px] text-white">Enter</kbd>.
            </p>
          </div>

          {/* Gợi ý SĐT từ bình luận nếu có */}
          {commentPhone && commentPhone !== inputVal && (
            <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Phone size={14} className="text-blue-400 shrink-0" />
                <span className="text-xs text-gray-300 truncate">
                  SĐT trong cmt: <strong className="text-white font-mono">{commentPhone}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInputVal(commentPhone)}
                className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shrink-0 cursor-pointer shadow-sm active:scale-95 transition-all"
              >
                Dùng SĐT này
              </button>
            </div>
          )}

          {/* Thông tin đơn hàng POS nếu đã có insight */}
          {insight && (insight.totalOrdersCount > 0 || insight.latestOrder) && (
            <div className="bg-[#121924] border border-white/10 rounded-xl p-2.5 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1">
                  <Sparkles size={13} className="text-amber-400" />
                  Lịch sử Pancake POS:
                </span>
                <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${insight.isReturningCustomer ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                  {insight.isReturningCustomer ? '👑 Khách quen' : '🆕 Khách mới'}
                </span>
              </div>
              <div className="text-gray-200 font-medium">
                {insight.matchedName} {insight.matchedPhone && `(${insight.matchedPhone})`}
              </div>
              <div className="text-gray-400 text-[11px] flex items-center justify-between">
                <span>Tổng đơn: <strong className="text-white">{insight.totalOrdersCount}</strong></span>
                <span>Đã mua: <strong className="text-emerald-400">{insight.totalSpent.toLocaleString()} đ</strong></span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {existingLink ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRemove}
                  className="px-2.5 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/50 border border-red-500/20 cursor-pointer flex items-center gap-1 transition-colors"
                  title="Gỡ liên kết Pancake này"
                >
                  <Trash2 size={13} />
                  <span>Gỡ</span>
                </button>
                <button
                  type="button"
                  onClick={() => openPancakeApp(existingLink, true)}
                  className="px-3 py-2 rounded-xl text-xs text-white bg-orange-700/80 hover:bg-orange-600 border border-orange-500/40 cursor-pointer flex items-center gap-1 font-bold transition-all shadow-sm"
                  title="Mở ứng dụng Zalo/Pancake"
                >
                  <ExternalLink size={13} />
                  <span>Mở chat</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullModal?.();
                }}
                className="text-xs text-gray-400 hover:text-gray-200 underline cursor-pointer p-1"
              >
                Chọn từ Zalo đang inbox
              </button>
            )}

            <button
              type="button"
              disabled={isSyncing}
              onClick={() => handleSave()}
              className="ml-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-orange-950/40 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
            >
              <Check size={16} />
              <span>{isSyncing ? 'Đang lưu & đồng bộ...' : 'Lưu & Khớp đơn'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
