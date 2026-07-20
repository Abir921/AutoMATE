import { createGmailTransporter } from "./mailer";

// The platform's own sender identity for transactional email (password
// resets). Distinct from emailAutomations.ts, which sends via each USER's own
// Gmail App Password - this is FormAutomator's own account, configured once
// by whoever runs the server. Unset by default in this dev environment.
const SYSTEM_SMTP_EMAIL = process.env.SYSTEM_SMTP_EMAIL;
const SYSTEM_SMTP_APP_PASSWORD = process.env.SYSTEM_SMTP_APP_PASSWORD;

export const systemEmailConfigured = !!(SYSTEM_SMTP_EMAIL && SYSTEM_SMTP_APP_PASSWORD);

export async function sendSystemEmail(to: string, subject: string, text: string): Promise<void> {
  if (!SYSTEM_SMTP_EMAIL || !SYSTEM_SMTP_APP_PASSWORD) throw new Error("System email is not configured");
  const transporter = createGmailTransporter(SYSTEM_SMTP_EMAIL, SYSTEM_SMTP_APP_PASSWORD);
  await transporter.sendMail({ from: SYSTEM_SMTP_EMAIL, to, subject, text });
}
