import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `  const topVIPs = useMemo(() => {
      let all: any[] = [];
      (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
          Object.entries(store[p].customers).forEach(([user, data]: [string, any]) => {
              if (data.total > 0) {
                  all.push({ user, platform: p, data });
              }
          });
      });
      return all.sort((a,b) => b.data.total - a.data.total).slice(0, 10);
  }, [store.tiktok.customers, store.facebook.customers, store.shopee.customers]);

`;
code = code.replace(target1, '');

const target2 = `        {/* Top VIP Panel */}
        {topVIPs.length > 0 && !search && !isSearchFocused && (
            <div className="bg-white border-b border-gray-200 shrink-0 shadow-sm z-40">
                <div className="text-[11px] font-bold text-gray-500 px-3 pt-2 pb-1 flex items-center gap-1 uppercase">
                    <span className="text-yellow-500 text-sm">👑</span> Khách VIP cao nhất
                </div>
                <div className="flex overflow-x-auto px-3 pb-3 pt-1 gap-2.5 hide-scrollbar snap-x">
                    {topVIPs.map((m, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => { setProfileUser({user: m.user, platform: m.platform}); setActiveModal('profile'); }}
                            className="flex flex-col min-w-[130px] max-w-[140px] bg-gradient-to-br from-[#fffdf0] to-white border border-[#f5e6b3] rounded-xl p-2.5 cursor-pointer shadow-sm hover:border-yellow-400 shrink-0 snap-start relative overflow-hidden"
                        >
                            {idx === 0 && <div className="absolute -top-3 -right-3 text-3xl opacity-10">🥇</div>}
                            {idx === 1 && <div className="absolute -top-3 -right-3 text-3xl opacity-10">🥈</div>}
                            {idx === 2 && <div className="absolute -top-3 -right-3 text-3xl opacity-10">🥉</div>}
                            <div className="flex items-center gap-1.5 mb-1.5 z-10 relative">
                                <span className={\`text-[9px] font-bold px-1.5 py-0.5 rounded text-white \${PLATFORMS[m.platform].bgClass}\`}>{PLATFORMS[m.platform].label[0]}</span>
                                <span className="text-sm font-bold text-gray-800 truncate" title={m.user}>
                                    {store[m.platform].nicknames?.[m.user] || m.user}
                                </span>
                            </div>
                            <div className="text-sm font-black text-red-600 z-10 relative">{m.data.total}k</div>
                            <div className="text-[11px] font-medium text-gray-500 z-10 relative">{m.data.count} đơn hàng</div>
                        </div>
                    ))}
                </div>
            </div>
        )}

`;
code = code.replace(target2, '');

fs.writeFileSync('src/App.tsx', code);
