import crypto from 'node:crypto';

export const createJwt = (payload, secret) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

export const verifyJwt = (token, secret) => {
  const [header, body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString());
};

export const decodeJwt = (token) => {
  const [, body] = token.split('.');
  return JSON.parse(Buffer.from(body, 'base64url').toString());
};
