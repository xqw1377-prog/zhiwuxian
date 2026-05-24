import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { pgTable, text as pgText, integer as pgInteger, real as pgReal } from 'drizzle-orm/pg-core';

export const goalsSqlite = sqliteTable('goals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  durationDays: integer('duration_days'),
  remainingDays: integer('remaining_days'),
  driveForce: text('drive_force'),
  totalEnergy: real('total_energy'),
  currentSlope: real('current_slope'),
  status: text('status').notNull().default('ACTIVE'),
  personaType: text('persona_type'),
  warpPowerConsumed: real('warp_power_consumed'),
  goalType: text('goal_type'),
  userId: text('user_id'),
  directoryId: text('directory_id'),
  workspaceId: text('workspace_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const goalsPg = pgTable('goals', {
  id: pgText('id').primaryKey(),
  title: pgText('title').notNull(),
  durationDays: pgInteger('duration_days'),
  remainingDays: pgInteger('remaining_days'),
  driveForce: pgText('drive_force'),
  totalEnergy: pgReal('total_energy'),
  currentSlope: pgReal('current_slope'),
  status: pgText('status').notNull().default('ACTIVE'),
  personaType: pgText('persona_type'),
  warpPowerConsumed: pgReal('warp_power_consumed'),
  goalType: pgText('goal_type'),
  userId: pgText('user_id'),
  directoryId: pgText('directory_id'),
  workspaceId: pgText('workspace_id'),
  createdAt: pgText('created_at'),
  updatedAt: pgText('updated_at'),
});
