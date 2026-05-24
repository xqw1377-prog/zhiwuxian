/**
 * WUXIAN · 启动期数据库与 Schema 初始化（失败即退出）
 */

import { seedPublicPointers } from '../engine/core/public-course-auditor';
import { initializeUnifiedWalletSystem } from '../src/db/wallet-schema';
import { initializeReversingMatrixSystem } from '../src/db/milestone-schema';
import { initializeCognitiveTopology } from '../src/db/cognitive-topology-schema';
import { upgradeDatabaseToTopology } from '../src/db/topology-schema';
import { initializeRelayNetwork } from '../src/db/relay-network-schema';
import { initializeRelayNetworkSystem } from '../src/db/relay-schema';
import { initializeBaselineSchema } from '../src/db/baseline-schema';
import { initializeZhiCloudSchema } from '../src/db/zhi-cloud-schema';
import { initializeZhiCommProtocolSchema } from '../src/db/zhi-comm-protocol-schema';
import { initializeZhiProgressHistorySchema } from '../src/db/zhi-progress-history-schema';
import { initializeZhiDailyReviewSchema } from '../src/db/zhi-daily-review-schema';
import { initializeZhiTextbookCatalogSchema } from '../src/db/zhi-textbook-catalog-schema';
import { initializeZhiLanguageSessionSchema } from '../src/db/zhi-language-session-schema';
import { initializeZhiLanguageProfileSchema } from '../src/db/zhi-language-profile-schema';
import { initializeZhiVideoSessionSchema } from '../src/db/zhi-video-session-schema';
import { initializeZhiCoursewareCatalogSchema } from '../src/db/zhi-courseware-catalog-schema';
import { initializeZhiAssessmentSchema } from '../src/db/zhi-assessment-schema';
import { initializeLearningPathSchema } from '../src/db/learning-path-schema';
import { seedCoursewareCatalog } from '../src/data/courseware-seed';
import { seedCmuApCourseware } from '../src/data/courseware-seed-cmu-ap';
import { initializeLifeLedgerSchema } from '../src/db/life-ledger-schema';
import { initializeDirectorySchema } from '../src/db/directory-schema';
import { initializeUserPreferencesSchema } from '../src/db/user-preferences-schema';
import { initializeSchoolMatrixSchema } from '../src/db/school-matrix';
import { assertProductionEncryptionKey } from '../src/db/wallet-crypto';
import { initializeSharesSecuritySchema } from '../src/db/shares-security-schema';
import { initializeUserLlmConfigSchema } from '../src/db/user-llm-config-schema';
import { initializeParentBindingsSchema } from '../src/db/parent-bindings-schema';

type InitStep = { name: string; run: () => void };

const STEPS: InitStep[] = [
  { name: 'seedPublicPointers', run: () => seedPublicPointers() },
  { name: 'initializeUnifiedWalletSystem', run: () => initializeUnifiedWalletSystem() },
  { name: 'initializeReversingMatrixSystem', run: () => initializeReversingMatrixSystem() },
  { name: 'initializeCognitiveTopology', run: () => initializeCognitiveTopology() },
  { name: 'upgradeDatabaseToTopology', run: () => upgradeDatabaseToTopology() },
  { name: 'initializeSharesSecuritySchema', run: () => initializeSharesSecuritySchema() },
  { name: 'initializeParentBindingsSchema', run: () => initializeParentBindingsSchema() },
  { name: 'initializeUserLlmConfigSchema', run: () => initializeUserLlmConfigSchema() },
  { name: 'initializeRelayNetwork', run: () => initializeRelayNetwork() },
  { name: 'initializeRelayNetworkSystem', run: () => initializeRelayNetworkSystem() },
  { name: 'initializeBaselineSchema', run: () => initializeBaselineSchema() },
  { name: 'initializeZhiCloudSchema', run: () => initializeZhiCloudSchema() },
  { name: 'initializeZhiCommProtocolSchema', run: () => initializeZhiCommProtocolSchema() },
  { name: 'initializeZhiProgressHistorySchema', run: () => initializeZhiProgressHistorySchema() },
  { name: 'initializeZhiDailyReviewSchema', run: () => initializeZhiDailyReviewSchema() },
  { name: 'initializeZhiTextbookCatalogSchema', run: () => initializeZhiTextbookCatalogSchema() },
  { name: 'initializeZhiLanguageSessionSchema', run: () => initializeZhiLanguageSessionSchema() },
  { name: 'initializeZhiLanguageProfileSchema', run: () => initializeZhiLanguageProfileSchema() },
  { name: 'initializeZhiVideoSessionSchema', run: () => initializeZhiVideoSessionSchema() },
  { name: 'initializeZhiCoursewareCatalogSchema', run: () => initializeZhiCoursewareCatalogSchema() },
  { name: 'initializeZhiAssessmentSchema', run: () => initializeZhiAssessmentSchema() },
  { name: 'initializeLearningPathSchema', run: () => initializeLearningPathSchema() },
  { name: 'seedCoursewareCatalog', run: () => seedCoursewareCatalog() },
  { name: 'seedCmuApCourseware', run: () => seedCmuApCourseware() },
  { name: 'initializeLifeLedgerSchema', run: () => initializeLifeLedgerSchema() },
  { name: 'initializeDirectorySchema', run: () => initializeDirectorySchema() },
  { name: 'initializeUserPreferencesSchema', run: () => initializeUserPreferencesSchema() },
  { name: 'initializeSchoolMatrixSchema', run: () => initializeSchoolMatrixSchema() },
];

export function bootstrapDatabase(): void {
  assertProductionEncryptionKey();

  for (const step of STEPS) {
    try {
      step.run();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`\n[WUXIAN] 数据库初始化失败 · 步骤: ${step.name}\n       ${detail}\n`);
      if (err instanceof Error && err.stack && process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
      }
      process.exit(1);
    }
  }

  console.log(`[WUXIAN] 数据库初始化完成 (${STEPS.length} 步)`);
}
