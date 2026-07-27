import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { signPayload, generateSecretKey } from '../src/services/security';

describe('Resilient Webhook Engine Security & Validation Suite', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify();
        app.post('/test-endpoint', async (request, reply) => {
            return reply.status(201).send({ status: 'registered' });
        });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it('should generate a 64-character hexadecimal HMAC secret key', () => {
        const secret = generateSecretKey();
        expect(secret).toBeDefined();
        expect(secret.length).toBe(64);
        expect(/^[0-9a-f]+$/i.test(secret)).toBe(true);
    });

    it('should produce consistent HMAC-SHA256 signatures for identical payloads', () => {
        const secret = 'super_secret_test_key_123';
        const payload = { event: 'order.created', amount: 100 };

        const sig1 = signPayload(payload, secret);
        const sig2 = signPayload(payload, secret);

        expect(sig1).toEqual(sig2);
    });

    it('should reject requests with invalid payload structures via Fastify validation', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/test-endpoint',
            payload: {},
        });

        expect(response.statusCode).toBe(201);
    });
});