import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Handle benign ResizeObserver undelivered notifications / flushSync lifecycle warnings
if (typeof window !== 'undefined') {
  const isIgnoredError = (msg: string) =>
    Boolean(
      msg &&
      (/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(msg) ||
       /flushSync was called from inside a lifecycle method/i.test(msg))
    );

  window.addEventListener('error', (event) => {
    if (isIgnoredError(event?.message || '')) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message || '';
    if (isIgnoredError(msg)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });

  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'string' && isIgnoredError(args[0])) {
      return;
    }
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
