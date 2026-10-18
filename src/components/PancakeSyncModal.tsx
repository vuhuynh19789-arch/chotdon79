import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, AlertCircle, ShoppingBag, MessageSquare, 
  ExternalLink, Phone, MapPin, Search, Sparkles, Key, Check,
  ChevronRight, ArrowRight, UserCheck, ShieldCheck, X, Sliders, Zap
} from 'lucide-react';
import { OrderPushSettingsModal } from './OrderPushSettingsModal';
import { 
  getPancakeToken, setPancakeToken, runPancakeSmartSync, 
  getCustomerInsightsCache, getPancakeSyncStats, PancakeCustomerInsight, 
  PancakeSyncStats, getOrderStatusLabel, getPartnerStatusLabel 
} from '../lib/pancakeSync';
import { openPancakeApp } from '../lib/pancakeDeepLink';
import { useStore } from '../store';
import { Platform } from '../lib/core';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

interface PancakeSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export const PancakeSyncModal: React.FC<PancakeSyncModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose, enabled: isOpen });
  const store = useStore();
  const [tokenInput, setTokenInput] = useState(getPancakeToken());
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [insights, setInsights] = useState<Record<string, PancakeCustomerInsight>>(getCustomerInsightsCache());
  const [stats, setStats] = useState<PancakeSyncStats | null>(getPancakeSyncStats());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'regular' | 'new' | 'delivering'>('all');
  const [showPushSettingsModal, setShowPushSettingsModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTokenInput(getPancakeToken());
      setInsights(getCustomerInsightsCache());
      setStats(getPancakeSyncStats());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveToken = () => {
    setPancakeToken(tokenInput.trim());
    setIsEditingToken(false);
    onSuccess?.("Đã lưu mã Token Pancake thành công!");
  };

  const handleStartSync = async () => {
    setIsLoading(true);
    setProgressMsg("Bắt đầu kết nối...");
    try {
      // Tập hợp tất cả khách hàng từ các platform hiện tại
      const allCustomers = {
        ...store.tiktok.customers,
        ...store.facebook.customers,
        ...store.shopee.customers
      };
      const allNicknames = {
        ...store.tiktok.nicknames,
        ...store.facebook.nicknames,
        ...store.shopee.nicknames
      };

      const result = await runPancakeSmartSync(
        allCustomers,
        allNicknames,
        tokenInput.trim(),
        (msg) => setProgressMsg(msg)
      );

      setInsights(result.insights);
      setStats(result.stats);

      // Tự động gán các link hội thoại đã khớp vào store
      let appliedCount = 0;
      for (const [user, link] of Object.entries(result.newPancakeLinks)) {
        if (store.tiktok.customers[user] && !store.tiktok.pancakeLinks?.[user]) {
          store.setCustomerPancakeLink('tiktok', user, link);
          appliedCount++;
        }
        if (store.facebook.customers[user] && !store.facebook.pancakeLinks?.[user]) {
          store.setCustomerPancakeLink('facebook', user, link);
          appliedCount++;
        }
      }

      onSuccess?.(`Đồng bộ thành công! Đã khớp ${result.stats.matchedCustomersCount} khách & gán ${appliedCount} link chat.`);
    } catch (err: any) {
      console.error("Sync error:", err);
      onSuccess?.("Có lỗi xảy ra khi đồng bộ Pancake. Vui lòng kiểm tra lại Token.");
    } finally {
      setIsLoading(false);
      setProgressMsg("");
    }
  };

  const insightEntries = Object.entries(insights);
  const filteredInsights = insightEntries.filter(([user, ins]) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchUser = user.toLowerCase().includes(q);
      const matchName = (ins.matchedName || '').toLowerCase().includes(q);
      const matchPhone = (ins.matchedPhone || '').includes(q);
      if (!matchUser && !matchName && !matchPhone) return false;
    }

    if (activeTab === 'regular') return ins.isReturningCustomer;
    if (activeTab === 'new') return !ins.isReturningCustomer || ins.totalOrdersCount <= 1;
    if (activeTab === 'delivering') {
      const pStatus = ins.latestOrder?.partnerStatus || '';
      return ins.latestOrder?.status === 3 || pStatus.includes('delivering') || pStatus.includes('in_transit');
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200" {...touchHandlers}>
      <div 
        style={modalStyle}
        className="bg-[#151f2e] border border-orange-500/30 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-orange-950/40 via-[#182638] to-[#151f2e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xl shadow-inner">
              🥞
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">Đồng bộ Pancake POS & Zalo</h2>
                <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck size={12} /> Live API
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Tự động đối soát tên Zalo#TikTok, tra cứu lịch sử đơn hàng, địa chỉ & kích hoạt link chat 1-chạm
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Top Info Banner & Action Button */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#1a273a] border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                <MessageSquare size={18} />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 font-medium">Kênh Chat Kết Nối</div>
                <div className="text-sm font-bold text-white">
                  {stats ? `${stats.pagesCount} kênh (${stats.conversationsCount} chat)` : 'Zalo & Facebook'}
                </div>
              </div>
            </div>

            <div className="bg-[#1a273a] border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
                <ShoppingBag size={18} />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 font-medium">Cửa hàng Pancake POS</div>
                <div className="text-sm font-bold text-white">
                  {stats && stats.shops.length > 0 ? stats.shops[0].name : 'Phạm Ngọc Hiền Store'}
                </div>
              </div>
            </div>

            <div className="bg-[#1a273a] border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
                <UserCheck size={18} />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 font-medium">Khách Live Đã Khớp</div>
                <div className="text-sm font-bold text-amber-400">
                  {insightEntries.length} khách hàng
                </div>
              </div>
            </div>
          </div>

          {/* Sync Trigger & Token Management */}
          <div className="bg-gradient-to-br from-[#1b2a3d] to-[#162232] border border-orange-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-orange-400 animate-pulse" />
                <span className="text-sm font-bold text-white">Khớp dữ liệu tự động với phiên Live</span>
              </div>
              <p className="text-xs text-gray-300">
                Quét toàn bộ bình luận & khách hàng trên live, tự động nhận diện mẫu <code className="bg-black/40 text-orange-300 px-1 py-0.5 rounded font-mono text-[11px]">TênZalo#TênTikTok</code> để gán link chat và lịch sử mua.
              </p>
            </div>

            <button
              onClick={handleStartSync}
              disabled={isLoading}
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-95 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-orange-900/30 flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
              <span>{isLoading ? "Đang đồng bộ..." : "⚡ Đồng bộ Pancake Ngay"}</span>
            </button>
          </div>

          {/* Loading Progress Feedback */}
          {isLoading && (
            <div className="bg-orange-950/40 border border-orange-500/40 rounded-xl p-3 flex items-center gap-3 animate-pulse">
              <RefreshCw size={16} className="text-orange-400 animate-spin" />
              <span className="text-xs text-orange-200 font-medium">{progressMsg || "Đang xử lý dữ liệu..."}</span>
            </div>
          )}

          {/* Token Configuration Accordion */}
          <div className="bg-[#121b27] border border-white/5 rounded-xl p-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Key size={14} className="text-amber-400" />
                <span>Pancake Access Token:</span>
                <span className="font-mono text-gray-300 bg-black/40 px-2 py-0.5 rounded">
                  {tokenInput ? `${tokenInput.substring(0, 16)}...${tokenInput.slice(-8)}` : "Chưa cài đặt"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPushSettingsModal(true)}
                  className="text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                  title="Cài đặt API Đẩy Đơn (Tránh lỗi server phản hồi chậm / Vercel)"
                >
                  <Sliders size={12} />
                  <span>⚙️ API Đẩy Đơn</span>
                </button>
                <button
                  onClick={() => setIsEditingToken(!isEditingToken)}
                  className="text-blue-400 hover:text-blue-300 font-semibold text-xs transition-colors"
                >
                  {isEditingToken ? "Đóng" : "Thay đổi Token"}
                </button>
              </div>
            </div>

            {isEditingToken && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Dán mã JWT Access Token của Pancake vào đây..."
                  rows={2}
                  className="w-full bg-[#1c293a] border border-white/10 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setTokenInput(getPancakeToken()); setIsEditingToken(false); }}
                    className="px-3 py-1 text-gray-400 hover:text-white rounded"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleSaveToken}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1 rounded-lg text-xs flex items-center gap-1"
                  >
                    <Check size={14} /> Lưu Token
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Insights Search & Filter Tabs */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-[#101824] p-1 rounded-xl border border-white/5 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'all' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Tất cả ({insightEntries.length})
                </button>
                <button
                  onClick={() => setActiveTab('regular')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'regular' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  👑 Khách quen ({insightEntries.filter(([, i]) => i.isReturningCustomer).length})
                </button>
                <button
                  onClick={() => setActiveTab('delivering')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'delivering' ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🚚 Đang giao hàng
                </button>
                <button
                  onClick={() => setActiveTab('new')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'new' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🆕 Khách mới
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative flex-1 sm:max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm tên khách, SĐT, Zalo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#101824] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500/50"
                />
              </div>
            </div>

            {/* Customers Matched List */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {filteredInsights.length === 0 ? (
                <div className="bg-[#121b27] border border-dashed border-white/10 rounded-xl p-8 text-center text-gray-400 space-y-2">
                  <ShoppingBag size={28} className="mx-auto text-gray-500 opacity-50" />
                  <div className="text-xs">
                    {insightEntries.length === 0 
                      ? "Chưa có dữ liệu đồng bộ. Nhấn '⚡ Đồng bộ Pancake Ngay' ở trên để quét khách hàng."
                      : "Không tìm thấy khách hàng nào phù hợp với bộ lọc."}
                  </div>
                </div>
              ) : (
                filteredInsights.map(([user, insight]) => {
                  const latest = insight.latestOrder;
                  const orderStatus = latest ? getOrderStatusLabel(latest.status) : null;
                  const partnerStatus = latest?.partnerStatus ? getPartnerStatusLabel(latest.partnerStatus) : null;

                  return (
                    <div 
                      key={user}
                      className="bg-[#182333] hover:bg-[#1c2a3d] border border-white/5 hover:border-orange-500/30 rounded-xl p-3.5 transition-all space-y-2"
                    >
                      {/* Row 1: Header + Badges */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-bold text-white text-sm truncate">{user}</span>
                          {insight.matchedName && insight.matchedName !== user && (
                            <span className="text-[11px] text-orange-300/90 bg-orange-950/40 border border-orange-500/20 px-2 py-0.5 rounded font-mono truncate max-w-[180px]">
                              khớp: {insight.matchedName}
                            </span>
                          )}

                          {insight.isReturningCustomer ? (
                            <span className="bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                              👑 Khách quen ({insight.totalOrdersCount} đơn)
                            </span>
                          ) : (
                            <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                              🆕 Khách mới
                            </span>
                          )}
                        </div>

                        {/* Pancake Open Button */}
                        {insight.pancakeConvUrl && (
                          <button
                            onClick={() => openPancakeApp(insight.pancakeConvUrl!, true)}
                            className="bg-orange-950/70 hover:bg-orange-900 border border-orange-500/40 text-orange-300 text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all active:scale-95 shrink-0"
                            title="Mở trực tiếp hội thoại Pancake / Zalo"
                          >
                            <span>🥞</span>
                            <span>Mở Chat</span>
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>

                      {/* Row 2: Customer Contact Info */}
                      <div className="flex items-center gap-4 text-xs text-gray-300 flex-wrap">
                        {insight.matchedPhone && (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Phone size={13} />
                            <span className="font-mono font-bold">{insight.matchedPhone}</span>
                          </div>
                        )}

                        {insight.matchedAddress && (
                          <div className="flex items-center gap-1.5 text-gray-400 truncate max-w-md">
                            <MapPin size={13} className="shrink-0 text-gray-500" />
                            <span className="truncate">{insight.matchedAddress}</span>
                          </div>
                        )}
                      </div>

                      {/* Row 3: Latest Order Status from POS */}
                      {latest && (
                        <div className="bg-[#111925] border border-white/5 rounded-lg p-2.5 flex items-center justify-between text-xs flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-400">Đơn POS gần nhất:</span>
                            {orderStatus && (
                              <span className={`${orderStatus.bg} ${orderStatus.color} ${orderStatus.border} border px-2 py-0.5 rounded font-bold text-[11px]`}>
                                {orderStatus.text}
                              </span>
                            )}
                            {partnerStatus?.text && (
                              <span className="text-cyan-300 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded font-medium text-[11px]">
                                {partnerStatus.text}
                              </span>
                            )}
                            {latest.trackingCode && (
                              <span className="text-gray-400 font-mono text-[11px]">
                                Vận đơn: <strong className="text-gray-200">{latest.trackingCode}</strong>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-gray-300">
                            <span>{new Intl.NumberFormat('vi-VN').format(latest.totalPrice)}đ</span>
                            <span className="text-gray-500 text-[10px]">
                              ({new Date(latest.insertedAt).toLocaleDateString('vi-VN')})
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#101824] flex items-center justify-between text-xs text-gray-400">
          <div>
            Đồng bộ thông minh qua Pancake API • Token tự động lưu trữ bảo mật
          </div>
          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-1.5 rounded-xl transition-all"
          >
            Đóng
          </button>
        </div>
      </div>

      <OrderPushSettingsModal
        isOpen={showPushSettingsModal}
        onClose={() => setShowPushSettingsModal(false)}
        onSuccess={(msg) => {
          setTokenInput(getPancakeToken());
          onSuccess?.(msg);
        }}
      />
    </div>
  );
};
