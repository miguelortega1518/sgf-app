import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { count } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [result] = await db.select({ total: count() }).from(persons);
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      personCount: result.total,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      db: 'failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
