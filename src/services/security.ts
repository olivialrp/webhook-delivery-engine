import crypto from 'node:crypto';

export const generateSecretKey = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

export const signPayload = (payload: unknown, secretKey: string): string => {
    const stringifiedPayload = JSON.stringify(payload);
    return crypto
        .createHmac('sha256', secretKey)
        .update(stringifiedPayload)
        .digest('hex');
};