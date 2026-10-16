
import { api, jsonBody } from '@/lib/auth/guard';
import { AppError } from '@/lib/errors';
import { approveSalesReturn } from '@/lib/returns/service';

export const POST = api(
  async ({ req, user }) => {
    const body = await jsonBody(req);
    const returnId = body?.returnId;

    if (typeof returnId !== 'string' || !returnId.trim()) {
      throw new AppError(
        400,
        'A valid return ID is required.',
        'INVALID_RETURN_ID',
      );
    }

    return approveSalesReturn(returnId, user.id);
  },
  { admin: true },
);
