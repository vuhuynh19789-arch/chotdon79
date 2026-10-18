import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

if (!code.includes('AutoCommentModal')) {
    code = code.replace(
        "import { MinigameModal } from './components/Minigame';",
        "import { MinigameModal } from './components/Minigame';\nimport { AutoCommentModal, useAutoComment } from './components/AutoComment';"
    );
}

if (!code.includes("'autocomment'")) {
    code = code.replace(
        "| 'minigame' | null>(null);",
        "| 'minigame' | 'autocomment' | null>(null);"
    );
}

if (!code.includes('const autoComment = useAutoComment();')) {
    code = code.replace(
        "const [profileUser, setProfileUser] = useState<{user: string, platform: Platform} | null>(null);",
        "const [profileUser, setProfileUser] = useState<{user: string, platform: Platform} | null>(null);\n  const autoComment = useAutoComment();"
    );
}

if (!code.includes("onClick={() => setActiveModal('autocomment')}")) {
    const search = `            <button 
                onClick={() => setActiveModal('minigame')}
                className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm"
                title="Minigame"
            >
                🎮
            </button>`;
            
    const replace = `            <button 
                onClick={() => setActiveModal('autocomment')}
                className={\`px-3 py-2.5 \${autoComment.config.isRunning ? 'bg-red-500 animate-pulse text-white' : 'bg-green-600 hover:bg-green-700 text-white'} rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm\`}
                title="Tự động bình luận"
            >
                🤖
            </button>
            <button 
                onClick={() => setActiveModal('minigame')}
                className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm"
                title="Minigame"
            >
                🎮
            </button>`;
            
    code = code.replace(search, replace);
}

if (!code.includes('<AutoCommentModal')) {
    const searchModal = `{activeModal === 'minigame' && (
            <MinigameModal onClose={() => setActiveModal(null)} />
        )}`;
        
    const replaceModal = `{activeModal === 'minigame' && (
            <MinigameModal onClose={() => setActiveModal(null)} />
        )}
        {activeModal === 'autocomment' && (
            <AutoCommentModal 
                config={autoComment.config} 
                saveConfig={autoComment.saveConfig} 
                onClose={() => setActiveModal(null)} 
            />
        )}`;
        
    code = code.replace(searchModal, replaceModal);
}

fs.writeFileSync('src/App.tsx', code);
