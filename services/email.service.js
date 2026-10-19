import nodemailer from 'nodemailer';
import config from '../config/config.js';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!config.email.host || !config.email.user) {
    // Dev fallback: log emails to console instead of silently failing
    console.warn('⚠ EMAIL_HOST/EMAIL_USER not set — emails will be logged to console.');
    transporter = {
      sendMail: async (opts) => {
        console.log('\n════════ 📧 EMAIL (console mode) ════════');
        console.log('To:', opts.to);
        console.log('Subject:', opts.subject);
        console.log(opts.html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
        console.log('════════════════════════════════════════\n');
        return { messageId: 'console-' + Date.now() };
      }
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: { user: config.email.user, pass: config.email.pass }
  });
  return transporter;
};

const wrapTemplate = (title, bodyHtml, ctaText, ctaUrl) => `
  <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f4f5f7;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec;">
      <div style="background:#0f172a;padding:22px 28px;">
        <span style="color:#ffffff;font-size:20px;font-weight:700;">Gadget Hub</span>
        <span style="color:#f59e0b;font-size:11px;letter-spacing:2px;margin-left:8px;vertical-align:super;">ATELIER</span>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 12px;color:#111827;font-size:18px;">${title}</h2>
        <div style="color:#374151;font-size:14px;line-height:1.7;">${bodyHtml}</div>
        ${
          ctaUrl
            ? `<div style="margin-top:24px;"><a href="${ctaUrl}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">${ctaText}</a></div>`
            : ''
        }
        <p style="margin-top:28px;color:#9ca3af;font-size:12px;">If you did not request this, you can safely ignore this email.</p>
      </div>
      <div style="background:#f9fafb;padding:16px 28px;color:#6b7280;font-size:11px;">
        © ${new Date().getFullYear()} Gadget Hub. All rights reserved.
      </div>
    </div>
  </div>`;

const send = async ({ to, subject, title, html, ctaText, ctaUrl }) => {
  try {
    const t = getTransporter();
    await t.sendMail({
      from: config.email.from || 'Gadget Hub <no-reply@gadgethub.io>',
      to,
      subject,
      html: wrapTemplate(title, html, ctaText, ctaUrl)
    });
    return true;
  } catch (err) {
    console.error('✗ Email send failed:', err.message);
    return false;
  }
};

export const emailService = {
  sendWelcomeEmail: (user) =>
    send({
      to: user.email,
      subject: 'Welcome to Gadget Hub',
      title: `Welcome aboard, ${user.name}!`,
      html: `<p>Your Gadget Hub account is ready. Compare gadgets, build setups, find upgrades and shop the marketplace.</p>`,
      ctaText: 'Browse the store',
      ctaUrl: config.frontendUrl
    }),

  sendPasswordResetEmail: (user, resetUrl) =>
    send({
      to: user.email,
      subject: 'Gadget Hub — Password Reset Request',
      title: 'Password Reset Request',
      html: `<p>We received a request to reset the password for <strong>${user.email}</strong>.</p>
             <p>This secure link expires in <strong>15 minutes</strong> and can be used only once.</p>`,
      ctaText: 'Reset Password',
      ctaUrl: resetUrl
    }),

  sendOrderConfirmation: (user, order) =>
    send({
      to: user.email,
      subject: `Order confirmed — ${order.invoiceNumber}`,
      title: 'Thank you for your order!',
      html: `<p>Order <strong>${order.invoiceNumber}</strong> is confirmed and being prepared.</p>
             <p><strong>Total:</strong> ₹${order.total.toLocaleString('en-IN')} • <strong>Items:</strong> ${order.items.length}</p>`,
      ctaText: 'View order & invoice',
      ctaUrl: `${config.frontendUrl}/user/orders`
    }),

  sendOrderStatusEmail: (user, order, status) =>
    send({
      to: user.email,
      subject: `Order ${order.invoiceNumber} — ${status}`,
      title: `Your order is ${status.toLowerCase()}`,
      html: `<p>Order <strong>${order.invoiceNumber}</strong> status is now <strong>${status}</strong>.</p>`,
      ctaText: 'Track order',
      ctaUrl: `${config.frontendUrl}/user/orders`
    }),

  sendProductApprovedEmail: (seller, product) =>
    send({
      to: seller.email,
      subject: `Product approved — ${product.name}`,
      title: 'Your product is live',
      html: `<p><strong>${product.name}</strong> has been approved and is now visible in the marketplace.</p>`,
      ctaText: 'Open seller dashboard',
      ctaUrl: `${config.frontendUrl}/seller/products`
    }),

  sendProductRejectedEmail: (seller, product, note) =>
    send({
      to: seller.email,
      subject: `Product needs attention — ${product.name}`,
      title: 'Product rejected / corrections requested',
      html: `<p><strong>${product.name}</strong> was not approved.</p><p><strong>Manager note:</strong> ${note || '—'}</p><p>You can edit and resubmit it from your dashboard.</p>`,
      ctaText: 'Fix product',
      ctaUrl: `${config.frontendUrl}/seller/products`
    }),

  sendComplaintResolvedEmail: (user, complaint) =>
    send({
      to: user.email,
      subject: `Complaint resolved — ${complaint.subject}`,
      title: 'Your complaint has been resolved',
      html: `<p><strong>${complaint.subject}</strong> was marked <strong>${complaint.status}</strong>.</p>`,
      ctaText: 'View complaint',
      ctaUrl: `${config.frontendUrl}/user/complaints`
    })
};
