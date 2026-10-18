import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');
code = code.replace('newCusts[user] = { ...cust, pastItems: newPast };', 'newCusts[user] = { ...cust, pastItems: newPast, lastTime: Date.now() };');
fs.writeFileSync('src/store.ts', code);
