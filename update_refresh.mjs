import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');

code = code.replace(
    'repostComment: (platform: Platform, content: string) => Promise<boolean>;',
    'repostComment: (platform: Platform, content: string) => Promise<boolean>;\n  refreshPlatform: (platform: Platform) => Promise<boolean>;'
);

code = code.replace(
    'await fbPut(`rooms/${room}/replyCommand`, { content: content, commandId: commandId, updatedAt: Date.now() });',
    'await fbPut(`rooms/${room}/replyCommand`, { content: content, commandId: commandId, updatedAt: Date.now(), slowMode: true, typingDelay: 100 });'
);

const refreshImpl = `
        refreshPlatform: async (platform) => {
            const room = PLATFORMS[platform].room;
            const commandId = DEVICE_ID + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            try {
                await fbPut(\`rooms/\${room}/refreshCommand\`, { commandId: commandId, updatedAt: Date.now() });
                return true;
            } catch (e) {
                console.error("Gửi lệnh làm mới thất bại", e);
                return false;
            }
        },
`;

code = code.replace(
    'unpinComment: (platform, commentId) => {',
    refreshImpl + '\n        unpinComment: (platform, commentId) => {'
);

fs.writeFileSync('src/store.ts', code);
