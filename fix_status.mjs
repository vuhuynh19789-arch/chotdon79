import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');
code = code.replace(
`            onValue(roomRef, (snapshot) => {
                const data = snapshot.val();
                if (!data) return;
                
                get().setSyncStatus("🟢 Đã kết nối (Realtime)", "#28a745");`,
`            onValue(roomRef, (snapshot) => {
                get().setSyncStatus("🟢 Đã kết nối (Realtime)", "#28a745");
                const data = snapshot.val();
                if (!data) return;`
);
fs.writeFileSync('src/store.ts', code);
