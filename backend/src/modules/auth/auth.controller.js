/**
 * Translates HTTP into service calls and back. No business rules here.
 *
 * The refresh token is delivered as an HttpOnly cookie so page JavaScript
 * cannot read it; it is also returned in the body for non-browser clients such
 * as the provider mobile app planned for phase 2 of the roadmap.
 */
import env from '../../config/env.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/apiResponse.js';
import * as service from './auth.service.js';

const COOKIE_NAME = 'sst_refresh';

const cookieOptions = (expiresAt) => ({
  httpOnly: true,
  // Driven by COOKIE_SECURE, which defaults to NODE_ENV. See the note on it
  // in config/env.js: a Secure cookie over plain HTTP is dropped silently.
  secure: env.cookieSecure,
  // SameSite=None would require Secure, so an insecure deployment stays on
  // Lax. Lax still blocks the cross-site POST that CSRF depends on.
  sameSite: env.cookieSecure ? 'strict' : 'lax',
  path: '/',
  expires: expiresAt ? new Date(expiresAt) : undefined,
});

const context = (req) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

function withSession(res, result) {
  res.cookie(COOKIE_NAME, result.refreshToken, cookieOptions(result.refreshExpiresAt));
  return result;
}

export const register = asyncHandler(async (req, res) => {
  const result = withSession(res, await service.register(req.body, context(req)));
  return created(res, result, 'Account created. Confirm your contact details to finish setting up.');
});

export const login = asyncHandler(async (req, res) => {
  const result = withSession(res, await service.login(req.body, context(req)));
  return ok(res, result, { message: 'Signed in successfully' });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;
  const result = withSession(res, await service.refresh(token, context(req)));
  return ok(res, result, { message: 'Session refreshed' });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;
  await service.logout(token);
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return ok(res, null, { message: 'Signed out' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  const result = await service.logoutEverywhere(req.user.id);
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return ok(res, result, { message: 'Signed out of all devices' });
});

export const me = asyncHandler(async (req, res) => ok(res, await service.me(req.user.id)));

export const updateProfile = asyncHandler(async (req, res) =>
  ok(res, await service.updateProfile(req.user.id, req.body), { message: 'Profile updated' }),
);

export const sendOtp = asyncHandler(async (req, res) =>
  ok(res, await service.sendOtp(req.body), { message: 'Verification code sent' }),
);

export const confirmContact = asyncHandler(async (req, res) =>
  ok(res, await service.confirmContact(req.body), { message: 'Contact details confirmed' }),
);

export const changePassword = asyncHandler(async (req, res) => {
  const result = await service.changePassword(req.user.id, req.body);
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return ok(res, result, { message: 'Password changed. Please sign in again.' });
});

export const resetPassword = asyncHandler(async (req, res) =>
  ok(res, await service.resetPassword(req.body), {
    message: 'Password reset. Please sign in with your new password.',
  }),
);

export default {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  updateProfile,
  sendOtp,
  confirmContact,
  changePassword,
  resetPassword,
};
