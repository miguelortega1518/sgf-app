import { getSession } from '@/lib/auth';
import { success, error } from '@/lib/api-utils';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return error('No autorizado', 401);
  }
  return success({ user: session });
}
