import { getLegalInfo, hasLegalInfo } from '../lib/legal-info';

/** 用户服务协议（应用商店链接用 · /#/terms 或 /terms） */
export function TermsOfService() {
  const legal = getLegalInfo();
  return (
    <article className="mx-auto max-w-2xl px-6 py-10 font-sans text-sm leading-relaxed text-gray-300">
      <header className="mb-8 border-b border-gray-800 pb-4">
        <p className="text-[10px] tracking-widest text-[#00FF7F]">WUXIAN ZHI</p>
        <h1 className="mt-2 text-2xl font-bold text-white">用户服务协议</h1>
        <p className="mt-2 text-xs text-gray-500">生效日期：2026-05-20</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-white">1. 服务说明</h2>
        <p>
          WUXIAN ZHI 提供 AI 学业规划、对话辅导、进度追踪与算力计费等功能。AI 输出仅供参考，不构成升学、医疗或法律承诺。
        </p>

        <h2 className="text-base font-bold text-white">2. 账号与设备</h2>
        <p>
          您通过设备标识或会话 Token 使用服务。请妥善保管设备。禁止转售账号、破解计费或滥用接口。
        </p>

        <h2 className="text-base font-bold text-white">3. 付费与退款</h2>
        <p>
          虚拟商品（Warp 时长、订阅、Credits 等）一经交付至账号一般不予退款，除非法律强制规定或平台公示的特殊政策。
          支付纠纷请保留订单号并联系客服。
        </p>

        <h2 className="text-base font-bold text-white">4. 合理使用</h2>
        <p>不得利用本服务生成违法、侵权、骚扰或考试作弊内容。我们有权暂停违规账号。</p>

        <h2 className="text-base font-bold text-white">5. 免责声明</h2>
        <p>
          因网络、第三方模型、设备兼容性或不可抗力导致的服务中断，我们在法律允许范围内不承担责任。
          建议您对重要学习决策保留人工核验。
        </p>

        <h2 className="text-base font-bold text-white">6. 联系</h2>
        {hasLegalInfo() ? (
          <ul className="list-inside list-disc space-y-1 text-gray-400">
            {legal.operator ? <li>运营主体：{legal.operator}</li> : null}
            {legal.email ? (
              <li>
                联系邮箱：
                <a href={`mailto:${legal.email}`} className="text-[#00FF7F] hover:underline">
                  {legal.email}
                </a>
              </li>
            ) : null}
            {legal.address ? <li>注册地址：{legal.address}</li> : null}
          </ul>
        ) : (
          <p className="text-gray-500">
            运营主体与联系邮箱请在应用商店页面或官网公示栏查阅；部署时可配置{' '}
            <code className="text-gray-600">VITE_LEGAL_OPERATOR</code> /{' '}
            <code className="text-gray-600">VITE_LEGAL_EMAIL</code>。
          </p>
        )}
      </section>

      <footer className="mt-10 flex gap-4">
        <a href="#/privacy" className="text-[11px] text-gray-500 hover:text-[#00FF7F]">
          隐私政策
        </a>
        <a href="#/" className="text-[11px] text-[#00FF7F] hover:underline">
          ← 返回驾驶舱
        </a>
      </footer>
    </article>
  );
}
