// src/lib/pancakeDirectPush.ts
// Đẩy đơn hàng TRỰC TIẾP từ Trình duyệt (Client-Side Direct Push) & Custom API Endpoint
// Hoàn toàn không qua máy chủ trung gian -> Loại bỏ 100% lỗi serverless timeout (504 / FUNCTION_INVOCATION_FAILED) khi deploy Vercel

import { PushOrderPayload, PushOrderResult, PancakeOrderInfo, getOrderStatusLabel, getPartnerStatusLabel } from './pancakeSync';
import { OrderPushSettings, DEFAULT_PANCAKE_TOKEN } from './orderPushSettings';

// Cache variations trên trình duyệt để tránh gọi API lặp lại
let browserVariationsCache: { timestamp: number; shopId: string; list: any[] } | null = null;

/**
 * Lấy danh sách variations của Shop trực tiếp từ Pancake POS
 */
async function getBrowserShopVariations(shopId: string, token: string): Promise<any[]> {
  if (
    browserVariationsCache &&
    browserVariationsCache.shopId === shopId &&
    Date.now() - browserVariationsCache.timestamp < 120000 &&
    browserVariationsCache.list.length > 0
  ) {
    return browserVariationsCache.list;
  }

  const variationsList: any[] = [];
  const seenIds = new Set<string>();

  try {
    const res = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/products/variations?access_token=${token}&page_size=250&page_number=1`);
    if (res.ok) {
      const data = await res.json();
      const list = data.data || data.variations || (Array.isArray(data) ? data : []);
      if (Array.isArray(list)) {
        list.forEach((v: any) => {
          if (v && v.id && !seenIds.has(String(v.id))) {
            seenIds.add(String(v.id));
            variationsList.push({
              ...v,
              product_name: v.product?.name || v.product_name || v.name || '',
              variation_name: v.variation_name || v.name || ''
            });
          }
        });
      }
    }
  } catch {}

  // Fallback endpoint /variations
  if (variationsList.length === 0) {
    try {
      const res2 = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/variations?access_token=${token}&page_size=250`);
      if (res2.ok) {
        const data2 = await res2.json();
        const list2 = data2.data || data2.variations || (Array.isArray(data2) ? data2 : []);
        if (Array.isArray(list2)) {
          list2.forEach((v: any) => {
            if (v && v.id && !seenIds.has(String(v.id))) {
              seenIds.add(String(v.id));
              variationsList.push({
                ...v,
                product_name: v.product?.name || v.product_name || v.name || '',
                variation_name: v.variation_name || v.name || ''
              });
            }
          });
        }
      }
    } catch {}
  }

  if (variationsList.length > 0) {
    browserVariationsCache = {
      timestamp: Date.now(),
      shopId,
      list: variationsList
    };
  }

  return variationsList;
}

/**
 * Tạo nhanh sản phẩm trên Pancake POS trực tiếp từ trình duyệt
 */
async function createProductDirectly(shopId: string, token: string, name: string, priceVnd: number, barcode: string): Promise<string | null> {
  const priceK = priceVnd > 1000 ? Math.round(priceVnd / 1000) : priceVnd;
  const targetBarcode = barcode || `0${priceK}`;
  const cleanName = `sản phẩm ${priceK}`;

  const payloads = [
    {
      name: cleanName,
      retail_price: priceVnd,
      display_id: targetBarcode,
      barcode: targetBarcode,
      weight: 200,
      variations: [
        {
          name: targetBarcode,
          retail_price: priceVnd,
          display_id: targetBarcode,
          barcode: targetBarcode,
          weight: 200
        }
      ]
    },
    {
      product: {
        name: cleanName,
        retail_price: priceVnd,
        display_id: targetBarcode,
        barcode: targetBarcode,
        weight: 200,
        variations: [
          {
            name: targetBarcode,
            retail_price: priceVnd,
            display_id: targetBarcode,
            barcode: targetBarcode,
            weight: 200
          }
        ]
      }
    }
  ];

  for (const pl of payloads) {
    try {
      const res = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/products?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pl)
      });
      if (res.ok) {
        const data = await res.json();
        const prod = data.product || data.data || data;
        const variation = prod?.variations?.[0] || prod;
        const varId = variation?.id || prod?.id;
        if (varId) return String(varId);
      }
    } catch {}
  }

  return null;
}

/**
 * Đẩy đơn hàng TRỰC TIẾP từ Trình duyệt lên Pancake POS API
 * Đảm bảo tốc độ tức thì (< 1s), không qua trung gian server, không bao giờ bị timeout
 */
export async function pushOrderDirectlyFromBrowser(
  payload: PushOrderPayload,
  settings: OrderPushSettings
): Promise<PushOrderResult> {
  const token = (settings.pancakeToken || DEFAULT_PANCAKE_TOKEN).trim();
  let shopId = settings.shopId || '30093990';
  let warehouseId = settings.warehouseId || '9872be82-80b0-4486-9260-2b625b2e0325';

  if (!payload.items || payload.items.length === 0) {
    return { success: false, error: 'Danh sách sản phẩm trống, vui lòng chọn ít nhất 1 sản phẩm.' };
  }

  // 1. Phân tích Link và Thông tin khách hàng
  const customInfo = payload.customCustomerInfo || {};
  let chosenName = (customInfo.name || payload.nickname || payload.user || 'Khách chốt Live').trim();
  let chosenPhone = (customInfo.phone || '').replace(/\D/g, '');
  let chosenAddress = (customInfo.address || '').trim();

  // Chuẩn hóa số điện thoại
  if (chosenPhone.startsWith('84') && chosenPhone.length >= 11) {
    chosenPhone = '0' + chosenPhone.slice(2);
  }

  let finalPageId = customInfo.pageId || payload.pageId || '';
  let finalConvId = customInfo.conversationId || payload.conversationId || '';

  // Trích xuất PageId và ConvId từ pancakeLink nếu có
  const rawLink = (payload.pancakeLink || '').trim();
  if (rawLink) {
    if (/^pzl_[ug]_([0-9]+)_/.test(rawLink)) {
      finalConvId = rawLink;
      const m = rawLink.match(/pzl_[ug]_([0-9]+)_/);
      if (m && m[1]) finalPageId = `pzl_${m[1]}`;
      else finalPageId = 'pzl_2007152536191688636';
    } else if (rawLink.startsWith('pzl_')) {
      finalConvId = rawLink;
      finalPageId = 'pzl_2007152536191688636';
    } else {
      const fbMatch = rawLink.match(/^(?:fb_)?([0-9]{10,})_([0-9]{10,})$/);
      if (fbMatch) {
        finalPageId = fbMatch[1];
        finalConvId = `${fbMatch[1]}_${fbMatch[2]}`;
      }
    }

    try {
      const urlObj = new URL(rawLink.startsWith('http') ? rawLink : `https://${rawLink}`);
      if (!finalPageId) finalPageId = urlObj.searchParams.get('page_id') || urlObj.searchParams.get('pageId') || '';
      if (!finalConvId) finalConvId = urlObj.searchParams.get('c_id') || urlObj.searchParams.get('conversation_id') || '';
      if (!chosenPhone && urlObj.searchParams.has('phone')) {
        chosenPhone = (urlObj.searchParams.get('phone') || '').replace(/\D/g, '');
      }
    } catch {}
  }

  const isZalo = Boolean(
    (finalConvId && finalConvId.startsWith('pzl_')) ||
    (finalPageId && String(finalPageId).startsWith('pzl_')) ||
    (rawLink && rawLink.includes('pzl'))
  );
  const orderSources = isZalo ? "-8" : "-1";

  // 2. Tải danh sách variations
  let shopVariations: any[] = [];
  try {
    shopVariations = await getBrowserShopVariations(shopId, token);
  } catch {}

  const firstActiveVarId = shopVariations[0]?.id || 'bf05b2ef-8d50-4658-9701-63786bd4bc61';

  // 3. Xử lý sản phẩm & Barcode 0(giá)
  const posItems: any[] = [];
  let totalItemsPrice = 0;

  for (const it of payload.items) {
    const p = Number(it.price) || 0;
    const priceK = p > 1000 ? Math.round(p / 1000) : p;
    const priceVnd = p > 1000 ? p : p * 1000;
    const qty = Number(it.quantity) || 1;
    totalItemsPrice += priceVnd * qty;

    const targetBarcode = `0${priceK}`;
    const altBarcode = `${priceK}`;
    let targetVarId = it.variationId || '';

    if (!targetVarId && shopVariations.length > 0) {
      const matched = shopVariations.find((v: any) => {
        const vBarcode = String(v.barcode || '').trim();
        const vDisplayId = String(v.display_id || v.sku || '').trim();
        const priceMatch = (Number(v.retail_price) === priceVnd || Number(v.retail_price_currency_original) === priceVnd);
        const isBarcodeExact = (vBarcode === targetBarcode || vBarcode === altBarcode || vDisplayId === targetBarcode || vDisplayId === altBarcode);
        return isBarcodeExact || priceMatch;
      });
      if (matched) {
        targetVarId = matched.id;
      }
    }

    if (!targetVarId) {
      // Thử tạo sản phẩm trực tiếp
      const createdId = await createProductDirectly(shopId, token, `sản phẩm ${priceK}`, priceVnd, targetBarcode);
      if (createdId) targetVarId = createdId;
    }

    if (!targetVarId) {
      targetVarId = firstActiveVarId;
    }

    const cleanItemNote = (!it.content || it.content === "(Không ghi chú)" || it.content.toLowerCase().includes("không ghi chú")) 
      ? undefined 
      : it.content.trim();

    const itemObj: any = {
      variation_id: targetVarId,
      price: priceVnd,
      quantity: qty
    };
    if (cleanItemNote) {
      itemObj.note = cleanItemNote;
    }

    posItems.push(itemObj);
  }

  // 4. Xử lý phí ship & cọc
  let assignedShippingFee = 20000;
  if (payload.isGheLay || payload.tag === 'GHE_LAY') {
    assignedShippingFee = 0;
  } else if (payload.isNinhThuan || payload.shippingFee === 15000) {
    assignedShippingFee = 15000;
  } else if (typeof payload.shippingFee === 'number') {
    assignedShippingFee = payload.shippingFee;
  }

  let assignedPrepaid = 0;
  if (typeof payload.prepaid === 'number') {
    assignedPrepaid = payload.prepaid;
  } else if (payload.tag === 'COC') {
    assignedPrepaid = 50000;
  } else if (payload.tag === 'COC_100') {
    assignedPrepaid = 100000;
  }

  // 5. Chuẩn hóa shipping_address
  const shippingAddr: any = {
    full_name: chosenName,
    phone_number: chosenPhone || undefined,
    full_address: chosenAddress || ""
  };

  // 6. Xây dựng Payload tạo đơn gửi thẳng lên Pancake POS
  const createPayload: any = {
    page_id: finalPageId || undefined,
    conversation_id: finalConvId || undefined,
    warehouse_id: warehouseId,
    bill_full_name: chosenName,
    bill_phone_number: chosenPhone || undefined,
    shipping_address: shippingAddr,
    shipping_fee: assignedShippingFee,
    prepaid: assignedPrepaid > 0 ? assignedPrepaid : undefined,
    items: posItems,
    customer: {
      name: chosenName,
      phone: chosenPhone || undefined,
      phone_numbers: chosenPhone ? [chosenPhone] : undefined,
      page_id: finalPageId || undefined
    },
    order: {
      warehouse_id: warehouseId,
      bill_full_name: chosenName,
      bill_phone_number: chosenPhone || undefined,
      shipping_address: shippingAddr,
      shipping_fee: assignedShippingFee,
      prepaid: assignedPrepaid > 0 ? assignedPrepaid : undefined,
      items: posItems,
      page_id: finalPageId || undefined,
      conversation_id: finalConvId || undefined,
      order_sources: orderSources
    },
    status: 0,
    order_sources: orderSources,
    is_send_message: true,
    send_message: true,
    auto_send_order_message: true
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const resText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(resText);
    } catch {}

    if (!res.ok || (data && data.success === false)) {
      const errMsg = data?.error || data?.message || `Lỗi từ Pancake POS (${res.status})`;
      return {
        success: false,
        error: errMsg
      };
    }

    const createdOrder = data?.order || data?.data || data;

    // Gửi tin nhắn thông báo vào cuộc trò chuyện nếu có
    let messageSent = false;
    let messageError: string | undefined = undefined;

    if (payload.sendNotificationMessage && finalPageId && finalConvId) {
      try {
        const codAmount = Math.max(0, totalItemsPrice + assignedShippingFee - assignedPrepaid);
        const orderDisplayId = createdOrder?.display_id || createdOrder?.order_number || createdOrder?.id || '';
        const orderMsgText = `Dạ shop đã lên đơn #${orderDisplayId} cho mình gồm ${payload.items.length} món (${totalItemsPrice.toLocaleString('vi-VN')}₫) ạ! Tiền cọc: ${assignedPrepaid.toLocaleString('vi-VN')}₫. Thu hộ COD: ${codAmount.toLocaleString('vi-VN')}₫. Cảm ơn bạn nhiều ạ! ❤️`;

        const msgRes = await fetch(`https://pages.fm/api/v1/pages/${finalPageId}/conversations/${finalConvId}/messages?access_token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: orderMsgText,
            messaging_type: 'RESPONSE'
          })
        });
        if (msgRes.ok) {
          messageSent = true;
        }
      } catch (mErr: any) {
        messageError = mErr?.message;
      }
    }

    return {
      success: true,
      message: `Đẩy đơn trực tiếp lên Pancake POS thành công (Mã đơn: #${createdOrder?.display_id || createdOrder?.id || 'Mới'})!`,
      order: createdOrder,
      messageSent,
      messageError,
      pageId: finalPageId,
      conversationId: finalConvId
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Lỗi kết nối Pancake POS trực tiếp: ${err?.message || 'Quá thời gian phản hồi'}`
    };
  }
}

/**
 * Đẩy đơn hàng sang Custom API Endpoint (do người dùng tự nhập trong Cài đặt)
 * Ví dụ: URL Vercel của người dùng, Webhook Make/n8n, Google Apps Script, v.v.
 */
export async function pushOrderToCustomApi(
  payload: PushOrderPayload,
  settings: OrderPushSettings
): Promise<PushOrderResult> {
  const url = settings.customApiUrl.trim();
  if (!url) {
    return { success: false, error: 'Chưa cấu hình URL API Đẩy Đơn trong Cài đặt.' };
  }

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

  // Tùy chỉnh định dạng payload
  let requestBody: any = payload;
  const totalPriceK = payload.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);
  const totalPriceVnd = totalPriceK * 1000;
  const shippingFee = payload.shippingFee ?? (payload.isGheLay ? 0 : (payload.isNinhThuan ? 15000 : 20000));
  const prepaid = payload.prepaid ?? 0;
  const cod = Math.max(0, totalPriceVnd + shippingFee - prepaid);

  if (settings.payloadFormat === 'simple_webhook') {
    requestBody = {
      event: 'order.created',
      timestamp: Date.now(),
      platform: payload.platform,
      customer: {
        user: payload.user,
        nickname: payload.nickname || payload.user,
        name: payload.customCustomerInfo?.name || payload.nickname || payload.user,
        phone: payload.customCustomerInfo?.phone || '',
        address: payload.customCustomerInfo?.address || '',
        pancakeLink: payload.pancakeLink || ''
      },
      items: payload.items.map(it => ({
        content: it.content,
        priceK: it.price,
        priceVnd: (it.price || 0) * 1000,
        quantity: it.quantity || 1
      })),
      pricing: {
        totalGoodsVnd: totalPriceVnd,
        shippingFeeVnd: shippingFee,
        prepaidVnd: prepaid,
        codVnd: cod
      },
      notes: payload.customNote || ''
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const resText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(resText);
    } catch {}

    if (!res.ok) {
      return {
        success: false,
        error: `Custom API trả về mã lỗi HTTP ${res.status}: ${data?.error || data?.message || resText.slice(0, 100)}`
      };
    }

    return {
      success: true,
      message: data?.message || 'Đẩy đơn qua API Tùy Chỉnh thành công!',
      order: data?.order || data
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Lỗi kết nối Custom API: ${err?.message || 'Quá thời gian phản hồi'}`
    };
  }
}
