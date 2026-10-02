import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created, paginated } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { q } from '../../middleware/validate.js';
import { getPagination } from '../../utils/pagination.js';
import { record, AUDIT } from '../../services/audit.service.js';
import * as service from './review.service.js';

export const create = asyncHandler(async (req, res) =>
  created(res, await service.createReview(req.body.bookingId, req.user.id, req.body), 'Thanks for your review'),
);

export const forProvider = asyncHandler(async (req, res) => {
  const query = q(req);
  const { page, limit, offset } = getPagination(query, { defaultLimit: 10, maxLimit: 50 });
  const result = await service.listForProvider(req.params.id, { ...query, limit, offset });
  return paginated(res, result.items, { page, limit, total: result.total });
});

export const summary = asyncHandler(async (req, res) => {
  const result = await service.listForProvider(req.params.id, { limit: 0, offset: 0 });
  return ok(res, result.summary);
});

export const mine = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(q(req));
  const result = await service.listForCustomer(req.user.id, { limit, offset });
  return paginated(res, result.items, { page, limit, total: result.total });
});

export const pending = asyncHandler(async (req, res) =>
  ok(res, await service.pendingReviews(req.user.id)),
);

export const reply = asyncHandler(async (req, res) => {
  if (!req.user.providerId) throw ApiError.forbidden('This account has no provider profile');
  return ok(res, await service.reply(req.params.id, req.user.providerId, req.body.reply), {
    message: 'Reply posted',
  });
});

export const report = asyncHandler(async (req, res) =>
  ok(res, await service.reportReview(req.params.id, req.user.id, req.body), {
    message: 'Thanks for reporting this. Our team will review it.',
  }),
);

export const queue = asyncHandler(async (req, res) => {
  const query = q(req);
  const { page, limit, offset } = getPagination(query);
  const result = await service.moderationQueue({ ...query, limit, offset });
  return paginated(res, result.items, { page, limit, total: result.total });
});

export const moderate = asyncHandler(async (req, res) => {
  const result = await service.moderate(req.params.id, req.user.id, req.body);

  await record(req, {
    action: AUDIT.REVIEW_MODERATED,
    entityType: 'review',
    entityId: req.params.id,
    after: { status: req.body.status },
    reason: req.body.reason ?? null,
  });

  return ok(res, result, { message: 'Review moderated' });
});

export default { create, forProvider, summary, mine, pending, reply, report, queue, moderate };
