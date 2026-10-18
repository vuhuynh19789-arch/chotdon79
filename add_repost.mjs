import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');

const target1 = `  togglePin: (platform: Platform, commentId: string, user: string) => void;`;
const replacement1 = `  togglePin: (platform: Platform, commentId: string, user: string) => void;
  repostComment: (platform: Platform, content: string) => Promise<boolean>;`;

const target2 = `        unpinComment: (platform, commentId) => {`;
const replacement2 = `        repostComment: async (platform, content) => {
            if (!content) return false;
            const room = PLATFORMS[platform].room;
            const commandId = DEVICE_ID + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            try {
                await fbPut(\`rooms/\${room}/replyCommand\`, { content: content, commandId: commandId, updatedAt: Date.now() });
                return true;
            } catch (e) {
                console.error("Gửi lệnh đăng lại thất bại", e);
                return false;
            }
        },

        unpinComment: (platform, commentId) => {`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);

fs.writeFileSync('src/store.ts', code);
