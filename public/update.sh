#!/bin/bash
# =========================================================
# SCRIPT TỰ ĐỘNG CÀI ĐẶT & CẬP NHẬT MÁY CHỦ CÀO TIKTOK LIVE
# Dành cho TV Box Armbian Linux (TX3 Mini, H96, Tanix, X96...)
# =========================================================

set -e

DIR="$HOME/tiktok-live-server"
echo "========================================================="
echo "   🚀 BẮT ĐẦU CẬP NHẬT MÁY CHỦ TIKTOK LIVE (ARMBIAN)"
echo "========================================================="
echo "Thư mục làm việc: $DIR"
mkdir -p "$DIR"
cd "$DIR"

echo "-> [1/4] Đang tải mã nguồn server mới nhất..."
curl -fsSL https://inlivess.vercel.app/armbian-server.cjs -o armbian-server.cjs || \
curl -fsSL https://raw.githubusercontent.com/haingontayux-cloud/tiktok-live-print/main/public/armbian-server.cjs -o armbian-server.cjs

if [ ! -f "armbian-server.cjs" ] || [ ! -s "armbian-server.cjs" ]; then
  echo "❌ Lỗi: Không thể tải file armbian-server.cjs! Vui lòng kiểm tra kết nối mạng."
  exit 1
fi

echo "-> [2/4] Kiểm tra các gói thư viện Node.js..."
if [ ! -f "package.json" ]; then
  npm init -y > /dev/null 2>&1
fi

npm install express tiktok-live-connector --silent

echo "-> [3/4] Kiểm tra tiến trình PM2..."
if ! command -v pm2 &> /dev/null; then
  echo "Cài đặt PM2 để chạy ngầm 24/7..."
  npm install -g pm2
fi

echo "-> [4/4] Khởi động lại dịch vụ cào TikTok với bộ giáp chống sập 24/7..."
pm2 delete tiktok-server > /dev/null 2>&1 || true
pm2 start armbian-server.cjs --name tiktok-server --max-memory-restart 250M --exp-backoff-restart-delay=100 --time --node-args="--max-old-space-size=256"
pm2 save > /dev/null 2>&1 || true

# Lấy địa chỉ IP mạng nội bộ
IP_LAN=$(hostname -I 2>/dev/null | awk '{print $1}')

echo "========================================================="
echo "   ✅ CẬP NHẬT VÀ KHỞI ĐỘNG THÀNH CÔNG!"
echo "========================================================="
echo " • Trạng thái: Đang chạy ngầm 24/7 với PM2"
echo " • Địa chỉ Dashboard nội bộ: http://${IP_LAN:-127.0.0.1}:3000"
echo " • Địa chỉ Cloudflare Tunnel: https://caotiktok.home79.cloud"
echo " • Tự động khởi động cùng TV Box: Đã bật"
echo "========================================================="
