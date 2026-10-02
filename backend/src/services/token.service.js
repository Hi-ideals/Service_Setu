/**
 * Token issuing and verification.
 *
 * The access token is short-lived and stateless - it carries the identity,
 * role and provider verification status that the authorisation gates read on
 * every request. The refresh token is long-lived, stored hashed and revocable,
 * which is what makes logout, password change and admin suspension take effect
 * immediately rather than whenever the access token happens to expire.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { query, queryOne } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';

const ACCESS_AUDIENCE = 'servicesetu:access';
const REFRESH_BYTES = 48;

/** Hash a refresh token before it touches the database - a leaked dump is then useless. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      // Rides in the token so the verification gate costs no database round trip.
      verification: user.verification_status ?? null,
      providerId: user.provider_id ?? null,
      agencyId: user.agency_id ?? null,
      status: user.status,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN, audience: ACCESS_AUDIENCE, issuer: 'servicesetu' },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: ACCESS_AUDIENCE,
    issuer: 'servicesetu',
  });
}

function refreshExpiry() {
  const spec = env.JWT_REFRESH_EXPIRES_IN;
  const match = /^(\d+)([smhd])$/.exec(spec);
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const ms = match ? Number(match[1]) * units[match[2]] : 30 * 86400000;
  return new Date(Date.now() + ms);
}

/** Issues a refresh token and records its hash against the session. */
export async function issueRefreshToken(userId, { userAgent, ip } = {}) {
  const token = crypto.randomBytes(REFRESH_BYTES).toString('base64url');
  const expiresAt = refreshExpiry();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), userAgent ?? null, ip ?? null, expiresAt],
  );

  return { token, expiresAt };
}

/**
 * Validates a refresh token and rotates it: the presented token is revoked and
 * a new one issued, so a stolen token is usable at most once before the real
 * user's next refresh invalidates it.
 */
export async function rotateRefreshToken(token, context = {}) {
  if (!token) throw ApiError.unauthorized('No refresh token supplied');

  const row = await queryOne(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at
       FROM refresh_tokens rt
      WHERE rt.token_hash = $1`,
    [hashToken(token)],
  );

  if (!row) throw ApiError.unauthorized('Invalid refresh token');
  if (row.revoked_at) {
    // A revoked token being reused suggests theft - drop every session for safety.
    await revokeAllForUser(row.user_id, 'reuse_detected');
    throw ApiError.unauthorized('This session has been revoked, please sign in again');
  }
  if (new Date(row.expires_at) < new Date()) {
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }

  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'rotated' WHERE id = $1`,
    [row.id],
  );

  const next = await issueRefreshToken(row.user_id, context);
  return { userId: row.user_id, ...next };
}

export async function revokeRefreshToken(token, reason = 'logout') {
  if (!token) return 0;
  const { rowCount } = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token), reason],
  );
  return rowCount;
}

/** Used on password change, account suspension and suspected token theft. */
export async function revokeAllForUser(userId, reason = 'security') {
  const { rowCount } = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
  return rowCount;
}

export default {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
