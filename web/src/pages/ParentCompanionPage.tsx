/**
 * 家长微信 H5 · 三维时间折叠战报
 * 链接示例：/#/parent/学生userId?token=家长链接密钥
 */
import { ParentCheerView } from '../components/companion/ParentCheerView';
import { ParentBindPage } from './ParentBindPage';

function parseHashLocation(): { path: string; query: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const idx = raw.indexOf('?');
  const path = (idx >= 0 ? raw.slice(0, idx) : raw).trim();
  const query = new URLSearchParams(idx >= 0 ? raw.slice(idx + 1) : '');
  return { path, query };
}

export function ParentCompanionPage() {
  const loc = parseHashLocation();
  const parts = loc.path.split('/').filter(Boolean);
  if (parts[0] !== 'parent') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#030406] px-6 text-center">
        <p className="text-sm text-gray-400">链接无效</p>
      </div>
    );
  }

  if (parts[1] === 'bind') {
    return <ParentBindPage code={loc.query.get('code')?.trim() || ''} />;
  }

  const studentId = parts[1] ? decodeURIComponent(parts[1]) : '';
  if (!studentId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#030406] px-6 text-center">
        <p className="text-sm text-gray-400">链接缺少学生 ID</p>
        <p className="text-[10px] text-gray-600">格式：/#/parent/学生ID?t=...</p>
      </div>
    );
  }
  return (
    <ParentCheerView
      studentId={studentId}
      onBack={() => {
        window.location.hash = '';
      }}
    />
  );
}
