import { destroySession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';

export async function POST() {
  try {
    await destroySession();
    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
