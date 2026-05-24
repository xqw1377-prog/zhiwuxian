import { fuelOpenAiMessages } from './llm-fuel-gateway';
import { resolveUserLlm } from './deepseek-client';
import { resolveQwenVision } from './qwen-client';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type VisionSolveResult = {
  problemText: string;
  subject: string;
  knowledgePoint: string;
  knowledgePointTags: string[];
  solution: string;
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  chatText: string;
};

function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();
  return JSON.parse(raw);
}

function llmJson<T>(raw: string, fallback: T): T {
  try {
    return parseJsonFromLlm(raw) as T;
  } catch {
    return fallback;
  }
}

export async function solveVisionProblem(input: {
  userId: string;
  screenshotData?: string;
  userHint?: string;
}): Promise<VisionSolveResult> {
  const uid = input.userId.trim();
  const hint = (input.userHint ?? '').trim();
  if (!resolveUserLlm(uid) && !resolveQwenVision(uid)) {
    return {
      problemText: hint || '请上传题目图片或补充说明',
      subject: '综合',
      knowledgePoint: '待识别',
      knowledgePointTags: [],
      solution: '需要配置 LLM 密钥（DeepSeek / Qwen）才能自动读题解题。请先在设置中配置密钥。',
      answer: '—',
      explanation: '—',
      difficulty: 'medium',
      chatText: '【拍照解题】未检测到 LLM 配置，请先配置 DeepSeek 或 Qwen 密钥。',
    };
  }

  const dataUrl =
    input.screenshotData?.trim().startsWith('data:image/')
      ? input.screenshotData.trim()
      : input.screenshotData?.trim()
        ? `data:image/jpeg;base64,${input.screenshotData.replace(/\s+/g, '')}`
        : null;

  const system = `你是 ZHI 全科解题导师。根据用户上传的题目图片（数学、物理、化学、英语、语文等），按以下步骤处理：

1. 从图片中准确提取题目文字（包括公式、图表描述）
2. 指出所属科目与知识点
3. 给出分步解题过程
4. 给出最终答案
5. 用一句话总结核心概念/解题技巧

输出严格 JSON（不要 markdown 包裹外的文字）：
{
  "problemText": "提取到的完整题目",
  "subject": "科目",
  "knowledgePoint": "核心知识点名称",
  "knowledgePointTags": ["标签1","标签2"],
  "solution": "分步解题过程，每步单独一段",
  "answer": "最终答案",
  "explanation": "一句话核心概念/解题技巧总结",
  "difficulty": "easy|medium|hard"
}`;

  let userContent: ChatCompletionMessageParam['content'];
  if (dataUrl) {
    userContent = [
      {
        type: 'text',
        text: `用户说明：${hint || '请识别图中题目并求解'}`,
      },
      { type: 'image_url', image_url: { url: dataUrl } },
    ];
  } else {
    if (!hint) throw new Error('请上传题目图片或输入题目说明');
    userContent = `用户输入题目：\n${hint}`;
  }

  const gw = await fuelOpenAiMessages(uid, 'VISION_SOLVE', [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ] as ChatCompletionMessageParam[], {
    traceId: `vision_solve_${uid}`,
    policyOverride: { maxTokens: 2000 },
  });
  if (!gw.chargeOk) throw new Error('Warp 燃料不足，请充值后继续');
  const raw = (gw.data ?? '').trim();

  const parsed = llmJson<{
    problemText?: string;
    subject?: string;
    knowledgePoint?: string;
    knowledgePointTags?: string[];
    solution?: string;
    answer?: string;
    explanation?: string;
    difficulty?: string;
  }>(raw, {});

  const problemText = String(parsed.problemText ?? '').trim() || '（未能提取题目）';
  const subject = String(parsed.subject ?? '综合').trim() || '综合';
  const knowledgePoint = String(parsed.knowledgePoint ?? '综合').trim() || '综合';
  const knowledgePointTags = (parsed.knowledgePointTags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
  const solution = String(parsed.solution ?? '').trim() || '（未能生成解答）';
  const answer = String(parsed.answer ?? '').trim() || '—';
  const explanation = String(parsed.explanation ?? '').trim() || '—';
  const difficultyParsed = String(parsed.difficulty ?? '').trim();
  const difficulty: 'easy' | 'medium' | 'hard' =
    difficultyParsed === 'easy' || difficultyParsed === 'hard' ? difficultyParsed : 'medium';

  const chatText = [
    `【拍照解题 · ${subject}】${knowledgePoint}`,
    `题目：${problemText.slice(0, 120)}${problemText.length > 120 ? '…' : ''}`,
    `答案：${answer.slice(0, 100)}`,
    `💡 ${explanation}`,
    '可将该题保存到错题本或请求讲解知识点。',
  ].filter(Boolean).join('\n');

  return {
    problemText,
    subject,
    knowledgePoint,
    knowledgePointTags,
    solution,
    answer,
    explanation,
    difficulty,
    chatText,
  };
}
