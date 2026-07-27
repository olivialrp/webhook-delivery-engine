# Resilient Webhook Delivery Engine — System Architecture

## Architecture & Domain Design
This engine decouples event ingestion from network delivery using an asynchronous message broker. It guarantees at-least-once delivery with exponential backoff retries and cryptographic payload verification.

```text
[ Client Application ]
         │
         ▼ (POST /webhooks/dispatch)
┌────────────────────────────────────────────────────────┐
│ 1. INGESTION API (Fastify + Zod)                       │
│ ├── Strictly validates outgoing payload structure      │
│ ├── Signs payload with HMAC-SHA256 (Secret Key)        │
│ └── Pushes delivery job to Redis Queue                 │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ (Job Queued - Instant 202 Accepted)
                 === 🚀 UPSTASH REDIS / BULLMQ ===
                            │
        ┌───────────────────┴───────────────────┐
        ▼ (Async Pull)                          ▼ (Network Retry Rules)
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ 2. DELIVERY WORKER (BullMQ)  │        │ EXPONENTIAL BACKOFF          │
│ ├── Executes HTTP POST       │        │ ├── Attempt 1: Immediate     │
│ ├── Measures latency         │        │ ├── Attempt 2: 2s delay      │
│ └── Logs status to Postgres  │        │ ├── Attempt 3: 4s delay      │
└──────────────┬───────────────┘        │ └── Attempt 4: 8s delay      │
               │                        └──────────────┬───────────────┘
               ├───────────────────────────────────────┘
               ▼ (After 5 Total Failures)
┌────────────────────────────────────────────────────────┐
│ 3. DEAD-LETTER QUEUE (DLQ) & AUDIT LOG                 │
│ └── Permanently stores failed payloads in PostgreSQL   │
│     for manual developer inspection and re-driving.    │
└────────────────────────────────────────────────────────┘
```

## Database Schema Blueprint
* **`endpoints`**: Stores target URLs, tenant IDs, and cryptographic signing secrets.
* **`events`**: Stores raw incoming event payloads queued for delivery.
* **`delivery_attempts`**: Audit trail logging HTTP status codes, latency, and error traces for every network attempt.

## Core Failure Modes Handled
1. **Target Server Offline (HTTP 500 / 503):** Automatically scheduled for exponential backoff retries.
2. **Network Timeout:** Captured by BullMQ concurrency timers and retried.
3. **Poison Payloads (Permanent 4xx Errors):** Instantly moved to the Dead-Letter Queue without wasting retry cycles.