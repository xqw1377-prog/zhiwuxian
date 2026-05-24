# 「折叠时间」效果验证 · 可埋点指标方案

> 目标：用 **现有 `wuxian_learning.db` 表** 验证——主动学习用户是否在 **更少组织时间** 下，获得 **可测量的掌握度提升**。  
> 不承诺「总学时减半仍同等分数」；验证的是 **闭环质量 + 单位时间产出**。

---

## 1. 北极星指标（North Star）

| 指标 | 定义 | 成功方向 |
|------|------|----------|
| **有效折叠率** `fold_efficiency_index` | 近 28 天内：`(已验收知识点数或交卷数) / 有效学习分钟数` | 同期对比上升 |
| **闭环完成率** `loop_completion_rate` | 满足「航标 + 路径 + ≥1 次交卷 + 路径重算」的用户占比 | ≥ 40%（种子期）→ 60%（成熟期） |
| **弱项收敛率** `weakness_convergence` | 同一 `subject_id` 连续两次交卷 `mastery_score` 或 `score_pct` 差值 ≥ +10 | 活跃用户 ≥ 35% |

**对外一句话（有数据支撑后才可说）**  
「完成梦校闭环的用户，课外 **组织/找资料时间** 下降，**靶向练习与验收密度** 上升。」

---

## 2. 研究队列（Cohort）

### 2.1 入组条件（「主动学习者」）

同时满足：

1. `zhi_school_anchor.target_school` 非空（梦校已锁）
2. `zhi_learning_path` 存在且 `updated_at` 在近 28 天内
3. 近 28 天 ≥ **1** 条 `zhi_assessment_attempts` 或 `zhi_assessment_papers.status = 'reckoned'`

### 2.2 分层标签

| 标签 | 判定 |
|------|------|
| `L0` 围观 | 仅有 bootstrap，无航标 |
| `L1` 已激活 | 有航标 + 路径，无交卷 |
| `L2` 闭环中 | ≥1 次交卷，`dataCompletenessPct` &lt; 70 |
| `L3` 高闭环 | ≥2 次交卷 + `dataCompletenessPct` ≥ 70 + 近 7 天有 `zhi_learning_sessions` 或 `zhi_study_stats` |

### 2.3 对照方式

- **自身前后**：入组后第 1–7 天 vs 第 22–28 天（需用户 `estimated_hours_per_day` 或会话时长）
- **同年级轨道**：`path_json` 内 `curriculumTrack` + `gradeBand` 分组中位数

---

## 3. 一级指标（现表即可算，无需改代码）

### 3.1 投入：时间与节奏

| 指标 ID | 含义 | 主表 / 字段 |
|---------|------|-------------|
| `study_minutes_7d` | 7 日有效学习分钟 | `zhi_learning_sessions.duration_seconds`（`status='completed'`） |
| `study_minutes_7d_b` | 备用 | `zhi_study_stats.total_seconds` |
| `slot_completion_7d` | 计划槽完成率 | `zhi_planned_slots` done/total |
| `streak_days` | 连续学习天 | `zhi_study_stats.streak_day` |
| `video_sessions_7d` | 视频学习次数 | `zhi_video_sessions` |

### 3.2 产出：掌握与验收

| 指标 ID | 含义 | 主表 / 字段 |
|---------|------|-------------|
| `papers_submitted_28d` | 28 天交卷数 | `zhi_assessment_papers.submitted_at` 或 `attempts` |
| `avg_mastery_28d` | 平均掌握分 | `zhi_assessment_attempts.mastery_score` |
| `avg_score_pct_28d` | 平均得分率 | `zhi_assessment_attempts.score_pct` |
| `active_paper_pending` | 待完成主动卷 | `paper_type IN ('chat_active','post_learning_active')` + `status='ready'` |
| `mistake_needs_review` | 待复习错题 | `zhi_mistake_bank.mastery_status='needs_review'` |
| `dream_pct_delta_28d` | 梦校进度变化 | `zhi_progress_snapshots.dream_pct` 首尾差 |

### 3.3 系统是否「真在推」

| 指标 ID | 含义 | 主表 / 字段 |
|---------|------|-------------|
| `path_completeness` | 证据完备度 | `zhi_learning_path.path_json` → `dataCompletenessPct` |
| `weakness_count` | 短板条数 | `path_json` → `weaknessLedger` 长度 |
| `path_updates_28d` | 路径更新次数 | `zhi_learning_path.updated_at` |
| `baseline_fresh` | 建档是否新鲜 | `user_baseline_status.updated_at` |
| `daily_review_done` | 今日日报 | `zhi_daily_reviews` 当日行 |

### 3.4 效率代理（折叠时间核心）

```text
fold_efficiency_index =
  papers_reckoned_28d / max(study_hours_28d, 0.5)

targeted_minutes_ratio =
  minutes_on_top_weak_subject_7d / max(study_minutes_7d, 1)
  -- top_weak_subject 来自 path weaknessLedger[0].subjectId 对应 sessions.subject
```

**解读**：在总时长不变或略降时，`fold_efficiency_index` 上升 → **单位时间验收次数增加**（组织效率提升）。

---

## 4. 二级指标（建议轻量埋点，Phase 2）

现网 **缺少**「对话意图命中」「工具打开来源」等细粒度事件，建议新增单表（可选）：

```sql
CREATE TABLE IF NOT EXISTS zhi_product_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event TEXT NOT NULL,           -- e.g. dialog_intent.comprehensive_assessment
  props_json TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_zhi_product_events_user_time
  ON zhi_product_events(user_id, created_at DESC);
```

| 事件名 | 触发点 | 用途 |
|--------|--------|------|
| `anchor.locked` | 梦校航标保存 | 漏斗起点 |
| `dialog.intent.*` | `zhi-dialog-router` 命中 | 对话转化 |
| `path.rebuilt` | `rebuildLearningPathFromEvidence` | 闭环深度 |
| `assessment.submitted` | 交卷 | 有学必考 |
| `video.matched` | 课件匹配成功 | 资源折叠 |
| `tool.open` | `openTool` | 功能使用分布 |

---

## 5. 验收标准（4 周实验，种子用户 N≥30）

| 级别 | 条件 | 说明 |
|------|------|------|
| **A（可对外谨慎宣传）** | L3 用户占比 ≥ 25%，且 L3 组 `fold_efficiency_index` 第 4 周较第 1 周 **↑≥30%** | 组织效率 |
| **B（可写案例）** | L3 组 `avg_mastery_28d` **↑≥8** 或 `dream_pct_delta_28d` **↑≥5** | 效果 |
| **C（需补课替代叙事）** | L3 组自报/家长反馈「找资料、规划时间」减少（问卷） + B 满足 | 体验 |

未达 A：**不要**使用「完全取代补课/学校」表述。

---

## 6. 现成 SQL 片段（SQLite · `wuxian_learning.db`）

### 6.1 用户分层快照

```sql
SELECT
  u.user_id,
  CASE
    WHEN a.target_school IS NULL OR a.target_school = '' THEN 'L0'
    WHEN p.user_id IS NULL THEN 'L1'
    WHEN (
      SELECT COUNT(*) FROM zhi_assessment_attempts t
      WHERE t.user_id = u.user_id AND t.created_at > strftime('%s', 'now', '-28 days')
    ) < 1 THEN 'L1'
    WHEN COALESCE(json_extract(p.path_json, '$.dataCompletenessPct'), 0) >= 70
     AND (
       SELECT COUNT(*) FROM zhi_assessment_papers ap
       WHERE ap.user_id = u.user_id AND ap.status = 'reckoned'
         AND ap.submitted_at > strftime('%s', 'now', '-28 days')
     ) >= 2 THEN 'L3'
    ELSE 'L2'
  END AS cohort_level
FROM (SELECT DISTINCT user_id FROM zhi_learning_path) u
LEFT JOIN zhi_school_anchor a ON a.user_id = u.user_id
LEFT JOIN zhi_learning_path p ON p.user_id = u.user_id;
```

### 6.2 单用户 28 日折叠效率

```sql
-- :userId
SELECT
  ROUND(COALESCE((
    SELECT SUM(duration_seconds) FROM zhi_learning_sessions
    WHERE user_id = :userId AND status = 'completed'
      AND start_time > datetime('now', '-28 days')
  ), 0) / 3600.0, 2) AS study_hours_28d,
  (SELECT COUNT(*) FROM zhi_assessment_papers
   WHERE user_id = :userId AND status = 'reckoned'
     AND submitted_at > strftime('%s', 'now', '-28 days')) AS papers_reckoned_28d,
  COALESCE(json_extract(path_json, '$.dataCompletenessPct'), 0) AS path_completeness
FROM zhi_learning_path WHERE user_id = :userId;
```

### 6.3 平台周概览（管理后台可对齐）

```sql
SELECT
  COUNT(DISTINCT user_id) AS path_users,
  SUM(CASE WHEN json_extract(path_json, '$.dataCompletenessPct') >= 70 THEN 1 ELSE 0 END) AS high_completeness_users
FROM zhi_learning_path
WHERE updated_at > strftime('%s', 'now', '-28 days');
```

---

## 7. 与管理后台 / 产品对齐

| 管理后台「ZHI 学业」 | 对应指标 |
|---------------------|----------|
| 路径完备度 | `path_completeness` |
| 短板条数 | `weakness_count` |
| 待答主动卷 | `active_paper_pending` |
| 重算路径 | 触发 `path.rebuilt`（Phase 2） |

建议在 **概览 Tab** 增加只读卡片：L1/L2/L3 人数、28 日平均 `fold_efficiency_index`（调用 `npm run metrics:fold-time`）。

---

## 8. 本地跑报告

```bash
npm run metrics:fold-time
# 指定用户
npm run metrics:fold-time -- --userId=你的用户ID
```

脚本：`scripts/metrics-fold-time-report.ts`（只读，不写库）。

---

## 9. 与「取代学校 / 补课」的映射

| 主张 | 应观测的指标 |
|------|-------------|
| 取代「补课里的规划+摸底」 | `path_completeness`↑、`papers_submitted_28d`↑、`dialog.intent` 命中（Phase 2） |
| 取代「找课、找题」 | `video_sessions_7d` + 交卷间隔缩短 |
| 不能取代「老师盯执行」 | `slot_completion_7d`、`streak_days` — 若低，说明仍缺人督 |
| 不能取代「学校进度」 | 需用户维护 `zhi_textbook_catalog` 章节进度，否则加 `textbook_chapter_lag` 告警 |

---

---

## 10. 核心 OKR（一条可验证标准 · 可直接写进周报）

### 10.1 合格主动学习者（QAL · Qualified Active Learner）

**入组（28 天滚动窗口，四条同时满足）：**

| # | 条件 | 数据依据 |
|---|------|----------|
| 1 | 梦校航标已锁 | `zhi_school_anchor.target_school` 非空 |
| 2 | 路径完备度 &gt; 70% | `json_extract(path_json,'$.dataCompletenessPct')` ≥ 70 |
| 3 | ≥ 3 次评估（交卷） | `zhi_assessment_papers.status='reckoned'` 且 `submitted_at` 在 28 天内计数 ≥ 3 |
| 4 | 路径在维护 | `zhi_learning_path.updated_at` 在 28 天内 |

> 注：你提到的「4 周内」= 用 **28 天滚动** 或 **自然周 W1–W4** 均可；种子期建议滚动窗，避免月初入组样本不足。

### 10.2 两条结果指标（二选一达标即可写「折叠时间有效」）

| KR | 指标 | 计算 | 目标（种子期 N≥30） |
|----|------|------|---------------------|
| **KR-A 时间** | 周均有效学习分钟 `weekly_study_minutes` | `sum(zhi_learning_sessions.duration_seconds, 7d) / 60`，仅 `status='completed'` | QAL 用户 **第 4 周 ≥ 第 1 周**，或周均 ≥ 90 分钟且 `fold_efficiency_index` ↑≥30% |
| **KR-B 弱项** | 弱项改善率 `weakness_improvement_rate` | 见 §10.3 | QAL 用户中 **≥35%** 至少 1 个主科 `mastery_score` 提升 ≥10 |

**北极星合成（内部）：**

```text
QAL_rate = QAL 用户数 / 有航标用户数
fold_lift = median(fold_efficiency_index, 第4周) / median(第1周)  -- 仅 QAL
```

### 10.3 弱项改善率（现表可算）

对每个 QAL 用户、每个 `subject_id`：

1. 取 28 天内 `zhi_assessment_attempts`，按 `created_at` 排序；
2. 取该科 **最早** 与 **最近** 两次的 `mastery_score`（若无则退化为 `score_pct`）；
3. 若 `最近 − 最早 ≥ 10` → 该科「弱项收敛」；
4. 用户维度：`weakness_improvement_rate = 1` 若任一主科收敛，否则 `0`；
5. 平台维度：QAL 用户中 `weakness_improvement_rate=1` 的占比。

主科集合（国内轨）：`math, phys, chem, en`；国际轨：`toefl, sat, ap`（按 `path_json.curriculumTrack` 选集合）。

### 10.4 对外话术（达标后）

**谨慎版（需 KR-A 或 KR-B 达标）：**

> 完成梦校航标并坚持「测评—路径—验收」闭环的家庭，孩子课外 **少花在找资料和盲目刷题上的时间**，更多用在 **对准短板的限时练与交卷验收** 上；系统用 28 天内的学习记录与评估数据可回溯。

**禁止版（未达 QAL_rate / fold_lift 前勿用）：**

> 完全替代学校 / 完全替代补课老师 / 学习时间减半成绩不变。

### 10.5 内部 OKR 示例（一季度）

| 目标 | KR1 | KR2 | KR3 |
|------|-----|-----|-----|
| 验证「折叠时间」对产品价值 | QAL_rate ≥ 25%（有航标用户中） | QAL 用户 fold_lift 中位数 ≥ 1.3 | QAL 用户 weakness_improvement_rate ≥ 35% |
| 体验闭环 | L3 占比 ≥ 25% | 7 日留存（有第 2 次交卷）≥ 40% | 家长战报打开率 ≥ 20%（需 companion 埋点） |

### 10.6 QAL 入组 SQL（SQLite）

```sql
SELECT p.user_id,
  json_extract(p.path_json, '$.dataCompletenessPct') AS completeness,
  (SELECT COUNT(*) FROM zhi_assessment_papers ap
   WHERE ap.user_id = p.user_id AND ap.status = 'reckoned'
     AND ap.submitted_at > strftime('%s', 'now', '-28 days')) AS reckoned_28d
FROM zhi_learning_path p
INNER JOIN zhi_school_anchor a ON a.user_id = p.user_id
WHERE trim(a.target_school) != ''
  AND p.updated_at > strftime('%s', 'now', '-28 days')
  AND COALESCE(json_extract(p.path_json, '$.dataCompletenessPct'), 0) >= 70
HAVING reckoned_28d >= 3;
```

---

*文档版本：与 WUXIAN 3.5 数据模型对齐；表结构变更时请同步更新 §6 SQL。*
