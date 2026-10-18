import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const t1 = `  const [isFullscreen, setIsFullscreen] = useState(false);`;
const r1 = `  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hostMode, setHostMode] = useState(false);`;

const t2 = `            <button 
                onClick={() => setActiveModal('minigame')}
                className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center gap-1 shadow-sm"
            >
                🎮 Minigame
            </button>`;
const r2 = `            <button 
                onClick={() => setHostMode(!hostMode)}
                className={\`px-3 py-2.5 rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center gap-1 shadow-sm transition-colors \${hostMode ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}\`}
                title="Lọc chỉ hiện Host"
            >
                👑 Host {hostMode && 'ON'}
            </button>
            <button 
                onClick={() => setActiveModal('minigame')}
                className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm"
                title="Minigame"
            >
                🎮
            </button>`;

const t3 = `        <Feed 
            search={search} 
            isSearchFocused={isSearchFocused}
            onOpenProfile={(u, p) => { setProfileUser({user: u, platform: p}); setActiveModal('profile'); }}
            onOpenPrice={(id, u, p) => { setPendingPrint({id, user: u, platform: p}); setActiveModal('price'); }}
        />`;
const r3 = `        <Feed 
            search={search} 
            isSearchFocused={isSearchFocused}
            hostMode={hostMode}
            onOpenProfile={(u, p) => { setProfileUser({user: u, platform: p}); setActiveModal('profile'); }}
            onOpenPrice={(id, u, p) => { setPendingPrint({id, user: u, platform: p}); setActiveModal('price'); }}
        />`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);
code = code.replace(t3, r3);
fs.writeFileSync('src/App.tsx', code);
