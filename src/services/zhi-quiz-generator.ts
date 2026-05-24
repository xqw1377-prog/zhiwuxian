import { z } from 'zod';
import { gatewayJsonCompletion } from './llm-gateway';
import { buildLearnerProfile } from './learner-profile';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { saveAssessmentPaper, type AssessmentQuestion } from '../db/zhi-assessment-schema';

const quizQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(['choice', 'fill_blank']),
  question: z.string().min(4).max(700),
  options: z.array(z.string().min(1).max(120)).optional(),
  correct_answer: z.string().min(1).max(40),
  error_analysis: z.string().min(1).max(300),
  knowledge_point: z.string().min(1).max(80).optional(),
});

const quizPaperSchema = z.object({
  title: z.string().min(1).max(120),
  subjectId: z.string().min(1).max(40),
  subjectName: z.string().min(1).max(40),
  questions: z.array(quizQuestionSchema).min(8).max(30),
});

function mapQuizToAssessmentQuestions(raw: z.infer<typeof quizPaperSchema>): AssessmentQuestion[] {
  const out: AssessmentQuestion[] = [];
  for (const q of raw.questions) {
    if (q.type === 'choice') {
      out.push({
        id: q.id,
        type: 'choice',
        prompt: q.question,
        options: (q.options ?? []).slice(0, 6),
        knowledgePoint: q.knowledge_point?.slice(0, 60) ?? '',
        coachFollowUp: q.error_analysis.slice(0, 140),
      });
    } else {
      out.push({
        id: q.id,
        type: 'fill_blank',
        prompt: q.question,
        knowledgePoint: q.knowledge_point?.slice(0, 60) ?? '',
        coachFollowUp: q.error_analysis.slice(0, 140),
      });
    }
  }
  return out;
}

function guessSubjectName(subjectId: string): string {
  if (subjectId === 'math') return '数学';
  if (subjectId === 'phys') return '物理';
  if (subjectId === 'chem') return '化学';
  if (subjectId === 'en') return '英语';
  if (subjectId === 'toefl') return '标化';
  if (subjectId === 'sat') return 'SAT';
  if (subjectId === 'algo') return '算法';
  return subjectId;
}

export async function generateAdaptiveExamPaper(input: {
  userId: string;
  subjectId: string;
  weakPoints: string[];
  questionCount?: number;
  difficulty?: 'mid' | 'hard';
  userHint?: string;
}): Promise<{ paperId: string; subjectId: string; subjectName: string; title: string }> {
  const userId = input.userId.trim();
  if (!userId) throw new Error('缺少 userId');
  const subjectId = input.subjectId.trim();
  if (!subjectId) throw new Error('缺少 subjectId');

  const dash = buildLearningProgressDashboard(userId);
  const subj = dash.subjects.find((s) => s.id === subjectId);
  const subjectName = subj?.name ?? guessSubjectName(subjectId);
  const profile = buildLearnerProfile(userId);
  const weak = (input.weakPoints ?? []).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 12);
  const n = Math.max(10, Math.min(30, Math.floor(input.questionCount ?? 20)));
  const diff = input.difficulty ?? 'hard';
  const track = profile?.curriculumLabel ?? '';
  const userHint = String(input.userHint ?? '').trim().slice(0, 220);

  const prompt = [
    `你是严苛的出题组组长，目标：用最少题数最大化暴露学生短板。`,
    `要求：仅输出 JSON，严格匹配 schema：{ title, subjectId, subjectName, questions: [{id,type,question,options?,correct_answer,error_analysis,knowledge_point?}] }。`,
    `题数：${n}；难度：${diff === 'hard' ? '偏难、强辨析' : '中等、覆盖基础'}；题型：choice + fill_blank 混合。`,
    `课程轨/口径：${track || '按用户课程轨自适应'}。`,
    `科目：${subjectName}（subjectId=${subjectId}）。`,
    weak.length ? `薄弱点：${weak.join('；')}` : '',
    userHint ? `补充说明：${userHint}` : '',
    `输出约束：choice 必须给 options(4 个)；correct_answer 为 A/B/C/D 或填空答案；error_analysis 写常见错因与纠偏一句话；knowledge_point 写一个短标签。`,
  ]
    .filter(Boolean)
    .join('\n');

  const gen = await gatewayJsonCompletion<unknown>(
    userId,
    [{ role: 'user', content: prompt }],
    { billable: true, maxTokens: 2400, temperature: 0.3, traceId: `adaptive_exam_${subjectId}` },
  );
  if (!gen.data) throw new Error(gen.error || '出卷失败');

  let parsed: z.infer<typeof quizPaperSchema> | null = null;
  try {
    parsed = quizPaperSchema.parse(gen.data);
  } catch {
    const repairPrompt = [
      `把下面对象修复为合法 JSON，并严格满足 schema：${quizPaperSchema.toString()}`,
      `只输出修复后的 JSON，不要解释：`,
      JSON.stringify(gen.data).slice(0, 6000),
    ].join('\n');
    const repaired = await gatewayJsonCompletion<unknown>(
      userId,
      [{ role: 'user', content: repairPrompt }],
      { billable: true, maxTokens: 1600, temperature: 0.2, traceId: `adaptive_exam_repair_${subjectId}` },
    );
    if (!repaired.data) throw new Error(repaired.error || '出卷修复失败');
    parsed = quizPaperSchema.parse(repaired.data);
  }

  const questions = mapQuizToAssessmentQuestions(parsed);
  const row = saveAssessmentPaper({
    userId,
    subjectId,
    subjectName,
    paperType: 'adaptive_exam',
    title: parsed.title || `${subjectName}·短板裂变卷`,
    questions,
    mode: 'active',
    source: 'adaptive_exam',
    learningContext: weak.length ? `弱项：${weak.join('；')}` : '',
    activeIntro: `短板裂变卷：${subjectName}（${questions.length} 题）。做完立刻交卷，我会按结果重排学习路径。`,
  });

  return { paperId: row.id, subjectId, subjectName, title: row.title };
}
