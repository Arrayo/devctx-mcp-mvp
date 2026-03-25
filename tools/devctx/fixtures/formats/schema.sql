CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users(email);

WITH active_users AS (
  SELECT id, email FROM users
)
SELECT * FROM active_users;
