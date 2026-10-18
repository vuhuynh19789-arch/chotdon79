import React, { useRef, useState } from 'react';
import { Printer, Download, Copy, Check, X } from 'lucide-react';
import { Platform, PLATFORMS, getShortId, normalizeUser, printBill, isPhuShipItem } from '../lib/core';
import { useStore, isCustomerGheLay, isCustomerNinhThuan } from '../store';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';

export interface BillPreviewItem {
  id?: string;
  content: string;
  price: number; // in k (e.g. 84 for 84.000)
  unitPrice?: number;
  quantity?: number;
}

interface BillPreviewModalProps {
  user: string;
  platform: Platform;
  items: BillPreviewItem[];
  shippingFee: number;
  prepaid: number;
  onClose: () => void;
  onPrint?: () => void;
}

export const BillPreviewModal: React.FC<BillPreviewModalProps> = ({
  user,
  platform,
  items,
  shippingFee,
  prepaid,
  onClose,
  onPrint
}) => {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose });
  const store = useStore();
  const cleanUser = normalizeUser(user);
  const nickname = store[platform].nicknames?.[cleanUser] || '';
  const isGl = isCustomerGheLay(store[platform].gheLayTags, cleanUser, store[platform].tags);
  const isNt = isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser);

  const [copiedImage, setCopiedImage] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const billPaperRef = useRef<HTMLDivElement>(null);

  const totalItemsK = items.reduce((sum, it) => sum + (it.price || (it.unitPrice || 0) * (it.quantity || 1)), 0);
  const totalItemsVnd = totalItemsK * 1000;
  const mainItems = items.filter(it => !isPhuShipItem(it.content));
  const totalQty = mainItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const finalCodVnd = Math.max(0, totalItemsVnd + shippingFee - prepaid);

  const currentTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const currentDate = new Date().toLocaleDateString('vi-VN');

  const displayName = nickname ? `(${nickname}) #${getShortId(cleanUser)} ${cleanUser}` : `#${getShortId(cleanUser)} ${cleanUser}`;

  // Vẽ Canvas chuẩn độ phân giải cao (baseW = 520, 2x scale = 1040px) giúp chữ TO RÕ NÉT khi xem trên điện thoại Zalo/Messenger
  const renderBillToCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const baseW = 520; // Rộng hẹp chuẩn bill nhiệt 80mm giúp chữ cực to khi Zalo scale vừa màn hình
    const scale = 2; // Scaled for Retina & High-DPI screens (1040px width)

    // Tính toán lại danh sách sản phẩm gồm phụ ship 5k nếu là đơn 1 cái
    const displayItems = [...items];
    const mainItemsOnly = items.filter(it => !isPhuShipItem(it.content));
    const mainQtyOnly = mainItemsOnly.reduce((sum, it) => sum + (it.quantity || 1), 0);
    const isSingleItemOrder = mainQtyOnly === 1 && shippingFee > 0;
    if (isSingleItemOrder && !displayItems.some(it => isPhuShipItem(it.content))) {
      displayItems.push({
        id: "phu_ship_5k",
        content: "Phụ ship 5k",
        price: 5,
        unitPrice: 5,
        quantity: 1
      });
    }

    const calcItemsK = displayItems.reduce((sum, it) => sum + (it.price || (it.unitPrice || 0) * (it.quantity || 1)), 0);
    const calcItemsVnd = calcItemsK * 1000;
    const calcCodVnd = Math.max(0, calcItemsVnd + shippingFee - prepaid);

    // Tính toán chiều cao chính xác (exact height trimming)
    let totalH = 90 + 90 + 55 + (displayItems.length * 52) + 35 + 38 + 38 + (prepaid > 0 ? 38 : 0) + 105 + 55;
    canvas.width = baseW * scale;
    canvas.height = totalH * scale;

    ctx.scale(scale, scale);

    // Nền giấy trắng
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, baseW, totalH);

    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';

    // 1. Header Shop
    let y = 42;
    ctx.font = '900 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('HÓA ĐƠN BÁN HÀNG', baseW / 2, y);

    y += 28;
    ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#4b5563';
    ctx.fillText(`${PLATFORMS[platform].label} • Ngày: ${currentDate} • Giờ: ${currentTime}`, baseW / 2, y);

    y += 20;
    // Đường kẻ ngang nét đứt
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(baseW - 20, y);
    ctx.stroke();

    // 2. Thông tin khách hàng
    y += 38;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.font = '900 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Khách: ${displayName}`, 20, y);

    y += 32;
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#4b5563';
    let badgeText = isGl ? '🛵 GHÉ LẤY' : isNt ? '⚡ NINH THUẬN' : '📦 TOÀN QUỐC';
    ctx.fillText(`Hình thức: ${badgeText} • SL: ${mainQtyOnly} món`, 20, y);

    y += 20;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(baseW - 20, y);
    ctx.stroke();

    // 3. Header bảng
    y += 32;
    ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('STT TÊN MÓN', 20, y);
    ctx.textAlign = 'right';
    ctx.fillText('SL x GIÁ   THÀNH TIỀN', baseW - 20, y);

    y += 16;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(baseW - 20, y);
    ctx.stroke();

    // 4. Danh sách món (Chữ to 22px)
    ctx.fillStyle = '#111827';
    displayItems.forEach((it, idx) => {
      y += 48;
      const uPrice = it.unitPrice || (it.quantity ? Math.round(it.price / it.quantity) : it.price);
      const q = it.quantity || 1;
      const tVnd = (it.price || uPrice * q) * 1000;
      const cleanName = (it.content && !it.content.includes('(Không ghi chú)')) ? it.content : `Sản phẩm ${uPrice}k`;

      ctx.textAlign = 'left';
      ctx.font = '900 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const truncatedName = cleanName.length > 20 ? cleanName.slice(0, 18) + '...' : cleanName;
      ctx.fillText(`${idx + 1}. ${truncatedName}`, 20, y);

      ctx.textAlign = 'right';
      ctx.font = '700 20px "Courier New", monospace';
      ctx.fillText(`${q}x${uPrice}k   ${tVnd.toLocaleString('vi-VN')}đ`, baseW - 20, y);
    });

    y += 26;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(baseW - 20, y);
    ctx.stroke();

    // 5. Bảng tổng hợp tiền (Chữ to 20px)
    y += 34;
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(`Tổng tiền hàng (${mainQtyOnly} món):`, 20, y);
    ctx.textAlign = 'right';
    ctx.font = 'bold 21px "Courier New", monospace';
    ctx.fillStyle = '#111827';
    ctx.fillText(`${calcItemsVnd.toLocaleString('vi-VN')} đ`, baseW - 20, y);

    y += 34;
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('Phí giao hàng (Ship):', 20, y);
    ctx.textAlign = 'right';
    ctx.font = 'bold 21px "Courier New", monospace';
    ctx.fillStyle = '#1d4ed8';
    ctx.fillText(shippingFee === 0 ? '0 đ (Miễn phí)' : `+${shippingFee.toLocaleString('vi-VN')} đ`, baseW - 20, y);

    if (prepaid > 0) {
      y += 34;
      ctx.textAlign = 'left';
      ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#374151';
      ctx.fillText('Đã đặt cọc:', 20, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 21px "Courier New", monospace';
      ctx.fillStyle = '#b45309';
      ctx.fillText(`-${prepaid.toLocaleString('vi-VN')} đ`, baseW - 20, y);
    }

    // 6. Khung THU HỘ (COD) nổi bật (Chữ KHỦNG 40px)
    y += 28;
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0fdf4';
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(20, y, baseW - 40, 78, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#065f46';
    ctx.fillText('THU HỘ (COD):', 36, y + 48);

    ctx.textAlign = 'right';
    ctx.font = '900 38px "Courier New", monospace';
    ctx.fillStyle = '#047857';
    ctx.fillText(`${calcCodVnd.toLocaleString('vi-VN')} đ`, baseW - 36, y + 50);

    y += 112;
    // 7. Lời cảm ơn
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Cảm ơn quý khách đã mua sắm! ❤️', baseW / 2, y);

    return canvas;
  };

  const handleDownloadImage = () => {
    setDownloading(true);
    try {
      const canvas = renderBillToCanvas();
      const link = document.createElement('a');
      link.download = `bill_${cleanUser}_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Lỗi tải ảnh bill:', e);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyBillImage = async () => {
    try {
      const canvas = renderBillToCanvas();
      canvas.toBlob(async (blob) => {
        if (blob && navigator.clipboard && (window as any).ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new (window as any).ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedImage(true);
            setTimeout(() => setCopiedImage(false), 2000);
            return;
          } catch {}
        }
        // Fallback tải về nếu trình duyệt không hỗ trợ copy image blob
        handleDownloadImage();
      }, 'image/png');
    } catch {
      handleDownloadImage();
    }
  };

  const handleExecutePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    const cleanItems = items.map(it => ({
      content: it.content,
      price: it.price
    }));
    printBill(
      displayName,
      cleanItems,
      totalItemsK,
      PLATFORMS[platform].label,
      currentTime,
      isGl,
      shippingFee,
      prepaid
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs select-none animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...touchHandlers}
    >
      <div
        style={modalStyle}
        className="bg-[#121926] rounded-3xl w-full max-w-sm sm:max-w-md flex flex-col overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in-95 max-h-[92vh]"
      >
        {/* Header Modal */}
        <div className="p-3 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧾</span>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider">
                XEM TRƯỚC HÓA ĐƠN (BILL)
              </h3>
              <p className="text-[10px] text-blue-200">
                Gồm tiền hàng, ship, cọc & thu hộ COD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition-transform active:scale-90"
          >
            ✕
          </button>
        </div>

        {/* Thân Bill Giấy Cuộn Dạng Ảnh (Thermal Invoice Paper Style) */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 custom-scrollbar bg-[#090e17]">
          <div
            ref={billPaperRef}
            className="bg-white text-gray-900 rounded-2xl p-4 sm:p-5 shadow-xl border border-gray-200 font-mono text-xs relative select-text"
          >
            {/* Răng cưa hóa đơn góc trên */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded-t-2xl opacity-60" />

            {/* Header Tiêu Đề */}
            <div className="text-center pb-2.5 border-b border-dashed border-gray-300 space-y-0.5">
              <div className="text-lg sm:text-xl font-black tracking-tight text-gray-900 uppercase">
                HÓA ĐƠN BÁN HÀNG
              </div>
              <div className="text-[11px] text-gray-500 font-sans font-medium">
                {PLATFORMS[platform].label} • {currentDate} {currentTime}
              </div>
            </div>

            {/* Thông tin khách hàng */}
            <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1">
              <div className="flex items-start justify-between gap-1">
                <span className="text-gray-500 text-[11px] font-sans font-bold">Khách:</span>
                <span className="font-black text-gray-900 text-sm text-right break-words flex-1 ml-2 font-sans">
                  {displayName}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-600 font-sans">
                <span>Vận chuyển:</span>
                <span className="font-bold text-gray-800">
                  {isGl ? '🛵 Khách ghé lấy' : isNt ? '⚡ Ninh Thuận' : '📦 Toàn quốc'}
                </span>
              </div>
            </div>

            {/* Chi tiết từng món */}
            <div className="py-2.5 space-y-2 border-b border-dashed border-gray-300">
              <div className="flex items-center justify-between text-[10.5px] font-bold text-gray-400 font-sans pb-1 border-b border-gray-100">
                <span>TÊN MÓN</span>
                <span>SL x GIÁ • T.TIỀN</span>
              </div>
              {items.map((it, idx) => {
                const uPrice = it.unitPrice || (it.quantity ? Math.round(it.price / it.quantity) : it.price);
                const q = it.quantity || 1;
                const tVnd = (it.price || uPrice * q) * 1000;
                const cleanName = (it.content && !it.content.includes('(Không ghi chú)')) ? it.content : `Sản phẩm ${uPrice}k`;

                return (
                  <div key={idx} className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1 font-sans">
                      <div className="font-bold text-gray-900 truncate">
                        {idx + 1}. {cleanName}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {q} cái × {uPrice}k
                      </div>
                    </div>
                    <div className="font-black text-right shrink-0 font-mono text-gray-900">
                      {tVnd.toLocaleString('vi-VN')}đ
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bảng cộng tiền chi tiết: Hàng + Ship - Cọc */}
            <div className="py-2.5 space-y-1.5 text-xs border-b-2 border-gray-900">
              <div className="flex items-center justify-between text-gray-600 font-sans">
                <span>Tiền hàng ({totalQty} món):</span>
                <span className="font-bold font-mono text-gray-900">
                  {totalItemsVnd.toLocaleString('vi-VN')} đ
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-600 font-sans">
                <span className="flex items-center gap-1">
                  <span>🚚 Phí ship:</span>
                </span>
                <span className="font-bold font-mono text-blue-700">
                  {shippingFee === 0 ? '0 đ (Miễn ship)' : `+${shippingFee.toLocaleString('vi-VN')} đ`}
                </span>
              </div>

              {prepaid > 0 && (
                <div className="flex items-center justify-between text-amber-700 font-sans">
                  <span className="flex items-center gap-1">
                    <span>💧 Tiền đã cọc:</span>
                  </span>
                  <span className="font-bold font-mono text-amber-700">
                    -{prepaid.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              )}
            </div>

            {/* THU HỘ COD TO ĐẬM */}
            <div className="pt-3 pb-1 flex items-center justify-between">
              <div>
                <div className="text-[10.5px] font-black text-gray-500 uppercase tracking-wider font-sans">
                  TỔNG THANH TOÁN
                </div>
                <div className="text-sm font-black text-gray-900 uppercase tracking-tight font-sans">
                  THU HỘ (COD):
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 leading-none">
                  {finalCodVnd.toLocaleString('vi-VN')}
                  <span className="text-base font-bold ml-0.5">đ</span>
                </div>
              </div>
            </div>

            {/* Lời cảm ơn */}
            <div className="pt-3 text-center text-[10.5px] text-gray-400 font-sans italic border-t border-dashed border-gray-200 mt-2">
              Dạ shop cảm ơn quý khách nhiều ạ! ❤️
            </div>
          </div>
        </div>

        {/* Nút tác vụ dưới chân modal: IN BILL, LƯU ẢNH BILL & ĐÓNG */}
        <div className="p-3 bg-[#0d1420] border-t border-white/10 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExecutePrint}
            className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            <Printer size={16} />
            <span>IN BILL NGAY</span>
          </button>

          <button
            type="button"
            onClick={handleCopyBillImage}
            className="py-2.5 px-3 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Lưu hoặc copy ảnh bill để gửi cho khách"
          >
            {copiedImage ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            <span>{copiedImage ? 'ĐÃ COPY ẢNH' : 'LƯU ẢNH BILL'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
};
