import { pgTable, serial, text, integer, timestamp, varchar, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const endpoints = pgTable('endpoints', {
    id: serial('id').primaryKey(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    targetUrl: text('target_url').notNull(),
    secretKey: varchar('secret_key', { length: 128 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const events = pgTable('events', {
    id: serial('id').primaryKey(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deliveryAttempts = pgTable('delivery_attempts', {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    endpointId: integer('endpoint_id').notNull().references(() => endpoints.id, { onDelete: 'cascade' }),
    statusCode: integer('status_code'),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: varchar('status', { length: 32 }).notNull(),
    attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
});

export const endpointsRelations = relations(endpoints, ({ many }) => ({
    deliveryAttempts: many(deliveryAttempts),
}));

export const eventsRelations = relations(events, ({ many }) => ({
    deliveryAttempts: many(deliveryAttempts),
}));

export const deliveryAttemptsRelations = relations(deliveryAttempts, ({ one }) => ({
    event: one(events, {
        fields: [deliveryAttempts.eventId],
        references: [events.id],
    }),
    endpoint: one(endpoints, {
        fields: [deliveryAttempts.endpointId],
        references: [endpoints.id],
    }),
}));