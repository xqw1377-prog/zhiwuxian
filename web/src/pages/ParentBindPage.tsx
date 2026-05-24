import { useEffect, useState } from 'react';
import { resolveApiUrl } from '../lib/api-base';
import { unwrapEnvelope } from '../lib/api-envelope';

const PARENT_SESSION_STORAGE_KEY = 'wuxian_parent_session';

type ClaimResult = {
  parentSession: string;
  students: Array<{ studentId: string; studentLabel?: string | null; className?: string | null }>;
};

export function ParentBindPage({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ClaimResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      setResult(null);

      const bindCode = code.trim();
      if (!bindCode) {
        setLoading(false);
        setError('缺少绑定码，请重新扫码打开。');
        return;
      }

      try {
        const res = await fetch(resolveApiUrl('/api/v1/companion/parent-bind/claim'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: bindCode }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.message || '绑定失败');
        }
        const data = unwrapEnvelope<ClaimResult>(json);
        if (cancelled) return;
        if (!data.parentSession || !Array.isArray(data.students) || data.students.length === 0) {
          throw new Error('绑定失败：未返回学生信息');
        }
        localStorage.setItem(PARENT_SESSION_STORAGE_KEY, data.parentSession);
        setResult(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '绑定失败');
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030406]">
        <p className="animate-pulse text-lg font-black tracking-widest text-[#00FF7F]">关联中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#030406] px-6 text-center">
        <p className="text-[#FF4500]">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-[#00FF7F]/40 px-4 py-2 text-sm text-[#00FF7F]"
        >
          重试
        </button>
      </div>
    );
  }

  if (!result) return null;

  const openStudent = (studentId: string) => {
    window.location.hash = `#/parent/${encodeURIComponent(studentId)}`;
  };

  if (result.students.length === 1) {
    const one = result.students[0];
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#030406] px-6 text-center">
        <p className="text-sm text-gray-300">关联成功</p>
        <button
          type="button"
          onClick={() => openStudent(one.studentId)}
          className="w-full max-w-sm rounded-xl border border-[#00FF7F]/50 bg-[#00FF7F]/10 px-4 py-3 text-sm font-black text-[#00FF7F]"
        >
          进入战报
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030406] px-6 py-10">
      <div className="mx-auto max-w-sm space-y-4">
        <p className="text-center text-sm text-gray-300">选择要查看的孩子</p>
        <div className="space-y-2">
          {result.students.map((s) => (
            <button
              key={s.studentId}
              type="button"
              onClick={() => openStudent(s.studentId)}
              className="w-full rounded-xl border border-gray-800 bg-black/40 px-4 py-3 text-left text-sm text-gray-100 hover:border-[#00FF7F]/40"
            >
              {s.studentLabel?.trim() || s.studentId}
              {(s.className?.trim() || '') ? <span className="ml-2 text-[10px] text-gray-500">{s.className}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

