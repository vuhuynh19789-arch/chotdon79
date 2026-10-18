const fs = require('fs');
let code = fs.readFileSync('src/components/Feed.tsx', 'utf8');

const target = `<div className="flex flex-col gap-1.5 shrink-0">`;
const endTarget = `</motion.div>`;

const parts = code.split(target);
if (parts.length > 1) {
    const after = parts[1];
    const afterParts = after.split(endTarget);
    if (afterParts.length > 1) {
        const replacement = `
                                <button 
                                    onClick={() => store.togglePin(c.platform, c.id, c.user)}
                                    className={\`w-14 h-6 rounded-md text-[13px] \${isPinned ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}\`}>
                                    {isPinned ? 'Bỏ' : 'Ghim'}
                                </button>
                                <button 
                                    disabled={busyPrints[c.id]}
                                    onClick={() => handlePrint(c)}
                                    className={\`w-14 h-7 rounded-md text-[13px] font-bold text-white flex items-center justify-center gap-1 \${busyPrints[c.id] ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}\`}>
                                    {count === 0 ? 'IN' : \`(\${count})\`}
                                </button>
                            </div>
                        `;
        const newCode = parts[0] + target + replacement + afterParts.slice(1).join(endTarget);
        fs.writeFileSync('src/components/Feed.tsx', newCode);
    }
}
