import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Layers,
  HelpCircle,
  Laptop,
  Smartphone,
  Flame,
  ArrowRight,
  Info,
  KeyRound,
  Loader2,
  Building2,
  UserCheck
} from 'lucide-react';
import { testFacebookToken } from '../lib/facebookLiveClient';

interface PancakeTokenGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToken?: (token: string) => void;
  initialTarget?: string;
}

export const PancakeTokenGuideModal: React.FC<PancakeTokenGuideModalProps> = ({
  isOpen,
  onClose,
  onApplyToken,
  initialTarget = ''
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'f12' | 'why'>('settings');
  const [testInput, setTestInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleCopyPancakeUrl = () => {
    navigator.clipboard.writeText('https://pages.fm');
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCheckToken = async () => {
    if (!testInput.trim()) {
      setTestResult({ success: false, message: 'Vui lòng dán mã Token trước khi kiểm tra.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const res = await testFacebookToken(initialTarget, testInput.trim());
    setTestResult(res);
    setIsTesting(false);
  };

  const handleApply = () => {
    if (!testInput.trim()) return;
    if (onApplyToken) {
      onApplyToken(testInput.trim());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0f1724] border border-blue-500/30 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-start justify-between bg-gradient-to-r from-blue-950/60 via-[#132238] to-[#0f1724]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-600/30 shrink-0 mt-0.5">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-extrabold text-white">
                  Lấy Business Token từ Pancake (pages.fm)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Flame size={10} className="text-amber-400" /> Khuyên dùng
                </span>
              </div>
              <p className="text-xs text-blue-200/80 mt-1 leading-relaxed">
                Hiển thị chính xác <strong className="text-white">Tên thương hiệu Fanpage</strong> và <strong className="text-white">Tên thật khách hàng</strong>, khắc phục 100% lỗi <span className="text-red-300 font-mono font-bold">#200 Missing Permissions</span>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0 cursor-pointer ml-2"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-[#0b111c] px-3 pt-2 gap-1 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#152132] text-blue-400 border-t-2 border-blue-500 font-extrabold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Smartphone size={14} />
            <span>Cách 1: Trong Cài đặt Pancake</span>
          </button>
          <button
            onClick={() => setActiveTab('f12')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'f12'
                ? 'bg-[#152132] text-blue-400 border-t-2 border-blue-500 font-extrabold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Laptop size={14} />
            <span>Cách 2: Lấy Token EAAB (F12)</span>
          </button>
          <button
            onClick={() => setActiveTab('why')}
            className={`px-3.5 py-2.5 rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'why'
                ? 'bg-[#152132] text-blue-400 border-t-2 border-blue-500 font-extrabold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <HelpCircle size={14} />
            <span>Tại sao nên dùng Pancake?</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs text-gray-200 leading-relaxed flex-1">
          {activeTab === 'settings' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Quick info alert */}
              <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-start gap-2.5 text-blue-200">
                <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Page Access Token từ Pancake:</strong> Đây là mã xác thực chính thức được cấp riêng cho Fanpage của bạn. Token này <strong>không bao giờ hết hạn</strong> (trừ khi bạn chủ động ấn tạo lại) và mang trọn vẹn danh nghĩa của Fanpage.
                </div>
              </div>

              {/* Step 1 */}
              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">1</span>
                  <span>Đăng nhập vào hệ thống Pancake</span>
                </div>
                <p className="text-gray-300 pl-7">
                  Truy cập địa chỉ trang web quản lý bán hàng của Pancake:
                </p>
                <div className="pl-7 flex items-center gap-2 flex-wrap">
                  <a
                    href="https://pages.fm"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span>Mở pages.fm</span>
                    <ExternalLink size={12} />
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyPancakeUrl}
                    className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 rounded-lg inline-flex items-center gap-1 transition-colors"
                  >
                    {copiedLink ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedLink ? 'Đã chép link' : 'Sao chép link'}</span>
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">2</span>
                  <span>Chọn đúng Fanpage Live (vd: Phạm Ngọc Hiền Shop)</span>
                </div>
                <p className="text-gray-300 pl-7">
                  Ở góc trái hoặc danh sách trang quản lý, bấm chọn đúng trang Facebook mà bạn dùng để phát sóng trực tiếp.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">3</span>
                  <span>Vào mục Cài đặt ➔ Công cụ / API</span>
                </div>
                <div className="pl-7 space-y-2 text-gray-300">
                  <p>
                    • Nhấp vào biểu tượng <strong>Cài đặt</strong> (Settings ⚙️) ở thanh điều hướng bên trái hoặc góc trên.
                  </p>
                  <p>
                    • Chọn mục <strong>Công cụ</strong> (Tools) hoặc <strong>Cài đặt cá nhân / API</strong>.
                  </p>
                  <p>
                    • Tìm dòng có tên <strong className="text-amber-300">Page Access Token</strong> (hoặc <strong>API Access Token</strong>).
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">4</span>
                  <span>Sao chép mã và dán vào ô bên dưới</span>
                </div>
                <p className="text-gray-300 pl-7">
                  Bấm nút <strong>Sao chép (Copy)</strong> chuỗi mã token đó, sau đó dán vào ô kiểm tra bên dưới hoặc dán vào ô <strong>Facebook Access Token</strong> của phần mềm.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'f12' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Info banner */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-start gap-2.5 text-indigo-200">
                <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Token Doanh nghiệp EAAB/EAAG:</strong> Đây là Token phiên làm việc chuẩn Meta Business của Pancake. Token này mang đầy đủ quyền hạn tối cao (Advanced Access) nên tự động đọc được toàn bộ bình luận Live, avatar và tên người bình luận mà không bị chặn.
                </div>
              </div>

              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">1</span>
                  <span>Mở Pancake trên máy tính</span>
                </div>
                <p className="text-gray-300 pl-7">
                  Dùng trình duyệt Chrome hoặc Cốc Cốc trên máy tính, mở trang <strong className="text-white">https://pages.fm</strong> và chọn Fanpage của bạn.
                </p>
              </div>

              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">2</span>
                  <span>Nhấn phím F12 để mở Công cụ nhà phát triển</span>
                </div>
                <p className="text-gray-300 pl-7">
                  Bấm phím <strong>F12</strong> trên bàn phím (hoặc nhấp chuột phải vào bất kỳ vị trí trống nào trên trang ➔ chọn <strong>Kiểm tra / Inspect</strong>).
                </p>
              </div>

              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">3</span>
                  <span>Vào tab Mạng (Network) và lọc từ khóa</span>
                </div>
                <div className="pl-7 space-y-1.5 text-gray-300">
                  <p>• Nhấp vào tab <strong>Network</strong> (Mạng) ở bảng bên phải/bên dưới.</p>
                  <p>• Ở ô tìm kiếm / filter nhỏ bên dưới tab Network, gõ từ khóa: <code className="bg-black/50 text-indigo-300 px-1.5 py-0.5 rounded border border-white/10 font-mono">access_token</code> hoặc <code className="bg-black/50 text-indigo-300 px-1.5 py-0.5 rounded border border-white/10 font-mono">EAAB</code>.</p>
                  <p>• Bấm phím <strong>F5</strong> trên bàn phím để tải lại trang một lần.</p>
                </div>
              </div>

              <div className="bg-[#121c2c] border border-white/5 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">4</span>
                  <span>Sao chép chuỗi mã bắt đầu bằng EAAB...</span>
                </div>
                <div className="pl-7 space-y-1.5 text-gray-300">
                  <p>• Nhấp vào bất kỳ request nào xuất hiện trong danh sách (vd: dòng có tên <code>graphql</code> hoặc <code>api...</code>).</p>
                  <p>• Chọn tab <strong>Payload</strong> hoặc <strong>Preview / Response</strong>.</p>
                  <p>• Bạn sẽ thấy chuỗi mã dài bắt đầu bằng <strong className="text-amber-300 font-mono">EAAB...</strong> hoặc <strong className="text-amber-300 font-mono">EAAG...</strong>.</p>
                  <p>• Bôi đen sao chép toàn bộ chuỗi đó rồi dán vào phần mềm.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'why' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-[#121c2c] border border-white/10 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-white text-sm flex items-center gap-2 text-blue-300">
                  <ShieldCheck size={16} />
                  <span>So sánh: Token Pancake vs Token App cá nhân (Meta Developers)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg space-y-1.5">
                    <div className="font-bold text-red-300 flex items-center gap-1.5">
                      <AlertCircle size={13} /> Token Meta App Cá Nhân
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-gray-300">
                      <li>Chỉ có quyền ở cấp độ Thử nghiệm (Standard Access).</li>
                      <li>Dễ bị lỗi <strong>(#200) Missing Permissions</strong> do chưa qua xét duyệt doanh nghiệp.</li>
                      <li>Facebook ẩn tên khách hàng, chỉ trả về số ID người dùng ẩn danh.</li>
                      <li>Token thường hết hạn sau 1 - 2 giờ.</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Token Doanh Nghiệp Pancake
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-gray-300">
                      <li>Pancake là Đối tác chính thức (Meta Business Partner).</li>
                      <li><strong>Không bị lỗi #200</strong>, có sẵn toàn quyền đọc tương tác bài Live.</li>
                      <li><strong>Hiển thị 100% Tên Fanpage & Tên thật người bình luận</strong> kèm Avatar.</li>
                      <li>Page Token không hết hạn, ổn định livestream 24/7.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#121c2c] border border-white/5 rounded-xl space-y-2">
                <div className="font-bold text-white flex items-center gap-2">
                  <UserCheck size={15} className="text-blue-400" />
                  <span>Cơ chế hiển thị Tên thương hiệu (Fanpage)</span>
                </div>
                <p className="text-gray-300">
                  Khi dùng Token cá nhân, ứng dụng của Meta xem bạn là một người dùng Facebook thông thường đang xem bài viết. Khi dùng đúng <strong>Page Token / Business Token</strong> của Pancake, ứng dụng đại diện cho chính Fanpage của bạn, do đó hệ thống sẽ hiển thị tên Fanpage thương hiệu và được phép đọc mọi thông tin bình luận, hỗ trợ bắt đúng phiên Live tự động mỗi ngày!
                </p>
              </div>
            </div>
          )}

          {/* Interactive Tester Section */}
          <div className="p-3.5 bg-gradient-to-r from-blue-950/40 via-[#101b2a] to-blue-950/30 border border-blue-500/20 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <KeyRound size={14} className="text-blue-400" />
                <span>Kiểm tra & Áp dụng Token nhanh:</span>
              </span>
              <span className="text-[10px] text-gray-400">Kiểm tra trực tiếp với Facebook Graph API</span>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                value={testInput}
                onChange={(e) => {
                  setTestInput(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Dán mã Token vừa sao chép từ Pancake vào đây..."
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-400"
              />
              <button
                type="button"
                onClick={handleCheckToken}
                disabled={isTesting || !testInput.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer text-xs"
              >
                {isTesting ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                <span>Kiểm tra</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 animate-fadeIn ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/40 border-red-500/40 text-red-200'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {testResult.success ? (
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                  )}
                  <span className="truncate">{testResult.message}</span>
                </div>
                {testResult.success && onApplyToken && (
                  <button
                    type="button"
                    onClick={handleApply}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md text-[11px] shrink-0 transition-transform active:scale-95 cursor-pointer shadow"
                  >
                    Áp dụng ngay
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-white/10 bg-[#0b111c] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white font-bold rounded-xl transition-all cursor-pointer text-xs"
          >
            Đóng hướng dẫn
          </button>
          <div className="flex items-center gap-2">
            {testInput.trim() && (
              <button
                type="button"
                onClick={handleApply}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-bold rounded-xl transition-all cursor-pointer text-xs shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Lưu & Sử dụng Token này</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
