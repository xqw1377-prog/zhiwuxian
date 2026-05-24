import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.name ? `/${this.props.name}` : ''}]`, error, info);
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const raw = this.state.error?.message || '未知错误';
      const lower = raw.toLowerCase();
      const isHookOrder =
        lower.includes('rendered more hooks than during the previous render') ||
        lower.includes('rendered fewer hooks than expected');
      const isSqliteColumnMissing = lower.includes('no such column:');

      const friendly = isHookOrder
        ? '组件内部状态异常（常见于热更新或条件渲染）。请刷新页面后重试。'
        : isSqliteColumnMissing
          ? '本地数据结构与代码不一致（缺少字段）。建议刷新后仍异常时，执行一次数据迁移/重建。'
          : raw;

      return (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-red-900/40 bg-red-950/10 p-8">
          <div className="max-w-md text-center">
            <div className="mb-3 text-3xl">⚠️</div>
            <h3 className="mb-2 text-sm font-semibold text-red-400">
              {this.props.name || '组件'} 遇到问题
            </h3>
            <p className="mb-4 text-xs text-red-300/70">
              {friendly}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded bg-red-800/40 px-4 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-700/50"
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded bg-red-800/40 px-4 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-700/50"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
