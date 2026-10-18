import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');

// 1. Update OrderItem interface
code = code.replace(
  'sourceCommentId: string | null;',
  'sourceCommentId: string | null;\n  createdAt?: number;\n  shipped?: boolean;'
);

// 2. Add togglePastItemShipped to AppState
code = code.replace(
  'deleteOrderItem: (platform: Platform, user: string, itemIndex: number, isPast?: boolean) => void;',
  'deleteOrderItem: (platform: Platform, user: string, itemIndex: number, isPast?: boolean) => void;\n  togglePastItemShipped: (platform: Platform, user: string, itemIndex: number) => void;'
);

// 3. Update recordOrder to set createdAt
code = code.replace(
  /items: \[...\(cust\.items \|\| \[\]\), \{([\s\S]*?)sourceCommentId\s*\}\]/,
  'items: [...(cust.items || []), { $1sourceCommentId, createdAt: Date.now(), shipped: false }]'
);

// 4. Implement togglePastItemShipped
code = code.replace(
  'deleteOrderItem: (platform, user, itemIndex, isPast) => {',
  `togglePastItemShipped: (platform, user, itemIndex) => {
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.pastItems || !cust.pastItems[itemIndex]) return;
            const newCusts = { ...state.customers };
            const newPastItems = [...cust.pastItems];
            newPastItems[itemIndex] = { ...newPastItems[itemIndex], shipped: !newPastItems[itemIndex].shipped };
            newCusts[user] = { ...cust, pastItems: newPastItems, lastTime: Date.now() };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(\`slp_webapp_session_\${platform}\`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        deleteOrderItem: (platform, user, itemIndex, isPast) => {`
);

// 5. Update resetSession to clean up 7 days
code = code.replace(
  'pastItems: [...existingPastItems, ...currentItems]',
  `pastItems: [...existingPastItems, ...currentItems].filter(item => {
                            const t = item.createdAt || parseInt(item.id.substring(0,13)) || now;
                            return (now - t) <= 7 * 24 * 60 * 60 * 1000;
                        })`
);

// 6. Also clean up 7 days when loading from mergeCustomers (in subscribePlatformData) to keep it clean.
code = code.replace(
  /if \(\!merged\[user\] \|\| custData\.lastTime > merged\[user\]\.lastTime\) \{([\s\S]*?)merged\[user\] = \{ \.\.\.custData \};([\s\S]*?)\}/,
  `if (!merged[user] || custData.lastTime > merged[user].lastTime) {
                            const cd = { ...custData };
                            if (cd.pastItems) {
                                const now = Date.now();
                                cd.pastItems = cd.pastItems.filter(item => {
                                    const t = item.createdAt || parseInt(item.id.substring(0,13)) || now;
                                    return (now - t) <= 7 * 24 * 60 * 60 * 1000;
                                });
                            }
                            merged[user] = cd;
                        }`
);


fs.writeFileSync('src/store.ts', code);
