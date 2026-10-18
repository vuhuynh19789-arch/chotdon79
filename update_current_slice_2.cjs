const fs = require("fs");

let file = fs.readFileSync("src/components/Modals.tsx", "utf8");

const start = file.lastIndexOf("<div className=\"mb-6\">", file.indexOf("🛒 Đơn chốt phiên này"));
const pastHeaderIdx = file.indexOf("📜 Lịch sử chốt đơn cũ");
const end = file.lastIndexOf("<div>", pastHeaderIdx);

if (start === -1 || end === -1 || end <= start) {
  console.error("Could not find boundaries!", { start, end });
  process.exit(1);
}

const replacement = `{(() => {
                        const activeInsight = (pancakeInput && pancakeInput.trim()) ? (insight || getCustomerInsight(cleanUser)) : null;
                        const sStat = checkCustomerPancakeShippedStatus(cust, activeInsight);
                        const currentItems = cust?.items || [];
                        const hasCurrentItems = currentItems.length > 0;
                        const unshippedCount = currentItems.filter(it => !it.shipped).length;
                        const shippedCount = currentItems.filter(it => it.shipped).length;

                        return (
                            <div className="mb-6">
                                {/* Thông báo phát hiện đơn Pancake cho các món hôm nay */}
                                {sStat.latestPancakeOrder && hasCurrentItems && (
                                    <div className="bg-gradient-to-r from-[#0d2218] via-[#112d20] to-[#0d2218] border border-emerald-500/50 rounded-xl p-3 mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-lg shadow-emerald-950/30 animate-fadeIn">
                                        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                                            <span className="text-xl shrink-0 mt-0.5 sm:mt-0">🥞</span>
                                            <div className="min-w-0">
                                                <div className="text-xs font-black text-emerald-300 flex items-center gap-1.5 flex-wrap">
                                                    <span>ĐƠN PANCAKE #{sStat.latestPancakeOrder.orderNumber}</span>
                                                    <span className="text-[10px] text-emerald-200/80 font-normal">({formatDateTime(sStat.latestPancakeOrder.insertedAt)})</span>
                                                    <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded border border-emerald-500/30 font-bold">
                                                        {getOrderStatusLabel(sStat.latestPancakeOrder.status).text}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-emerald-100/90 leading-tight mt-0.5">
                                                    Khách đã có đơn trên Pancake POS. Bấm nút để đánh dấu giỏ hàng này đã đi đơn:
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    store.markAllCustomerItemsShipped(platform, cleanUser);
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap w-full sm:w-auto justify-center"
                                            >
                                                <span>✅ Đã Đi Đơn (#{sStat.latestPancakeOrder.orderNumber})</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="text-sm font-bold text-gray-100 mb-3 flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span>🛒 Đơn chốt phiên này</span>
                                        {hasCurrentItems && (
                                            <label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer text-gray-400 bg-[#1c242f] hover:bg-white/10 px-2 py-1 rounded transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-white/20 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedCurrent.size === currentItems.length && currentItems.length > 0}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedCurrent(new Set(currentItems.map((_, i) => i)));
                                                        } else {
                                                            setSelectedCurrent(new Set());
                                                        }
                                                    }}
                                                />
                                                Chọn tất cả ({currentItems.length})
                                            </label>
                                        )}
                                        {shippedCount > 0 && (
                                            <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                                Đã gửi: {shippedCount}/{currentItems.length}
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {selectedCurrent.size > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    Array.from(selectedCurrent).forEach(idx => {
                                                        store.toggleCurrentItemShipped(platform, cleanUser, idx);
                                                    });
                                                }}
                                                className="text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-950/50 hover:bg-emerald-900/60 px-2.5 py-1 rounded-lg border border-emerald-500/40 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                                            >
                                                <span>✅ Đánh dấu đã gửi ({selectedCurrent.size})</span>
                                            </button>
                                        )}
                                        {hasCurrentItems && totalSelectedCount === 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedCurrent(new Set(currentItems.map((_, i) => i)));
                                                    setIsPushModalOpen(true);
                                                }}
                                                className="text-[11px] font-bold text-orange-400 hover:text-white bg-orange-950/40 hover:bg-orange-900/50 px-2.5 py-1 rounded-lg border border-orange-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                                            >
                                                <span>🥞 Đẩy đơn Pancake</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mb-4">
                                    {!hasCurrentItems ? (
                                        <div className="text-center text-gray-400 py-4 bg-[#0e1621] rounded-xl border border-dashed border-white/10 text-xs">
                                            Phiên này chưa chốt đơn nào.
                                        </div>
                                    ) : (
                                        <div className="bg-[#1c242f] border border-white/10 rounded-xl p-3 shadow-sm space-y-1">
                                            {currentItems.map((item, idx) => ({ item, idx })).reverse().map(({ item, idx }) => {
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        className={\`flex justify-between items-center py-2 px-2 rounded-lg border-b border-dashed border-white/5 last:border-0 gap-2 transition-colors \${selectedCurrent.has(idx) ? 'bg-blue-950/30' : item.shipped ? 'bg-emerald-950/20' : 'hover:bg-white/5'}\`}
                                                    >
                                                        <div className="flex-1 min-w-0 flex items-center gap-2">
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
                                                            <button
                                                                type="button"
                                                                onClick={() => store.toggleCurrentItemShipped(platform, cleanUser, idx)}
                                                                title={item.shipped ? "Bấm để đổi thành Chưa gửi" : "Bấm để đánh dấu Đã gửi / Đã lên đơn"}
                                                                className={\`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 shrink-0 \${
                                                                    item.shipped 
                                                                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/35' 
                                                                        : 'bg-white/5 text-gray-400 border-white/15 hover:bg-emerald-950/40 hover:text-emerald-300 hover:border-emerald-500/40'
                                                                }\`}
                                                            >
                                                                {item.shipped ? '✅ ĐÃ GỬI' : '📦 Đã gửi?'}
                                                            </button>
                                                            <span className={\`text-gray-100 font-medium text-sm truncate \${item.shipped ? 'line-through text-gray-400 opacity-80' : ''}\`}>
                                                                {(!item.content || item.content === "(Không ghi chú)" || item.content.includes("Không ghi chú")) ? \`Sản phẩm \${item.price}k\` : item.content}
                                                            </span>
                                                            <span className={\`font-bold text-sm shrink-0 \${item.shipped ? 'text-emerald-400 font-mono' : 'text-blue-400'}\`}>
                                                                {item.price}k
                                                            </span>
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
                                                                onDelete={() => store.deleteOrderItem(platform, cleanUser, idx, false)}
                                                                className="rounded px-2.5 py-1"
                                                            />
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

                    `;

file = file.substring(0, start) + replacement + file.substring(end);
fs.writeFileSync("src/components/Modals.tsx", file);
console.log("Successfully replaced Current Items section in Modals.tsx!");
