/**
 * Auth routes. Each line declares who may reach the endpoint; the enforcement
 * itself lives in the middleware, never in the controller.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate, reloadUser } from '../../middleware/authenticate.js';
import { authLimiter, otpLimiter } from '../../middleware/rateLimit.js';
import * as controller from './auth.controller.js';
import * as schema from './auth.validation.js';

const router = Router();

// ---------- public ----------
router.post('/register', authLimiter, validate({ body: schema.registerSchema }), controller.register);
router.post('/login', authLimiter, validate({ body: schema.loginSchema }), controller.login);
router.post('/refresh', validate({ body: schema.refreshSchema }), controller.refresh);
router.post('/logout', controller.logout);

router.post('/otp/send', otpLimiter, validate({ body: schema.sendOtpSchema }), controller.sendOtp);
router.post('/otp/verify', otpLimiter, validate({ body: schema.confirmContactSchema }), controller.confirmContact);
router.post('/password/reset', authLimiter, validate({ body: schema.resetPasswordSchema }), controller.resetPassword);

// ---------- signed in ----------
router.use(authenticate);

router.get('/me', controller.me);
router.patch('/me', validate({ body: schema.updateProfileSchema }), controller.updateProfile);
router.post('/logout-all', controller.logoutAll);

// Password change re-reads the account, so a stale token cannot be used to
// take over an account that was suspended a moment ago.
router.post(
  '/password/change',
  reloadUser,
  validate({ body: schema.changePasswordSchema }),
  controller.changePassword,
);

export default router;
