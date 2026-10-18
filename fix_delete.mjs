import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');
code = code.replace('newCusts[user] = { ...cust, count: newCount, total: newTotal, items: newItems };', 'newCusts[user] = { ...cust, count: newCount, total: newTotal, items: newItems, lastTime: Date.now() };');
fs.writeFileSync('src/store.ts', code);
