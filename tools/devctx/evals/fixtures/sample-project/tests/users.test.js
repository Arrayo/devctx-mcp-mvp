import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UserRepository } from '../src/models/user.js';

describe('UserRepository', () => {
  it('creates and finds user', async () => {
    const repo = new UserRepository();
    const user = await repo.create({ email: 'a@b.com', name: 'A', password: 'x' });
    const found = await repo.findById(user.id);
    assert.equal(found.email, 'a@b.com');
  });

  it('finds user by email', async () => {
    const repo = new UserRepository();
    await repo.create({ email: 'find@me.com', name: 'Find', password: 'x' });
    const found = await repo.findByEmail('find@me.com');
    assert.ok(found);
  });

  it('returns null for missing user', async () => {
    const repo = new UserRepository();
    assert.equal(await repo.findById('nonexistent'), null);
  });
});
