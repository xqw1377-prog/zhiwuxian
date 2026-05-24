/** 隐私 / 用户协议（商店审核常在「成长」栏或页脚可见） */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${className}`}>
      <a href="#/privacy" className="hover:text-[#00FF7F]">
        隐私政策
      </a>
      <span className="text-gray-800" aria-hidden>
        |
      </span>
      <a href="#/terms" className="hover:text-[#00FF7F]">
        用户协议
      </a>
    </nav>
  );
}
