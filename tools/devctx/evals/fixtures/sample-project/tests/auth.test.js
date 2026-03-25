import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthMiddleware } from '../src/auth/middleware.js';
import { createJwt } from '../src/utils/jwt.js';

describe('AuthMiddleware', () => {
  const secret = 'test-secret';

  it('rejects requests without token', async () => {
    const middleware = new AuthMiddleware(secret);
    const req = { headers: {} };
    let statusCode;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: () => {},
    };

    await middleware.handle(req, res, () => {});
    assert.equal(statusCode, 401);
  });

  it('accepts valid token', async () => {
    const middleware = new AuthMiddleware(secret);
    const token = createJwt({ sub: '1', roles: ['admin'], exp: Math.floor(Date.now() / 1000) + 3600 }, secret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: () => res, json: () => {} };
    let called = false;

    await middleware.handle(req, res, () => { called = true; });
    assert.ok(called);
    assert.equal(req.user.sub, '1');
  });

  it('validates token expiration', async () => {
    const middleware = new AuthMiddleware(secret);
    const token = createJwt({ sub: '1', exp: 0 }, secret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    let statusCode;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: () => {},
    };

    await middleware.handle(req, res, () => {});
    assert.equal(statusCode, 403);
  });
});
