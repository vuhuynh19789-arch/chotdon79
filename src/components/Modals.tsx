import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PlusCircle,
  Plus,
  Clipboard,
  Smartphone,
  Phone,
  MapPin,
  ShoppingBag,
  Package,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Calendar,
  Truck,
  ExternalLink,
  Edit3,
  LayoutGrid,
  List,
  Calculator,
  Minus,
  Printer,
  Trash2,
  Check,
  RotateCcw,
  Hash,
  Tag,
  Receipt,
  Search,
} from "lucide-react";
import {
  useStore,
  CustomerData,
  OrderItem,
  deduplicateOrderItems,
  getCustomerAvatar,
  isGhostZeroPriceItem,
  isCustomerGheLay,
  isCustomerNinhThuan,
} from "../store";
import {
  PLATFORMS,
  printLabel,
  printBill,
  getShortId,
  Platform,
  normalizeUser,
  getLastClosedPrice,
  getRecentSearchPrices,
  getRecentClosedPrices,
  removeVietnameseAccents,
  isPhuShipItem,
} from "../lib/core";
import { CustomerAvatar, ThapChamIcon, GheLayBadge } from "./UserAvatar";
import { openPancakeApp, parsePancakeContact } from "../lib/pancakeDeepLink";
import {
  getCustomerInsight,
  getOrderStatusLabel,
  getPartnerStatusLabel,
  syncSingleCustomerPancakeOrders,
  checkCustomerPancakeShippedStatus,
  formatDateTime,
  parseOrderTimestamp,
  toStartOfDay,
  getCustomerActivePastItems,
  pushCustomerOrderToPancake,
  parsePancakeUrlIds,
  isShopPhone,
} from "../lib/pancakeSync";
import { PancakeOrderPushModal } from "./PancakeOrderPushModal";
import { BillPreviewModal } from "./BillPreviewModal";
import { QuickOrderPushModal } from "./QuickOrderPushModal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useSwipeToDismiss } from "../lib/useSwipeToDismiss";
import { markExternalAppOpened } from "../lib/backHandler";

export function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`opacity-60 hover:opacity-100 ${copied ? "opacity-100" : ""} ${className}`}
    >
      {copied ? "✅" : "📋"}
    </button>
  );
}

export function DeleteConfirmButton({
  onDelete,
  className = "",
}: {
  onDelete: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (confirming) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={`bg-red-600 hover:bg-red-700 text-white font-bold text-xs whitespace-nowrap animate-pulse ${className}`}
      >
        ⚠️
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className={`bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs whitespace-nowrap ${className}`}
    >
      🗑️
    </button>
  );
}

export function PriceIncrementButton({
  priceK,
  customLabel,
  quantity,
  onClick,
  title,
  className = "",
}: {
  priceK?: number;
  customLabel?: string;
  quantity?: number;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}) {
  const displayContent = customLabel !== undefined ? customLabel : `${priceK}k`;
  const hasMultiple = quantity !== undefined && quantity >= 2;

  if (hasMultiple) {
    return (
      <div
        title={title || `Số lượng: x${quantity}`}
        className={`bg-cyan-950/70 border border-cyan-400/50 text-cyan-200 font-mono font-black text-xs sm:text-sm px-2 py-0.5 rounded-lg min-w-[48px] sm:min-w-[54px] text-right shadow-xs flex items-center justify-end gap-1 select-none shrink-0 ${className}`}
      >
        <span className="text-[10px] font-sans font-black bg-cyan-500/20 text-cyan-300 px-1 py-0.2 rounded leading-none shrink-0 border border-cyan-400/30">
          x{quantity}
        </span>
        <span className="font-mono tracking-tight font-black">
          {displayContent}
        </span>
      </div>
    );
  }

  return (
    <div
      title={title || `Giá: ${displayContent}`}
      className={`bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-lg text-emerald-300 font-mono font-black text-xs sm:text-sm min-w-[38px] sm:min-w-[44px] text-right shadow-xs flex items-center justify-end gap-1 select-none shrink-0 ${className}`}
    >
      <span>{displayContent}</span>
    </div>
  );
}

export interface EditingPriceQtyTarget {
  platform: Platform;
  user: string;
  itemIndex: number;
  itemId?: string;
  content: string;
  unitPrice: number;
  quantity: number;
  isPast?: boolean;
}

export function QuickPriceQtyModal({
  target,
  onClose,
}: {
  target: EditingPriceQtyTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;
  const { modalStyle, touchHandlers } = useSwipeToDismiss({
    onClose,
    enabled: !!target,
  });
  const store = useStore();
  const [price, setPrice] = useState<number | string>(target.unitPrice);
  const [qty, setQty] = useState<number>(target.quantity || 1);

  useEffect(() => {
    if (target) {
      setPrice(target.unitPrice);
      setQty(target.quantity || 1);
    }
  }, [target]);

  const numericPrice =
    typeof price === "number"
      ? price
      : parseInt(String(price).replace(/\D/g, "")) || 0;
  const currentTotalK = numericPrice * (qty || 1);

  const handleSave = () => {
    if (!target) return;
    store.updateOrderItemPriceAndQuantity(
      target.platform,
      target.user,
      target.itemIndex,
      numericPrice,
      qty,
      target.isPast,
      target.itemId,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      {...touchHandlers}
    >
      <div
        style={modalStyle}
        className="bg-[#0f172a] border border-cyan-500/40 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="font-bold text-white text-base">
              Sửa Giá × Số Lượng
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Comment content */}
        <div className="bg-[#1e293b]/70 rounded-xl p-3 border border-white/5">
          <div className="text-[11px] text-gray-400 font-medium mb-1">
            Nội dung cmt khách:
          </div>
          <div className="font-bold text-amber-300 text-sm break-words flex items-start gap-1.5">
            <span className="text-gray-400 shrink-0">💬</span>
            <span>{target.content}</span>
          </div>
        </div>

        {/* Chỉnh Giá đơn vị (k) */}
        <div>
          <label className="text-xs text-gray-300 font-bold block mb-1.5">
            Đơn giá (k = nghìn VNĐ):
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) =>
                setPrice(
                  e.target.value === ""
                    ? ""
                    : Math.max(0, parseInt(e.target.value) || 0),
                )
              }
              className="w-full bg-[#0b131e] border border-white/20 rounded-xl py-2 px-3 text-cyan-300 font-mono font-bold text-lg text-right pr-9 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              placeholder="0"
            />
            <span className="absolute right-3 top-2.5 text-gray-400 font-mono font-bold text-sm">
              k
            </span>
          </div>
        </div>

        {/* Chỉnh Số lượng (SL) */}
        <div>
          <label className="text-xs text-gray-300 font-bold block mb-1.5">
            Số lượng (SL):
          </label>
          <div className="flex items-center justify-between bg-[#0b131e] border border-white/20 rounded-xl p-1.5">
            <button
              type="button"
              onClick={() => setQty((prev) => Math.max(1, prev - 1))}
              disabled={qty <= 1}
              className="w-12 h-11 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-30 flex items-center justify-center font-bold text-xl text-gray-200 cursor-pointer transition-all"
              title="Giảm 1"
            >
              -
            </button>
            <div className="flex-1 text-center font-mono font-black text-2xl text-emerald-400">
              {qty}
            </div>
            <button
              type="button"
              onClick={() => setQty((prev) => prev + 1)}
              className="w-12 h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 flex items-center justify-center font-bold text-xl text-white cursor-pointer transition-all shadow-md shadow-emerald-950"
              title="Tăng 1"
            >
              +
            </button>
          </div>

          {/* Hàng nút số lượng nhanh: 1, 2, 3, 4, 5, 6, 10 */}
          <div className="flex items-center gap-1.5 mt-2">
            {[1, 2, 3, 4, 5, 6, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQty(n)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  qty === n
                    ? "bg-cyan-500 text-black shadow-md shadow-cyan-900/50 scale-105"
                    : "bg-white/5 hover:bg-white/10 text-gray-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Tổng thành tiền preview */}
        <div className="bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-400 uppercase font-mono">
              Công thức
            </div>
            <div className="font-mono text-cyan-300 font-bold text-sm">
              {numericPrice}k × {qty}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-400 uppercase font-mono">
              Thành tiền
            </div>
            <div className="font-mono text-emerald-400 font-black text-xl">
              {currentTotalK}k{" "}
              <span className="text-xs font-normal text-gray-300">
                ({(currentTotalK * 1000).toLocaleString("vi-VN")}đ)
              </span>
            </div>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (!target) return;
              store.duplicateOrderItem(
                target.platform,
                target.user,
                target.itemIndex,
                target.isPast,
                target.itemId,
              );
              onClose();
            }}
            className="py-2.5 px-3 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
            title="Tạo thêm 1 món giống hệt cmt này với SL 1"
          >
            <span>+1 Nhân bản</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-sm cursor-pointer transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-900/40 transition-all"
          >
            <span>✓ Cập nhật</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import { ItemCalculatorModal, parseOrderFormula } from "./ItemCalculatorModal";
export type { ParsedCalculatorItem } from "./ItemCalculatorModal";
export { ItemCalculatorModal, parseOrderFormula };

export function PriceModal({
  pendingPrint,
  onClose,
}: {
  pendingPrint: {
    id: string | null;
    user: string;
    platform: Platform;
    defaultPrice?: string;
  };
  onClose: () => void;
}) {
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ onClose });
  const store = useStore();
  const cleanUser = normalizeUser(pendingPrint.user);
  const pStore = store[pendingPrint.platform];
  const flowPrice = pStore.flowPrice;

  // Smart price calculation:
  const lastClosed = getLastClosedPrice();
  const searchPrices = getRecentSearchPrices(); // 3 giá chủ live nhập gần nhất ở ô tìm kiếm
  const recentClosedPrices = getRecentClosedPrices();

  // Priority for initial price to jump right into input:
  // 1. defaultPrice (from comment extracted price)
  // 2. lastClosed (giá chốt gần nhất - nhảy vào ô nhập giá luôn)
  // 3. searchPrices[0] (giá gần nhất nhập ở ô tìm kiếm)
  const initialPrice =
    pendingPrint.defaultPrice ||
    (lastClosed ? lastClosed : "") ||
    (searchPrices.length > 0 ? searchPrices[0] : "");

  const [price, setPrice] = useState(initialPrice);
  const [useFormulaCalc, setUseFormulaCalc] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [printQueue, setPrintQueue] = useState<string[]>([]);
  const [printIndex, setPrintIndex] = useState(0);
  const [isMulti, setIsMulti] = useState(false);

  useEffect(() => {
    if (initialPrice) {
      setPrice(initialPrice);
    }
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 100);
  }, [initialPrice]);

  if (useFormulaCalc) {
    return (
      <ItemCalculatorModal
        user={cleanUser}
        platform={pendingPrint.platform}
        sourceCommentId={pendingPrint.id}
        defaultPrice={price || initialPrice}
        onClose={onClose}
        onAdded={onClose}
      />
    );
  }

  const cust = store[pendingPrint.platform].customers[cleanUser];

  const executePrint = (p: string, isFirst: boolean) => {
    let content = "";
    let time = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (pendingPrint.id) {
      const item = store[pendingPrint.platform].comments.find(
        (x) => x.id === pendingPrint.id,
      );
      if (item) {
        content =
          typeof item.content === "object"
            ? JSON.stringify(item.content)
            : String(item.content || "");
        time = item.time;
      }
    }
    store.printNewOrder(
      pendingPrint.platform,
      cleanUser,
      content,
      p,
      time,
      isFirst ? pendingPrint.id : null,
      true,
    );
  };

  const confirm = () => {
    if (!price.trim()) return;
    const prices = price
      .trim()
      .split("-")
      .map((p) => p.trim())
      .filter((p) => p);
    if (prices.length === 0) return;

    if (prices.length === 1) {
      executePrint(prices[0], true);
      onClose();
    } else {
      setPrintQueue(prices);
      setIsMulti(true);
      setPrintIndex(1);
      executePrint(prices[0], true);
    }
  };

  const printNext = () => {
    if (printIndex < printQueue.length) {
      executePrint(printQueue[printIndex], false);
      setPrintIndex(printIndex + 1);
    }
  };

  if (isMulti) {
    return (
      <div
        className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-2 sm:p-4"
        {...touchHandlers}
      >
        <div
          style={modalStyle}
          className="bg-[#1c242f] rounded-xl p-5 w-full max-w-sm flex flex-col items-center shadow-2xl"
        >
          <h3 className="text-xl font-bold text-blue-400 mb-2">
            🖨️ Đang in nhiều tem
          </h3>
          <p className="text-gray-400 mb-6 font-medium text-lg">
            Tiến độ: {printIndex} / {printQueue.length} tem
          </p>

          {printIndex < printQueue.length ? (
            <button
              onClick={printNext}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full py-4 rounded-xl font-bold text-xl shadow-md transition-transform active:scale-95 mb-3 cursor-pointer"
            >
              IN TEM TIẾP THEO ({printQueue[printIndex]}k)
            </button>
          ) : (
            <button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700 text-white w-full py-4 rounded-xl font-bold text-xl shadow-md transition-transform active:scale-95 mb-3 cursor-pointer"
            >
              ✅ HOÀN TẤT
            </button>
          )}

          {printIndex < printQueue.length && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white font-bold py-2 mt-2 cursor-pointer"
            >
              Hủy in các tem còn lại
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center pt-32 px-4"
      {...touchHandlers}
    >
      <div
        style={modalStyle}
        className="bg-[#1c242f] rounded-xl p-5 w-full max-w-sm flex flex-col overflow-hidden shadow-2xl border border-white/10"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold text-blue-400">💰 Nhập giá</h3>
          <button
            type="button"
            onClick={() => setUseFormulaCalc(true)}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs"
          >
            <span>🧮 Bảng tính (Giá x SL)</span>
          </button>
        </div>
        <div className="text-center font-black text-xl text-red-500 flex items-center justify-center gap-1.5 flex-wrap">
          <span>{PLATFORMS[pendingPrint.platform].label} -</span>
          {store[pendingPrint.platform].tags?.[cleanUser] &&
            store[pendingPrint.platform].tags?.[cleanUser] !== "NORMAL" && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white shrink-0 ${
                  store[pendingPrint.platform].tags?.[cleanUser] === "HOST"
                    ? "bg-yellow-500 text-black border border-yellow-400 font-black"
                    : store[pendingPrint.platform].tags?.[cleanUser] === "VIP"
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : store[pendingPrint.platform].tags?.[cleanUser] === "COC"
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : store[pendingPrint.platform].tags?.[cleanUser] ===
                            "COC_100"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : store[pendingPrint.platform].tags?.[cleanUser] ===
                              "GHE_LAY"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : store[pendingPrint.platform].tags?.[cleanUser] ===
                                "DAO"
                              ? "bg-gray-500/20 text-gray-300 border border-white/10"
                              : store[pendingPrint.platform].tags?.[
                                    cleanUser
                                  ] === "BOM"
                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                : "bg-black text-red-400 border border-red-500/40"
                }`}
              >
                {store[pendingPrint.platform].tags?.[cleanUser] === "HOST"
                  ? "👑 HOST"
                  : store[pendingPrint.platform].tags?.[cleanUser] === "VIP"
                    ? "🌟 Quen"
                    : store[pendingPrint.platform].tags?.[cleanUser] === "COC"
                      ? "💧 Cọc 50k"
                      : store[pendingPrint.platform].tags?.[cleanUser] ===
                          "COC_100"
                        ? "💧 Cọc 100k"
                        : store[pendingPrint.platform].tags?.[cleanUser] ===
                            "GHE_LAY"
                          ? "🛵 Ghé lấy"
                          : store[pendingPrint.platform].tags?.[cleanUser] ===
                              "DAO"
                            ? "👻 Dạo"
                            : store[pendingPrint.platform].tags?.[cleanUser] ===
                                "BOM"
                              ? "⚠️ BOM"
                              : "⛔ Chặn"}
              </span>
            )}
          {isCustomerGheLay(store[pendingPrint.platform].gheLayTags, cleanUser, store[pendingPrint.platform].tags) ? (
            <GheLayBadge className="text-[10px]" />
          ) : isCustomerNinhThuan(store[pendingPrint.platform].ninhThuanTags, cleanUser) ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-1">
              <ThapChamIcon className="w-2.5 h-2.5" />
              <span>Ninh Thuận</span>
            </span>
          ) : null}
          <span className="break-words font-black">
            {store[pendingPrint.platform].nicknames?.[cleanUser]
              ? `(${store[pendingPrint.platform].nicknames[cleanUser]}) ${cleanUser}`
              : `#${getShortId(cleanUser)} ${cleanUser}`}
          </span>
        </div>
        <div className="text-center text-sm text-gray-400 mt-1">
          {cust ? `Phiên này: ${cust.count} cái | Tổng: ${cust.total}k` : ""}
        </div>

        {/* Quick Tag Selector */}
        <div className="flex items-center justify-center gap-1 mt-2 mb-1 flex-wrap">
          {(
            [
              "NORMAL",
              "HOST",
              "VIP",
              "COC",
              "COC_100",
              "GIU",
              "GHE_LAY",
              "DAO",
              "BOM",
            ] as const
          ).map((t) => {
            const currentTag =
              store[pendingPrint.platform].tags?.[cleanUser] || "NORMAL";
            const isSelected = currentTag === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() =>
                  store.setCustomerTag(pendingPrint.platform, cleanUser, t)
                }
                className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? t === "HOST"
                      ? "bg-yellow-500 border-yellow-400 text-black font-black shadow-sm ring-1 ring-yellow-300"
                      : t === "COC"
                        ? "bg-cyan-600 border-cyan-500 text-white shadow-sm ring-1 ring-cyan-400"
                        : t === "COC_100"
                          ? "bg-blue-600 border-blue-500 text-white shadow-sm ring-1 ring-blue-400"
                          : t === "GIU"
                            ? "bg-amber-600 border-amber-500 text-white shadow-sm ring-1 ring-amber-400"
                            : t === "GHE_LAY"
                              ? "bg-emerald-600 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-400"
                              : t === "VIP"
                                ? "bg-orange-500 border-orange-400 text-white shadow-sm"
                                : t === "DAO"
                                  ? "bg-gray-600 border-gray-500 text-white"
                                  : t === "BOM"
                                    ? "bg-red-600 border-red-500 text-white"
                                    : "bg-green-600 border-green-500 text-white"
                    : "bg-[#0e1621] border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {t === "NORMAL"
                  ? "Thường"
                  : t === "HOST"
                    ? "👑 Host"
                    : t === "VIP"
                      ? "🌟 Quen"
                      : t === "COC"
                        ? "💧 Cọc 50k"
                        : t === "COC_100"
                          ? "💧 Cọc 100k"
                          : t === "GIU"
                            ? "📦 Giữ hàng"
                            : t === "GHE_LAY"
                              ? "🛵 Ghé lấy"
                              : t === "DAO"
                                ? "👻 Dạo"
                                : "⚠️ BOM"}
              </button>
            );
          })}
          <div className="h-4 w-px bg-white/20 self-center mx-0.5 shrink-0" />
          <button
            type="button"
            onClick={() =>
              store.toggleNinhThuanTag(pendingPrint.platform, cleanUser)
            }
            className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
              isCustomerNinhThuan(store[pendingPrint.platform].ninhThuanTags, cleanUser)
                ? "bg-amber-600 border-amber-400 text-white font-bold shadow-sm ring-1 ring-amber-300"
                : "bg-[#0e1621] border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
            }`}
            title="Tag Ninh Thuận (chọn đồng thời với các tag khác)"
          >
            <ThapChamIcon className="w-3 h-3" />
            <span>Ninh Thuận</span>
          </button>
        </div>

        {/* Smart Price Suggestions Bar */}
        <div className="mt-2.5 flex flex-col gap-1.5 bg-[#0e1621]/90 p-2.5 rounded-xl border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
              ⚡ Gợi ý giá thông minh
            </span>
            {lastClosed && (
              <span className="text-[10px] text-gray-400">
                Chốt gần nhất:{" "}
                <span className="text-emerald-400 font-bold">
                  {lastClosed}k
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Last Closed Price Button */}
            {lastClosed && (
              <button
                type="button"
                onClick={() => {
                  setPrice(lastClosed);
                  setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                  }, 50);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/50 text-emerald-300 font-black text-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs"
                title="Giá đơn hàng chốt gần nhất"
              >
                <span>⚡ Chốt: {lastClosed}k</span>
              </button>
            )}

            {/* 3 Most Recent Search Bar Prices */}
            {searchPrices.map((sp, idx) => (
              <button
                key={`sp_${idx}`}
                type="button"
                onClick={() => {
                  setPrice(sp);
                  setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                  }, 50);
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/35 border border-blue-500/50 text-blue-300 font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs"
                title="Giá chủ live nhập gần nhất ở ô tìm kiếm"
              >
                <span>🔍 {sp}k</span>
              </button>
            ))}

            {/* Other Recent Closed Prices if not in list */}
            {recentClosedPrices
              .filter((rp) => rp !== lastClosed && !searchPrices.includes(rp))
              .slice(0, 2)
              .map((rp, idx) => (
                <button
                  key={`rp_${idx}`}
                  type="button"
                  onClick={() => {
                    setPrice(rp);
                    setTimeout(() => {
                      inputRef.current?.focus();
                      inputRef.current?.select();
                    }, 50);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-gray-200 font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                >
                  <span>{rp}k</span>
                </button>
              ))}
          </div>
        </div>

        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          placeholder="Nhập giá (VD: 65 hoặc 29-29)"
          className="w-full p-3 bg-[#0e1621] text-white placeholder-gray-400 border border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 rounded-lg text-xl text-center mt-3 font-bold outline-none"
        />
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg cursor-pointer transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={confirm}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg cursor-pointer transition-colors"
          >
            IN NGAY
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualModal({
  onClose,
  onOpenProfile,
  onSaved,
  isPage,
  initialSearch,
}: {
  onClose: () => void;
  onOpenProfile: (u: string, p: Platform) => void;
  onSaved?: () => void;
  isPage?: boolean;
  initialSearch?: string;
}) {
  const store = useStore();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [user, setUser] = useState(
    initialSearch && !initialSearch.startsWith("/") ? initialSearch : "",
  );
  const [content, setContent] = useState("");
  const [price, setPrice] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialSearch && !initialSearch.startsWith("/")) {
      setUser(initialSearch);
      setShowSuggestions(true);
    }
  }, [initialSearch]);

  useEffect(() => {
    if (!isPage) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isPage]);

  const suggestions = useMemo(() => {
    if (!user.trim()) return [];
    const keyword = user.trim().toLowerCase();
    const kwNoAccent = removeVietnameseAccents(keyword);
    const custs = store[platform].customers;
    const nicks = store[platform].nicknames || {};
    const tags = store[platform].tags || {};

    let matches: {
      username: string;
      nickname: string;
      tag: string;
      count: number;
      total: number;
    }[] = [];
    Object.keys(custs).forEach((username) => {
      const nickname = nicks[username] || "";
      const tag = tags[username] || "NORMAL";
      const shortId = getShortId(username).toLowerCase();
      const uLower = username.toLowerCase();
      const uNoAccent = removeVietnameseAccents(uLower);
      const nickLower = nickname.toLowerCase();
      const nickNoAccent = removeVietnameseAccents(nickLower);

      if (
        uLower.includes(keyword) ||
        uNoAccent.includes(kwNoAccent) ||
        nickLower.includes(keyword) ||
        nickNoAccent.includes(kwNoAccent) ||
        shortId.includes(keyword) ||
        ("#" + shortId).includes(keyword)
      ) {
        matches.push({
          username,
          nickname,
          tag,
          count: custs[username]?.count || 0,
          total: custs[username]?.total || 0,
        });
      }
    });
    matches.sort(
      (a, b) =>
        (custs[b.username]?.lastTime || 0) - (custs[a.username]?.lastTime || 0),
    );
    return matches.slice(0, 8);
  }, [user, platform, store]);

  const confirm = () => {
    const u = user.trim();
    if (!u) {
      inputRef.current?.focus();
      return;
    }
    const c = content.trim();
    const p = price.trim();

    if (p) {
      let time = new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      store.printNewOrder(platform, u, c, p, time, null);
    } else {
      // Just init customer
      store.initCustomer(platform, u);
      onOpenProfile(u, platform);
    }

    setUser("");
    setContent("");
    setPrice("");
    if (onSaved) {
      onSaved();
    } else if (!isPage) {
      inputRef.current?.focus();
      onClose();
    }
  };

  return (
    <div
      className={
        isPage
          ? "h-full w-full flex items-center justify-center p-2"
          : "fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-2 sm:p-4"
      }
    >
      <div
        className={`bg-[#1c242f] ${isPage ? "w-full h-full flex flex-col" : "rounded-xl p-5 w-full max-w-sm flex flex-col overflow-hidden shadow-2xl border border-white/10"}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="w-8" />
          <h3 className="text-xl font-bold text-blue-400 text-center flex-1">
            ✍️ Tạo đơn tay
          </h3>
          {isPage ? (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center font-bold cursor-pointer transition-colors"
              title="Đóng (Quay về trang chat)"
            >
              ✕
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          className="w-full p-3 bg-[#0e1621] text-white border border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 rounded-lg mb-3 font-bold outline-none cursor-pointer"
        >
          <option value="tiktok" className="bg-[#1c242f] text-white">
            🎵 TikTok
          </option>
          <option value="facebook" className="bg-[#1c242f] text-white">
            📘 Facebook
          </option>
          <option value="shopee" className="bg-[#1c242f] text-white">
            🛒 Shopee
          </option>
        </select>

        <div className="relative mb-3">
          <input
            ref={inputRef}
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Tên top khách"
            className="w-full p-3 bg-[#0e1621] text-white placeholder-gray-400 border border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 rounded-lg font-bold outline-none"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-[#1c242f] border border-white/20 rounded-lg shadow-xl mt-1 z-50 max-h-56 overflow-y-auto divide-y divide-white/5">
              {suggestions.map((s, idx) => (
                <div
                  key={idx}
                  className="p-2.5 cursor-pointer hover:bg-white/10 flex justify-between items-center transition-colors gap-2"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setUser(s.username);
                    setShowSuggestions(false);
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                    <span className="text-[11px] font-mono font-bold text-gray-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10 shrink-0">
                      #{getShortId(s.username)}
                    </span>
                    {s.tag !== "NORMAL" && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white shrink-0 ${
                          s.tag === "VIP"
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                            : s.tag === "COC"
                              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                              : s.tag === "COC_100"
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : s.tag === "GHE_LAY"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : s.tag === "DAO"
                                    ? "bg-gray-500/20 text-gray-300 border border-white/10"
                                    : s.tag === "BOM"
                                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                      : "bg-black text-red-400 border border-red-500/40"
                        }`}
                      >
                        {s.tag === "VIP"
                          ? "🌟 Quen"
                          : s.tag === "COC"
                            ? "💧 Cọc 50k"
                            : s.tag === "COC_100"
                              ? "💧 Cọc 100k"
                              : s.tag === "GHE_LAY"
                                ? "🛵 Ghé lấy"
                                : s.tag === "DAO"
                                  ? "👻 Dạo"
                                  : s.tag === "BOM"
                                    ? "⚠️ BOM"
                                    : "⛔ Chặn"}
                      </span>
                    )}
                    {s.nickname && (
                      <span className="text-xs text-amber-300 font-black px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded truncate shrink-0">
                        ({s.nickname})
                      </span>
                    )}
                    <span className="font-bold text-white truncate">
                      {s.username}
                    </span>
                  </div>
                  {s.count > 0 && (
                    <span className="text-xs text-blue-400 font-bold ml-1 shrink-0">
                      {s.count} cái
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Nội dung (không bắt buộc)"
          className="w-full p-3 bg-[#0e1621] text-white placeholder-gray-400 border border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 rounded-lg mb-3 font-medium outline-none"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          placeholder="Giá (để trống nếu chỉ lưu tên)"
          className="w-full p-3 bg-[#0e1621] text-white placeholder-gray-400 border border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 rounded-lg mb-4 font-bold text-lg outline-none"
        />

        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 active:scale-98 text-white font-bold rounded-xl cursor-pointer transition-all shadow-md"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 active:scale-98 text-white font-black rounded-xl cursor-pointer transition-all shadow-md shadow-green-950/40"
          >
            LƯU / IN
          </button>
        </div>
      </div>
    </div>
  );
}

export function ListModal({
  filterPlatform,
  onClose,
  onOpenProfile,
  onOpenPrice,
  onOpenPancakeLink,
  isPage,
  onScroll,
  onSetFilter,
  searchKeyword = "",
}: {
  filterPlatform?: Platform;
  onClose: () => void;
  onOpenProfile: (u: string, p: Platform) => void;
  onOpenPrice?: (id: string | null, u: string, p: Platform) => void;
  onOpenPancakeLink?: (
    user: string,
    platform: Platform,
    initialSearch?: string,
  ) => void;
  isPage?: boolean;
  onScroll?: (isDown: boolean) => void;
  onSetFilter?: (p: Platform | undefined) => void;
  searchKeyword?: string;
}) {
  const store = useStore();
  const [listSearch, setListSearch] = useState("");
  const [editingPriceQty, setEditingPriceQty] =
    useState<EditingPriceQtyTarget | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "count" | "revenue">(
    "newest",
  );
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [customDate, setCustomDate] = useState<string>("");
  const [quantityFilter, setQuantityFilter] = useState<
    | "all"
    | "holding_1_2_old"
    | "holding_old_3days"
    | "holding_old_5days"
    | "qty_1"
    | "qty_2"
    | "qty_1_2"
    | "qty_3_plus"
  >("all");
  const [activeDropdown, setActiveDropdown] = useState<
    "platform" | "date" | "sort" | null
  >(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    try {
      return (
        (localStorage.getItem("slp_cart_view_mode") as "list" | "grid") ||
        "list"
      );
    } catch {
      return "list";
    }
  });
  const handleSetViewMode = (mode: "list" | "grid") => {
    setViewMode(mode);
    try {
      localStorage.setItem("slp_cart_view_mode", mode);
    } catch {}
  };

  const [contextMenuItem, setContextMenuItem] = useState<{
    user: string;
    platform: Platform;
    item: any;
    fullCommentContent: string;
    itemUnitPrice: number;
    itemQty: number;
    itemTotalK: number;
  } | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const startLongPress = (
    item: any,
    user: string,
    platform: Platform,
    fullCommentContent: string,
    itemUnitPrice: number,
    itemQty: number,
    itemTotalK: number,
  ) => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      setContextMenuItem({
        item,
        user,
        platform,
        fullCommentContent,
        itemUnitPrice,
        itemQty,
        itemTotalK,
      });
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const [pushModalTarget, setPushModalTarget] = useState<{
    user: string;
    platform: Platform;
    selectedCurrent: Set<number>;
    selectedPast: Set<number>;
  } | null>(null);
  const [selectedCurrentMap, setSelectedCurrentMap] = useState<
    Record<string, Set<number>>
  >({});
  const [selectedPastMap, setSelectedPastMap] = useState<
    Record<string, Set<number>>
  >({});
  const [expandedPastMap, setExpandedPastMap] = useState<
    Record<string, boolean>
  >({});
  const [isMiniBarMinimized, setIsMiniBarMinimized] = useState(false);
  const [showHoldingOnlySection, setShowHoldingOnlySection] = useState(false);
  const [hasCheckedHolding, setHasCheckedHolding] = useState(false);
  const [isCheckingHolding, setIsCheckingHolding] = useState(false);

  const getCustKey = (user: string, platform: Platform) =>
    `${platform}_${user}`;

  const toggleSelectItem = (
    user: string,
    platform: Platform,
    realIndex: number,
    isPast: boolean,
  ) => {
    const key = getCustKey(user, platform);
    if (isPast) {
      setSelectedPastMap((prev) => {
        const currentSet = new Set(prev[key] || []);
        if (currentSet.has(realIndex)) currentSet.delete(realIndex);
        else currentSet.add(realIndex);
        return { ...prev, [key]: currentSet };
      });
    } else {
      setSelectedCurrentMap((prev) => {
        const currentSet = new Set(prev[key] || []);
        if (currentSet.has(realIndex)) currentSet.delete(realIndex);
        else currentSet.add(realIndex);
        return { ...prev, [key]: currentSet };
      });
    }
  };

  const toggleExpandPast = (user: string, platform: Platform) => {
    const key = getCustKey(user, platform);
    setExpandedPastMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handlePushOrder = (user: string, platform: Platform) => {
    const cleanU = normalizeUser(user);
    const key = getCustKey(user, platform);
    const keyClean = getCustKey(cleanU, platform);
    const selCur = selectedCurrentMap[key] || selectedCurrentMap[keyClean] || new Set<number>();
    const selPast = selectedPastMap[key] || selectedPastMap[keyClean] || new Set<number>();

    const cust = store[platform].customers[user] || store[platform].customers[cleanU];
    const curItems = cust?.items || [];
    const pastItems = cust?.pastItems || [];

    let finalCurrentIndices = selCur;
    let finalPastIndices = selPast;

    // Bấm đẩy ko chọn là hiểu đẩy hết (như ở trong trang hồ sơ khách)
    if (selCur.size === 0 && selPast.size === 0) {
      if (curItems.length > 0) {
        finalCurrentIndices = new Set(curItems.map((_, i) => i));
      } else if (pastItems.length > 0) {
        finalPastIndices = new Set(pastItems.map((_, i) => i));
      }
    }

    setPushModalTarget({
      user,
      platform,
      selectedCurrent: finalCurrentIndices,
      selectedPast: finalPastIndices,
    });
  };

  const clearCustomerSelection = (user: string, platform: Platform) => {
    const cleanU = normalizeUser(user);
    const key = getCustKey(user, platform);
    const keyClean = getCustKey(cleanU, platform);
    setSelectedCurrentMap((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next[keyClean];
      return next;
    });
    setSelectedPastMap((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next[keyClean];
      return next;
    });
  };

  const getItemTimestamp = (item: OrderItem, fallbackTs?: number): number => {
    if (item.createdAt) return item.createdAt;
    if (item.id) {
      const match = String(item.id).match(/^(\d{13})/);
      if (match) return parseInt(match[1], 10);
    }
    return fallbackTs || 0;
  };

  const getVietnamDateKey = (ts: number): string => {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatVietnamDateLabel = (dateKey: string): string => {
    if (!dateKey) return "";
    const parts = dateKey.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateKey;
  };

  const dateOptions = useMemo(() => {
    const nowTs = Date.now();
    const todayKey = getVietnamDateKey(nowTs);
    const yesterdayKey = getVietnamDateKey(nowTs - 86400000);
    return [
      {
        id: "today",
        label: `🟢 Hôm nay (${formatVietnamDateLabel(todayKey)})`,
        key: todayKey,
        daysAgo: 0,
      },
      {
        id: "yesterday",
        label: `🟡 Hôm qua (${formatVietnamDateLabel(yesterdayKey)})`,
        key: yesterdayKey,
        daysAgo: 1,
      },
      {
        id: "days_2",
        label: `📅 Cách 2 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 2 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 2 * 86400000),
        daysAgo: 2,
      },
      {
        id: "days_3",
        label: `📅 Cách 3 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 3 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 3 * 86400000),
        daysAgo: 3,
      },
      {
        id: "days_4",
        label: `📅 Cách 4 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 4 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 4 * 86400000),
        daysAgo: 4,
      },
      {
        id: "days_5",
        label: `📅 Cách 5 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 5 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 5 * 86400000),
        daysAgo: 5,
      },
      {
        id: "days_6",
        label: `📅 Cách 6 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 6 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 6 * 86400000),
        daysAgo: 6,
      },
      {
        id: "days_7",
        label: `📅 Cách 7 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 7 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 7 * 86400000),
        daysAgo: 7,
      },
      {
        id: "days_8",
        label: `📅 Cách 8 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 8 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 8 * 86400000),
        daysAgo: 8,
      },
      {
        id: "days_9",
        label: `📅 Cách 9 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 9 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 9 * 86400000),
        daysAgo: 9,
      },
      {
        id: "days_10",
        label: `📅 Cách 10 ngày (${formatVietnamDateLabel(getVietnamDateKey(nowTs - 10 * 86400000))})`,
        key: getVietnamDateKey(nowTs - 10 * 86400000),
        daysAgo: 10,
      },
      { id: "10days", label: `🕒 10 ngày qua`, key: null, daysAgo: null },
      { id: "all", label: `🌐 Tất cả các ngày`, key: null, daysAgo: null },
      {
        id: "custom",
        label: customDate
          ? `🗓️ ${formatVietnamDateLabel(customDate)}`
          : `🗓️ Chọn ngày cụ thể...`,
        key: customDate || null,
        daysAgo: null,
      },
    ];
  }, [customDate]);

  const [lastScrollY, setLastScrollY] = useState(0);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentY = e.currentTarget.scrollTop;
    if (onScroll) {
      if (currentY > lastScrollY + 5 && currentY > 20) {
        onScroll(true); // Lướt xuống
      } else if (currentY < lastScrollY - 5) {
        onScroll(false); // Lướt lên
      }
    }
    setLastScrollY(currentY);
  };

  const effectiveListSearch = (listSearch || searchKeyword || "")
    .trim()
    .toLowerCase();

  const currentSelectedOption = dateOptions.find((o) => o.id === dateFilter);
  const targetDateKey =
    dateFilter === "custom" ? customDate : currentSelectedOption?.key || null;

  interface CartCustomerRow {
    user: string;
    platform: Platform;
    c: CustomerData;
    displayItems: (OrderItem & { _realIndex: number; _isPast: boolean })[];
    olderItems: (OrderItem & {
      _realIndex: number;
      _isPast: boolean;
      _olderDateKey: string;
      _isYesterdayRel: boolean;
    })[];
    totalActiveCount: number;
    totalActiveAmountK: number;
  }

  const { allRows, holdingOnlyRows } = useMemo(() => {
    let rows: CartCustomerRow[] = [];
    let holdingList: {
      user: string;
      platform: Platform;
      c: CustomerData;
      pastItems: OrderItem[];
      activePastTuples: { item: OrderItem; originalIndex: number }[];
    }[] = [];

    const now = Date.now();
    const todayKey = getVietnamDateKey(now);
    let targetPrevDayKey = getVietnamDateKey(now - 86400000);
    if (targetDateKey) {
      const [y, m, d] = targetDateKey.split("-").map(Number);
      const targetD = new Date(y, m - 1, d);
      targetPrevDayKey = getVietnamDateKey(targetD.getTime() - 86400000);
    }

    (["tiktok", "facebook", "shopee"] as Platform[]).forEach((p) => {
      if (filterPlatform && p !== filterPlatform) return;
      const custs = store[p].customers;
      Object.keys(custs).forEach((rawUser) => {
        const user = normalizeUser(rawUser);
        const cust = custs[rawUser];
        if (!cust) return;

        const activeInsight = getCustomerInsight(user);
        const latestUnrestoredPush = (cust.pushHistory || []).find(
          (h: any) => h.status !== "restored",
        );
        const latestPushTime = latestUnrestoredPush?.timestamp || 0;
        const pushDayVNStr =
          latestPushTime > 0 ? getVietnamDateKey(latestPushTime) : "";

        const orders =
          activeInsight?.ordersHistory ||
          (activeInsight?.latestOrder ? [activeInsight.latestOrder] : []);
        const latestPancakeOrder = orders[0] || null;
        const latestPancakeTime = latestPancakeOrder
          ? parseOrderTimestamp(
              latestPancakeOrder.insertedAt ||
                latestPancakeOrder.updatedAt ||
                "",
            )
          : 0;
        const pancakeDayVNStr =
          latestPancakeTime > 0 ? getVietnamDateKey(latestPancakeTime) : "";

        const isActiveItem = (it: OrderItem) => {
          if (it.shipped || isGhostZeroPriceItem(it)) return false;
          const itTime = getItemTimestamp(it, cust.lastTime);
          if (!itTime) return false;
          const itDayKey = getVietnamDateKey(itTime);

          // Nếu ngày lịch sử đẩy đơn >= ngày chốt thì tự động coi như đã đẩy
          if (latestPushTime > 0) {
            if (pushDayVNStr && itDayKey && pushDayVNStr >= itDayKey)
              return false;
            if (itTime <= latestPushTime + 60000) return false;
          }
          // Nếu Pancake POS có đơn >= ngày chốt
          if (latestPancakeTime > 0) {
            if (pancakeDayVNStr && itDayKey && pancakeDayVNStr >= itDayKey)
              return false;
            if (itTime <= latestPancakeTime + 120000) return false;
          }
          return true;
        };

        const currentActive = (cust.items || [])
          .map((it, idx) => ({ ...it, _realIndex: idx, _isPast: false }))
          .filter(isActiveItem);

        const pastActive = (cust.pastItems || [])
          .map((it, idx) => ({ ...it, _realIndex: idx, _isPast: true }))
          .filter(isActiveItem);

        let allCustomerActive = [...currentActive, ...pastActive];

        if (dateFilter === "10days") {
          allCustomerActive = allCustomerActive.filter(
            (it) => getItemTimestamp(it, cust.lastTime) >= now - 10 * 86400000,
          );
        }

        if (allCustomerActive.length === 0) return;

        let primaryItems: (OrderItem & {
          _realIndex: number;
          _isPast: boolean;
        })[] = [];
        let olderItems: (OrderItem & {
          _realIndex: number;
          _isPast: boolean;
          _olderDateKey: string;
          _isYesterdayRel: boolean;
        })[] = [];

        if (targetDateKey) {
          primaryItems = allCustomerActive.filter((it) => {
            const itKey = getVietnamDateKey(
              getItemTimestamp(it, cust.lastTime),
            );
            return itKey === targetDateKey;
          });
          olderItems = allCustomerActive
            .filter((it) => {
              const itKey = getVietnamDateKey(
                getItemTimestamp(it, cust.lastTime),
              );
              return itKey < targetDateKey;
            })
            .map((it) => {
              const itKey = getVietnamDateKey(
                getItemTimestamp(it, cust.lastTime),
              );
              return {
                ...it,
                _olderDateKey: itKey,
                _isYesterdayRel: itKey === targetPrevDayKey,
              };
            });
        } else {
          // dateFilter === 'all' hoặc '10days'
          const todayItems = allCustomerActive.filter((it) => {
            const itKey = getVietnamDateKey(
              getItemTimestamp(it, cust.lastTime),
            );
            return itKey === todayKey;
          });
          if (todayItems.length > 0) {
            primaryItems = todayItems;
            olderItems = allCustomerActive
              .filter(
                (it) =>
                  getVietnamDateKey(getItemTimestamp(it, cust.lastTime)) <
                  todayKey,
              )
              .map((it) => {
                const itKey = getVietnamDateKey(
                  getItemTimestamp(it, cust.lastTime),
                );
                return {
                  ...it,
                  _olderDateKey: itKey,
                  _isYesterdayRel: itKey === targetPrevDayKey,
                };
              });
          } else {
            primaryItems = allCustomerActive;
            olderItems = [];
          }
        }

        const totalActiveCount =
          primaryItems.reduce((s, it) => s + (it.quantity || 1), 0) +
          olderItems.reduce((s, it) => s + (it.quantity || 1), 0);
        const totalActiveAmountK = [...primaryItems, ...olderItems].reduce(
          (s, it) => s + (it.price || 0),
          0,
        );

        // Áp dụng bộ lọc Số Lượng & Giữ Lâu (quantityFilter)
        if (quantityFilter === "holding_1_2_old") {
          // Khách có hàng 1-2 cái quá lâu (> 2 ngày hoặc ở đơn cũ)
          const hasOldItem =
            olderItems.length > 0 ||
            allCustomerActive.some(
              (it) => getItemTimestamp(it, cust.lastTime) <= now - 2 * 86400000,
            );
          if (!(totalActiveCount >= 1 && totalActiveCount <= 2 && hasOldItem))
            return;
        } else if (quantityFilter === "holding_old_3days") {
          const hasOld3d = allCustomerActive.some(
            (it) => getItemTimestamp(it, cust.lastTime) <= now - 3 * 86400000,
          );
          if (!hasOld3d) return;
        } else if (quantityFilter === "holding_old_5days") {
          const hasOld5d = allCustomerActive.some(
            (it) => getItemTimestamp(it, cust.lastTime) <= now - 5 * 86400000,
          );
          if (!hasOld5d) return;
        } else if (quantityFilter === "qty_1") {
          if (totalActiveCount !== 1) return;
        } else if (quantityFilter === "qty_2") {
          if (totalActiveCount !== 2) return;
        } else if (quantityFilter === "qty_1_2") {
          if (totalActiveCount < 1 || totalActiveCount > 2) return;
        } else if (quantityFilter === "qty_3_plus") {
          if (totalActiveCount < 3) return;
        }

        if (primaryItems.length > 0) {
          const curQty = primaryItems.reduce(
            (s, it) => s + (it.quantity || 1),
            0,
          );
          const curTotal = primaryItems.reduce(
            (s, it) => s + (it.price || 0),
            0,
          );
          rows.push({
            user,
            platform: p,
            c: {
              ...cust,
              count: curQty,
              total: curTotal,
              items: primaryItems,
            },
            displayItems: primaryItems,
            olderItems,
            totalActiveCount,
            totalActiveAmountK,
          });
        } else if (olderItems.length > 0) {
          // Khách không có món mới trong ngày đang chọn, nhưng còn giữ đơn cũ
          const activeTuples = olderItems.map((it) => ({
            item: it,
            originalIndex: it._realIndex,
          }));
          holdingList.push({
            user,
            platform: p,
            c: cust,
            pastItems: olderItems,
            activePastTuples: activeTuples,
          });
        }
      });
    });

    // Tìm kiếm
    if (effectiveListSearch) {
      const query = effectiveListSearch;
      const queryNoAccent = removeVietnameseAccents(query);
      const isIdQuery = query.startsWith("#") || /^\d+$/.test(query);
      const targetId = query.startsWith("#") ? query.slice(1) : query;

      const matchesSearch = (r: {
        user: string;
        platform: Platform;
        displayItems?: any[];
        pastItems?: any[];
      }) => {
        const userTag = store[r.platform].tags[r.user];
        if (query === "/coc" && userTag === "COC") return true;
        if (query === "/quen" && userTag === "VIP") return true;
        if (query === "/vip" && userTag === "VIP") return true;
        if (query === "/dao" && userTag === "DAO") return true;
        if (query === "/chan" && userTag === "CHAN") return true;
        if (query.startsWith("/")) return false;

        const nick = store[r.platform].nicknames?.[r.user] || "";
        const shortId = getShortId(r.user).toLowerCase();
        if (isIdQuery) {
          return shortId === targetId || "#" + shortId === query;
        }
        const userLower = r.user.toLowerCase();
        const userNoAccent = removeVietnameseAccents(userLower);
        const nickLower = nick.toLowerCase();
        const nickNoAccent = removeVietnameseAccents(nickLower);
        if (
          userLower.includes(query) ||
          userNoAccent.includes(queryNoAccent) ||
          nickLower.includes(query) ||
          nickNoAccent.includes(queryNoAccent)
        ) {
          return true;
        }
        const allItems = [...(r.displayItems || []), ...(r.pastItems || [])];
        return allItems.some((it) => {
          const cStr = (it.content || "").toLowerCase();
          return (
            cStr.includes(query) ||
            removeVietnameseAccents(cStr).includes(queryNoAccent)
          );
        });
      };

      rows = rows.filter(matchesSearch);
      holdingList = holdingList.filter(matchesSearch);
    }

    // Sắp xếp
    if (sortBy === "newest") {
      rows.sort((a, b) => b.c.lastTime - a.c.lastTime);
    } else if (sortBy === "count") {
      rows.sort((a, b) => {
        if (b.totalActiveCount !== a.totalActiveCount)
          return b.totalActiveCount - a.totalActiveCount;
        return b.c.lastTime - a.c.lastTime;
      });
    } else {
      rows.sort((a, b) => {
        if (b.totalActiveAmountK !== a.totalActiveAmountK)
          return b.totalActiveAmountK - a.totalActiveAmountK;
        return b.c.lastTime - a.c.lastTime;
      });
    }

    return { allRows: rows, holdingOnlyRows: holdingList };
  }, [
    filterPlatform,
    store.tiktok.customers,
    store.facebook.customers,
    store.shopee.customers,
    store.tiktok.tags,
    store.facebook.tags,
    store.shopee.tags,
    store.tiktok.nicknames,
    store.facebook.nicknames,
    store.shopee.nicknames,
    dateFilter,
    customDate,
    quantityFilter,
    effectiveListSearch,
  ]);


  return (
    <div
      className={
        isPage
          ? "h-full w-full flex flex-col bg-[#0e1621]"
          : "fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-2 sm:p-4"
      }
    >
      <div
        className={`w-full ${isPage ? "h-full flex flex-col bg-[#0e1621]" : "bg-[#1c242f] rounded-xl border border-white/10 max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"}`}
      >
        {!isPage && (
          <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0">
            <h3 className="text-lg font-bold text-gray-100 m-0">
              {filterPlatform
                ? `📋 GIỎ HÀNG - ${PLATFORMS[filterPlatform].label}`
                : "📋 GIỎ HÀNG - TỔNG CHUNG"}
            </h3>
            <button
              onClick={onClose}
              className="bg-white/10 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-400 hover:bg-white/20"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1-Row Compact Filter Bar */}
        <div className="px-3 py-2 bg-[#1c242f] border-b border-white/10 shrink-0 flex items-center justify-between gap-1.5 z-20">
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-1 py-0.5">
            {/* 1. Platform Dropdown */}
            <div className="relative shrink-0">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  filterPlatform
                    ? `${PLATFORMS[filterPlatform].bgClass} text-white border-white/20 ring-1 ring-white/20`
                    : "bg-blue-600 border-blue-500 text-white"
                }`}
              >
                <span>
                  {filterPlatform
                    ? PLATFORMS[filterPlatform].label
                    : "🌐 Tất cả"}
                </span>
                <span className="text-[10px] opacity-80 font-mono font-normal">
                  (
                  {filterPlatform
                    ? Object.values(store[filterPlatform].customers).filter(
                        (c: any) => c.count > 0,
                      ).length
                    : allRows.length}
                  )
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={filterPlatform || "all"}
                onChange={(e) =>
                  onSetFilter?.(
                    e.target.value === "all"
                      ? undefined
                      : (e.target.value as Platform),
                  )
                }
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                <option value="all" className="bg-[#1c242f] text-white">
                  🌐 Tất cả sàn ({allRows.length})
                </option>
                {(["tiktok", "facebook", "shopee"] as Platform[]).map((p) => {
                  const count = Object.values(store[p].customers).filter(
                    (c: any) => c.count > 0,
                  ).length;
                  return (
                    <option
                      key={p}
                      value={p}
                      className="bg-[#1c242f] text-white"
                    >
                      {PLATFORMS[p].label} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Date Filter Dropdown */}
            <div className="relative shrink-0 flex items-center gap-1">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  dateFilter !== "all"
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "bg-[#0e1621] border-white/10 text-gray-300"
                }`}
              >
                <Calendar
                  size={12}
                  className={
                    dateFilter !== "all" ? "text-white" : "text-blue-400"
                  }
                />
                <span>
                  {currentSelectedOption?.label ||
                    (dateFilter === "custom"
                      ? `🗓️ ${customDate || "Ngày"}`
                      : "Ngày")}
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={dateFilter}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setDateFilter(val);
                  if (val !== "custom") setCustomDate("");
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                {dateOptions.map((opt) => (
                  <option
                    key={opt.id}
                    value={opt.id}
                    className="bg-[#1c242f] text-white"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
              {dateFilter === "custom" && (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-2 py-1 rounded-md text-[11px] bg-[#0e1621] border border-blue-500 ring-1 ring-blue-500 text-white cursor-pointer"
                  />
                  {customDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomDate("");
                        setDateFilter("today");
                      }}
                      className="text-gray-400 hover:text-white text-xs px-1"
                      title="Xóa lọc ngày"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. Quantity & Aging Filter Dropdown */}
            <div className="relative shrink-0">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  quantityFilter !== "all"
                    ? "bg-amber-600 border-amber-500 text-white shadow-sm"
                    : "bg-[#0e1621] border-white/10 text-gray-300"
                }`}
              >
                <span>
                  {quantityFilter === "all"
                    ? "📦 SL: Tất cả"
                    : quantityFilter === "holding_1_2_old"
                      ? "⚠️ Giữ 1-2 món lâu"
                      : quantityFilter === "holding_old_3days"
                        ? "⏳ Giữ lâu > 3 ngày"
                        : quantityFilter === "holding_old_5days"
                          ? "⏳ Giữ lâu > 5 ngày"
                          : quantityFilter === "qty_1"
                            ? "1️⃣ Đơn 1 món"
                            : quantityFilter === "qty_2"
                              ? "2️⃣ Đơn 2 món"
                              : quantityFilter === "qty_1_2"
                                ? "📦 1 - 2 món"
                                : "🛍️ 3 món trở lên"}
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={quantityFilter}
                onChange={(e) => setQuantityFilter(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                <option value="all" className="bg-[#1c242f] text-white">
                  📦 Số lượng: Tất cả
                </option>
                <option
                  value="holding_1_2_old"
                  className="bg-[#1c242f] text-amber-300 font-bold"
                >
                  ⚠️ Giữ 1-2 món quá lâu (&gt; 2 ngày)
                </option>
                <option
                  value="holding_old_3days"
                  className="bg-[#1c242f] text-amber-300"
                >
                  ⏳ Giữ đơn lâu (&gt; 3 ngày)
                </option>
                <option
                  value="holding_old_5days"
                  className="bg-[#1c242f] text-amber-300"
                >
                  ⏳ Giữ đơn rất lâu (&gt; 5 ngày)
                </option>
                <option value="qty_1" className="bg-[#1c242f] text-white">
                  1️⃣ Khách có đúng 1 món
                </option>
                <option value="qty_2" className="bg-[#1c242f] text-white">
                  2️⃣ Khách có đúng 2 món
                </option>
                <option value="qty_1_2" className="bg-[#1c242f] text-white">
                  📦 Khách có 1 đến 2 món
                </option>
                <option value="qty_3_plus" className="bg-[#1c242f] text-white">
                  🛍️ Khách có từ 3 món trở lên
                </option>
              </select>
            </div>

            {/* 4. Sort Dropdown */}
            <div className="relative shrink-0">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  sortBy !== "newest"
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-[#0e1621] border-white/10 text-gray-300"
                }`}
              >
                <span>
                  {sortBy === "newest"
                    ? "🕒 Mới nhất"
                    : sortBy === "count"
                      ? "📦 Số lượng"
                      : "💰 Doanh thu"}
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                <option value="newest" className="bg-[#1c242f] text-white">
                  🕒 Mới nhất
                </option>
                <option value="count" className="bg-[#1c242f] text-white">
                  📦 Số lượng nhiều
                </option>
                <option value="revenue" className="bg-[#1c242f] text-white">
                  💰 Doanh thu cao
                </option>
              </select>
            </div>
          </div>

          {/* View Mode Toggle: List vs Grid */}
          <div className="flex items-center bg-[#0e1621] p-0.5 rounded-lg border border-white/10 shrink-0 shadow-inner ml-1">
            <button
              type="button"
              onClick={() => handleSetViewMode("list")}
              className={`p-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                viewMode === "list"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Xem dạng danh sách"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode("grid")}
              className={`p-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                viewMode === "grid"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-1 ring-white/20"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>


        {/* Thanh kết quả tìm kiếm trực tiếp trên trang Giỏ hàng */}
        {effectiveListSearch && (
          <div className="bg-blue-950/80 border-b border-blue-500/40 px-3 py-1.5 flex items-center justify-between text-xs text-blue-200 shrink-0">
            <span className="flex items-center gap-1.5 font-bold truncate">
              <span>🛒</span>
              <span>
                Tìm thấy{" "}
                <strong className="text-white font-black text-sm">
                  {allRows.length}
                </strong>{" "}
                giỏ hàng khớp "{effectiveListSearch}"
              </span>
            </span>
            <span className="text-[10px] text-blue-300 font-medium px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-500/30 shrink-0">
              Đang lọc giỏ hàng
            </span>
          </div>
        )}

        <div
          className="overflow-y-auto flex-1 p-2 sm:p-4 bg-[#0e1621] pb-24"
          onScroll={handleScroll}
        >
          {allRows.length === 0 ? (
            <div className="text-center text-gray-400 py-16 bg-[#1c242f]/50 rounded-2xl border border-dashed border-white/10">
              <div className="text-3xl mb-2">
                {effectiveListSearch ? "🔍" : "🛒"}
              </div>
              <div className="text-sm font-bold text-white">
                {effectiveListSearch
                  ? `Không tìm thấy giỏ hàng nào khớp với "${effectiveListSearch}"`
                  : "Chưa có đơn chốt nào trong phiên này"}
              </div>
              {effectiveListSearch && (
                <div className="text-xs text-gray-400 mt-1">
                  Thử tìm theo tên khách, biệt danh, mã #id hoặc tên món đã chốt
                  trong giỏ
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {allRows.map((row, idx) => {
                const hasOldItems = Boolean(
                  row.olderItems && row.olderItems.length > 0,
                );
                return (
                  <div
                    key={`order-${row.platform}-${row.user}-${idx}`}
                    className="mb-3 p-3 rounded-2xl shadow-sm transition-all bg-[#1c242f] border border-white/5 hover:border-white/15"
                  >
                    <div className="flex justify-between items-start mb-2.5 pb-2 border-b border-white/10 gap-2">
                      <div className="flex-1 flex items-start gap-3 min-w-0 pr-1">
                        {(() => {
                          const tag =
                            store[row.platform].tags[row.user] || "NORMAL";
                          const avatarUrl =
                            getCustomerAvatar(row.user, row.platform) ||
                            undefined;
                          return (
                            <>
                              <CustomerAvatar
                                user={row.user}
                                platform={row.platform}
                                avatarUrl={avatarUrl}
                                tag={tag}
                                size="md"
                                onClick={() =>
                                  onOpenProfile?.(row.user, row.platform)
                                }
                              />
                              <div className="min-w-0 flex-1">
                                {/* Hàng 1: Tên khách ngang hàng với nút SP / Doanh thu */}
                                <div className="flex items-center gap-1.5 flex-wrap min-h-[26px]">
                                  {(() => {
                                    const cleanRowUser = normalizeUser(row.user);
                                    const rowNickname = store[row.platform].nicknames?.[cleanRowUser] || store[row.platform].nicknames?.[row.user];
                                    const copyLabel = rowNickname ? `(${rowNickname}) #${getShortId(row.user)} ${row.user}` : `#${getShortId(row.user)} ${row.user}`;
                                    return (
                                      <>
                                        <button
                                          onClick={() =>
                                            onOpenProfile?.(row.user, row.platform)
                                          }
                                          className="font-black text-white hover:text-blue-400 hover:underline cursor-pointer text-base sm:text-lg bg-transparent p-0 border-0 text-left break-words leading-tight inline-flex items-center gap-1 flex-wrap"
                                          title={rowNickname ? `Khách: ${row.user} (Tên gợi nhớ: ${rowNickname})` : "Bấm để xem hồ sơ"}
                                        >
                                          {rowNickname && (
                                            <span className="text-amber-300 font-black text-sm sm:text-base mr-0.5">
                                              ({rowNickname})
                                            </span>
                                          )}
                                          <span>#{getShortId(row.user)} {row.user}</span>
                                        </button>
                                        <CopyButton
                                          text={copyLabel}
                                          className="text-xs shrink-0 text-gray-400"
                                        />
                                      </>
                                    );
                                  })()}
                                  {isCustomerGheLay(
                                    store[row.platform].gheLayTags,
                                    row.user,
                                    store[row.platform].tags,
                                  ) ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shrink-0 inline-flex items-center gap-1">
                                      <span>🛵</span>
                                      <span>Ghé lấy</span>
                                    </span>
                                  ) : isCustomerNinhThuan(store[row.platform].ninhThuanTags, row.user) ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-1">
                                      <ThapChamIcon className="w-2.5 h-2.5" />
                                      <span>Ninh Thuận</span>
                                    </span>
                                  ) : null}
                                  {(() => {
                                    const ins = getCustomerInsight(row.user);
                                    if (ins && !ins.isReturningCustomer) {
                                      return (
                                        <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                          🆕 Mới
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>

                                {/* Hàng 2: Nút Pancake/Zalo link & Nút Thêm món */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                  {(() => {
                                    const pLink =
                                      store[row.platform].pancakeLinks?.[
                                        row.user
                                      ];
                                    const detectedPhone = row.c.items
                                      ?.map((it) => it.content)
                                      .find((content) => {
                                        if (!content) return false;
                                        const match = content.match(
                                          /(0[3|5|7|8|9][0-9]{8})/,
                                        );
                                        return match ? match[1] : null;
                                      });
                                    if (pLink) {
                                      return (
                                        <div className="relative inline-flex items-center shrink-0">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openPancakeApp(pLink, true);
                                            }}
                                            title="🥞 Đã nối Zalo/Pancake (Bấm mở chat ngay)"
                                            className="px-2 py-0.5 rounded-md text-[11px] bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center gap-0.5 transition-all cursor-pointer shadow-sm active:scale-95 border border-orange-400/40"
                                          >
                                            <span>🥞</span>
                                            <span>Zalo</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onOpenPancakeLink?.(
                                                row.user,
                                                row.platform,
                                                detectedPhone || undefined,
                                              );
                                            }}
                                            title="Đổi hoặc gán lại Zalo Pancake"
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#111722] border border-orange-400/60 text-orange-300 hover:text-white flex items-center justify-center text-[9px] shadow cursor-pointer hover:scale-110 transition-transform"
                                          >
                                            <Edit3 size={9} />
                                          </button>
                                        </div>
                                      );
                                    }
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenPancakeLink?.(
                                            row.user,
                                            row.platform,
                                            detectedPhone || undefined,
                                          );
                                        }}
                                        title="🥞 Gán Zalo / Pancake (Chọn khách đang inbox)"
                                        className="px-2 py-0.5 rounded-md text-[11px] bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-0.5 transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
                                      >
                                        <span>🥞+</span>
                                        <span>Gán</span>
                                      </button>
                                    );
                                  })()}

                                  {onOpenPrice && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenPrice(
                                          null,
                                          row.user,
                                          row.platform,
                                        );
                                      }}
                                      title="Thêm món mới vào đơn khách này"
                                      className="text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-600/50 active:scale-90 px-2 py-0.5 rounded-md border border-emerald-500/40 transition-all cursor-pointer inline-flex items-center gap-1 font-bold text-xs shadow-xs shrink-0"
                                    >
                                      <Plus size={12} className="stroke-[3]" />
                                      <span>Thêm món</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Cột phải: Trên là nút [X SP | Yk] (ngang hàng tên khách), dưới là nút [🥞 Đẩy đơn] */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                        <span className="bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[12px] font-black whitespace-nowrap shadow-sm">
                          {row.c.count} SP | {row.c.total}k
                        </span>
                        {(() => {
                          const custKey = getCustKey(row.user, row.platform);
                          const selCurCount =
                            selectedCurrentMap[custKey]?.size || 0;
                          const selPastCount =
                            selectedPastMap[custKey]?.size || 0;
                          const totalSel = selCurCount + selPastCount;

                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePushOrder(row.user, row.platform);
                              }}
                              title={
                                totalSel > 0
                                  ? `Đẩy ${totalSel} món đã chọn lên Pancake`
                                  : `Đẩy toàn bộ đơn lên Pancake`
                              }
                              className="text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-90 px-2.5 py-1 rounded-lg border border-orange-400/50 transition-all cursor-pointer inline-flex items-center gap-1 font-bold text-xs shadow-md shrink-0 whitespace-nowrap"
                            >
                              <span className="text-[12px]">🥞</span>
                              <span>
                                Đẩy đơn{totalSel > 0 ? ` (${totalSel})` : ""}
                              </span>
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {(row.displayItems || []).length === 0 ? (
                        <div className="text-center text-gray-400 text-xs py-1 italic">
                          (Không có chi tiết sản phẩm)
                        </div>
                      ) : viewMode === "grid" ? (
                        <div className="flex flex-wrap gap-2 py-1">
                          {[...row.displayItems]
                            .reverse()
                            .map((item, reversedIdx) => {
                              const itemIdx =
                                row.displayItems.length - 1 - reversedIdx;
                              const itemUnitPrice =
                                item.unitPrice ||
                                (item.quantity && item.price
                                  ? Math.round(item.price / item.quantity)
                                  : item.price);
                              const itemQty = item.quantity || 1;
                              const itemTotalK =
                                item.price || itemUnitPrice * itemQty;

                              const sourceComment = item.sourceCommentId
                                ? store[row.platform].comments?.find(
                                    (c) => c.id === item.sourceCommentId,
                                  )
                                : null;
                              const sourceCommentStr = sourceComment
                                ? typeof sourceComment.content === "object"
                                  ? JSON.stringify(sourceComment.content)
                                  : String(sourceComment.content || "")
                                : "";
                              const rawContent =
                                item.content &&
                                !item.content.includes("(Không ghi chú)")
                                  ? item.content.trim()
                                  : "";
                              const fullCommentContent =
                                sourceCommentStr ||
                                rawContent ||
                                `Sản phẩm #${itemIdx + 1}`;

                              const custKey = getCustKey(row.user, row.platform);
                              const isChecked = item._isPast
                                ? (selectedPastMap[custKey]?.has(
                                    item._realIndex,
                                  ) ?? false)
                                : (selectedCurrentMap[custKey]?.has(
                                    item._realIndex,
                                  ) ?? false);

                              return (
                                <button
                                  key={item.id || `grid-disp-${itemIdx}`}
                                  type="button"
                                  onTouchStart={() =>
                                    startLongPress(
                                      item,
                                      row.user,
                                      row.platform,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onTouchEnd={cancelLongPress}
                                  onTouchMove={cancelLongPress}
                                  onMouseDown={() =>
                                    startLongPress(
                                      item,
                                      row.user,
                                      row.platform,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onMouseUp={cancelLongPress}
                                  onMouseLeave={cancelLongPress}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    cancelLongPress();
                                    setContextMenuItem({
                                      item,
                                      user: row.user,
                                      platform: row.platform,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    });
                                  }}
                                  onClick={() => {
                                    if (isLongPressRef.current) {
                                      isLongPressRef.current = false;
                                      return;
                                    }
                                    toggleSelectItem(
                                      row.user,
                                      row.platform,
                                      item._realIndex,
                                      item._isPast,
                                    );
                                  }}
                                  className={`flex-1 basis-[calc(25%-0.5rem)] min-w-[21%] max-w-full relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer active:scale-95 shadow-xs min-h-[56px] select-none ${
                                    isChecked
                                      ? "bg-gradient-to-b from-blue-600 to-indigo-700 text-white border-blue-400 ring-2 ring-blue-400/80 shadow-md shadow-blue-500/20 font-bold"
                                      : item.shipped
                                        ? "bg-[#09101a]/80 text-gray-400 border-white/10 opacity-70"
                                        : "bg-[#131d2b] hover:bg-[#182638] text-gray-200 border-white/10 hover:border-white/20"
                                  }`}
                                  title="Chạm: Chọn đẩy đơn | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                >
                                  {isChecked && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black rounded-full text-[9px] font-black flex items-center justify-center shadow-md">
                                      ✓
                                    </span>
                                  )}
                                  <span className="font-mono font-black text-sm sm:text-base leading-none tracking-tight">
                                    {itemTotalK}k
                                  </span>
                                  {itemQty > 1 && (
                                    <span className="text-[10px] font-bold text-cyan-300 opacity-90 mt-0.5 font-mono">
                                      x{itemQty} ({itemUnitPrice}k)
                                    </span>
                                  )}
                                  <span className="text-[9.5px] truncate max-w-full opacity-80 mt-0.5 font-medium leading-tight px-0.5">
                                    {fullCommentContent}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {[...row.displayItems]
                            .reverse()
                            .map((item, reversedIdx) => {
                              const itemIdx =
                                row.displayItems.length - 1 - reversedIdx;
                              const itemUnitPrice =
                                item.unitPrice ||
                                (item.quantity && item.price
                                  ? Math.round(item.price / item.quantity)
                                  : item.price);
                              const itemQty = item.quantity || 1;
                              const itemTotalK =
                                item.price || itemUnitPrice * itemQty;

                              const sourceComment = item.sourceCommentId
                                ? store[row.platform].comments?.find(
                                    (c) => c.id === item.sourceCommentId,
                                  )
                                : null;
                              const sourceCommentStr = sourceComment
                                ? typeof sourceComment.content === "object"
                                  ? JSON.stringify(sourceComment.content)
                                  : String(sourceComment.content || "")
                                : "";
                              const rawContent =
                                item.content &&
                                !item.content.includes("(Không ghi chú)")
                                  ? item.content.trim()
                                  : "";
                              const fullCommentContent =
                                sourceCommentStr ||
                                rawContent ||
                                `Sản phẩm #${itemIdx + 1}`;

                              const custKey = getCustKey(row.user, row.platform);
                              const isChecked = item._isPast
                                ? (selectedPastMap[custKey]?.has(
                                    item._realIndex,
                                  ) ?? false)
                                : (selectedCurrentMap[custKey]?.has(
                                    item._realIndex,
                                  ) ?? false);

                              return (
                                <div
                                  key={item.id || `disp-${itemIdx}`}
                                  className={`flex justify-between items-center py-1.5 px-2 rounded-xl border gap-1.5 mb-1 transition-all ${
                                    isChecked
                                      ? "bg-blue-950/70 border-blue-500/60 shadow-md ring-1 ring-blue-500/40"
                                      : "bg-[#121c28] border-white/10 hover:border-white/20"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleSelectItem(
                                          row.user,
                                          row.platform,
                                          item._realIndex,
                                          item._isPast,
                                        );
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                      title="Tích chọn món để đẩy đơn"
                                    />
                                    {/* Bấm vào nội dung cmt để mở popup sửa Giá × SL */}
                                    <div
                                      onClick={() =>
                                        setEditingPriceQty({
                                          platform: row.platform,
                                          user: row.user,
                                          itemIndex: item._realIndex,
                                          itemId: item.id,
                                          content: fullCommentContent,
                                          unitPrice: itemUnitPrice,
                                          quantity: itemQty,
                                          isPast: item._isPast,
                                        })
                                      }
                                      className="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer group hover:bg-white/5 py-0.5 px-1 rounded-lg transition-colors select-none"
                                      title="Bấm vào cmt để chỉnh sửa Giá × Số lượng"
                                    >
                                      <span className="font-mono text-xs text-gray-400 font-bold bg-black/40 px-1.5 py-0.5 rounded shrink-0">
                                        #{itemIdx + 1}
                                      </span>
                                      <span
                                        className={`font-bold text-xs sm:text-sm truncate transition-colors flex-1 min-w-0 ${isChecked ? "text-blue-200 font-black" : "text-gray-100 group-hover:text-cyan-300"}`}
                                      >
                                        {fullCommentContent}
                                      </span>
                                      {itemQty >= 2 && (
                                        <span className="text-cyan-300 font-mono font-bold text-xs shrink-0 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                                          ({itemUnitPrice}k)
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Phía sau: Tổng tiền + Nút +1 + Nút In + Nút Xóa */}
                                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                    <PriceIncrementButton
                                      priceK={itemTotalK}
                                      quantity={itemQty}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        store.duplicateOrderItem(
                                          row.platform,
                                          row.user,
                                          item._realIndex,
                                          item._isPast,
                                          item.id,
                                        );
                                        if (
                                          typeof navigator !== "undefined" &&
                                          navigator.vibrate
                                        ) {
                                          try {
                                            navigator.vibrate(15);
                                          } catch {}
                                        }
                                      }}
                                      className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/40 active:scale-95 rounded-lg px-2 py-0.5 font-black text-xs whitespace-nowrap shadow-sm transition-all cursor-pointer"
                                      title="Nhân bản thêm 1 món giống nội dung cmt này (SL 1)"
                                    >
                                      +1
                                    </button>
                                    <button
                                      onClick={() => {
                                        let time = new Date().toLocaleTimeString(
                                          "vi-VN",
                                          { hour: "2-digit", minute: "2-digit" },
                                        );
                                        const cleanPrintContent = `${fullCommentContent} (${itemUnitPrice}k x ${itemQty})`;
                                        printLabel(
                                          store[row.platform].nicknames?.[
                                            row.user
                                          ]
                                            ? `(${store[row.platform].nicknames[row.user]}) ${row.user}`
                                            : `#${getShortId(row.user)} ${row.user}`,
                                          cleanPrintContent,
                                          itemTotalK,
                                          time,
                                          PLATFORMS[row.platform].label,
                                          true,
                                          isCustomerGheLay(store[row.platform].gheLayTags, row.user, store[row.platform].tags)
                                        );
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg px-2 py-0.5 font-bold text-xs whitespace-nowrap flex items-center gap-0.5 shadow-sm transition-all cursor-pointer"
                                      title="In tem món này"
                                    >
                                      🖨️ IN
                                    </button>
                                    <DeleteConfirmButton
                                      onDelete={() =>
                                        store.deleteOrderItem(
                                          row.platform,
                                          row.user,
                                          item._realIndex,
                                          item._isPast,
                                          item.id,
                                        )
                                      }
                                      className="rounded-lg px-1.5 py-0.5"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* Ở dưới cùng list đơn: Nút xem thêm đơn cũ sau ngày đang chọn */}
                      {(() => {
                        if (!row.olderItems || row.olderItems.length === 0)
                          return null;

                        const custKey = getCustKey(row.user, row.platform);
                        const isPastExpanded = Boolean(
                          expandedPastMap[custKey],
                        );
                        const selOlderCount = row.olderItems.filter((it) =>
                          it._isPast
                            ? (selectedPastMap[custKey]?.has(it._realIndex) ??
                              false)
                            : (selectedCurrentMap[custKey]?.has(
                                it._realIndex,
                              ) ?? false),
                        ).length;

                        return (
                          <div className="pt-2 mt-2 border-t border-white/10">
                            <button
                              type="button"
                              onClick={() =>
                                toggleExpandPast(row.user, row.platform)
                              }
                              className="w-full py-1.5 px-3 rounded-xl bg-[#0e1622] hover:bg-[#142031] text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-sm active:scale-98"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm shrink-0">⏳</span>
                                <span className="truncate">
                                  {isPastExpanded
                                    ? "Ẩn đơn cũ"
                                    : "Xem thêm đơn cũ"}
                                </span>
                                <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded-full text-[10px] font-mono shrink-0 border border-amber-500/30">
                                  {row.olderItems.length} món
                                </span>
                                {selOlderCount > 0 && (
                                  <span className="bg-blue-500/30 text-blue-200 px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 border border-blue-400/40">
                                    Đã chọn {selOlderCount}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-amber-400/90 font-medium shrink-0 flex items-center gap-1">
                                <span>
                                  {isPastExpanded
                                    ? "▲ Thu gọn"
                                    : "▼ Bấm xem thêm"}
                                </span>
                              </div>
                            </button>

                            {isPastExpanded && (
                              <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-amber-500/40 bg-black/25 p-2 rounded-xl animate-fadeIn">
                                <div className="flex items-center justify-between text-[11px] text-gray-400 pb-1 border-b border-white/5">
                                  <span className="font-semibold text-amber-300/90 flex items-center gap-1">
                                    <span>📦</span>
                                    <span>Đơn cũ trước ngày đang chọn:</span>
                                  </span>
                                  <label className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={
                                        selOlderCount ===
                                          row.olderItems.length &&
                                        row.olderItems.length > 0
                                      }
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        row.olderItems.forEach((it) => {
                                          if (it._isPast) {
                                            setSelectedPastMap((prev) => {
                                              const s = new Set(
                                                prev[custKey] || [],
                                              );
                                              if (checked) s.add(it._realIndex);
                                              else s.delete(it._realIndex);
                                              return { ...prev, [custKey]: s };
                                            });
                                          } else {
                                            setSelectedCurrentMap((prev) => {
                                              const s = new Set(
                                                prev[custKey] || [],
                                              );
                                              if (checked) s.add(it._realIndex);
                                              else s.delete(it._realIndex);
                                              return { ...prev, [custKey]: s };
                                            });
                                          }
                                        });
                                      }}
                                      className="rounded border-white/20 w-3 h-3 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span>
                                      Chọn tất cả ({row.olderItems.length})
                                    </span>
                                  </label>
                                </div>

                                {viewMode === "grid" ? (
                                  <div className="flex flex-wrap gap-2 py-1">
                                    {row.olderItems.map((pItem, pSeqIdx) => {
                                      const isPastChecked = pItem._isPast
                                        ? (selectedPastMap[custKey]?.has(
                                            pItem._realIndex,
                                          ) ?? false)
                                        : (selectedCurrentMap[custKey]?.has(
                                            pItem._realIndex,
                                          ) ?? false);
                                      const pUnitPrice =
                                        pItem.unitPrice ||
                                        (pItem.quantity && pItem.price
                                          ? Math.round(
                                              pItem.price / pItem.quantity,
                                            )
                                          : pItem.price);
                                      const pQty = pItem.quantity || 1;
                                      const pTotalK =
                                        pItem.price || pUnitPrice * pQty;
                                      const pContent =
                                        pItem.content &&
                                        !pItem.content.includes("(Không ghi chú)")
                                          ? pItem.content.trim()
                                          : "Món cũ #" + (pSeqIdx + 1);
                                      const dateBadgeText = pItem._isYesterdayRel
                                        ? "Hôm qua"
                                        : "Ngày " +
                                          formatVietnamDateLabel(
                                            pItem._olderDateKey,
                                          );

                                      return (
                                        <button
                                          key={
                                            pItem.id || `grid-older-${pSeqIdx}`
                                          }
                                          type="button"
                                          onTouchStart={() =>
                                            startLongPress(
                                              pItem,
                                              row.user,
                                              row.platform,
                                              pContent,
                                              pUnitPrice,
                                              pQty,
                                              pTotalK,
                                            )
                                          }
                                          onTouchEnd={cancelLongPress}
                                          onTouchMove={cancelLongPress}
                                          onMouseDown={() =>
                                            startLongPress(
                                              pItem,
                                              row.user,
                                              row.platform,
                                              pContent,
                                              pUnitPrice,
                                              pQty,
                                              pTotalK,
                                            )
                                          }
                                          onMouseUp={cancelLongPress}
                                          onMouseLeave={cancelLongPress}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            cancelLongPress();
                                            setContextMenuItem({
                                              item: pItem,
                                              user: row.user,
                                              platform: row.platform,
                                              fullCommentContent: pContent,
                                              itemUnitPrice: pUnitPrice,
                                              itemQty: pQty,
                                              itemTotalK: pTotalK,
                                            });
                                          }}
                                          onClick={() => {
                                            if (isLongPressRef.current) {
                                              isLongPressRef.current = false;
                                              return;
                                            }
                                            toggleSelectItem(
                                              row.user,
                                              row.platform,
                                              pItem._realIndex,
                                              pItem._isPast,
                                            );
                                          }}
                                          className={`flex-1 basis-[calc(25%-0.5rem)] min-w-[21%] max-w-full relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer active:scale-95 shadow-xs min-h-[56px] select-none ${
                                            isPastChecked
                                              ? "bg-gradient-to-b from-blue-600 to-indigo-700 text-white border-blue-400 ring-2 ring-blue-400/80 shadow-md shadow-blue-500/20 font-bold"
                                              : "bg-[#181115] hover:bg-[#20171d] text-gray-200 border-red-500/30 hover:border-red-500/50"
                                          }`}
                                          title="Chạm: Chọn đẩy đơn | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                        >
                                          {isPastChecked && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black rounded-full text-[9px] font-black flex items-center justify-center shadow-md">
                                              ✓
                                            </span>
                                          )}
                                          <span className="text-[9px] font-mono text-amber-300 font-bold leading-none">
                                            {dateBadgeText}
                                          </span>
                                          <span className="font-mono font-black text-sm sm:text-base leading-none tracking-tight mt-0.5">
                                            {pTotalK}k
                                          </span>
                                          {pQty > 1 && (
                                            <span className="text-[10px] font-bold text-cyan-300 opacity-90 mt-0.5 font-mono">
                                              x{pQty} ({pUnitPrice}k)
                                            </span>
                                          )}
                                          <span className="text-[9.5px] truncate max-w-full opacity-80 mt-0.5 font-medium leading-tight px-0.5">
                                            {pContent}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    {row.olderItems.map((pItem, pSeqIdx) => {
                                      const isPastChecked = pItem._isPast
                                        ? (selectedPastMap[custKey]?.has(
                                            pItem._realIndex,
                                          ) ?? false)
                                        : (selectedCurrentMap[custKey]?.has(
                                            pItem._realIndex,
                                          ) ?? false);
                                      const pUnitPrice =
                                        pItem.unitPrice ||
                                        (pItem.quantity && pItem.price
                                          ? Math.round(
                                              pItem.price / pItem.quantity,
                                            )
                                          : pItem.price);
                                      const pQty = pItem.quantity || 1;
                                      const pTotalK =
                                        pItem.price || pUnitPrice * pQty;
                                      const pContent =
                                        pItem.content &&
                                        !pItem.content.includes("(Không ghi chú)")
                                          ? pItem.content.trim()
                                          : "Món cũ #" + (pSeqIdx + 1);
                                      const dateBadgeText = pItem._isYesterdayRel
                                        ? "Hôm qua"
                                        : "Ngày " +
                                          formatVietnamDateLabel(
                                            pItem._olderDateKey,
                                          );

                                      return (
                                        <div
                                          key={
                                            pItem.id || "older-item-" + pSeqIdx
                                          }
                                          className={
                                            "flex justify-between items-center py-1.5 px-2 rounded-lg border gap-2 text-xs transition-colors " +
                                            (isPastChecked
                                              ? "bg-blue-950/70 border-blue-500/50 shadow-md ring-1 ring-blue-500/30"
                                              : "bg-[#181115] border-red-500/30 hover:border-red-500/50")
                                          }
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <input
                                              type="checkbox"
                                              checked={isPastChecked}
                                              onChange={() =>
                                                toggleSelectItem(
                                                  row.user,
                                                  row.platform,
                                                  pItem._realIndex,
                                                  pItem._isPast,
                                                )
                                              }
                                              className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                            />
                                            <span
                                              className={
                                                "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 border " +
                                                (pItem._isYesterdayRel
                                                  ? "bg-amber-950/70 text-amber-300 border-amber-500/40"
                                                  : "bg-purple-950/70 text-purple-300 border-purple-500/40")
                                              }
                                            >
                                              {dateBadgeText}
                                            </span>
                                            <span className="font-mono text-[9px] text-gray-400 font-bold bg-black/40 px-1 py-0.2 rounded shrink-0">
                                              #{pSeqIdx + 1}
                                            </span>
                                            <span
                                              className={
                                                "font-semibold truncate flex-1 min-w-0 " +
                                                (isPastChecked
                                                  ? "text-blue-200"
                                                  : "text-gray-300")
                                              }
                                            >
                                              {pContent}
                                            </span>
                                            {pQty >= 2 && (
                                              <span className="text-cyan-300 font-mono text-[11px] shrink-0">
                                                ({pUnitPrice}k)
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <PriceIncrementButton
                                              priceK={pTotalK}
                                              quantity={pQty}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                store.duplicateOrderItem(
                                                  row.platform,
                                                  row.user,
                                                  pItem._realIndex,
                                                  pItem._isPast,
                                                  pItem.id,
                                                );
                                                if (
                                                  typeof navigator !==
                                                    "undefined" &&
                                                  navigator.vibrate
                                                ) {
                                                  try {
                                                    navigator.vibrate(15);
                                                  } catch {}
                                                }
                                              }}
                                              className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 active:scale-95 rounded px-1.5 py-0.5 font-black text-[10px] whitespace-nowrap cursor-pointer"
                                              title="Nhân bản thêm 1 món giống nội dung này (SL 1)"
                                            >
                                              +1
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ở dưới cùng list đơn: Nút kiểm tra giỏ hàng cũ đang giữ */}
          <div className="mt-4 pt-4 border-t border-white/10">
            {!hasCheckedHolding ? (
              <button
                type="button"
                onClick={() => {
                  setIsCheckingHolding(true);
                  setTimeout(() => {
                    setIsCheckingHolding(false);
                    setHasCheckedHolding(true);
                    if (holdingOnlyRows.length > 0) {
                      setShowHoldingOnlySection(true);
                    }
                  }, 300);
                }}
                disabled={isCheckingHolding}
                className="w-full py-2.5 px-4 rounded-2xl bg-[#111a27] hover:bg-[#162335] border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.99]"
              >
                <span className="text-base">
                  {isCheckingHolding ? "⏳" : "🔍"}
                </span>
                <span>
                  {isCheckingHolding
                    ? "Đang kiểm tra giỏ hàng cũ đang giữ..."
                    : "Kiểm tra giỏ hàng cũ đang giữ"}
                </span>
              </button>
            ) : (
              <div>
                {holdingOnlyRows.length > 0 ? (
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowHoldingOnlySection(!showHoldingOnlySection)
                      }
                      className="w-full p-3 rounded-2xl bg-[#111a27] hover:bg-[#162335] border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-between transition-all cursor-pointer shadow-md"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">⏳</span>
                        <span>
                          Phát hiện {holdingOnlyRows.length} khách còn giữ giỏ
                          cũ (
                          {holdingOnlyRows.reduce(
                            (s, r) => s + r.pastItems.length,
                            0,
                          )}{" "}
                          món)
                        </span>
                      </div>
                      <span className="text-[11px] text-amber-400 font-medium">
                        {showHoldingOnlySection
                          ? "▲ Thu gọn"
                          : "▼ Hiện danh sách để chọn thêm"}
                      </span>
                    </button>

                    {showHoldingOnlySection && (
                      <div className="mt-3 space-y-3">
                        {holdingOnlyRows.map((hRow, hIdx) => {
                          const custKey = getCustKey(hRow.user, hRow.platform);
                          const tag =
                            store[hRow.platform].tags[hRow.user] || "NORMAL";
                          const avatarUrl =
                            getCustomerAvatar(hRow.user, hRow.platform) ||
                            undefined;
                          const cleanHUser = normalizeUser(hRow.user);
                          const nickname =
                            store[hRow.platform].nicknames?.[cleanHUser] ||
                            store[hRow.platform].nicknames?.[hRow.user];
                          const displayName = nickname
                            ? `(${nickname}) #${getShortId(hRow.user)} ${hRow.user}`
                            : `#${getShortId(hRow.user)} ${hRow.user}`;
                          const pastCount = hRow.pastItems.length;
                          const pastTotal = hRow.pastItems.reduce(
                            (s, it) => s + (it.price || 0),
                            0,
                          );
                          const selPastCount =
                            selectedPastMap[custKey]?.size || 0;

                          const pLink =
                            store[hRow.platform].pancakeLinks?.[hRow.user];
                          const detectedPhone = hRow.pastItems
                            .map((it) => it.content)
                            .find((content) => {
                              if (!content) return false;
                              const match = content.match(
                                /(0[3|5|7|8|9][0-9]{8})/,
                              );
                              return match ? match[1] : null;
                            });

                          return (
                            <div
                              key={`holding-${custKey}-${hIdx}`}
                              className="mb-3 bg-[#1c242f] p-3 rounded-2xl shadow-sm border border-white/10 hover:border-white/20 transition-all"
                            >
                              {/* Hàng Header khách hàng: Giống hệt thẻ khách ở trên */}
                              <div className="flex justify-between items-start mb-2.5 pb-2 border-b border-white/10 gap-2">
                                <div className="flex-1 flex items-start gap-3 min-w-0 pr-1">
                                  <CustomerAvatar
                                    user={hRow.user}
                                    platform={hRow.platform}
                                    avatarUrl={avatarUrl}
                                    tag={tag}
                                    size="md"
                                    onClick={() =>
                                      onOpenProfile?.(hRow.user, hRow.platform)
                                    }
                                  />
                                  <div className="min-w-0 flex-1">
                                    {/* Hàng 1: Tên khách ngang hàng với nút SP / Doanh thu */}
                                    <div className="flex items-center gap-1.5 flex-wrap min-h-[26px]">
                                      <button
                                        onClick={() =>
                                          onOpenProfile?.(
                                            hRow.user,
                                            hRow.platform,
                                          )
                                        }
                                        className="font-black text-white hover:text-blue-400 hover:underline cursor-pointer text-base sm:text-lg bg-transparent p-0 border-0 text-left break-words leading-tight inline-flex items-center gap-1 flex-wrap"
                                        title={
                                          nickname
                                            ? `Khách: ${hRow.user} (Tên gợi nhớ: ${nickname})`
                                            : "Bấm để xem hồ sơ"
                                        }
                                      >
                                        {nickname && (
                                          <span className="text-amber-300 font-black text-sm sm:text-base mr-0.5">
                                            ({nickname})
                                          </span>
                                        )}
                                        <span>#{getShortId(hRow.user)} {hRow.user}</span>
                                      </button>
                                      <CopyButton
                                        text={displayName}
                                        className="text-xs shrink-0 text-gray-400"
                                      />
                                      <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-sm border border-red-400/50 shrink-0 animate-pulse">
                                        ⏳ Đang giữ {pastCount} đơn cũ
                                      </span>
                                      {(() => {
                                        const ins = getCustomerInsight(
                                          hRow.user,
                                        );
                                        if (ins && !ins.isReturningCustomer) {
                                          return (
                                            <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                              🆕 Mới
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>

                                    {/* Hàng 2: Nút Pancake/Zalo link & Nút Thêm món */}
                                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                      {pLink ? (
                                        <div className="relative inline-flex items-center shrink-0">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openPancakeApp(pLink, true);
                                            }}
                                            title="🥞 Đã nối Zalo/Pancake (Bấm mở chat ngay)"
                                            className="px-2 py-0.5 rounded-md text-[11px] bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center gap-0.5 transition-all cursor-pointer shadow-sm active:scale-95 border border-orange-400/40"
                                          >
                                            <span>🥞</span>
                                            <span>Zalo</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onOpenPancakeLink?.(
                                                hRow.user,
                                                hRow.platform,
                                                detectedPhone || undefined,
                                              );
                                            }}
                                            title="Đổi hoặc gán lại Zalo Pancake"
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#111722] border border-orange-400/60 text-orange-300 hover:text-white flex items-center justify-center text-[9px] shadow cursor-pointer hover:scale-110 transition-transform"
                                          >
                                            <Edit3 size={9} />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenPancakeLink?.(
                                              hRow.user,
                                              hRow.platform,
                                              detectedPhone || undefined,
                                            );
                                          }}
                                          title="🥞 Gán Zalo / Pancake (Chọn khách đang inbox)"
                                          className="px-2 py-0.5 rounded-md text-[11px] bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-0.5 transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
                                        >
                                          <span>🥞+</span>
                                          <span>Gán</span>
                                        </button>
                                      )}

                                      {onOpenPrice && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenPrice(
                                              null,
                                              hRow.user,
                                              hRow.platform,
                                            );
                                          }}
                                          title="Thêm món mới vào đơn khách này"
                                          className="text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-600/50 active:scale-90 px-2 py-0.5 rounded-md border border-emerald-500/40 transition-all cursor-pointer inline-flex items-center gap-1 font-bold text-xs shadow-xs shrink-0"
                                        >
                                          <Plus
                                            size={12}
                                            className="stroke-[3]"
                                          />
                                          <span>Thêm món</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Cột phải: Trên là nút [X SP | Yk] (ngang hàng tên khách), dưới là nút [🥞 Đẩy đơn] */}
                                <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                                  <span className="bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[12px] font-black whitespace-nowrap shadow-sm">
                                    {pastCount} SP | {pastTotal}k
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePushOrder(hRow.user, hRow.platform);
                                    }}
                                    title={
                                      selPastCount > 0
                                        ? `Đẩy ${selPastCount} món đã chọn lên Pancake`
                                        : `Đẩy toàn bộ đơn lên Pancake`
                                    }
                                    className="text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-90 px-2.5 py-1 rounded-lg border border-orange-400/50 transition-all cursor-pointer inline-flex items-center gap-1 font-bold text-xs shadow-md shrink-0 whitespace-nowrap"
                                  >
                                    <span className="text-[12px]">🥞</span>
                                    <span>
                                      Đẩy đơn
                                      {selPastCount > 0
                                        ? ` (${selPastCount})`
                                        : ""}
                                    </span>
                                  </button>
                                </div>
                              </div>

                              {/* Danh sách sản phẩm: Giống hệt hàng sản phẩm ở trên */}
                              <div className="space-y-1.5 pl-1">
                                {viewMode === "grid" ? (
                                  <div className="flex flex-wrap gap-2 py-1">
                                    {hRow.activePastTuples.map(
                                      (
                                        { item: pItem, originalIndex: pRealIdx },
                                        pSeqIdx,
                                      ) => {
                                        const isPastChecked =
                                          selectedPastMap[custKey]?.has(pRealIdx) ??
                                          false;
                                        const pUnitPrice =
                                          pItem.unitPrice ||
                                          (pItem.quantity && pItem.price
                                            ? Math.round(
                                                pItem.price / pItem.quantity,
                                              )
                                            : pItem.price);
                                        const pQty = pItem.quantity || 1;
                                        const pTotalK =
                                          pItem.price || pUnitPrice * pQty;

                                        const sourceComment = pItem.sourceCommentId
                                          ? store[hRow.platform].comments?.find(
                                              (c) => c.id === pItem.sourceCommentId,
                                            )
                                          : null;
                                        const sourceCommentStr = sourceComment
                                          ? typeof sourceComment.content ===
                                            "object"
                                            ? JSON.stringify(sourceComment.content)
                                            : String(sourceComment.content || "")
                                          : "";
                                        const rawContent =
                                          pItem.content &&
                                          !pItem.content.includes("(Không ghi chú)")
                                            ? pItem.content.trim()
                                            : "";
                                        const fullCommentContent =
                                          sourceCommentStr ||
                                          rawContent ||
                                          `Món cũ #${pSeqIdx + 1}`;

                                        return (
                                          <button
                                            key={
                                              pItem.id ||
                                              `grid-h-past-${pRealIdx}`
                                            }
                                            type="button"
                                            onTouchStart={() =>
                                              startLongPress(
                                                pItem,
                                                hRow.user,
                                                hRow.platform,
                                                fullCommentContent,
                                                pUnitPrice,
                                                pQty,
                                                pTotalK,
                                              )
                                            }
                                            onTouchEnd={cancelLongPress}
                                            onTouchMove={cancelLongPress}
                                            onMouseDown={() =>
                                              startLongPress(
                                                pItem,
                                                hRow.user,
                                                hRow.platform,
                                                fullCommentContent,
                                                pUnitPrice,
                                                pQty,
                                                pTotalK,
                                              )
                                            }
                                            onMouseUp={cancelLongPress}
                                            onMouseLeave={cancelLongPress}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              cancelLongPress();
                                              setContextMenuItem({
                                                item: pItem,
                                                user: hRow.user,
                                                platform: hRow.platform,
                                                fullCommentContent,
                                                itemUnitPrice: pUnitPrice,
                                                itemQty: pQty,
                                                itemTotalK: pTotalK,
                                              });
                                            }}
                                            onClick={() => {
                                              if (isLongPressRef.current) {
                                                isLongPressRef.current = false;
                                                return;
                                              }
                                              toggleSelectItem(
                                                hRow.user,
                                                hRow.platform,
                                                pRealIdx,
                                                true,
                                              );
                                            }}
                                            className={`flex-1 basis-[calc(25%-0.5rem)] min-w-[21%] max-w-full relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer active:scale-95 shadow-xs min-h-[56px] select-none ${
                                              isPastChecked
                                                ? "bg-gradient-to-b from-blue-600 to-indigo-700 text-white border-blue-400 ring-2 ring-blue-400/80 shadow-md shadow-blue-500/20 font-bold"
                                                : "bg-[#181115] hover:bg-[#20171d] text-gray-200 border-red-500/30 hover:border-red-500/50"
                                            }`}
                                            title="Chạm: Chọn đẩy đơn | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                          >
                                            {isPastChecked && (
                                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black rounded-full text-[9px] font-black flex items-center justify-center shadow-md">
                                                ✓
                                              </span>
                                            )}
                                            <span className="font-mono font-black text-sm sm:text-base leading-none tracking-tight">
                                              {pTotalK}k
                                            </span>
                                            {pQty > 1 && (
                                              <span className="text-[10px] font-bold text-cyan-300 opacity-90 mt-0.5 font-mono">
                                                x{pQty} ({pUnitPrice}k)
                                              </span>
                                            )}
                                            <span className="text-[9.5px] truncate max-w-full opacity-80 mt-0.5 font-medium leading-tight px-0.5">
                                              {fullCommentContent}
                                            </span>
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {hRow.activePastTuples.map(
                                      (
                                        { item: pItem, originalIndex: pRealIdx },
                                        pSeqIdx,
                                      ) => {
                                        const isPastChecked =
                                          selectedPastMap[custKey]?.has(pRealIdx) ??
                                          false;
                                        const pUnitPrice =
                                          pItem.unitPrice ||
                                          (pItem.quantity && pItem.price
                                            ? Math.round(
                                                pItem.price / pItem.quantity,
                                              )
                                            : pItem.price);
                                        const pQty = pItem.quantity || 1;
                                        const pTotalK =
                                          pItem.price || pUnitPrice * pQty;

                                        const sourceComment = pItem.sourceCommentId
                                          ? store[hRow.platform].comments?.find(
                                              (c) => c.id === pItem.sourceCommentId,
                                            )
                                          : null;
                                        const sourceCommentStr = sourceComment
                                          ? typeof sourceComment.content ===
                                            "object"
                                            ? JSON.stringify(sourceComment.content)
                                            : String(sourceComment.content || "")
                                          : "";
                                        const rawContent =
                                          pItem.content &&
                                          !pItem.content.includes("(Không ghi chú)")
                                            ? pItem.content.trim()
                                            : "";
                                        const fullCommentContent =
                                          sourceCommentStr ||
                                          rawContent ||
                                          `Món cũ #${pSeqIdx + 1}`;

                                        return (
                                          <div
                                            key={pItem.id || `h-past-${pRealIdx}`}
                                            className={`flex justify-between items-center py-1.5 px-2.5 rounded-xl border gap-2 mb-1 transition-all ${
                                              isPastChecked
                                                ? "bg-blue-950/70 border-blue-500/60 shadow-md ring-1 ring-blue-500/40"
                                                : "bg-[#181115] border-red-500/30 hover:border-red-500/50"
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                              <input
                                                type="checkbox"
                                                checked={isPastChecked}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  toggleSelectItem(
                                                    hRow.user,
                                                    hRow.platform,
                                                    pRealIdx,
                                                    true,
                                                  );
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                                title="Tích chọn món để đẩy đơn"
                                              />
                                              <div
                                                onClick={() =>
                                                  setEditingPriceQty({
                                                    platform: hRow.platform,
                                                    user: hRow.user,
                                                    itemIndex: pRealIdx,
                                                    itemId: pItem.id,
                                                    content: fullCommentContent,
                                                    unitPrice: pUnitPrice,
                                                    quantity: pQty,
                                                    isPast: true,
                                                  })
                                                }
                                                className="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer group hover:bg-white/5 py-1 px-1.5 -my-1 -ml-1 rounded-lg transition-colors select-none"
                                                title="Bấm vào cmt để chỉnh sửa Giá × Số lượng"
                                              >
                                                <span className="font-mono text-xs text-amber-400/90 font-bold bg-black/40 px-1.5 py-0.5 rounded shrink-0">
                                                  #{pSeqIdx + 1}
                                                </span>
                                                <span
                                                  className={`font-bold text-xs sm:text-sm truncate transition-colors flex-1 min-w-0 ${isPastChecked ? "text-blue-200 font-black" : "text-gray-100 group-hover:text-cyan-300"}`}
                                                >
                                                  {fullCommentContent}
                                                </span>
                                                {pQty >= 2 && (
                                                  <span className="text-cyan-300 font-mono font-bold text-xs shrink-0 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                                                    ({pUnitPrice}k)
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Phía sau: Giá + Nút +1 + Nút In + Nút Xóa */}
                                            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                              <PriceIncrementButton
                                                priceK={pTotalK}
                                                quantity={pQty}
                                              />

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  store.duplicateOrderItem(
                                                    hRow.platform,
                                                    hRow.user,
                                                    pRealIdx,
                                                    true,
                                                    pItem.id,
                                                  );
                                                  if (
                                                    typeof navigator !==
                                                      "undefined" &&
                                                    navigator.vibrate
                                                  ) {
                                                    try {
                                                      navigator.vibrate(15);
                                                    } catch {}
                                                  }
                                                }}
                                                className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 active:scale-95 rounded-md px-2 py-0.5 font-black text-xs whitespace-nowrap cursor-pointer shadow-sm transition-all"
                                                title="Nhân bản thêm 1 món giống nội dung này (SL 1)"
                                              >
                                                +1
                                              </button>

                                              <button
                                                onClick={() => {
                                                  let time =
                                                    new Date().toLocaleTimeString(
                                                      "vi-VN",
                                                      {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                      },
                                                    );
                                                  const cleanPrintContent = `${fullCommentContent} (${pUnitPrice}k x ${pQty})`;
                                                  printLabel(
                                                    store[hRow.platform]
                                                      .nicknames?.[hRow.user]
                                                      ? `(${store[hRow.platform].nicknames[hRow.user]}) ${hRow.user}`
                                                      : `#${getShortId(hRow.user)} ${hRow.user}`,
                                                    cleanPrintContent,
                                                    pTotalK,
                                                    time,
                                                    PLATFORMS[hRow.platform].label,
                                                    true,
                                                    isCustomerGheLay(store[hRow.platform].gheLayTags, hRow.user, store[hRow.platform].tags)
                                                  );
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-md px-2 py-0.5 font-bold text-xs whitespace-nowrap flex items-center gap-0.5 shadow-sm transition-all cursor-pointer"
                                                title="In tem món này"
                                              >
                                                🖨️ IN
                                              </button>

                                              <DeleteConfirmButton
                                                onDelete={() =>
                                                  store.deleteOrderItem(
                                                    hRow.platform,
                                                    hRow.user,
                                                    pRealIdx,
                                                    true,
                                                  )
                                                }
                                                className="rounded-md px-1.5 py-0.5 text-xs"
                                              />
                                            </div>
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/25 border border-emerald-500/20 text-emerald-300 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span>✓</span>
                      <span>
                        Đã kiểm tra: Không có đơn cũ nào đang giữ (đơn cũ đã đi
                        hết trên Pancake)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setHasCheckedHolding(false)}
                      className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                    >
                      Kiểm tra lại
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 🌟 THANH MINI TỔNG SỐ CÁI VÀ TỔNG TIỀN ĐÃ CHỌN Ở GIỎ HÀNG */}
          {(() => {
            let globalSelectedQty = 0;
            let globalSelectedTotalK = 0;
            let activeUser = "";
            let activePlatform: Platform = "tiktok";

            Object.entries(selectedCurrentMap).forEach(([key, set]) => {
              if (!set || set.size === 0) return;
              const parts = key.split("_");
              const plat = parts[0] as Platform;
              const u = parts.slice(1).join("_");
              if (!activeUser) {
                activeUser = u;
                activePlatform = plat;
              }
              const cust = store[plat]?.customers?.[u];
              const items = cust?.items || [];
              set.forEach((idx) => {
                const it = items[idx];
                if (it) {
                  const q = it.quantity || 1;
                  globalSelectedQty += q;
                  globalSelectedTotalK += it.price || 0;
                }
              });
            });

            Object.entries(selectedPastMap).forEach(([key, set]) => {
              if (!set || set.size === 0) return;
              const parts = key.split("_");
              const plat = parts[0] as Platform;
              const u = parts.slice(1).join("_");
              if (!activeUser) {
                activeUser = u;
                activePlatform = plat;
              }
              const cust = store[plat]?.customers?.[u];
              const items = cust?.pastItems || [];
              set.forEach((idx) => {
                const it = items[idx];
                if (it) {
                  const q = it.quantity || 1;
                  globalSelectedQty += q;
                  globalSelectedTotalK += it.price || 0;
                }
              });
            });

            if (globalSelectedQty === 0) return null;

            if (isMiniBarMinimized) {
              return (
                <div className="fixed bottom-[62px] right-3 z-[90] animate-bounce">
                  <button
                    type="button"
                    onClick={() => setIsMiniBarMinimized(false)}
                    className="py-2.5 px-3.5 rounded-full bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 border-2 border-orange-300 text-white font-black text-xs flex items-center gap-1.5 shadow-[0_8px_25px_rgba(0,0,0,0.8)] active:scale-90 transition-all cursor-pointer"
                    title="Bấm để mở lại thanh chọn đơn"
                  >
                    <span>🛍️</span>
                    <span>{globalSelectedQty} cái ({globalSelectedTotalK}k)</span>
                    <ChevronUp size={14} className="stroke-[3]" />
                  </button>
                </div>
              );
            }

            return (
              <div className="fixed bottom-[58px] left-2 right-2 sm:left-4 sm:right-4 z-[90] bg-[#111927]/98 border-2 border-orange-500/90 p-2.5 sm:p-3 rounded-2xl flex items-center justify-between gap-2 shadow-[0_12px_35px_rgba(0,0,0,0.9)] backdrop-blur-md animate-slideUp">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">🛍️</span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 flex-wrap">
                      <span className="text-amber-300 font-extrabold uppercase">ĐÃ CHỌN: {globalSelectedQty} CÁI</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-mono font-black">{globalSelectedTotalK.toLocaleString("vi-VN")}k ({(globalSelectedTotalK * 1000).toLocaleString("vi-VN")}đ)</span>
                    </div>
                    <div className="text-[10.5px] text-gray-400 truncate mt-0.5 flex items-center gap-2">
                      <span>Khách: @{activeUser}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCurrentMap({});
                          setSelectedPastMap({});
                        }}
                        className="text-red-400 hover:text-red-300 underline font-semibold text-[10px]"
                      >
                        (Bỏ chọn)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeUser && activePlatform) {
                        handlePushOrder(activeUser, activePlatform);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer border border-orange-400/40"
                  >
                    <span>🥞</span>
                    <span>ĐẨY ĐƠN ({globalSelectedQty})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMiniBarMinimized(true)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-xs font-bold transition-all cursor-pointer border border-white/10 active:scale-90"
                    title="Thu gọn thanh chọn"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      {editingPriceQty && (
        <QuickPriceQtyModal
          target={editingPriceQty}
          onClose={() => setEditingPriceQty(null)}
        />
      )}
      {pushModalTarget && (
        <QuickOrderPushModal
          isOpen={true}
          user={pushModalTarget.user}
          platform={pushModalTarget.platform}
          selectedCurrentIndices={pushModalTarget.selectedCurrent}
          selectedPastIndices={pushModalTarget.selectedPast}
          onClose={() => setPushModalTarget(null)}
          onSuccess={() => {
            clearCustomerSelection(
              pushModalTarget.user,
              pushModalTarget.platform,
            );
            setPushModalTarget(null);
          }}
        />
      )}
      {contextMenuItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setContextMenuItem(null)}
        >
          <div
            className="bg-[#182230] border border-white/20 rounded-2xl p-4 w-full max-w-xs sm:max-w-sm shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header món */}
            <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/10">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-blue-300 font-bold mb-0.5">
                  <span>📦</span>
                  <span className="truncate">{contextMenuItem.user}</span>
                  <span className="text-[10px] bg-blue-900/60 px-1.5 py-0.2 rounded text-blue-200">
                    {PLATFORMS[contextMenuItem.platform].label}
                  </span>
                </div>
                <div
                  className="text-sm font-black text-white truncate"
                  title={contextMenuItem.fullCommentContent}
                >
                  {contextMenuItem.fullCommentContent}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-base font-black font-mono text-emerald-400">
                    {contextMenuItem.itemTotalK}k
                  </span>
                  {contextMenuItem.itemQty > 1 && (
                    <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                      SL: {contextMenuItem.itemQty} ×{" "}
                      {contextMenuItem.itemUnitPrice}k
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContextMenuItem(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Menu các tác vụ: Xem/Tăng SL, Nhân bản +1, In, Xoá */}
            <div className="space-y-2">
              {/* 1. Xem sản phẩm & gọi bảng tăng số lượng lên */}
              <button
                type="button"
                onClick={() => {
                  const item = contextMenuItem.item;
                  setEditingPriceQty({
                    platform: contextMenuItem.platform,
                    user: contextMenuItem.user,
                    itemIndex: item._realIndex,
                    itemId: item.id,
                    content: contextMenuItem.fullCommentContent,
                    unitPrice: contextMenuItem.itemUnitPrice,
                    quantity: contextMenuItem.itemQty,
                    isPast: item._isPast,
                  });
                  setContextMenuItem(null);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🔍</span>
                  <div className="text-left">
                    <div className="font-black">Xem & Sửa số lượng / giá</div>
                    <div className="text-[10px] text-blue-200 font-normal">
                      Mở bảng tăng giảm SL, giá, ghi chú
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} />
              </button>

              {/* 2. Nhân bản +1 */}
              <button
                type="button"
                onClick={() => {
                  store.duplicateOrderItem(
                    contextMenuItem.platform,
                    contextMenuItem.user,
                    contextMenuItem.item._realIndex,
                    contextMenuItem.item._isPast,
                    contextMenuItem.item.id,
                  );
                  if (typeof navigator !== "undefined" && navigator.vibrate) {
                    try {
                      navigator.vibrate(15);
                    } catch {}
                  }
                  setContextMenuItem(null);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 active:scale-98 border border-purple-500/40 text-purple-100 font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">➕</span>
                  <div className="text-left">
                    <div className="font-black">Nhân bản (+1 món này)</div>
                    <div className="text-[10px] text-purple-300 font-normal">
                      Thêm 1 món cùng tên & giá vào đơn
                    </div>
                  </div>
                </div>
                <span className="font-mono font-black text-xs bg-purple-950 px-2 py-0.5 rounded border border-purple-400/40">
                  +1
                </span>
              </button>

              {/* 3. In tem */}
              <button
                type="button"
                onClick={() => {
                  const time = new Date().toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const cleanPrintContent = `${contextMenuItem.fullCommentContent} (${contextMenuItem.itemUnitPrice}k x ${contextMenuItem.itemQty})`;
                  printLabel(
                    store[contextMenuItem.platform].nicknames?.[
                      contextMenuItem.user
                    ]
                      ? `(${store[contextMenuItem.platform].nicknames[contextMenuItem.user]}) ${contextMenuItem.user}`
                      : `#${getShortId(contextMenuItem.user)} ${contextMenuItem.user}`,
                    cleanPrintContent,
                    contextMenuItem.itemTotalK,
                    time,
                    PLATFORMS[contextMenuItem.platform].label,
                    true,
                    isCustomerGheLay(store[contextMenuItem.platform].gheLayTags, contextMenuItem.user, store[contextMenuItem.platform].tags)
                  );
                  setContextMenuItem(null);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 active:scale-98 border border-emerald-500/40 text-emerald-100 font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🖨️</span>
                  <div className="text-left">
                    <div className="font-black">In tem món này</div>
                    <div className="text-[10px] text-emerald-300 font-normal">
                      Gửi lệnh in nhãn dán sản phẩm
                    </div>
                  </div>
                </div>
                <span className="font-bold text-[11px] bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-400/30">
                  IN
                </span>
              </button>

              {/* 4. Xoá */}
              <button
                type="button"
                onClick={() => {
                  store.deleteOrderItem(
                    contextMenuItem.platform,
                    contextMenuItem.user,
                    contextMenuItem.item._realIndex,
                    contextMenuItem.item._isPast,
                    contextMenuItem.item.id,
                  );
                  setContextMenuItem(null);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 active:scale-98 border border-red-500/40 text-red-200 font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Trash2 size={16} className="text-red-400" />
                  <div className="text-left">
                    <div className="font-black text-red-200">
                      Xoá món khỏi giỏ hàng
                    </div>
                    <div className="text-[10px] text-red-400/80 font-normal">
                      Xoá vĩnh viễn món này
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-red-400 bg-red-950 px-2 py-0.5 rounded border border-red-500/40">
                  Xoá
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setContextMenuItem(null)}
              className="w-full py-2 bg-gray-700/60 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer mt-1"
            >
              Đóng menu
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);
}

export function LiveEfficiencyModal({
  onClose,
  onOpenProfile,
  onOpenPrice,
  isPage,
  onScroll,
  searchKeyword,
}: {
  onClose?: () => void;
  onOpenProfile?: (u: string, p: Platform) => void;
  onOpenPrice?: (id: string | null, u: string, p: Platform) => void;
  isPage?: boolean;
  onScroll?: (isDown: boolean) => void;
  searchKeyword?: string;
}) {
  const store = useStore();
  const [timeRange, setTimeRange] = useState<
    "today" | "yesterday" | "7days" | "all"
  >("today");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">(
    "all",
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");

  const [lastScrollY, setLastScrollY] = useState(0);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentY = e.currentTarget.scrollTop;
    if (onScroll) {
      if (currentY > lastScrollY + 5 && currentY > 20) {
        onScroll(true); // Lướt xuống
      } else if (currentY < lastScrollY - 5) {
        onScroll(false); // Lướt lên
      }
    }
    setLastScrollY(currentY);
  };

  // Analytics calculations
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalInteractions = 0;
  let totalCustomers = 0;

  const priceCounts: Record<string, { count: number; revenue: number }> = {};
  const customerAgg: Record<
    string,
    {
      count: number;
      revenue: number;
      user: string;
      platform: Platform;
      tag: string;
      isNew: boolean;
      nickname: string;
    }
  > = {};
  const hourCounts: Record<number, number> = {};

  // Grouped customer buckets by tag
  const categorizedCustomers: Record<
    string,
    Array<{
      user: string;
      platform: Platform;
      count: number;
      revenue: number;
      tag: string;
      nickname: string;
    }>
  > = {
    NEW: [],
    VIP: [],
    COC: [],
    COC_100: [],
    GHE_LAY: [],
    NORMAL: [],
    DAO: [],
    BOM: [],
    CHAN: [],
    HOST: [],
  };

  const now = Date.now();
  const todayObj = new Date();
  const todayStart = new Date(
    todayObj.getFullYear(),
    todayObj.getMonth(),
    todayObj.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();

  const yesterdayObj = new Date(
    todayObj.getFullYear(),
    todayObj.getMonth(),
    todayObj.getDate() - 1,
  );
  const yesterdayStart = new Date(
    yesterdayObj.getFullYear(),
    yesterdayObj.getMonth(),
    yesterdayObj.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();

  const sevenDaysAgoStart = new Date(
    todayObj.getFullYear(),
    todayObj.getMonth(),
    todayObj.getDate() - 6,
    0,
    0,
    0,
    0,
  ).getTime();

  (["tiktok", "facebook", "shopee"] as Platform[]).forEach((p) => {
    if (selectedPlatform !== "all" && p !== selectedPlatform) return;
    const platformStore = store[p];

    totalInteractions += platformStore.comments.length;

    Object.entries(platformStore.customers).forEach(([user, data]) => {
      const custData = data as CustomerData;
      const tag = platformStore.tags[user] || "NORMAL";
      const nickname = platformStore.nicknames?.[user] || "";

      const currentItems = custData.items || [];
      const pastItems = custData.pastItems || [];

      // Reconcile current items if custData.count or custData.total exceeds currentItems array
      const currentSumPrice = currentItems.reduce(
        (s, it) => s + (it.price || 0),
        0,
      );
      const currentTotalQty = currentItems.reduce(
        (s, it) => s + (it.quantity || 1),
        0,
      );
      let effectiveCurrentItems = [...currentItems];
      if (
        custData.count > currentTotalQty &&
        custData.total > currentSumPrice
      ) {
        const diffCount = Math.max(0, custData.count - currentTotalQty);
        const diffPrice = Math.max(0, custData.total - currentSumPrice);
        const avgPrice = diffCount > 0 ? Math.round(diffPrice / diffCount) : 0;
        if (avgPrice > 0) {
          for (let i = 0; i < diffCount; i++) {
            effectiveCurrentItems.push({
              id: `synth_curr_${custData.lastTime || now}_${i}`,
              content: `Đơn đã chốt (${avgPrice}k)`,
              price: avgPrice,
              unitPrice: avgPrice,
              quantity: 1,
              sourceCommentId: null,
              createdAt: custData.lastTime || now,
              shipped: false,
            });
          }
        }
      }

      const allItemsWithMeta = [
        ...effectiveCurrentItems.map((it) => ({ ...it, isPast: false })),
        ...pastItems.map((it) => ({ ...it, isPast: true })),
      ];

      let userOrderCount = 0;
      let userRevenue = 0;

      allItemsWithMeta.forEach((item) => {
        let itemTime: number;
        if (item.createdAt && item.createdAt > 1000000000000) {
          itemTime = item.createdAt;
        } else if (item.id && String(item.id).match(/^(\d{13})/)) {
          const parsed = parseInt(String(item.id).substring(0, 13));
          itemTime =
            parsed > 1500000000000 && parsed <= now + 86400000
              ? parsed
              : item.isPast
                ? custData.lastTime && custData.lastTime < todayStart
                  ? custData.lastTime
                  : yesterdayStart + 12 * 3600 * 1000
                : custData.lastTime || now;
        } else {
          itemTime = item.isPast
            ? custData.lastTime && custData.lastTime < todayStart
              ? custData.lastTime
              : yesterdayStart + 12 * 3600 * 1000
            : custData.lastTime || now;
        }

        let include = false;
        if (timeRange === "today") {
          include = itemTime >= todayStart;
        } else if (timeRange === "yesterday") {
          include = itemTime >= yesterdayStart && itemTime < todayStart;
        } else if (timeRange === "7days") {
          include = itemTime >= sevenDaysAgoStart;
        } else if (timeRange === "all") {
          include = true;
        }

        if (include) {
          const itemQty = item.quantity || 1;
          userOrderCount += itemQty;
          userRevenue += item.price || 0;

          const hour = new Date(itemTime).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + itemQty;

          const priceStr = (item.price || 0).toString();
          if (!priceCounts[priceStr])
            priceCounts[priceStr] = { count: 0, revenue: 0 };
          priceCounts[priceStr].count += itemQty;
          priceCounts[priceStr].revenue += item.price || 0;
        }
      });

      if (userOrderCount > 0) {
        totalOrders += userOrderCount;
        totalRevenue += userRevenue;
        totalCustomers++;

        const isNew =
          (custData.pastItems?.length || 0) === 0 &&
          tag !== "VIP" &&
          tag !== "COC" &&
          tag !== "COC_100";

        let categoryKey = "NORMAL";
        if (tag === "VIP") categoryKey = "VIP";
        else if (tag === "COC") categoryKey = "COC";
        else if (tag === "COC_100") categoryKey = "COC_100";
        else if (tag === "GHE_LAY") categoryKey = "GHE_LAY";
        else if (tag === "DAO") categoryKey = "DAO";
        else if (tag === "BOM") categoryKey = "BOM";
        else if (tag === "CHAN") categoryKey = "CHAN";
        else if (tag === "HOST") categoryKey = "HOST";
        else if (isNew) categoryKey = "NEW";
        else categoryKey = "NORMAL";

        const custItem = {
          user,
          platform: p as Platform,
          count: userOrderCount,
          revenue: userRevenue,
          tag,
          nickname,
        };
        if (!categorizedCustomers[categoryKey])
          categorizedCustomers[categoryKey] = [];
        categorizedCustomers[categoryKey].push(custItem);

        const key = `${p}_${user}`;
        if (!customerAgg[key])
          customerAgg[key] = {
            count: 0,
            revenue: 0,
            user,
            platform: p as Platform,
            tag,
            isNew,
            nickname,
          };
        customerAgg[key].count += userOrderCount;
        customerAgg[key].revenue += userRevenue;
      }
    });
  });

  // 🚀 Thống kê hiệu quả đẩy đơn Pancake POS (Số đơn đẩy, Doanh thu đơn đẩy, Số cái/SP đẩy out)
  let pushedOrdersCount = 0;
  let pushedRevenue = 0;
  let pushedItemsCount = 0;
  const pushedList: Array<{
    user: string;
    platform: Platform;
    nickname: string;
    rec: any;
  }> = [];

  (["tiktok", "facebook", "shopee"] as Platform[]).forEach((p) => {
    if (selectedPlatform !== "all" && p !== selectedPlatform) return;
    const platformStore = store[p];

    Object.entries(platformStore.customers).forEach(([user, data]) => {
      const custData = data as CustomerData;
      const nickname = platformStore.nicknames?.[user] || "";
      const history = custData.pushHistory || [];

      history.forEach((rec) => {
        const recTime = rec.timestamp || Date.now();
        let include = false;
        if (timeRange === "today") {
          include = recTime >= todayStart;
        } else if (timeRange === "yesterday") {
          include = recTime >= yesterdayStart && recTime < todayStart;
        } else if (timeRange === "7days") {
          include = recTime >= sevenDaysAgoStart;
        } else if (timeRange === "all") {
          include = true;
        }

        if (include) {
          if (rec.status !== "restored") {
            pushedOrdersCount++;
            pushedRevenue += rec.totalPrice || 0;
            const itemsQty = rec.totalQuantity || (rec.items || []).reduce((s, i) => s + (i.quantity || 1), 0) || 0;
            pushedItemsCount += itemsQty;
          }

          const kw = (searchKeyword || "").toLowerCase().trim();
          if (!kw || user.toLowerCase().includes(kw) || nickname.toLowerCase().includes(kw) || String(rec.orderNumber || "").toLowerCase().includes(kw)) {
            pushedList.push({
              user,
              platform: p as Platform,
              nickname,
              rec,
            });
          }
        }
      });
    });
  });

  pushedList.sort((a, b) => (b.rec.timestamp || 0) - (a.rec.timestamp || 0));

  const customersByRevenue = Object.values(customerAgg)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const topPrices = Object.entries(priceCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  const topHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const maxProductCount = topPrices.length > 0 ? topPrices[0][1].count : 1;

  // Filtered customer list for selected category
  const activeCategoryList = selectedCategory
    ? (categorizedCustomers[selectedCategory] || [])
        .filter((c) => {
          if (!categorySearch.trim()) return true;
          const q = categorySearch.toLowerCase().trim();
          return (
            c.user.toLowerCase().includes(q) ||
            c.nickname.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => b.revenue - a.revenue)
    : [];

  const categoryMeta: Record<
    string,
    {
      label: string;
      icon: string;
      color: string;
      border: string;
      bg: string;
      badgeBg: string;
    }
  > = {
    NEW: {
      label: "Khách Mới",
      icon: "✨",
      color: "text-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
      badgeBg: "bg-emerald-500/15 text-emerald-300",
    },
    VIP: {
      label: "Khách Quen",
      icon: "🌟",
      color: "text-orange-400",
      border: "border-orange-500/30",
      bg: "bg-orange-500/5 hover:bg-orange-500/10",
      badgeBg: "bg-orange-500/15 text-orange-300",
    },
    COC: {
      label: "Mới Cọc (50k)",
      icon: "💧",
      color: "text-cyan-400",
      border: "border-cyan-500/30",
      bg: "bg-cyan-500/5 hover:bg-cyan-500/10",
      badgeBg: "bg-cyan-500/15 text-cyan-300",
    },
    COC_100: {
      label: "Mới Cọc (100k)",
      icon: "💧",
      color: "text-blue-400",
      border: "border-blue-500/30",
      bg: "bg-blue-500/5 hover:bg-blue-500/10",
      badgeBg: "bg-blue-500/15 text-blue-300",
    },
    GHE_LAY: {
      label: "Ghé Lấy",
      icon: "🛵",
      color: "text-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
      badgeBg: "bg-emerald-500/15 text-emerald-300",
    },
    NORMAL: {
      label: "Khách Thường",
      icon: "👤",
      color: "text-blue-400",
      border: "border-blue-500/30",
      bg: "bg-blue-500/5 hover:bg-blue-500/10",
      badgeBg: "bg-blue-500/15 text-blue-300",
    },
    DAO: {
      label: "Khách Dạo",
      icon: "👻",
      color: "text-gray-400",
      border: "border-gray-500/30",
      bg: "bg-gray-500/5 hover:bg-gray-500/10",
      badgeBg: "bg-gray-500/15 text-gray-300",
    },
    BOM: {
      label: "BOM Hàng",
      icon: "⚠️",
      color: "text-rose-400",
      border: "border-rose-500/30",
      bg: "bg-rose-500/5 hover:bg-rose-500/10",
      badgeBg: "bg-rose-500/15 text-rose-300",
    },
    CHAN: {
      label: "Đã Chặn",
      icon: "⛔",
      color: "text-red-500",
      border: "border-red-600/30",
      bg: "bg-red-600/5 hover:bg-red-600/10",
      badgeBg: "bg-red-600/15 text-red-300",
    },
  };

  return (
    <div
      className={
        isPage
          ? "h-full w-full flex flex-col bg-[#0e1621]"
          : "fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-2 sm:p-4"
      }
    >
      <div
        className={`w-full ${isPage ? "h-full flex flex-col bg-[#0e1621]" : "bg-[#1c242f] rounded-2xl border border-white/10 max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"}`}
      >
        {/* Header filter controls */}
        <div className="p-3 bg-[#1c242f] border-b border-white/10 shrink-0 space-y-2.5">
          {/* Time Range */}
          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={() => setTimeRange("today")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${timeRange === "today" ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20" : "bg-[#0e1621] border-white/10 text-gray-400 hover:bg-white/5"}`}
            >
              📅 Hôm nay
            </button>
            <button
              onClick={() => setTimeRange("yesterday")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${timeRange === "yesterday" ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20" : "bg-[#0e1621] border-white/10 text-gray-400 hover:bg-white/5"}`}
            >
              ⏪ Hôm qua
            </button>
            <button
              onClick={() => setTimeRange("7days")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${timeRange === "7days" ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20" : "bg-[#0e1621] border-white/10 text-gray-400 hover:bg-white/5"}`}
            >
              📈 7 Ngày
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${timeRange === "all" ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20" : "bg-[#0e1621] border-white/10 text-gray-400 hover:bg-white/5"}`}
            >
              🌟 Toàn bộ
            </button>
          </div>

          {/* Platform Selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
            <button
              onClick={() => setSelectedPlatform("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                selectedPlatform === "all"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-[#0e1621] border border-white/10 text-gray-400 hover:bg-white/5"
              }`}
            >
              🌐 Tất cả sàn
            </button>
            {(["tiktok", "facebook", "shopee"] as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPlatform(p)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                  selectedPlatform === p
                    ? `${PLATFORMS[p].bgClass} text-white shadow-sm ring-2 ring-white/20`
                    : "bg-[#0e1621] border border-white/10 text-gray-400 hover:bg-white/5"
                }`}
              >
                {PLATFORMS[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Body Content */}
        <div
          className="overflow-y-auto flex-1 p-3 sm:p-4 bg-[#0e1621] pb-24 space-y-4"
          onScroll={handleScroll}
        >
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#1c242f] p-3 rounded-2xl border border-white/10 shadow-sm relative overflow-hidden">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Tổng doanh thu
              </div>
              <div className="text-2xl font-black text-rose-400">
                {totalRevenue.toLocaleString()}k
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                TB:{" "}
                {totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0}k
                / sp
              </div>
            </div>
            <div className="bg-[#1c242f] p-3 rounded-2xl border border-white/10 shadow-sm relative overflow-hidden">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Số lượng chốt
              </div>
              <div className="text-2xl font-black text-blue-400">
                {totalOrders}{" "}
                <span className="text-xs font-normal text-gray-400">cái</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {totalCustomers} khách chốt
              </div>
            </div>
            <div className="bg-[#1c242f] p-3 rounded-2xl border border-white/10 shadow-sm relative overflow-hidden">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Lượt tương tác
              </div>
              <div className="text-2xl font-black text-purple-400">
                {totalInteractions}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                Bình luận live
              </div>
            </div>
            <div className="bg-[#1c242f] p-3 rounded-2xl border border-white/10 shadow-sm relative overflow-hidden">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Tỷ lệ chốt
              </div>
              <div className="text-2xl font-black text-emerald-400">
                {totalInteractions > 0
                  ? Math.round((totalCustomers / totalInteractions) * 100)
                  : 0}
                %
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                Chốt / tương tác
              </div>
            </div>
          </div>



          {/* Customer Segments */}
          <div className="bg-[#1c242f] p-4 rounded-2xl border border-white/10 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                👥 Phân loại khách hàng ({totalCustomers} khách)
              </h4>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-[11px] text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-md transition-colors font-medium"
                >
                  Xem tất cả top khách ↺
                </button>
              )}
            </div>

            {/* Main Tag Classification Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(["NEW", "VIP", "COC", "COC_100", "NORMAL"] as const).map(
                (catKey) => {
                  const meta = categoryMeta[catKey];
                  const list = categorizedCustomers[catKey] || [];
                  const count = list.length;
                  const percent =
                    totalCustomers > 0
                      ? Math.round((count / totalCustomers) * 100)
                      : 0;
                  const isSelected = selectedCategory === catKey;

                  return (
                    <div
                      key={catKey}
                      onClick={() => {
                        setSelectedCategory((prev) =>
                          prev === catKey ? null : catKey,
                        );
                        setCategorySearch("");
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none active:scale-[0.98] ${
                        isSelected
                          ? `${meta.border} bg-[#232e3c] ring-2 ring-blue-500/40 shadow-lg`
                          : `border-white/10 bg-[#0e1621] hover:border-white/20 hover:bg-[#15202d]`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold flex items-center gap-1.5 ${meta.color}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${meta.badgeBg}`}
                        >
                          {percent}%
                        </span>
                      </div>
                      <div className="flex items-end justify-between mt-2.5">
                        <div className={`text-2xl font-black ${meta.color}`}>
                          {count}
                        </div>
                        <div className="text-[10px] font-medium text-gray-400 flex items-center gap-0.5">
                          {isSelected ? (
                            <span className="text-blue-400 font-bold">
                              Đang hiển thị ▾
                            </span>
                          ) : (
                            <span className="opacity-70 group-hover:opacity-100">
                              Bấm xem list 👉
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            {/* Other secondary tags if count > 0 */}
            {(["GHE_LAY", "DAO", "BOM", "CHAN"] as const).some(
              (k) => (categorizedCustomers[k]?.length || 0) > 0,
            ) && (
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto hide-scrollbar">
                <span className="text-[10px] text-gray-500 font-bold uppercase shrink-0">
                  Nhãn khác:
                </span>
                {(["GHE_LAY", "DAO", "BOM", "CHAN"] as const).map((catKey) => {
                  const meta = categoryMeta[catKey];
                  const list = categorizedCustomers[catKey] || [];
                  if (list.length === 0) return null;
                  const isSelected = selectedCategory === catKey;
                  return (
                    <button
                      key={catKey}
                      onClick={() => {
                        setSelectedCategory((prev) =>
                          prev === catKey ? null : catKey,
                        );
                        setCategorySearch("");
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? `${meta.border} bg-[#232e3c] text-white shadow-sm ring-1 ring-white/30`
                          : `bg-[#0e1621] border-white/10 ${meta.color} hover:bg-white/5`
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                      <span
                        className={`text-[10px] px-1 rounded ${meta.badgeBg}`}
                      >
                        {list.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Customer Table - Positioned Directly Below Customer Segments */}
          <div className="bg-[#1c242f] p-4 rounded-2xl border border-white/10 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                {selectedCategory ? (
                  <>
                    <span>{categoryMeta[selectedCategory]?.icon}</span>
                    <span>
                      Danh sách {categoryMeta[selectedCategory]?.label}
                    </span>
                    <span className="text-xs font-normal text-blue-400">
                      ({activeCategoryList.length} khách)
                    </span>
                  </>
                ) : (
                  <>
                    <span>🏆</span>
                    <span>Top khách chốt nhiều nhất</span>
                    <span className="text-xs font-normal text-gray-400">
                      ({customersByRevenue.length} khách)
                    </span>
                  </>
                )}
              </h4>
              <span className="text-xs text-gray-400 font-normal">
                {timeRange === "today"
                  ? "Hôm nay"
                  : timeRange === "yesterday"
                    ? "Hôm qua"
                    : "7 ngày qua"}
              </span>
            </div>

            {/* Search Bar when a category is selected */}
            {selectedCategory && !searchKeyword && (
              <div>
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder={`Tìm kiếm trong ${categoryMeta[selectedCategory]?.label}...`}
                  className="w-full bg-[#0e1621] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            )}

            {(() => {
              const effectiveEffSearch = (searchKeyword || categorySearch)
                .trim()
                .toLowerCase();
              const effNoAccent = removeVietnameseAccents(effectiveEffSearch);
              const baseList = selectedCategory
                ? activeCategoryList
                : customersByRevenue;
              const displayRows = effectiveEffSearch
                ? baseList.filter((row) => {
                    const clean = normalizeUser(row.user);
                    const nick = store[row.platform].nicknames?.[clean] || "";
                    const sid = getShortId(clean).toLowerCase();
                    const uLow = clean.toLowerCase();
                    const uNo = removeVietnameseAccents(uLow);
                    const nLow = nick.toLowerCase();
                    const nNo = removeVietnameseAccents(nLow);
                    return (
                      uLow.includes(effectiveEffSearch) ||
                      uNo.includes(effNoAccent) ||
                      nLow.includes(effectiveEffSearch) ||
                      nNo.includes(effNoAccent) ||
                      sid.includes(effectiveEffSearch) ||
                      ("#" + sid).includes(effectiveEffSearch)
                    );
                  })
                : baseList;

              return (
                <>
                  {effectiveEffSearch && (
                    <div className="bg-purple-950/70 border border-purple-500/30 px-3 py-1.5 rounded-xl text-xs text-purple-200 flex items-center justify-between">
                      <span>
                        🔍 Lọc khách hàng:{" "}
                        <strong className="text-white">
                          "{effectiveEffSearch}"
                        </strong>
                      </span>
                      <span className="font-bold text-purple-300 font-mono">
                        ({displayRows.length} khách)
                      </span>
                    </div>
                  )}

                  {/* Table List Rows */}
                  {displayRows.length === 0 ? (
                    <div className="text-xs text-gray-400 italic text-center py-6">
                      {effectiveEffSearch
                        ? "Không tìm thấy khách hàng phù hợp"
                        : "Chưa có dữ liệu khách hàng"}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-0.5 hide-scrollbar">
                      {displayRows.map((row, idx) => {
                        const cleanUser = normalizeUser(row.user);
                        const nickname =
                          store[row.platform].nicknames?.[cleanUser];
                        const displayName = nickname
                          ? `(${nickname}) ${cleanUser}`
                          : `#${getShortId(cleanUser)} ${cleanUser}`;

                        return (
                          <div
                            key={`${row.platform}-${cleanUser}-${idx}`}
                            onClick={() =>
                              onOpenProfile?.(cleanUser, row.platform)
                            }
                            className="flex justify-between items-center p-2.5 bg-[#0e1621] hover:bg-white/5 rounded-xl border border-white/5 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2 overflow-hidden flex-1 pr-2">
                              <span
                                className={`text-xs font-black w-5 text-center shrink-0 ${idx < 3 ? "text-yellow-400" : "text-gray-400"}`}
                              >
                                {idx + 1}.
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white shrink-0 ${PLATFORMS[row.platform].bgClass}`}
                              >
                                {PLATFORMS[row.platform].label.split(" ")[0]}
                              </span>
                              <span className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">
                                {displayName}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <div className="text-sm font-black text-rose-400 leading-tight">
                                  {row.revenue}k
                                </div>
                                <div className="text-[11px] text-gray-400 font-semibold leading-tight">
                                  {row.count} cái
                                </div>
                              </div>

                              <CopyButton
                                text={displayName}
                                className="text-xs px-1 text-gray-400 hover:text-white"
                              />

                              {onOpenPrice && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenPrice(null, row.user, row.platform);
                                  }}
                                  title="Tạo đơn / Thêm giá"
                                  className="text-emerald-400 hover:text-white hover:bg-emerald-600/30 active:scale-90 p-1 rounded-full border border-emerald-500/30 transition-all cursor-pointer inline-flex items-center justify-center font-bold text-xs bg-emerald-950/40 shadow-xs shrink-0"
                                >
                                  <Plus size={12} className="stroke-[2.5]" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Top Products By Price */}
          <div className="bg-[#1c242f] p-4 rounded-2xl border border-white/10 shadow-sm">
            <h4 className="font-bold text-white text-sm mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                🔥 Top sản phẩm bán chạy (Theo mức giá)
              </span>
              <span className="text-xs text-gray-400 font-normal">
                {topPrices.length} mức giá
              </span>
            </h4>
            {topPrices.length === 0 ? (
              <div className="text-xs text-gray-400 italic text-center py-4">
                Chưa có dữ liệu sản phẩm
              </div>
            ) : (
              <div className="space-y-2.5">
                {topPrices.map(([price, stats], idx) => {
                  const percent = Math.round(
                    (stats.count / maxProductCount) * 100,
                  );
                  return (
                    <div
                      key={idx}
                      className="bg-[#0e1621] p-2.5 rounded-xl border border-white/5"
                    >
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-blue-400 w-4 text-center">
                            {idx + 1}.
                          </span>
                          <span className="font-bold text-white">
                            Sản phẩm {price}k
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-400">
                            {stats.count} chốt
                          </span>
                          <span className="text-gray-400 text-[11px] ml-1.5 font-medium">
                            ({stats.revenue}k)
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-[#1c242f] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peak Hours */}
          <div className="bg-[#1c242f] p-4 rounded-2xl border border-white/10 shadow-sm">
            <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
              ⏰ Khung giờ chốt nhiều nhất
            </h4>
            {topHours.length === 0 ? (
              <div className="text-xs text-gray-400 italic text-center py-4">
                Chưa có dữ liệu thời gian
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {topHours.map((h, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0e1621] rounded-xl p-3 border border-white/5 text-center relative overflow-hidden"
                  >
                    {idx === 0 && (
                      <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-bl-lg shadow-sm">
                        TOP 1
                      </div>
                    )}
                    <div className="text-[11px] text-gray-400 font-bold mb-1">
                      Khung giờ
                    </div>
                    <div className="text-base font-black text-white">
                      {h.hour}:00 - {h.hour + 1}:00
                    </div>
                    <div className="text-xs font-bold text-blue-400 mt-1">
                      {h.count} đơn chốt
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History Section */}
          {store.history.length > 0 && (
            <div className="bg-[#1c242f] p-4 rounded-2xl border border-white/10 shadow-sm">
              <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                📅 Lịch sử các phiên live trước
              </h4>
              <div className="space-y-2.5">
                {store.history.map((h) => {
                  const dateObj = new Date(h.date);
                  const isToday =
                    new Date().toDateString() === dateObj.toDateString();
                  const isYesterday =
                    new Date(Date.now() - 86400000).toDateString() ===
                    dateObj.toDateString();
                  const dateLabel = isToday
                    ? "Hôm nay"
                    : isYesterday
                      ? "Hôm qua"
                      : dateObj.toLocaleDateString("vi-VN");
                  const timeLabel = dateObj.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={h.id}
                      className="flex justify-between items-center bg-[#0e1621] p-3 rounded-xl border border-white/5 gap-3"
                    >
                      <div className="flex-1">
                        <div className="font-bold text-sm text-white">
                          {dateLabel}{" "}
                          <span className="text-xs text-gray-400 font-normal">
                            ({timeLabel})
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="font-bold text-emerald-400">
                            {h.newCustomers}
                          </span>{" "}
                          mới,{" "}
                          <span className="font-bold text-orange-400">
                            {h.returningCustomers}
                          </span>{" "}
                          quen
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-rose-400 text-sm">
                          {h.totalRevenue}k
                        </div>
                        <div className="text-xs font-bold text-blue-400">
                          {h.totalOrders} cái
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractProvince(addr: string): string {
  if (!addr) return "";
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return addr;
  let last = parts[parts.length - 1];
  if (
    last.toLowerCase().includes("việt nam") ||
    last.toLowerCase().includes("viet nam")
  ) {
    if (parts.length > 1) last = parts[parts.length - 2];
  }
  return last.replace(/^(tỉnh|thành phố|tp\.?)\s+/i, "");
}

export function ProfileModal({
  user,
  platform,
  onClose,
  onOpenPrice,
  onOpenPancakeLink,
}: {
  user: string;
  platform: Platform;
  onClose: () => void;
  onOpenPrice?: (id: string | null, u: string, p: Platform) => void;
  onOpenPancakeLink?: (
    user: string,
    platform: Platform,
    initialSearch?: string,
  ) => void;
}) {
  const store = useStore();
  const cleanUser = normalizeUser(user);

  const cust = store[platform]?.customers?.[cleanUser];
  const initialNickname = store[platform]?.nicknames?.[cleanUser] || "";
  const [nickname, setNickname] = useState(initialNickname);
  useEffect(() => {
    setNickname(store[platform]?.nicknames?.[cleanUser] || "");
  }, [store[platform]?.nicknames?.[cleanUser]]);
  const initialPancakeLink = store[platform]?.pancakeLinks?.[cleanUser] || "";
  const [pancakeInput, setPancakeInput] = useState(initialPancakeLink);
  const [insight, setInsight] = useState(() => getCustomerInsight(cleanUser));
  const [isSyncingPancake, setIsSyncingPancake] = useState(false);
  const [isCheckingPancake, setIsCheckingPancake] = useState(false);
  const [pancakeCheckResult, setPancakeCheckResult] = useState<{
    found: boolean;
    order?: any;
    message: string;
  } | null>(null);

  const handleCheckPancake = async () => {
    setIsCheckingPancake(true);
    setPancakeCheckResult(null);
    try {
      const link =
        pancakeInput.trim() || store[platform].pancakeLinks?.[cleanUser];
      let ins = insight;
      if (link) {
        const res = await syncSingleCustomerPancakeOrders(
          cleanUser,
          platform,
          link,
        );
        if (res) {
          setInsight(res);
          ins = res;
        }
      }
      const orders =
        ins?.ordersHistory || (ins?.latestOrder ? [ins.latestOrder] : []);
      const sStat = checkCustomerPancakeShippedStatus(cust, ins);
      const targetOrder =
        sStat.matchingTodayOrder || (orders.length > 0 ? orders[0] : null);

      if (targetOrder) {
        setPancakeCheckResult({
          found: true,
          order: targetOrder,
          message: `Phát hiện đơn #${targetOrder.orderNumber} trên Pancake POS`,
        });
      } else {
        setPancakeCheckResult({
          found: false,
          message: "Không tìm thấy đơn mới nào trên Pancake POS.",
        });
      }
    } catch (err) {
      console.error("Lỗi kiểm tra Pancake:", err);
      setPancakeCheckResult({
        found: false,
        message: "Không thể kiểm tra hoặc chưa tìm thấy đơn.",
      });
    } finally {
      setIsCheckingPancake(false);
    }
  };
  const [pancakeCopiedTip, setPancakeCopiedTip] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [showOldShippedItems, setShowOldShippedItems] = useState(false);
  const [selectedPast, setSelectedPast] = useState<Set<number>>(new Set());
  const [selectedCurrent, setSelectedCurrent] = useState<Set<number>>(
    new Set(),
  );
  const [itemsViewMode, setItemsViewMode] = useState<"list" | "grid">(() => {
    try {
      return (
        (localStorage.getItem("slp_profile_items_view_mode") as
          | "list"
          | "grid") || "grid"
      );
    } catch {
      return "grid";
    }
  });
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [editingPriceQty, setEditingPriceQty] =
    useState<EditingPriceQtyTarget | null>(null);
  const [profileContextMenu, setProfileContextMenu] = useState<{
    item: any;
    itemRealIndex: number;
    isPast: boolean;
    fullCommentContent: string;
    itemUnitPrice: number;
    itemQty: number;
    itemTotalK: number;
  } | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const startLongPress = (
    item: any,
    itemRealIndex: number,
    isPast: boolean,
    fullCommentContent: string,
    itemUnitPrice: number,
    itemQty: number,
    itemTotalK: number,
  ) => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      setProfileContextMenu({
        item,
        itemRealIndex,
        isPast,
        fullCommentContent,
        itemUnitPrice,
        itemQty,
        itemTotalK,
      });
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const isChildOpen = Boolean(
    isCalculatorOpen || editingPriceQty || profileContextMenu || showBillPreview,
  );
  const { modalStyle, touchHandlers } = useSwipeToDismiss({
    onClose,
    enabled: !isChildOpen,
  });

  const totalSelectedCount = selectedCurrent.size + selectedPast.size;
  const totalSelectedPriceK =
    Array.from(selectedCurrent).reduce(
      (sum, i) => sum + (cust?.items?.[i]?.price || 0),
      0,
    ) +
    Array.from(selectedPast).reduce(
      (sum, i) => sum + (cust?.pastItems?.[i]?.price || 0),
      0,
    );

  // Phí ship & Tiền cọc trực tiếp tại hóa đơn đẩy đơn (Yêu cầu: Thêm ship và trừ cọc, bấm xác nhận là đẩy luôn)
  const isGheLayCust = isCustomerGheLay(
    store[platform].gheLayTags,
    cleanUser,
    store[platform].tags,
  );
  const isNtCust = isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser);

  const [directShippingFee, setDirectShippingFee] = useState<number>(() => {
    if (isGheLayCust) return 0;
    if (isNtCust) return 15000;
    return 20000;
  });

  const [directPrepaidAmount, setDirectPrepaidAmount] = useState<number>(() => {
    const custTag = store[platform]?.tags?.[cleanUser];
    if (custTag === "COC") return 50000;
    if (custTag === "COC_100") return 100000;
    return 0;
  });

  const [isDirectPushing, setIsDirectPushing] = useState(false);
  const [directPushError, setDirectPushError] = useState<string | null>(null);
  const [directPushSuccess, setDirectPushSuccess] = useState<string | null>(null);

  // Tự động cập nhật phí ship theo tag khách hàng (0đ Ghé lấy, 15k Ninh Thuận, 20k Toàn quốc)
  useEffect(() => {
    if (isGheLayCust) {
      setDirectShippingFee(0);
    } else if (isNtCust) {
      setDirectShippingFee(15000);
    } else {
      setDirectShippingFee(20000);
    }
  }, [isGheLayCust, isNtCust]);

  // Tự động nhận diện tiền cọc từ tag khách hàng
  useEffect(() => {
    const custTag = store[platform]?.tags?.[cleanUser];
    if (custTag === "COC") {
      setDirectPrepaidAmount(50000);
    } else if (custTag === "COC_100") {
      setDirectPrepaidAmount(100000);
    }
  }, [store[platform]?.tags?.[cleanUser]]);

  // Hàm đẩy đơn trực tiếp từ hóa đơn xác nhận - không cần chuyển sang trang khác
  const handleDirectPushOrder = async () => {
    if (totalSelectedCount === 0 || isDirectPushing) return;
    setIsDirectPushing(true);
    setDirectPushError(null);
    setDirectPushSuccess(null);

    try {
      const selectedCurrentItemsWithIdx = Array.from(selectedCurrent)
        .sort((a, b) => a - b)
        .map((i) => ({ item: cust?.items?.[i], idx: i, isPast: false }))
        .filter((x) => Boolean(x.item));

      const selectedPastItemsWithIdx = Array.from(selectedPast)
        .sort((a, b) => a - b)
        .map((i) => ({ item: cust?.pastItems?.[i], idx: i, isPast: true }))
        .filter((x) => Boolean(x.item));

      const allSelectedList = [
        ...selectedCurrentItemsWithIdx,
        ...selectedPastItemsWithIdx,
      ];

      const mainSelectedList = allSelectedList.filter(({ item }) => !isPhuShipItem(item.content));
      const totalMainQty = mainSelectedList.reduce((sum, { item }) => sum + (item.quantity || 1), 0);
      const isSingleItemOrder = totalMainQty === 1 && directShippingFee > 0;

      const baseItemsPayload = mainSelectedList.map(({ item, isPast }) => {
        const itemUnitPrice =
          item.unitPrice ||
          (item.quantity && item.price
            ? Math.round(item.price / item.quantity)
            : item.price);
        const itemQty = item.quantity || 1;
        const itemTotalK = item.price || itemUnitPrice * itemQty;

        const sourceComment = item.sourceCommentId
          ? store[platform].comments?.find((c) => c.id === item.sourceCommentId)
          : null;
        const sourceCommentStr = sourceComment
          ? typeof sourceComment.content === "object"
            ? JSON.stringify(sourceComment.content)
            : String(sourceComment.content || "")
          : "";
        const rawContent =
          item.content && !item.content.includes("(Không ghi chú)")
            ? item.content.trim()
            : "";
        const fullCommentContent =
          sourceCommentStr || rawContent || `Sản phẩm ${itemUnitPrice}k`;

        return {
          id: item.id,
          content: fullCommentContent,
          price: itemTotalK,
          unitPrice: itemUnitPrice,
          quantity: itemQty,
          isPast: isPast,
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

      const pLink = (
        pancakeInput.trim() ||
        store[platform].pancakeLinks?.[cleanUser] ||
        ""
      ).trim();
      const currentCustTag = store[platform].tags?.[cleanUser];
      const activeInsight = insight || getCustomerInsight(cleanUser);
      const parsed = parsePancakeUrlIds(pLink);
      const pId =
        activeInsight?.pancakePageId ||
        parsed.pageId ||
        (pLink.includes("pzl") ? "pzl_2007152536191688636" : undefined);
      const cId =
        activeInsight?.pancakeConvId ||
        parsed.convId ||
        (pLink.startsWith("pzl_") ? pLink : undefined);

      const res = await pushCustomerOrderToPancake({
        platform,
        user: cleanUser,
        nickname,
        pancakeLink: pLink,
        items: itemsPayload,
        shippingFee: directShippingFee,
        prepaid: directPrepaidAmount,
        tag: currentCustTag,
        isGheLay: isGheLayCust,
        isNinhThuan: directShippingFee === 15000 || isNtCust,
        ninhThuanTag: isNtCust,
        customCustomerInfo: {
          name:
            activeInsight?.matchedName ||
            activeInsight?.latestOrder?.billFullName ||
            undefined,
          phone:
            activeInsight?.matchedPhone ||
            activeInsight?.latestOrder?.billPhoneNumber ||
            (isShopPhone(pLink) ? undefined : pLink) ||
            undefined,
          address:
            activeInsight?.matchedAddress ||
            activeInsight?.latestOrder?.billAddress ||
            undefined,
          pageId: pId,
          conversationId: cId,
        },
        sendNotificationMessage: true,
      });

      if (!res.success) {
        setDirectPushError(
          res.error ||
            "Không thể đẩy đơn lên Pancake lúc này. Vui lòng kiểm tra kết nối!",
        );
        setIsDirectPushing(false);
        return;
      }

      const orderNum = res.order?.order_number
        ? String(res.order.order_number)
        : res.order?.id
          ? String(res.order.id)
          : "";
      setDirectPushSuccess(
        `✅ Đã đẩy đơn #${orderNum || ""} lên Pancake POS thành công!`,
      );

      // Tự động gỡ tag cọc nếu có
      if (currentCustTag === "COC" || currentCustTag === "COC_100") {
        store.setCustomerTag(platform, cleanUser, "NORMAL");
      }

      // Lưu lịch sử đẩy đơn
      const pushedItemsToRecord: OrderItem[] = itemsPayload.map((it, idx) => ({
        id: it.id || `pushed_${Date.now()}_${idx}`,
        content: it.content,
        price: it.price,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        sourceCommentId: null,
        createdAt: Date.now(),
      }));

      const isPushingAll =
        selectedCurrent.size >= (cust?.items?.length || 0) &&
        selectedPast.size >= (cust?.pastItems?.length || 0);

      store.recordPushOrderHistory(platform, cleanUser, {
        orderNumber: orderNum,
        pancakeOrderId: res.order?.id ? String(res.order.id) : undefined,
        items: pushedItemsToRecord,
        shippingFee: directShippingFee,
        prepaid: directPrepaidAmount,
        clearAllCart: isPushingAll,
        pushedCurrentIndices: Array.from(selectedCurrent),
        pushedPastIndices: Array.from(selectedPast),
      });

      // Bỏ chọn các món đã đẩy
      setSelectedCurrent(new Set());
      setSelectedPast(new Set());

      // Kích hoạt đồng bộ Pancake lại
      if (pLink) {
        triggerPancakeSync(pLink);
      }
    } catch (err: any) {
      console.error("Lỗi khi trực tiếp đẩy đơn:", err);
      setDirectPushError(err?.message || "Lỗi khi đẩy đơn vào Pancake POS.");
    } finally {
      setIsDirectPushing(false);
    }
  };

  const triggerPancakeSync = async (linkVal: string) => {
    const clean = linkVal.trim();
    if (!clean) return;
    setIsSyncingPancake(true);
    try {
      const res = await syncSingleCustomerPancakeOrders(
        cleanUser,
        platform,
        clean,
      );
      if (res) {
        setInsight(res);
      }
    } catch (err) {
      console.error("Lỗi khi đồng bộ đơn Pancake cho khách:", err);
    } finally {
      setIsSyncingPancake(false);
    }
  };

  useEffect(() => {
    const handleUpdated = (e: any) => {
      const updatedUser = e?.detail?.user;
      if (!updatedUser || normalizeUser(updatedUser) === cleanUser) {
        setInsight(e?.detail?.insight || getCustomerInsight(cleanUser));
      }
    };
    window.addEventListener("pancake_insights_updated", handleUpdated);

    // Tự động kiểm tra đơn hàng Pancake khi mở hồ sơ khách nếu đã nối link
    if (pancakeInput.trim()) {
      triggerPancakeSync(pancakeInput.trim());
    }

    return () => {
      window.removeEventListener("pancake_insights_updated", handleUpdated);
    };
  }, [cleanUser, platform]);

  const handleSaveLink = (linkVal: string) => {
    const clean = linkVal.trim();
    store.setCustomerPancakeLink(platform, cleanUser, clean);
    if (clean) {
      triggerPancakeSync(clean);
    }
  };

  const tag = store[platform]?.tags?.[cleanUser] || "NORMAL";

  const avatarUrl = getCustomerAvatar(cleanUser, platform) || undefined;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-0"
      {...touchHandlers}
    >
      <div
        style={modalStyle}
        className="bg-[#1c242f] w-full h-full flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header banner với thanh vuốt để đóng (đã bỏ dấu x theo yêu cầu) */}
        <div
          className={`h-7 relative ${PLATFORMS[platform].bgClass} shrink-0 flex items-center justify-center`}
        >
          <div
            className="w-12 h-1 bg-white/40 rounded-full"
            title="Vuốt xuống để đóng hồ sơ"
          />
        </div>

        {/* Sticky Profile Header */}
        <div className="px-3.5 py-2.5 bg-[#17212e] shrink-0 border-b border-white/10 shadow-sm relative z-10">
          {/* Hàng 1: Avatar + Tên khách & Nickname + Nút Thêm Món */}
          <div className="flex items-center justify-between gap-2.5">
            {/* Cụm Avatar + Tên khách + Biệt danh */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Avatar */}
              <div className="shrink-0">
                <CustomerAvatar
                  user={cleanUser}
                  platform={platform}
                  avatarUrl={avatarUrl}
                  tag={tag}
                  size="md"
                />
              </div>

              {/* Tên khách & Nickname */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Dòng 1: Mã ID, Tên gợi nhớ (trước), Tên chính của khách & Badges */}
                <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                  {/* Mã ID khách hàng */}
                  <span
                    className="text-[11px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 select-all"
                    title={`Mã ID khách: #${getShortId(cleanUser)}`}
                  >
                    #{getShortId(cleanUser)}
                  </span>

                  {/* Tên gợi nhớ (trước tên chính) - Hiển thị dạng chữ tự nhiên, không đóng khung dạng tag */}
                  {(nickname || store[platform].nicknames?.[cleanUser]) && (
                    <span 
                      className="text-xs font-black text-amber-300 shrink-0"
                      title={`Tên gợi nhớ: ${nickname || store[platform].nicknames?.[cleanUser]}`}
                    >
                      ({nickname || store[platform].nicknames?.[cleanUser]})
                    </span>
                  )}

                  {/* Tên chính của khách */}
                  <span
                    className="text-base font-black text-white leading-tight truncate shrink-0 max-w-[160px] sm:max-w-[240px]"
                    title={cleanUser}
                  >
                    {cleanUser}
                  </span>

                  {isCustomerGheLay(
                    store[platform].gheLayTags,
                    cleanUser,
                    store[platform].tags,
                  ) ? (
                    <GheLayBadge className="text-[9px] shrink-0" />
                  ) : isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser) ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-0.5">
                      <ThapChamIcon className="w-2.5 h-2.5" />
                      <span>NT</span>
                    </span>
                  ) : null}
                  <CopyButton
                    text={
                      (nickname || store[platform].nicknames?.[cleanUser])
                        ? `(${nickname || store[platform].nicknames?.[cleanUser]}) ${cleanUser}`
                        : `#${getShortId(cleanUser)} ${cleanUser}`
                    }
                    className="text-xs shrink-0 text-gray-400 hover:text-white p-0.5"
                  />
                </div>

                {/* Dòng 2: Nickname Input gọn gàng & thanh lịch */}
                <div className="flex items-center">
                  <div className="relative flex-1 max-w-[220px] sm:max-w-[260px] flex items-center">
                    <span className="absolute left-2 text-[10px] text-amber-400/80 pointer-events-none select-none">
                      ✏️
                    </span>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      onBlur={() =>
                        store.setCustomerNickname(
                          platform,
                          cleanUser,
                          nickname.trim(),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="Biệt danh / gợi nhớ..."
                      className="w-full pl-6 pr-6 py-0.5 bg-[#0a1018]/90 hover:bg-[#0c1420] focus:bg-[#0c1420] border border-white/10 hover:border-white/20 focus:border-amber-400/60 rounded-md font-semibold text-amber-300 placeholder-gray-500 text-xs focus:outline-none transition-all"
                    />
                    {nickname ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNickname("");
                          store.setCustomerNickname(platform, cleanUser, "");
                        }}
                        title="Xoá tên gợi nhớ"
                        className="absolute right-1.5 text-gray-400 hover:text-rose-400 text-xs p-0.5 font-bold cursor-pointer transition-colors"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Nút Thêm Món góc phải (chỉ hiển thị dấu + gọn gàng) */}
            <div className="shrink-0 self-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCalculatorOpen(true);
                }}
                title="Thêm món mới (Mở bảng tính Đơn giá x SL)"
                className="text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-90 w-8 h-8 rounded-xl border border-emerald-400/50 transition-all cursor-pointer inline-flex items-center justify-center font-black shadow-md shrink-0"
              >
                <Plus size={18} className="stroke-[3]" />
              </button>
            </div>
          </div>
        </div>

          {/* Hàng 2: Card Tổng hợp Đã Chốt & Tổng Tiền */}
          {(() => {
            const activeInsight = insight || getCustomerInsight(cleanUser);
            const sStat = checkCustomerPancakeShippedStatus(
              cust,
              activeInsight,
            );
            const currentItems = cust?.items || [];
            const pastItems = cust?.pastItems || [];

            // 1. Đang chốt (nghĩa là đơn đang chốt hôm nay)
            const activeCurrentItems = sStat.isAllShipped
              ? []
              : currentItems.filter((it) => {
                  if (it.shipped || isGhostZeroPriceItem(it)) return false;
                  if (!sStat.hasPancakeOrders || sStat.latestPancakeTime <= 0)
                    return true;
                  const itTime = it.createdAt
                    ? parseOrderTimestamp(it.createdAt)
                    : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) ||
                      0;
                  return itTime > sStat.latestPancakeTime + 120000;
                });
            const dangChotQty = activeCurrentItems.reduce(
              (sum, it) => sum + (it.quantity || 1),
              0,
            );
            const dangChotTotal = activeCurrentItems.reduce(
              (sum, it) => sum + (it.price || 0),
              0,
            );

            // 2. Đang giữ đơn (các phiên trước): Đơn mới nhất Pancake >= ngày đang có đơn thì tự động HẾT GIỮ ĐƠN
            const activePastList = sStat.isAllShipped
              ? []
              : getCustomerActivePastItems(cust, activeInsight);
            const dangGiuQty = activePastList.reduce(
              (sum, { item: it }) => sum + (it.quantity || 1),
              0,
            );
            const dangGiuTotal = activePastList.reduce(
              (sum, { item: it }) => sum + (it.price || 0),
              0,
            );

            // 3. Đã chốt = TỔNG của "Đang chốt" và "Đang giữ"
            const daChotQty = sStat.isAllShipped ? 0 : dangChotQty + dangGiuQty;
            const daChotTotal = sStat.isAllShipped
              ? 0
              : dangChotTotal + dangGiuTotal;

            return (
              <div className="bg-[#0e1621] border border-white/10 rounded-xl p-2.5 shadow-sm space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-950/60 border border-blue-500/30 py-1.5 px-2 rounded-lg flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-300">
                      ĐÃ CHỐT:
                    </span>
                    <span className="text-xs sm:text-sm font-black text-blue-200 font-mono leading-none flex items-center gap-1">
                      <span>{daChotQty} cái</span>
                      {sStat.isAllShipped && (
                        <span className="text-[9px] text-emerald-400 font-bold ml-1">
                          ✓ Đã đi
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="bg-emerald-950/60 border border-emerald-500/30 py-1.5 px-2 rounded-lg flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-300">
                      TỔNG TIỀN:
                    </span>
                    <span className="text-xs sm:text-sm font-black text-emerald-300 font-mono leading-none">
                      {daChotTotal}k
                      {sStat.isAllShipped && (
                        <span className="text-[9px] text-emerald-400 font-bold ml-1">
                          (0k nợ)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {(dangChotQty > 0 || dangGiuQty > 0) && !sStat.isAllShipped && (
                  <div className="text-[11px] text-gray-400 flex items-center justify-between px-1 pt-1 border-t border-white/5">
                    <span>
                      🛍️ Đang chốt:{" "}
                      <strong className="text-cyan-300 font-mono">
                        {dangChotQty} cái ({dangChotTotal}k)
                      </strong>
                    </span>
                    {dangGiuQty > 0 && (
                      <span>
                        ⏳ Đang giữ:{" "}
                        <strong className="text-amber-300 font-mono">
                          {dangGiuQty} cái ({dangGiuTotal}k)
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        <div className="overflow-y-auto flex-1 px-4 pt-4 pb-5">
          <div className="mb-5 bg-[#0e1621] p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 ml-1">
              🏷️ Nhãn:
            </span>
            <div className="flex flex-wrap gap-1 shrink-0">
              {(
                [
                  "NORMAL",
                  "VIP",
                  "COC",
                  "COC_100",
                  "GIU",
                  "GHE_LAY",
                  "DAO",
                  "BOM",
                  "CHAN",
                  "HOST",
                ] as const
              ).map((t) => (
                <button
                  key={t}
                  onClick={() => store.setCustomerTag(platform, cleanUser, t)}
                  className={`py-1 px-2.5 text-[11px] font-bold rounded-md border transition-all cursor-pointer ${
                    tag === t
                      ? t === "NORMAL"
                        ? "bg-green-600 border-green-600 text-white shadow-sm"
                        : t === "VIP"
                          ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                          : t === "COC"
                            ? "bg-cyan-600 border-cyan-600 text-white shadow-sm"
                            : t === "COC_100"
                              ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                              : t === "GIU"
                                ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                                : t === "GHE_LAY"
                                  ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                  : t === "DAO"
                                    ? "bg-gray-700 border-gray-600 text-white shadow-sm"
                                    : t === "CHAN"
                                      ? "bg-black border-black text-white shadow-sm"
                                      : t === "HOST"
                                        ? "bg-purple-600 border-purple-600 text-white shadow-sm"
                                        : "bg-red-600 border-red-600 text-white shadow-sm"
                      : "bg-[#1c242f] border-white/10 text-gray-400 hover:bg-[#1c242f]"
                  }`}
                >
                  {t === "NORMAL"
                    ? "Thường"
                    : t === "VIP"
                      ? "🌟 Quen"
                      : t === "COC"
                        ? "💧 Cọc 50k"
                        : t === "COC_100"
                          ? "💧 Cọc 100k"
                          : t === "GIU"
                            ? "📦 Giữ"
                            : t === "GHE_LAY"
                              ? "🛵 Ghé lấy"
                              : t === "DAO"
                                ? "👻 Dạo"
                                : t === "CHAN"
                                  ? "⛔ Chặn"
                                  : t === "HOST"
                                    ? "👑"
                                    : "⚠️ BOM"}
                </button>
              ))}
              <div className="h-4 w-px bg-white/20 self-center mx-1 shrink-0" />
              <button
                type="button"
                onClick={() => store.toggleNinhThuanTag(platform, cleanUser)}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser)
                    ? "bg-amber-600 border-amber-400 text-white shadow-sm ring-1 ring-amber-300"
                    : "bg-[#1c242f] border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title="Tag Ninh Thuận (chọn đồng thời với các tag khác)"
              >
                <ThapChamIcon className="w-3 h-3" />
                <span>Ninh Thuận</span>
              </button>
              <button
                type="button"
                onClick={() => store.toggleGheLayTag(platform, cleanUser)}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  isCustomerGheLay(
                    store[platform].gheLayTags,
                    cleanUser,
                    store[platform].tags,
                  )
                    ? "bg-emerald-600 border-emerald-400 text-white shadow-sm ring-1 ring-emerald-300"
                    : "bg-[#1c242f] border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title="Tag Ghé lấy (0đ phí ship - chọn đồng thời với các tag khác)"
              >
                <span>🛵</span>
                <span>Ghé lấy</span>
              </button>
            </div>
          </div>

          {/* 🥞 THÔNG TIN PANCAKE POS & LỊCH SỬ ĐI ĐƠN */}
          {(() => {
            const activeInsight = insight || getCustomerInsight(cleanUser);
            const hasLink =
              !!(pancakeInput && pancakeInput.trim()) ||
              !!activeInsight?.pancakeConvUrl;
            const shippedStatus = checkCustomerPancakeShippedStatus(
              cust,
              activeInsight,
            );
            const allOrders =
              activeInsight?.ordersHistory ||
              (activeInsight?.latestOrder ? [activeInsight.latestOrder] : []);

            // Lọc các đơn đã giao thành công
            const successfulOrders = allOrders.filter((ord) => {
              const pStatus = (ord.partnerStatus || "").toLowerCase();
              return (
                ord.isSuccess ||
                ord.status === 3 ||
                ord.status === 4 ||
                pStatus.includes("delivered") ||
                pStatus.includes("success") ||
                pStatus.includes("giao thanh cong")
              );
            });
            // Hiển thị danh sách đơn thành công (nếu người dùng bật xem tất cả thì hiện allOrders)
            const ordersToDisplay = showAllOrders
              ? allOrders
              : successfulOrders.length > 0
                ? successfulOrders
                : allOrders;
            const displayedOrders = ordersToDisplay;
            const succeedCount =
              activeInsight?.succeedOrderCount !== undefined
                ? activeInsight.succeedOrderCount
                : successfulOrders.length;
            const returnedCount =
              activeInsight?.returnedOrderCount !== undefined
                ? activeInsight.returnedOrderCount
                : 0;
            const totalPurchased =
              activeInsight?.purchasedAmount !== undefined
                ? activeInsight.purchasedAmount
                : activeInsight?.totalSpent ||
                  successfulOrders.reduce((sum, o) => sum + o.totalPrice, 0);

            if (!hasLink) {
              return (
                <div className="mb-4 bg-gradient-to-br from-[#1a2230] to-[#121822] p-3 rounded-xl border border-orange-500/25 space-y-2 shadow-md">
                  {/* Hàng trên cùng: Icon + Tên khách POS đưa lên trên và to lên ngang với các icon kia */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xl shrink-0">🥞</span>
                      <div
                        className="text-base sm:text-lg font-black text-orange-200 truncate tracking-tight"
                        title={cleanUser}
                      >
                        {cleanUser}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Nút đồng bộ lại: CHỈ LÀ ICON THÔI */}
                      <button
                        type="button"
                        onClick={() => triggerPancakeSync(pancakeInput)}
                        disabled={isSyncingPancake}
                        title="Đồng bộ lại toàn bộ đơn hàng từ Pancake POS"
                        className="p-1.5 text-orange-300 hover:text-white bg-orange-950/40 hover:bg-orange-800/50 rounded-lg border border-orange-500/30 flex items-center justify-center cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw
                          size={14}
                          className={isSyncingPancake ? "animate-spin" : ""}
                        />
                      </button>

                      {/* Chưa liên kết thì là nút GÁN */}
                      <button
                        type="button"
                        onClick={() => onOpenPancakeLink?.(cleanUser, platform)}
                        title="Gán link hoặc chọn khách Zalo từ danh sách inbox"
                        className="text-xs font-bold text-amber-300 hover:text-white bg-amber-950/60 hover:bg-amber-800/70 px-2.5 py-1.5 rounded-lg border border-amber-500/40 flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <Plus size={13} className="stroke-[2.5]" />
                        <span>Gán</span>
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Chưa liên kết Pancake POS. Bấm <strong className="text-amber-300 font-bold">"Gán"</strong> để kết nối khách Zalo.
                  </div>
                </div>
              );
            }

            return (
              <div className="mb-4 bg-gradient-to-br from-[#172335] to-[#121c2b] p-3 rounded-xl border border-orange-500/30 space-y-2.5 shadow-md">
                {/* HÀNG TRÊN CÙNG: TÊN KHÁCH POS ĐƯA LÊN TRÊN VÀ TO LÊN NGANG VỚI MẤY CÁI ICON KIA */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xl shrink-0">🥞</span>
                    <div
                      className="text-base sm:text-lg font-black text-orange-200 truncate tracking-tight"
                      title={activeInsight?.matchedName || cleanUser}
                    >
                      {activeInsight?.matchedName || cleanUser}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Nút đồng bộ lại: CHỈ LÀ ICON THÔI */}
                    <button
                      type="button"
                      onClick={() => triggerPancakeSync(pancakeInput)}
                      disabled={isSyncingPancake}
                      title="Đồng bộ lại toàn bộ đơn hàng từ Pancake POS"
                      className="p-1.5 text-orange-300 hover:text-white bg-orange-950/40 hover:bg-orange-800/50 rounded-lg border border-orange-500/30 flex items-center justify-center cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw
                        size={14}
                        className={isSyncingPancake ? "animate-spin" : ""}
                      />
                    </button>

                    {/* Nút liên kết Pancake: Nếu đã có link thì Mở Pancake, chưa có thì là nút Gán (Đã bỏ cái (quen 11 đơn thành công) đi) */}
                    <button
                      type="button"
                      onClick={() => {
                        const link =
                          pancakeInput.trim() ||
                          store[platform].pancakeLinks?.[cleanUser] ||
                          activeInsight?.pancakeConvUrl ||
                          "";
                        if (link) {
                          try {
                            sessionStorage.setItem("slp_active_modal", "profile");
                            sessionStorage.setItem(
                              "slp_profile_user",
                              JSON.stringify({ user: cleanUser, platform }),
                            );
                            sessionStorage.setItem(
                              "slp_modal_time",
                              String(Date.now()),
                            );
                          } catch {}
                          openPancakeApp(link, true);
                        } else {
                          onOpenPancakeLink?.(cleanUser, platform);
                        }
                      }}
                      title="Mở cuộc hội thoại trên Pancake / Zalo"
                      className="text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 px-2.5 py-1.5 rounded-lg border border-orange-400/40 flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Smartphone size={13} />
                      <span>Mở Pancake</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPancakeLink?.(cleanUser, platform)}
                      title="Đổi hoặc chọn lại khách Zalo khác"
                      className="p-1.5 text-gray-400 hover:text-amber-300 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                    >
                      <Edit3 size={13} />
                    </button>
                  </div>
                </div>

                {/* Banner trạng thái: ĐÃ ĐI HẾT ĐƠN TRÊN PANCAKE POS */}
                {shippedStatus.isAllShipped &&
                  shippedStatus.latestPancakeOrder && (
                    <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-xl p-3 flex items-start justify-between gap-2.5 shadow-md animate-fadeIn">
                      <div className="flex items-start gap-2.5">
                        <span className="text-xl shrink-0 mt-0.5">✅</span>
                        <div>
                          <div className="text-xs font-black text-emerald-300 uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                            <span>ĐÃ ĐI HẾT ĐƠN TRÊN PANCAKE POS</span>
                            <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-[10px] px-2 py-0.2 rounded font-mono font-bold">
                              #{shippedStatus.latestPancakeOrder.orderNumber}
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-100/90 mt-1 leading-relaxed">
                            Đơn gần nhất trên Pancake{" "}
                            {shippedStatus.latestPancakeOrder.insertedAt
                              ? "(" +
                                formatDateTime(
                                  shippedStatus.latestPancakeOrder.insertedAt,
                                ) +
                                ")"
                              : ""}{" "}
                            đã xử lý xong toàn bộ đơn chốt!
                          </div>
                        </div>
                      </div>
                      {cust?.pastItems && cust.pastItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            store.clearShippedPastItems(platform, cleanUser);
                          }}
                          title="Dọn sạch danh sách lịch sử các đơn cũ đã đi"
                          className="text-[10px] font-bold text-emerald-300 hover:text-white bg-emerald-900/60 hover:bg-emerald-800 px-2 py-1 rounded-lg border border-emerald-500/40 shrink-0 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
                        >
                          🧹 Dọn lịch sử cũ ({cust.pastItems.length})
                        </button>
                      )}
                    </div>
                  )}

                {/* Kết quả kiểm tra đơn Pancake (nếu có) */}
                {pancakeCheckResult?.found && pancakeCheckResult.order && (
                  <div className="bg-gradient-to-r from-[#0e271c] via-[#143929] to-[#0e271c] border-2 border-emerald-500/70 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-lg shadow-emerald-950/40 animate-fadeIn">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0 mt-0.5">🥞</span>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-emerald-300 uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                          <span>
                            KẾT QUẢ KIỂM TRA: TÌM THẤY ĐƠN #
                            {pancakeCheckResult.order.orderNumber}
                          </span>
                          {pancakeCheckResult.order.insertedAt && (
                            <span className="text-[10px] text-emerald-200/80 font-normal">
                              (
                              {formatDateTime(
                                pancakeCheckResult.order.insertedAt,
                              )}
                              )
                            </span>
                          )}
                          <span className="bg-emerald-500/25 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded border border-emerald-500/40 font-bold">
                            {
                              getOrderStatusLabel(
                                pancakeCheckResult.order.status,
                              ).text
                            }
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-100/95 mt-1 leading-snug">
                          Khách có đơn{" "}
                          <strong>
                            #{pancakeCheckResult.order.orderNumber}
                          </strong>{" "}
                          (
                          {pancakeCheckResult.order.totalQuantity ||
                            pancakeCheckResult.order.items?.length ||
                            1}{" "}
                          món -{" "}
                          {new Intl.NumberFormat("vi-VN").format(
                            pancakeCheckResult.order.totalPrice || 0,
                          )}
                          đ) trên Pancake POS.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          store.markAllCustomerItemsShipped(
                            platform,
                            cleanUser,
                            false,
                          );
                          setPancakeCheckResult(null);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-3 py-1.5 rounded-lg shadow-md cursor-pointer transition-all flex items-center gap-1 active:scale-95 whitespace-nowrap"
                      >
                        <span>✅ Xác nhận đã đi đơn</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPancakeCheckResult(null)}
                        className="text-gray-400 hover:text-white text-xs px-1.5 py-1"
                        title="Đóng kết quả"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
                {pancakeCheckResult && !pancakeCheckResult.found && (
                  <div className="bg-[#0e1622] border border-white/10 rounded-xl p-2.5 flex items-center justify-between text-xs text-gray-300 animate-fadeIn">
                    <span className="flex items-center gap-1.5">
                      <span>ℹ️</span>
                      <span>{pancakeCheckResult.message}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPancakeCheckResult(null)}
                      className="text-gray-400 hover:text-white px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Thẻ thông tin mua hàng & SĐT / Tỉnh */}
                <div className="bg-[#0c141f] p-2.5 rounded-xl border border-orange-500/20 space-y-2 text-xs shadow-inner">
                  {/* Hàng 1: Tổng tiền đã mua (đã bỏ cái quen / 11 đơn thành công theo yêu cầu) */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-400 text-[11px]">Đã mua:</span>
                    <span className="font-mono font-black text-orange-300 text-sm sm:text-base">
                      {new Intl.NumberFormat("vi-VN").format(totalPurchased)}đ
                    </span>
                  </div>

                  {/* Hàng 2: SĐT & Tỉnh (chỉ hiện tỉnh, không dài dòng chi tiết) */}
                  {(activeInsight?.matchedPhone || activeInsight?.matchedAddress) && (
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5 text-[11.5px]">
                      {activeInsight.matchedPhone ? (
                        <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold">
                          <Phone size={12} className="shrink-0" />
                          <span>{activeInsight.matchedPhone}</span>
                          <CopyButton
                            text={activeInsight.matchedPhone}
                            className="text-[10px] text-gray-400 hover:text-white p-0.5"
                          />
                        </div>
                      ) : (
                        <div />
                      )}

                      {activeInsight.matchedAddress && (
                        <div
                          className="flex items-center gap-1 text-cyan-300 font-medium truncate"
                          title={activeInsight.matchedAddress}
                        >
                          <MapPin size={12} className="shrink-0 text-cyan-400" />
                          <span className="truncate">
                            Tỉnh: <strong className="text-cyan-200 font-bold">{extractProvince(activeInsight.matchedAddress)}</strong>
                          </span>
                          <CopyButton
                            text={activeInsight.matchedAddress}
                            className="text-[10px] text-gray-400 hover:text-white p-0.5 shrink-0"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {returnedCount > 0 && (
                    <div className="text-[10px] text-rose-300 bg-rose-950/30 px-2 py-0.5 rounded border border-rose-500/20 flex items-center justify-between">
                      <span>Số đơn hoàn trả:</span>
                      <span className="font-bold">{returnedCount} đơn</span>
                    </div>
                  )}
                </div>

                {/* Đơn hàng gần nhất từ Pancake POS: Chỉ hiển thị 1 đơn gần nhất */}
                <div className="space-y-2 pt-1 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                    <div className="flex items-center gap-1.5">
                      <span>📦 Đơn gần nhất trên Pancake POS:</span>
                    </div>
                    {allOrders.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowAllOrders(!showAllOrders)}
                        className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer underline"
                      >
                        {showAllOrders
                          ? "Thu gọn (1 đơn)"
                          : `Xem tất cả (${allOrders.length} đơn)`}
                      </button>
                    )}
                  </div>

                  {allOrders.length === 0 ? (
                    <div className="text-center py-2.5 text-xs text-gray-400 bg-[#09101a] rounded-lg border border-white/5">
                      Chưa có đơn hàng nào trên Pancake POS
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5 custom-scrollbar">
                      {allOrders
                        .slice(0, showAllOrders ? 50 : 1)
                        .map((ord, oIdx) => {
                          const statusMeta = getOrderStatusLabel(ord.status);
                          const formattedDate = ord.insertedAt
                            ? new Date(ord.insertedAt).toLocaleString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "";

                          return (
                            <div
                              key={ord.id || oIdx}
                              className="bg-[#0b1320] p-2.5 rounded-lg border border-white/10 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-orange-300">
                                    #{ord.orderNumber}
                                  </span>
                                  {formattedDate && (
                                    <span className="text-[10px] text-gray-400">
                                      ({formattedDate})
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusMeta.color}`}
                                >
                                  {statusMeta.text}
                                </span>
                              </div>

                              {/* Items list */}
                              {ord.items && ord.items.length > 0 && (
                                <div className="bg-black/20 p-1.5 rounded space-y-0.5 text-[11px] text-gray-300">
                                  {ord.items.map((it: any, iIdx: number) => (
                                    <div
                                      key={iIdx}
                                      className="flex justify-between items-center gap-1 truncate"
                                    >
                                      <span className="truncate">
                                        {it.name}{" "}
                                        <span className="text-gray-400">
                                          x{it.quantity}
                                        </span>
                                      </span>
                                      <span className="font-mono text-orange-200 shrink-0">
                                        {(it.price || 0).toLocaleString(
                                          "vi-VN",
                                        )}
                                        đ
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-0.5 text-[11px]">
                                <div className="flex items-center gap-1 text-gray-400 truncate">
                                  {ord.partnerName && (
                                    <span>🚚 {ord.partnerName}</span>
                                  )}
                                  {ord.trackingCode && (
                                    <span className="font-mono text-cyan-300">
                                      ({ord.trackingCode})
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-emerald-400 font-mono text-xs">
                                  {ord.totalPrice.toLocaleString("vi-VN")}đ
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {(() => {
            const activeInsight = insight || getCustomerInsight(cleanUser);
            const sStat = checkCustomerPancakeShippedStatus(
              cust,
              activeInsight,
            );
            const currentItems = cust?.items || [];
            const hasCurrentItems = currentItems.length > 0;
            const unshippedCount = currentItems
              .filter((it) => !it.shipped)
              .reduce((sum, it) => sum + (it.quantity || 1), 0);
            const shippedCount = currentItems
              .filter((it) => it.shipped)
              .reduce((sum, it) => sum + (it.quantity || 1), 0);
            const totalCurrentQty = currentItems.reduce(
              (sum, it) => sum + (it.quantity || 1),
              0,
            );
            const allCurrentShipped =
              hasCurrentItems && currentItems.every((it) => it.shipped);

            return (
              <div className="mb-6">
                {/* Thông báo phát hiện đơn Pancake cho các món hôm nay */}
                {sStat.matchingTodayOrder &&
                  hasCurrentItems &&
                  !allCurrentShipped && (
                    <div className="bg-gradient-to-r from-[#0d2218] via-[#112d20] to-[#0d2218] border border-emerald-500/50 rounded-xl p-3 mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-lg shadow-emerald-950/30 animate-fadeIn">
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0 mt-0.5 sm:mt-0">
                          🥞
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-emerald-300 flex items-center gap-1.5 flex-wrap">
                            <span>
                              ĐƠN PANCAKE #
                              {sStat.matchingTodayOrder.orderNumber}
                            </span>
                            <span className="text-[10px] text-emerald-200/80 font-normal">
                              (
                              {formatDateTime(
                                sStat.matchingTodayOrder.insertedAt,
                              )}
                              )
                            </span>
                            <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded border border-emerald-500/30 font-bold">
                              {
                                getOrderStatusLabel(
                                  sStat.matchingTodayOrder.status,
                                ).text
                              }
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-100/90 leading-tight mt-0.5">
                            Khách đã có đơn trên Pancake POS hôm nay. Bấm nút để
                            đánh dấu giỏ hàng này đã đi đơn:
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            store.markAllCustomerItemsShipped(
                              platform,
                              cleanUser,
                              false,
                            );
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap w-full sm:w-auto justify-center"
                        >
                          <span>
                            ✅ Đã Đi Đơn (#
                            {sStat.matchingTodayOrder.orderNumber})
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                <div className="text-sm font-bold text-gray-100 mb-3 flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-black text-white flex items-center gap-1.5">
                      <span>🛒</span>
                      <span>Đang chốt (hôm nay)</span>
                      {currentItems.length > 0 && (
                        <span className="text-xs text-orange-400 font-mono font-bold bg-orange-950/60 px-2 py-0.5 rounded-full border border-orange-500/30">
                          {currentItems.reduce(
                            (sum, it) => sum + (it.quantity || 1),
                            0,
                          )}{" "}
                          món
                        </span>
                      )}
                    </span>
                    {hasCurrentItems && (
                      <label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer text-gray-400 bg-[#1c242f] hover:bg-white/10 px-2 py-1 rounded transition-colors">
                        <input
                          type="checkbox"
                          className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={
                            selectedCurrent.size === currentItems.length &&
                            currentItems.length > 0
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCurrent(
                                new Set(currentItems.map((_, i) => i)),
                              );
                            } else {
                              setSelectedCurrent(new Set());
                            }
                          }}
                        />
                        Chọn tất cả (
                        {currentItems.reduce(
                          (sum, it) => sum + (it.quantity || 1),
                          0,
                        )}
                        )
                      </label>
                    )}
                    {shippedCount > 0 && (
                      <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Đã gửi:{" "}
                        {currentItems
                          .filter((it) => it.shipped)
                          .reduce((sum, it) => sum + (it.quantity || 1), 0)}
                        /
                        {currentItems.reduce(
                          (sum, it) => sum + (it.quantity || 1),
                          0,
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Nút Chuyển đổi Dạng nút bấm máy tính / Dạng danh sách */}
                    <button
                      type="button"
                      onClick={() => {
                        const newMode =
                          itemsViewMode === "list" ? "grid" : "list";
                        setItemsViewMode(newMode);
                        try {
                          localStorage.setItem(
                            "slp_profile_items_view_mode",
                            newMode,
                          );
                        } catch {}
                      }}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs ${
                        itemsViewMode === "grid"
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-400 shadow-md ring-1 ring-blue-400/40"
                          : "bg-[#1c242f] hover:bg-white/10 text-cyan-300 border-cyan-500/30"
                      }`}
                      title={
                        itemsViewMode === "list"
                          ? "Chuyển sang dạng Nút Bấm Máy Tính (4/dòng)"
                          : "Chuyển sang dạng Danh Sách Chi Tiết"
                      }
                    >
                      {itemsViewMode === "grid" ? (
                        <>
                          <span>🧮 Nút bấm</span>
                          <span className="text-[9px] bg-blue-400/30 font-mono px-1 rounded">
                            4/dòng
                          </span>
                        </>
                      ) : (
                        <>
                          <span>📋 Danh sách</span>
                        </>
                      )}
                    </button>

                    {/* Nút THÊM MÓN chính (Dấu + gọn gàng) */}
                    <button
                      type="button"
                      onClick={() => setIsCalculatorOpen(true)}
                      title="Thêm món (Mở bảng tính)"
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm w-7 h-7 sm:w-8 sm:h-8 rounded-xl shadow-md flex items-center justify-center cursor-pointer transition-all active:scale-95 border border-emerald-400/30"
                    >
                      <Plus size={16} className="stroke-[3]" />
                    </button>

                    {/* Nút Tự động gom nhóm các món cùng giá */}
                    {currentItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          store.groupCustomerItemsByPrice(
                            platform,
                            cleanUser,
                            false,
                          )
                        }
                        title="Tự động gom nhóm các món có cùng đơn giá lại với nhau"
                        className="text-[11px] font-bold text-cyan-300 hover:text-white bg-cyan-950/50 hover:bg-cyan-900/70 px-2.5 py-1.5 rounded-xl border border-cyan-500/40 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                      >
                        <span>✨ Gom cùng giá</span>
                      </button>
                    )}

                    {selectedCurrent.size > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            store.markCurrentItemsShipped(
                              platform,
                              cleanUser,
                              Array.from(selectedCurrent),
                              true,
                            );
                          }}
                          className="text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-950/50 hover:bg-emerald-900/60 px-2.5 py-1.5 rounded-xl border border-emerald-500/40 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        >
                          <span>✅ Đã gửi ({selectedCurrent.size})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            store.markCurrentItemsShipped(
                              platform,
                              cleanUser,
                              Array.from(selectedCurrent),
                              false,
                            );
                          }}
                          className="text-[11px] font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/20 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        >
                          <span>↩️ Chưa gửi ({selectedCurrent.size})</span>
                        </button>
                      </>
                    ) : (
                      hasCurrentItems &&
                      unshippedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            store.markCurrentItemsShipped(
                              platform,
                              cleanUser,
                              undefined,
                              true,
                            );
                          }}
                          title="Đánh dấu tất cả các món hôm nay đã gửi"
                          className="text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/50 px-2.5 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>✅ Đã gửi hết ({unshippedCount})</span>
                        </button>
                      )
                    )}
                    {shippedCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          store.archiveShippedCurrentItems(platform, cleanUser)
                        }
                        title="Chuyển các món đã gửi vào danh sách Đang giữ đơn / lịch sử cũ"
                        className="text-[11px] font-bold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/50 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>📦 Dọn vào LS ({shippedCount})</span>
                      </button>
                    )}

                  </div>
                </div>

                <div className="mb-4">
                  {!hasCurrentItems ? (
                    <div className="text-center text-gray-400 py-6 bg-[#0e1621] rounded-2xl border border-dashed border-white/10 text-xs space-y-2">
                      <div>Hôm nay chưa chốt món nào cho khách.</div>
                      <button
                        type="button"
                        onClick={() => setIsCalculatorOpen(true)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
                      >
                        + Bấm vào đây để mở bảng tính thêm món đầu tiên
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#0b121c] rounded-2xl p-2 sm:p-2.5 shadow-md space-y-1">
                      {allCurrentShipped && (
                        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-2.5 mb-2 flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                            <span>🎉</span>
                            <span>
                              Tất cả {totalCurrentQty} món đang chốt hôm nay đã
                              được đánh dấu đi đơn!
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              store.archiveShippedCurrentItems(
                                platform,
                                cleanUser,
                              )
                            }
                            className="text-[10px] font-bold text-emerald-200 hover:text-white bg-emerald-800/60 hover:bg-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-400/40 cursor-pointer transition-all active:scale-95"
                          >
                            📦 Dọn vào các phiên trước
                          </button>
                        </div>
                      )}

                      {/* DANH SÁCH MÓN / NÚT BẤM MÁY TÍNH (4/DÒNG - TỰ ĐỘNG GIÃN RỘNG) */}
                      {itemsViewMode === "grid" ? (
                        <div className="flex flex-wrap gap-2 py-1">
                          {currentItems
                            .map((item, idx) => ({ item, idx }))
                            .filter(({ item }) => !isGhostZeroPriceItem(item))
                            .reverse()
                            .map(({ item, idx }) => {
                              const itemUnitPrice =
                                item.unitPrice ||
                                (item.quantity && item.price
                                  ? Math.round(item.price / item.quantity)
                                  : item.price);
                              const itemQty = item.quantity || 1;
                              const itemTotalK =
                                item.price || itemUnitPrice * itemQty;
                              const isSelected = selectedCurrent.has(idx);

                              const sourceComment = item.sourceCommentId
                                ? store[platform].comments?.find(
                                    (c) => c.id === item.sourceCommentId,
                                  )
                                : null;
                              const sourceCommentStr = sourceComment
                                ? typeof sourceComment.content === "object"
                                  ? JSON.stringify(sourceComment.content)
                                  : String(sourceComment.content || "")
                                : "";
                              const rawContent =
                                item.content &&
                                !item.content.includes("(Không ghi chú)")
                                  ? item.content.trim()
                                  : "";
                              const fullCommentContent =
                                sourceCommentStr ||
                                rawContent ||
                                `${itemUnitPrice}k`;

                              return (
                                <button
                                  key={`grid-current-${idx}`}
                                  type="button"
                                  onTouchStart={() =>
                                    startLongPress(
                                      item,
                                      idx,
                                      false,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onTouchEnd={cancelLongPress}
                                  onTouchMove={cancelLongPress}
                                  onMouseDown={() =>
                                    startLongPress(
                                      item,
                                      idx,
                                      false,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onMouseUp={cancelLongPress}
                                  onMouseLeave={cancelLongPress}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    cancelLongPress();
                                    setProfileContextMenu({
                                      item,
                                      itemRealIndex: idx,
                                      isPast: false,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    });
                                  }}
                                  onClick={() => {
                                    if (isLongPressRef.current) {
                                      isLongPressRef.current = false;
                                      return;
                                    }
                                    const newSet = new Set(selectedCurrent);
                                    if (isSelected) newSet.delete(idx);
                                    else newSet.add(idx);
                                    setSelectedCurrent(newSet);
                                  }}
                                  className={`flex-1 basis-[calc(25%-0.5rem)] min-w-[21%] max-w-full relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer active:scale-95 shadow-xs min-h-[56px] select-none ${
                                    isSelected
                                      ? "bg-gradient-to-b from-blue-600 to-indigo-700 text-white border-blue-400 ring-2 ring-blue-400/80 shadow-md shadow-blue-500/20 font-bold"
                                      : item.shipped
                                        ? "bg-[#09101a]/80 text-gray-400 border-white/10 opacity-70"
                                        : "bg-[#131d2b] hover:bg-[#182638] text-gray-200 border-white/10 hover:border-white/20"
                                  }`}
                                  title="Chạm: Chọn đẩy đơn | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                >
                                  {isSelected && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black rounded-full text-[9px] font-black flex items-center justify-center shadow-md">
                                      ✓
                                    </span>
                                  )}
                                  <span className="font-mono font-black text-sm sm:text-base leading-none tracking-tight">
                                    {itemTotalK}k
                                  </span>
                                  {itemQty > 1 && (
                                    <span className="text-[10px] font-bold text-cyan-300 opacity-90 mt-0.5 font-mono">
                                      x{itemQty} ({itemUnitPrice}k)
                                    </span>
                                  )}
                                  <span className="text-[9.5px] truncate max-w-full opacity-80 mt-0.5 font-medium leading-tight px-0.5">
                                    {fullCommentContent}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {currentItems
                            .map((item, idx) => ({ item, idx }))
                          .filter(({ item }) => !isGhostZeroPriceItem(item))
                          .reverse()
                          .map(({ item, idx }) => {
                            const itemUnitPrice =
                              item.unitPrice ||
                              (item.quantity && item.price
                                ? Math.round(item.price / item.quantity)
                                : item.price);
                            const itemQty = item.quantity || 1;
                            const itemTotalK =
                              item.price || itemUnitPrice * itemQty;

                            const sourceComment = item.sourceCommentId
                              ? store[platform].comments?.find(
                                  (c) => c.id === item.sourceCommentId,
                                )
                              : null;
                            const sourceCommentStr = sourceComment
                              ? typeof sourceComment.content === "object"
                                ? JSON.stringify(sourceComment.content)
                                : String(sourceComment.content || "")
                              : "";
                            const rawContent =
                              item.content &&
                              !item.content.includes("(Không ghi chú)")
                                ? item.content.trim()
                                : "";

                            // Nội dung khách cmt chốt thực tế (ưu tiên cmt gốc từ live, sau đó đến ghi chú lưu trên món)
                            const fullCommentContent =
                              sourceCommentStr ||
                              rawContent ||
                              `Sản phẩm ${itemUnitPrice}k`;

                            return (
                              <div
                                key={`current-item-${idx}`}
                                className={`py-1.5 px-2 rounded-xl transition-all flex items-center justify-between gap-1.5 mb-1 ${
                                  selectedCurrent.has(idx)
                                    ? "bg-blue-950/60 shadow-md ring-1 ring-blue-500/40"
                                    : item.shipped
                                      ? "bg-[#09101a]/70 opacity-75"
                                      : "bg-[#131d2b] hover:bg-[#182536]"
                                }`}
                              >
                                {/* Trái: Checkbox + STT + NỘI DUNG KHÁCH CMT CHỐT (Bấm vào cmt để mở popup sửa Giá × SL) */}
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                    checked={selectedCurrent.has(idx)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedCurrent);
                                      if (e.target.checked) newSet.add(idx);
                                      else newSet.delete(idx);
                                      setSelectedCurrent(newSet);
                                    }}
                                  />
                                  <span className="font-mono text-[9px] text-gray-400 font-bold bg-black/40 px-1 py-0.2 rounded shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <div
                                    onTouchStart={() =>
                                      startLongPress(
                                        item,
                                        idx,
                                        false,
                                        fullCommentContent,
                                        itemUnitPrice,
                                        itemQty,
                                        itemTotalK,
                                      )
                                    }
                                    onTouchEnd={cancelLongPress}
                                    onTouchMove={cancelLongPress}
                                    onMouseDown={() =>
                                      startLongPress(
                                        item,
                                        idx,
                                        false,
                                        fullCommentContent,
                                        itemUnitPrice,
                                        itemQty,
                                        itemTotalK,
                                      )
                                    }
                                    onMouseUp={cancelLongPress}
                                    onMouseLeave={cancelLongPress}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      cancelLongPress();
                                      setProfileContextMenu({
                                        item,
                                        itemRealIndex: idx,
                                        isPast: false,
                                        fullCommentContent,
                                        itemUnitPrice,
                                        itemQty,
                                        itemTotalK,
                                      });
                                    }}
                                    onClick={() => {
                                      if (isLongPressRef.current) {
                                        isLongPressRef.current = false;
                                        return;
                                      }
                                      setEditingPriceQty({
                                        platform,
                                        user: cleanUser,
                                        itemIndex: idx,
                                        itemId: item.id,
                                        content: fullCommentContent,
                                        unitPrice: itemUnitPrice,
                                        quantity: itemQty,
                                        isPast: false,
                                      });
                                    }}
                                    className="cursor-pointer group flex items-center gap-1.5 min-w-0 flex-1 hover:bg-white/5 py-1 px-1.5 -my-1 -ml-1 rounded-lg transition-colors select-none"
                                    title="Chạm: Sửa Giá × SL | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                  >
                                    <span className="text-gray-400 font-normal text-[11px] shrink-0">
                                      💬
                                    </span>
                                    <span
                                      className={`font-bold text-xs truncate flex-1 min-w-0 ${item.shipped ? "line-through text-gray-400" : "text-amber-200 group-hover:text-cyan-300"}`}
                                    >
                                      {fullCommentContent}
                                    </span>
                                    {/* Khi có số lượng từ 2 trở lên thì (giá) đằng sau cmt (đã bỏ x sl) */}
                                    {itemQty >= 2 && (
                                      <span className="text-cyan-300 font-mono font-bold text-xs shrink-0 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                                        ({itemUnitPrice}k)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Phải: Thành tiền + Nút +1 + Nút Gửi + In + Xóa */}
                                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                  {/* Thành tiền k */}
                                  <PriceIncrementButton
                                    priceK={itemTotalK}
                                    quantity={itemQty}
                                  />

                                  {/* Nút Nhân bản thêm 1 món */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      store.duplicateOrderItem(
                                        platform,
                                        cleanUser,
                                        idx,
                                        false,
                                        item.id,
                                      );
                                      if (
                                        typeof navigator !== "undefined" &&
                                        navigator.vibrate
                                      ) {
                                        try {
                                          navigator.vibrate(15);
                                        } catch {}
                                      }
                                    }}
                                    title="Nhân bản thêm 1 món giống nội dung cmt này (SL 1)"
                                    className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/40 active:scale-95 text-[10px] font-black px-1.5 py-1 rounded-md transition-all cursor-pointer flex items-center justify-center"
                                  >
                                    +1
                                  </button>

                                  {/* Nút In */}
                                  <button
                                    onClick={() => {
                                      let time = new Date().toLocaleTimeString(
                                        "vi-VN",
                                        { hour: "2-digit", minute: "2-digit" },
                                      );
                                      const cleanPrintContent = `${fullCommentContent} (${itemUnitPrice}k x ${itemQty})`;
                                      printLabel(
                                        store[platform].nicknames?.[cleanUser]
                                          ? `(${store[platform].nicknames[cleanUser]}) ${cleanUser}`
                                          : `#${getShortId(cleanUser)} ${cleanUser}`,
                                        cleanPrintContent,
                                        itemTotalK,
                                        time,
                                        PLATFORMS[platform].label,
                                        true,
                                        isCustomerGheLay(store[platform].gheLayTags, cleanUser, store[platform].tags)
                                      );
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-md px-1.5 sm:px-2 py-1 font-bold text-[11px] whitespace-nowrap flex items-center gap-0.5 shadow-sm transition-all cursor-pointer"
                                    title="In tem món này"
                                  >
                                    🖨️
                                  </button>

                                  {/* Nút Xóa */}
                                  <DeleteConfirmButton
                                    onDelete={() =>
                                      store.deleteOrderItem(
                                        platform,
                                        cleanUser,
                                        idx,
                                        false,
                                      )
                                    }
                                    className="rounded-md px-1.5 py-1 text-xs"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}


                        {/* Nút Thêm Món Nhanh Dưới Chân */}
                        <div className="pt-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setIsCalculatorOpen(true)}
                            title="Thêm món mới (Mở bảng tính)"
                            className="w-full py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 hover:text-white border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-98 shadow-md"
                          >
                            <Plus size={16} className="stroke-[3]" />
                            <span>Thêm món</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            );
          })()}
          <div>
            <div className="text-sm font-bold text-gray-100 mb-3 flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span>⏳ Đang giữ đơn (các phiên trước)</span>
                {cust?.pastItems && cust.pastItems.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer text-gray-400 bg-[#1c242f] hover:bg-white/10 px-2 py-1 rounded transition-colors">
                    <input
                      type="checkbox"
                      className="rounded border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                      checked={
                        selectedPast.size === cust.pastItems.length &&
                        cust.pastItems.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPast(
                            new Set(cust.pastItems!.map((_, i) => i)),
                          );
                        } else {
                          setSelectedPast(new Set());
                        }
                      }}
                    />
                    Chọn tất cả ({cust.pastItems.length})
                  </label>
                )}
                {cust?.pastItems && cust.pastItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      store.groupCustomerItemsByPrice(platform, cleanUser, true)
                    }
                    title="Tự động gom nhóm các món có cùng đơn giá lại với nhau"
                    className="text-[11px] font-bold text-cyan-300 hover:text-white bg-cyan-950/50 hover:bg-cyan-900/70 px-2.5 py-1 rounded-md border border-cyan-500/40 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    <span>✨ Gom cùng giá</span>
                  </button>
                )}
              </div>
              {selectedPast.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      store.mergePastItems(
                        platform,
                        cleanUser,
                        Array.from(selectedPast),
                      );
                      setSelectedPast(new Set());
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-sm cursor-pointer"
                  >
                    GỘP ({selectedPast.size})
                  </button>
                  {!confirmingBulkDelete ? (
                    <button
                      onClick={() => setConfirmingBulkDelete(true)}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-sm cursor-pointer transition-colors"
                    >
                      XÓA ({selectedPast.size})
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        store.deletePastItems(
                          platform,
                          cleanUser,
                          Array.from(selectedPast),
                        );
                        setSelectedPast(new Set());
                        setConfirmingBulkDelete(false);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-sm cursor-pointer animate-pulse"
                    >
                      ⚠️ XÁC NHẬN XÓA
                    </button>
                  )}
                </div>
              )}
            </div>
            {(() => {
              const activeInsight = insight || getCustomerInsight(cleanUser);
              const sStat = checkCustomerPancakeShippedStatus(
                cust,
                activeInsight,
              );
              // Đơn mới nhất trên Pancake >= ngày các món cũ thì tự động HẾT GIỮ ĐƠN
              const activePastItems = getCustomerActivePastItems(
                cust,
                activeInsight,
              );
              const displayPastItems = sStat.isAllShipped
                ? []
                : activePastItems;

              return (
                <div className="space-y-3">
                  {displayPastItems.length === 0 ? (
                    sStat.isAllShipped && sStat.latestPancakeOrder ? (
                      <div className="text-center text-gray-400 py-3.5 bg-[#0e1621] rounded-xl border border-dashed border-emerald-500/25 text-xs space-y-1">
                        <div className="text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                          <span>
                            ✅ Lịch sử chốt đơn cũ đã đi hết trên Pancake POS
                          </span>
                          <span className="font-mono text-emerald-300 bg-emerald-500/20 px-1.5 py-0.2 rounded text-[10px]">
                            #{sStat.latestPancakeOrder.orderNumber}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400">
                          Đơn gần nhất trên Pancake{" "}
                          {sStat.latestPancakeOrder.insertedAt
                            ? "(" +
                              formatDateTime(
                                sStat.latestPancakeOrder.insertedAt,
                              ) +
                              ")"
                            : ""}{" "}
                          đã xử lý xong toàn bộ các đơn chốt cũ.
                        </div>
                        {cust?.pastItems && cust.pastItems.length > 0 && (
                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setShowOldShippedItems(!showOldShippedItems)
                              }
                              className="text-[11px] text-emerald-300 hover:text-white underline cursor-pointer"
                            >
                              {showOldShippedItems
                                ? "Thu gọn lịch sử cũ đã đi"
                                : `Xem lại ${cust.pastItems.length} món cũ đã đi đơn`}
                            </button>
                          </div>
                        )}
                        {showOldShippedItems && cust?.pastItems && (
                          <div className="mt-2 text-left space-y-1 bg-black/30 p-2 rounded-lg border border-white/5">
                            {cust.pastItems.map((pItem, pIdx) => {
                              const pContent =
                                pItem.content &&
                                !pItem.content.includes("(Không ghi chú)")
                                  ? pItem.content.trim()
                                  : `Món #${pIdx + 1}`;
                              const pPrice = pItem.price || 0;
                              return (
                                <div
                                  key={pIdx}
                                  className="flex justify-between items-center text-xs py-1 border-b border-white/5 text-gray-400"
                                >
                                  <span className="truncate">{pContent}</span>
                                  <span className="font-mono text-gray-300">
                                    {pPrice}k{" "}
                                    <span className="text-[10px] text-emerald-400 ml-1">
                                      ✓ Đã đi
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-gray-400 py-4 bg-[#0e1621] rounded-xl border border-dashed border-white/10 text-xs">
                        Chưa có lịch sử chốt đơn các phiên trước.
                      </div>
                    )
                  ) : (
                    <div className="bg-[#0b121c] rounded-2xl p-2 sm:p-2.5 shadow-md space-y-1.5 mt-2">
                      {itemsViewMode === "grid" ? (
                        <div className="flex flex-wrap gap-2 py-1">
                          {[...displayPastItems]
                            .reverse()
                            .map(({ item, originalIndex }) => {
                              const originalIdx = originalIndex;
                              const isSelected = selectedPast.has(originalIdx);
                              const itemUnitPrice =
                                item.unitPrice ||
                                (item.quantity && item.price
                                  ? Math.round(item.price / item.quantity)
                                  : item.price);
                              const itemQty = item.quantity || 1;
                              const itemTotalK =
                                item.price || itemUnitPrice * itemQty;

                              const sourceComment = item.sourceCommentId
                                ? store[platform].comments?.find(
                                    (c) => c.id === item.sourceCommentId,
                                  )
                                : null;
                              const sourceCommentStr = sourceComment
                                ? typeof sourceComment.content === "object"
                                  ? JSON.stringify(sourceComment.content)
                                  : String(sourceComment.content || "")
                                : "";
                              const rawContent =
                                item.content &&
                                !item.content.includes("(Không ghi chú)")
                                  ? item.content.trim()
                                  : "";
                              const fullCommentContent =
                                sourceCommentStr ||
                                rawContent ||
                                `${itemUnitPrice}k`;

                              const d = new Date(
                                item.createdAt ||
                                  parseInt(item.id.substring(0, 13)) ||
                                  Date.now(),
                              );
                              const now = new Date();
                              const isToday =
                                d.getDate() === now.getDate() &&
                                d.getMonth() === now.getMonth() &&
                                d.getFullYear() === now.getFullYear();
                              const yesterday = new Date(now);
                              yesterday.setDate(now.getDate() - 1);
                              const isYesterday =
                                d.getDate() === yesterday.getDate() &&
                                d.getMonth() === yesterday.getMonth() &&
                                d.getFullYear() === yesterday.getFullYear();
                              let dateStr = d.toLocaleDateString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                              });
                              if (isToday) dateStr = "Hôm nay";
                              else if (isYesterday) dateStr = "Hôm qua";

                              return (
                                <button
                                  key={`grid-past-${originalIdx}`}
                                  type="button"
                                  onTouchStart={() =>
                                    startLongPress(
                                      item,
                                      originalIdx,
                                      true,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onTouchEnd={cancelLongPress}
                                  onTouchMove={cancelLongPress}
                                  onMouseDown={() =>
                                    startLongPress(
                                      item,
                                      originalIdx,
                                      true,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onMouseUp={cancelLongPress}
                                  onMouseLeave={cancelLongPress}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    cancelLongPress();
                                    setProfileContextMenu({
                                      item,
                                      itemRealIndex: originalIdx,
                                      isPast: true,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    });
                                  }}
                                  onClick={() => {
                                    if (isLongPressRef.current) {
                                      isLongPressRef.current = false;
                                      return;
                                    }
                                    const newSet = new Set(selectedPast);
                                    if (isSelected) newSet.delete(originalIdx);
                                    else newSet.add(originalIdx);
                                    setSelectedPast(newSet);
                                  }}
                                  className={`flex-1 basis-[calc(25%-0.5rem)] min-w-[21%] max-w-full relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer active:scale-95 shadow-xs min-h-[56px] select-none ${
                                    isSelected
                                      ? "bg-gradient-to-b from-blue-600 to-indigo-700 text-white border-blue-400 ring-2 ring-blue-400/80 shadow-md shadow-blue-500/20 font-bold"
                                      : item.shipped
                                        ? "bg-[#09101a]/80 text-gray-400 border-white/10 opacity-70"
                                        : "bg-[#131d2b] hover:bg-[#182638] text-gray-200 border-white/10 hover:border-white/20"
                                  }`}
                                  title="Chạm: Chọn đẩy đơn | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                >
                                  {isSelected && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black rounded-full text-[9px] font-black flex items-center justify-center shadow-md">
                                      ✓
                                    </span>
                                  )}
                                  <span className="text-[9px] font-mono text-cyan-300 font-bold">
                                    {dateStr}
                                  </span>
                                  <span className="font-mono font-black text-sm sm:text-base leading-none tracking-tight mt-0.5">
                                    {itemTotalK}k
                                  </span>
                                  {itemQty > 1 && (
                                    <span className="text-[9.5px] font-bold text-amber-300 opacity-90 mt-0.5 font-mono">
                                      x{itemQty} ({itemUnitPrice}k)
                                    </span>
                                  )}
                                  <span className="text-[9.5px] truncate max-w-full opacity-80 mt-0.5 font-medium leading-tight px-0.5">
                                    {fullCommentContent}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {[...displayPastItems]
                            .reverse()
                            .map(({ item, originalIndex }) => {
                          const originalIdx = originalIndex;
                          const d = new Date(
                            item.createdAt ||
                              parseInt(item.id.substring(0, 13)) ||
                              Date.now(),
                          );
                          const now = new Date();
                          const isToday =
                            d.getDate() === now.getDate() &&
                            d.getMonth() === now.getMonth() &&
                            d.getFullYear() === now.getFullYear();
                          const yesterday = new Date(now);
                          yesterday.setDate(now.getDate() - 1);
                          const isYesterday =
                            d.getDate() === yesterday.getDate() &&
                            d.getMonth() === yesterday.getMonth() &&
                            d.getFullYear() === yesterday.getFullYear();
                          let dateStr = d.toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                          });
                          if (isToday) dateStr = "Hôm nay";
                          else if (isYesterday) dateStr = "Hôm qua";

                          const itemUnitPrice =
                            item.unitPrice ||
                            (item.quantity && item.price
                              ? Math.round(item.price / item.quantity)
                              : item.price);
                          const itemQty = item.quantity || 1;
                          const itemTotalK =
                            item.price || itemUnitPrice * itemQty;

                          const sourceComment = item.sourceCommentId
                            ? store[platform].comments?.find(
                                (c) => c.id === item.sourceCommentId,
                              )
                            : null;
                          const sourceCommentStr = sourceComment
                            ? typeof sourceComment.content === "object"
                              ? JSON.stringify(sourceComment.content)
                              : String(sourceComment.content || "")
                            : "";
                          const rawContent =
                            item.content &&
                            !item.content.includes("(Không ghi chú)")
                              ? item.content.trim()
                              : "";

                          // Nội dung khách cmt chốt thực tế
                          const fullCommentContent =
                            sourceCommentStr ||
                            rawContent ||
                            `Sản phẩm ${itemUnitPrice}k`;

                          return (
                            <div
                              key={`past-${originalIdx}`}
                              className={`py-1.5 px-2 rounded-xl transition-all flex items-center justify-between gap-1.5 mb-1 ${
                                selectedPast.has(originalIdx)
                                  ? "bg-blue-950/60 shadow-md ring-1 ring-blue-500/40"
                                  : item.shipped
                                    ? "bg-[#09101a]/70 opacity-75"
                                    : "bg-[#131d2b] hover:bg-[#182536]"
                              }`}
                            >
                              {/* Trái: Checkbox + Ngày + NỘI DUNG KHÁCH CMT CHỐT (Bấm vào cmt để mở popup sửa Giá × SL) */}
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={selectedPast.has(originalIdx)}
                                  onChange={() => {
                                    const newSet = new Set(selectedPast);
                                    if (newSet.has(originalIdx))
                                      newSet.delete(originalIdx);
                                    else newSet.add(originalIdx);
                                    setSelectedPast(newSet);
                                  }}
                                  className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                />
                                <span className="font-mono text-[9px] text-gray-400 font-bold bg-black/40 px-1 py-0.2 rounded shrink-0">
                                  {dateStr}
                                </span>
                                <div
                                  onTouchStart={() =>
                                    startLongPress(
                                      item,
                                      originalIdx,
                                      true,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onTouchEnd={cancelLongPress}
                                  onTouchMove={cancelLongPress}
                                  onMouseDown={() =>
                                    startLongPress(
                                      item,
                                      originalIdx,
                                      true,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    )
                                  }
                                  onMouseUp={cancelLongPress}
                                  onMouseLeave={cancelLongPress}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    cancelLongPress();
                                    setProfileContextMenu({
                                      item,
                                      itemRealIndex: originalIdx,
                                      isPast: true,
                                      fullCommentContent,
                                      itemUnitPrice,
                                      itemQty,
                                      itemTotalK,
                                    });
                                  }}
                                  onClick={() => {
                                    if (isLongPressRef.current) {
                                      isLongPressRef.current = false;
                                      return;
                                    }
                                    setEditingPriceQty({
                                      platform,
                                      user: cleanUser,
                                      itemIndex: originalIdx,
                                      itemId: item.id,
                                      content: fullCommentContent,
                                      unitPrice: itemUnitPrice,
                                      quantity: itemQty,
                                      isPast: true,
                                    });
                                  }}
                                  className="cursor-pointer group flex items-center gap-1.5 min-w-0 flex-1 hover:bg-white/5 py-1 px-1.5 -my-1 -ml-1 rounded-lg transition-colors select-none"
                                  title="Chạm: Sửa Giá × SL | Nhấn giữ: Xem & Tăng SL, +1, In, Xoá"
                                >
                                  <span className="text-gray-400 font-normal text-[11px] shrink-0">
                                    💬
                                  </span>
                                  <span
                                    className={`font-bold text-xs truncate flex-1 min-w-0 ${item.shipped ? "line-through text-gray-400" : "text-amber-200 group-hover:text-cyan-300"}`}
                                  >
                                    {fullCommentContent}
                                  </span>
                                  {/* Khi có số lượng từ 2 trở lên thì (giá) đằng sau cmt (đã bỏ x sl) */}
                                  {itemQty >= 2 && (
                                    <span className="text-cyan-300 font-mono font-bold text-xs shrink-0 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                                      ({itemUnitPrice}k)
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Phải: Thành tiền + Nút +1 + Nút In + Xóa */}
                              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                {/* Thành tiền k */}
                                <PriceIncrementButton
                                  priceK={itemTotalK}
                                  quantity={itemQty}
                                />

                                {/* Nút Nhân bản thêm 1 món */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    store.duplicateOrderItem(
                                      platform,
                                      cleanUser,
                                      originalIdx,
                                      true,
                                      item.id,
                                    );
                                    if (
                                      typeof navigator !== "undefined" &&
                                      navigator.vibrate
                                    ) {
                                      try {
                                        navigator.vibrate(15);
                                      } catch {}
                                    }
                                  }}
                                  title="Nhân bản thêm 1 món giống nội dung này (SL 1)"
                                  className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/40 active:scale-95 text-[10px] font-black px-1.5 py-1 rounded-md transition-all cursor-pointer flex items-center justify-center"
                                >
                                  +1
                                </button>

                                {/* Nút In */}
                                <button
                                  onClick={() => {
                                    let time = new Date().toLocaleTimeString(
                                      "vi-VN",
                                      { hour: "2-digit", minute: "2-digit" },
                                    );
                                    const cleanPrintContent = `${fullCommentContent} (${itemUnitPrice}k x ${itemQty})`;
                                    printLabel(
                                      store[platform].nicknames?.[cleanUser]
                                        ? `(${store[platform].nicknames[cleanUser]}) ${cleanUser}`
                                        : `#${getShortId(cleanUser)} ${cleanUser}`,
                                      cleanPrintContent,
                                      itemTotalK,
                                      time,
                                      PLATFORMS[platform].label,
                                      true,
                                      isCustomerGheLay(store[platform].gheLayTags, cleanUser, store[platform].tags)
                                    );
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-md px-1.5 sm:px-2 py-1 font-bold text-[11px] whitespace-nowrap flex items-center gap-0.5 shadow-sm transition-all cursor-pointer"
                                  title="In tem món này"
                                >
                                  🖨️
                                </button>

                                {/* Nút Xóa */}
                                <DeleteConfirmButton
                                  onDelete={() =>
                                    store.deleteOrderItem(
                                      platform,
                                      cleanUser,
                                      originalIdx,
                                      true,
                                    )
                                  }
                                  className="rounded-md px-1.5 py-1 text-xs"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 🥞 Lịch sử đẩy đơn (Lưu 5 lần gần nhất) */}
          <div className="bg-[#121c28] border border-white/10 rounded-2xl p-3 sm:p-4 mt-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg">🥞</span>
                <span className="font-bold text-sm sm:text-base text-orange-400">
                  Lịch sử đẩy đơn
                </span>
                <span className="bg-orange-950/60 text-orange-300 border border-orange-500/30 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {(cust?.pushHistory || []).length} lần (lưu 5 lần gần nhất)
                </span>
              </div>
              <span className="text-[11px] text-gray-400 hidden sm:inline">
                Tự động lưu sau mỗi lần đẩy đơn
              </span>
            </div>

            {!cust?.pushHistory || cust.pushHistory.length === 0 ? (
              <div className="text-center py-4 text-gray-400 text-xs italic bg-[#0e1621] rounded-xl border border-dashed border-white/5">
                Chưa có lịch sử đẩy đơn nào cho khách này.
              </div>
            ) : (
              <div className="space-y-3">
                {cust.pushHistory.map((rec, rIdx) => {
                  const recTimeStr = formatDateTime(rec.timestamp);
                  const isRestored = rec.status === "restored";
                  const totalVnd =
                    (rec.totalPrice || (rec as any).totalAmountK || 0) * 1000;

                  return (
                    <div
                      key={rec.id || "push-rec-" + rIdx}
                      className={
                        "rounded-xl border p-2.5 sm:p-3 transition-all " +
                        (isRestored
                          ? "bg-[#0f1724]/60 border-amber-500/30"
                          : "bg-[#152232] border-orange-500/40 shadow-sm")
                      }
                    >
                      {/* Header: Mã đơn + Thời gian + Trạng thái */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 mb-2 border-b border-white/5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-white flex items-center gap-1">
                            <span>#{rIdx + 1}</span>
                            {rec.orderNumber ? (
                              <span className="bg-orange-600/30 text-orange-300 px-1.5 py-0.2 rounded border border-orange-500/30 font-mono">
                                #{rec.orderNumber}
                              </span>
                            ) : rec.pancakeOrderId ? (
                              <span className="bg-blue-600/30 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30 font-mono text-[10px]">
                                ID: {rec.pancakeOrderId}
                              </span>
                            ) : (
                              <span className="text-gray-300 font-mono text-xs">
                                Đơn Pancake
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            🕒 {recTimeStr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isRestored ? (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span>↩️</span>
                              <span>Đã khôi phục về hàng giữ</span>
                            </span>
                          ) : (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span>✅</span>
                              <span>Đã đẩy lên Pancake</span>
                            </span>
                          )}
                          <DeleteConfirmButton
                            onDelete={() =>
                              store.deletePushOrderRecord(
                                platform,
                                cleanUser,
                                rec.id,
                              )
                            }
                            className="p-1 rounded-md text-[10px]"
                          />
                        </div>
                      </div>

                      {/* Danh sách các sản phẩm đã được chọn trong lần đẩy đơn này */}
                      <div className="space-y-1 mb-2.5">
                        {(rec.items || []).map((it, itIdx) => {
                          const itUnitPrice =
                            it.unitPrice ||
                            (it.quantity && it.price
                              ? Math.round(it.price / it.quantity)
                              : it.price);
                          const itQty = it.quantity || 1;
                          const itTotalK = it.price || itUnitPrice * itQty;
                          const cleanItContent =
                            it.content &&
                            !it.content.includes("(Không ghi chú)")
                              ? it.content.trim()
                              : "Sản phẩm #" + (itIdx + 1);

                          return (
                            <div
                              key={it.id || "rec-it-" + itIdx}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-black/30 border border-white/5"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-gray-400 font-mono text-[10px]">
                                  #{itIdx + 1}
                                </span>
                                <span className="text-gray-200 font-semibold truncate">
                                  {cleanItContent}
                                </span>
                                {itQty >= 2 && (
                                  <span className="text-cyan-300 font-mono text-[10px] shrink-0 bg-cyan-950/60 px-1 rounded">
                                    ({itUnitPrice}k)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-gray-400 text-[11px] font-mono">
                                  x{itQty}
                                </span>
                                <span className="text-orange-300 font-bold font-mono">
                                  {itTotalK}k
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary & Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
                          <span className="text-gray-300">
                            Tổng:{" "}
                            <strong className="text-white">
                              {rec.totalQuantity} SP
                            </strong>
                          </span>
                          <span className="text-cyan-300 font-bold">
                            {totalVnd.toLocaleString("vi-VN")}đ
                          </span>
                          {rec.shippingFee ? (
                            <span className="text-gray-400 text-[11px]">
                              Ship: {rec.shippingFee.toLocaleString("vi-VN")}đ
                            </span>
                          ) : null}
                          {rec.prepaid ? (
                            <span className="text-emerald-400 text-[11px]">
                              Cọc: {rec.prepaid.toLocaleString("vi-VN")}đ
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Nút 1: Khôi phục vào hàng giữ */}
                          {!isRestored && (
                            <button
                              type="button"
                              onClick={() => {
                                store.restorePushOrderRecord(
                                  platform,
                                  cleanUser,
                                  rec.id,
                                );
                              }}
                              title="Khách báo hủy giữ thêm: Khôi phục lại các sản phẩm này về trạng thái đang giữ"
                              className="px-2.5 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                            >
                              <span>↩️</span>
                              <span>Khôi phục vào hàng giữ</span>
                            </button>
                          )}

                          {/* Nút 2: Thêm món & Đẩy lại */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!isRestored) {
                                store.restorePushOrderRecord(
                                  platform,
                                  cleanUser,
                                  rec.id,
                                );
                              }
                              const currentCust =
                                store[platform].customers[cleanUser];
                              const totalPastLen = (
                                currentCust?.pastItems || []
                              ).length;
                              setSelectedPast(
                                new Set(
                                  Array.from(
                                    { length: totalPastLen },
                                    (_, i) => i,
                                  ),
                                ),
                              );
                              setSelectedCurrent(
                                new Set(
                                  (currentCust?.items || []).map((_, i) => i),
                                ),
                              );
                            }}
                            title="Mở giao diện đẩy đơn để chọn thêm món mới và đẩy tiếp cho khách"
                            className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md"
                          >
                            <span>➕</span>
                            <span>Thêm món &amp; Đẩy lại</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nút Xoá toàn bộ giỏ hàng và lịch sử cho khách */}
          {Boolean((cust?.items?.length || 0) > 0 || (cust?.pastItems?.length || 0) > 0) && (
            <div className="pt-4 mt-2 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Xác nhận xoá sạch giỏ hàng và lịch sử đơn của khách @${cleanUser}?`,
                    )
                  ) {
                    store.clearCustomerCart(platform, cleanUser);
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-900/50 border border-red-500/30 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Trash2 size={13} />
                <span>Xoá sạch giỏ hàng &amp; lịch sử khách này</span>
              </button>
            </div>
          )}

          {/* Item Calculator Modal (Hình 2: Bảng tính công thức Giá x SL) */}
          {isCalculatorOpen && (
            <ItemCalculatorModal
              user={cleanUser}
              platform={platform}
              onClose={() => setIsCalculatorOpen(false)}
              onAdded={() => setIsCalculatorOpen(false)}
            />
          )}


          {/* Quick Price x Qty Edit Modal */}
          {editingPriceQty && (
            <QuickPriceQtyModal
              target={editingPriceQty}
              onClose={() => setEditingPriceQty(null)}
            />
          )}

          {/* Context Menu Modal khi nhấn giữ món trong Hồ sơ khách hàng */}
          {profileContextMenu && (
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-fadeIn"
              onClick={() => setProfileContextMenu(null)}
            >
              <div
                className="bg-[#182230] border border-white/20 rounded-2xl p-4 w-full max-w-xs sm:max-w-sm shadow-2xl space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header món */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/10">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs text-blue-300 font-bold mb-0.5">
                      <span>📦</span>
                      <span className="truncate">{cleanUser}</span>
                      <span className="text-[10px] bg-blue-900/60 px-1.5 py-0.2 rounded text-blue-200">
                        {PLATFORMS[platform].label}
                      </span>
                      {profileContextMenu.isPast && (
                        <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                          Đơn cũ
                        </span>
                      )}
                    </div>
                    <div
                      className="text-sm font-black text-white truncate"
                      title={profileContextMenu.fullCommentContent}
                    >
                      {profileContextMenu.fullCommentContent}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-base font-black font-mono text-emerald-400">
                        {profileContextMenu.itemTotalK}k
                      </span>
                      {profileContextMenu.itemQty > 1 && (
                        <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                          SL: {profileContextMenu.itemQty} ×{" "}
                          {profileContextMenu.itemUnitPrice}k
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileContextMenu(null)}
                    className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Menu các tác vụ: Xem/Tăng SL, Nhân bản +1, In, Xoá */}
                <div className="space-y-2">
                  {/* 1. Xem sản phẩm & gọi bảng tăng số lượng lên */}
                  <button
                    type="button"
                    onClick={() => {
                      const item = profileContextMenu.item;
                      setEditingPriceQty({
                        platform,
                        user: cleanUser,
                        itemIndex: profileContextMenu.itemRealIndex,
                        itemId: item.id,
                        content: profileContextMenu.fullCommentContent,
                        unitPrice: profileContextMenu.itemUnitPrice,
                        quantity: profileContextMenu.itemQty,
                        isPast: profileContextMenu.isPast,
                      });
                      setProfileContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔍</span>
                      <div className="text-left">
                        <div className="font-black">Xem & Sửa số lượng / giá</div>
                        <div className="text-[10px] text-blue-200 font-normal">
                          Mở bảng tăng giảm SL, giá, ghi chú
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} />
                  </button>

                  {/* 2. Nhân bản +1 */}
                  <button
                    type="button"
                    onClick={() => {
                      store.duplicateOrderItem(
                        platform,
                        cleanUser,
                        profileContextMenu.itemRealIndex,
                        profileContextMenu.isPast,
                        profileContextMenu.item.id,
                      );
                      if (typeof navigator !== "undefined" && navigator.vibrate) {
                        try {
                          navigator.vibrate(15);
                        } catch {}
                      }
                      setProfileContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 active:scale-98 border border-purple-500/40 text-purple-100 font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">➕</span>
                      <div className="text-left">
                        <div className="font-black">Nhân bản (+1 món này)</div>
                        <div className="text-[10px] text-purple-300 font-normal">
                          Thêm 1 món cùng tên & giá vào đơn
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-black text-xs bg-purple-950 px-2 py-0.5 rounded border border-purple-400/40">
                      +1
                    </span>
                  </button>

                  {/* 3. In tem */}
                  <button
                    type="button"
                    onClick={() => {
                      const time = new Date().toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const cleanPrintContent = `${profileContextMenu.fullCommentContent} (${profileContextMenu.itemUnitPrice}k x ${profileContextMenu.itemQty})`;
                      printLabel(
                        store[platform].nicknames?.[cleanUser]
                          ? `(${store[platform].nicknames[cleanUser]}) ${cleanUser}`
                          : `#${getShortId(cleanUser)} ${cleanUser}`,
                        cleanPrintContent,
                        profileContextMenu.itemTotalK,
                        time,
                        PLATFORMS[platform].label,
                        true,
                        isCustomerGheLay(store[platform].gheLayTags, cleanUser, store[platform].tags)
                      );
                      setProfileContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 active:scale-98 border border-emerald-500/40 text-emerald-100 font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🖨️</span>
                      <div className="text-left">
                        <div className="font-black">In tem món này</div>
                        <div className="text-[10px] text-emerald-300 font-normal">
                          Gửi lệnh in nhãn dán sản phẩm
                        </div>
                      </div>
                    </div>
                    <span className="font-bold text-[11px] bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-400/30">
                      IN
                    </span>
                  </button>

                  {/* 4. Xoá */}
                  <button
                    type="button"
                    onClick={() => {
                      store.deleteOrderItem(
                        platform,
                        cleanUser,
                        profileContextMenu.itemRealIndex,
                        profileContextMenu.isPast,
                        profileContextMenu.item.id,
                      );
                      setProfileContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 active:scale-98 border border-red-500/40 text-red-200 font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 size={16} className="text-red-400" />
                      <div className="text-left">
                        <div className="font-black text-red-200">
                          Xoá món khỏi giỏ hàng
                        </div>
                        <div className="text-[10px] text-red-400/80 font-normal">
                          Xoá vĩnh viễn món này
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-red-400 bg-red-950 px-2 py-0.5 rounded border border-red-500/40">
                      Xoá
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setProfileContextMenu(null)}
                  className="w-full py-2 bg-gray-700/60 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer mt-1"
                >
                  Đóng menu
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 🧾 BOTTOM BAR: THAY TOÀN BỘ CỤM GIAO DIỆN THÀNH KIỂU BILL HÓA ĐƠN XÁC NHẬN ĐẨY ĐƠN */}
        {totalSelectedCount > 0 && (() => {
          const selectedCurrentItemsWithIdx = Array.from(selectedCurrent)
            .sort((a, b) => a - b)
            .map((i) => ({ item: cust?.items?.[i], idx: i, isPast: false }))
            .filter((x) => Boolean(x.item));

          const selectedPastItemsWithIdx = Array.from(selectedPast)
            .sort((a, b) => a - b)
            .map((i) => ({ item: cust?.pastItems?.[i], idx: i, isPast: true }))
            .filter((x) => Boolean(x.item));

          const allSelectedList = [...selectedCurrentItemsWithIdx, ...selectedPastItemsWithIdx];
          const totalQty = allSelectedList.reduce((sum, { item }) => sum + (item.quantity || 1), 0);
          const totalVnd = totalSelectedPriceK * 1000;

          return (
            <div className="shrink-0 z-30 bg-[#0c131d] border-t-2 border-orange-500/50 shadow-[0_-12px_30px_rgba(0,0,0,0.85)] animate-fadeIn">
              {/* 🚚 & 💧 CỤM ĐIỀU CHỈNH TIỀN SHIP VÀ - TIỀN CỌC TRỰC TIẾP TẠI BILL */}
              <div className="bg-[#0b121c] border-b border-white/5 px-3 py-2 space-y-1.5">
                {/* 1. Tiền Ship */}
                <div className="flex items-center gap-2">
                  <span className="text-sm">🚚</span>
                  <span className="text-xs font-bold text-gray-300 shrink-0">Tiền ship:</span>
                  <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar flex-1">
                    {[
                      { label: "Ghé lấy", val: 0 },
                      { label: "Ninh Thuận", val: 15000 },
                      { label: "Toàn quốc", val: 20000 },
                    ].map((s) => (
                      <button
                        key={s.val}
                        type="button"
                        onClick={() => setDirectShippingFee(s.val)}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer shrink-0 ${
                          directShippingFee === s.val
                            ? "bg-blue-600 border-blue-400 text-white shadow-xs"
                            : "bg-[#141e2c] border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Tiền Cọc */}
                <div className="flex items-center gap-2 pt-1.5 border-t border-white/5">
                  <span className="text-sm">💧</span>
                  <span className="text-xs font-bold text-gray-300 shrink-0">- Cọc:</span>
                  <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar flex-1">
                    {[
                      { label: "0đ", val: 0 },
                      { label: "-50k", val: 50000 },
                      { label: "-100k", val: 100000 },
                      { label: "-200k", val: 200000 },
                    ].map((c) => (
                      <button
                        key={c.val}
                        type="button"
                        onClick={() => setDirectPrepaidAmount(c.val)}
                        className={`px-2 py-0.8 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer shrink-0 ${
                          directPrepaidAmount === c.val
                            ? "bg-cyan-600 border-cyan-400 text-white shadow-xs"
                            : "bg-[#141e2c] border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Thông báo lỗi hoặc thành công khi đẩy đơn */}
              {directPushError && (
                <div className="px-3.5 py-1.5 bg-red-950/80 border-b border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-2">
                  <span className="truncate">⚠️ {directPushError}</span>
                  <button
                    type="button"
                    onClick={() => setDirectPushError(null)}
                    className="text-red-400 hover:text-white text-xs font-bold px-1.5 py-0.5"
                  >
                    ✕
                  </button>
                </div>
              )}
              {directPushSuccess && (
                <div className="px-3.5 py-1.5 bg-emerald-950/90 border-b border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-2">
                  <span className="font-bold truncate">{directPushSuccess}</span>
                  <button
                    type="button"
                    onClick={() => setDirectPushSuccess(null)}
                    className="text-emerald-400 hover:text-white text-xs font-bold px-1.5 py-0.5"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 🌟 Card Tổng Cộng Chuẩn Bill (Tự động phụ ship +5k khi đi đơn 1 cái) */}
              {(() => {
                const mainItems = allSelectedList.filter(({ item }) => !isPhuShipItem(item.content));
                const totalMainQty = mainItems.reduce((sum, { item }) => sum + (item.quantity || 1), 0);
                const mainTotalK = mainItems.reduce((sum, { item }) => sum + (item.price || 0), 0);
                const mainTotalVnd = mainTotalK * 1000;
                const isSingleItemOrder = totalMainQty === 1 && directShippingFee > 0;
                const phuShipVnd = isSingleItemOrder ? 5000 : 0;
                const finalCodVnd = Math.max(
                  0,
                  mainTotalVnd + phuShipVnd + directShippingFee - directPrepaidAmount,
                );

                return (
                  <div className="bg-gradient-to-r from-[#0a121d] via-[#111e30] to-[#0a121d] border-t border-emerald-500/40 p-2.5 sm:px-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10.5px] font-bold text-gray-400 uppercase font-mono flex items-center gap-1 flex-wrap">
                        <span>SL: {totalMainQty} CÁI</span>
                        <span>•</span>
                        <span>HÀNG: {mainTotalVnd.toLocaleString("vi-VN")}đ</span>
                        {isSingleItemOrder && (
                          <span className="text-amber-300 font-bold">
                            • PHỤ SHIP: +5.000đ
                          </span>
                        )}
                        {directShippingFee > 0 && (
                          <span className="text-blue-300">
                            • SHIP: +{directShippingFee.toLocaleString("vi-VN")}đ
                          </span>
                        )}
                        {directPrepaidAmount > 0 && (
                          <span className="text-amber-300">
                            • CỌC: -{directPrepaidAmount.toLocaleString("vi-VN")}đ
                          </span>
                        )}
                      </div>
                      <div className="text-sm sm:text-base font-black text-emerald-300 tracking-wide uppercase mt-0.5 flex items-center gap-1.5">
                        <span>THU HỘ (COD):</span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-tight">
                          {finalCodVnd.toLocaleString("vi-VN")}
                        </span>
                        <span className="text-emerald-400 font-bold text-xs sm:text-sm ml-0.5">đ</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCurrent(new Set());
                          setSelectedPast(new Set());
                        }}
                        title="Bỏ chọn tất cả"
                        className="text-[10px] text-gray-400 hover:text-red-300 p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons: ĐẨY ĐƠN TRỰC TIẾP & XEM BILL */}
              <div className="p-2.5 bg-[#131d2b] border-t border-white/10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDirectPushOrder}
                  disabled={isDirectPushing}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-950/60 active:scale-98 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDirectPushing ? (
                    <>
                      <span className="animate-spin text-base">⏳</span>
                      <span>ĐANG ĐẨY ĐƠN SANG PANCAKE POS...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base">🚀</span>
                      <span>XÁC NHẬN ĐẨY ĐƠN ({totalSelectedCount} MÓN)</span>
                    </>
                  )}
                </button>

                {/* Sửa nút IN BILL thành XEM BILL theo yêu cầu */}
                <button
                  type="button"
                  onClick={() => setShowBillPreview(true)}
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-xs flex items-center justify-center gap-1.5 border border-blue-400/40 active:scale-95 transition-all cursor-pointer shadow-md shrink-0"
                  title="Xem trước hóa đơn (có tiền ship, cọc và nút in bill)"
                >
                  <span>🧾</span>
                  <span>XEM BILL</span>
                </button>
              </div>

              {/* Bill Preview Modal (Ảnh Bill gồm Ship + Cọc + Nút In) */}
              {showBillPreview && (() => {
                const mainItems = allSelectedList.filter(({ item }) => !isPhuShipItem(item.content));
                const totalMainQty = mainItems.reduce((sum, { item }) => sum + (item.quantity || 1), 0);
                const isSingleItemOrder = totalMainQty === 1 && directShippingFee > 0;
                const billItems = mainItems.map(({ item }) => ({
                  id: item.id,
                  content: item.content || `Sản phẩm ${item.price}k`,
                  price: item.price || 0,
                  unitPrice: item.unitPrice,
                  quantity: item.quantity || 1,
                }));
                if (isSingleItemOrder) {
                  billItems.push({
                    id: "phu_ship_5k",
                    content: "Phụ ship 5k",
                    price: 5,
                    unitPrice: 5,
                    quantity: 1,
                  });
                }
                return (
                  <BillPreviewModal
                    user={cleanUser}
                    platform={platform}
                    items={billItems}
                    shippingFee={directShippingFee}
                    prepaid={directPrepaidAmount}
                    onClose={() => setShowBillPreview(false)}
                  />
                );
              })()}
            </div>
          );
        })()}
      </div>
    </div>
  </>
  );
}

export function CustomersModal({
  onClose,
  onOpenProfile,
  onOpenNewOrder,
  onOpenPancakeLink,
  isPage = false,
  searchKeyword = "",
  onScroll,
}: {
  onClose: () => void;
  onOpenProfile?: (u: string, p: Platform) => void;
  onOpenNewOrder?: (u: string, p: Platform) => void;
  onOpenPancakeLink?: (
    user: string,
    platform: Platform,
    initialSearch?: string,
  ) => void;
  isPage?: boolean;
  searchKeyword?: string;
  onScroll?: (isDown: boolean) => void;
}) {
  const store = useStore();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">(
    "all",
  );
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "has_orders" | "holding" | "shipped"
  >("all");
  const [activeDropdown, setActiveDropdown] = useState<
    "platform" | "status" | "tag" | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    try {
      return (
        (localStorage.getItem("slp_customers_view_mode") as "list" | "grid") ||
        "grid"
      );
    } catch {
      return "grid";
    }
  });

  const handleSetViewMode = (mode: "list" | "grid") => {
    setViewMode(mode);
    try {
      localStorage.setItem("slp_customers_view_mode", mode);
    } catch {}
  };

  const lastScrollY = useRef(0);
  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentY = e.currentTarget.scrollTop;
    if (onScroll) {
      if (currentY > lastScrollY.current + 5 && currentY > 20) {
        onScroll(true); // Lướt xuống
      } else if (currentY < lastScrollY.current - 5) {
        onScroll(false); // Lướt lên
      }
    }
    lastScrollY.current = currentY;
  };

  const effectiveSearch = (searchTerm || searchKeyword || "")
    .trim()
    .toLowerCase();

  const {
    customerList,
    totalCustomersDangChot,
    totalCustomersHolding,
    totalCustomersShipped,
  } = useMemo(() => {
    let list: {
      user: string;
      platform: Platform;
      data: CustomerData;
      tag: string;
      sevenDaysRevenue: number;
      hasRecent: boolean;
      hasOldItems: boolean;
      dangChotQty: number;
      dangChotTotal: number;
      dangGiuQty: number;
      dangGiuTotal: number;
      daChotQty: number;
      daChotTotal: number;
      hasDangChot: boolean;
      isHolding: boolean;
      isAllShipped: boolean;
      shippedPancakeOrder: any;
      isNinhThuan?: boolean;
      isGheLay?: boolean;
      avatar?: string;
    }[] = [];

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    (["tiktok", "facebook", "shopee"] as Platform[]).forEach((p) => {
      if (selectedPlatform !== "all" && selectedPlatform !== p) return;
      const custs = store[p].customers;

      Object.keys(custs).forEach((rawUser) => {
        const user = normalizeUser(rawUser);
        const data = custs[rawUser];
        const tag =
          store[p].tags?.[user] ||
          store[p].tags?.[rawUser] ||
          store[p].tags?.[user.toLowerCase()] ||
          store[p].tags?.[rawUser.toLowerCase()] ||
          "NORMAL";

        let sevenDaysRevenue = 0;
        let hasRecent = false;
        let oldestUnshippedTime = now;

        const allItems = [...(data.items || []), ...(data.pastItems || [])];
        allItems.forEach((item) => {
          const itemTime =
            item.createdAt ||
            (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) ||
            0;
          if (itemTime >= sevenDaysAgo) {
            sevenDaysRevenue += item.price || 0;
            hasRecent = true;
          }
          if (!item.shipped && itemTime > 0 && itemTime < oldestUnshippedTime) {
            oldestUnshippedTime = itemTime;
          }
        });

        // Kiểm tra trạng thái đã đi hết đơn trên Pancake POS
        const custInsight = getCustomerInsight(user);
        const shippedStatus = checkCustomerPancakeShippedStatus(
          data,
          custInsight,
        );
        const isAllShipped = shippedStatus.isAllShipped;
        const shippedPancakeOrder = shippedStatus.latestPancakeOrder;

        // 1. Đang chốt: đơn đang chốt hôm nay / phiên này
        const activeItems = (data.items || []).filter((it) => !it.shipped);
        const dangChotQty = activeItems.reduce(
          (s, it) => s + (it.quantity || 1),
          0,
        );
        const dangChotTotal = activeItems.reduce(
          (s, it) => s + (it.price || 0),
          0,
        );
        const hasDangChot = dangChotQty > 0;

        // 2. Đang giữ đơn: đơn đang chốt các phiên trước chưa giao
        const allPast = data.pastItems || [];
        const unshippedPastItems = allPast.filter((it) => !it.shipped);
        const effectivePast =
          unshippedPastItems.length > 0 || allPast.length === 0
            ? unshippedPastItems
            : allPast;
        const dangGiuQty = effectivePast.reduce(
          (s, it) => s + (it.quantity || 1),
          0,
        );
        const dangGiuTotal = effectivePast.reduce(
          (s, it) => s + (it.price || 0),
          0,
        );
        const isHolding =
          dangGiuQty > 0 ||
          (tag as string) === "HOLD" ||
          (tag as string) === "GIU";

        // 3. Đã chốt: TỔNG của "Đang chốt" và "Đang giữ" cộng lại số lượng và thành tiền
        const daChotQty = dangChotQty + dangGiuQty;
        const daChotTotal = dangChotTotal + dangGiuTotal;

        // Cảnh báo nếu có đơn giữ quá 3 ngày (72h)
        const hasOldItems = now - oldestUnshippedTime > 3 * 24 * 60 * 60 * 1000;

        // O(1) instant avatar lookup
        const avatar = getCustomerAvatar(user, p) || undefined;

        list.push({
          user,
          platform: p,
          data,
          tag,
          sevenDaysRevenue,
          hasRecent,
          hasOldItems,
          dangChotQty,
          dangChotTotal,
          dangGiuQty,
          dangGiuTotal,
          daChotQty,
          daChotTotal,
          hasDangChot,
          isHolding,
          isAllShipped,
          shippedPancakeOrder,
          isNinhThuan: Boolean(
            store[p].ninhThuanTags?.[user] || store[p].ninhThuanTags?.[rawUser],
          ),
          isGheLay:
            isCustomerGheLay(store[p].gheLayTags, user, store[p].tags) ||
            isCustomerGheLay(store[p].gheLayTags, rawUser, store[p].tags),
          avatar,
        });
      });
    });

    // Thống kê nhanh số lượng phục vụ hiển thị trên nút lọc
    const dangChot = list.filter((c) => c.hasDangChot).length;
    const holding = list.filter((c) => c.isHolding).length;
    const shipped = list.filter((c) => c.isAllShipped).length;

    // Filter by status (Đang chốt / Đang giữ / Đã đi hết)
    if (statusFilter === "has_orders") {
      list = list.filter((c) => c.hasDangChot);
    } else if (statusFilter === "holding") {
      list = list.filter((c) => c.isHolding);
    } else if (statusFilter === "shipped") {
      list = list.filter((c) => c.isAllShipped);
    }

    // Filter by tag
    if (selectedTag !== "all") {
      const normSelTag = selectedTag.toUpperCase();
      if (normSelTag === "NINHTHUAN") {
        list = list.filter((c) => c.isNinhThuan);
      } else if (normSelTag === "GHE_LAY") {
        list = list.filter((c) => c.isGheLay || String(c.tag).toUpperCase() === "GHE_LAY");
      } else {
        list = list.filter((c) => String(c.tag).toUpperCase() === normSelTag);
      }
    }

    // Filter by search term
    if (effectiveSearch) {
      list = list.filter((c) => {
        if (
          (effectiveSearch === "/nt" || effectiveSearch === "/ninhthuan") &&
          c.isNinhThuan
        )
          return true;
        if (
          (effectiveSearch === "/coc" || effectiveSearch === "/coc50") &&
          c.tag === "COC"
        )
          return true;
        if (
          (effectiveSearch === "/coc" || effectiveSearch === "/coc100") &&
          c.tag === "COC_100"
        )
          return true;
        if (effectiveSearch === "/quen" && c.tag === "VIP") return true;
        if (effectiveSearch === "/vip" && c.tag === "VIP") return true;
        if (effectiveSearch === "/dao" && c.tag === "DAO") return true;
        if (effectiveSearch === "/chan" && c.tag === "CHAN") return true;
        if (effectiveSearch === "/bom" && c.tag === "BOM") return true;
        if (
          (effectiveSearch === "/ghelay" || effectiveSearch === "/gl") &&
          c.tag === "GHE_LAY"
        )
          return true;
        if (
          (effectiveSearch === "/giu" ||
            effectiveSearch === "/danggiu" ||
            effectiveSearch === "/dg") &&
          c.isHolding
        )
          return true;
        if (
          (effectiveSearch === "/condon" ||
            effectiveSearch === "/dangchot" ||
            effectiveSearch === "/dc") &&
          c.hasDangChot
        )
          return true;
        if (effectiveSearch === "/top10") return true;
        if (effectiveSearch.startsWith("/")) return false;

        const queryNoAccent = removeVietnameseAccents(effectiveSearch);
        const nick = store[c.platform].nicknames?.[c.user] || "";
        const shortId = getShortId(c.user).toLowerCase();
        const userLower = c.user.toLowerCase();
        const userNoAccent = removeVietnameseAccents(userLower);
        const nickLower = nick.toLowerCase();
        const nickNoAccent = removeVietnameseAccents(nickLower);

        return (
          userLower.includes(effectiveSearch) ||
          userNoAccent.includes(queryNoAccent) ||
          nickLower.includes(effectiveSearch) ||
          nickNoAccent.includes(queryNoAccent) ||
          shortId.includes(effectiveSearch) ||
          ("#" + shortId).includes(effectiveSearch)
        );
      });
    }

    // Sắp xếp: ưu tiên có đơn chốt -> tổng 7 ngày cao nhất lên đầu -> tổng all time
    list.sort((a, b) => {
      if (effectiveSearch === "/top10") {
        return (b.data.lastTime || 0) - (a.data.lastTime || 0);
      }
      if (statusFilter === "has_orders") {
        return b.dangChotQty - a.dangChotQty;
      }
      if (statusFilter === "holding") {
        return b.dangGiuQty - a.dangGiuQty;
      }
      if (b.daChotQty !== a.daChotQty) return b.daChotQty - a.daChotQty;
      if (b.sevenDaysRevenue !== a.sevenDaysRevenue)
        return b.sevenDaysRevenue - a.sevenDaysRevenue;
      return (b.data.total || 0) - (a.data.total || 0);
    });

    return {
      customerList: list,
      totalCustomersDangChot: dangChot,
      totalCustomersHolding: holding,
      totalCustomersShipped: shipped,
    };
  }, [
    selectedPlatform,
    store.tiktok.customers,
    store.facebook.customers,
    store.shopee.customers,
    store.tiktok.tags,
    store.facebook.tags,
    store.shopee.tags,
    store.tiktok.nicknames,
    store.facebook.nicknames,
    store.shopee.nicknames,
    statusFilter,
    selectedTag,
    effectiveSearch,
  ]);

  const totalAllPlatforms = (
    ["tiktok", "facebook", "shopee"] as Platform[]
  ).reduce((sum, p) => sum + Object.keys(store[p].customers).length, 0);

  return (
    <div
      className={
        isPage
          ? "h-full w-full flex flex-col bg-[#0e1621]"
          : "fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-2 sm:p-4"
      }
    >
      <div
        className={`w-full ${isPage ? "h-full flex flex-col bg-[#0e1621]" : "bg-[#1c242f] rounded-2xl border border-white/10 max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"}`}
      >
        {/* Modal Header */}
        {!isPage && (
          <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0 bg-[#1c242f]">
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <h3 className="text-lg font-bold text-gray-100 m-0">
                DANH SÁCH KHÁCH HÀNG
              </h3>
              <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2.5 py-0.5 rounded-full ml-1 border border-blue-500/30">
                {customerList.length} khách
              </span>
            </div>
            <button
              onClick={onClose}
              className="bg-white/10 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-400 hover:bg-white/20 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1-Row Compact Filter Bar */}
        <div className="px-3 py-2 bg-[#1c242f] border-b border-white/10 shrink-0 flex items-center justify-between gap-1.5 z-20">
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-1 py-0.5">
            {/* 1. Platform Dropdown */}
            <div className="relative shrink-0">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  selectedPlatform !== "all"
                    ? `${PLATFORMS[selectedPlatform].bgClass} text-white border-white/20 ring-1 ring-white/20`
                    : "bg-blue-600 border-blue-500 text-white"
                }`}
              >
                <span>
                  {selectedPlatform !== "all"
                    ? PLATFORMS[selectedPlatform].label
                    : "🌐 Tất cả sàn"}
                </span>
                <span className="text-[10px] opacity-80 font-mono font-normal">
                  (
                  {selectedPlatform !== "all"
                    ? Object.keys(store[selectedPlatform].customers).length
                    : totalAllPlatforms}
                  )
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                <option value="all" className="bg-[#1c242f] text-white">
                  🌐 Tất cả sàn ({totalAllPlatforms})
                </option>
                {(["tiktok", "facebook", "shopee"] as Platform[]).map((p) => {
                  const count = Object.keys(store[p].customers).length;
                  return (
                    <option
                      key={p}
                      value={p}
                      className="bg-[#1c242f] text-white"
                    >
                      {PLATFORMS[p].label} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Status Dropdown */}
            <div className="relative shrink-0">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  statusFilter === "has_orders"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : statusFilter === "holding"
                      ? "bg-amber-600 border-amber-500 text-white"
                      : statusFilter === "shipped"
                        ? "bg-emerald-700 border-emerald-600 text-white"
                        : "bg-[#0e1621] border-white/10 text-gray-300"
                }`}
              >
                <span>
                  {statusFilter === "all"
                    ? "📊 Trạng thái"
                    : statusFilter === "has_orders"
                      ? `🛍️ Đang chốt (${totalCustomersDangChot})`
                      : statusFilter === "holding"
                        ? `⏳ Đang giữ (${totalCustomersHolding})`
                        : `✅ Đã đi hết (${totalCustomersShipped})`}
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                <option value="all" className="bg-[#1c242f] text-white">
                  📊 Tất cả trạng thái
                </option>
                <option value="has_orders" className="bg-[#1c242f] text-white">
                  🛍️ Đang chốt hôm nay ({totalCustomersDangChot})
                </option>
                <option value="holding" className="bg-[#1c242f] text-white">
                  ⏳ Đang giữ đơn ({totalCustomersHolding})
                </option>
                {totalCustomersShipped > 0 && (
                  <option value="shipped" className="bg-[#1c242f] text-white">
                    ✅ Đã đi hết đơn ({totalCustomersShipped})
                  </option>
                )}
              </select>
            </div>

            {/* 3. Tag Dropdown */}
            <div className="relative shrink-0">
              <div
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap flex items-center gap-1.5 border shadow-xs pointer-events-none ${
                  selectedTag !== "all"
                    ? "bg-orange-600 border-orange-500 text-white"
                    : "bg-[#0e1621] border-white/10 text-gray-300"
                }`}
              >
                <span>
                  {selectedTag === "all"
                    ? "🏷️ Nhãn"
                    : selectedTag === "NINHTHUAN"
                      ? "🌴 Ninh Thuận"
                      : selectedTag === "VIP"
                        ? "🌟 Quen (VIP)"
                        : selectedTag === "COC"
                          ? "💧 Cọc 50k"
                          : selectedTag === "COC_100"
                            ? "💧 Cọc 100k"
                            : selectedTag === "GHE_LAY"
                              ? "🛵 Ghé lấy"
                              : selectedTag === "DAO"
                                ? "👻 Dạo"
                                : selectedTag === "BOM"
                                  ? "⚠️ BOM"
                                  : selectedTag === "CHAN"
                                    ? "⛔ Chặn"
                                    : `🏷️ ${selectedTag}`}
                </span>
                <ChevronDown size={12} className="opacity-80" />
              </div>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
              >
                <option value="all" className="bg-[#1c242f] text-white">
                  🏷️ Tất cả nhãn
                </option>
                <option
                  value="NINHTHUAN"
                  className="bg-[#1c242f] text-amber-300 font-bold"
                >
                  🏛️ Ninh Thuận
                </option>
                <option value="VIP" className="bg-[#1c242f] text-white">
                  🌟 Quen (VIP)
                </option>
                <option value="COC" className="bg-[#1c242f] text-white">
                  💧 Cọc 50k
                </option>
                <option value="COC_100" className="bg-[#1c242f] text-white">
                  💧 Cọc 100k
                </option>
                <option
                  value="GHE_LAY"
                  className="bg-[#1c242f] text-emerald-300 font-bold"
                >
                  🛵 Ghé lấy (0đ ship)
                </option>
                <option value="GIU" className="bg-[#1c242f] text-white">
                  ⏳ Giữ hàng
                </option>
                <option value="DAO" className="bg-[#1c242f] text-white">
                  👻 Dạo
                </option>
                <option value="BOM" className="bg-[#1c242f] text-white">
                  ⚠️ BOM
                </option>
                <option value="CHAN" className="bg-[#1c242f] text-white">
                  ⛔ Chặn
                </option>
              </select>
            </div>
          </div>

          {/* View Mode Toggle: List vs Grid */}
          <div className="flex items-center bg-[#0e1621] p-0.5 rounded-lg border border-white/10 shrink-0 shadow-inner ml-1">
            <button
              type="button"
              onClick={() => handleSetViewMode("list")}
              className={`p-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                viewMode === "list"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Xem dạng danh sách"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode("grid")}
              className={`p-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                viewMode === "grid"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-1 ring-white/20"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Xem dạng ô (Grid)"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>

        {/* In-modal Local Search if in popup mode */}
        {!isPage && (
          <div className="px-3 pb-2 pt-1 bg-[#1c242f] border-b border-white/10 shrink-0">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Tìm tên, biệt danh, #id hoặc /dangchot, /danggiu, /vip, /coc..."
                className="w-full pl-3 pr-8 py-1.5 bg-[#0e1621] border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 placeholder-gray-400 font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 text-gray-400 hover:text-white text-xs font-bold bg-white/10 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Thanh kết quả tìm kiếm trực tiếp trên trang Khách hàng */}
        {effectiveSearch && (
          <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-3 py-1.5 flex items-center justify-between text-xs text-emerald-200 shrink-0">
            <span className="flex items-center gap-1.5 font-bold truncate">
              <span>👥</span>
              <span>
                Tìm thấy{" "}
                <strong className="text-white font-black text-sm">
                  {customerList.length}
                </strong>{" "}
                khách hàng khớp "{effectiveSearch}"
              </span>
            </span>
            <span className="text-[10px] text-emerald-300 font-medium px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-500/30 shrink-0">
              Đang lọc khách hàng
            </span>
          </div>
        )}

        {/* Customer List Content */}
        <div
          onScroll={handleListScroll}
          className="overflow-y-auto flex-1 bg-[#0e1621] pb-24"
        >
          {customerList.length === 0 ? (
            <div className="text-center text-gray-400 py-16 px-4">
              <div className="text-3xl mb-2">👥</div>
              <div className="text-sm font-medium">
                {effectiveSearch
                  ? `Không tìm thấy khách hàng nào khớp với "${effectiveSearch}"`
                  : "Chưa có dữ liệu khách hàng phù hợp bộ lọc"}
              </div>
            </div>
          ) : viewMode === "grid" ? (
            /* CHẾ ĐỘ XEM DẠNG Ô (GRID VIEW) CHO KHÁCH HÀNG */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3 p-2.5">
              {customerList.map((item, idx) => {
                const cleanUser = normalizeUser(item.user);
                const nickname = store[item.platform].nicknames?.[cleanUser];
                const displayName = nickname
                  ? `(${nickname}) ${cleanUser}`
                  : cleanUser;
                const pLink = store[item.platform].pancakeLinks?.[cleanUser];
                return (
                  <div
                    key={`cust-grid-${item.platform}-${cleanUser}-${idx}`}
                    onClick={() => onOpenProfile?.(cleanUser, item.platform)}
                    className="bg-[#151f2e] hover:bg-[#1a273a] border border-white/10 hover:border-blue-500/50 rounded-2xl p-3 flex flex-col justify-between shadow-md hover:shadow-xl transition-all cursor-pointer group active:scale-[0.99]"
                    title="Bấm vào thẻ để xem chi tiết & giỏ hàng"
                  >
                    <div>
                      {/* Header Card: Avatar + Tên + Platform + Mã ID */}
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <CustomerAvatar
                            user={cleanUser}
                            platform={item.platform}
                            avatarUrl={item.avatar}
                            tag={item.tag}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-mono font-bold text-gray-400">
                              #{getShortId(cleanUser)}
                            </div>
                            <div
                              className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate"
                              title={displayName}
                            >
                              {displayName}
                            </div>
                          </div>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <CopyButton
                            text={displayName}
                            className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
                          />
                        </div>
                      </div>

                      {/* Badges: Đã đi hết đơn / Đang chốt / Đang giữ / Giữ > 3 ngày */}
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {item.isNinhThuan && (
                          <span className="bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                            <ThapChamIcon className="w-2.5 h-2.5" />
                            <span>Ninh Thuận</span>
                          </span>
                        )}
                        {item.isGheLay && (
                          <span className="bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                            <span>🛵</span>
                            <span>Ghé lấy</span>
                          </span>
                        )}
                        {item.isAllShipped ? (
                          <span className="bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                            ✅ Đã đi hết đơn (#
                            {item.shippedPancakeOrder.orderNumber})
                          </span>
                        ) : (
                          <>
                            {item.hasDangChot && (
                              <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                🛍️ Đang chốt ({item.dangChotQty} món ·{" "}
                                {item.dangChotTotal}k)
                              </span>
                            )}
                            {item.isHolding && item.dangGiuQty > 0 && (
                              <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                ⏳ Đang giữ {item.dangGiuQty} món (
                                {item.dangGiuTotal}k)
                              </span>
                            )}
                          </>
                        )}
                        {item.hasOldItems && (
                          <span className="bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                            ⏰ Giữ &gt; 3 ngày
                          </span>
                        )}
                      </div>

                      {/* Thống kê đơn chốt: Đã chốt = Tổng Đang chốt + Đang giữ */}
                      <div className="bg-[#0c141f] p-2 rounded-xl border border-white/5 text-[11px] text-gray-400 flex items-center justify-between">
                        <div>
                          Đã chốt:{" "}
                          <strong className="text-blue-400 font-bold">
                            {item.daChotQty} cái
                          </strong>{" "}
                          ({item.daChotTotal}k)
                        </div>
                        {item.sevenDaysRevenue > 0 && (
                          <div>
                            7 ngày:{" "}
                            <strong className="text-gray-200 font-semibold">
                              {item.sevenDaysRevenue}k
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* CHẾ ĐỘ XEM DẠNG DANH SÁCH (LIST VIEW) */
            <div className="divide-y divide-white/5">
              {customerList.map((item, idx) => {
                const cleanUser = normalizeUser(item.user);
                const nickname = store[item.platform].nicknames?.[cleanUser];
                const displayName = nickname
                  ? `(${nickname}) ${cleanUser}`
                  : cleanUser;
                const pLink = store[item.platform].pancakeLinks?.[cleanUser];

                return (
                  <div
                    key={`cust-${item.platform}-${cleanUser}-${idx}`}
                    className="px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    onClick={() => onOpenProfile?.(cleanUser, item.platform)}
                  >
                    {/* Left: Customer Avatar + Details */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-1">
                      <CustomerAvatar
                        user={cleanUser}
                        platform={item.platform}
                        avatarUrl={item.avatar}
                        tag={item.tag}
                        size="md"
                        onClick={() =>
                          onOpenProfile?.(cleanUser, item.platform)
                        }
                      />
                      <div
                        onClick={() =>
                          onOpenProfile?.(cleanUser, item.platform)
                        }
                        className="cursor-pointer flex-1 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Customer ID */}
                          <span className="text-[11px] font-mono font-bold text-gray-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10 shrink-0">
                            #{getShortId(cleanUser)}
                          </span>
                          {/* Customer Name */}
                          <span
                            className="text-[15px] font-bold text-white hover:text-blue-400 transition-colors truncate"
                            title="Bấm để xem hồ sơ"
                          >
                            {displayName}
                          </span>
                          {/* Copy Button */}
                          <CopyButton
                            text={displayName}
                            className="text-xs shrink-0 text-gray-500 hover:text-gray-300"
                          />

                          {item.isNinhThuan && (
                            <span className="bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                              <ThapChamIcon className="w-2.5 h-2.5" />
                              <span>Ninh Thuận</span>
                            </span>
                          )}

                          {item.isGheLay && !item.isNinhThuan && (
                            <span className="bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                              <span>🛵</span>
                              <span>Ghé lấy</span>
                            </span>
                          )}

                          {item.isAllShipped && (
                            <span className="bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                              ✅ Đã đi hết đơn{" "}
                              {item.shippedPancakeOrder
                                ? "#" + item.shippedPancakeOrder.orderNumber
                                : ""}
                            </span>
                          )}
                          {/* HIỂN THỊ ĐANG CHỐT (ĐƠN HÔM NAY) */}
                          {item.hasDangChot && (
                            <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                              🛍️ Đang chốt ({item.dangChotQty} món ·{" "}
                              {item.dangChotTotal}k)
                            </span>
                          )}

                          {/* HIỂN THỊ ĐANG GIỮ (CÁC PHIÊN TRƯỚC) */}
                          {item.isHolding && item.dangGiuQty > 0 && (
                            <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                              ⏳ Đang giữ {item.dangGiuQty} món (
                              {item.dangGiuTotal}k)
                            </span>
                          )}

                          {/* Old items warning */}
                          {item.hasOldItems && (
                            <span className="bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                              ⏰ Giữ &gt; 3 ngày
                            </span>
                          )}
                        </div>

                        {/* Subtitle Line: Đã chốt: TỔNG đang chốt + đang giữ */}
                        <div className="text-[12px] text-gray-400 mt-1 flex items-center flex-wrap">
                          <span>Đã chốt:</span>
                          <span className="font-bold text-blue-400 ml-1.5">
                            {item.daChotQty} cái{" "}
                            <span className="text-gray-500 font-normal mx-0.5">
                              -
                            </span>{" "}
                            {item.daChotTotal}k
                          </span>
                          {item.sevenDaysRevenue > 0 && (
                            <span className="text-gray-400 ml-2 font-medium">
                              <span className="text-gray-600 mr-1.5">·</span>7
                              ngày:{" "}
                              <span className="text-gray-300 font-semibold">
                                {item.sevenDaysRevenue}k
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Click to open profile chevron indicator */}
                    <div className="text-gray-500 group-hover:text-blue-400 transition-colors text-xs font-bold shrink-0">
                      ›
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
