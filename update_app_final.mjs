import fs from 'fs';

// Update AutoComment.tsx
let autoCommentCode = fs.readFileSync('src/components/AutoComment.tsx', 'utf8');

const oldButton = `                    <button 
                        onClick={() => saveConfig({ isRunning: !config.isRunning })}
                        className={\`flex-1 py-2.5 rounded-lg font-bold text-white text-[15px] \${config.isRunning ? 'bg-red-500' : 'bg-green-600'}\`}
                    >
                        {config.isRunning ? '🛑 DỪNG LẠI' : '▶️ BẮT ĐẦU ĐĂNG'}
                    </button>`;

const newButton = `                    <button 
                        onClick={() => {
                            if (!config.isRunning) {
                                const lines = config.comments.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
                                if (lines.length === 0) {
                                    alert("Vui lòng nhập ít nhất 1 dòng bình luận!");
                                    return;
                                }
                                saveConfig({ isRunning: true });
                                onClose();
                            } else {
                                saveConfig({ isRunning: false });
                            }
                        }}
                        className={\`flex-1 py-2.5 rounded-lg font-bold text-white text-[15px] \${config.isRunning ? 'bg-red-500' : 'bg-green-600'}\`}
                    >
                        {config.isRunning ? '🛑 DỪNG LẠI' : '▶️ BẮT ĐẦU ĐĂNG'}
                    </button>`;

autoCommentCode = autoCommentCode.replace(oldButton, newButton);
fs.writeFileSync('src/components/AutoComment.tsx', autoCommentCode);

// Update App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf8');

const styleBlock = `
            <style>{\`
                @keyframes pulse-red-green {
                    0% { background-color: #ef4444; }
                    50% { background-color: #22c55e; }
                    100% { background-color: #ef4444; }
                }
                .animate-red-green {
                    animation: pulse-red-green 1.5s infinite;
                }
            \`}</style>
`;

if (!appCode.includes('pulse-red-green')) {
    appCode = appCode.replace('<div className="flex gap-2 p-2.5 bg-white', styleBlock + '        <div className="flex gap-2 p-2.5 bg-white');
}

const hostIconRegex = /<button[\s\S]*?onClick=\{\(\) => setHostMode\(!hostMode\)\}[\s\S]*?<\/button>/;
appCode = appCode.replace(hostIconRegex, '');

const robotIconRegex = /<button\s+onClick=\{\(\) => setActiveModal\('autocomment'\)\}[\s\S]*?<\/button>/;
const newRobotIcon = `<button 
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

appCode = appCode.replace(robotIconRegex, newRobotIcon);

fs.writeFileSync('src/App.tsx', appCode);
