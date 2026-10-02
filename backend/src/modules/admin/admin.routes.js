/**
 * Admin governance and analytics routes.
 *
 * Every route here is admin-only and audit-logged where it changes something.
 * The analytics endpoints are read-only aggregates; the settings and payout
 * endpoints move real money, so they record who did what and why.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { adminOnly } from '../../middleware/authorize.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import * as controller from './admin.controller.js';
import * as schema from './admin.validation.js';

const router = Router();

router.use(authenticate, adminOnly);

// ---------- analytics ----------
router.get('/analytics/dashboard', validate({ query: schema.rangeSchema }), controller.dashboard);
router.get('/analytics/series', validate({ query: schema.seriesSchema }), controller.series);
router.get('/analytics/categories', validate({ query: schema.topSchema }), controller.categories);
router.get('/analytics/locations', validate({ query: schema.topSchema }), controller.locations);
router.get(
  '/analytics/providers',
  validate({ query: schema.providerPerformanceSchema }),
  controller.providerPerformance,
);

// ---------- reports ----------
// Read-only, row-level, and exportable. Separate from analytics on purpose:
// these are the rows you reconcile against a bank statement, not a dashboard.
router.get('/reports/services', validate({ query: schema.serviceReportSchema }), controller.serviceReport);
router.get('/reports/payouts', validate({ query: schema.payoutReportSchema }), controller.payoutReport);

// ---------- platform settings ----------
router.get('/settings', controller.getSettings);
router.put(
  '/settings/:key',
  writeLimiter,
  validate({ params: schema.settingKeyParam }),
  controller.updateSetting,
);

// ---------- payouts ----------
router.get('/payouts', validate({ query: schema.payoutListSchema }), controller.listPayouts);
router.get('/payouts/preview', controller.payoutPreview);
router.post('/payouts/run', writeLimiter, controller.runPayouts);
router.post(
  '/payouts/providers/:id',
  writeLimiter,
  validate({ params: schema.idParamSchema }),
  controller.payProvider,
);

// Manual settlement: an admin moves the money themselves, then records it.
router.post(
  '/payouts/:id/mark-paid',
  writeLimiter,
  validate({ params: schema.idParamSchema, body: schema.markPaidSchema }),
  controller.markPayoutPaid,
);
router.post(
  '/payouts/:id/mark-failed',
  writeLimiter,
  validate({ params: schema.idParamSchema, body: schema.markFailedSchema }),
  controller.markPayoutFailed,
);

export default router;
