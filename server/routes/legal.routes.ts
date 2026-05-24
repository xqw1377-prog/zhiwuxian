import type { Application } from 'express';
import { wrap, sendSuccess } from './shared';

const PRIVACY_POLICY = {
  version: '1.0.0',
  updated: '2026-05-22',
  sections: [
    {
      title: '信息收集',
      content: '我们仅收集提供服务所必需的信息，包括：账号注册信息（用户名、邮箱）、学习行为数据（答题记录、评估结果）、设备基础信息（浏览器版本、操作系统）。不收集任何生物识别、精确位置或通讯录数据。',
    },
    {
      title: '信息使用',
      content: '收集的信息仅用于：个性化学习推荐、产品功能优化、问题诊断与修复。不会将用户数据用于广告投放或出售给第三方。',
    },
    {
      title: '数据存储与安全',
      content: '用户数据存储在中国大陆境内的服务器。采用传输层加密（TLS）、静态数据加密（AES-256）以及严格的访问控制策略。',
    },
    {
      title: '数据保留',
      content: '学习行为数据保留90天，账号信息在用户注销后立即删除。支付信息由 Stripe 直接处理，我们不会存储完整的信用卡信息。',
    },
    {
      title: '用户权利',
      content: '用户有权查看、导出、更正和删除自己的数据。可通过设置页面或联系 support@wuxianzhi.com 行使这些权利。',
    },
    {
      title: '第三方服务',
      content: '我们使用以下第三方服务：Stripe（支付处理）、DeepSeek / 通义千问（AI 能力）。这些服务有各自独立的隐私政策。',
    },
    {
      title: '政策更新',
      content: '隐私政策更新时会通过应用内通知和邮件告知用户。重大变更会提前30天通知。',
    },
  ],
};

const TERMS_OF_SERVICE = {
  version: '1.0.0',
  updated: '2026-05-22',
  sections: [
    {
      title: '服务说明',
      content: 'WUXIAN ZHI Cockpit 是一款基于人工智能的个性化学习辅助工具，提供学习规划、知识评估、自适应练习等功能。',
    },
    {
      title: '用户责任',
      content: '用户承诺不滥用 API、不试图破解系统、不利用服务从事任何违法活动。用户对使用其账号产生的所有活动负责。',
    },
    {
      title: '付费服务',
      content: '部分高级功能需要付费订阅。订阅费用通过 Stripe 处理，退费政策参照各订阅方案的具体条款。自动续订服务可在到期前至少24小时取消。',
    },
    {
      title: '知识产权',
      content: '本软件的所有权利归开发团队所有。用户生成的内容（学习笔记、目标拆解等）归用户所有。',
    },
    {
      title: '服务可用性',
      content: '我们尽力保证99.9%的服务可用性，但不承担因不可抗力（如自然灾害、网络攻击）导致的服务中断责任。',
    },
    {
      title: '终止',
      content: '任何一方均可随时终止服务关系。用户可随时删除账号，我们将在30天内删除所有相关数据。',
    },
    {
      title: '争议解决',
      content: '本协议受中华人民共和国法律管辖。任何争议应首先通过友好协商解决。',
    },
  ],
};

export function registerLegalRoutes(app: Application): void {
  app.get('/api/v1/legal/privacy', wrap((_req, res) => {
    sendSuccess(res, PRIVACY_POLICY);
  }));

  app.get('/api/v1/legal/terms', wrap((_req, res) => {
    sendSuccess(res, TERMS_OF_SERVICE);
  }));

  app.get('/api/v1/legal/version', wrap((_req, res) => {
    sendSuccess(res, {
      privacy: PRIVACY_POLICY.version,
      terms: TERMS_OF_SERVICE.version,
    });
  }));
}
