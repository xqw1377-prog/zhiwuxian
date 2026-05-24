import type { ReactNode } from 'react';

/** 工具画布内统一内边距与字号 */
export function ZhiToolShell({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 text-left font-mono text-sm text-gray-200">
      <div className="border-b border-gray-900 pb-2">
        <span className="text-[11px] font-bold text-[#00FF7F]">
          {icon ? `${icon} ` : ''}
          {title}
        </span>
        {description ? <p className="mt-0.5 text-[9px] text-gray-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
