import 'dotenv/config';
import Fastify from 'fastify';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { endpoints, events, deliveryAttempts } from './db/schema';
import { generateSecretKey, signPayload } from './services/security';

const server = Fastify({ logger: true });

const redisConnection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    tls: {
        rejectUnauthorized: false,
    },
});

const webhookQueue = new Queue('webhook-delivery-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: true,
    },
});

const worker = new Worker(
    'webhook-delivery-queue',
    async (job: Job) => {
        const { eventId, endpointId, targetUrl, secretKey, payload } = job.data;
        const signature = signPayload(payload, secretKey);
        const startTime = performance.now();

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                },
                body: JSON.stringify(payload),
            });

            const latencyMs = Math.round(performance.now() - startTime);
            const isSuccess = response.status >= 200 && response.status < 300;

            await db.insert(deliveryAttempts).values({
                eventId,
                endpointId,
                statusCode: response.status,
                latencyMs,
                attemptNumber: job.attemptsMade + 1,
                status: isSuccess ? 'SUCCESS' : 'FAILED',
                errorMessage: isSuccess ? null : `HTTP Status ${response.status}`,
            });

            if (!isSuccess && response.status >= 500) {
                throw new Error(`Remote server error: ${response.status}`);
            }

            return { delivered: isSuccess, status: response.status };
        } catch (error: any) {
            const latencyMs = Math.round(performance.now() - startTime);

            await db.insert(deliveryAttempts).values({
                eventId,
                endpointId,
                statusCode: null,
                latencyMs,
                attemptNumber: job.attemptsMade + 1,
                status: 'FAILED',
                errorMessage: error.message || 'Network Timeout / Connection Refused',
            });

            throw error;
        }
    },
    { connection: redisConnection }
);

server.get('/health', async () => ({
    status: 'Online',
    engine: 'Resilient Webhook Delivery Engine',
    redis: redisConnection.status,
}));

server.post('/endpoints', async (request, reply) => {
    const body = request.body as { tenantId: string; targetUrl: string };
    const secretKey = generateSecretKey();

    const [newEndpoint] = await db
        .insert(endpoints)
        .values({
            tenantId: body.tenantId,
            targetUrl: body.targetUrl,
            secretKey,
        })
        .returning();

    return reply.status(201).send(newEndpoint);
});

server.post('/webhooks/dispatch', async (request, reply) => {
    const body = request.body as { tenantId: string; eventType: string; payload: Record<string, unknown> };

    const [savedEvent] = await db
        .insert(events)
        .values({
            eventType: body.eventType,
            payload: body.payload,
        })
        .returning();

    const targetEndpoints = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.tenantId, body.tenantId));

    for (const endpoint of targetEndpoints) {
        await webhookQueue.add('deliver-webhook', {
            eventId: savedEvent.id,
            endpointId: endpoint.id,
            targetUrl: endpoint.targetUrl,
            secretKey: endpoint.secretKey,
            payload: {
                id: savedEvent.id,
                event: savedEvent.eventType,
                data: savedEvent.payload,
                timestamp: savedEvent.createdAt,
            },
        });
    }

    return reply.status(202).send({
        status: 'Accepted',
        message: `Dispatched to ${targetEndpoints.length} registered endpoint(s).`,
        eventId: savedEvent.id,
    });
});

const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`⚡ Engine live at http://localhost:${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();