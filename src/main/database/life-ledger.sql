-- WUXIAN · 智无限单体生命能量分流阀
-- 账户 A：基础逻辑细胞核 (CORE_LOGIC)
-- 账户 B：重型深度推理核 (DEEP_REASONING)

CREATE TABLE IF NOT EXISTS zhi_life_matrix_ledger (
    user_id TEXT NOT NULL,
    core_logic_tokens INTEGER DEFAULT 100000,
    deep_reasoning_tokens INTEGER DEFAULT 5000,
    frozen_punish_tokens INTEGER DEFAULT 0,
    last_breath_time INTEGER NOT NULL,
    PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS zhi_energy_flow_history (
    flow_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_battle TEXT NOT NULL CHECK(target_battle IN ('AP_KNOWLEDGE_FORGE', 'TOEFL_LANGUAGE_MATRIX')),
    token_type_used TEXT NOT NULL CHECK(token_type_used IN ('CORE_LOGIC', 'DEEP_REASONING')),
    amount_changed INTEGER NOT NULL,
    action_description TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES zhi_life_matrix_ledger(user_id)
);

CREATE INDEX IF NOT EXISTS idx_zhi_energy_flow_user ON zhi_energy_flow_history(user_id);
CREATE INDEX IF NOT EXISTS idx_zhi_energy_flow_ts ON zhi_energy_flow_history(timestamp DESC);
