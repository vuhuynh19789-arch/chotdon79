import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');
code = code.replace('lastTime: cust.lastTime || now,', 'lastTime: now,');
fs.writeFileSync('src/store.ts', code);
