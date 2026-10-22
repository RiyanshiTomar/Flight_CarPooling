import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/exceptions.filter';

const isProd = () => process.env.NODE_ENV === 'production';

/** Shared by main.ts and the e2e tests so tests exercise the same pipes, filters and headers. */
export function configureApp(app: INestApplication) {
  const http = app.getHttpAdapter().getInstance();
  // behind a load balancer / reverse proxy the real client IP is in X-Forwarded-For (rate limits need it)
  if (process.env.TRUST_PROXY) http.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  http.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(requestLogger());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true, exposedHeaders: ['x-request-id'] });
  app.enableShutdownHooks();
}

/** One line per request with a request id. JSON in production so log tools can index it. */
function requestLogger() {
  const log = new Logger('HTTP');
  return (req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    (req as any).id = id;
    res.setHeader('x-request-id', id);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const line = { id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) };
      if (process.env.LOG_FORMAT === 'json' || isProd()) console.log(JSON.stringify({ level: 'info', ctx: 'http', ...line }));
      else if (process.env.LOG_REQUESTS !== 'false') log.log(`${line.method} ${line.path} ${line.status} ${line.ms}ms`);
    });
    next();
  };
}

/** Load .env, fill safe dev defaults, and refuse to boot with unsafe production settings. */
export function loadEnv() {
  try {
    process.loadEnvFile('.env'); // Node 20.12+; silently skip when there is no .env
  } catch {
    /* no .env file: rely on real environment variables */
  }
  const env = process.env;
  if (!env.JWT_SECRET) {
    if (isProd()) throw new Error('JWT_SECRET must be set in production');
    env.JWT_SECRET = 'dev-only-secret-change-me';
  }
  if (!isProd()) return;

  const problems: string[] = [];
  if (env.JWT_SECRET.length < 32 || env.JWT_SECRET.startsWith('change-me') || env.JWT_SECRET.startsWith('dev-only')) {
    problems.push('JWT_SECRET must be a random string of at least 32 characters (openssl rand -hex 32)');
  }
  if (env.OTP_DEV_ECHO === 'true') problems.push('OTP_DEV_ECHO must not be true in production');
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is required in production (embedded PGlite is for development)');
  if ((env.SMS_PROVIDER ?? 'console') === 'console' && env.ALLOW_CONSOLE_SMS !== 'true') {
    problems.push('Set SMS_PROVIDER to msg91 or twilio in production (or ALLOW_CONSOLE_SMS=true for a closed beta)');
  }
  if (env.FLIGHT_PROVIDER === 'aeroapi' && !env.AEROAPI_KEY) problems.push('AEROAPI_KEY is required when FLIGHT_PROVIDER=aeroapi');
  if (!env.CORS_ORIGINS) problems.push('CORS_ORIGINS must list your website origin(s)');
  if (!env.PUBLIC_WEB_URL) problems.push('PUBLIC_WEB_URL is required (used in share links and SOS messages)');
  if (problems.length) throw new Error(`Unsafe production config:\n - ${problems.join('\n - ')}`);
}
