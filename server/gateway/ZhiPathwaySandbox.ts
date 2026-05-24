/**
 * ZHI 赛道沙箱 · 大模型上下文隔离防护栏
 * 唯一事实来源：梦校航标（wuxian_learning.db）+ 可选 goals 轨标记（wuxian_core.db）
 */

import { getCoreDb } from '../wuxian-core-db';
import { getSchoolAnchorProfile, anchorGeoContext } from '../../src/db/zhi-cloud-schema';
import {
  detectSchoolPathway,
  type SchoolPathway,
} from '../../src/services/school-pathway';

export type PathwayTrack = 'DOMESTIC_GAOKAO' | 'US_PREP' | 'K12_GROWTH';

export type PathwayGuardrail = {
  track: PathwayTrack;
  pathway: SchoolPathway;
  systemPrompt: string;
  targetSchool: string;
  currentGrade: string;
  currentRegion: string;
  userId: string | null;
  goalId: string | null;
};

export type GuardrailResolveInput = {
  userId?: string | null;
  goalId?: string | null;
};

const DOMESTIC_FORBIDDEN_RE =
  /\b(TOEFL|IELTS|SAT|ACT|AP\s*\d|Common\s*App|GPA|CMU|MIT|Stanford|Harvard|Berkeley|Caltech|Ivy)\b|托福|雅思|美本|留学申请|Activity\s*List|文书\s*Essay/i;

const US_FORBIDDEN_RE =
  /一轮复习|九校联考|高考考纲|强基计划|学考|新课标卷|人教版全套|CSP\s*初赛|NOI\s*省选|综评锁档/i;

function columnExists(table: string, column: string): boolean {
  const db = getCoreDb();
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function resolveUserIdFromGoal(goalId: string): string | null {
  const db = getCoreDb();
  const id = goalId.trim();
  if (!id) return null;
  const hasUserCol = columnExists('goals', 'user_id');
  const row = db
    .prepare(
      `SELECT ${hasUserCol ? 'user_id' : "'' AS user_id"} AS user_id, title FROM goals WHERE id = ?`,
    )
    .get(id) as { user_id?: string; title?: string } | undefined;
  const uid = row?.user_id?.trim();
  return uid || null;
}

function readGoalTrackHint(goalId: string): { trackType: string; targetSchool: string } | null {
  if (!columnExists('goals', 'track_type')) return null;
  const row = getCoreDb()
    .prepare(`SELECT track_type, target_school FROM goals WHERE id = ?`)
    .get(goalId.trim()) as { track_type?: string; target_school?: string } | undefined;
  if (!row) return null;
  return {
    trackType: String(row.track_type ?? '').trim(),
    targetSchool: String(row.target_school ?? '').trim(),
  };
}

function mapPathwayToTrack(pathway: SchoolPathway): PathwayTrack {
  if (pathway === 'k12_stage') return 'K12_GROWTH';
  if (pathway === 'us_intl') return 'US_PREP';
  if (pathway === 'domestic_cn') return 'DOMESTIC_GAOKAO';
  return 'DOMESTIC_GAOKAO';
}

function isDomesticGaokaoSenior(grade: string, region: string, school: string): boolean {
  const g = grade.trim();
  const r = region.trim();
  const s = school.trim();
  if (/高三|高\s*3|Grade\s*12|12\s*年级/i.test(g)) return true;
  if (/湖南|长沙|湖北|武汉|广东|北京|上海|浙江|江苏|四川|河南|山东/.test(r) && /高[一二三2-3]/.test(g)) {
    return true;
  }
  if (/清华|北大|复旦|上交|浙大|中科大|人大|同济|华科|武大|中山|厦大|哈工大|西交|东南|北航|北理|成电/.test(s)) {
    return true;
  }
  return false;
}

function buildDomesticGuardrail(ctx: {
  targetSchool: string;
  currentGrade: string;
  currentRegion: string;
  currentSchool: string;
  seniorPressure: boolean;
}): string {
  const regionHint = ctx.currentRegion.includes('湖南') || ctx.currentRegion.includes('长沙')
    ? '学生身处湖南高考语境（长郡/雅礼/四大名校式竞争强度），用语贴合本省联考与新课标。'
    : ctx.currentRegion && ctx.currentRegion !== '待定'
      ? `学生就读地：${ctx.currentRegion}，题目与术语对齐当地省情。`
      : '按国内高考新课标与就读省份命题习惯出题。';

  const gradeHint = ctx.seniorPressure
    ? '你面对的是高三高压学生，节奏以冲刺、限时、错题回炉为主。'
    : `当前年级：${ctx.currentGrade || '未填'}，难度与课标年级对齐。`;

  return `【核心铁律 · 国内高考冲刺闭环】
${gradeHint}
${regionHint}
现就读：${ctx.currentSchool || '未填'} · 梦校：${ctx.targetSchool || '未锁定'}

语言风格：严谨、硬核、本教研组风，短句可执行。
必须使用的术语：一轮复习、错题集、九校联考、高考考纲、强基计划、学考、专题限时练、时间折叠、压轴、审题陷阱。

🚨 绝对禁止（不得出现任何字符，含英文缩写）：
TOEFL、IELTS、SAT、ACT、AP、Common App、GPA、美本、留学申请、CMU、MIT、Activity List、托福、雅思、文书 Essay、国际标化主战役。

若学生未走国际部/无出国计划，禁止将「梦校航标」解释为美本申请系统。`;
}

function buildUsPrepGuardrail(ctx: {
  targetSchool: string;
  currentGrade: string;
  currentRegion: string;
}): string {
  return `【核心铁律 · 美本/国际标化升学轨】
梦校：${ctx.targetSchool || '未锁定'} · 年级：${ctx.currentGrade || '未填'} · 地区：${ctx.currentRegion || '未填'}

必须使用的术语：托福听力、TPO、AP 微积分、SAT 阅读、Common App 文书、Activity List、CMU、选课策略、标化备考节点。

🚨 禁止：一轮复习、九校联考、高考考纲、强基计划、人教版全套、CSP 省选等纯国内高考主战役话术（除非学生明确双轨且快照写明）。`;
}

function buildK12Guardrail(ctx: {
  targetSchool: string;
  currentGrade: string;
}): string {
  return `【核心铁律 · 校内成长轨（小学/初中 · 暂无大学目标）】
目标：${ctx.targetSchool} · 年级：${ctx.currentGrade || '未填'}

聚焦：习惯、单元卷、错题本、周测、排名/单科提分；语言鼓励但具体。
禁止：托福/SAT/AP/Common App 全套留学话术，也禁止高三高考冲刺式恐吓性表述。`;
}

export class ZhiPathwaySandbox {
  /**
   * 根据航标 / goal 事实注入高纯度防护栏（Guardrails）
   */
  public static injectSystemGuardrail(input: GuardrailResolveInput = {}): PathwayGuardrail {
    const goalId = input.goalId?.trim() || null;
    let userId = input.userId?.trim() || null;
    if (!userId && goalId) userId = resolveUserIdFromGoal(goalId);

    const goalHint = goalId ? readGoalTrackHint(goalId) : null;

    const anchor = userId ? getSchoolAnchorProfile(userId) : null;
    const geo = anchor ? anchorGeoContext(anchor) : null;

    const targetSchool =
      goalHint?.targetSchool ||
      anchor?.school?.trim() ||
      '';
    const currentGrade = anchor?.currentGrade?.trim() || '';
    const currentRegion =
      geo?.currentRegion?.trim() || geo?.targetSchoolRegion?.trim() || '';
    const currentSchool = geo?.currentSchool?.trim() || '';

    let pathway = detectSchoolPathway(
      targetSchool,
      anchor?.major ?? '',
      {
        currentGrade,
        currentRegion,
        targetSchoolRegion: geo?.targetSchoolRegion,
        currentSchool,
      },
    );

    if (goalHint?.trackType === 'DOMESTIC_GAOKAO') pathway = 'domestic_cn';
    if (goalHint?.trackType === 'US_PREP') pathway = 'us_intl';
    if (goalHint?.trackType === 'K12_GROWTH') pathway = 'k12_stage';

    const seniorPressure = pathway === 'domestic_cn' && isDomesticGaokaoSenior(
      currentGrade,
      currentRegion,
      targetSchool,
    );

    const track = mapPathwayToTrack(pathway);

    let systemPrompt: string;
    if (track === 'K12_GROWTH') {
      systemPrompt = buildK12Guardrail({ targetSchool, currentGrade });
    } else if (track === 'US_PREP') {
      systemPrompt = buildUsPrepGuardrail({ targetSchool, currentGrade, currentRegion });
    } else {
      systemPrompt = buildDomesticGuardrail({
        targetSchool,
        currentGrade,
        currentRegion,
        currentSchool,
        seniorPressure,
      });
    }

    return {
      track,
      pathway,
      systemPrompt,
      targetSchool,
      currentGrade,
      currentRegion,
      userId,
      goalId,
    };
  }

  /** 将沙箱 Prompt 作为 system 前缀，与业务 system 焊死 */
  public static prefixGuardrail(baseSystemPrompt: string, input: GuardrailResolveInput = {}): string {
    const g = ZhiPathwaySandbox.injectSystemGuardrail(input);
    return `${g.systemPrompt}\n\n---\n【业务指令】\n${baseSystemPrompt.trim()}`;
  }

  /** 输出后消毒：国内高三轨剔除误吐的美本标化英文 */
  public static sanitizeModelText(text: string, track: PathwayTrack): string {
    const t = text.trim();
    if (!t) return t;
    if (track === 'DOMESTIC_GAOKAO') {
      if (!DOMESTIC_FORBIDDEN_RE.test(t)) return t;
      return t
        .replace(DOMESTIC_FORBIDDEN_RE, '【已屏蔽非高考术语】')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    if (track === 'US_PREP' && US_FORBIDDEN_RE.test(t)) {
      return t.replace(US_FORBIDDEN_RE, '【已屏蔽非标化术语】').trim();
    }
    return t;
  }

  public static syncGoalTrackFromUser(userId: string, goalId: string): void {
    if (!columnExists('goals', 'track_type')) return;
    const g = ZhiPathwaySandbox.injectSystemGuardrail({ userId, goalId });
    getCoreDb()
      .prepare(`UPDATE goals SET track_type = ?, target_school = ? WHERE id = ?`)
      .run(g.track, g.targetSchool, goalId.trim());
  }
}
