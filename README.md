# Resilient Webhook Delivery Engine — Enterprise Asynchronous Dispatcher

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.0+-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Redis_Queue-FF4438?logo=redis&logoColor=white)](https://docs.bullmq.io/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)

A fault-tolerant, cloud-native webhook dispatching engine engineered to guarantee at-least-once event delivery across unreliable internet networks. Features asynchronous message queuing, cryptographic HMAC-SHA256 payload signing, automated exponential backoff retries, and an immutable relational audit trail.

---

## 🛡️ System Architecture & Data Flow

Standard CRUD APIs fail when third-party destination servers experience downtime or network latency. This engine decouples ingestion from delivery by placing an Upstash Redis message broker between the incoming event stream and the outbound HTTP worker.

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

---

## 🚀 Key Enterprise Features

* **Asynchronous Ingestion (`202 Accepted`):** Incoming webhook dispatches are validated and queued instantly, shielding the primary web server from external network latency or connection hang-ups.
* **Cryptographic Payload Verification:** Every outbound HTTP request is signed using an HMAC-SHA256 hash generated from the tenant's unique 128-character secret key, transmitting via the `X-Webhook-Signature` header to prevent man-in-the-middle tampering.
* **Exponential Backoff Retries:** If a target server returns a `5xx` server error or drops the TCP connection, BullMQ automatically schedules up to 5 retries with exponentially doubling time delays.
* **Full-Resolution Audit Logging:** Uses Drizzle ORM and Neon Serverless PostgreSQL to log every network attempt, recording exact millisecond execution latency, HTTP response status codes, and error traces.

---

## 🛠️ Local Setup & Quickstart

### 1. Clone & Install Dependencies
```bash
git clone [https://github.com/olivialrp/webhook-delivery-engine.git](https://github.com/olivialrp/webhook-delivery-engine.git)
cd webhook-delivery-engine
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL="postgresql://username:password@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
REDIS_URL="rediss://default:password@endpoint.upstash.io:6379"
```

### 3. Push Database Schema
```bash
npx drizzle-kit push
```

### 4. Boot the Engine
```bash
npm run dev
```

---

## 🧪 Automated Testing

Includes an in-memory security and contract test suite powered by **Vitest**. Execute the test suite:
```bash
npm test
```