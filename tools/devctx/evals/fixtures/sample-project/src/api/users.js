import { UserRepository } from '../models/user.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('info');

export const createUser = async (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const repo = new UserRepository();
    const existing = await repo.findByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    const user = await repo.create({ email, name, password });
    logger.info('User created', { userId: user.id });
    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    logger.error('Failed to create user', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUser = async (req, res) => {
  const repo = new UserRepository();
  const user = await repo.findById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name });
};

export const listUsers = async (_req, res) => {
  const repo = new UserRepository();
  const users = await repo.findAll();
  res.json(users.map((u) => ({ id: u.id, email: u.email, name: u.name })));
};
