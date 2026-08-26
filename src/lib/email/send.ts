/**
 * Transport selection for app notification emails (currently the KAH breach
 * notification). Preference order:
 * 1. Google Workspace delegation — `GOOGLE_DELEGATE_EMAIL` set → the
 *    integration's Gmail send (`gmail.send` scope, impersonated sender).
 * 2. SMTP — `SMTP_URL` set (e.g. a personal Gmail account with an app
 *    password; no Workspace needed) → nodemailer.
 * 3. Neither configured → warn once per send attempt and report "not sent";
 *    callers keep their audit trail either way. Never throws.
 */

import { getAdminGoogleEmail } from "@/lib/google/config";
import { getGoogleIntegration } from "@/lib/google";

import { parseSmtpConfig } from "./smtp";

export interface NotificationEmail {
  to: string[];
  subject: string;
  body: string;
}

async function sendViaSmtp(
  email: NotificationEmail,
): Promise<boolean> {
  const config = parseSmtpConfig();
  if (!config) {
    return false;
  }
  try {
    // Imported lazily so bundlers never pull nodemailer into non-email paths.
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM?.trim() || config.user,
      to: email.to.join(", "),
      subject: email.subject,
      text: email.body,
    });
    return true;
  } catch (error) {
    console.error("[email] SMTP delivery failed", error);
    return false;
  }
}

/**
 * Deliver one notification email through the first configured transport.
 * Returns true only when a transport actually accepted the message.
 */
export async function sendNotificationEmail(email: NotificationEmail): Promise<boolean> {
  if (!email.to.length || !email.to.some((address) => address.trim())) {
    return false;
  }

  if (getAdminGoogleEmail()) {
    try {
      const integration = await getGoogleIntegration();
      await integration.sendEmail({
        to: email.to,
        subject: email.subject,
        body: email.body,
      });
      return true;
    } catch (error) {
      console.error("[email] Gmail delivery failed", error);
      return false;
    }
  }

  if (parseSmtpConfig()) {
    return sendViaSmtp(email);
  }

  console.warn(
    "[email] No email transport configured — set GOOGLE_DELEGATE_EMAIL or SMTP_URL " +
      "(breach notifications are still recorded in the audit log)",
  );
  return false;
}
