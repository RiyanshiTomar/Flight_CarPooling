import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

/**
 * One interface, two engines:
 *  - DATABASE_URL set  -> real PostgreSQL through `pg` (production / Docker)
 *  - DATABASE_URL empty -> embedded Postgres (PGlite) stored in ./.data, or in memory for tests
 * All SQL in the app is plain parameterised Postgres SQL, so both behave the same.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy, Queryable {
  private readonly log = new Logger('Db');
  private pool?: import('pg').Pool;
  private lite?: import('@electric-sql/pglite').PGlite;
  private listener?: import('pg').PoolClient;
  private closing = false;

  async onModuleInit() {
    const url = process.env.DATABASE_URL;
    if (url) {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: url,
        max: Number(process.env.DB_POOL_MAX ?? 10),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
      });
      // an idle client dying (DB restart, network blip) must not crash the process
      this.pool.on('error', (e) => this.log.warn(`Idle DB client error: ${e.message}`));
      await this.pool.query('select 1');
      this.log.log('Connected to PostgreSQL');
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      const dir = process.env.PGLITE_DIR ?? './.data/pglite';
      if (dir !== 'memory://' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
      this.lite = new PGlite(dir === 'memory://' ? undefined : dir);
      await this.lite.waitReady;
      this.log.log(`Using embedded Postgres (${dir === 'memory://' ? 'in memory' : dir})`);
    }
    await this.migrate();
  }

  get isPostgres() {
    return !!this.pool;
  }

  /**
   * Cross-instance pub/sub through Postgres LISTEN/NOTIFY (real Postgres only).
   * Returns false on embedded PGlite, where everything runs in one process anyway.
   */
  async listen(channel: string, onPayload: (payload: string) => void): Promise<boolean> {
    if (!this.pool) return false;
    const connect = async () => {
      try {
        const client = await this.pool!.connect();
        client.on('notification', (m) => m.channel === channel && m.payload && onPayload(m.payload));
        client.on('error', (e) => {
          this.log.warn(`LISTEN connection lost (${e.message}), reconnecting`);
          client.release(true);
          if (!this.closing) setTimeout(connect, 2000);
        });
        await client.query(`LISTEN ${channel}`);
        this.listener = client;
      } catch (e: any) {
        this.log.warn(`LISTEN failed (${e.message}), retrying`);
        if (!this.closing) setTimeout(connect, 5000);
      }
    };
    await connect();
    return true;
  }

  async notify(channel: string, payload: string) {
    await this.query('select pg_notify($1, $2)', [channel, payload]);
  }

  async onModuleDestroy() {
    this.closing = true;
    this.listener?.release();
    await this.pool?.end();
    await this.lite?.close();
  }

  async query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    if (this.pool) return (await this.pool.query(text, params as any[])).rows as T[];
    return (await this.lite!.query<T>(text, params)).rows;
  }

  /** Run fn inside one transaction. Use the passed Queryable, not this.query. */
  async tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({ query: async (t, p = []) => (await client.query(t, p as any[])).rows as any });
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    return this.lite!.transaction(async (t) => fn({ query: async (text, p = []) => (await t.query(text, p)).rows as any }));
  }

  /** Append-only SQL migrations from ./migrations, tracked in schema_migrations. */
  private async migrate() {
    await this.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const dir = join(process.cwd(), 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await this.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      this.log.log(`Applying migration ${f}`);
      const sql = readFileSync(join(dir, f), 'utf8');
      await this.tx(async (q) => {
        // simple statement splitter: migrations here contain no $$ blocks
        for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await q.query(stmt);
        await q.query('insert into schema_migrations (name) values ($1)', [f]);
      });
    }
  }
}
