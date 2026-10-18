const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf8');

const target = `            try {
                let remote = await fbGet(\`rooms/\${room}/tags\`);`;

const replacement = `            try {
                let remote = await fbGet(\`rooms/\${room}/nicknames\`);
                if (Date.now() - (localLocks[\`\${platform}_nicknames\`] || 0) > 3000) {
                    if (remote && remote.deviceId !== DEVICE_ID + '_' + platform && remote.updatedAt !== state.lastNicknamesAt) {
                        set(s => ({ [platform]: { ...s[platform], lastNicknamesAt: remote.updatedAt, nicknames: remote.data || {} } }));
                        localStorage.setItem(\`slp_webapp_nicknames_\${platform}\`, JSON.stringify(remote.data || {}));
                    } else if (remote && remote.updatedAt) {
                        set(s => ({ [platform]: { ...s[platform], lastNicknamesAt: Math.max(state.lastNicknamesAt, remote.updatedAt) } }));
                    }
                }
            } catch (e) {}

            try {
                let remote = await fbGet(\`rooms/\${room}/tags\`);`;

code = code.replace(target, replacement);
fs.writeFileSync('src/store.ts', code);
