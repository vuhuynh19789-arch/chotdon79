import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');
code = code.replace(
`            }, (error) => {
                get().setSyncStatus("🔴 Lỗi Realtime", "#dc3545");
            });`,
`            }, (error) => {
                console.error("Firebase Realtime Error:", error);
                get().setSyncStatus("🔴 Bị chặn quyền (Hết hạn Rule)", "#dc3545");
            });`
);
fs.writeFileSync('src/store.ts', code);
