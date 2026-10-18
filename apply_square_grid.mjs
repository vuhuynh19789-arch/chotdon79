import fs from 'fs';

let content = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const custModalStartIndex = content.indexOf('export function CustomersModal({');
if (custModalStartIndex === -1) {
  console.error("CustomersModal not found!");
  process.exit(1);
}

const beforeCustModal = content.substring(0, custModalStartIndex);

const newCustomersModal = `export function CustomersModal({
    onClose,
    onOpenProfile,
    onOpenNewOrder,
    onOpenPancakeLink,
    isPage = false,
    searchKeyword = '',
    onScroll
}: {
    onClose: () => void;
    onOpenProfile?: (u: string, p: Platform) => void;
    onOpenNewOrder?: (u: string, p: Platform) => void;
    onOpenPancakeLink?: (user: string, platform: Platform, initialSearch?: string) => void;
    isPage?: boolean;
    searchKeyword?: string;
    onScroll?: (isDown: boolean) => void;
}) {
    const store = useStore();
    const [selectedPlatform, setSelectedPlatform] = useState<Platform | 'all'>('all');
    const [selectedTag, setSelectedTag] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'has_orders' | 'holding'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
        try {
            // Mặc định dạng ô vuông (grid) nếu chưa có cài đặt
            const saved = localStorage.getItem('slp_customers_view_mode');
            return (saved as 'list' | 'grid') || 'grid';
        } catch {
            return 'grid';
        }
    });

    const handleSetViewMode = (mode: 'list' | 'grid') => {
        setViewMode(mode);
        try {
            localStorage.setItem('slp_customers_view_mode', mode);
        } catch {}
    };

    const toggleViewMode = () => {
        const nextMode = viewMode === 'grid' ? 'list' : 'grid';
        handleSetViewMode(nextMode);
    };

    const lastScrollY = useRef(0);
    const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const currentY = e.currentTarget.scrollTop;
        if (onScroll) {
            if (currentY > lastScrollY.current + 5 && currentY > 20) {
                onScroll(true);
            } else if (currentY < lastScrollY.current - 5) {
                onScroll(false);
            }
        }
        lastScrollY.current = currentY;
    };

    let customerList: { 
        user: string; 
        platform: Platform; 
        data: CustomerData; 
        tag: string; 
        sevenDaysRevenue: number; 
        hasRecent: boolean; 
        hasOldItems: boolean;
        activeItemsCount: number;
        activeItemsTotal: number;
        holdingCount: number;
        holdingTotal: number;
        hasActiveOrders: boolean;
        isHolding: boolean;
        avatar?: string;
    }[] = [];

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
        if (selectedPlatform !== 'all' && selectedPlatform !== p) return;
        const custs = store[p].customers;
        const comments = store[p].comments;

        Object.keys(custs).forEach(rawUser => {
            const user = normalizeUser(rawUser);
            const data = custs[rawUser];
            const tag = store[p].tags[user] || 'NORMAL';
            
            let sevenDaysRevenue = 0;
            let hasRecent = false;
            let oldestUnshippedTime = now;
            
            const allItems = [...(data.items || []), ...(data.pastItems || [])];
            allItems.forEach(item => {
                const itemTime = item.createdAt || (item.id ? parseInt(String(item.id).substring(0, 13)) : 0) || 0;
                if (itemTime >= sevenDaysAgo) {
                    sevenDaysRevenue += (item.price || 0);
                    hasRecent = true;
                }
                if (!item.shipped && itemTime > 0 && itemTime < oldestUnshippedTime) {
                    oldestUnshippedTime = itemTime;
                }
            });

            // Đơn đang còn trong giỏ
            const activeItems = data.items || [];
            const activeItemsCount = activeItems.length;
            const activeItemsTotal = data.total || activeItems.reduce((s, it) => s + (it.price || 0), 0);
            const hasActiveOrders = activeItemsCount > 0 || (data.count > 0 && activeItemsTotal > 0);

            // Đơn đang giữ phiên trước chưa giao (unshipped)
            const unshippedPastItems = (data.pastItems || []).filter(it => !it.shipped);
            const holdingCount = unshippedPastItems.length;
            const holdingTotal = unshippedPastItems.reduce((s, it) => s + (it.price || 0), 0);
            const isHolding = holdingCount > 0 || tag === 'HOLD';

            // Cảnh báo nếu có đơn giữ quá 3 ngày (72h)
            const hasOldItems = (now - oldestUnshippedTime > 3 * 24 * 60 * 60 * 1000);

            // Tìm avatar nếu có từ comments
            const userComment = comments.find(c => normalizeUser(c.user) === user && c.avatar);
            const avatar = userComment?.avatar;

            customerList.push({ 
                user, 
                platform: p, 
                data, 
                tag, 
                sevenDaysRevenue, 
                hasRecent, 
                hasOldItems, 
                activeItemsCount,
                activeItemsTotal,
                holdingCount,
                holdingTotal,
                hasActiveOrders,
                isHolding,
                avatar 
            });
        });
    });

    // Thống kê nhanh số lượng phục vụ hiển thị trên nút lọc
    const totalCustomersWithOrders = customerList.filter(c => c.hasActiveOrders).length;
    const totalCustomersHolding = customerList.filter(c => c.isHolding).length;

    // Filter by status (Còn đơn / Đang giữ)
    if (statusFilter === 'has_orders') {
        customerList = customerList.filter(c => c.hasActiveOrders);
    } else if (statusFilter === 'holding') {
        customerList = customerList.filter(c => c.isHolding);
    }

    // Filter by tag
    if (selectedTag !== 'all') {
        customerList = customerList.filter(c => c.tag === selectedTag);
    }

    // Filter by search term (combining local searchTerm or searchKeyword from global header)
    const effectiveSearch = (searchTerm || searchKeyword || '').trim().toLowerCase();
    if (effectiveSearch) {
        customerList = customerList.filter(c => {
            if ((effectiveSearch === '/coc' || effectiveSearch === '/coc50') && c.tag === 'COC') return true;
            if ((effectiveSearch === '/coc' || effectiveSearch === '/coc100') && c.tag === 'COC_100') return true;
            if (effectiveSearch === '/quen' && c.tag === 'VIP') return true;
            if (effectiveSearch === '/vip' && c.tag === 'VIP') return true;
            if (effectiveSearch === '/dao' && c.tag === 'DAO') return true;
            if (effectiveSearch === '/chan' && c.tag === 'CHAN') return true;
            if (effectiveSearch === '/bom' && c.tag === 'BOM') return true;
            if (effectiveSearch === '/giu' && c.isHolding) return true;
            if (effectiveSearch === '/condon' && c.hasActiveOrders) return true;
            if (effectiveSearch === '/top10') return true;
            if (effectiveSearch.startsWith('/')) return false;

            const nick = store[c.platform].nicknames?.[c.user] || '';
            const shortId = getShortId(c.user).toLowerCase();
            return c.user.toLowerCase().includes(effectiveSearch) ||
                   nick.toLowerCase().includes(effectiveSearch) ||
                   shortId.includes(effectiveSearch) ||
                   ('#' + shortId).includes(effectiveSearch);
        });
    }

    // Sắp xếp: tổng 7 ngày cao nhất lên đầu, sau đó đến tổng all time
    customerList.sort((a, b) => {
        if (effectiveSearch === '/top10') {
            return (b.data.lastTime || 0) - (a.data.lastTime || 0);
        }
        if (statusFilter === 'has_orders') {
            return b.activeItemsCount - a.activeItemsCount;
        }
        if (statusFilter === 'holding') {
            return b.holdingCount - a.holdingCount;
        }
        if (b.sevenDaysRevenue !== a.sevenDaysRevenue) return b.sevenDaysRevenue - a.sevenDaysRevenue;
        return (b.data.total || 0) - (a.data.total || 0);
    });

    const totalAllPlatforms = (['tiktok', 'facebook', 'shopee'] as Platform[]).reduce(
        (sum, p) => sum + Object.keys(store[p].customers).length, 0
    );

    // Hàm lấy chữ cái đầu tên viết tắt cho avatar tròn
    const getInitials = (name: string): string => {
        if (!name) return 'KH';
        const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
        const parts = clean.split(/\\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return clean.substring(0, 2).toUpperCase() || 'KH';
    };

    return (
        <div className={isPage ? "h-full w-full flex flex-col bg-[#0b1320]" : "fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-2 sm:p-4"}>
            <div className={\`w-full \${isPage ? "h-full flex flex-col bg-[#0b1320]" : "bg-[#111c2e] rounded-2xl border border-white/10 max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"}\`}>
                
                {/* Modal Header */}
                {!isPage && (
                    <div className="flex justify-between items-center p-3.5 sm:p-4 border-b border-white/10 shrink-0 bg-[#111c2e]">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">👥</span>
                            <h3 className="text-base sm:text-lg font-bold text-gray-100 m-0">
                                DANH SÁCH KHÁCH HÀNG
                            </h3>
                            <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full ml-1 border border-blue-500/30">
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

                {/* Filters & View Mode Bar */}
                <div className="p-3 bg-[#111c2e] border-b border-white/10 shrink-0 space-y-2.5">
                    {/* Platform Tabs & View Mode Switcher Button (matching Image screenshot) */}
                    <div className="flex justify-between items-center gap-2">
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar flex-1">
                            <button
                                onClick={() => setSelectedPlatform('all')}
                                className={\`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer \${
                                    selectedPlatform === 'all' 
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
                                        : 'bg-[#0b1320] border border-white/10 text-gray-400 hover:bg-white/5'
                                }\`}
                            >
                                🌐 Tất cả ({totalAllPlatforms})
                            </button>
                            {(['tiktok', 'facebook', 'shopee'] as Platform[]).map(p => {
                                const custCount = Object.keys(store[p].customers).length;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setSelectedPlatform(p)}
                                        className={\`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 \${
                                            selectedPlatform === p 
                                                ? \`\${PLATFORMS[p].bgClass} text-white shadow-md ring-2 ring-white/20\` 
                                                : 'bg-[#0b1320] border border-white/10 text-gray-400 hover:bg-white/5'
                                        }\`}
                                    >
                                        <span>{PLATFORMS[p].label}</span>
                                        <span>({custCount})</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Nút Toggle Chế độ xem: Icon Dạng Ô / Danh Sách (Góc phải như trong ảnh) */}
                        <button
                            type="button"
                            onClick={toggleViewMode}
                            className={\`p-2 rounded-xl border transition-all shrink-0 cursor-pointer flex items-center justify-center \${
                                viewMode === 'grid'
                                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 shadow-sm'
                                    : 'bg-[#0b1320] border-white/10 text-gray-400 hover:text-white'
                            }\`}
                            title={viewMode === 'grid' ? "Đang ở dạng ô vuông (Bấm để chuyển sang danh sách)" : "Đang ở danh sách (Bấm để chuyển sang dạng ô vuông)"}
                        >
                            {viewMode === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
                        </button>
                    </div>

                    {/* Quick Status & Tag Pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar text-[11px] items-center">
                        {/* Tất cả */}
                        <button
                            onClick={() => { setSelectedTag('all'); setStatusFilter('all'); }}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'all' && statusFilter === 'all'
                                    ? 'bg-white/25 text-white border border-white/40 shadow-sm' 
                                    : 'bg-[#0b1320] text-gray-400 border border-white/10 hover:bg-white/5'
                            }\`}
                        >
                            Tất cả nhãn
                        </button>

                        {/* BỘ LỌC ĐANG CÒN ĐƠN */}
                        <button
                            onClick={() => setStatusFilter(statusFilter === 'has_orders' ? 'all' : 'has_orders')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 \${
                                statusFilter === 'has_orders' 
                                    ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400' 
                                    : 'bg-[#0b1320] text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10'
                            }\`}
                            title="Lọc khách hàng đang có đơn trong giỏ hàng"
                        >
                            <span>🛍️ Còn đơn</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                                {totalCustomersWithOrders}
                            </span>
                        </button>

                        {/* BỘ LỌC ĐANG GIỮ */}
                        <button
                            onClick={() => setStatusFilter(statusFilter === 'holding' ? 'all' : 'holding')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 \${
                                statusFilter === 'holding' 
                                    ? 'bg-amber-600 text-white shadow-md ring-1 ring-amber-400' 
                                    : 'bg-[#0b1320] text-amber-400 border border-amber-500/30 hover:bg-amber-500/10'
                            }\`}
                            title="Lọc khách hàng đang giữ hàng phiên trước chưa giao"
                        >
                            <span>⏳ Đang giữ</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                                {totalCustomersHolding}
                            </span>
                        </button>

                        <div className="w-[1px] h-3.5 bg-white/20 shrink-0 mx-0.5" />

                        {/* Tag Pills */}
                        <button
                            onClick={() => setSelectedTag(selectedTag === 'VIP' ? 'all' : 'VIP')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'VIP' ? 'bg-orange-500 text-white shadow-sm' : 'bg-[#0b1320] text-orange-400 border border-orange-500/20'
                            }\`}
                        >
                            🌟 Quen (VIP)
                        </button>

                        <button
                            onClick={() => setSelectedTag(selectedTag === 'COC' ? 'all' : 'COC')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'COC' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-[#0b1320] text-cyan-400 border border-cyan-500/20'
                            }\`}
                        >
                            💧 Cọc 50k
                        </button>

                        <button
                            onClick={() => setSelectedTag(selectedTag === 'COC_100' ? 'all' : 'COC_100')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'COC_100' ? 'bg-blue-600 text-white shadow-sm' : 'bg-[#0b1320] text-blue-400 border border-blue-500/20'
                            }\`}
                        >
                            💧 Cọc 100k
                        </button>

                        <button
                            onClick={() => setSelectedTag(selectedTag === 'DAO' ? 'all' : 'DAO')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'DAO' ? 'bg-gray-600 text-white shadow-sm' : 'bg-[#0b1320] text-gray-400 border border-white/10'
                            }\`}
                        >
                            👻 Dạo
                        </button>

                        <button
                            onClick={() => setSelectedTag(selectedTag === 'BOM' ? 'all' : 'BOM')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'BOM' ? 'bg-red-600 text-white shadow-sm' : 'bg-[#0b1320] text-red-400 border border-red-500/20'
                            }\`}
                        >
                            ⚠️ BOM
                        </button>

                        <button
                            onClick={() => setSelectedTag(selectedTag === 'CHAN' ? 'all' : 'CHAN')}
                            className={\`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer \${
                                selectedTag === 'CHAN' ? 'bg-black text-white border border-red-500/40' : 'bg-[#0b1320] text-gray-500 border border-white/5'
                            }\`}
                        >
                            ⛔ Chặn
                        </button>
                    </div>

                    {/* In-modal Local Search if in popup mode */}
                    {!isPage && (
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="🔍 Tìm tên, biệt danh, #id hoặc /condon, /giu, /vip, /coc..."
                                className="w-full pl-3 pr-8 py-2 bg-[#0b1320] border border-white/20 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 placeholder-gray-400 font-medium"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 text-gray-400 hover:text-white text-xs font-bold bg-white/10 rounded-full w-6 h-6 flex items-center justify-center cursor-pointer"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Customer List Content */}
                <div 
                    onScroll={handleListScroll}
                    className="overflow-y-auto flex-1 bg-[#0b1320] pb-24"
                >
                    {customerList.length === 0 ? (
                        <div className="text-center text-gray-400 py-16 px-4">
                            <div className="text-3xl mb-2">👥</div>
                            <div className="text-sm font-medium">
                                {effectiveSearch ? \`Không tìm thấy khách hàng nào khớp với "\${effectiveSearch}"\` : 'Chưa có dữ liệu khách hàng phù hợp bộ lọc'}
                            </div>
                        </div>
                    ) : viewMode === 'grid' ? (
                        /* CHẾ ĐỘ XEM DẠNG TỪNG Ô VUÔNG (GRID VIEW) - CHUẨN THEO ẢNH */
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 p-3">
                            {customerList.map((item, idx) => {
                                const cleanUser = normalizeUser(item.user);
                                const nickname = store[item.platform].nicknames?.[cleanUser];
                                const displayName = nickname ? \`\${cleanUser} (\${nickname})\` : cleanUser;
                                const pLink = store[item.platform].pancakeLinks?.[cleanUser];
                                const isVip = item.tag === 'VIP';
                                const initials = getInitials(cleanUser);

                                return (
                                    <div
                                        key={\`cust-square-grid-\${item.platform}-\${cleanUser}-\${idx}\`}
                                        onClick={() => onOpenProfile?.(cleanUser, item.platform)}
                                        className="bg-[#131d2b] hover:bg-[#182436] border border-white/10 hover:border-blue-500/40 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center justify-between text-center relative shadow-lg transition-all cursor-pointer group"
                                    >
                                        {/* Top-Left: Badge #ID */}
                                        <div className="absolute top-2 left-2 z-10">
                                            <span className="text-[10px] font-mono font-bold text-gray-400 bg-black/50 px-1.5 py-0.5 rounded border border-white/10">
                                                #{getShortId(cleanUser)}
                                            </span>
                                        </div>

                                        {/* Center Top: Avatar tròn lớn với VIP Crown */}
                                        <div className="flex flex-col items-center mt-1 mb-1.5 w-full">
                                            <div className="relative mt-1">
                                                {/* Crown VIP Badge nếu là VIP */}
                                                {isVip && (
                                                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-md flex items-center gap-0.5 border border-amber-300 z-10 whitespace-nowrap">
                                                        <span>👑</span>
                                                        <span>VIP</span>
                                                    </div>
                                                )}

                                                {/* Circular Avatar */}
                                                <div className={\`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 \${
                                                    isVip 
                                                        ? 'border-amber-400 shadow-amber-500/20' 
                                                        : item.tag === 'COC' || item.tag === 'COC_100'
                                                        ? 'border-cyan-400 shadow-cyan-500/20'
                                                        : 'border-emerald-400/60 shadow-emerald-500/20'
                                                } overflow-hidden flex items-center justify-center shadow-md bg-gradient-to-br from-teal-700 via-emerald-800 to-slate-900\`}>
                                                    {item.avatar ? (
                                                        <img 
                                                            src={item.avatar} 
                                                            alt={cleanUser} 
                                                            className="w-full h-full object-cover" 
                                                        />
                                                    ) : (
                                                        <span className="text-sm sm:text-base font-black text-white tracking-wider">
                                                            {initials}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Platform Badge dưới Avatar */}
                                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-gray-300 bg-black/40 px-2 py-0.5 rounded-full border border-white/10">
                                                <span>{PLATFORMS[item.platform].label}</span>
                                            </div>

                                            {/* Tên khách hàng & icon Copy */}
                                            <div className="mt-1.5 font-bold text-white text-xs sm:text-sm leading-snug line-clamp-2 px-1 flex items-center justify-center gap-1 max-w-full">
                                                <span className="truncate group-hover:text-blue-400 transition-colors">
                                                    {displayName}
                                                </span>
                                                <CopyButton 
                                                    text={displayName} 
                                                    className="text-[11px] text-gray-500 hover:text-white shrink-0" 
                                                />
                                            </div>

                                            {/* Badges: Giữ > 3 ngày / Đang giữ / Còn đơn */}
                                            {item.hasOldItems ? (
                                                <div className="mt-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-xs">
                                                    <span>⏰</span>
                                                    <span>Giữ &gt; 3 ngày</span>
                                                </div>
                                            ) : item.isHolding ? (
                                                <div className="mt-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-xs">
                                                    <span>⏳</span>
                                                    <span>Đang giữ {item.holdingCount} món</span>
                                                </div>
                                            ) : item.hasActiveOrders ? (
                                                <div className="mt-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-xs">
                                                    <span>🛍️</span>
                                                    <span>Còn {item.activeItemsCount} món</span>
                                                </div>
                                            ) : null}

                                            {/* Thống kê chốt đơn & 7 ngày */}
                                            <div className="text-[11px] text-gray-400 mt-1.5 space-y-0.5">
                                                <div>
                                                    Đã chốt: <span className="text-blue-400 font-bold">{item.data.count} cái</span> - <span className="text-blue-400 font-bold">{item.data.total}k</span>
                                                </div>
                                                <div className="text-[10px] text-gray-500">
                                                    · 7 ngày: <span className="text-gray-300 font-medium">{item.sevenDaysRevenue}k</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bottom Actions: Nút Pancake 🥞 và Nút + Mới */}
                                        <div className="w-full pt-2 border-t border-white/10 flex items-center gap-1.5 justify-between">
                                            {/* Pancake Action Button */}
                                            {pLink ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openPancakeApp(pLink, true);
                                                    }}
                                                    className="w-9 h-8 rounded-xl bg-[#261c14] hover:bg-[#3d2717] border border-amber-600/40 text-amber-400 flex items-center justify-center text-sm font-bold transition-all cursor-pointer shadow-sm relative active:scale-95 shrink-0"
                                                    title="Mở chat Pancake"
                                                >
                                                    <span>🥞</span>
                                                    <span className="absolute -top-1 -right-1 text-[8px] bg-amber-500 text-black rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                                                        ✏️
                                                    </span>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenPancakeLink?.(cleanUser, item.platform);
                                                    }}
                                                    className="w-9 h-8 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 flex items-center justify-center text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                                                    title="Gán Zalo / Pancake"
                                                >
                                                    <span>🥞+</span>
                                                </button>
                                            )}

                                            {/* + Mới Action Button (Green pill matching screenshot) */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenNewOrder?.(item.user, item.platform);
                                                }}
                                                className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 shadow-sm"
                                                title="Tạo đơn chốt mới cho khách này"
                                            >
                                                <PlusCircle size={13} />
                                                <span>Mới</span>
                                            </button>
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
                                const displayName = nickname ? \`\${cleanUser} (\${nickname})\` : cleanUser;
                                const pLink = store[item.platform].pancakeLinks?.[cleanUser];

                                return (
                                    <div 
                                        key={\`cust-\${item.platform}-\${cleanUser}-\${idx}\`}
                                        className="px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between gap-3"
                                    >
                                        {/* Left: Customer Avatar + Details */}
                                        <div className="flex items-center gap-3 flex-1 min-w-0 pr-1">
                                            <CustomerAvatar 
                                                user={cleanUser} 
                                                platform={item.platform} 
                                                avatarUrl={item.avatar}
                                                tag={item.tag}
                                                size="md"
                                                onClick={() => onOpenProfile?.(cleanUser, item.platform)}
                                            />
                                            <div 
                                                onClick={() => onOpenProfile?.(cleanUser, item.platform)}
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

                                                    {/* HIỂN THỊ CÒN ĐƠN */}
                                                    {item.hasActiveOrders && (
                                                        <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                                                            🛍️ Còn đơn ({item.activeItemsCount} món · {item.activeItemsTotal}k)
                                                        </span>
                                                    )}

                                                    {/* HIỂN THỊ ĐANG GIỮ */}
                                                    {item.isHolding && (
                                                        <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-xs">
                                                            ⏳ Đang giữ {item.holdingCount} món ({item.holdingTotal}k)
                                                        </span>
                                                    )}

                                                    {/* Old items warning */}
                                                    {item.hasOldItems && (
                                                        <span className="bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                                            ⏰ Giữ &gt; 3 ngày
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Subtitle Line: Đã chốt: 0 cái - 0k */}
                                                <div className="text-[12px] text-gray-400 mt-1 flex items-center flex-wrap">
                                                    <span>Đã chốt:</span>
                                                    <span className="font-bold text-blue-400 ml-1.5">
                                                        {item.data.count} cái <span className="text-gray-500 font-normal mx-0.5">-</span> {item.data.total}k
                                                    </span>
                                                    {item.sevenDaysRevenue > 0 && (
                                                        <span className="text-gray-400 ml-2 font-medium">
                                                            <span className="text-gray-600 mr-1.5">·</span>7 ngày: <span className="text-gray-300 font-semibold">{item.sevenDaysRevenue}k</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Pancake / Zalo App Button */}
                                            {pLink ? (
                                                <div className="relative flex items-center shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openPancakeApp(pLink, true);
                                                        }}
                                                        className="bg-orange-950/60 hover:bg-orange-900/60 active:scale-95 text-orange-400 border border-orange-500/30 rounded-xl px-2.5 py-1.5 text-xs font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                                        title="Mở thẳng hội thoại trên App Pancake trên điện thoại"
                                                    >
                                                        <span>🥞</span>
                                                        <span className="hidden sm:inline">Pancake</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenPancakeLink?.(cleanUser, item.platform);
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
                                                        onOpenPancakeLink?.(cleanUser, item.platform);
                                                    }}
                                                    className="bg-amber-500/20 hover:bg-amber-500/35 active:scale-95 text-amber-300 border border-amber-500/40 rounded-xl px-2.5 py-1.5 text-xs font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                                    title="Gán Zalo / Pancake cho khách này"
                                                >
                                                    <span>🥞+</span>
                                                    <span className="hidden sm:inline">Gán</span>
                                                </button>
                                            )}

                                            {/* + Mới action button */}
                                            <button
                                                onClick={() => onOpenNewOrder?.(item.user, item.platform)}
                                                className="bg-emerald-950/60 hover:bg-emerald-900/60 active:scale-95 text-emerald-400 border border-emerald-500/30 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                                title="Tạo đơn chốt mới"
                                            >
                                                <PlusCircle size={15} /> Mới
                                            </button>
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
}`;

fs.writeFileSync('src/components/Modals.tsx', beforeCustModal + newCustomersModal);
console.log("Square Grid View applied to CustomersModal successfully!");
