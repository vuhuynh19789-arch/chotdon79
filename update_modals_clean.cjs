const fs = require("fs");

let modalsCode = fs.readFileSync("src/components/Modals.tsx", "utf8");

// 1. Update imports
modalsCode = modalsCode.replace(
  /import \{ getCustomerInsight, getOrderStatusLabel, getPartnerStatusLabel, syncSingleCustomerPancakeOrders, checkCustomerPancakeShippedStatus \} from '\.\.\/lib\/pancakeSync';/,
  "import { getCustomerInsight, getOrderStatusLabel, getPartnerStatusLabel, syncSingleCustomerPancakeOrders, checkCustomerPancakeShippedStatus, formatDateTime, parseOrderTimestamp, toStartOfDay } from '../lib/pancakeSync';"
);

// 2. Add showOldShippedItems state to CustomerDetailModal if not present
if (!modalsCode.includes("const [showOldShippedItems, setShowOldShippedItems]")) {
  modalsCode = modalsCode.replace(
    "const [showAllOrders, setShowAllOrders] = useState(false);",
    "const [showAllOrders, setShowAllOrders] = useState(false);\n    const [showOldShippedItems, setShowOldShippedItems] = useState(false);"
  );
}

// 3. Update the Pancake status banner and action in CustomerDetailModal
const oldBannerRegex = /\{\/\* Banner trạng thái: ĐÃ ĐI HẾT ĐƠN nếu đơn Pancake gần nhất >= ngày chốt gần nhất \*\/\}[\s\S]*?\{!shippedStatus\.isAllShipped && cust\?\.items && cust\.items\.length > 0 && \(/;

const newBannerCode = `{/* Banner trạng thái: ĐÃ ĐI HẾT ĐƠN nếu đơn Pancake gần nhất >= ngày chốt gần nhất */}
                                {shippedStatus.isAllShipped && shippedStatus.latestPancakeOrder && (
                                    <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-xl p-3 flex items-start justify-between gap-2.5 shadow-md">
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
                                                    Đơn gần nhất trên Pancake {shippedStatus.latestPancakeOrder.insertedAt ? "(" + formatDateTime(shippedStatus.latestPancakeOrder.insertedAt) + ")" : ""} mới hơn ngày chốt đơn gần nhất. Toàn bộ đơn chốt trước đó đã được xử lý xong!
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
                                {!shippedStatus.isAllShipped && cust?.items && cust.items.length > 0 && (`

if (oldBannerRegex.test(modalsCode)) {
  modalsCode = modalsCode.replace(oldBannerRegex, newBannerCode);
}

// 4. Update Past Items Section in CustomerDetailModal
const oldPastSectionRegex = /\{\/\* 📜 Lịch sử chốt đơn cũ \*\/\}[\s\S]*?\{displayPastItems\.length === 0 \? \([\s\S]*?<\/div>\s*\)\s*\}\s*<\/div>/;

// Let's replace the whole Past items block cleanly
const newPastSectionCode = `{/* 📜 Lịch sử chốt đơn cũ */}
                    <div className="mb-6">
                        {(() => {
                            const activeInsight = (pancakeInput && pancakeInput.trim()) ? (insight || getCustomerInsight(cleanUser)) : null;
                            const sStat = checkCustomerPancakeShippedStatus(cust, activeInsight);
                            const pDayStart = sStat.latestPancakeTime ? toStartOfDay(sStat.latestPancakeTime) : 0;
                            
                            const displayPastItems = (cust?.pastItems || []).map((item, originalIdx) => ({ item, originalIdx })).filter(({ item }) => {
                                if (!sStat.hasPancakeOrders || !sStat.latestPancakeTime) return true;
                                if (item.shipped) return false;
                                const itTime = item.createdAt ? parseOrderTimestamp(item.createdAt) : (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || 0;
                                if (!itTime) return false;
                                const itDayStart = toStartOfDay(itTime);
                                if (pDayStart >= itDayStart) return false;
                                return itTime > (sStat.latestPancakeTime + 60000);
                            });

                            return (
                                <div>
                                    <div className="text-sm font-bold text-gray-100 mb-3 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span>📜 Lịch sử chốt đơn cũ</span>
                                            {displayPastItems.length > 0 && (
                                                <label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer text-gray-400 bg-[#1c242f] hover:bg-white/10 px-2 py-1 rounded transition-colors">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                                                        checked={selectedPast.size === displayPastItems.length && displayPastItems.length > 0}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedPast(new Set(displayPastItems.map(d => d.originalIdx)));
                                                            } else {
                                                                setSelectedPast(new Set());
                                                            }
                                                        }}
                                                    />
                                                    Chọn tất cả ({displayPastItems.length})
                                                </label>
                                            )}
                                        </div>
                                        {selectedPast.size > 0 && (
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => {
                                                        store.mergePastItems(platform, cleanUser, Array.from(selectedPast));
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
                                                            store.deletePastItems(platform, cleanUser, Array.from(selectedPast));
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

                                    <div className="space-y-3">
                                        {displayPastItems.length === 0 ? (
                                            sStat.isAllShipped && sStat.latestPancakeOrder ? (
                                                <div className="p-3.5 bg-emerald-950/40 rounded-xl border border-dashed border-emerald-500/30 text-xs space-y-2">
                                                    <div className="text-emerald-400 font-bold flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <span>✅ Lịch sử chốt đơn cũ đã đi hết trên Pancake POS</span>
                                                            <span className="font-mono text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">
                                                                #{sStat.latestPancakeOrder.orderNumber}
                                                            </span>
                                                        </div>
                                                        {cust?.pastItems && cust.pastItems.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => store.clearShippedPastItems(platform, cleanUser)}
                                                                className="text-[10px] font-bold text-emerald-300 hover:text-white bg-emerald-900/60 hover:bg-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-500/40 cursor-pointer transition-colors shadow-xs"
                                                            >
                                                                🧹 Dọn sạch ({cust.pastItems.length})
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-gray-300 leading-relaxed">
                                                        Toàn bộ lịch sử chốt đơn trước đó {cust?.pastItems?.length ? "(" + cust.pastItems.length + " món)" : ""} đã được lên đơn {sStat.latestPancakeOrder.insertedAt ? "(" + formatDateTime(sStat.latestPancakeOrder.insertedAt) + ")" : ""} và đã xử lý xong.
                                                    </div>
                                                    {cust?.pastItems && cust.pastItems.length > 0 && (
                                                        <div className="pt-1 border-t border-white/5 flex items-center justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowOldShippedItems(!showOldShippedItems)}
                                                                className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
                                                            >
                                                                {showOldShippedItems ? "▲ Thu gọn danh sách cũ" : \`▼ Xem lại chi tiết \${cust.pastItems.length} món cũ đã đi\`}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-center text-gray-400 py-4 bg-[#0e1621] rounded-xl border border-dashed border-white/10 text-xs">Chưa có lịch sử chốt đơn các phiên trước.</div>
                                            )
                                        ) : (
                                            <div className="bg-[#1c242f] border border-white/10 rounded-xl p-3 shadow-sm mt-2">
                                            {displayPastItems.reverse().map(({ item, originalIdx }) => {
                                                const itTime = item.createdAt ? parseOrderTimestamp(item.createdAt) : (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || Date.now();
                                                const d = new Date(itTime);
                                                const now = new Date();
                                                const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                                                const yesterday = new Date(now);
                                                yesterday.setDate(now.getDate() - 1);
                                                const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
                                                let dateStr = d.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'});
                                                if (isToday) dateStr = 'Hôm nay';
                                                else if (isYesterday) dateStr = 'Hôm qua';

                                                return (
                                                <div key={\`past-\${originalIdx}\`} className={\`flex justify-between items-center py-1.5 border-b border-dashed border-white/5 last:border-0 gap-2 \${selectedPast.has(originalIdx) ? 'bg-blue-50/30' : ''}\`}>
                                                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedPast.has(originalIdx)}
                                                            onChange={() => {
                                                                const newSet = new Set(selectedPast);
                                                                if (newSet.has(originalIdx)) newSet.delete(originalIdx);
                                                                else newSet.add(originalIdx);
                                                                setSelectedPast(newSet);
                                                            }}
                                                            className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                                        />
                                                        <span className="text-[9px] font-bold px-1 py-0.5 bg-white/10 text-gray-400 rounded uppercase shrink-0">{dateStr}</span>
                                                        {item.shipped && <span className="text-[9px] font-bold px-1 py-0.5 bg-blue-100 text-blue-600 rounded shrink-0">GỬI</span>}
                                                        <span className={\`text-gray-400 font-medium text-sm truncate \${item.shipped ? 'line-through' : ''}\`}>{(!item.content || item.content === "(Không ghi chú)" || item.content.includes("Không ghi chú")) ? \`Sản phẩm \${item.price}k\` : item.content}</span>
                                                        <span className="text-gray-300 font-bold text-sm shrink-0">{item.price}k</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button 
                                                            onClick={() => {
                                                                let time = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
                                                                const cleanPrintContent = (!item.content || item.content === "(Không ghi chú)" || item.content.includes("Không ghi chú")) ? "" : item.content;
                                                                printLabel(store[platform].nicknames?.[cleanUser] ? \`\${cleanUser} (\${store[platform].nicknames[cleanUser]})\` : \`#\${getShortId(cleanUser)} \${cleanUser}\`, cleanPrintContent, item.price, time, PLATFORMS[platform].label);
                                                            }}
                                                            className="bg-green-600 hover:bg-green-700 text-white rounded px-2.5 py-1 font-bold text-xs whitespace-nowrap flex items-center gap-1 shadow-2xs cursor-pointer"
                                                        >
                                                            🖨️ IN
                                                        </button>
                                                        <DeleteConfirmButton 
                                                            onDelete={() => store.deleteOrderItem(platform, cleanUser, originalIdx, true)}
                                                        />
                                                    </div>
                                                </div>
                                                );
                                            })}
                                            </div>
                                        )}

                                        {/* Bảng danh sách các món cũ đã đi (khi bấm Xem lại) */}
                                        {showOldShippedItems && cust?.pastItems && cust.pastItems.length > 0 && (
                                            <div className="bg-[#111822] border border-emerald-500/20 rounded-xl p-3 shadow-inner space-y-2 mt-2">
                                                <div className="text-[11px] font-bold text-emerald-300 flex items-center justify-between pb-1.5 border-b border-white/5">
                                                    <span>📋 Danh sách {cust.pastItems.length} món cũ đã lên đơn Pancake:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => store.clearShippedPastItems(platform, cleanUser)}
                                                        className="text-[10px] text-red-400 hover:text-red-300 underline cursor-pointer"
                                                    >
                                                        Xóa vĩnh viễn khỏi bộ nhớ
                                                    </button>
                                                </div>
                                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                    {cust.pastItems.map((item, pIdx) => {
                                                        const itTime = item.createdAt ? parseOrderTimestamp(item.createdAt) : (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || Date.now();
                                                        const d = new Date(itTime);
                                                        const dateStr = d.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'});
                                                        return (
                                                            <div key={\`old-\${pIdx}\`} className="flex items-center justify-between text-xs py-1 px-1.5 bg-black/20 rounded border border-white/5">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <span className="text-[9px] font-mono text-gray-400 bg-white/5 px-1 py-0.2 rounded">{dateStr}</span>
                                                                    <span className="text-gray-300 truncate">{(!item.content || item.content === "(Không ghi chú)" || item.content.includes("Không ghi chú")) ? \`Sản phẩm \${item.price}k\` : item.content}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span className="font-bold text-emerald-400">{item.price}k</span>
                                                                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-mono">#{sStat.latestPancakeOrder?.orderNumber || 'POS'}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>`;

// Replace past items section
const pastSectionStart = modalsCode.indexOf("{/* 📜 Lịch sử chốt đơn cũ */}");
if (pastSectionStart !== -1) {
  const pastSectionEnd = modalsCode.indexOf("</div>", modalsCode.indexOf("</DeleteConfirmButton>", pastSectionStart));
  const closingDiv = modalsCode.indexOf("</div>\n                    </div>", pastSectionStart);
  // Find where Customer modal closes the past items container
  // Let's replace by searching from pastSectionStart to next major section {/* GHI CHÚ KHÁCH HÀNG */} or end of modal
  const nextSection = modalsCode.indexOf("{/* Ghi chú khách hàng", pastSectionStart) !== -1 ? 
                      modalsCode.indexOf("{/* Ghi chú khách hàng", pastSectionStart) : 
                      modalsCode.indexOf("<div className=\"mb-6\">\n                        <div className=\"text-sm font-bold text-gray-100 mb-2\">Ghi chú");
  
  if (nextSection !== -1) {
    modalsCode = modalsCode.substring(0, pastSectionStart) + newPastSectionCode + "\n\n                    " + modalsCode.substring(nextSection);
  }
}

fs.writeFileSync("src/components/Modals.tsx", modalsCode);
console.log("Updated src/components/Modals.tsx successfully!");
