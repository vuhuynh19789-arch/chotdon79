const fs = require("fs");

let storeCode = fs.readFileSync("src/store.ts", "utf8");

// 1. Add to AppState interface
if (!storeCode.includes("toggleCurrentItemShipped:")) {
  storeCode = storeCode.replace(
    "togglePastItemShipped: (platform: Platform, user: string, itemIndex: number) => void;",
    "toggleCurrentItemShipped: (platform: Platform, user: string, itemIndex: number) => void;\n  togglePastItemShipped: (platform: Platform, user: string, itemIndex: number) => void;\n  markAllCustomerItemsShipped: (platform: Platform, user: string) => void;"
  );
}

// 2. Add implementation
if (!storeCode.includes("toggleCurrentItemShipped: (platform, rawUser, itemIndex) => {")) {
  const impl = `        toggleCurrentItemShipped: (platform, rawUser, itemIndex) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust || !cust.items || !cust.items[itemIndex]) return;
            const newCusts = { ...state.customers };
            const newItems = [...cust.items];
            const isShipped = !newItems[itemIndex].shipped;
            newItems[itemIndex] = { ...newItems[itemIndex], shipped: isShipped };
            
            // Recalculate unshipped count & total if desired
            newCusts[user] = {
                ...cust,
                items: newItems,
                lastTime: Date.now()
            };
            const now = Date.now();
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(\`slp_webapp_session_\${platform}\`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },
        markAllCustomerItemsShipped: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust) return;
            const newCusts = { ...state.customers };
            const now = Date.now();
            const currentItems = (cust.items || []).map(it => ({ ...it, shipped: true, createdAt: it.createdAt || now }));
            const existingPast = (cust.pastItems || []).map(it => ({ ...it, shipped: true }));
            
            // Move all to pastItems as shipped and clear current items
            newCusts[user] = {
                ...cust,
                count: 0,
                total: 0,
                lastTime: now,
                items: [],
                pastItems: [...existingPast, ...currentItems]
            };
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(\`slp_webapp_session_\${platform}\`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },`;

  storeCode = storeCode.replace(
    "togglePastItemShipped: (platform, rawUser, itemIndex) => {",
    impl + "\n        togglePastItemShipped: (platform, rawUser, itemIndex) => {"
  );
}

fs.writeFileSync("src/store.ts", storeCode);
console.log("Updated store.ts with toggleCurrentItemShipped & markAllCustomerItemsShipped!");
