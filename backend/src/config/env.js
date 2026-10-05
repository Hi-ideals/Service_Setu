/**
 * Environment configuration.
 * Loaded and validated once at boot - the rest of the app imports `env`
 * and never reads process.env directly.
 */
import 'dotenv/config';
import { z } from 'zod';

const bool = (d) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? d : v === 'true' || v === '1'));

const num = (d) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? d : Number(v)))
    .pipe(z.number());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: num(5000),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Where the frontend lives. Notification emails link back into the app, and
  // an email whose button points at the wrong host is worse than no button.
  APP_URL: z.string().url().default('http://localhost:5175'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: num(5432),
  DB_NAME: z.string().default('servicesetu'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: bool(false),
  DB_POOL_MAX: num(10),

  /**
   * Whether the refresh cookie carries the Secure attribute.
   *
   * It must be true wherever the site is served over HTTPS, and it CANNOT be
   * true over plain HTTP: the browser silently refuses to store a Secure
   * cookie on an insecure origin, so sign-in appears to work and then the
   * session vanishes on the next page load, with nothing in any log.
   *
   * Left unset it follows NODE_ENV, which is the right default. It exists so
   * a deployment on a trusted private network over HTTP can turn it off
   * deliberately rather than discovering the problem through a bug report.
   */
  COOKIE_SECURE: bool(undefined),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: num(10),

  PLATFORM_COMMISSION_PERCENT: num(15),
  BOOKING_ACCEPT_WINDOW_MINUTES: num(60),
  DISPUTE_WINDOW_HOURS: num(48),
  /**
   * How providers get paid.
   *
   * 'manual' records what is owed and leaves an admin to transfer it through
   * their own banking app, then mark it paid. 'gateway' hands it to the
   * payment driver. Manual is the default because collecting money and
   * sending it out are separate products, and the second one needs its own
   * activation that nobody has on day one.
   */
  PAYOUT_MODE: z.enum(['manual', 'gateway']).default('manual'),

  /**
   * How much HTTP traffic reaches the log.
   *
   * 'all' logs every request, which is what you want in production where the
   * log is searched rather than read. In development it buries the lines that
   * matter - the server starting, the database connecting, an actual error -
   * under a header dump per request, so the default there is 'errors'.
   */
  LOG_HTTP: z.enum(['off', 'errors', 'all']).optional(),

  /** Overrides the default level. Set to 'debug' when diagnosing this server. */
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),

  REDIS_URL: z.string().optional().default(''),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: num(5),

  // ---------- payments ----------
  // 'mock' is the built-in test double; 'razorpay' talks to the real gateway.
  PAYMENT_DRIVER: z.enum(['mock', 'razorpay']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  // ---------- messaging ----------
  // OTP goes by email, not SMS: every SMS costs money and email does not.
  EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('ServiceSetu <no-reply@servicesetu.in>'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: num(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),

  // Kept for booking alerts, where reaching someone on site matters more than
  // the cost of a message. Not used for OTP any more.
  /**
   * WhatsApp, for verification codes.
   *
   * `console` logs the code instead of sending it, which is what development
   * and the test suite use. `cloud` talks to Meta's Cloud API and needs the
   * three values below.
   *
   * Only authentication-template messages can be sent: Meta forbids free-form
   * text to someone who has not messaged you first, and a verification code is
   * by definition the first contact.
   */
  WHATSAPP_DRIVER: z.enum(['console', 'cloud']).default('console'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_TEMPLATE_NAME: z.string().optional().default(''),
  // Meta treats these as distinct: a template approved as `en` cannot be sent
  // as `en_US`, and the error does not say so.
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en'),
  /**
   * Whether the template carries a copy-code button.
   *
   * Meta's authentication templates normally do, and the code has to be
   * supplied twice when they do - once for the body, once for the button. A
   * template without one rejects the extra component, and the error names the
   * component index rather than saying a button was not expected.
   */
  WHATSAPP_TEMPLATE_HAS_BUTTON: bool(true),

  /**
   * Which channel verification codes go to first.
   *
   * Delivery falls back to email whenever the preferred channel fails, so a
   * customer whose number is not on WhatsApp can still create an account.
   */
  OTP_CHANNEL: z.enum(['email', 'whatsapp']).default('email'),

  SMS_DRIVER: z.string().default('console'),
})
  .superRefine((value, ctx) => {
    // A misconfigured driver should fail at boot, not on a customer's first
    // sign-up attempt.
    if (value.PAYMENT_DRIVER === 'razorpay') {
      if (!value.RAZORPAY_KEY_ID || !value.RAZORPAY_KEY_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_ID'],
          message: 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_DRIVER=razorpay',
        });
      }

      // The Razorpay dashboard lists Key Id above Key Secret, and they are
      // easy to paste the wrong way round. A key id ALWAYS starts with
      // rzp_test_ or rzp_live_, so the mistake is detectable - and far better
      // caught here than as "Authentication failed" on a customer's payment.
      else if (!/^rzp_(test|live)_/.test(value.RAZORPAY_KEY_ID)) {
        const looksSwapped = /^rzp_(test|live)_/.test(value.RAZORPAY_KEY_SECRET);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_ID'],
          message: looksSwapped
            ? 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are the wrong way round - the key id is the one starting rzp_test_ or rzp_live_'
            : 'RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_',
        });
      }

      else if (/^rzp_(test|live)_/.test(value.RAZORPAY_KEY_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_SECRET'],
          message: 'RAZORPAY_KEY_SECRET looks like a key id - copy the secret shown beside it in the dashboard',
        });
      }
    }
    if (value.EMAIL_DRIVER === 'smtp' && !value.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_DRIVER=smtp',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error('Copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDev: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  isProd: raw.NODE_ENV === 'production',
  // Falls back to NODE_ENV when COOKIE_SECURE is not set.
  cookieSecure: raw.COOKIE_SECURE ?? raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  // Quiet by default while developing, complete by default in production.
  logHttp: raw.LOG_HTTP ?? (raw.NODE_ENV === 'development' ? 'errors' : 'all'),
};

export default env;
