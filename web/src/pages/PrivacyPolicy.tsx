import { getLegalInfo, hasLegalInfo } from '../lib/legal-info';

/** 应用商店与合规所需 · 隐私政策（可部署为 /#/privacy 或 /privacy） */
export function PrivacyPolicy() {
  const legal = getLegalInfo();
  return (
    <article className="mx-auto max-w-2xl px-6 py-10 font-sans text-sm leading-relaxed text-gray-300">
      <header className="mb-8 border-b border-gray-800 pb-4">
        <p className="text-[10px] tracking-widest text-[#00FF7F]">WUXIAN ZHI</p>
        <h1 className="mt-2 text-2xl font-bold text-white">隐私政策</h1>
        <p className="mt-2 text-xs text-gray-500">生效日期：2026-05-20 · 适用于 Web / Android / iOS 客户端</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-white">1. 我们收集的信息</h2>
        <p>
          为提供学业辅导与对话服务，我们可能处理：设备标识（用于登录会话）、您主动输入的对话与附件（含试卷照片）、
          学习进度与航标设定、以及为计费所需的订单与钱包记录。我们不会出售您的个人数据。
        </p>

        <h2 className="text-base font-bold text-white">2. 影像与语音</h2>
        <p>
          您上传的试卷、教材照片或语音仅在提供 AI 分析、归档与进度追踪所必需的范围内处理。
          请勿在画面中包含无关第三方的可识别隐私信息。
        </p>

        <h2 className="text-base font-bold text-white">3. AI 与第三方模型</h2>
        <p>
          部分能力通过合规的大语言模型 / 视觉服务完成（如 DeepSeek、通义千问等，以实际配置为准）。
          发送至模型的内容受该服务商条款约束；我们会在可行范围内过滤支付与账号敏感字段。
        </p>

        <h2 className="text-base font-bold text-white">4. 存储与安全</h2>
        <p>
          数据主要保存在运营方控制的服务器（SQLite / 对象存储，视部署而定）。传输使用 HTTPS。
          会话 Token 保存在您设备本地；请勿与他人共享已登录设备。
        </p>

        <h2 className="text-base font-bold text-white">5. 未成年人</h2>
        <p>
          若用户为未成年人，建议在监护人同意与指导下使用。监护人可联系我们删除账号相关学习数据。
        </p>

        <h2 className="text-base font-bold text-white">6. 您的权利</h2>
        <p>您可申请查阅、更正或删除与账号关联的数据，以及注销会话。请通过产品内反馈或下方运营方联系方式与我们联系。</p>

        <h2 className="text-base font-bold text-white">7. 运营方与联系</h2>
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
            运营主体、联系邮箱与注册地址由部署方在构建配置（<code className="text-gray-600">VITE_LEGAL_*</code>
            ）或应用商店开发者信息中公示。
          </p>
        )}

        <h2 className="text-base font-bold text-white">8. 政策更新</h2>
        <p>我们可能更新本政策并在应用内提示。继续使用即表示接受更新后的版本。</p>
      </section>

      <footer className="mt-10">
        <a href="#/" className="text-[11px] text-[#00FF7F] hover:underline">
          ← 返回驾驶舱
        </a>
      </footer>
    </article>
  );
}
