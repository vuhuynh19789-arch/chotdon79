import fs from 'fs';
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const targetStr = `                                cust.pastItems.map((item, idx) => (
                                    <div key={\`past-\${idx}\`} className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-xl p-3 gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-gray-600 font-medium text-sm truncate">{item.content}</div>
                                            <div className="text-gray-700 font-bold text-sm mt-0.5">{item.price}k</div>
                                        </div>
                                        <div className="flex flex-col gap-1.5 shrink-0">
                                            <button 
                                                onClick={() => {
                                                    let time = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
                                                    printLabel(store[platform].nicknames?.[user] ? \`\${user} (\${store[platform].nicknames[user]})\` : user, item.content === "(Không ghi chú)" ? "" : item.content, item.price, time, PLATFORMS[platform].label);
                                                }}
                                                className="bg-green-600 hover:bg-green-700 text-white rounded-md px-3 py-1.5 font-bold text-xs"
                                            >
                                                🖨️ IN LẠI
                                            </button>
                                            <DeleteConfirmButton 
                                                onDelete={() => store.deleteOrderItem(platform, user, idx, true)}
                                                className="rounded-md px-3 py-1.5"
                                            />
                                        </div>
                                    </div>
                                ))`;

const replaceStr = `                                cust.pastItems.map((item, idx) => {
                                    const d = new Date(item.createdAt || parseInt(item.id.substring(0,13)) || Date.now());
                                    const dateStr = d.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'});
                                    return (
                                    <div key={\`past-\${idx}\`} className={\`flex justify-between items-center bg-gray-50 border border-gray-100 rounded-xl p-3 gap-3 \${item.shipped ? 'opacity-60' : ''}\`}>
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            <div className="pt-1 shrink-0">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!item.shipped} 
                                                    onChange={() => store.togglePastItemShipped(platform, user, idx)}
                                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded uppercase">{dateStr}</span>
                                                    {item.shipped && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">ĐÃ GỬI</span>}
                                                </div>
                                                <div className={\`text-gray-600 font-medium text-sm truncate \${item.shipped ? 'line-through' : ''}\`}>{item.content}</div>
                                                <div className="text-gray-700 font-bold text-sm mt-0.5">{item.price}k</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5 shrink-0">
                                            <button 
                                                onClick={() => {
                                                    let time = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
                                                    printLabel(store[platform].nicknames?.[user] ? \`\${user} (\${store[platform].nicknames[user]})\` : user, item.content === "(Không ghi chú)" ? "" : item.content, item.price, time, PLATFORMS[platform].label);
                                                }}
                                                className="bg-green-600 hover:bg-green-700 text-white rounded-md px-3 py-1.5 font-bold text-xs"
                                            >
                                                🖨️ IN LẠI
                                            </button>
                                            <DeleteConfirmButton 
                                                onDelete={() => store.deleteOrderItem(platform, user, idx, true)}
                                                className="rounded-md px-3 py-1.5"
                                            />
                                        </div>
                                    </div>
                                )})`

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('src/components/Modals.tsx', code);
