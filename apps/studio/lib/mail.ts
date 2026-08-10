/**
 * Outbound mail: Resend's plain HTTPS API — deliberately no SDK. When
 * RESEND_API_KEY / CARDSTACK_EMAIL_FROM are unset (local dev), the message
 * prints to stdout so the credential-free dev loop keeps working and the
 * verify/reset links are copy-pasteable from the terminal (spec §3).
 */
export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail({ to, subject, text, html }: MailInput): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CARDSTACK_EMAIL_FROM?.trim();
  if (!key || !from) {
    console.info(`[mail:dev] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
  });
  if (!response.ok) {
    throw new Error(`Mail send failed: ${response.status} ${await response.text().catch(() => "")}`);
  }
}
