/**
 * Authentication business logic. Knows nothing about HTTP.
 */
import bcrypt from 'bcryptjs';
import { withTransaction } from '../../db/pool.js';
import env from '../../config/env.js';
import { ROLES } from '../../config/constants.js';
import ApiError from '../../utils/ApiError.js';
import * as repo from './auth.repository.js';
import * as tokens from '../../services/token.service.js';
import { issueOtp, verifyOtp, OTP_PURPOSE } from '../../services/otp.service.js';
import { notifyAsync } from '../../services/notification.service.js';

/** The shape the API returns for a user. Never includes the password hash. */
function present(user) {
  return {
    id: user.id,
    role: user.role,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url ?? null,
    status: user.status,
    emailVerified: Boolean(user.email_verified_at),
    phoneVerified: Boolean(user.phone_verified_at),
    providerId: user.provider_id ?? null,
    verificationStatus: user.verification_status ?? null,
    createdAt: user.created_at,
  };
}

async function issueSession(user, context) {
  const accessToken = tokens.signAccessToken(user);
  const refresh = await tokens.issueRefreshToken(user.id, context);
  return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
}

/**
 * Registration. A customer is usable immediately; a provider is created
 * together with an unverified profile and stays invisible to customers until
 * an admin approves their KYC.
 */
export async function register({ role, fullName, email, phone, password, agencyName }, context = {}) {
  if (role === ROLES.ADMIN) {
    // Admins are provisioned internally, never through the public API.
    throw ApiError.forbidden('Admin accounts cannot be self-registered');
  }

  const existing = await repo.findByEmailOrPhone(email, phone);
  if (existing) {
    const field = existing.email && email && existing.email.toLowerCase() === email.toLowerCase() ? 'email address' : 'phone number';
    throw ApiError.conflict('An account with this ' + field + ' already exists');
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const created = await withTransaction(async (tx) => {
    const user = await repo.createUser(tx, { role, fullName, email, phone, passwordHash });
    let profile = null;
    let agency = null;

    if (role === ROLES.PROVIDER) {
      profile = await repo.createProviderProfile(tx, user.id);
    } else if (role === ROLES.AGENCY) {
      // The agency's own business name defaults to the name they signed up
      // with; they rename it on their profile page.
      agency = await repo.createAgency(tx, user.id, { name: agencyName?.trim() || fullName });
    }

    return { user, profile, agency };
  });

  const user = {
    ...created.user,
    provider_id: created.profile?.id ?? null,
    agency_id: created.agency?.id ?? null,
    verification_status:
      created.profile?.verification_status ?? created.agency?.verification_status ?? null,
  };

  // Contact confirmation is required before the account is fully usable, and
  // the code goes to the email address - see otp.service.js for why.
  const otp = await issueOtp({
    userId: user.id,
    destination: email,
    purpose: OTP_PURPOSE.VERIFY_EMAIL,
  });

  const session = await issueSession(user, context);

  return {
    user: present(user),
    ...session,
    verification: {
      required: true,
      destination: email,
      channel: 'email',
      expiresAt: otp.expiresAt,
      devCode: otp.devCode,
    },
  };
}

export async function login({ identifier, password }, context = {}) {
  const user = await repo.findForLogin(identifier);

  // The same message for an unknown account and a wrong password, so the
  // endpoint cannot be used to discover who has an account.
  const invalid = ApiError.unauthorized('Incorrect email/phone or password');
  if (!user) {
    // Constant-ish work regardless of outcome, to blunt timing analysis.
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw invalid;
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) throw invalid;

  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is ' + user.status + '. Contact support for help.');
  }

  await repo.touchLastLogin(user.id);
  const session = await issueSession(user, context);

  return { user: present(user), ...session };
}

export async function refresh(refreshToken, context = {}) {
  const rotated = await tokens.rotateRefreshToken(refreshToken, context);
  const user = await repo.findById(rotated.userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'active') throw ApiError.forbidden('This account is ' + user.status);

  return {
    user: present(user),
    accessToken: tokens.signAccessToken(user),
    refreshToken: rotated.token,
    refreshExpiresAt: rotated.expiresAt,
  };
}

export async function logout(refreshToken) {
  await tokens.revokeRefreshToken(refreshToken, 'logout');
}

export async function logoutEverywhere(userId) {
  const count = await tokens.revokeAllForUser(userId, 'logout_all');
  return { sessionsRevoked: count };
}

export async function me(userId) {
  const user = await repo.findById(userId);
  if (!user) throw ApiError.notFound('Account not found');
  return present(user);
}

export async function updateProfile(userId, payload) {
  const updated = await repo.updateProfile(userId, payload);
  if (!updated) throw ApiError.notFound('Account not found');
  return present(updated);
}

// ---------------------------------------------------------------- contact and password

export async function sendOtp({ destination, purpose }) {
  // Someone may sign in with a phone number but still need the code by email,
  // so the account is looked up either way and the code is always sent to the
  // address on the account.
  const user = await repo.findForLogin(destination);

  // For password reset we never reveal whether the account exists.
  if (purpose === OTP_PURPOSE.RESET_PASSWORD && !user) {
    return {
      sent: true,
      destination,
      channel: 'email',
      expiresAt: new Date(Date.now() + 600000),
    };
  }

  if (!user) throw ApiError.notFound('No account found for this email or phone number');

  if (!user.email) {
    throw ApiError.badRequest(
      'This account has no email address, and codes are sent by email. Contact support for help.',
    );
  }

  const otp = await issueOtp({ userId: user.id, destination: user.email, purpose });

  return {
    sent: true,
    // The real destination, so the UI can say where to look.
    destination: user.email,
    channel: 'email',
    expiresAt: otp.expiresAt,
    devCode: otp.devCode,
  };
}

/** Confirms a phone or email at registration. */
export async function confirmContact({ destination, code }) {
  const { userId } = await verifyOtp({
    destination,
    purpose: OTP_PURPOSE.VERIFY_EMAIL,
    code,
  });

  if (userId) {
    await repo.markContactVerified(userId, 'email');
    notifyAsync({
      userId,
      eventType: 'account.verified',
      title: 'Account confirmed',
      body: 'Your email address has been confirmed.',
    });
  }

  const user = userId ? await repo.findById(userId) : null;
  return { verified: true, user: user ? present(user) : null };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const row = await repo.getPasswordHash(userId);
  if (!row) throw ApiError.notFound('Account not found');

  const matches = await bcrypt.compare(currentPassword, row.password_hash);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect');

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('The new password must be different from the current one');
  }

  await repo.updatePassword(userId, await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS));

  // Every other session is dropped, so a password change actually locks out
  // whoever else was signed in.
  const revoked = await tokens.revokeAllForUser(userId, 'password_changed');

  notifyAsync({
    userId,
    eventType: 'account.password_changed',
    title: 'Your password was changed',
    body: 'If this was not you, contact ServiceSetu support immediately.',
  });

  return { sessionsRevoked: revoked };
}

export async function resetPassword({ destination, code, newPassword }) {
  const { userId } = await verifyOtp({
    destination,
    purpose: OTP_PURPOSE.RESET_PASSWORD,
    code,
  });

  if (!userId) throw ApiError.badRequest('This reset link is no longer valid');

  await repo.updatePassword(userId, await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS));
  const revoked = await tokens.revokeAllForUser(userId, 'password_reset');

  notifyAsync({
    userId,
    eventType: 'account.password_reset',
    title: 'Your password was reset',
    body: 'Your ServiceSetu password was reset. If this was not you, contact support immediately.',
  });

  return { reset: true, sessionsRevoked: revoked };
}

export default {
  register,
  login,
  refresh,
  logout,
  logoutEverywhere,
  me,
  updateProfile,
  sendOtp,
  confirmContact,
  changePassword,
  resetPassword,
};
