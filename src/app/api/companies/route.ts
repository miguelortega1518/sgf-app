import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { requireSession, requireRole } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { z } from 'zod';

const createCompanySchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(200),
});

export async function GET() {
  try {
    await requireSession();
    const all = await db.select().from(companies);
    return success(all);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const body = await req.json();
    const input = createCompanySchema.parse(body);

    const [company] = await db.insert(companies).values({
      name: input.name,
    }).returning();

    return success(company, 201);
  } catch (err) {
    return handleError(err);
  }
}
