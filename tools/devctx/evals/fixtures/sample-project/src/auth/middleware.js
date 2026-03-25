import { verifyJwt } from '../utils/jwt.js';

export class AuthMiddleware {
  constructor(secretKey) {
    this.secretKey = secretKey;
  }

  async handle(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Missing token' });
      return;
    }

    try {
      req.user = await this.validateToken(token);
      next();
    } catch {
      res.status(403).json({ error: 'Invalid token' });
    }
  }

  async validateToken(token) {
    const payload = verifyJwt(token, this.secretKey);
    if (!payload || payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }
    return payload;
  }
}

export const requireRole = (role) => (req, res, next) => {
  if (!req.user?.roles?.includes(role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  next();
};
