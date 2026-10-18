const fs = require("fs");

let syncCode = fs.readFileSync("src/lib/pancakeSync.ts", "utf8");

// Helper replacement for checkCustomerPancakeShippedStatus and related parsing
const newHelperSection = `
/**
 * Phân tích chuỗi ngày giờ từ Pancake / Hệ thống sang timestamp (ms)
 * Hỗ trợ mọi định dạng: ISO, SQL, DD/MM/YYYY, HH:mm DD/MM/YY, DD/MM/YY HH:mm, v.v.
 */
export function parseOrderTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (!str) return 0;

  // Nếu là chuỗi số timestamp (ms hoặc s)
  if (/^\\d{10,13}$/.test(str)) {
    const num = parseInt(str, 10);
    return str.length === 10 ? num * 1000 : num;
  }

  // Parse trực tiếp nếu là định dạng chuẩn ISO/RFC
  const direct = new Date(str).getTime();
  if (!isNaN(direct) && direct > 0) return direct;

  // Format: "HH:mm DD/MM/YYYY" hoặc "HH:mm DD/MM/YY"
  const mTimeDate = str.match(/(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?\\s+(\\d{1,2})[\\/\\-\\.](\\d{1,2})[\\/\\-\\.](\\d{2,4})/);
  if (mTimeDate) {
    const hour = parseInt(mTimeDate[1], 10);
    const minute = parseInt(mTimeDate[2], 10);
    const sec = parseInt(mTimeDate[3] || "0", 10);
    const day = parseInt(mTimeDate[4], 10);
    const month = parseInt(mTimeDate[5], 10) - 1;
    let year = parseInt(mTimeDate[6], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day, hour, minute, sec).getTime();
  }

  // Format: "DD/MM/YYYY HH:mm" hoặc "DD/MM/YY HH:mm" hoặc "DD/MM/YYYY"
  const mDateTime = str.match(/(\\d{1,2})[\\/\\-\\.](\\d{1,2})[\\/\\-\\.](\\d{2,4})(?:\\s+(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?)?/);
  if (mDateTime) {
    const day = parseInt(mDateTime[1], 10);
    const month = parseInt(mDateTime[2], 10) - 1;
    let year = parseInt(mDateTime[3], 10);
    if (year < 100) year += 2000;
    const hour = parseInt(mDateTime[4] || "0", 10);
    const minute = parseInt(mDateTime[5] || "0", 10);
    const sec = parseInt(mDateTime[6] || "0", 10);
    return new Date(year, month, day, hour, minute, sec).getTime();
  }

  return 0;
}

export function toStartOfDay(ts: number): number {
  if (!ts || ts <= 0) return 0;
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatDateTime(val: any): string {
  if (!val) return '';
  const ts = parseOrderTimestamp(val);
  if (!ts) return String(val);
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Kiểm tra xem khách hàng đã đi hết đơn hay chưa dựa trên so sánh:
 * Thời gian của đơn hàng gần nhất trên Pancake POS vs Thời gian chốt đơn trong hệ thống.
 * 
 * QUY TẮC NGHIỆP VỤ:
 * 1. Nếu đơn gần nhất trên Pancake có ngày >= ngày của các món trong lịch sử chốt đơn cũ (pastItems):
 *    -> Hiểu toàn bộ các đơn chốt cũ đó đã gom đẩy lên Pancake POS xong.
 * 2. Nếu không còn món mới nào chốt sau thời điểm đơn Pancake (currentItems trống hoặc được tạo trước đơn Pancake):
 *    -> Khách hàng ĐÃ ĐI HẾT ĐƠN 100%.
 */
export function checkCustomerPancakeShippedStatus(
  cust: { items?: any[]; pastItems?: any[]; lastTime?: number; count?: number; total?: number } | undefined,
  insight: PancakeCustomerInsight | null | undefined
): {
  isAllShipped: boolean;
  latestChotTime: number;
  latestPancakeTime: number;
  latestPancakeOrder: PancakeOrderInfo | null;
  hasPancakeOrders: boolean;
  unshippedItemsCount: number;
  hasNewItemsAfterPancake: boolean;
  unshippedPastItemsCount: number;
  unshippedCurrentItemsCount: number;
} {
  if (!cust) {
    return {
      isAllShipped: false,
      latestChotTime: 0,
      latestPancakeTime: 0,
      latestPancakeOrder: null,
      hasPancakeOrders: false,
      unshippedItemsCount: 0,
      hasNewItemsAfterPancake: false,
      unshippedPastItemsCount: 0,
      unshippedCurrentItemsCount: 0
    };
  }

  const currentItems = cust.items || [];
  const pastItems = cust.pastItems || [];

  // Lấy đơn gần nhất trên Pancake POS
  const orders = insight?.ordersHistory || (insight?.latestOrder ? [insight.latestOrder] : []);
  const latestPancakeOrder = orders[0] || null;
  const hasPancakeOrders = orders.length > 0 && !!latestPancakeOrder;

  let latestPancakeTime = 0;
  if (latestPancakeOrder) {
    const rawDate = latestPancakeOrder.insertedAt || latestPancakeOrder.updatedAt || "";
    latestPancakeTime = parseOrderTimestamp(rawDate);
  }

  // Tìm thời gian chốt đơn gần nhất thực tế của khách từ các items
  let latestChotTime = 0;
  currentItems.forEach(it => {
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (itTime > latestChotTime) latestChotTime = itTime;
  });
  pastItems.forEach(it => {
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (itTime > latestChotTime) latestChotTime = itTime;
  });
  if (latestChotTime === 0 && cust.lastTime) {
    latestChotTime = cust.lastTime;
  }

  // Nếu không có đơn Pancake nào hoặc chưa có thời gian đơn Pancake
  if (!hasPancakeOrders || latestPancakeTime <= 0) {
    const totalItems = currentItems.length + pastItems.length;
    return {
      isAllShipped: false,
      latestChotTime,
      latestPancakeTime: 0,
      latestPancakeOrder: null,
      hasPancakeOrders: false,
      unshippedItemsCount: totalItems,
      hasNewItemsAfterPancake: totalItems > 0,
      unshippedPastItemsCount: pastItems.length,
      unshippedCurrentItemsCount: currentItems.length
    };
  }

  const pancakeDayStart = toStartOfDay(latestPancakeTime);

  // 1. Phân loại các món trong giỏ hiện tại (currentItems):
  // Nếu món được tạo sau thời gian đơn Pancake (+ 60s) -> Món mới chưa đi
  const newActiveItems = currentItems.filter(it => {
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (!itTime) return false;
    return itTime > (latestPancakeTime + 60000);
  });

  // 2. Phân loại các món trong lịch sử cũ (pastItems):
  // Món trong pastItems được coi là đã đi nếu ngày tạo của món <= ngày tạo đơn Pancake (hoặc timestamp <= latestPancakeTime)
  const newPastItems = pastItems.filter(it => {
    if (it.shipped) return false;
    const itTime = it.createdAt ? parseOrderTimestamp(it.createdAt) : (it.id ? parseInt(String(it.id).substring(0, 13)) : 0) || 0;
    if (!itTime) return false; // Không có thời gian -> coi như cũ đã đi
    const itDayStart = toStartOfDay(itTime);
    // Nếu ngày của đơn Pancake >= ngày của món cũ -> đã đi hết
    if (pancakeDayStart >= itDayStart) return false;
    return itTime > (latestPancakeTime + 60000);
  });

  const unshippedCurrentCount = newActiveItems.length;
  const unshippedPastCount = newPastItems.length;
  const totalUnshippedCount = unshippedCurrentCount + unshippedPastCount;

  // Khách được coi là "Đã đi hết đơn" nếu:
  // - Không có món nào chưa giao (totalUnshippedCount === 0)
  // - Hoặc đơn Pancake có ngày/giờ >= lần chốt đơn gần nhất
  // - Hoặc không có đơn phiên này và ngày tạo đơn Pancake >= ngày của đơn cũ
  const isAllShipped = (totalUnshippedCount === 0) || 
                       (currentItems.length === 0 && pancakeDayStart >= toStartOfDay(latestChotTime)) ||
                       (latestPancakeTime >= latestChotTime);

  return {
    isAllShipped,
    latestChotTime,
    latestPancakeTime,
    latestPancakeOrder,
    hasPancakeOrders: true,
    unshippedItemsCount: isAllShipped ? 0 : totalUnshippedCount,
    hasNewItemsAfterPancake: !isAllShipped && totalUnshippedCount > 0,
    unshippedPastItemsCount: isAllShipped ? 0 : unshippedPastCount,
    unshippedCurrentItemsCount: isAllShipped ? 0 : unshippedCurrentCount
  };
}
`;

const pos = syncCode.indexOf("/**\n * Kiểm tra xem khách hàng đã đi hết đơn");
if (pos !== -1) {
  syncCode = syncCode.substring(0, pos) + newHelperSection.trim();
} else {
  syncCode += "\n" + newHelperSection.trim();
}

fs.writeFileSync("src/lib/pancakeSync.ts", syncCode);
console.log("Updated src/lib/pancakeSync.ts successfully!");
