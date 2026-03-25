const users = new Map();
let nextId = 1;

export class UserRepository {
  async create({ email, name, password }) {
    const id = String(nextId++);
    const user = { id, email, name, password, createdAt: new Date() };
    users.set(id, user);
    return user;
  }

  async findById(id) {
    return users.get(id) ?? null;
  }

  async findByEmail(email) {
    for (const user of users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findAll() {
    return [...users.values()];
  }

  async deleteById(id) {
    return users.delete(id);
  }
}
