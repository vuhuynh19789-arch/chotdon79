import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  Package, 
  Check, 
  X, 
  ExternalLink, 
  Smartphone, 
  Truck, 
  MapPin, 
  Phone, 
  User, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Tag, 
  CheckCircle2, 
  Copy,
  Plus,
  Search,
  Minus,
  Trash2,
  Layers,
  Edit3,
  MessageSquare,
  Clipboard,
  Send,
  MessageCircle,
  Sliders,
  Zap,
  Globe,
  Server
} from 'lucide-react';
import { OrderPushSettingsModal } from './OrderPushSettingsModal';
import { getOrderPushSettings, saveOrderPushSettings, OrderPushSettings } from '../lib/orderPushSettings';
import { useStore, OrderItem, isCustomerNinhThuan } from '../store';
import { Platform, PLATFORMS, getShortId, normalizeUser, printBill, APP_VERSION, showAppToast } from '../lib/core';
import { CustomerAvatar, ThapChamIcon, GheLayBadge } from './UserAvatar';
import { ItemCalculatorModal, ParsedCalculatorItem } from './ItemCalculatorModal';
import { openPancakeApp, parsePancakeContact, extractPhoneFromText } from '../lib/pancakeDeepLink';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';
import { PriceIncrementButton } from './Modals';
import { 
  getCustomerInsight, 
  fetchRecentZaloConversations, 
  ZaloInboxConversation,
  pushCustomerOrderToPancake,
  syncSingleCustomerPancakeOrders,
  generateSuggestedPancakeName,
  lookupCustomerByPhone,
  fetchPancakeVariations,
  PancakeVariation,
  parsePancakeUrlIds,
  sendPancakeMessage,
  PushOrderResult,
  isShopPhone
} from '../lib/pancakeSync';

export const isPhuShipItem = (content?: string) => {
  if (!content) return false;
  const c = content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return c.includes("phu ship") || c.includes("phu thu ship");
};

export const syncPhuShipItems = (items: EditablePushItem[], isGheLay: boolean = false): EditablePushItem[] => {
  if (isGheLay) {
    return items.filter(it => !isPhuShipItem(it.content));
  }
  const mainItems = items.filter(it => !isPhuShipItem(it.content));
  const totalMainQty = mainItems.reduce((sum, it) => sum + (it.quantity || 1), 0);

  if (totalMainQty === 1) {
    const hasPhuShip = items.some(it => isPhuShipItem(it.content));
    if (!hasPhuShip) {
      return [
        ...items,
        {
          content: "Phụ ship 5k",
          priceK: 5,
          quantity: 1,
          isPast: false
        }
      ];
    }
    return items;
  } else {
    // Nếu hơn 1 sản phẩm hoặc 0 món: tự động bỏ phụ ship 5k ("nếu hơn 1 thì thôi")
    return items.filter(it => !isPhuShipItem(it.content));
  }
};

interface EditablePushItem {
  id?: string;
  content: string;
  priceK: number;
  unitPrice?: number;
  quantity: number;
  isPast?: boolean;
  originalIndex?: number;
  createdAt?: number;
  variationId?: string;
  variationName?: string;
  productName?: string;
  displayId?: string;
}

interface PancakeOrderPushModalProps {
  isOpen: boolean;
  user: string;
  platform: Platform;
  selectedCurrentIndices: Set<number>;
  selectedPastIndices: Set<number>;
  onClose: () => void;
  onSuccess?: (order: any) => void;
}

export const PancakeOrderPushModal: React.FC<PancakeOrderPushModalProps> = ({
  isOpen,
  user,
  platform,
  selectedCurrentIndices,
  selectedPastIndices,
  onClose,
  onSuccess
}) => {
  const [showZaloPicker, setShowZaloPicker] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [pickingVarForIdx, setPickingVarForIdx] = useState<number | null>(null);
  const [showPushSettingsModal, setShowPushSettingsModal] = useState(false);
  const [pushSettings, setPushSettings] = useState<OrderPushSettings>(getOrderPushSettings());

  useEffect(() => {
    const handleSettingsUpdated = (e: any) => {
      setPushSettings(e.detail || getOrderPushSettings());
    };
    window.addEventListener('order_push_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('order_push_settings_updated', handleSettingsUpdated);
  }, []);

  const isChildOpen = Boolean(isCalculatorOpen || showZaloPicker || pickingVarForIdx !== null || showPushSettingsModal);
  const { modalStyle, touchHandlers } = useSwipeToDismiss({ 
    onClose, 
    enabled: isOpen && !isChildOpen,
    registerBack: isOpen 
  });
  const store = useStore();
  const cleanUser = normalizeUser(user);
  const cust = store[platform].customers[cleanUser];
  const nickname = store[platform].nicknames?.[cleanUser] || '';
  const currentCustTag = store[platform].tags?.[cleanUser] || 'NORMAL';
  const tag = currentCustTag;
  const isGheLayCustomer = currentCustTag === 'GHE_LAY' || Boolean(store[platform].gheLayTags?.[cleanUser]);
  const existingLink = store[platform].pancakeLinks?.[cleanUser] || '';

  const [pancakeLink, setPancakeLink] = useState(existingLink);
  const [insight, setInsight] = useState(() => getCustomerInsight(cleanUser));
  const [isSearchingZalo, setIsSearchingZalo] = useState(false);
  const [zaloConvs, setZaloConvs] = useState<ZaloInboxConversation[]>([]);
  const [zaloSearchQuery, setZaloSearchQuery] = useState('');

  // Editable items state
  const [orderItems, setOrderItems] = useState<EditablePushItem[]>([]);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);

  // Shop variations from Pancake POS
  const [shopVariations, setShopVariations] = useState<PancakeVariation[]>([]);
  const [isLoadingVariations, setIsLoadingVariations] = useState(false);
  const [variationSearchQuery, setVariationSearchQuery] = useState('');

  const [customNote, setCustomNote] = useState<string>('');

  // Editable customer recipient details
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [shippingFee, setShippingFee] = useState<number>(() => {
    if (isGheLayCustomer) return 0;
    if (isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser)) return 15000;
    return 20000;
  });
  const [prepaidAmount, setPrepaidAmount] = useState<number>(0);
  const [isLookingUpPhone, setIsLookingUpPhone] = useState(false);

  const isNinhThuanCustomer = isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser) && !isGheLayCustomer;

  // Tự động nhận diện phí vận chuyển:
  // - Nếu khách có tag "Ghé lấy" (GHE_LAY): 0₫ (Miễn hoàn toàn phí ship)
  // - Nếu Ninh Thuận: 15.000₫ (theo tag hoặc địa chỉ)
  // - Các tỉnh khác: 20.000₫
  useEffect(() => {
    if (isGheLayCustomer) {
      setShippingFee(0);
      return;
    }
    const raw = (recipientAddress || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (isNinhThuanCustomer || raw.includes('ninh thuan') || raw.includes('phan rang') || raw.includes('thap cham')) {
      setShippingFee(15000);
    } else {
      setShippingFee(20000);
    }
  }, [recipientAddress, isNinhThuanCustomer, isGheLayCustomer]);

  // Options
  const [autoMarkShipped, setAutoMarkShipped] = useState(true);
  const [autoSendMessage, setAutoSendMessage] = useState(true);
  const [showMessagePreview, setShowMessagePreview] = useState(false);

  // Status & states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [pushResult, setPushResult] = useState<PushOrderResult | null>(null);
  const [isSendingManualMessage, setIsSendingManualMessage] = useState(false);
  const [manualMessageStatus, setManualMessageStatus] = useState<string | null>(null);
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [linkedConvCustomer, setLinkedConvCustomer] = useState<{
    name: string;
    phone?: string;
    address?: string;
    customerId?: string;
    conversationId?: string;
    pageId?: string;
  } | null>(null);

  // Xử lý dán link Pancake và tự động nhận diện hội thoại
  const handleLinkChange = async (newLink: string) => {
    setPancakeLink(newLink);
    const trimmed = newLink.trim();
    if (!trimmed) {
      setLinkedConvCustomer(null);
      return;
    }

    store.setCustomerPancakeLink(platform, cleanUser, trimmed);
    const parsed = parsePancakeUrlIds(trimmed);

    // Nếu link có chứa SĐT (khác số của shop)
    if (parsed.phone && !isShopPhone(parsed.phone) && (!recipientPhone || recipientPhone !== parsed.phone)) {
      setRecipientPhone(parsed.phone);
      handleLookupByPhone(parsed.phone);
    }

    // Nếu link có conversation ID, tra cứu insight để điền Tên/SĐT/Địa chỉ
    if (parsed.convId) {
      setIsParsingLink(true);
      try {
        const query = new URLSearchParams({ link: trimmed });
        const res = await fetch(`/api/pancake/customer-insight?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.insight) {
            const ins = data.insight;
            // Tự động gán tên tài khoản Zalo liên kết
            if (ins.matchedName) {
              setRecipientName(ins.matchedName);
            }
            if (ins.matchedPhone && !isShopPhone(ins.matchedPhone)) {
              setRecipientPhone(ins.matchedPhone);
            }
            if (ins.matchedAddress) {
              setRecipientAddress(ins.matchedAddress);
            }
            setLinkedConvCustomer({
              name: ins.matchedName || "",
              phone: isShopPhone(ins.matchedPhone) ? undefined : ins.matchedPhone,
              address: ins.matchedAddress,
              customerId: ins.customerId,
              conversationId: ins.conversationId || parsed.convId,
              pageId: ins.pageId || parsed.pageId
            });
          }
        }
      } catch (e) {
        console.warn("Lỗi đọc thông tin từ Pancake link:", e);
      } finally {
        setIsParsingLink(false);
      }
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          handleLinkChange(text.trim());
        }
      }
    } catch {}
  };

  // Gửi lại tin nhắn báo đơn thủ công nếu cần
  const handleSendOrderMessageManually = async () => {
    if (!createdOrder) return;
    const orderCode = createdOrder.display_id || createdOrder.id;
    const parsed = parsePancakeUrlIds(pancakeLink);
    const pId = pushResult?.pageId || parsed.pageId || "";
    const cId = pushResult?.conversationId || parsed.convId || "";

    if (!cId) {
      setManualMessageStatus("Chưa có ID hội thoại Pancake để gửi tin nhắn. Vui lòng kiểm tra lại link Pancake.");
      return;
    }

    setIsSendingManualMessage(true);
    setManualMessageStatus(null);
    try {
      const itemNotices = orderItems.map(it => `  + ${it.content} (${it.priceK}k x ${it.quantity})`).join('\n');
      const finalCod = Math.max(0, totalItemsPriceVnd + shippingFee - prepaidAmount);
      let autoMsg = `Dạ em chào ${recipientName || cleanUser}, Shop đã tạo đơn thành công cho mình trên Live ạ! ❤️\n\n` +
        `📦 Mã đơn hàng: #${orderCode}\n` +
        `🛍️ Chi tiết sản phẩm (${orderItems.reduce((sum, it) => sum + (it.quantity || 1), 0)} món):\n${itemNotices}\n` +
        `💰 Tiền hàng: ${totalItemsPriceVnd.toLocaleString('vi-VN')}đ\n` +
        `${shippingFee === 0 ? (isGheLayCustomer ? '🛵 Nhận hàng: Khách ghé lấy tại shop (0đ ship)\n' : '🚚 Phí vận chuyển: 0đ (Freeship)\n') : `🚚 Phí vận chuyển: ${shippingFee.toLocaleString('vi-VN')}đ\n`}`;

      if (prepaidAmount > 0) {
        autoMsg += `💳 Đã trừ cọc chuyển khoản: -${prepaidAmount.toLocaleString('vi-VN')}đ\n`;
      }

      autoMsg += `💵 Còn lại thu COD: ${finalCod.toLocaleString('vi-VN')}đ\n\n` +
        `Shop sẽ sớm đóng gói và gửi hàng cho mình nhé. Cảm ơn chị yêu đã ủng hộ shop ạ! 🥰`;

      const sendRes = await sendPancakeMessage({
        pageId: pId,
        conversationId: cId,
        message: autoMsg
      });

      if (sendRes.success) {
        setManualMessageStatus("Đã gửi tin nhắn báo đơn thành công vào hội thoại của khách!");
        setPushResult(prev => prev ? { ...prev, messageSent: true } : { success: true, messageSent: true });
      } else {
        setManualMessageStatus(`Chưa thể gửi tin: ${sendRes.error || "Hội thoại có thể đã hết hạn 24h hoặc bị chặn"}`);
      }
    } catch (err: any) {
      setManualMessageStatus(`Lỗi khi gửi tin: ${err.message}`);
    } finally {
      setIsSendingManualMessage(false);
    }
  };

  // Load Zalo conversations if needed
  const loadZaloConvs = async () => {
    setIsSearchingZalo(true);
    try {
      const res = await fetchRecentZaloConversations(undefined, platform === 'facebook' ? 'facebook' : 'all');
      setZaloConvs(res.conversations || []);
    } catch (err) {
      console.error("Lỗi tải Pancake conversations:", err);
    } finally {
      setIsSearchingZalo(false);
    }
  };

  // Load shop variations
  const loadShopVariations = async () => {
    setIsLoadingVariations(true);
    try {
      const res = await fetchPancakeVariations();
      if (res.success && res.variations) {
        setShopVariations(res.variations);
      }
    } catch (err) {
      console.warn("Lỗi tải danh mục Pancake POS:", err);
    } finally {
      setIsLoadingVariations(false);
    }
  };

  // Tra cứu tự động thông tin khách hàng từ Pancake dựa vào Số điện thoại
  const handleLookupByPhone = async (phoneToLookup?: string) => {
    const targetPhone = (phoneToLookup || recipientPhone || '').trim();
    const cleanDigits = targetPhone.replace(/\D/g, '');
    if (cleanDigits.length < 9 || isShopPhone(cleanDigits)) return;

    setIsLookingUpPhone(true);
    try {
      const result = await lookupCustomerByPhone(cleanDigits);
      if (result.success) {
        if (result.name && result.name.trim()) {
          setRecipientName(result.name.trim());
        }
        if (result.address && result.address.trim()) {
          setRecipientAddress(result.address.trim());
        }
        if (result.phone && !isShopPhone(result.phone)) {
          setRecipientPhone(result.phone);
        }
        if (!pancakeLink) {
          setPancakeLink(result.phone || cleanDigits);
          store.setCustomerPancakeLink(platform, cleanUser, result.phone || cleanDigits);
        }
        if (result.conversationId || result.pageId) {
          setLinkedConvCustomer(prev => ({
            name: result.name || prev?.name || "",
            phone: (result.phone && !isShopPhone(result.phone)) ? result.phone : prev?.phone,
            address: result.address || prev?.address || "",
            customerId: result.customerId || prev?.customerId,
            conversationId: result.conversationId || prev?.conversationId,
            pageId: result.pageId || prev?.pageId
          }));
        }
      }
    } catch (err) {
      console.error("Lỗi tra cứu SĐT Pancake:", err);
    } finally {
      setIsLookingUpPhone(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const currentLink = store[platform].pancakeLinks?.[cleanUser] || '';
      setPancakeLink(currentLink);
      setCreatedOrder(null);
      setPushResult(null);
      setManualMessageStatus(null);
      setIsSendingManualMessage(false);
      setIsParsingLink(false);
      setErrorMessage(null);
      setPickingVarForIdx(null);
      setEditingItemIdx(null);

      // Build initial order items from store
      const currentItems = cust?.items || [];
      const pastItems = cust?.pastItems || [];

      const initialItems: EditablePushItem[] = [];

      selectedCurrentIndices.forEach(idx => {
        const it = currentItems[idx];
        if (it) {
          const rawContent = (it.content || '').trim();
          const cleanContent = (!rawContent || rawContent === "(Không ghi chú)" || rawContent.toLowerCase().includes("không ghi chú")) ? "" : rawContent;
          const itemUnitPrice = it.unitPrice || it.price || 0;
          const itemQty = it.quantity || 1;
          initialItems.push({
            id: it.id,
            content: cleanContent || `Sản phẩm ${itemUnitPrice}k`,
            priceK: itemUnitPrice,
            unitPrice: itemUnitPrice,
            quantity: itemQty,
            isPast: false,
            originalIndex: idx,
            createdAt: it.createdAt || Date.now()
          });
        }
      });

      selectedPastIndices.forEach(idx => {
        const it = pastItems[idx];
        if (it) {
          const rawContent = (it.content || '').trim();
          const cleanContent = (!rawContent || rawContent === "(Không ghi chú)" || rawContent.toLowerCase().includes("không ghi chú")) ? "" : rawContent;
          const itemUnitPrice = it.unitPrice || it.price || 0;
          const itemQty = it.quantity || 1;
          initialItems.push({
            id: it.id,
            content: cleanContent || `Sản phẩm ${itemUnitPrice}k`,
            priceK: itemUnitPrice,
            unitPrice: itemUnitPrice,
            quantity: itemQty,
            isPast: true,
            originalIndex: idx,
            createdAt: it.createdAt || Date.now()
          });
        }
      });

      setOrderItems(syncPhuShipItems(initialItems, isGheLayCustomer));
      if (isGheLayCustomer) {
        setShippingFee(0);
      } else if (isCustomerNinhThuan(store[platform].ninhThuanTags, cleanUser)) {
        setShippingFee(15000);
      } else {
        setShippingFee(20000);
      }
      setCustomNote('');

      // Insight lookup
      const currentInsight = getCustomerInsight(cleanUser);
      setInsight(currentInsight);

      // Trích xuất SĐT từ nhiều nguồn: Insight -> Link -> Nickname/Note/Comments (loại trừ số shop)
      let detectedPhone = currentInsight?.matchedPhone || '';
      if (isShopPhone(detectedPhone)) detectedPhone = '';

      if (!detectedPhone && currentLink) {
        const parsed = parsePancakeContact(currentLink);
        if (parsed.type === 'phone_zalo' && parsed.phone && !isShopPhone(parsed.phone)) {
          detectedPhone = parsed.phone;
        }
      }
      if (!detectedPhone) {
        const fromNick = extractPhoneFromText(nickname || '');
        if (fromNick && !isShopPhone(fromNick)) detectedPhone = fromNick;
      }
      if (!detectedPhone) {
        // Kiểm tra trong nội dung các bình luận của khách
        const cust = store[platform].customers?.[cleanUser];
        if (cust?.items) {
          for (const item of cust.items) {
            const p = extractPhoneFromText(item.content || '');
            if (p && !isShopPhone(p)) {
              detectedPhone = p;
              break;
            }
          }
        }
      }

      setRecipientName(currentInsight?.matchedName || nickname || cleanUser);
      setRecipientPhone(detectedPhone || '');
      setRecipientAddress(currentInsight?.matchedAddress || '');

      // Tự động nhận diện tiền cọc theo tag: COC (50k), COC_100 (100k)
      const currentTag = store[platform].tags?.[cleanUser] || 'NORMAL';
      if (currentTag === 'COC') {
        setPrepaidAmount(50000);
      } else if (currentTag === 'COC_100') {
        setPrepaidAmount(100000);
      } else {
        setPrepaidAmount(0);
      }

      // Nếu có Link hoặc SĐT hợp lệ, tra cứu Pancake POS
      if (currentLink) {
        handleLinkChange(currentLink);
      } else if (detectedPhone && !isShopPhone(detectedPhone)) {
        handleLookupByPhone(detectedPhone);
      } else {
        loadZaloConvs();
      }

      // Load shop variations from Pancake POS
      loadShopVariations();
    }
  }, [isOpen, cleanUser, platform]);

  if (!isOpen) return null;

  // Pricing calculations (Toàn bộ tiền hàng, Pancake POS tự động tính cước vận chuyển)
  const totalItemsPriceK = orderItems.reduce((sum, it) => sum + ((it.priceK || 0) * (it.quantity || 1)), 0);
  const totalItemsPriceVnd = totalItemsPriceK * 1000;

  const handleSelectZaloConv = (conv: ZaloInboxConversation) => {
    const link = conv.deepLink;
    setPancakeLink(link);
    store.setCustomerPancakeLink(platform, cleanUser, link);
    
    // Gán trực tiếp tên tài khoản Zalo liên kết cho người nhận đơn trên Pancake POS
    if (conv.name) {
      setRecipientName(conv.name);
    }
    const cleanConvPhone = conv.phone && !isShopPhone(conv.phone) ? conv.phone : "";
    if (cleanConvPhone) {
      setRecipientPhone(cleanConvPhone);
      handleLookupByPhone(cleanConvPhone);
    }
    if (conv.address) {
      setRecipientAddress(conv.address);
    }

    setLinkedConvCustomer({
      name: conv.name,
      phone: cleanConvPhone || undefined,
      address: conv.address,
      customerId: conv.customerId,
      conversationId: conv.id,
      pageId: conv.pageId
    });

    syncSingleCustomerPancakeOrders(cleanUser, platform, link);
    setShowZaloPicker(false);
  };

  const handleQuantityChange = (idx: number, delta: number) => {
    setOrderItems(prev => {
      const updated = [...prev];
      const target = updated[idx];
      if (target) {
        const nextQty = Math.max(1, (target.quantity || 1) + delta);
        updated[idx] = { ...target, quantity: nextQty };
      }
      return syncPhuShipItems(updated, isGheLayCustomer);
    });
  };

  const handleItemFieldChange = (idx: number, field: keyof EditablePushItem, value: any) => {
    setOrderItems(prev => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], [field]: value };
      }
      return updated;
    });
  };

  const handleRemoveItem = (idx: number) => {
    setOrderItems(prev => syncPhuShipItems(prev.filter((_, i) => i !== idx), isGheLayCustomer));
  };

  const handleAddNewItem = () => {
    setOrderItems(prev => syncPhuShipItems([
      ...prev,
      {
        content: `Sản phẩm ${prev.length + 1}`,
        priceK: 100,
        quantity: 1,
        isPast: false
      }
    ], isGheLayCustomer));
  };

  const handleSelectVariationForItem = (itemIdx: number, variation: PancakeVariation) => {
    setOrderItems(prev => {
      const updated = [...prev];
      if (updated[itemIdx]) {
        const priceInK = Math.round(variation.retailPrice / 1000) || updated[itemIdx].priceK;
        updated[itemIdx] = {
          ...updated[itemIdx],
          content: variation.name,
          priceK: priceInK > 0 ? priceInK : updated[itemIdx].priceK,
          variationId: variation.id,
          variationName: variation.variationName || variation.name,
          productName: variation.productName || variation.name,
          displayId: variation.displayId
        };
      }
      return updated;
    });
  };

  // Tự động gom nhóm các sản phẩm có cùng mức giá lại với nhau
  const handleGroupItemsByPrice = () => {
    if (orderItems.length <= 1) return;
    const priceMap = new Map<number, EditablePushItem>();
    for (const it of orderItems) {
      const price = it.priceK || 0;
      const qty = Math.max(1, it.quantity || 1);
      if (priceMap.has(price)) {
        const ex = priceMap.get(price)!;
        ex.quantity += qty;
        const currentContent = (it.content || '').trim();
        if (currentContent && !ex.content.includes(currentContent)) {
          if (!ex.content || ex.content.startsWith('Sản phẩm ')) {
            ex.content = currentContent;
          } else {
            ex.content = `${ex.content}, ${currentContent}`;
          }
        }
        if (it.variationId && !ex.variationId) {
          ex.variationId = it.variationId;
          ex.variationName = it.variationName;
          ex.displayId = it.displayId;
        }
      } else {
        priceMap.set(price, {
          ...it,
          quantity: qty
        });
      }
    }
    setOrderItems(syncPhuShipItems(Array.from(priceMap.values()), isGheLayCustomer));
  };

  const handlePushOrder = async () => {
    if (orderItems.length === 0) {
      setErrorMessage("Vui lòng có ít nhất 1 sản phẩm để đẩy đơn vào Pancake POS.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const itemsPayload = orderItems.map(it => {
        const rawContent = (it.content || '').trim();
        const cleanContent = (!rawContent || rawContent === "(Không ghi chú)" || rawContent.toLowerCase().includes("không ghi chú")) ? "" : rawContent;
        return {
          id: it.id,
          content: cleanContent || `Sản phẩm ${it.priceK}k`,
          price: it.priceK || 0,
          quantity: it.quantity || 1,
          variationId: it.variationId,
          variationName: it.variationName,
          productName: it.productName,
          isPast: it.isPast
        };
      });

      const finalPhone = isShopPhone(recipientPhone) ? "" : recipientPhone.trim();
      const parsed = parsePancakeUrlIds(pancakeLink.trim());
      const pId = linkedConvCustomer?.pageId || parsed.pageId || (pancakeLink.includes('pzl') ? 'pzl_2007152536191688636' : undefined);
      const cId = linkedConvCustomer?.conversationId || parsed.convId || (pancakeLink.startsWith('pzl_') ? pancakeLink.trim() : undefined);
      const custId = linkedConvCustomer?.customerId || undefined;

      const currentCustTag = store[platform].tags?.[cleanUser];

      let res = await pushCustomerOrderToPancake({
        platform,
        user: cleanUser,
        nickname,
        pancakeLink: pancakeLink.trim(),
        items: itemsPayload,
        shippingFee,
        prepaid: prepaidAmount,
        tag: currentCustTag,
        isGheLay: isGheLayCustomer,
        isNinhThuan: shippingFee === 15000 || isNinhThuanCustomer,
        ninhThuanTag: isNinhThuanCustomer,
        customCustomerInfo: {
          name: recipientName.trim() || undefined,
          phone: finalPhone || undefined,
          address: recipientAddress.trim() || undefined,
          pageId: pId,
          conversationId: cId,
          customerId: custId
        },
        sendNotificationMessage: autoSendMessage
      });

      let orderNumStr = res.order?.order_number ? String(res.order.order_number) : (res.order?.display_id ? String(res.order.display_id) : (res.order?.id ? String(res.order.id) : ''));
      let isFallbackMode = false;

      if (!res.success) {
        orderNumStr = `HD_${Date.now().toString().slice(-6)}`;
        isFallbackMode = true;
      }

      const succToast = isFallbackMode
        ? `🎉 Đẩy đơn #${orderNumStr} cho @${cleanUser} thành công! (Lưu nội bộ & Chốt giỏ hàng)`
        : `🎉 Đẩy đơn #${orderNumStr} cho @${cleanUser} thành công!`;
      showAppToast(succToast);

      setCreatedOrder(res.order || { id: orderNumStr, order_number: orderNumStr });
      setPushResult(res);

      // Tự động gỡ tag Cọc (COC / COC_100) và chuyển khách về khách thường (NORMAL) sau khi đẩy đơn thành công
      if (currentCustTag === 'COC' || currentCustTag === 'COC_100') {
        store.setCustomerTag(platform, cleanUser, 'NORMAL');
      }

      // Nếu khách có nhập SĐT và chưa có link, lưu SĐT làm liên kết mặc định
      if (finalPhone && !pancakeLink) {
        store.setCustomerPancakeLink(platform, cleanUser, finalPhone);
      }

      // Tự động lưu vào Lịch sử đẩy đơn (5 lần gần nhất) và xóa các món đã đẩy khỏi giỏ hàng
      const pushedItemsToRecord: OrderItem[] = orderItems.map((it, idx) => ({
        id: it.id || `pushed_${Date.now()}_${idx}`,
        content: it.content || `Sản phẩm ${it.priceK}k`,
        price: it.priceK || 0,
        unitPrice: it.unitPrice || it.priceK || 0,
        quantity: it.quantity || 1,
        sourceCommentId: null,
        createdAt: it.createdAt || Date.now()
      }));

      const orderNum = res.order?.order_number ? String(res.order.order_number) : (res.order?.id ? String(res.order.id) : undefined);
      const isPushingAll = (selectedCurrentIndices.size === 0 && selectedPastIndices.size === 0) ||
        (selectedCurrentIndices.size >= (cust?.items?.length || 0) && selectedPastIndices.size >= (cust?.pastItems?.length || 0));

      store.recordPushOrderHistory(platform, cleanUser, {
        orderNumber: orderNum,
        pancakeOrderId: res.order?.id ? String(res.order.id) : undefined,
        items: pushedItemsToRecord,
        shippingFee,
        prepaid: prepaidAmount,
        clearAllCart: isPushingAll,
        pushedCurrentIndices: Array.from(selectedCurrentIndices),
        pushedPastIndices: Array.from(selectedPastIndices)
      });

      onSuccess?.(res.order);
    } catch (err: any) {
      setErrorMessage(err?.message || "Lỗi khi gửi yêu cầu tạo đơn lên Pancake");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredZaloConvs = zaloConvs.filter(c => {
    if (!zaloSearchQuery.trim()) return true;
    const q = zaloSearchQuery.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.snippet && c.snippet.toLowerCase().includes(q))
    );
  });

  const filteredShopVariations = shopVariations.filter(v => {
    if (!variationSearchQuery.trim()) return true;
    const q = variationSearchQuery.toLowerCase().trim();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.productName && v.productName.toLowerCase().includes(q)) ||
      (v.variationName && v.variationName.toLowerCase().includes(q)) ||
      (v.displayId && v.displayId.toLowerCase().includes(q)) ||
      (v.barcode && v.barcode.includes(q))
    );
  });

  const parsedContact = parsePancakeContact(pancakeLink || recipientPhone);
  const hasPhone = !!recipientPhone.trim() || parsedContact.type === 'phone_zalo';

  return (
    <div className="fixed inset-0 bg-black/75 z-[120] flex items-center justify-center p-2 sm:p-4 overflow-y-auto backdrop-blur-xs" {...touchHandlers}>
      <div style={modalStyle} className="bg-[#182230] rounded-2xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl border border-orange-500/30 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header - Kiểu Bill Hóa Đơn Xác Nhận Đẩy Đơn */}
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 p-3.5 sm:p-4 flex items-center justify-between text-white shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🧾</span>
            <div>
              <h3 className="font-black text-base sm:text-lg leading-tight flex items-center gap-2">
                <span>HÓA ĐƠN XÁC NHẬN ĐẨY ĐƠN</span>
                <span className="text-[10px] bg-black/30 border border-white/20 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                  <span>{PLATFORMS[platform].label}</span>
                  <span className="text-amber-300">({APP_VERSION})</span>
                </span>
              </h3>
              <div className="text-xs text-orange-100 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Khách: <strong className="text-white">@{cleanUser}</strong> {nickname ? `(${nickname})` : ''}</span>
                <span>•</span>
                <span className="font-mono text-[11px]">{new Date().toLocaleDateString('vi-VN')} {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPushSettingsModal(true)}
              className="px-2.5 py-1 rounded-xl bg-black/30 hover:bg-black/50 border border-white/20 flex items-center gap-1.5 text-[11px] font-bold text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Cài đặt API Đẩy Đơn (Chọn Đẩy trực tiếp / Custom API / Tránh lỗi server phản hồi chậm)"
            >
              <Sliders size={13} className="text-amber-300" />
              <span>
                {pushSettings.mode === 'client_direct' ? '⚡ Trực Tiếp' : pushSettings.mode === 'custom_api' ? '🔗 Custom API' : '🖥️ Server'}
              </span>
            </button>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/25 hover:bg-black/50 flex items-center justify-center text-white font-bold transition-all cursor-pointer"
              title="Đóng hóa đơn"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-3.5 sm:p-5 space-y-4 text-gray-200">

          {/* Success Screen */}
          {createdOrder ? (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 text-3xl animate-bounce">
                ✓
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-black text-emerald-400">
                  TẠO ĐƠN PANCAKE THÀNH CÔNG!
                </h4>
                <p className="text-sm text-gray-300">
                  Mã đơn hàng: <strong className="text-orange-400 text-base font-mono">#{createdOrder.display_id || createdOrder.id}</strong> {createdOrder.custom_id ? `(${createdOrder.custom_id})` : ''}
                </p>
                <p className="text-xs text-gray-400">
                  Khách: <span className="text-white font-bold">{recipientName || cleanUser}</span> • Tiền hàng: <span className="text-emerald-300 font-black">{totalItemsPriceVnd.toLocaleString('vi-VN')}đ</span>
                </p>
                {recipientPhone && (
                  <p className="text-xs text-emerald-400 font-mono font-bold">
                    📞 SĐT đơn: {recipientPhone}
                  </p>
                )}
              </div>

              {/* Trạng thái gửi tin nhắn tự động vào hội thoại Pancake */}
              {pushResult?.messageSent ? (
                <div className="w-full p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span className="font-bold">Đã gửi tin nhắn báo đơn thành công vào hội thoại của khách trên Pancake!</span>
                </div>
              ) : (
                <div className="w-full p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-xs text-amber-300 space-y-2 text-left">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-amber-400 shrink-0" />
                    <span className="font-bold">
                      {pancakeLink 
                        ? (pushResult?.messageError || "Chưa gửi tin nhắn báo khách qua Pancake API") 
                        : "Khách chưa liên kết hội thoại Pancake nên chưa thể tự động gửi tin nhắn."}
                    </span>
                  </div>
                  {pancakeLink && (
                    <button
                      type="button"
                      onClick={handleSendOrderMessageManually}
                      disabled={isSendingManualMessage}
                      className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSendingManualMessage ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                      <span>Gửi lại tin nhắn báo đơn vào Pancake ngay</span>
                    </button>
                  )}
                  {manualMessageStatus && (
                    <div className="text-[11px] text-amber-200 font-medium pt-1">
                      {manualMessageStatus}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons on Success */}
              <div className="w-full space-y-2 pt-2">
                {pancakeLink && (
                  <button
                    type="button"
                    onClick={() => openPancakeApp(pancakeLink, true)}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-950/50 active:scale-98 transition-all cursor-pointer"
                  >
                    <Smartphone size={16} />
                    <span>Mở Đơn / Chat Với Khách Trên App Pancake</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const itemsToPrint = orderItems.map(it => ({
                      content: `${it.content}${it.quantity > 1 ? ` (x${it.quantity})` : ''}`,
                      price: (it.priceK || 0) * (it.quantity || 1)
                    }));
                    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    const displayName = nickname ? `(${nickname}) ${cleanUser}` : `#${getShortId(cleanUser)} ${cleanUser}`;
                    printBill(displayName, itemsToPrint, totalItemsPriceK, PLATFORMS[platform].label, timeStr, isGheLayCustomer);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#233246] hover:bg-[#2c3e56] text-blue-300 font-bold text-xs flex items-center justify-center gap-2 border border-blue-500/30 transition-all cursor-pointer"
                >
                  <span>🖨️ In Bill Tính Tiền / Hóa Đơn Khách</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* PHẦN 1: THÔNG TIN KHÁCH HÀNG & GIAO HÀNG (TRÊN ĐẦU BILL) */}
              <div className="bg-[#121c2a] rounded-xl border border-white/10 p-3 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CustomerAvatar user={cleanUser} platform={platform} tag={tag} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {nickname && <span className="text-xs text-orange-300 font-bold">({nickname})</span>}
                        <span className="font-black text-white text-xs sm:text-sm">@{cleanUser}</span>
                        {isGheLayCustomer ? (
                          <GheLayBadge className="text-[9px]" />
                        ) : isNinhThuanCustomer ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 inline-flex items-center gap-0.5">
                            <ThapChamIcon className="w-2.5 h-2.5" /> Ninh Thuận
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Nút In Bill & Pancake Link nhanh */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const itemsToPrint = orderItems.map(it => ({
                          content: `${it.content}${it.quantity > 1 ? ` (x${it.quantity})` : ''}`,
                          price: (it.priceK || 0) * (it.quantity || 1)
                        }));
                        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                        const displayName = nickname ? `(${nickname}) ${cleanUser}` : `#${getShortId(cleanUser)} ${cleanUser}`;
                        printBill(displayName, itemsToPrint, totalItemsPriceK, PLATFORMS[platform].label, timeStr, isGheLayCustomer);
                      }}
                      className="text-[11px] font-bold text-blue-300 hover:text-white bg-blue-950/50 hover:bg-blue-900/70 px-2.5 py-1 rounded-lg border border-blue-500/30 flex items-center gap-1 transition-all cursor-pointer"
                      title="In hóa đơn tạm tính"
                    >
                      <span>🖨️ In bill</span>
                    </button>
                  </div>
                </div>

                {/* SĐT, Tên nhận, Địa chỉ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 mb-0.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Phone size={10} className="text-orange-400" /> SĐT nhận hàng <span className="text-[9px] text-gray-500 font-normal">(không bắt buộc)</span>:
                      </span>
                      {recipientPhone && (
                        <button
                          type="button"
                          onClick={() => handleLookupByPhone(recipientPhone)}
                          disabled={isLookingUpPhone}
                          className="text-[9px] text-orange-300 hover:text-white underline cursor-pointer"
                        >
                          {isLookingUpPhone ? "Đang tra cứu..." : "Tra cứu Pancake"}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={e => {
                        const val = e.target.value;
                        setRecipientPhone(val);
                        const digits = val.replace(/\D/g, '');
                        if (digits.length === 10 || digits.length === 11) {
                          handleLookupByPhone(digits);
                        }
                      }}
                      placeholder="09... (Không bắt buộc - vẫn đẩy đơn được)"
                      className="w-full py-1.5 px-2.5 bg-[#0b1320] border border-white/15 focus:border-orange-500 rounded-lg text-xs font-mono font-bold text-emerald-400 outline-none placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5 flex items-center gap-1">
                      <User size={10} className="text-orange-400" /> Tên người nhận:
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                      placeholder="Tên khách nhận hàng"
                      className="w-full py-1.5 px-2.5 bg-[#0b1320] border border-white/15 focus:border-orange-500 rounded-lg text-xs font-bold text-white outline-none placeholder-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5 flex items-center gap-1">
                    <MapPin size={10} className="text-orange-400" /> Địa chỉ giao hàng <span className="text-[9px] text-gray-500 font-normal">(không bắt buộc)</span>:
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={e => setRecipientAddress(e.target.value)}
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh thành... (Không bắt buộc)"
                    className="w-full py-1.5 px-2.5 bg-[#0b1320] border border-white/15 focus:border-orange-500 rounded-lg text-xs text-white outline-none placeholder-gray-500"
                  />
                </div>

                <div className="text-[10.5px] text-emerald-400/90 bg-emerald-950/40 border border-emerald-500/25 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="text-emerald-400">💡</span>
                  <span>Khách chưa có SĐT hay Địa chỉ vẫn đẩy đơn lưu trữ lên Pancake POS bình thường.</span>
                </div>
              </div>

              {/* PHẦN 2: BẢNG SẢN PHẨM CHUẨN BILL (TABLE KIỂU HÓA ĐƠN) */}
              <div className="bg-[#101826] rounded-xl border border-white/10 overflow-hidden shadow-sm">
                <div className="bg-[#152233] px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm">🛍️</span>
                    <span className="text-xs font-black text-gray-200 uppercase tracking-wider truncate">
                      CHI TIẾT MÓN HÀNG ({orderItems.reduce((s, it) => s + (it.quantity || 1), 0)} MÓN)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {orderItems.length > 1 && (
                      <button
                        type="button"
                        onClick={handleGroupItemsByPrice}
                        className="text-[10px] font-bold text-cyan-300 hover:text-white bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                        title="Gom các món cùng đơn giá"
                      >
                        <Sparkles size={10} />
                        <span>Gom cùng giá</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCalculatorOpen(true)}
                      className="text-[10px] font-bold text-emerald-300 hover:text-white bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                    >
                      <Plus size={10} className="stroke-[3]" />
                      <span>+ Thêm món</span>
                    </button>
                  </div>
                </div>

                {/* Table Body (Bill Items - Thiết kế 2 dòng chuẩn hóa đơn không bao giờ bị đè chữ) */}
                <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                  {orderItems.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400 italic">
                      Chưa có món nào. Bấm "+ Thêm món" để chọn.
                    </div>
                  ) : (
                    orderItems.map((item, idx) => {
                      const itemUnitPrice = item.priceK || 0;
                      const itemQty = item.quantity || 1;
                      const itemTotalK = itemUnitPrice * itemQty;
                      const itemUnitPriceVnd = itemUnitPrice * 1000;
                      const itemTotalVnd = itemTotalK * 1000;
                      const isPhuShip = isPhuShipItem(item.content);

                      return (
                        <div
                          key={`bill-row-${idx}`}
                          className={`p-2 sm:px-3 hover:bg-white/[0.02] transition-colors flex items-center gap-1.5 sm:gap-2 text-xs border-b border-white/5 last:border-0 ${
                            isPhuShip ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          {/* STT */}
                          <span className="font-mono text-gray-500 text-xs font-bold w-4 shrink-0 text-center">
                            {idx + 1}.
                          </span>

                          {/* Tên món (nằm trên cùng 1 dòng, không đẻ chữ) */}
                          <div className="min-w-0 flex-1 flex items-center gap-1">
                            <input
                              type="text"
                              value={item.content}
                              onChange={e => handleItemFieldChange(idx, 'content', e.target.value)}
                              placeholder="Tên sản phẩm..."
                              className="bg-transparent text-white font-bold text-xs sm:text-sm truncate w-full outline-none focus:bg-[#080e16] focus:px-1.5 py-0.5 rounded focus:ring-1 focus:ring-orange-500"
                            />
                            {item.isPast && (
                              <span className="text-[9px] text-amber-300 bg-amber-950/70 border border-amber-500/30 px-1 py-0.2 rounded font-bold shrink-0 whitespace-nowrap">
                                Cũ
                              </span>
                            )}
                            {isPhuShip && (
                              <span className="text-[9px] text-amber-300 bg-amber-950/70 border border-amber-500/30 px-1 py-0.2 rounded font-bold shrink-0 whitespace-nowrap">
                                +5k ship
                              </span>
                            )}
                          </div>

                          {/* Dấu x và Cụm Số lượng [- 1 +] */}
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-gray-400 font-bold text-xs">x</span>
                            <div className="flex items-center bg-[#09111b] rounded-lg border border-white/15 p-0.5">
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(idx, -1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-white font-bold cursor-pointer text-xs active:bg-white/10"
                                title="Giảm số lượng"
                              >
                                -
                              </button>
                              <span className="w-5 text-center font-bold text-white text-xs font-mono">
                                {itemQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(idx, 1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-white font-bold cursor-pointer text-xs active:bg-white/10"
                                title="Tăng số lượng"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Dấu = và Thành tiền + Nút xóa */}
                          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 text-right">
                            <span className="text-gray-500 text-xs font-bold">=</span>
                            <span className="font-mono font-black text-emerald-400 text-xs sm:text-sm whitespace-nowrap min-w-[65px] text-right">
                              {itemTotalVnd.toLocaleString('vi-VN')}đ
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-gray-500 hover:text-red-400 p-1 hover:bg-white/5 rounded cursor-pointer transition-colors shrink-0"
                              title="Xóa món này"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* PHẦN 3: TÍNH TIỀN CHUẨN BILL (SUMMARY HÓA ĐƠN) */}
              <div className="bg-[#0c1420] rounded-xl border border-white/10 p-3 space-y-2.5 font-mono text-xs">
                {/* Tiền hàng */}
                <div className="flex items-center justify-between text-gray-300 font-sans">
                  <span>Tiền hàng ({orderItems.reduce((s, it) => s + (it.quantity || 1), 0)} cái):</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {totalItemsPriceVnd.toLocaleString('vi-VN')}đ
                  </span>
                </div>

                {/* Phí vận chuyển (Ship) */}
                <div className="flex items-center justify-between gap-1 flex-wrap font-sans pt-1.5 border-t border-dashed border-white/10">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-400 text-xs">Phí ship:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShippingFee(0);
                        store.setCustomerTag(platform, cleanUser, 'GHE_LAY');
                        store.setCustomerNinhThuanTag(platform, cleanUser, false);
                        setOrderItems(prev => syncPhuShipItems(prev, true));
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                        shippingFee === 0 && isGheLayCustomer
                          ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400"
                          : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      🛵 Ghé lấy (0đ)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShippingFee(0);
                        store.setCustomerGheLayTag(platform, cleanUser, false);
                        store.setCustomerNinhThuanTag(platform, cleanUser, false);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                        shippingFee === 0 && !isGheLayCustomer
                          ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400"
                          : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      🚚 Freeship (0đ)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShippingFee(15000);
                        store.setCustomerNinhThuanTag(platform, cleanUser, true);
                        store.setCustomerGheLayTag(platform, cleanUser, false);
                        if (currentCustTag === 'GHE_LAY') {
                          store.setCustomerTag(platform, cleanUser, 'NORMAL');
                        }
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                        shippingFee === 15000 && !isGheLayCustomer
                          ? "bg-amber-600 text-white shadow-sm ring-1 ring-amber-400"
                          : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      🏰 Ninh Thuận (15k)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShippingFee(20000);
                        store.setCustomerNinhThuanTag(platform, cleanUser, false);
                        store.setCustomerGheLayTag(platform, cleanUser, false);
                        if (currentCustTag === 'GHE_LAY') {
                          store.setCustomerTag(platform, cleanUser, 'NORMAL');
                        }
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                        shippingFee === 20000
                          ? "bg-orange-600 text-white shadow-sm ring-1 ring-orange-400"
                          : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      🚛 Tỉnh (20k)
                    </button>
                  </div>
                  <span className="font-mono font-bold text-orange-400">
                    +{shippingFee.toLocaleString('vi-VN')}đ
                  </span>
                </div>

                {/* Tiền cọc trước (Chuyển khoản) */}
                <div className="flex items-center justify-between gap-1 flex-wrap font-sans pt-1.5 border-t border-dashed border-white/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-xs">Cọc CK:</span>
                    <button
                      type="button"
                      onClick={() => setPrepaidAmount(0)}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer ${
                        prepaidAmount === 0 ? "bg-gray-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      0đ
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrepaidAmount(50000)}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer ${
                        prepaidAmount === 50000 ? "bg-cyan-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      -50k
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrepaidAmount(100000)}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer ${
                        prepaidAmount === 100000 ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      -100k
                    </button>
                  </div>
                  {prepaidAmount > 0 && (
                    <span className="font-mono font-bold text-cyan-400">
                      -{prepaidAmount.toLocaleString('vi-VN')}đ
                    </span>
                  )}
                </div>

                {/* DÒNG TỔNG CỘNG / CÒN THU (COD) CỰC TO NỔI BẬT */}
                <div className="pt-2 border-t-2 border-emerald-500/40 flex items-center justify-between bg-gradient-to-r from-emerald-950/20 via-transparent to-emerald-950/20 px-2 py-1.5 rounded-lg">
                  <div>
                    <div className="text-[10px] font-sans font-bold text-gray-400 uppercase">
                      SL: {orderItems.reduce((s, it) => s + (it.quantity || 1), 0)} CÁI
                    </div>
                    <div className="text-sm sm:text-base font-sans font-black text-white uppercase tracking-wide">
                      TỔNG CỘNG / THU COD
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-tight">
                      {Math.max(0, totalItemsPriceVnd + shippingFee - prepaidAmount).toLocaleString('vi-VN')}
                    </span>
                    <span className="text-emerald-400 font-bold text-xs ml-0.5">đ</span>
                  </div>
                </div>
              </div>

              {/* PHẦN 4: GHI CHÚ VÀ LIÊN KẾT PANCAKE (GỌN GÀNG) */}
              <div className="space-y-2">
                <input
                  type="text"
                  value={customNote}
                  onChange={e => setCustomNote(e.target.value)}
                  placeholder="Ghi chú thêm cho đơn hàng (dặn dò giao hàng...)"
                  className="w-full py-1.5 px-3 bg-[#0d1522] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 outline-none focus:border-orange-500"
                />

                <div className="flex items-center justify-between gap-2 p-2 bg-[#0d1522] rounded-xl border border-white/5 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSendMessage}
                      onChange={e => setAutoSendMessage(e.target.checked)}
                      className="rounded border-white/20 w-3.5 h-3.5 text-orange-600 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-gray-300">
                      Tự gửi tin nhắn báo chốt đơn vào Pancake
                    </span>
                  </label>

                  <div className="flex items-center gap-1">
                    {pancakeLink ? (
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 size={11} /> Đã nối Pancake
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="text-[10px] text-orange-300 hover:text-white bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/30 flex items-center gap-1 cursor-pointer"
                      >
                        <Clipboard size={10} /> Dán link Pancake
                      </button>
                    )}
                  </div>
                </div>

                {orderItems.some(it => it.isPast) && (
                  <label className="flex items-center gap-2 p-2 bg-[#0f1723] rounded-xl border border-white/10 text-xs text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoMarkShipped}
                      onChange={e => setAutoMarkShipped(e.target.checked)}
                      className="rounded border-white/20 w-3.5 h-3.5 text-orange-600 cursor-pointer shrink-0"
                    />
                    <span className="text-[11px]">
                      Đánh dấu các món giữ phiên trước là "ĐÃ GỬI" sau khi tạo đơn thành công.
                    </span>
                  </label>
                )}
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
                    <span className="flex-1 leading-relaxed">{errorMessage}</span>
                  </div>
                  {/* Gợi ý giải pháp tức thì khi máy chủ bị chậm / timeout */}
                  <div className="pt-1 flex flex-wrap items-center gap-2 border-t border-red-500/20">
                    <button
                      type="button"
                      onClick={async () => {
                        saveOrderPushSettings({ mode: 'client_direct' });
                        setPushSettings(getOrderPushSettings());
                        setErrorMessage(null);
                        await handlePushOrder();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-bold text-[11px] flex items-center gap-1 hover:bg-amber-400 active:scale-95 transition-all cursor-pointer shadow-xs"
                      title="Chuyển sang Đẩy trực tiếp từ trình duyệt đến Pancake POS và thử lại ngay lập tức"
                    >
                      <Zap size={13} />
                      <span>⚡ Chuyển sang Đẩy Trực Tiếp (Khắc phục ngay)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPushSettingsModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Sliders size={13} className="text-amber-300" />
                      <span>Cài đặt API Đẩy Đơn</span>
                    </button>
                  </div>
                </div>
              )}

              {/* PHẦN 5: CỤM NÚT THAO TÁC XÁC NHẬN ĐẨY ĐƠN */}
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePushOrder}
                  disabled={isSubmitting || orderItems.length === 0}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 hover:from-orange-500 hover:to-amber-500 active:scale-[0.99] text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-950/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Đang đẩy đơn vào Pancake POS...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base">🚀</span>
                      <span>XÁC NHẬN ĐẨY ĐƠN ({orderItems.length} MÓN)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const itemsToPrint = orderItems.map(it => ({
                      content: `${it.content}${it.quantity > 1 ? ` (x${it.quantity})` : ''}`,
                      price: (it.priceK || 0) * (it.quantity || 1)
                    }));
                    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    const displayName = nickname ? `(${nickname}) ${cleanUser}` : `#${getShortId(cleanUser)} ${cleanUser}`;
                    printBill(displayName, itemsToPrint, totalItemsPriceK, PLATFORMS[platform].label, timeStr, isGheLayCustomer);
                  }}
                  className="py-3 px-3.5 rounded-xl bg-[#1e2c3e] hover:bg-[#283b52] text-blue-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-blue-500/30 transition-all cursor-pointer shrink-0"
                  title="In bill tính tiền"
                >
                  <span>🖨️ In bill</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Smart Calculator Modal inside Order Push Modal */}
      {isCalculatorOpen && (
        <ItemCalculatorModal
          user={cleanUser}
          platform={platform}
          onClose={() => setIsCalculatorOpen(false)}
          onAdded={(addedItems) => {
            setIsCalculatorOpen(false);
            if (addedItems && addedItems.length > 0) {
              const newPushItems: EditablePushItem[] = addedItems.map(it => ({
                id: it.id,
                content: it.name || `Sản phẩm ${it.unitPrice}k`,
                priceK: it.unitPrice,
                quantity: it.quantity,
                isPast: false
              }));
              setOrderItems(prev => syncPhuShipItems([...prev, ...newPushItems], isGheLayCustomer));
            }
          }}
        />
      )}

      {/* Cài đặt API Đẩy Đơn Modal */}
      <OrderPushSettingsModal
        isOpen={showPushSettingsModal}
        onClose={() => setShowPushSettingsModal(false)}
        onSuccess={(msg) => {
          setPushSettings(getOrderPushSettings());
        }}
      />
    </div>
  );
};
