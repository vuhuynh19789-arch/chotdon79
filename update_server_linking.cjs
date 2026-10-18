const fs = require("fs");

let serverCode = fs.readFileSync("server.ts", "utf8");

const oldTarget = `    // Invalidate cached POS orders để lần quét kế tiếp có ngay đơn mới
    cachedPosOrders = null;

    const createdOrder = createData.data || createData;
    const orderCode = createdOrder.display_id || createdOrder.id;
    console.log(\`=> ✅ [Tạo đơn Pancake POS thành công] Mã đơn: #\${orderCode}\`);`;

const newTarget = `    // Invalidate cached POS orders để lần quét kế tiếp có ngay đơn mới
    cachedPosOrders = null;

    const createdOrder = createData.data || createData;
    const orderCode = createdOrder.display_id || createdOrder.id;
    console.log(\`=> ✅ [Tạo đơn Pancake POS thành công] Mã đơn: #\${orderCode}\`);

    // 🔗 BƯỚC LIÊN KẾT ĐƠN HÀNG VÀO HỘI THOẠI PANCAKE PAGES (pages.fm & pos.pages.fm)
    if (finalPageId && finalConvId && createdOrder?.id) {
      const orderId = createdOrder.id;
      try {
        console.log(\`=> 🔗 [Đang liên kết đơn #\${orderCode} vào hội thoại \${finalConvId} trên Page \${finalPageId}]...\`);
        await Promise.allSettled([
          // 1. Gắn order vào conversation trên Pages API (pages.fm)
          fetch(\`https://pages.fm/api/v1/pages/\${finalPageId}/conversations/\${finalConvId}/orders\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, id: orderId, access_token: token }),
            signal: AbortSignal.timeout(3000)
          }),
          // 2. Link order endpoint trên Pages API
          fetch(\`https://pages.fm/api/v1/pages/\${finalPageId}/orders/link\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, conversation_id: finalConvId, access_token: token }),
            signal: AbortSignal.timeout(3000)
          }),
          // 3. Link conversation trên POS API (pos.pages.fm)
          fetch(\`https://pos.pages.fm/api/v1/shops/\${shopId}/orders/\${orderId}/link_conversation\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page_id: finalPageId, conversation_id: finalConvId, access_token: token }),
            signal: AbortSignal.timeout(3000)
          }),
          // 4. Update order conversation_id trên POS
          fetch(\`https://pos.pages.fm/api/v1/shops/\${shopId}/orders/\${orderId}?access_token=\${token}\`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page_id: finalPageId, conversation_id: finalConvId }),
            signal: AbortSignal.timeout(3000)
          })
        ]);
        console.log(\`=> ✅ [Đã liên kết đơn hàng #\${orderCode} vào hội thoại thành công!]\`);
      } catch (linkErr: any) {
        console.warn("Lỗi khi gọi API liên kết đơn vào hội thoại:", linkErr?.message);
      }
    }`;

if (serverCode.includes(oldTarget)) {
  serverCode = serverCode.replace(oldTarget, newTarget);
  fs.writeFileSync("server.ts", serverCode);
  console.log("Updated server.ts with full order-to-conversation linking!");
} else {
  console.error("Could not find target in server.ts!");
}
