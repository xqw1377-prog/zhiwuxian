import type { ReactNode } from 'react';

export function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#0D0E12] text-white">
      <div className="safe-area-pt safe-area-pb">{children}</div>
    </div>
  );
}
