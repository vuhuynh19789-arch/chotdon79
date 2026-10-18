const fs = require("fs");

let storeCode = fs.readFileSync("src/store.ts", "utf8");

// 1. Add to AppState interface
if (!storeCode.includes("clearShippedPastItems:")) {
  storeCode = storeCode.replace(
    "archiveCustomerItems: (platform: Platform, user: string) => void;",
    "archiveCustomerItems: (platform: Platform, user: string) => void;\n  clearShippedPastItems: (platform: Platform, user: string) => void;"
  );
}

// 2. Add implementation
if (!storeCode.includes("clearShippedPastItems: (platform, rawUser) => {")) {
  const impl = `        clearShippedPastItems: (platform, rawUser) => {
            const user = normalizeUser(rawUser);
            if (!user) return;
            const state = get()[platform];
            const cust = state.customers[user];
            if (!cust) return;
            const newCusts = { ...state.customers };
            const now = Date.now();
            newCusts[user] = {
                ...cust,
                pastItems: []
            };
            set(s => ({ [platform]: { ...s[platform], customers: newCusts, lastCustomersAt: now } }));
            localStorage.setItem(\`slp_webapp_session_\${platform}\`, JSON.stringify(newCusts));
            pushData(platform, 'customers', newCusts, now);
        },`;

  storeCode = storeCode.replace(
    "archiveCustomerItems: (platform, rawUser) => {",
    impl + "\n        archiveCustomerItems: (platform, rawUser) => {"
  );
}

fs.writeFileSync("src/store.ts", storeCode);
console.log("Updated src/store.ts successfully!");
