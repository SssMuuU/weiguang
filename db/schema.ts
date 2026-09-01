import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appState = sqliteTable('app_state', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
});
