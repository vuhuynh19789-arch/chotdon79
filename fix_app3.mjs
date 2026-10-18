import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const badCode = `        const topVIPs = useMemo(() => {
      let all = [];
      (['tiktok', 'facebook', 'shopee']).forEach(p => {
          Object.entries(store[p].customers).forEach(([user, data]) => {
              if (data.total > 0) {
                  all.push({ user, platform: p, data });
              }
          });
      });
      return all.sort((a,b) => b.data.total - a.data.total).slice(0, 10);
  }, [store.tiktok.customers, store.facebook.customers, store.shopee.customers]);

  return () => cancelAnimationFrame(rAF);`;

code = code.replace(badCode, `        return () => cancelAnimationFrame(rAF);`);

const goodCodeTarget = `  const quickResults = useMemo(() => {`;

const goodCodeReplace = `  const topVIPs = useMemo(() => {
      let all: any[] = [];
      (['tiktok', 'facebook', 'shopee'] as Platform[]).forEach(p => {
          Object.entries(store[p].customers).forEach(([user, data]: [string, any]) => {
              if (data.total > 0) {
                  all.push({ user, platform: p, data });
              }
          });
      });
      return all.sort((a,b) => b.data.total - a.data.total).slice(0, 10);
  }, [store.tiktok.customers, store.facebook.customers, store.shopee.customers]);

  const quickResults = useMemo(() => {`;

code = code.replace(goodCodeTarget, goodCodeReplace);

fs.writeFileSync('src/App.tsx', code);
