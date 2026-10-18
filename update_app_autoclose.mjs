import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

if (!code.includes('AutoCloseModal')) {
    const importAutoComment = "import { AutoCommentModal, useAutoComment } from './components/AutoComment';";
    code = code.replace(importAutoComment, importAutoComment + "\nimport { AutoCloseModal, useAutoClose } from './components/AutoClose';");
    
    // Add activeModal 'autoclose'
    // type ActiveModal = 'price' | 'manual' | 'list' | 'profile' | 'customers' | 'quickedit' | 'minigame' | 'autocomment' | null;
    code = code.replace(/type ActiveModal = (.*?);/, "type ActiveModal = $1 | 'autoclose';");
    
    // Call useAutoClose
    const autoCommentHook = "const autoComment = useAutoComment();";
    code = code.replace(autoCommentHook, autoCommentHook + "\n    const autoClose = useAutoClose();");
    
    // Add button next to autocomment button
    const autoCommentButton = `<button 
                onClick={() => {
                    if (autoComment.config.isRunning) {
                        autoComment.saveConfig({ isRunning: false });
                    } else {
                        setActiveModal('autocomment');
                    }
                }}
                className={\`px-3 py-2.5 \${autoComment.config.isRunning ? 'animate-red-green text-white' : 'bg-green-600 hover:bg-green-700 text-white'} rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm\`}
                title={autoComment.config.isRunning ? "Đang chạy. Bấm để dừng" : "Tự động bình luận"}
            >
                🤖
            </button>`;

    const autoCloseButton = `<button 
                onClick={() => {
                    if (autoClose.config.isRunning) {
                        autoClose.saveConfig({ isRunning: false });
                    } else {
                        setActiveModal('autoclose');
                    }
                }}
                className={\`px-3 py-2.5 \${autoClose.config.isRunning ? 'animate-red-green text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm\`}
                title={autoClose.config.isRunning ? "Auto Chốt đang chạy. Bấm để dừng" : "Tự động chốt"}
            >
                ⚡
            </button>`;

    code = code.replace(autoCommentButton, autoCloseButton + "\n            " + autoCommentButton);
    
    // Render AutoCloseModal
    const autoCommentModalRender = `{activeModal === 'autocomment' && (
                <AutoCommentModal 
                    config={autoComment.config}
                    saveConfig={autoComment.saveConfig}
                    onClose={() => setActiveModal(null)}
                />
            )}`;
            
    const autoCloseModalRender = `{activeModal === 'autoclose' && (
                <AutoCloseModal 
                    config={autoClose.config}
                    saveConfig={autoClose.saveConfig}
                    onClose={() => setActiveModal(null)}
                />
            )}`;
            
    code = code.replace(autoCommentModalRender, autoCloseModalRender + "\n            " + autoCommentModalRender);
    
    fs.writeFileSync('src/App.tsx', code);
    console.log("Updated App.tsx successfully");
} else {
    console.log("App.tsx already has AutoClose");
}
