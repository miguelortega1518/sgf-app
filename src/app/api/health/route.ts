import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as appSchema from '@/lib/db/schema';
import { checkSchema, describeDiff, expectedFromModule, isClean, type Query } from '@/lib/db/schema-check';
import { classifyError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const expected = expectedFromModule(appSchema);
let cache: { at: number; clean: boolean } | null = null;

/**
 * Salud del servicio. Responde 200 solo si hay base de datos Y la base tiene todo lo que el código espera.
 * Si Render usa esta ruta como chequeo de salud, un deploy con el esquema desfasado no recibe tráfico.
 * Es pública a propósito: no devuelve conteos ni mensajes de error, solo estados.
 */
export async function GET() {
  const base = { commit: (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7), timestamp: new Date().toISOString() };

  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    const info = classifyError(err);
    logger.error('health_db_failed', { code: info.code, detail: info.detail });
    return NextResponse.json({ status: 'error', db: 'failed', schema: 'unknown', ...base }, { status: 503 });
  }

  try {
    // El esquema casi nunca cambia: se revisa a lo sumo cada 30 s (cada 5 s mientras esté desfasado).
    const ttl = cache?.clean ? 30_000 : 5_000;
    if (!cache || Date.now() - cache.at > ttl) {
      const query: Query = async (text) => (await db.execute(sql.raw(text))) as unknown as Record<string, unknown>[];
      const diff = await checkSchema(query, expected);
      cache = { at: Date.now(), clean: isClean(diff) };
      if (!cache.clean) logger.error('health_schema_drift', { missing: describeDiff(diff) });
    }
  } catch (err) {
    const info = classifyError(err);
    logger.error('health_schema_check_failed', { code: info.code, detail: info.detail });
    return NextResponse.json({ status: 'error', db: 'connected', schema: 'unknown', ...base }, { status: 503 });
  }

  if (!cache.clean) {
    return NextResponse.json({ status: 'error', db: 'connected', schema: 'drift', ...base }, { status: 503 });
  }
  return NextResponse.json({ status: 'ok', db: 'connected', schema: 'ok', ...base });
}
