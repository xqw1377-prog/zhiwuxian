/**
 * WUXIAN · OpenClaw Agent 类型契约
 * OpenClaw = 指挥官（Planning + Skill Calling）
 * Skills   = 四肢（Whisper / Gemini / Neo4j 等）
 */

export type SkillId =
  | 'video_stream_sniff'
  | 'whisper_transcribe'
  | 'multimodal_audit'
  | 'graph_register'
  | 'semantic_match'
  | 'shadow_browser_crawl'
  | 'market_sentiment_scan'
  | 'partner_exam_gateway'
  | 'planner_crowdsource_ingest'
  | 'current_school_probe'
  | 'target_school_probe'
  | 'exam_latex_crush'
  | 'dual_gravity_align';

export interface OpenClawSkillMeta {
  id: SkillId;
  name: string;
  description: string;
}

export interface SkillExecutionStep {
  skillId: SkillId;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  output?: Record<string, unknown>;
  log: string;
}

export interface ParsedUserIntent {
  rawInput: string;
  hasUrl: boolean;
  sourceUrl: string | null;
  platform: string | null;
  title: string | null;
  intent: 'audit_course' | 'match_course' | 'school_intel' | 'dual_school_align' | 'unknown';
}

export interface OpenClawTaskPlan {
  taskId: string;
  intent: ParsedUserIntent['intent'];
  skillChain: SkillId[];
  reasoning: string;
}

export interface OpenClawDispatchResult {
  taskId: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  plan: OpenClawTaskPlan;
  steps: SkillExecutionStep[];
  finalResult: Record<string, unknown>;
  companionReply: string;
}

export const OPENCLAW_SKILLS: OpenClawSkillMeta[] = [
  {
    id: 'video_stream_sniff',
    name: '视频嗅探 Skill',
    description: 'yt-dlp/FFmpeg 流媒体管道，零下载抓取音频与关键帧',
  },
  {
    id: 'whisper_transcribe',
    name: '声纹转写 Skill',
    description: 'Whisper API 实时转写，输出带时间轴文本',
  },
  {
    id: 'multimodal_audit',
    name: '多模态审计 Skill',
    description: 'Gemini 1.5 Pro 三维能力重估 + LaTeX 标签提炼',
  },
  {
    id: 'graph_register',
    name: '知识挂网 Skill',
    description: 'Neo4j/Milvus 指针零存储并网',
  },
  {
    id: 'semantic_match',
    name: '语义路由 Skill',
    description: '卡壳时毫秒级匹配公共课件深链接',
  },
  {
    id: 'shadow_browser_crawl',
    name: '影子浏览器探针',
    description: 'Browser-Use/Firecrawl + Gemini Flash 官网政策结构化提取',
  },
  {
    id: 'market_sentiment_scan',
    name: '舆情聚合探针',
    description: 'Tavily/Jina Reader 多源流检索与广告过滤',
  },
  {
    id: 'partner_exam_gateway',
    name: '中介题库网关',
    description: '择校系统 API 逆向挂载 · 加密考题指针',
  },
  {
    id: 'planner_crowdsource_ingest',
    name: '规划师众筹探针',
    description: '机密细胞上传闸口 · 人肉真题反哺',
  },
  {
    id: 'current_school_probe',
    name: '就读校重力探针',
    description: '吞噬课表/期末卷/给分硬度 · 课程重力价值',
  },
  {
    id: 'target_school_probe',
    name: '目标校逃逸探针',
    description: '吞噬入学真题/录取门槛 · 考题硬度价值',
  },
  {
    id: 'exam_latex_crush',
    name: '考题 LaTeX 粉碎器',
    description: '双端试卷零存储标签化 · 虚假繁荣检测',
  },
  {
    id: 'dual_gravity_align',
    name: '双端重力场对齐',
    description: '四维度价值匹配 · 虫洞配速报告生成',
  },
];
