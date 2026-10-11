import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Shared by main.ts and the e2e tests so tests exercise the same pipes. */
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true });
}

export function loadEnv() {
  try {
    process.loadEnvFile('.env'); // Node 20.12+; silently skip when there is no .env
  } catch {
    /* no .env file: rely on real environment variables */
  }
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
    process.env.JWT_SECRET = 'dev-only-secret-change-me';
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.startsWith('change-me')) {
    throw new Error('Set a real JWT_SECRET in production');
  }
}
