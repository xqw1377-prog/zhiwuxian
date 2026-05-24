export function CriticalErrorFallback({
  error,
  resetError,
}: {
  error: Error | null;
  resetError: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0E12] p-8">
      <div className="max-w-lg text-center">
        <div className="mb-6 text-6xl">💥</div>
        <h1 className="mb-3 text-2xl font-bold text-red-400">
          驾驶舱遇到严重错误
        </h1>
        <p className="mb-2 text-sm text-gray-400">
          {error?.message || '未知错误'}
        </p>
        <p className="mb-8 text-xs text-gray-500">
          请尝试刷新页面。如果问题持续，请联系支持。
        </p>
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={resetError}
            className="rounded-lg bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-gray-700 bg-transparent px-6 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          >
            刷新页面
          </button>
        </div>
        <details className="mt-8 text-left">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
            技术详情
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-400">
            {error?.stack || '无堆栈信息'}
          </pre>
        </details>
      </div>
    </div>
  );
}
