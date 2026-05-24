/**
 * WUXIAN · 家长鼓励实时推送（SSE 通道）
 *
 * 家长在微信端点击"加油鼓励" → 后端注入 Warp → SSE 推送到学生浏览器 → 满屏特效
 */

interface CheerEvent {
  message: string;
  fuelBonus: number;
  cheerStyle: 'FIRE' | 'HEART' | 'SHIELD';
}

const studentConnections = new Map<string, Set<(event: CheerEvent) => void>>();

/**
 * 学生端注册 SSE 监听（在客户端页面初始化时调用）
 */
export function subscribeStudentCheer(
  studentId: string,
  callback: (event: CheerEvent) => void,
): () => void {
  if (!studentConnections.has(studentId)) {
    studentConnections.set(studentId, new Set());
  }
  studentConnections.get(studentId)!.add(callback);
  return () => {
    studentConnections.get(studentId)?.delete(callback);
  };
}

/**
 * 后端推送家长鼓励到学生端
 * @returns 是否成功通知到学生
 */
export function pushParentCheerToStudent(
  studentId: string,
  event: CheerEvent,
): boolean {
  const callbacks = studentConnections.get(studentId);
  if (!callbacks || callbacks.size === 0) return false;
  callbacks.forEach(cb => {
    try { cb(event); } catch { /* ignore */ }
  });
  return true;
}

/**
 * Express SSE 端点（供学生轮询/长连）
 */
export function createCheerSseEndpoint(
  req: { query: { studentId?: string | string[] }; on: (event: string, cb: () => void) => void },
  res: {
    writeHead: (code: number, headers: Record<string, string>) => void;
    write: (data: string) => void;
    on: (event: string, cb: () => void) => void;
    end: (data?: string) => void;
  },
): void {
  const studentId = Array.isArray(req.query.studentId) ? req.query.studentId[0] : req.query.studentId;
  if (!studentId || !studentId.trim()) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('missing studentId');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const unsubscribe = subscribeStudentCheer(studentId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // 心跳
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
