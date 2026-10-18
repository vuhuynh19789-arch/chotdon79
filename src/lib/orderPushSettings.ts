// src/lib/orderPushSettings.ts
// Quản lý cấu hình API Đẩy Đơn - Lưu trữ trực tiếp trong App Settings (LocalStorage), không lưu máy chủ

export type OrderPushMode = 'client_direct' | 'custom_api' | 'server_proxy';
export type OrderPayloadFormat = 'pancake_standard' | 'simple_webhook' | 'raw_order';

export interface OrderPushSettings {
  mode: OrderPushMode;
  
  // 1. Cấu hình Custom API / Webhook riêng (Vercel API, n8n, Make, Google Sheets, custom backend...)
  customApiUrl: string;
  customApiKey: string;
  customHeaderName: string; // Mặc định: 'Authorization' hoặc 'x-api-key'
  customHeaderValue: string; // Mặc định: 'Bearer <token>' hoặc token
  extraHeadersJson: string; // JSON headers tùy chỉnh nếu có
  payloadFormat: OrderPayloadFormat;

  // 2. Cấu hình Đẩy Trực Tiếp (Client-Side Direct to Pancake POS)
  pancakeToken: string;
  shopId: string;
  warehouseId: string;

  // 3. Cấu hình Server Proxy
  proxyUrl: string; // Mặc định: '/api/pancake/push-order'

  // 4. Cơ chế lưu trữ & an toàn
  localOnly: boolean; // Chỉ lưu trên thiết bị này (LocalStorage), không lưu máy chủ
  autoFailoverToClient: boolean; // Tự động chuyển sang Đẩy trực tiếp từ client khi server bị chậm/504
  updatedAt: number;
}

const STORAGE_KEY = 'slp_order_push_settings';
export const DEFAULT_PANCAKE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3NfdG9rZW4iOiIzMzg5MmY5MGNkOTM4NjM1YzAwOGNhMDRjY2UzMTgyOSIsImFwcF9pZCI6IjY2ZWY5ZDk2MGRkYmFmOGE0MWRlYjc3NSIsInVzZXJfaWQiOiIyMDE4ZTA2MC0zMDJiLTQ3MTgtOGJkMi05MWRhNGRlNmJiZWYifQ.3gK0uS5h39z7uTz8Y7kX_fB5r-x4Lz7H3p6a_m4k1_0";

export const DEFAULT_ORDER_PUSH_SETTINGS: OrderPushSettings = {
  // Mặc định dùng Client Direct hoặc Server với Auto-Failover để không bao giờ bị nghẽn
  mode: 'client_direct',
  customApiUrl: '',
  customApiKey: '',
  customHeaderName: 'Authorization',
  customHeaderValue: '',
  extraHeadersJson: '',
  payloadFormat: 'pancake_standard',
  pancakeToken: DEFAULT_PANCAKE_TOKEN,
  shopId: '30093990',
  warehouseId: '9872be82-80b0-4486-9260-2b625b2e0325',
  proxyUrl: '/api/pancake/push-order',
  localOnly: true,
  autoFailoverToClient: true,
  updatedAt: Date.now()
};

/**
 * Đọc cấu hình API Đẩy Đơn từ LocalStorage của ứng dụng
 */
export function getOrderPushSettings(): OrderPushSettings {
  if (typeof window === 'undefined') return DEFAULT_ORDER_PUSH_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Nếu chưa có, lấy token hiện tại từ pancake_token nếu có
      const legacyToken = localStorage.getItem('pancake_token');
      const initial = { ...DEFAULT_ORDER_PUSH_SETTINGS };
      if (legacyToken) {
        initial.pancakeToken = legacyToken.trim();
      }
      return initial;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ORDER_PUSH_SETTINGS,
      ...parsed
    };
  } catch (err) {
    console.warn("Lỗi đọc cấu hình order push settings:", err);
    return DEFAULT_ORDER_PUSH_SETTINGS;
  }
}

/**
 * Lưu cấu hình API Đẩy Đơn vào LocalStorage của ứng dụng
 */
export function saveOrderPushSettings(settings: Partial<OrderPushSettings>): OrderPushSettings {
  if (typeof window === 'undefined') return DEFAULT_ORDER_PUSH_SETTINGS;
  try {
    const current = getOrderPushSettings();
    const updated: OrderPushSettings = {
      ...current,
      ...settings,
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Đồng bộ pancake_token nếu có thay đổi
    if (updated.pancakeToken) {
      localStorage.setItem('pancake_token', updated.pancakeToken.trim());
    }

    // Phát sự kiện để các component khác tự động cập nhật
    window.dispatchEvent(new CustomEvent('order_push_settings_updated', { detail: updated }));
    return updated;
  } catch (err) {
    console.error("Lỗi lưu cấu hình order push settings:", err);
    return DEFAULT_ORDER_PUSH_SETTINGS;
  }
}

/**
 * Reset cấu hình về mặc định
 */
export function resetOrderPushSettings(): OrderPushSettings {
  if (typeof window === 'undefined') return DEFAULT_ORDER_PUSH_SETTINGS;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('order_push_settings_updated', { detail: DEFAULT_ORDER_PUSH_SETTINGS }));
    return DEFAULT_ORDER_PUSH_SETTINGS;
  } catch {
    return DEFAULT_ORDER_PUSH_SETTINGS;
  }
}

/**
 * Kiểm tra kết nối API đẩy đơn (Ping / Test endpoint)
 */
export async function testOrderPushApiConnection(
  settings: OrderPushSettings
): Promise<{ success: boolean; latencyMs: number; message: string; details?: any }> {
  const start = performance.now();
  const token = (settings.pancakeToken || DEFAULT_PANCAKE_TOKEN).trim();

  // Test chế độ 1: Custom API Endpoint
  if (settings.mode === 'custom_api') {
    const url = settings.customApiUrl.trim();
    if (!url) {
      return {
        success: false,
        latencyMs: 0,
        message: 'Vui lòng nhập đường dẫn URL của API Đẩy Đơn (Custom API URL).'
      };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (settings.customHeaderValue) {
        headers[settings.customHeaderName || 'Authorization'] = settings.customHeaderValue;
      } else if (settings.customApiKey) {
        headers[settings.customHeaderName || 'Authorization'] = settings.customApiKey.startsWith('Bearer ') 
          ? settings.customApiKey 
          : `Bearer ${settings.customApiKey}`;
      }

      if (settings.extraHeadersJson) {
        try {
          const extra = JSON.parse(settings.extraHeadersJson);
          Object.assign(headers, extra);
        } catch {}
      }

      // Gửi request ping hoặc OPTIONS/POST dry-run
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const testPayload = {
        test: true,
        ping: true,
        timestamp: Date.now(),
        message: 'Live Ping Connection Test from App Chốt Đơn'
      };

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - start);

      if (res.ok || res.status === 200 || res.status === 201 || res.status === 400 || res.status === 422) {
        // Nếu API nhận request (kể cả 400 do validation payload) nghĩa là server online và phản hồi tốt
        return {
          success: true,
          latencyMs,
          message: `Kết nối thành công! Phản hồi HTTP ${res.status} trong ${latencyMs}ms.`,
          details: { status: res.status, url }
        };
      } else {
        return {
          success: false,
          latencyMs,
          message: `Máy chủ API trả về mã lỗi HTTP ${res.status} (${res.statusText}).`,
          details: { status: res.status, url }
        };
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      const isTimeout = err?.name === 'AbortError' || latencyMs >= 7000;
      return {
        success: false,
        latencyMs,
        message: isTimeout 
          ? `Quá thời gian kết nối (>7000ms). Máy chủ phản hồi chậm hoặc bị treo!`
          : `Không thể kết nối đến URL API: ${err?.message || 'Lỗi mạng hoặc CORS'}`
      };
    }
  }

  // Test chế độ 2: Trực tiếp từ Trình duyệt đến Pancake POS
  if (settings.mode === 'client_direct') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${token}`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - start);

      if (res.ok) {
        const data = await res.json();
        const shops = data.shops || [];
        const shopNames = shops.map((s: any) => `${s.name || s.id} (#${s.id})`).join(', ');
        return {
          success: true,
          latencyMs,
          message: `Kết nối trực tiếp Pancake POS cực nhanh (${latencyMs}ms)! Tìm thấy ${shops.length} shop: ${shopNames || 'Không có tên'}`,
          details: { shops, count: shops.length }
        };
      } else {
        return {
          success: false,
          latencyMs,
          message: `Lỗi kết nối Pancake POS (${res.status}): Vui lòng kiểm tra lại Token Pancake.`
        };
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: false,
        latencyMs,
        message: `Lỗi kết nối trực tiếp: ${err?.message || 'Không thể liên lạc máy chủ Pancake'}`
      };
    }
  }

  // Test chế độ 3: Qua máy chủ Proxy
  try {
    const proxyUrl = settings.proxyUrl || '/api/pancake/push-order';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      return {
        success: true,
        latencyMs,
        message: `Máy chủ Proxy phản hồi tốt trong ${latencyMs}ms!`,
        details: { proxyUrl }
      };
    } else {
      return {
        success: false,
        latencyMs,
        message: `Máy chủ Proxy trả về lỗi ${res.status}. Nên chuyển sang Đẩy trực tiếp từ trình duyệt.`
      };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Máy chủ Proxy không phản hồi (${err?.message || 'Timeout'}). Đề xuất chọn chế độ Đẩy trực tiếp!`
    };
  }
}

/**
 * Tự động phát hiện danh sách Shop và Kho hàng từ Pancake POS
 */
export async function autoDiscoverPancakeShops(
  token: string
): Promise<{ success: boolean; shops: any[]; defaultShopId?: string; defaultWarehouseId?: string; error?: string }> {
  try {
    const cleanToken = (token || DEFAULT_PANCAKE_TOKEN).trim();
    const res = await fetch(`https://pos.pages.fm/api/v1/shops?access_token=${cleanToken}`);
    if (!res.ok) {
      return { success: false, shops: [], error: `Lỗi HTTP ${res.status} từ Pancake POS` };
    }
    const data = await res.json();
    const shops = data.shops || [];
    if (shops.length === 0) {
      return { success: false, shops: [], error: 'Tài khoản Pancake chưa có Cửa hàng (Shop) nào.' };
    }

    const firstShop = shops[0];
    const shopId = String(firstShop.id);
    let warehouseId = firstShop.default_warehouse_when_auto_create_orders || '';

    // Nếu chưa có warehouseId, lấy danh sách kho
    if (!warehouseId) {
      try {
        const wRes = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/warehouses?access_token=${cleanToken}`);
        if (wRes.ok) {
          const wData = await wRes.json();
          const warehouses = wData.warehouses || wData.data || [];
          if (warehouses.length > 0) {
            warehouseId = String(warehouses[0].id);
          }
        }
      } catch {}
    }

    return {
      success: true,
      shops,
      defaultShopId: shopId,
      defaultWarehouseId: warehouseId || '9872be82-80b0-4486-9260-2b625b2e0325'
    };
  } catch (err: any) {
    return {
      success: false,
      shops: [],
      error: err?.message || 'Không thể liên lạc với máy chủ Pancake'
    };
  }
}
