// Configura variables de entorno antes de que cualquier módulo se cargue.
// Esto evita que auth.ts lance "JWT_SECRET environment variable is required"
// y que db/index.ts intente conectarse a una base real durante los tests.
process.env.JWT_SECRET = 'test-jwt-secret-32-chars-long-abc!';
process.env.DATABASE_URL = 'postgresql://localhost:5432/sgf_test';
