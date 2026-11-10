import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  bannedUntil: integer("banned_until"),
  banReason: text("ban_reason"),
  emailVerified: integer("email_verified").notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  csrf: text("csrf").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  label: text("label").notNull(),
});
export type UserRow = typeof users.$inferSelect;
