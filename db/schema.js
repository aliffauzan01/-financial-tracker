import {
  pgTable, serial, varchar, integer, timestamp, text
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  nominal: integer("nominal").notNull(),
  transactionDate: timestamp("transaction_date"),
  status: varchar("status", { length: 50 }),
  description: text("description"),
});
