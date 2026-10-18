import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { registerBackHandler } from './backHandler';

interface SwipeToDismissOptions {
  onClose: () => void;
  enabled?: boolean; // Controls whether touch gesture listeners are active
  registerBack?: boolean; // Controls whether modal registers to global back button stack (default: true)
  edgeThreshold?: number; // max pixels from left edge to start gesture (default: 65px)
  distanceThreshold?: number; // min swipe distance in px to trigger close (default: 55px)
  allowRightEdge?: boolean; // also allow swipe from right edge to left (default: true)
  headerSwipe?: boolean; // allow swipe anywhere on top header (default: true)
  allowSwipeDown?: boolean; // allow swiping down on header to dismiss (default: true)
}

/**
 * Hook to enable smooth swipe back / edge swipe to dismiss modals on mobile
 * Handles gestures cleanly and syncs with hardware/system back button via backHandler.
 */
export function useSwipeToDismiss({
  onClose,
  enabled = true,
  registerBack = true,
  edgeThreshold = 65,
  distanceThreshold = 55,
  allowRightEdge = true,
  headerSwipe = true,
  allowSwipeDown = true,
}: SwipeToDismissOptions) {
  const autoId = useId();
  const [swipeOffset, setSwipeOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number; isEdge: boolean; isRightEdge: boolean; isHeader: boolean } | null>(null);
  const isClosingRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Register with global back handler for Android/iOS hardware back button & system edge gestures
  // Runs based on registerBack (independent of gesture enabled state)
  useEffect(() => {
    if (!registerBack) return;
    const unregister = registerBackHandler(autoId, () => {
      onCloseRef.current();
    });
    return () => {
      unregister();
    };
  }, [registerBack, autoId]);

  const handleTouchStart = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (!enabled || isClosingRef.current) return;
    if (e.touches.length !== 1) return;

    // Isolate touch event to this modal only - never bubble to parent modals
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 400;

    const isLeftEdge = clientX <= edgeThreshold;
    const isRightEdge = allowRightEdge && clientX >= windowWidth - edgeThreshold;
    const isHeaderArea = headerSwipe && clientY <= 90;

    if (isLeftEdge || isRightEdge || isHeaderArea) {
      touchStartRef.current = {
        x: clientX,
        y: clientY,
        time: Date.now(),
        isEdge: isLeftEdge,
        isRightEdge: isRightEdge,
        isHeader: isHeaderArea,
      };
      setIsSwiping(false);
      setSwipeOffset({ x: 0, y: 0 });
    } else {
      touchStartRef.current = null;
    }
  }, [enabled, edgeThreshold, allowRightEdge, headerSwipe]);

  const handleTouchMove = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (!enabled || !touchStartRef.current || isClosingRef.current) return;
    if (e.touches.length !== 1) return;

    if (e.stopPropagation) {
      e.stopPropagation();
    }

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const { isEdge, isRightEdge, isHeader } = touchStartRef.current;

    // A. Vuốt xuống từ thanh tiêu đề Header để đóng modal
    if (isHeader && allowSwipeDown && dy > 20 && dy > absDx * 1.3) {
      setIsSwiping(true);
      setSwipeOffset({ x: 0, y: Math.min(dy, 180) });

      if (dy >= distanceThreshold + 20) {
        isClosingRef.current = true;
        touchStartRef.current = null;
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}
        onCloseRef.current();
      }
      return;
    }

    // Nếu chuyển động phần lớn là cuộn dọc danh sách, huỷ gesture vuốt ngang
    if (!isSwiping && absDy > 20 && absDy > absDx * 1.2) {
      touchStartRef.current = null;
      setSwipeOffset({ x: 0, y: 0 });
      setIsSwiping(false);
      return;
    }

    // B. Vuốt sang phải từ mép trái (hoặc từ Header)
    if ((isEdge || isHeader) && dx > 15 && absDx > absDy * 0.9) {
      setIsSwiping(true);
      setSwipeOffset({ x: Math.min(dx, 220), y: 0 });

      if (dx >= distanceThreshold) {
        isClosingRef.current = true;
        touchStartRef.current = null;
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}
        onCloseRef.current();
      }
    }
    // C. Vuốt sang trái từ mép phải
    else if (isRightEdge && dx < -15 && absDx > absDy * 0.9) {
      setIsSwiping(true);
      setSwipeOffset({ x: Math.max(dx, -220), y: 0 });

      if (absDx >= distanceThreshold) {
        isClosingRef.current = true;
        touchStartRef.current = null;
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}
        onCloseRef.current();
      }
    }
  }, [enabled, distanceThreshold, isSwiping, allowSwipeDown]);

  const handleTouchEnd = useCallback((e?: TouchEvent | React.TouchEvent) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    touchStartRef.current = null;
    setIsSwiping(false);
    setSwipeOffset({ x: 0, y: 0 });
  }, []);

  const modalStyle: React.CSSProperties = isSwiping && (swipeOffset.x !== 0 || swipeOffset.y !== 0)
    ? {
        transform: `translate3d(${swipeOffset.x * 0.45}px, ${swipeOffset.y * 0.45}px, 0)`,
        opacity: Math.max(0.65, 1 - (Math.abs(swipeOffset.x) + Math.abs(swipeOffset.y)) / 350),
        transition: 'none',
      }
    : {
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out',
      };

  return {
    swipeOffset,
    isSwiping,
    modalStyle,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
