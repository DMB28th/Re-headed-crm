/** Email copy + links in one place so tests can pin them and routes can't drift. */
export const buildAuthLinks = (origin: string) => ({
  verifyUrl: (token: string) => `${origin}/verify?token=${encodeURIComponent(token)}`,
  resetUrl: (token: string) => `${origin}/reset?token=${encodeURIComponent(token)}`,
  // Same page as reset — a separate name so email copy can say "finish setting up"
  // instead of "reset" for the passwordless-claim case.
  claimUrl: (token: string) => `${origin}/reset?token=${encodeURIComponent(token)}`,
});

export const verificationEmail = (name: string, url: string) => ({
  subject: "Verify your Cardstack email",
  text: `Hi ${name},\n\nConfirm this address for your Cardstack account:\n\n${url}\n\nThe link works once and expires in 24 hours. If you didn't sign up, ignore this.`,
});

export const resetEmail = (name: string, url: string) => ({
  subject: "Reset your Cardstack password",
  text: `Hi ${name},\n\nReset your Cardstack password here:\n\n${url}\n\nThe link works once and expires in 30 minutes. If you didn't ask for this, ignore it — your password is unchanged.`,
});

export const claimEmail = (name: string, url: string) => ({
  subject: "Finish setting up your Cardstack account",
  text: `Hi ${name},\n\nAn account for this email already exists from your Salesforce or chat sign-in. Set its password here to use it in Studio:\n\n${url}\n\nThe link works once and expires in 24 hours. If you didn't try to sign up, ignore this.`,
});
