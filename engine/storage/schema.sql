-- WUXIAN · 工业级持久化骨架
-- PostgreSQL 生产部署参考 · 当前运行时由 industrial-store.ts JSON 实现

CREATE TABLE IF NOT EXISTS goals (
    id              VARCHAR(64) PRIMARY KEY,
    user_id         VARCHAR(64) NOT NULL,
    title           TEXT NOT NULL,
    duration_days   INT NOT NULL,
    remaining_days  INT NOT NULL,
    drive_force     TEXT NOT NULL DEFAULT '',
    total_energy    FLOAT NOT NULL,
    current_slope   FLOAT NOT NULL,
    status          VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, PAUSED, COMPLETED, DOWNGRADED, RISK_ALERT
    persona_type    VARCHAR(20) NOT NULL,          -- COACH, BUDDY, MENTOR
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_goals_user ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(status);

CREATE TABLE IF NOT EXISTS tasks (
    id              VARCHAR(64) PRIMARY KEY,
    goal_id         VARCHAR(64) NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    sequence_date   DATE NOT NULL,
    content         TEXT NOT NULL,
    energy_cost     FLOAT NOT NULL,
    status          VARCHAR(20) DEFAULT 'TODO',      -- TODO, DONE, FAILED, DROPPED
    fail_reason     TEXT,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_goal_date ON tasks(goal_id, sequence_date);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS reroute_logs (
    id                VARCHAR(64) PRIMARY KEY,
    goal_id           VARCHAR(64) NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    trigger_type      VARCHAR(30) NOT NULL,        -- MISSED_1_DAY, CONTINUOUS_FAIL, USER_HELP, NIGHT_PATROL
    old_slope         FLOAT NOT NULL,
    new_slope         FLOAT NOT NULL,
    action_taken      VARCHAR(30) NOT NULL,        -- SMOOTH_SHARING, TASK_DEGRADATION, CRITICAL_INTERVENTION
    persona_feedback  TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reroute_goal ON reroute_logs(goal_id, created_at DESC);
