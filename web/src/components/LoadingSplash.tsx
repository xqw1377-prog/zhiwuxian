interface LoadingSplashProps {
  message?: string;
}

export function LoadingSplash({ message = '正在唤醒 ZHI ...' }: LoadingSplashProps) {
  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-gray-950">
      <div className="relative mb-8">
        <div className="w-16 h-16 rounded-full border-4 border-gray-800 border-t-cyan-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl">🧠</span>
        </div>
      </div>
      <p className="text-gray-400 text-sm animate-pulse">{message}</p>
      <p className="text-gray-600 text-xs mt-2">首次加载可能需要几秒钟</p>
    </div>
  );
}
