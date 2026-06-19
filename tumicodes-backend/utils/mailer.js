require('dotenv').config();
const sgMail = require('@sendgrid/mail');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@tumicodes.com';

if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}

async function sendEmail({ to, subject, html, text }) {
    if (!SENDGRID_API_KEY) {
        console.warn('SendGrid API key not configured — skipping email send');
        return { skipped: true };
    }

    const msg = {
        to,
        from: FROM_EMAIL,
        subject,
        text: text || html,
        html
    };

    try {
        await sgMail.send(msg);
        return { ok: true };
    } catch (error) {
        console.error('SendGrid error:', error.response ? error.response.body : error.message);
        throw error;
    }
}

async function sendVerificationEmail(to, link, name = '') {
    const subject = 'Verify your TumiCodes email address';
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">
            <h2>Welcome to TumiCodes${name ? `, ${name}` : ''}!</h2>
            <p>Thanks for creating an account. Please verify your email by clicking the button below:</p>
            <p><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#FF003C;color:#fff;text-decoration:none">Verify Email</a></p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p><a href="${link}">${link}</a></p>
            <p>— The TumiCodes Team</p>
        </div>
    `;

    return await sendEmail({ to, subject, html });
}

module.exports = { sendEmail, sendVerificationEmail };
