import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  now: Date;
}): boolean {
  if (input.secret.length < 16 || !/^\d{10,13}$/.test(input.timestamp)) {
    return false;
  }
  const stamped = Number(input.timestamp);
  const millis = input.timestamp.length === 10 ? stamped * 1000 : stamped;
  if (Math.abs(input.now.getTime() - millis) > 5 * 60 * 1000) {
    return false;
  }
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
