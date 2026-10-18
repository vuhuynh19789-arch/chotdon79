import React, { useState, useEffect, useRef, memo } from 'react';
import { Search as SearchIcon, Users, Check } from 'lucide-react';
import { ThapChamIcon } from './UserAvatar';

export interface SearchSuggestionItem {
  user: string;
  nickname?: string;
  shortId: string;
  platform?: 'tiktok' | 'facebook' | 'shopee';
  tag?: string;
  isNinhThuan?: boolean;
  isGheLay?: boolean;
  count?: number;
  total?: number;
  avatarUrl?: string;
  lastTime?: number;
}

interface SearchBarProps {
  value: string;
  onSearchChange: (value: string) => void;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  badgeLabel?: string;
  badgeColorClass?: string;
  suggestions?: SearchSuggestionItem[];
  onSelectSuggestion?: (item: SearchSuggestionItem) => void;
}

/**
 * High-performance Instant SearchBar Component with Dropdown Suggestions.
 * - Zero typing latency (0ms delay): updates immediately on every keystroke.
 * - Smart dropdown suggestions like in "Tạo mới": user can click to immediately load results for the active page!
 * - Smart context badge shows current active page (Chat Live, Giỏ hàng, Khách hàng...).
 */
export const SearchBar: React.FC<SearchBarProps> = memo(({
  value,
  onSearchChange,
  isFocused,
  onFocus,
  onBlur,
  onClear,
  placeholder = "Tìm kiếm...",
  className = "",
  badgeLabel,
  badgeColorClass = "bg-blue-500/15 text-blue-300 border-blue-500/30",
  suggestions = [],
  onSelectSuggestion
}) => {
  const [inputText, setInputText] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedValRef = useRef(value);

  // Sync external value updates (e.g. switching tabs or clear)
  useEffect(() => {
    if (value !== lastSubmittedValRef.current) {
      setInputText(value);
      lastSubmittedValRef.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setInputText(nextVal);
    lastSubmittedValRef.current = nextVal;
    setShowSuggestions(true);
    // Tìm kiếm siêu tốc tức thì 0ms như ở chỗ Tạo Mới
    onSearchChange(nextVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowSuggestions(false);
      lastSubmittedValRef.current = inputText;
      onSearchChange(inputText);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
      handleClear(e as any);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    setInputText('');
    lastSubmittedValRef.current = '';
    setShowSuggestions(false);
    onSearchChange('');
    onClear();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSelect = (item: SearchSuggestionItem) => {
    setInputText(item.user);
    lastSubmittedValRef.current = item.user;
    setShowSuggestions(false);
    onSearchChange(item.user);
    onSelectSuggestion?.(item);
  };

  const hasSuggestions = showSuggestions && (isFocused || inputText) && suggestions && suggestions.length > 0;

  return (
    <div className="relative w-full">
      <div className={`relative flex items-center bg-[#0e1621] rounded-full border border-white/10 shadow-inner px-2 py-0.5 ${className}`}>
        {/* Search Icon */}
        <span className="text-gray-400 pointer-events-none flex items-center justify-center pl-1 pr-1.5 shrink-0">
          <SearchIcon size={16} />
        </span>

        {/* Context Badge (Hiển thị trang đang chọn: Chat, Giỏ hàng, Khách hàng) */}
        {badgeLabel && (
          <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border shrink-0 mr-1 select-none flex items-center gap-1 ${badgeColorClass}`}>
            {badgeLabel}
          </span>
        )}

        {/* Search Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            onFocus();
            if (inputText.trim()) setShowSuggestions(true);
          }}
          onBlur={() => {
            onBlur();
            // Đóng gợi ý sau 250ms để bắt kịp sự kiện click gợi ý
            setTimeout(() => setShowSuggestions(false), 250);
          }}
          placeholder={placeholder}
          className="flex-1 py-2 pr-8 bg-transparent text-white text-xs sm:text-sm focus:outline-none placeholder-gray-400 font-medium min-w-0"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
        />

        {/* Clear Button */}
        {(inputText || isFocused) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0 ml-1"
            aria-label="Xóa nội dung tìm kiếm"
            title="Xóa tìm kiếm (Esc)"
          >
            ✕
          </button>
        )}
      </div>

      {/* Floating Suggestions Dropdown - Y hệt mục gợi ý ở Tạo Đơn */}
      {hasSuggestions && (
        <div 
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full left-0 right-0 z-[100] mt-1.5 bg-[#182332] border border-white/20 rounded-2xl shadow-2xl overflow-hidden divide-y divide-white/5 max-h-72 overflow-y-auto backdrop-blur-md"
        >
          <div className="px-3 py-1.5 bg-[#121a24] text-[10.5px] font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between border-b border-white/5">
            <span className="flex items-center gap-1.5">
              <span>💡 Gợi ý khách hàng</span>
              <span className="text-gray-400 font-normal">({suggestions.length})</span>
            </span>
            <span className="text-[10px] text-gray-400 font-normal">Bấm để tải kết quả</span>
          </div>

          {suggestions.map((s, idx) => (
            <div
              key={`${s.platform || 'all'}_${s.user}_${idx}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              className="px-3 py-2.5 cursor-pointer hover:bg-white/10 active:bg-blue-600/30 flex items-center justify-between gap-2 transition-colors select-none"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                {/* ID */}
                <span className="text-[10px] font-mono font-bold text-gray-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10 shrink-0">
                  #{s.shortId}
                </span>

                {/* Tag */}
                {s.tag && s.tag !== 'NORMAL' && (
                  <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    s.tag === 'VIP' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                    s.tag === 'COC' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                    s.tag === 'COC_100' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    s.tag === 'GHE_LAY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    s.tag === 'HOST' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                    s.tag === 'DAO' ? 'bg-gray-500/20 text-gray-300 border border-white/10' :
                    s.tag === 'BOM' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    'bg-red-950/60 text-red-400 border border-red-500/40'
                  }`}>
                    {s.tag === 'VIP' ? '🌟 Quen' :
                     s.tag === 'COC' ? '💧 Cọc 50k' :
                     s.tag === 'COC_100' ? '💧 Cọc 100k' :
                     s.tag === 'GHE_LAY' ? '🛵 Ghé lấy' :
                     s.tag === 'HOST' ? '👑 Host' :
                     s.tag === 'DAO' ? '👻 Dạo' :
                     s.tag === 'BOM' ? '⚠️ BOM' : '⛔ Chặn'}
                  </span>
                )}

                {s.isNinhThuan && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 inline-flex items-center gap-1">
                    <ThapChamIcon className="w-2.5 h-2.5" />
                    <span>Ninh Thuận</span>
                  </span>
                )}

                {s.isGheLay && s.tag !== 'GHE_LAY' && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shrink-0 inline-flex items-center gap-1">
                    <span>🛵</span>
                    <span>Ghé lấy</span>
                  </span>
                )}

                {/* Nickname (hiển thị trước tên chính) */}
                {s.nickname && (
                  <span className="text-[11px] text-amber-300 font-black px-1.5 py-0.2 bg-amber-500/15 rounded truncate border border-amber-500/30">
                    ({s.nickname})
                  </span>
                )}

                {/* Customer Name */}
                <span className="font-bold text-white text-xs sm:text-sm truncate">
                  {s.user}
                </span>
              </div>

              {/* Stats / Platform */}
              <div className="flex items-center gap-1.5 shrink-0 text-xs font-bold">
                {s.platform && (
                  <span className="text-xs" title={s.platform}>
                    {s.platform === 'tiktok' ? '🎵' : s.platform === 'facebook' ? '📘' : '🛒'}
                  </span>
                )}
                {s.count !== undefined && s.count > 0 && (
                  <span className="text-blue-400 text-xs whitespace-nowrap">
                    {s.count} cái {s.total ? `(${s.total}k)` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
