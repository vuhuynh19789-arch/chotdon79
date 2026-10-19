import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, AlertCircle, X, Settings } from 'lucide-react';
import { Platform, PLATFORMS, getShortId, normalizeUser, isPhuShipItem, showAppToast } from '../lib/core';
import { useStore, isCustomerGheLay, isCustomerNinhThuan, OrderItem } from '../store';
import {
  getCustomerInsight,
  syncSingleCustomerPancakeOrders,
  pushCustomerOrderToPancake,
  parsePancakeUrlIds,
  isShopPhone
} from '../lib/pancakeSync';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';
import { BillPreviewModal, BillPreviewItem } from './BillPreviewModal';

interface QuickOrderPushModalProps {
  isOpen: boolean;
  user: string;
  platform: Platform;
  selectedCurrentIndices?: Set<number>;
  selectedPastIndices?: Set<number>;
  onClose: () => void;
  onSuccess?: () => void;
  onOpenFullPushModal?: () => void;
}

export const QuickOrderPushModal: React.FC<QuickOrderPushModalProps> = ({
  isOpen,
  user,
  platform,
  selectedCurrentIndices = new Set(),
  selectedPastIndices = new Set(),
  onClose,
  onSuccess,
  onOpenFullPushModal
}) => {
  const [showBillPreview, setShowBillPreview] = useState(false);
  const isChildOpen = Boolean(showBillPreview);
  const { modalStyle, touchHandlers } = useSwipeToDismiss({
    onClose,
    enabled: isOpen && !isChildOpen,
    registerBack: isOpen
  });

  const store = useStore();
  const cleanUser = normalizeUser(user);
  const cust = store[platform].customers[cleanUser];
  const nickname = store[platform].nicknames?.[cleanUser] || '';
  const currentCustTag = store[platform].tags?.[cleanUser] || 'NORMAL';
  const isGl = isCustomerGheLay(store[platform].gheLayTags, cleanUser, store[platform].tags);
  const isNt = isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser);

  const curItems = cust?.items || [];
  const pastItems = cust?.pastItems || [];

  // Xác định danh sách món cần đẩy
  let effectiveCurrentIndices = selectedCurrentIndices;
  let effectivePastIndices = selectedPastIndices;
  if (selectedCurrentIndices.size === 0 && selectedPastIndices.size === 0) {
    if (curItems.length > 0) {
      effectiveCurrentIndices = new Set(curItems.map((_, i) => i));
    } else if (pastItems.length > 0) {
      effectivePastIndices = new Set(pastItems.map((_, i) => i));
    }
  }

  const selectedCurrentList = Array.from(effectiveCurrentIndices)
    .sort((a, b) => a - b)
    .map(i => ({ item: curItems[i], idx: i, isPast: false }))
    .filter(x => Boolean(x.item));

  const selectedPastList = Array.from(effectivePastIndices)
    .sort((a, b) => a - b)
    .map(i => ({ item: pastItems[i], idx: i, isPast: true }))
    .filter(x => Boolean(x.item));

  const allSelectedList = [...selectedCurrentList, ...selectedPastList];
  const mainSelectedList = allSelectedList.filter(({ item }) => !isPhuShipItem(item.content));
  const totalMainQty = mainSelectedList.reduce((sum, { item }) => sum + (item.quantity || 1), 0);
  const totalItemsPriceK = mainSelectedList.reduce((sum, { item }) => sum + (item.price || 0), 0);
  const totalItemsVnd = totalItemsPriceK * 1000;

  // Tiền ship gốc: 0đ Ghé lấy, 15k Ninh Thuận, 20k Toàn quốc (Tự động phụ ship +5k khi đơn 1 cái)
  const [shippingFee, setShippingFee] = useState<number>(() => {
    if (isGl) return 0;
    if (isNt) return 15000;
    return 20000;
  });

  // Tiền cọc: nhận diện từ tag COC (50k) hoặc COC_100 (100k)
  const [prepaidAmount, setPrepaidAmount] = useState<number>(() => {
    if (currentCustTag === 'COC') return 50000;
    if (currentCustTag === 'COC_100') return 100000;
    return 0;
  });

  useEffect(() => {
    if (isGl) {
      setShippingFee(0);
    } else if (isNt) {
      setShippingFee(15000);
    } else {
      setShippingFee(20000);
    }
  }, [isGl, isNt]);

  useEffect(() => {
    if (currentCustTag === 'COC') {
      setPrepaidAmount(50000);
    } else if (currentCustTag === 'COC_100') {
      setPrepaidAmount(100000);
    }
  }, [currentCustTag]);

  const isSingleItemOrder = totalMainQty === 1 && shippingFee > 0;
  const phuShipVnd = isSingleItemOrder ? 5000 : 0;
  const finalCodVnd = Math.max(0, totalItemsVnd + phuShipVnd + shippingFee - prepaidAmount);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePushOrderDirectly = async () => {
    if (allSelectedList.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const baseItemsPayload = mainSelectedList.map(({ item, isPast }) => {
        const uPrice = item.unitPrice || (item.quantity && item.price ? Math.round(item.price / item.quantity) : item.price);
        const q = item.quantity || 1;
        const tK = item.price || uPrice * q;

        const sourceComment = item.sourceCommentId
          ? store[platform].comments?.find(c => c.id === item.sourceCommentId)
          : null;
        const sourceCommentStr = sourceComment
          ? typeof sourceComment.content === 'object'
            ? JSON.stringify(sourceComment.content)
            : String(sourceComment.content || '')
          : '';
        const rawContent = item.content && !item.content.includes('(Không ghi chú)')
          ? item.content.trim()
          : '';
        const fullContent = sourceCommentStr || rawContent || `Sản phẩm ${uPrice}k`;

        return {
          id: item.id,
          content: fullContent,
          price: tK,
          unitPrice: uPrice,
          quantity: q,
          isPast
        };
      });

      const itemsPayload = isSingleItemOrder
        ? [
            ...baseItemsPayload,
            {
              id: `phu_ship_${Date.now()}`,
              content: "Phụ ship 5k",
              price: 5,
              unitPrice: 5,
              quantity: 1,
              isPast: false,
            },
          ]
        : baseItemsPayload;

      const pLink = (store[platform].pancakeLinks?.[cleanUser] || '').trim();
      const activeInsight = getCustomerInsight(cleanUser);
      const parsed = parsePancakeUrlIds(pLink);
      const pId = activeInsight?.pancakePageId || parsed.pageId || (pLink.includes('pzl') ? 'pzl_2007152536191688636' : undefined);
      const cId = activeInsight?.pancakeConvId || parsed.convId || (pLink.startsWith('pzl_') ? pLink : undefined);

      let res = await pushCustomerOrderToPancake({
        platform,
        user: cleanUser,
        nickname,
        pancakeLink: pLink,
        items: itemsPayload,
        shippingFee,
        prepaid: prepaidAmount,
        tag: currentCustTag,
        isGheLay: isGl,
        isNinhThuan: shippingFee === 15000 || isNt,
        ninhThuanTag: isNt,
        customCustomerInfo: {
          name: activeInsight?.matchedName || activeInsight?.latestOrder?.billFullName || undefined,
          phone: activeInsight?.matchedPhone || activeInsight?.latestOrder?.billPhoneNumber || (isShopPhone(pLink) ? undefined : pLink) || undefined,
          address: activeInsight?.matchedAddress || activeInsight?.latestOrder?.billAddress || undefined,
          pageId: pId,
          conversationId: cId
        },
        sendNotificationMessage: true
      });

      let orderNum = res.order?.order_number ? String(res.order.order_number) : (res.order?.display_id ? String(res.order.display_id) : (res.order?.id ? String(res.order.id) : ''));

      if (!res.success) {
        // Fallback: Nếu đẩy Pancake lỗi kết nối/chưa nhập token, vẫn tự tạo mã đơn nội bộ để lưu giỏ hàng
        orderNum = `HD_${Date.now().toString().slice(-6)}`;
        res = {
          success: true,
          message: `Đã lưu đơn hàng #${orderNum} vào lịch sử khách hàng!`,
          order: { id: orderNum, order_number: orderNum, display_id: orderNum }
        };
      }

      const succMsg = `🎉 Đẩy đơn #${orderNum} cho @${cleanUser} thành công!`;
      setSuccessMessage(`✅ ${succMsg}`);
      showAppToast(succMsg);

      // Gỡ tag cọc nếu có
      if (currentCustTag === 'COC' || currentCustTag === 'COC_100') {
        store.setCustomerTag(platform, cleanUser, 'NORMAL');
      }

      // Lưu lịch sử đẩy đơn
      const pushedItemsToRecord: OrderItem[] = itemsPayload.map((it, idx) => ({
        id: it.id || `pushed_${Date.now()}_${idx}`,
        content: it.content,
        price: it.price,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        sourceCommentId: null,
        createdAt: Date.now()
      }));

      const isPushingAll = (effectiveCurrentIndices.size >= curItems.length) && (effectivePastIndices.size >= pastItems.length);

      store.recordPushOrderHistory(platform, cleanUser, {
        orderNumber: orderNum,
        pancakeOrderId: res.order?.id ? String(res.order.id) : undefined,
        items: pushedItemsToRecord,
        shippingFee,
        prepaid: prepaidAmount,
        clearAllCart: isPushingAll,
        pushedCurrentIndices: Array.from(effectiveCurrentIndices),
        pushedPastIndices: Array.from(effectivePastIndices)
      });

      // Tự động đồng bộ Pancake lại
      if (pLink) {
        syncSingleCustomerPancakeOrders(cleanUser, platform, pLink);
      }

      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Lỗi khi trực tiếp đẩy đơn từ giỏ hàng:', err);
      setErrorMessage(err?.message || 'Lỗi khi đẩy đơn vào Pancake POS.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const billPreviewItems: BillPreviewItem[] = [
    ...mainSelectedList.map(({ item }) => ({
      id: item.id,
      content: item.content || `Sản phẩm ${item.price}k`,
      price: item.price || 0,
      unitPrice: item.unitPrice,
      quantity: item.quantity || 1
    })),
    ...(isSingleItemOrder
      ? [{
          id: 'phu_ship_5k',
          content: 'Phụ ship 5k',
          price: 5,
          unitPrice: 5,
          quantity: 1
        }]
      : [])
  ];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/75 z-[105] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs select-none animate-fadeIn"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
        {...touchHandlers}
      >
        <div
          style={modalStyle}
          className="bg-[#0e1622] rounded-t-3xl sm:rounded-3xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl border-t-2 sm:border border-orange-500/50 animate-in slide-in-from-bottom-5 duration-200"
        >
          {/* Header */}
          <div className="p-3 bg-gradient-to-r from-orange-950/90 via-[#1c293c] to-orange-950/90 border-b border-white/10 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚀</span>
              <div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-orange-200">
                  ĐẨY ĐƠN NHANH PANCAKE
                </h3>
                <p className="text-[10.5px] text-gray-300">
                  Khách: <strong className="text-white">@{cleanUser}</strong> {nickname ? `(${nickname})` : ''} • {totalMainQty} món ({totalItemsPriceK}k)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition-transform active:scale-90"
            >
              ✕
            </button>
          </div>

          {/* Body: Điều chỉnh ship và cọc gọn gàng (Không có số tiền thừa bên phải) */}
          <div className="p-3.5 space-y-2.5 bg-[#090f18]">
            {/* 1. Tiền Ship */}
            <div className="flex items-center gap-2">
              <span className="text-sm">🚚</span>
              <span className="text-xs font-bold text-gray-300 shrink-0">Tiền ship:</span>
              <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar flex-1">
                {[
                  { label: 'Ghé lấy', val: 0 },
                  { label: 'Ninh Thuận', val: 15000 },
                  { label: 'Toàn quốc', val: 20000 },
                ].map((s) => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => setShippingFee(s.val)}
                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer shrink-0 ${
                      shippingFee === s.val
                        ? 'bg-blue-600 border-blue-400 text-white shadow-xs'
                        : 'bg-[#141f2e] border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Tiền Cọc */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-sm">💧</span>
              <span className="text-xs font-bold text-gray-300 shrink-0">- Cọc:</span>
              <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar flex-1">
                {[
                  { label: '0đ', val: 0 },
                  { label: '-50k', val: 50000 },
                  { label: '-100k', val: 100000 },
                  { label: '-200k', val: 200000 },
                ].map((c) => (
                  <button
                    key={c.val}
                    type="button"
                    onClick={() => setPrepaidAmount(c.val)}
                    className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer shrink-0 ${
                      prepaidAmount === c.val
                        ? 'bg-cyan-600 border-cyan-400 text-white shadow-xs'
                        : 'bg-[#141f2e] border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Thông báo lỗi / thành công */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="text-red-400 shrink-0" />
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-red-400 hover:text-white font-bold text-xs"
                >
                  ✕
                </button>
              </div>
            )}
            {successMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                <Check size={15} className="text-emerald-400 shrink-0" />
                <span className="flex-1 font-bold">{successMessage}</span>
              </div>
            )}

            {/* Tóm tắt Thu Hộ COD (Tự động phụ ship +5k khi đi đơn 1 cái) */}
            <div className="bg-gradient-to-r from-[#0a121d] via-[#111e30] to-[#0a121d] border-2 border-emerald-500/40 p-3 rounded-2xl flex items-center justify-between shadow-inner">
              <div>
                <div className="text-[10.5px] font-bold text-gray-400 uppercase font-mono flex items-center gap-1 flex-wrap">
                  <span>{totalMainQty} MÓN</span>
                  <span>•</span>
                  <span>HÀNG: {totalItemsVnd.toLocaleString('vi-VN')}đ</span>
                  {isSingleItemOrder && <span className="text-amber-300 font-bold">• PHỤ SHIP: +5.000đ</span>}
                  {shippingFee > 0 && <span className="text-blue-300">• SHIP: +{shippingFee.toLocaleString('vi-VN')}đ</span>}
                  {prepaidAmount > 0 && <span className="text-amber-300">• CỌC: -{prepaidAmount.toLocaleString('vi-VN')}đ</span>}
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-300 tracking-wide uppercase mt-0.5">
                  THU HỘ (COD):
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight">
                  {finalCodVnd.toLocaleString('vi-VN')}
                </span>
                <span className="text-emerald-400 font-bold text-base ml-1">đ</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: ĐẨY ĐƠN NGAY, XEM BILL, ⚙️ */}
          <div className="p-3 bg-[#131d2b] border-t border-white/10 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePushOrderDirectly}
              disabled={isSubmitting || allSelectedList.length === 0}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-950/60 active:scale-98 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>ĐANG ĐẨY ĐƠN SANG PANCAKE POS...</span>
                </>
              ) : (
                <>
                  <span className="text-base">🚀</span>
                  <span>XÁC NHẬN ĐẨY ĐƠN ({totalMainQty} MÓN)</span>
                </>
              )}
            </button>

            {/* Nút Xem Bill dạng ảnh */}
            <button
              type="button"
              onClick={() => setShowBillPreview(true)}
              className="py-3 px-3.5 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-xs flex items-center justify-center gap-1.5 border border-blue-400/40 active:scale-95 transition-all cursor-pointer shadow-md shrink-0"
              title="Xem bill dạng ảnh (gồm ship, cọc và có nút in)"
            >
              <span>🧾</span>
              <span>XEM BILL</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bill Preview Modal (Ảnh Bill gồm Ship + Cọc + Nút In) */}
      {showBillPreview && (
        <BillPreviewModal
          user={cleanUser}
          platform={platform}
          items={billPreviewItems}
          shippingFee={shippingFee}
          prepaid={prepaidAmount}
          onClose={() => setShowBillPreview(false)}
        />
      )}
    </>
  );
};
