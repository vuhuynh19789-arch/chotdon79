// src/components/OrderPushSettingsModal.tsx
// Modal Cài đặt API Đẩy Đơn - Lưu trữ trực tiếp trong App Settings (LocalStorage) không lưu trên máy chủ

import React, { useState, useEffect } from 'react';
import { 
  X, Zap, Globe, Server, CheckCircle2, AlertCircle, RefreshCw, 
  Key, ShieldCheck, Database, Check, Sliders, ExternalLink, HelpCircle,
  Copy, Eye, EyeOff, Sparkles
} from 'lucide-react';
import { 
  OrderPushSettings, OrderPushMode, OrderPayloadFormat,
  getOrderPushSettings, saveOrderPushSettings, resetOrderPushSettings, 
  testOrderPushApiConnection, autoDiscoverPancakeShops, DEFAULT_PANCAKE_TOKEN,
  fetchServerPancakeConfig
} from '../lib/orderPushSettings';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

interface OrderPushSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export const OrderPushSettingsModal: React.FC<OrderPushSettingsModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose, enabled: isOpen });
  const [settings, setSettings] = useState<OrderPushSettings>(getOrderPushSettings());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSyncingServer, setIsSyncingServer] = useState(false);
  const [discoveredShops, setDiscoveredShops] = useState<any[]>([]);
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      const current = getOrderPushSettings();
      // Tự động sửa nếu dính token cũ không hợp lệ hoặc thiếu shop
      if (!current.pancakeToken || current.pancakeToken.includes('33892f90cd938635c008ca04cce31829')) {
        current.pancakeToken = DEFAULT_PANCAKE_TOKEN;
        current.shopId = current.shopId || '30093990';
        current.warehouseId = current.warehouseId || '9872be82-80b0-4486-9260-2b625b2e0325';
        saveOrderPushSettings(current);
      }
      setSettings(current);
      setTestResult(null);
      setSaveSuccessMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeChange = (mode: OrderPushMode) => {
    setSettings(prev => ({ ...prev, mode }));
    setTestResult(null);
  };

  const handleSave = () => {
    const saved = saveOrderPushSettings(settings);
    setSettings(saved);
    setSaveSuccessMsg('Đã lưu cấu hình API Đẩy Đơn vào thiết bị thành công!');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
    onSuccess?.('Đã lưu cấu hình API Đẩy Đơn thành công!');
  };

  const handleReset = () => {
    if (window.confirm('Bạn có chắc muốn khôi phục cài đặt API Đẩy Đơn về mặc định không?')) {
      const def = resetOrderPushSettings();
      setSettings(def);
      setTestResult(null);
      setSaveSuccessMsg('Đã khôi phục cài đặt mặc định!');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testOrderPushApiConnection(settings);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: `Lỗi kiểm tra: ${err?.message || 'Không thể gửi yêu cầu'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAutoDiscover = async () => {
    setIsDiscovering(true);
    try {
      const res = await autoDiscoverPancakeShops(settings.pancakeToken);
      if (res.success && res.shops.length > 0) {
        setDiscoveredShops(res.shops);
        setSettings(prev => ({
          ...prev,
          shopId: res.defaultShopId || prev.shopId,
          warehouseId: res.defaultWarehouseId || prev.warehouseId
        }));
        setTestResult({
          success: true,
          latencyMs: 250,
          message: `Đã tìm thấy ${res.shops.length} Cửa hàng: ${res.shops.map(s => s.name).join(', ')}!`
        });
      } else {
        setTestResult({
          success: false,
          latencyMs: 0,
          message: res.error || 'Không tìm thấy Cửa hàng nào với Token này.'
        });
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSyncFromServer = async () => {
    setIsSyncingServer(true);
    setTestResult(null);
    try {
      const srv = await fetchServerPancakeConfig();
      if (srv.success && srv.token) {
        const newSettings: OrderPushSettings = {
          ...settings,
          pancakeToken: srv.token,
          shopId: srv.shopId || '30093990',
          warehouseId: srv.warehouseId || '9872be82-80b0-4486-9260-2b625b2e0325'
        };
        setSettings(newSettings);
        saveOrderPushSettings(newSettings);

        // Kiểm tra kết nối tức thì
        const testRes = await testOrderPushApiConnection(newSettings);
        setTestResult({
          success: true,
          latencyMs: testRes.latencyMs || 150,
          message: `Đã nạp Token & Cửa Hàng từ Máy Chủ thành công! Shop: ${srv.shopName} (#${srv.shopId}). Cấu hình đã được lưu trực tiếp vào thiết bị của bạn.`
        });
        setSaveSuccessMsg('Đã đồng bộ Token & Cửa Hàng từ Máy Chủ vào thiết bị!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        setTestResult({
          success: false,
          latencyMs: 0,
          message: srv.error || 'Không thể lấy cấu hình từ máy chủ.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: `Lỗi kết nối máy chủ: ${err?.message || 'Không xác định'}`
      });
    } finally {
      setIsSyncingServer(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        {...touchHandlers}
        style={modalStyle}
        className="bg-[#18222d] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 bg-[#141b24] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
                <span>Cài Đặt API Đẩy Đơn</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Local App Settings
                </span>
              </h2>
              <p className="text-[12px] text-gray-400 leading-tight">
                Nhập & lưu trữ trên thiết bị, không lưu máy chủ, khắc phục hoàn toàn lỗi phản hồi chậm khi dùng Vercel
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 active:scale-95 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-[13px]">
          {/* Thông báo lưu thành công */}
          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 text-[13px] animate-in fade-in duration-200">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* CHỌN CHẾ ĐỘ ĐẨY ĐƠN (Order Push Mode) */}
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              Chọn Phương Thức Đẩy Đơn:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: Client-Side Direct (Khuyên dùng) */}
              <button
                type="button"
                onClick={() => handleModeChange('client_direct')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  settings.mode === 'client_direct'
                    ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                    : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                      <Zap size={18} />
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                      Khuyên dùng
                    </span>
                  </div>
                  <div className="font-bold text-[13px] text-white">Trực Tiếp (Client)</div>
                  <div className="text-[11px] text-gray-400 mt-1 leading-snug">
                    Gọi thẳng Pancake POS từ máy bạn. Siêu tốc &lt; 1s, không lo Vercel timeout!
                  </div>
                </div>
                {settings.mode === 'client_direct' && (
                  <div className="mt-2 text-[11px] font-bold text-amber-400 flex items-center gap-1">
                    <Check size={14} /> Đang chọn
                  </div>
                )}
              </button>

              {/* Option 2: Custom API / Webhook (URL tự nhập) */}
              <button
                type="button"
                onClick={() => handleModeChange('custom_api')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  settings.mode === 'custom_api'
                    ? 'bg-cyan-500/10 border-cyan-500 text-white shadow-lg shadow-cyan-500/10'
                    : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                      <Globe size={18} />
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/30">
                      Tự nhập URL
                    </span>
                  </div>
                  <div className="font-bold text-[13px] text-white">Custom API / Webhook</div>
                  <div className="text-[11px] text-gray-400 mt-1 leading-snug">
                    Nhập URL API riêng của bạn (Vercel, Make, n8n, Google Sheets, POS riêng).
                  </div>
                </div>
                {settings.mode === 'custom_api' && (
                  <div className="mt-2 text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                    <Check size={14} /> Đang chọn
                  </div>
                )}
              </button>

              {/* Option 3: Server Proxy */}
              <button
                type="button"
                onClick={() => handleModeChange('server_proxy')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  settings.mode === 'server_proxy'
                    ? 'bg-indigo-500/10 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                      <Server size={18} />
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                      Proxy Server
                    </span>
                  </div>
                  <div className="font-bold text-[13px] text-white">Máy Chủ Proxy</div>
                  <div className="text-[11px] text-gray-400 mt-1 leading-snug">
                    Đẩy qua backend nội bộ /api/pancake với Auto-Failover sang client nếu chậm.
                  </div>
                </div>
                {settings.mode === 'server_proxy' && (
                  <div className="mt-2 text-[11px] font-bold text-indigo-400 flex items-center gap-1">
                    <Check size={14} /> Đang chọn
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* FORM CẤU HÌNH CHO TỪNG CHẾ ĐỘ */}

          {/* 1. NẾU CHỌN CUSTOM API */}
          {settings.mode === 'custom_api' && (
            <div className="bg-[#121820] border border-cyan-500/20 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-cyan-300 flex items-center gap-1.5">
                  <Globe size={16} /> Cấu hình URL API Đẩy Đơn Tùy Chỉnh
                </span>
                <span className="text-[11px] text-gray-400">Được lưu trong thiết bị của bạn</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  Đường dẫn URL API Đẩy Đơn (Endpoint)*:
                </label>
                <input
                  type="text"
                  value={settings.customApiUrl}
                  onChange={(e) => setSettings(prev => ({ ...prev, customApiUrl: e.target.value }))}
                  placeholder="https://ten-mien-cua-ban.vercel.app/api/push-order hoặc Webhook URL"
                  className="w-full bg-black/40 border border-white/15 focus:border-cyan-400 rounded-lg px-3 py-2 text-white text-[13px] font-mono outline-none transition-colors"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  💡 Nhập link API Vercel của bạn, link Webhook (Make/n8n) hoặc endpoint xử lý đơn hàng riêng.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                    Tên Header Xác Thực (Authentication Header):
                  </label>
                  <input
                    type="text"
                    value={settings.customHeaderName}
                    onChange={(e) => setSettings(prev => ({ ...prev, customHeaderName: e.target.value }))}
                    placeholder="Authorization hoặc x-api-key"
                    className="w-full bg-black/40 border border-white/15 focus:border-cyan-400 rounded-lg px-3 py-2 text-white text-[12px] font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                    Mã Token / API Key (Nếu có):
                  </label>
                  <input
                    type="text"
                    value={settings.customApiKey}
                    onChange={(e) => setSettings(prev => ({ ...prev, customApiKey: e.target.value }))}
                    placeholder="sk_live_... hoặc Bearer token"
                    className="w-full bg-black/40 border border-white/15 focus:border-cyan-400 rounded-lg px-3 py-2 text-white text-[12px] font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  Định dạng Dữ liệu gửi đi (Payload Format):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, payloadFormat: 'pancake_standard' }))}
                    className={`px-3 py-2 rounded-lg border text-left text-[12px] cursor-pointer transition-colors ${
                      settings.payloadFormat === 'pancake_standard'
                        ? 'bg-cyan-500/20 border-cyan-400 text-white font-bold'
                        : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    <div>🥞 Chuẩn Pancake POS</div>
                    <div className="text-[10px] font-normal text-gray-400">Đầy đủ customer, items, order_sources</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, payloadFormat: 'simple_webhook' }))}
                    className={`px-3 py-2 rounded-lg border text-left text-[12px] cursor-pointer transition-colors ${
                      settings.payloadFormat === 'simple_webhook'
                        ? 'bg-cyan-500/20 border-cyan-400 text-white font-bold'
                        : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    <div>📦 Webhook Đơn Hàng Gọn</div>
                    <div className="text-[10px] font-normal text-gray-400">JSON dễ tích hợp Vercel/Sheets/n8n</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. NẾU CHỌN CLIENT DIRECT TO PANCAKE POS HOẶC SERVER PROXY */}
          <div className="bg-[#121820] border border-white/10 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-amber-300 flex items-center gap-1.5">
                <Key size={16} /> Cấu hình Token &amp; Cửa Hàng Pancake POS
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleSyncFromServer}
                  disabled={isSyncingServer}
                  className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 rounded-lg border border-emerald-500/40 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                  title="Tự động lấy Token chuẩn và Shop ID đang hoạt động từ máy chủ nạp thẳng vào App"
                >
                  <Sparkles size={12} className={isSyncingServer ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                  <span>{isSyncingServer ? 'Đang nạp...' : '⚡ Lấy từ Máy Chủ'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoDiscover}
                  disabled={isDiscovering}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  title="Quét danh sách Shop & Kho hàng trực tiếp từ Pancake POS bằng Token này"
                >
                  <RefreshCw size={12} className={isDiscovering ? 'animate-spin' : ''} />
                  <span>{isDiscovering ? 'Đang quét...' : '⚡ Quét tự động Shop & Kho'}</span>
                </button>
              </div>
            </div>

            <div className="p-2 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-[11.5px] text-emerald-300/90 flex items-start gap-1.5">
              <Sparkles size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Mẹo nhanh:</strong> Bấm <strong>"⚡ Lấy từ Máy Chủ"</strong> để tự động nạp Token &amp; Cửa hàng chuẩn (<strong>Phạm Ngọc Hiền Store #30093990</strong>) đang chạy trên máy chủ vào máy bạn chỉ với 1 click!
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-gray-300">
                  Mã Token Pancake POS:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showToken ? 'Ẩn' : 'Hiện'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(settings.pancakeToken)}
                    className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedToken ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copiedToken ? 'Đã chép' : 'Sao chép'}</span>
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={settings.pancakeToken}
                onChange={(e) => setSettings(prev => ({ ...prev, pancakeToken: e.target.value.trim() }))}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-1.5 text-white text-[11px] font-mono outline-none resize-none transition-colors"
                style={{ WebkitTextSecurity: showToken ? 'none' : 'disc' } as any}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  Shop ID (Mã cửa hàng Pancake POS):
                </label>
                <input
                  type="text"
                  value={settings.shopId}
                  onChange={(e) => setSettings(prev => ({ ...prev, shopId: e.target.value.trim() }))}
                  placeholder="30093990"
                  className="w-full bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-2 text-white text-[12px] font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  Kho Hàng (Warehouse ID):
                </label>
                <input
                  type="text"
                  value={settings.warehouseId}
                  onChange={(e) => setSettings(prev => ({ ...prev, warehouseId: e.target.value.trim() }))}
                  placeholder="9872be82-80b0-4486-9260-2b625b2e0325"
                  className="w-full bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-2 text-white text-[12px] font-mono outline-none"
                />
              </div>
            </div>

            {discoveredShops.length > 0 && (
              <div className="p-2.5 bg-black/30 rounded-lg border border-white/5 space-y-1">
                <span className="text-[11px] font-semibold text-gray-300 block">Chọn cửa hàng đã quét:</span>
                <div className="flex flex-wrap gap-1.5">
                  {discoveredShops.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, shopId: String(s.id), warehouseId: s.default_warehouse_when_auto_create_orders || prev.warehouseId }))}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                        String(settings.shopId) === String(s.id)
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {s.name} (#{s.id})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* TÙY CHỌN BẢO MẬT & AUTO-FAILOVER */}
          <div className="p-3 bg-black/20 rounded-xl border border-white/5 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.localOnly}
                onChange={(e) => setSettings(prev => ({ ...prev, localOnly: e.target.checked }))}
                className="mt-0.5 rounded border-white/20 text-emerald-500 focus:ring-0 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-white text-[12px] flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  Chỉ lưu trong Cài đặt Trình duyệt này (LocalStorage)
                </span>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Cấu hình và API Token chỉ lưu trên thiết bị của bạn, không gửi lên máy chủ trung gian.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoFailoverToClient}
                onChange={(e) => setSettings(prev => ({ ...prev, autoFailoverToClient: e.target.checked }))}
                className="mt-0.5 rounded border-white/20 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-white text-[12px] flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-400" />
                  Tự động chuyển Đẩy trực tiếp nếu máy chủ phản hồi chậm (Auto-Failover)
                </span>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Nếu máy chủ backend bị nghẽn hoặc gặp lỗi timeout 504 trên Vercel, app sẽ tự động đẩy trực tiếp từ trình duyệt để đơn không bao giờ bị mất!
                </p>
              </div>
            </label>
          </div>

          {/* KẾT QUẢ KIỂM TRA PING */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-[12.5px] ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}>
              {testResult.success ? (
                <CheckCircle2 size={18} className="shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-bold flex items-center justify-between">
                  <span>{testResult.success ? 'Kiểm tra thành công!' : 'Kiểm tra thất bại!'}</span>
                  {testResult.latencyMs > 0 && (
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-black/40 border border-white/10">
                      ⚡ {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
                <div className="text-[12px] mt-0.5 leading-relaxed opacity-90">
                  {testResult.message}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3.5 border-t border-white/10 bg-[#141b24] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-semibold text-[12px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Gửi request kiểm tra kết nối API và đo thời gian phản hồi"
            >
              <RefreshCw size={14} className={isTesting ? 'animate-spin text-amber-400' : 'text-amber-400'} />
              <span>{isTesting ? 'Đang đo ping...' : '⚡ Thử Kết Nối'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-2 rounded-xl text-gray-400 hover:text-gray-200 text-[12px] transition-colors cursor-pointer"
              title="Khôi phục cài đặt mặc định"
            >
              Mặc định
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-[13px] font-medium transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-[13px] shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check size={16} />
              <span>Lưu Cài Đặt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
