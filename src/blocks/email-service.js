'use strict';

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

function defaultEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function buildEmailHtml(subject, body, escapeHtml = defaultEscape) {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#1d1d1f"><div style="max-width:620px;margin:0 auto;padding:28px"><div style="background:#fff;border:1px solid #e8e2d8;border-radius:18px;padding:24px"><h2 style="margin:0 0 14px;font-size:22px;color:#18181b">${escapeHtml(subject)}</h2><p style="font-size:15px;line-height:1.6;margin:0">${safeBody}</p></div><p style="font-size:12px;line-height:1.5;color:#777;margin:14px 4px 0">AdProof automated email. If you did not request this, you can ignore it.</p></div></body></html>`;
}

function createEmailService(deps) {
  const {
    getConfig,
    appendEmailOutbox,
    updateEmailOutboxStatus,
    structuredLog,
    randomId,
    iso,
    clamp,
    sanitizeDetails,
    maskEmail,
    smtpPublicStatus,
    escapeHtml = defaultEscape
  } = deps || {};

  function config() { return getConfig ? getConfig() : {}; }

  function smtpTransportOptions() {
    const cfg = config();
    const auth = cfg.SMTP_USER && cfg.SMTP_PASS ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined;
    return {
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      requireTLS: cfg.SMTP_REQUIRE_TLS,
      connectionTimeout: cfg.SMTP_TIMEOUT_MS,
      greetingTimeout: cfg.SMTP_TIMEOUT_MS,
      socketTimeout: cfg.SMTP_TIMEOUT_MS,
      auth
    };
  }

  async function sendAppEmail(to, subject, body, meta = {}) {
    const cfg = config();
    const smtpStatus = smtpPublicStatus ? smtpPublicStatus() : { enabled: Boolean(cfg.SMTP_ENABLED) };
    const email = appendEmailOutbox({
      id: randomId('mail'),
      time: iso(),
      to: clamp(to, 160),
      from: clamp(cfg.SMTP_FROM, 220),
      replyTo: clamp(cfg.SMTP_REPLY_TO, 220),
      subject: clamp(subject, 180),
      body: clamp(body, 6000),
      meta: sanitizeDetails(meta, 320),
      status: cfg.SMTP_ENABLED ? 'pending_smtp' : 'local_outbox_only',
      provider: cfg.SMTP_ENABLED ? 'smtp' : 'local_outbox',
      smtp: smtpStatus
    });
    structuredLog('log', cfg.SMTP_ENABLED ? 'email_queued_for_smtp' : 'email_queued_local_outbox', { to: email.to, subject: email.subject, id: email.id, smtpEnabled: cfg.SMTP_ENABLED });

    if (!cfg.SMTP_ENABLED) return email;
    if (!cfg.SMTP_HOST) {
      const updated = updateEmailOutboxStatus(email.id, { status: 'smtp_not_configured', error: 'SMTP_HOST is empty' }) || email;
      structuredLog('warn', 'email_smtp_not_configured', { to: email.to, id: email.id, smtp: smtpStatus });
      return Object.assign(email, updated);
    }
    if (!nodemailer) {
      const updated = updateEmailOutboxStatus(email.id, { status: 'smtp_failed_missing_dependency', error: 'nodemailer package is not installed. Run npm install.' }) || email;
      structuredLog('error', 'email_smtp_missing_nodemailer', { to: email.to, id: email.id, smtp: smtpStatus });
      if (cfg.SMTP_FAIL_BLOCKS_AUTH) throw new Error('smtp_missing_nodemailer');
      return Object.assign(email, updated);
    }

    try {
      const transporter = nodemailer.createTransport(smtpTransportOptions());
      const info = await transporter.sendMail({
        from: cfg.SMTP_FROM,
        to: email.to,
        replyTo: cfg.SMTP_REPLY_TO || undefined,
        subject: email.subject,
        text: email.body,
        html: buildEmailHtml(email.subject, email.body, escapeHtml)
      });
      updateEmailOutboxStatus(email.id, { status: 'sent', sentAt: iso(), messageId: info.messageId || '', accepted: info.accepted || [], rejected: info.rejected || [], response: clamp(info.response || '', 500) });
      structuredLog('log', 'email_smtp_sent', { toMasked: maskEmail(email.to), id: email.id, messageId: info.messageId || '', accepted: info.accepted || [], rejected: info.rejected || [], response: clamp(info.response || '', 500) });
      return Object.assign(email, { status: 'sent', messageId: info.messageId || '' });
    } catch (err) {
      updateEmailOutboxStatus(email.id, { status: 'smtp_failed', error: clamp(err.message || String(err), 800) });
      structuredLog('error', 'email_smtp_failed', { toMasked: maskEmail(email.to), id: email.id, message: err.message, code: err.code || '', command: err.command || '', responseCode: err.responseCode || 0, smtp: smtpStatus });
      if (cfg.SMTP_FAIL_BLOCKS_AUTH) throw err;
      return Object.assign(email, { status: 'smtp_failed', error: err.message || String(err) });
    }
  }

  return { sendAppEmail, buildEmailHtml, smtpTransportOptions };
}

module.exports = { createEmailService, buildEmailHtml };
