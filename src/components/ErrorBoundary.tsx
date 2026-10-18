import React, { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0e1621] text-gray-200">
          <div className="text-3xl mb-2">⚠️</div>
          <div className="text-base font-bold text-red-400 mb-1">Đã có lỗi hiển thị dữ liệu</div>
          <div className="text-xs text-gray-400 max-w-md mb-4 break-words">
            {this.state.error?.message || 'Lỗi không xác định khi nạp bình luận.'}
          </div>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            Tải lại bảng tin bình luận
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
