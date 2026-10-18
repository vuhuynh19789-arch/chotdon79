// Utility for ESC/POS LAN Printing with Xprinter K80 (Port 9100)
import { ref, push, set } from 'firebase/database';
import { firebaseDb } from './core';

export interface PrinterConfig {
  printerMode: 'lan' | 'rawbt' | 'browser';
  printerIp: string;
  printerPort: number;
  autoCut: boolean;
  autoPrintOnOrder: boolean;
  tvBoxUrl: string;
}

const STORAGE_KEY = 'lan_printer_config';

export function getPrinterConfig(): PrinterConfig {
  const defaults: PrinterConfig = {
    printerMode: 'rawbt',
    printerIp: '192.168.1.198',
    printerPort: 9100,
    autoCut: true,
    autoPrintOnOrder: false,
    tvBoxUrl: 'https://caotiktok.home79.cloud'
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch (e) {}

  return defaults;
}

export function savePrinterConfig(cfg: Partial<PrinterConfig>): PrinterConfig {
  const current = getPrinterConfig();
  const updated = { ...current, ...cfg };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
}

/**
 * Converts an HTML5 Canvas into raw ESC/POS GS v 0 raster image bytes.
 * Width is scaled to 576 dots (standard 80mm thermal paper @ 203dpi).
 */
export function canvasToEscPos(canvas: HTMLCanvasElement, autoCut: boolean = true): Uint8Array {
  const targetWidth = 576; // 576 dots / 8 = 72 bytes per row
  const scale = targetWidth / canvas.width;
  const targetHeight = Math.max(1, Math.round(canvas.height * scale));

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = targetWidth;
  scaledCanvas.height = targetHeight;
  const ctx = scaledCanvas.getContext('2d');
  if (!ctx) return new Uint8Array(0);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imgData.data;

  const widthBytes = 72;
  const totalImageBytes = widthBytes * targetHeight;
  const rasterData = new Uint8Array(totalImageBytes);

  let byteIdx = 0;
  for (let y = 0; y < targetHeight; y++) {
    for (let bx = 0; bx < widthBytes; bx++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < targetWidth) {
          const idx = (y * targetWidth + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const a = pixels[idx + 3];
          // Standard luminance threshold
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
          if (a > 128 && brightness < 185) {
            byteVal |= (1 << (7 - bit));
          }
        }
      }
      rasterData[byteIdx++] = byteVal;
    }
  }

  // ESC/POS Commands
  const header = [
    0x1B, 0x40,             // ESC @ (Initialize printer)
    0x1B, 0x61, 0x01,       // ESC a 1 (Align Center)
    0x1D, 0x76, 0x30, 0x00, // GS v 0 0 (Raster image command)
    widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
    targetHeight & 0xFF, (targetHeight >> 8) & 0xFF
  ];

  const footer = [
    0x1B, 0x64, 0x04        // ESC d 4 (Feed 4 lines)
  ];

  if (autoCut) {
    footer.push(0x1D, 0x56, 0x41, 0x10); // GS V 65 16 (Feed and cut)
  }

  const combined = new Uint8Array(header.length + rasterData.length + footer.length);
  combined.set(header, 0);
  combined.set(rasterData, header.length);
  combined.set(footer, header.length + rasterData.length);

  return combined;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Dispatches a print job to the LAN Printer via TV Box (Port 9100) or Firebase queue.
 */
export async function dispatchLanPrint(escposBase64: string, customConfig?: Partial<PrinterConfig>): Promise<{ success: boolean; message: string; error?: string }> {
  const cfg = { ...getPrinterConfig(), ...customConfig };
  const targetIp = (cfg.printerIp || '192.168.1.198').trim();
  const targetPort = Number(cfg.printerPort) || 9100;
  const tvBoxUrl = (cfg.tvBoxUrl || 'https://caotiktok.home79.cloud').replace(/\/+$/, '');

  // 1. Send via TV Box HTTP API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${tvBoxUrl}/api/print/lan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerIp: targetIp,
        port: targetPort,
        escposBase64: escposBase64,
        cutPaper: cfg.autoCut
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(`Máy chủ TV Box trả về dữ liệu không hợp lệ: ${rawText.slice(0, 100)}`);
    }

    if (res.ok && json.success) {
      return { success: true, message: json.message || 'In thành công!' };
    } else {
      return { success: false, message: json.message || json.error || 'Máy in không phản hồi', error: json.message || json.error };
    }
  } catch (err: any) {
    // 2. Fallback: Push to Firebase RTDB queue if direct HTTP fails
    try {
      const queueRef = ref(firebaseDb, 'rooms/hienpham_live/lan_print_queue');
      const newJob = push(queueRef);
      await set(newJob, {
        rawBase64: escposBase64,
        ip: targetIp,
        port: targetPort,
        timestamp: Date.now()
      });
      return { success: true, message: 'Đã gửi lệnh in qua đám mây Firebase tới TV Box!' };
    } catch (fbErr: any) {
      return { success: false, message: `Lỗi kết nối: ${err.message || err}`, error: err.message };
    }
  }
}
