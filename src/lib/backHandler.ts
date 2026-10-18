// High-performance, bulletproof Back Navigation Stack for mobile & desktop
// Handles nested modals (e.g. List -> Profile -> Calculator) seamlessly.

type BackHandler = () => void;

interface StackItem {
  id: string;
  handler: BackHandler;
  pushedHistory: boolean;
}

const handlerStack: StackItem[] = [];
let suppressPopStateCount = 0;
let isExecutingPopState = false;

// Guard against Android Back button closing modals when returning from external apps (e.g. Pancake, Zalo)
let externalAppGuardActive = false;
let externalAppLaunchTime = 0;
let hasPushedExternalGuardHistory = false;

/**
 * Call when opening external apps (Pancake, Zalo, phone call, external links)
 * to prevent Android Back button from inadvertently closing modals upon return.
 */
export function markExternalAppOpened() {
  externalAppGuardActive = true;
  externalAppLaunchTime = Date.now();
  hasPushedExternalGuardHistory = false;

  try {
    sessionStorage.setItem('slp_ext_app_guard', '1');
    sessionStorage.setItem('slp_ext_app_time', String(Date.now()));
  } catch {}

  try {
    window.history.pushState({ isExternalAppGuard: true, time: Date.now() }, '');
    hasPushedExternalGuardHistory = true;
  } catch {}
}

export function clearExternalAppGuard() {
  externalAppGuardActive = false;
  try {
    sessionStorage.removeItem('slp_ext_app_guard');
    sessionStorage.removeItem('slp_ext_app_time');
  } catch {}
}

export function registerBackHandler(id: string, handler: BackHandler): () => void {
  // If already registered with this ID, update handler
  const existingIdx = handlerStack.findIndex(h => h.id === id);
  if (existingIdx !== -1) {
    handlerStack[existingIdx].handler = handler;
    return () => {
      unregister(id);
    };
  }

  let pushedHistory = false;
  try {
    window.history.pushState({ modalId: id, depth: handlerStack.length + 1 }, '');
    pushedHistory = true;
  } catch {}

  handlerStack.push({ id, handler, pushedHistory });

  return () => {
    unregister(id);
  };
}

function unregister(id: string) {
  const idx = handlerStack.findIndex(h => h.id === id);
  if (idx !== -1) {
    const item = handlerStack[idx];
    handlerStack.splice(idx, 1);
    
    // If an external app guard was pushed and still unconsumed, revert it too
    if (hasPushedExternalGuardHistory && !isExecutingPopState) {
      hasPushedExternalGuardHistory = false;
      clearExternalAppGuard();
      suppressPopStateCount++;
      try {
        window.history.back();
      } catch {
        suppressPopStateCount = Math.max(0, suppressPopStateCount - 1);
      }
    }

    // If modal was closed programmatically (via UI button, X, or in-app swipe, NOT browser popstate),
    // we must revert the history state we pushed, BUT suppress the resulting popstate event
    // so it does NOT cascade and close the parent modal!
    if (item.pushedHistory && !isExecutingPopState) {
      suppressPopStateCount++;
      try {
        window.history.back();
      } catch {
        suppressPopStateCount = Math.max(0, suppressPopStateCount - 1);
      }
    }
  }
}

export function handleGlobalBack(): boolean {
  if (handlerStack.length > 0) {
    const top = handlerStack.pop();
    if (top) {
      isExecutingPopState = true;
      try {
        top.handler();
      } catch (err) {
        console.error("Error in back handler:", err);
      } finally {
        setTimeout(() => {
          isExecutingPopState = false;
        }, 120);
      }
      return true;
    }
  }
  return false;
}

// Global popstate listener for Android physical/gesture back button & browser back button
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e: PopStateEvent) => {
    // If this popstate was triggered by our own window.history.back() during programmatic modal close,
    // SUPPRESS IT completely so it does not trigger the parent modal!
    if (suppressPopStateCount > 0) {
      suppressPopStateCount--;
      return;
    }

    // 1. External App Guard Protection:
    // When the user opens Pancake/Zalo and later presses Android's hardware Back button in Pancake
    // to return to Chotdon, Android brings Chotdon back into view and sends a Back event to the browser.
    // If we don't catch it, it would pop the Customer Profile modal and reset to chat!
    const isGuardInSession = (() => {
      try {
        return sessionStorage.getItem('slp_ext_app_guard') === '1';
      } catch {
        return false;
      }
    })();

    const isGuardState = Boolean((e?.state as any)?.isExternalAppGuard);
    const elapsed = Date.now() - externalAppLaunchTime;
    const isReturningFromExternal = (externalAppGuardActive || isGuardInSession) && elapsed < 600000; // 10 minutes window

    if (isGuardState || isReturningFromExternal) {
      // Absorb this back event! It was just returning from Pancake/Zalo to Chotdon.
      clearExternalAppGuard();
      hasPushedExternalGuardHistory = false;
      // DO NOT call handleGlobalBack() - KEEP THE MODAL OPEN!
      return;
    }

    // Real system back button or browser back gesture pressed by user while using Chotdon:
    handleGlobalBack();
  });
}

