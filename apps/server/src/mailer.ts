import nodemailer, { Transporter } from "nodemailer";

/**
 * One Gmail SMTP transport config for the whole app. Used with two different
 * kinds of credentials: the platform's own account (systemMailer.ts,
 * transactional email like password resets) and each user's own App Password
 * (routes/emailAutomations.ts, their "Send Email" automations).
 */
export function createGmailTransporter(user: string, appPassword: string): Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass: appPassword },
  });
}
