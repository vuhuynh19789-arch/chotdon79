# 📱 HƯỚNG DẪN CHI TIẾT: CÁC THAY ĐỔI, ĐỒNG BỘ GITHUB & BIÊN DỊCH THÀNH APP ANDROID (APK)

> Tài liệu này được tạo riêng cho hệ thống **Chốt Đơn Live** (Hiền Phạm Shop). Cung cấp toàn bộ thông tin về các thay đổi vừa thực hiện, cách đẩy mã nguồn lên GitHub và quy trình đóng gói/biên dịch ngược thành file APK để cài đặt trực tiếp lên điện thoại hoặc máy tính bảng Android.

---

## 📌 PHẦN 1: TỔNG HỢP CÁC THAY ĐỔI VỪA THỰC HIỆN

### 1.1. Lấy bình luận trực tiếp từ Pancake vào ô Chat Chốt Đơn
- **Mục đích**: Thay vì phải mở thêm trình duyệt để chạy Facebook cào riêng hoặc cài đặt các Extension phụ thuộc rườm rà, phần mềm hiện tại đã tích hợp cơ chế **tự động quét và kéo bình luận trực tiếp từ Fanpage Pancake (Hiền Phạm Shop)** theo thời gian thực (chu kỳ quét 2-3 giây/lần).
- **Kết quả**: Bình luận xuất hiện ngay lập tức trong ô chat Chốt Đơn chính, tự động nhận diện giá tiền, tự động liên kết số điện thoại khách hàng và sẵn sàng bấm **IN** ngay.

### 1.2. Đã gỡ bỏ 3 thành phần theo yêu cầu (khoanh tròn xanh trong ảnh)
1. **Nút `🥞 Live (bình luận)` trên thanh công cụ Feed**: Đã xóa bỏ, trả lại giao diện thanh công cụ gọn gàng, hiển thị số lượng bình luận tự nhiên (`💬 X bình luận`).
2. **Nút màu cam `POS` trên từng dòng bình luận**: Đã gỡ bỏ khỏi dòng bình luận. Trên mỗi dòng bình luận hiện tại chỉ giữ lại 2 nút cần thiết nhất:
   - Nút **`🥞 Gán / Zalo`**: Bấm mở chat Zalo hoặc gán khách đang inbox.
   - Nút **`IN`**: Nút vuông to, trực quan, hỗ trợ đếm số lần đã in.
3. **Khối các nút giá nhanh `In giá: +71k +82k +71*2k +99k...`**: Đã xóa bỏ hoàn toàn khỏi dưới dòng bình luận để tránh làm rối mắt và chiếm diện tích màn hình.

### 1.3. Cơ chế và Giải pháp về Avatar (Ảnh đại diện khách hàng)
- **Nguyên nhân vì sao trước đây không hiện ảnh đại diện Facebook**:
  - Facebook sử dụng cơ chế bảo mật nghiêm ngặt đối với Graph API: Các tài khoản bình luận trên Fanpage đều bị mã hóa thành **Page-Scoped ID (PSID)**.
  - Khi ứng dụng gọi đường dẫn `https://graph.facebook.com/{ID}/picture` mà không có mã xác thực **Meta Token (EAAB/EAAG)**, Facebook sẽ trả về mã lỗi **HTTP 400 (OAuthException - (#3) Application does not have capability)**.
  - Do đó hệ thống trước đây phải hiển thị avatar chữ cái viết tắt (ví dụ: `CH`, `HU`) để không làm hỏng giao diện.
- **Các tối ưu đã thực hiện**:
  - `server.ts`: Tự động nhận diện nếu có token Meta EAAB/EAAG để gọi Graph API có bản quyền; đồng thời tự động lưu trữ ảnh đại diện từ cache chi tiết khách hàng của Pancake POS.
  - `src/components/UserAvatar.tsx`: Bổ sung cơ chế **đối soát chéo thông minh (Cross-Platform Matching)**. Nếu một khách hàng đã từng comment trên TikTok hoặc Zalo có ảnh đại diện, khi khách đó comment trên Facebook bằng cùng tên thì ảnh đại diện sẽ tự động được hiển thị cho Facebook!
  - Bổ sung bộ nhớ đệm `IndexedDB + Memory Cache`: Giữ ảnh đại diện luôn hiển thị 0ms, không bị chớp giật hay tải lại khi cuộn danh sách.

### 1.4. Danh sách các file code đã được cập nhật
- `server.ts`: Nâng cấp endpoint `/api/pancake/pages/:pageId/live-comments` tự động kéo bình luận Live không cần postId thủ công, tối ưu lấy avatar & thông tin khách.
- `src/components/Feed.tsx`: Loại bỏ 3 thành phần đã đánh dấu (nút POS, nút Live toolbar, khối chip giá nhanh), giữ giao diện sạch đẹp tối đa.
- `src/components/UserAvatar.tsx`: Nâng cấp cơ chế nhận diện avatar chéo nền tảng và tránh lỗi 400.
- `src/lib/pancakeLiveClient.ts`: Tự động phát hiện phiên Live, đẩy bình luận Pancake thẳng vào store Chốt Đơn.

---

## 🚀 PHẦN 2: HƯỚNG DẪN ĐỒNG BỘ MÃ NGUỒN VỚI GITHUB

Sau khi tải mã nguồn về máy tính hoặc mở terminal trên máy tính của bạn, hãy làm theo các bước sau để đồng bộ lên GitHub:

### Trường hợp A: Dự án trên máy bạn ĐÃ ĐƯỢC kết nối với GitHub trước đó

1. Mở Terminal (Command Prompt hoặc PowerShell trên Windows, Terminal trên macOS/Linux) tại thư mục dự án.
2. Kiểm tra các file đã thay đổi:
   ```bash
   git status
   ```
3. Thêm tất cả các file đã cập nhật vào danh sách commit:
   ```bash
   git add .
   ```
4. Tạo commit với nội dung mô tả rõ ràng:
   ```bash
   git commit -m "feat: cap nhat chot don pancake, don dep nut giao dien, toi uu avatar va huong dan apk"
   ```
5. Đẩy mã nguồn lên nhánh chính của GitHub:
   ```bash
   git push origin main
   ```
   *(Nếu kho lưu trữ của bạn dùng nhánh `master`, thay `main` bằng `master`: `git push origin master`)*

---

### Trường hợp B: Khởi tạo mới từ đầu và đẩy lên kho GitHub mới

Nếu bạn vừa tạo một Repository mới trên GitHub (ví dụ: `https://github.com/username/chotdon-live.git`):

```bash
# 1. Khởi tạo Git
git init

# 2. Thêm tất cả mã nguồn
git add .

# 3. Tạo commit đầu tiên
git commit -m "feat: Phien ban Chot Don Live tich hop Pancake, Tiktok, Zalo va may in"

# 4. Đổi tên nhánh mặc định thành main
git branch -M main

# 5. Liên kết với kho GitHub của bạn (thay bằng URL GitHub thật của bạn)
git remote add origin https://github.com/TÊN_TÀI_KHOẢN/TÊN_KHO_REPO.git

# 6. Đẩy mã nguồn lên
git push -u origin main
```

> **💡 Mẹo xử lý khi bị báo lỗi `rejected (fetch first)` hoặc xung đột:**
> Nếu GitHub báo lỗi do trên GitHub đã có file README trước, bạn chạy lệnh sau để gộp:
> ```bash
> git pull --rebase origin main
> git push origin main
> ```

---

## 📦 PHẦN 3: HƯỚNG DẪN BIÊN DỊCH THÀNH APP ANDROID (APK)

Có **3 phương pháp** để tạo file APK từ dự án này. Bạn hãy chọn phương pháp phù hợp nhất với điều kiện máy tính của mình.

---

### ⭐ CÁCH 1: Dùng Capacitor (Khuyên dùng - Chuẩn nhất cho React/Vite)

Capacitor là công cụ chính thức của Ionic, giúp biến bất kỳ dự án React + Vite nào thành ứng dụng Android native mượt mà, hỗ trợ đầy đủ Bluetooth máy in và thông báo.

#### Bước 1: Cài đặt công cụ chuẩn bị trên máy tính
- **Node.js**: Phiên bản 18, 20 hoặc 22.
- **Android Studio**: Tải miễn phí từ [developer.android.com/studio](https://developer.android.com/studio). Khi cài đặt Android Studio, tích chọn cài **Android SDK**, **Android SDK Command-line Tools** và **Android Build-Tools**.
- **Java JDK**: JDK 17 hoặc JDK 21 (Android Studio đã tích hợp sẵn).

#### Bước 2: Cài đặt thư viện Capacitor vào dự án
Mở terminal tại thư mục dự án và chạy:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

#### Bước 3: Khởi tạo cấu hình Capacitor
Chạy lệnh khởi tạo:
```bash
npx cap init "Chot Don Live" "com.hienpham.chotdon" --web-dir=dist
```
File `capacitor.config.ts` sẽ được tạo ra với nội dung chuẩn như sau:
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hienpham.chotdon',
  appName: 'Chốt Đơn Live',
  webDir: 'dist',
  server: {
    // Cho phép gọi HTTP nội bộ nếu máy in hoặc backend chạy HTTP thường
    cleartext: true,
    androidScheme: 'https'
  }
};

export default config;
```

#### Bước 4: Biên dịch mã nguồn Web (Vite Build)
```bash
npm run build
```
Lệnh này sẽ tạo ra thư mục `dist/` chứa toàn bộ giao diện đã được tối ưu hóa.

#### Bước 5: Thêm nền tảng Android & Đồng bộ
```bash
npx cap add android
npx cap sync
```

#### Bước 6: Cấu hình quyền Android (AndroidManifest.xml)
Mở file `android/app/src/main/AndroidManifest.xml`, thêm các quyền mạng và máy in:
```xml
    <!-- Cho phép truy cập mạng Internet và LAN -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    
    <!-- Cho phép kết nối máy in Bluetooth / LAN -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
```
Và trong thẻ `<application ...>`, đảm bảo có thuộc tính:
```xml
android:usesCleartextTraffic="true"
```

#### Bước 7: Xuất file APK

**Cách A - Xuất file APK nhanh qua dòng lệnh (Không cần mở giao diện nặng):**
```bash
cd android
./gradlew assembleDebug
```
*(Trên Windows dùng: `gradlew.bat assembleDebug`)*

File APK sau khi build xong sẽ nằm ở đường dẫn:
```
android/app/build/outputs/apk/debug/app-debug.apk
```
👉 Bạn chỉ cần copy file `app-debug.apk` này vào điện thoại Android qua Zalo/Telegram hoặc cáp USB và bấm Cài đặt là xong!

**Cách B - Mở bằng Android Studio để xuất file APK Release (có chữ ký):**
```bash
npx cap open android
```
- Trong Android Studio, chờ thanh tiến trình Gradle hoàn tất (khoảng 1-2 phút lần đầu).
- Vào menu: **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)**.
- Khi xong, Android Studio sẽ hiện thông báo ở góc dưới bên phải kèm nút **locate** để mở thư mục chứa file APK.

---

### 🌐 CÁCH 2: Dùng PWABuilder / Bubblewrap (Siêu nhanh - Không cần Android Studio)

Vì dự án đã được tích hợp sẵn chuẩn **PWA (Progressive Web App)** với service worker và manifest:

1. Triển khai website của bạn lên một tên miền (Vercel, Render, VPS hoặc tên miền riêng của shop).
2. Truy cập trang web: **[https://www.pwabuilder.com/](https://www.pwabuilder.com/)**
3. Dán đường dẫn URL trang web vào ô tìm kiếm và bấm **Start**.
4. Chọn **Android** ➔ Bấm **Generate Package**.
5. Tải file `.apk` về và cài đặt trực tiếp lên điện thoại Android!

---

### 🔧 CÁCH 3: Biên dịch ngược (Reverse Compile / Decompile & Recompile) nếu đã có file APK cũ

Nếu trước đây bạn đã có 1 file APK cũ cài trên máy và muốn cập nhật mã nguồn mới vào:

1. **Giải nén file APK cũ bằng công cụ `apktool`**:
   ```bash
   apktool d app_cu.apk -o thu_muc_app
   ```
2. **Build mã nguồn Web mới**:
   ```bash
   npm run build
   ```
3. **Thay thế file**:
   Copy toàn bộ nội dung trong thư mục `dist/` vào thư mục assets của APK:
   ```bash
   cp -r dist/* thu_muc_app/assets/public/
   ```
4. **Đóng gói lại thành file APK mới**:
   ```bash
   apktool b thu_muc_app -o app_moi_chua_ky.apk
   ```
5. **Ký file APK bằng keystore debug** (để Android cho phép cài đặt):
   ```bash
   # Tạo key ký nếu chưa có
   keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

   # Ký file APK
   jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore my-release-key.keystore app_moi_chua_ky.apk my-key-alias

   # Căn chỉnh kích thước file
   zipalign -v 4 app_moi_chua_ky.apk ChotDonLive_Moi.apk
   ```

---

## 🛠️ PHẦN 4: CÁC LỖI THƯỜNG GẶP KHI BUILD APK VÀ CÁCH XỬ LÝ

| Lỗi gặp phải | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| **`ERR_CLEARTEXT_NOT_PERMITTED`** | Android 9+ mặc định chặn kết nối HTTP không có SSL | Thêm `android:usesCleartextTraffic="true"` vào thẻ `<application>` trong file `AndroidManifest.xml`. |
| **`JAVA_HOME is not set`** | Máy tính chưa cài đặt biến môi trường Java | Trong Android Studio, vào Settings ➔ Build, Execution, Deployment ➔ Build Tools ➔ Gradle ➔ Chọn **Gradle JDK** là `jbr-17` có sẵn của Android Studio. |
| **Máy in không in được khi chạy APK** | Chưa cấp quyền Bluetooth hoặc Wifi LAN trên Android | Mở Cài đặt điện thoại ➔ Ứng dụng ➔ Chốt Đơn Live ➔ Quyền ➔ Bật quyền **Thiết bị ở gần (Nearby devices)** và **Vị trí (Location)**. |
| **Màn hình trắng khi mở app APK** | Đường dẫn assets trong `index.html` là đường dẫn tuyệt đối `/` | Vite đã cấu hình `base: './'`, đảm bảo chạy `npm run build` trước khi chạy `npx cap sync`. |

---

*Tài liệu được cập nhật tự động - Phiên bản đồng bộ hệ thống Chốt Đơn Live.*
