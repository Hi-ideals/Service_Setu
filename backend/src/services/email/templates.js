/**
 * Email bodies.
 *
 * Plain HTML with inline styles - email clients strip stylesheets, and Gmail
 * in particular ignores anything in a <style> block on mobile. Every message
 * also carries a text version, because a text-only client showing raw HTML is
 * worse than no formatting at all.
 */

const BRAND = '#0E7C66';
const INK = '#14293F';
const MUTED = '#5A6672';

function layout({ heading, body, footer }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F6F8FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #DDE4EC;">
      <tr>
        <td style="padding:24px 28px 8px;">
          <span style="font-size:20px;font-weight:700;color:${INK};">Service<span style="color:${BRAND};">Setu</span></span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 4px;">
          <h1 style="margin:0;font-size:19px;line-height:26px;color:${INK};">${heading}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 24px;font-size:15px;line-height:23px;color:${MUTED};">
          ${body}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;border-top:1px solid #EEF2F6;font-size:12px;line-height:18px;color:#94A3B4;">
          ${footer || 'ServiceSetu &middot; Bidar, Karnataka'}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function codeBlock(code) {
  return `<div style="margin:18px 0;padding:14px;background:#ECFDF7;border:1px solid #A7F3D6;border-radius:10px;text-align:center;">
    <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</span>
  </div>`;
}

/** The purposes that send a code, and the words that go with each. */
const PURPOSES = {
  verify_email: {
    subject: 'Confirm your ServiceSetu account',
    heading: 'Confirm your account',
    intro: 'Use this code to finish setting up your ServiceSetu account.',
  },
  verify_phone: {
    subject: 'Confirm your ServiceSetu account',
    heading: 'Confirm your account',
    intro: 'Use this code to finish setting up your ServiceSetu account.',
  },
  reset_password: {
    subject: 'Reset your ServiceSetu password',
    heading: 'Reset your password',
    intro: 'Use this code to choose a new password. If you did not ask for this, you can ignore this email and nothing will change.',
  },
  complete_job: {
    subject: 'Confirm your job is complete',
    heading: 'Confirm your job is complete',
    intro: 'Share this code with the professional only once the work is actually finished. Reading it out confirms both the work and the amount.',
  },
};

export function otpEmail({ purpose, code, minutes = 10, extra }) {
  const copy = PURPOSES[purpose] || PURPOSES.verify_email;

  const html = layout({
    heading: copy.heading,
    body: `
      <p style="margin:0 0 4px;">${copy.intro}</p>
      ${codeBlock(code)}
      ${extra ? `<p style="margin:0 0 12px;">${extra}</p>` : ''}
      <p style="margin:0;">This code expires in ${minutes} minutes. Never share it with anyone who contacts you claiming to be from ServiceSetu.</p>
    `,
    footer: 'If you did not request this, you can safely ignore this email.',
  });

  const text = [
    copy.heading,
    '',
    copy.intro,
    '',
    'Your code is: ' + code,
    '',
    extra || '',
    'It expires in ' + minutes + ' minutes. Never share it with anyone.',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: copy.subject, html, text };
}

/**
 * Notification bodies carry text people wrote - a decline reason, a
 * cancellation note - so they are escaped before they go anywhere near HTML.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A big tappable button. Table-based, because Outlook ignores padded anchors. */
function actionButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:${BRAND};">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * Everything that is not a code: booking updates, payment receipts, decisions.
 *
 * An action link is optional but strongly encouraged. Most of these emails
 * exist because the person is not looking at the site, so telling them
 * something happened without giving them a way back in wastes the send.
 */
export function notificationEmail({ title, body, actionLabel, actionUrl, footer }) {
  const hasAction = Boolean(actionLabel && actionUrl);

  return {
    subject: title,
    html: layout({
      heading: title,
      body:
        `<p style="margin:0;">${escapeHtml(body)}</p>` +
        (hasAction ? actionButton(actionLabel, actionUrl) : ''),
      footer,
    }),
    // Built by concatenation rather than filtering a list: the blank line
    // between the heading and the body is deliberate, and a filter that drops
    // empty entries would swallow it along with the absent action link.
    text:
      title + '\n\n' + body +
      (hasAction ? '\n\n' + actionLabel + ': ' + actionUrl : ''),
  };
}

export default { otpEmail, notificationEmail };
