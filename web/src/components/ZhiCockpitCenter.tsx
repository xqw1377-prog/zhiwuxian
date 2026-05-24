import { ZhiChatShell } from './ZhiChatShell';

export function ZhiCockpitCenter({ userId }: { userId: string }) {
  return (
    <main
      data-cockpit-home
      className="flex min-h-screen flex-1 flex-col overflow-hidden bg-[#0D0E12]"
    >
      <ZhiChatShell userId={userId} />
    </main>
  );
}
