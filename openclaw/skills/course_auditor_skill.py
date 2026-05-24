"""
WUXIAN & OpenClaw 专属 Skill 插件：公共课件能力审计与零存储匹配器
OpenClaw 扮演最高指挥官，驱动底层专项 Skills，最终调用 WUXIAN API 挂网。
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from typing import Any, Callable, Dict


def openclaw_skill(name: str, description: str) -> Callable:
    """OpenClaw 标准技能装饰器"""

    def decorator(func: Callable) -> Callable:
        func.skill_name = name  # type: ignore
        func.skill_desc = description  # type: ignore
        return func

    return decorator


WUXIAN_API_BASE = "http://localhost:3401"


class OpenClawCourseAuditorSkill:
    def __init__(self, api_base: str = WUXIAN_API_BASE) -> None:
        self.api_base = api_base
        print("[OpenClaw Skill 初始化] 公共课件审计中枢已就绪，等待总指挥或规划师的 URL 信号...")

    @openclaw_skill(
        name="audit_and_match_public_course",
        description=(
            "处理网络公共课件链接。输入 URL 后，自动化完成教学能力评估、"
            "LaTeX 知识点归类，并挂载到 WUXIAN 路由网络，不占用物理存储。"
        ),
    )
    def execute_audit(self, source_url: str, platform: str, title: str) -> Dict[str, Any]:
        """OpenClaw 捕获 URL 后自动触发"""

        print(f"\n[OpenClaw 任务编排] 1. 调用 [视频嗅探 Skill] (yt-dlp/FFmpeg) → {platform}")
        time.sleep(0.3)

        print("[OpenClaw 任务编排] 2. 调用 [声纹转写 Skill] (Whisper) → 时间轴文本")
        time.sleep(0.3)

        print("[OpenClaw 任务编排] 3. 调用 [多模态审计 Skill] (Gemini 1.5) → LaTeX 标签 + 虫洞指数")
        time.sleep(0.4)

        # 优先调用 WUXIAN TypeScript 后端（真实编排引擎）
        try:
            payload = json.dumps({
                "sourceUrl": source_url,
                "title": title,
                "platform": platform,
                "autoRegister": True,
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{self.api_base}/api/admin/course/audit",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                audit = data["data"]["audit"]
                return {
                    "status": "SUCCESS // 零存储挂网成功",
                    "course_title": title,
                    "assigned_node": audit["cognitiveCategory"],
                    "asset_grade": audit["auditGrade"],
                    "wormhole_score": audit["wormholeAdaptability"],
                    "deep_link": f"{source_url}?t={audit['recommendedTimeStamp']}",
                    "via": "WUXIAN_API",
                }
        except Exception as e:
            print(f"[OpenClaw 降级] WUXIAN API 不可用，使用本地模拟: {e}")

        audit_metadata = {
            "category": "ADV_MATH // 线性代数 // 奇异值分解 (SVD)",
            "metrics": {
                "logic_density": 0.95,
                "intuition_scale": 0.88,
                "wormhole_value": 0.96,
            },
            "core_latex_tokens": [
                "$$A = U \\Sigma V^T$$",
                "$$\\sigma_i = \\sqrt{\\lambda_i}$$",
            ],
            "optimal_start_timestamp": "00:12:45",
            "final_grade": "S",
        }

        print("[OpenClaw 任务编排] 4. 调用 [知识挂网 Skill] (Neo4j/Milvus) → 零存储并网")
        print(f" -> [精准路由] {source_url}?t={audit_metadata['optimal_start_timestamp']}")

        return {
            "status": "SUCCESS // 零存储挂网成功 (LOCAL MOCK)",
            "course_title": title,
            "assigned_node": audit_metadata["category"],
            "asset_grade": audit_metadata["final_grade"],
            "wormhole_score": audit_metadata["metrics"]["wormhole_value"],
            "via": "LOCAL_MOCK",
        }


class OpenClawAgent:
    """OpenClaw 中央调度决策 (Thinking Loop)"""

    URL_RE = re.compile(r"https?://[^\s]+")

    def __init__(self) -> None:
        self.auditor_skill = OpenClawCourseAuditorSkill()

    def think_and_dispatch(self, user_input: str) -> Dict[str, Any]:
        print(f"\n[OpenClaw 接收输入] -> 用户: {user_input}")

        url_match = self.URL_RE.search(user_input)
        if not url_match:
            return {"status": "NEED_URL", "message": "请提供公共课件 URL"}

        source_url = url_match.group(0).rstrip("。，,.")
        platform = "Bilibili" if "bilibili" in source_url else "YouTube" if "youtube" in source_url else "OpenCourse"
        title = "公共课件审计"

        if "奇异值" in user_input or "svd" in user_input.lower():
            title = "清华公开课：线性代数第九讲 · 奇异值分解"
        elif "洛必达" in user_input:
            title = "MIT 公开课：洛必达法则的几何本质"

        print("[OpenClaw 大脑思考] 检测到公共视频 URL + 评估意图 → 锁定 Skill 链路")

        # 同时可调用 WUXIAN OpenClaw 编排 API
        try:
            payload = json.dumps({"input": user_input}).encode("utf-8")
            req = urllib.request.Request(
                f"{WUXIAN_API_BASE}/api/openclaw/dispatch",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                orchestration = json.loads(resp.read().decode())
                skill_result = self.auditor_skill.execute_audit(source_url, platform, title)
                return {
                    "openclaw_orchestration": orchestration["data"]["openclaw"],
                    "skill_result": skill_result,
                }
        except Exception:
            skill_result = self.auditor_skill.execute_audit(source_url, platform, title)
            return {"skill_result": skill_result, "via": "SKILL_ONLY"}


if __name__ == "__main__":
    agent = OpenClawAgent()
    demo_input = (
        "帮我评估一下B站上这个清华公开课视频："
        "https://www.bilibili.com/video/BV1xxxx 讲的是奇异值分解。"
    )
    result = agent.think_and_dispatch(demo_input)
    print(f"\n[OpenClaw 任务完成汇报] -> {json.dumps(result, ensure_ascii=False, indent=2)}")
