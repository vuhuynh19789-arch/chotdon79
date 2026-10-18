import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');

code = code.replace(
  'deleteOrderItem: (platform, user, itemIndex, isPast = false) => {',
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
        deleteOrderItem: (platform, user, itemIndex, isPast = false) => {`
);

fs.writeFileSync('src/store.ts', code);
