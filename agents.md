# 🤖 AI Assistant Navigation & Architecture Guide

## Project Overview
This repository is an enterprise-grade Resilient Webhook Delivery Engine built with TypeScript, Fastify, BullMQ, Upstash Redis, and Drizzle ORM connected to Neon Serverless PostgreSQL.

## Core Architectural Rules
1. **No Synchronous Database Writes in HTTP Loop:** The HTTP ingestion layer (`POST /webhooks/dispatch`) must ONLY validate payloads via Zod/AJV, insert the raw event record into PostgreSQL, push delivery jobs to Upstash Redis, and immediately return an HTTP `202 Accepted`. Never execute synchronous HTTP delivery requests inside the API route.
2. **Co-Located Worker Execution:** BullMQ workers run inside the primary Node.js process to optimize serverless cloud execution. Do not separate worker initialization into standalone containers without explicit instruction.
3. **Cryptographic Enforcement:** All outgoing webhook payloads must be signed using HMAC-SHA256 via `src/services/security.ts`. The generated signature must be attached to outgoing HTTP requests via the `X-Webhook-Signature` header.
4. **Audit Trail Immutability:** Every network delivery attempt (success or failure) must insert an immutable audit record into the `delivery_attempts` table, recording HTTP status codes, latency in milliseconds, and error messages.

## Testing & Maintenance Commands
* Run automated suite: `npm test`
* Push database schema: `npx drizzle-kit push`
* Start local engine: `npm run dev`