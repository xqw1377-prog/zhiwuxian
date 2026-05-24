# WUXIAN 统一 LLM 网关



生产代码应通过 `src/services/llm-gateway.ts` 调用模型，而不是直接 `client.chat.completions.create`。



## 计费（二选一，避免双扣）



| 模式 | 用法 | 说明 |

|------|------|------|

| **固定 Warp** | `flatWarp: { cost, reason }` | 平台托管先扣固定燃料；网关内 `billable: false` |

| **按 token** | 不传 `flatWarp` | 平台托管走 `initLlmBilling` 钩子按 token 扣费 |

| **自备 Key** | 用户 Keyring 已配置 | 不扣平台 Warp |

| **外部已扣 Warp** | `billable: false` 且无 `flatWarp` | 如 `vision-router` 先扣 `VISION_INTERCEPT` 再调网关 |



## API



```typescript

import {

  gatewayJsonCompletion,

  gatewayTextCompletion,

  gatewayOpenAiMessages,

  resolveVisionGatewayLlm,

} from '../services/llm-gateway';



const gw = await gatewayJsonCompletion<MyDto>(userId, messages, {

  traceId: 'feature_x',

  maxTokens: 900,

  timeout: 20_000,

  flatWarp: { cost: WARP_COST.MENTOR_INTERVENTION, reason: 'MENTOR_INTERVENTION' },

});



if (!gw.chargeOk) { /* 燃料不足 */ }

if (gw.data) { /* 成功 */ }

if (gw.usedFallback) { /* 超时/无 Key → 启发式 */ }

```



底层：`server/llm/llm-provider.ts` → `chatCompletionJson` / `chatCompletionMessages`（默认 15s 超时、JSON 解析、启发式 fallback）。



## 已迁移



- `zhi-core.ts`、`deepseek-mentor.ts`、`metrics-compiler.ts`

- `zhi-language.ts`、`relay-router.ts`、`reversing-engine-api.ts`

- `mentor-engine.ts`、`active-mentor.ts`、`planner-engine.ts`

- `zhi-causal-report.ts`、`zhi-topology.ts`、`zhi-exam.ts`

- `zhi-video-coach.ts`、`zhi-shadow.ts`、`zhi-learning-assessment.ts`

- `zhi-vision-intake.ts`、`vision-router.ts`、`fault-tolerance.ts`

- `omni-orchestrator.ts`（`billable: false`，工具激活仍走 `consumeWarpPointsStrict`）

- `ai-service.ts`（视频语义分块，需 `userId`）

- `server/vision-capture.ts`（多模态读图）



## 测试

- 单元：`npm test` → `test/llm-gateway.test.ts`（mock 断言 flatWarp / billable / 自备 Key）
- E2E：`npm run e2e:gateway-warp`（需 `npm run server`；`/api/v3.5/zhi/topology` 校验 Warp 扣减）
- P0 套件含拓扑扣费抽检：`npm run e2e:p0`

## 例外 / 脚本

- `server/llm/llm-provider.ts`：网关实现层
- `scripts/test-llm-keys.ts`：密钥连通性探测（故意直连，非生产路径）

