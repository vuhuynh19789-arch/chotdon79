import fs from 'fs';
let code = fs.readFileSync('src/components/Feed.tsx', 'utf8');

const target1 = `    const [busyPrints, setBusyPrints] = useState<Record<string, boolean>>({});`;
const replacement1 = `    const [busyPrints, setBusyPrints] = useState<Record<string, boolean>>({});
    const [reposting, setReposting] = useState<Record<string, boolean>>({});`;

const target2 = `    const handlePrint = (c: any) => {`;
const replacement2 = `    const handleRepost = async (c: any) => {
        if (reposting[c.id]) return;
        setReposting(prev => ({ ...prev, [c.id]: true }));
        const success = await store.repostComment(c.platform, c.content);
        if (!success) {
            alert("Gửi lệnh đăng lại thất bại, kiểm tra kết nối mạng.");
        }
        setTimeout(() => {
            setReposting(prev => ({ ...prev, [c.id]: false }));
        }, 1500);
    };

    const handlePrint = (c: any) => {`;

const target3 = `                                <button 
                                    onClick={() => store.togglePin(c.platform, c.id, c.user)}
                                    className={\`w-14 h-6 rounded-md text-[13px] \${isPinned ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}\`}>
                                    {isPinned ? '📌 Bỏ' : '📌 Ghim'}
                                </button>
                                <button 
                                    disabled={busyPrints[c.id]}
                                    onClick={() => handlePrint(c)}
                                    className={\`w-14 h-7 rounded-md text-[13px] font-bold text-white flex items-center justify-center gap-1 \${busyPrints[c.id] ? 'bg-gray-400' : count > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}\`}>
                                    {count === 0 ? 'IN' : \`(\${count})\`}
                                </button>`;
const replacement3 = `                                <button 
                                    onClick={() => store.togglePin(c.platform, c.id, c.user)}
                                    className={\`w-14 h-6 rounded-md text-[13px] \${isPinned ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}\`}>
                                    {isPinned ? '📌 Bỏ' : '📌 Ghim'}
                                </button>
                                {c.platform === 'tiktok' && (
                                    <button 
                                        disabled={reposting[c.id]}
                                        onClick={() => handleRepost(c)}
                                        title="Đăng lại cmt này lên live TikTok"
                                        className={\`w-14 h-6 rounded-md text-[12px] flex items-center justify-center border \${reposting[c.id] ? 'bg-green-500 text-white border-green-500' : 'bg-[#e0f2ff] text-[#0056b3] border-[#0056b3]'}\`}>
                                        {reposting[c.id] ? '✅' : '📢 Đăng'}
                                    </button>
                                )}
                                <button 
                                    disabled={busyPrints[c.id]}
                                    onClick={() => handlePrint(c)}
                                    className={\`w-14 h-7 rounded-md text-[13px] font-bold text-white flex items-center justify-center gap-1 \${busyPrints[c.id] ? 'bg-gray-400' : count > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}\`}>
                                    {count === 0 ? 'IN' : \`(\${count})\`}
                                </button>`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
code = code.replace(target3, replacement3);

fs.writeFileSync('src/components/Feed.tsx', code);
