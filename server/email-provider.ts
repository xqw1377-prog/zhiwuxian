/**
 * 可插拔邮件发送（密码找回、运营通知）
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; channel: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.WUXIAN_EMAIL_FROM?.trim() || 'WUXIAN ZHI <noreply@wuxian.local>';

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html ?? msg.text.replace(/\n/g, '<br/>'),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, channel: 'resend' };
      console.warn('[Email] Resend 失败', await res.text().catch(() => ''));
    } catch (err) {
      console.warn('[Email] Resend 异常', err);
    }
  }

  const smtpUrl = process.env.SMTP_URL?.trim();
  if (smtpUrl) {
    console.log(`[Email] SMTP 已配置但未内置发信实现，请接 nodemailer 或仅用 Resend: ${msg.to}`);
  }

  console.log(`[Email] DEV 控制台 → ${msg.to}\n  主题: ${msg.subject}\n  ${msg.text}`);
  return { ok: true, channel: 'console' };
}
