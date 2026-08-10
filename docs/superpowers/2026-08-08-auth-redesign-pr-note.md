# Auth redesign — PR note

Findings: `docs/superpowers/specs/2026-08-08-auth-review.md`
Design: `docs/superpowers/specs/2026-08-08-auth-redesign.md`
Plan: `docs/superpowers/plans/2026-08-08-auth-redesign.md`

## What each finding's regression test is

Verified by reverting each fix and confirming the named test goes red, then
restoring. A finding with no such test is not closed.

| Finding | Test that fails if the fix is reverted |
|---|---|
| A1 consent | `oauth-provider.test.ts` — "does not mint an authorization code for an unknown client" |
| A2 mitigation | `membership-change.test.ts` — "refuses to demote the only admin" |
| A3 rate limit | `request-guard.test.ts` — "allows up to the limit and refuses past it" |
| A3 signing key | `studio-session.test.ts` — "refuses a cookie signed with %p when no secret is configured" |
| A4 revocation | `oauth-provider.test.ts` — "rejects the access token once the membership is gone" |
| A5 choke point | `auth.test.ts` — "refuses a session whose membership was demoted to member" |
| A6 open redirect | `login-flow.test.ts` — "refuses %s, which resolves to a foreign origin" |
| B1 fail closed | `oauth-provider.test.ts` — "rejects a token that carries no identity rather than defaulting" |
| B2 CSRF depth | `request-guard.test.ts` — "refuses a cross-origin POST" |
| B5 rotation | `oauth-provider.test.ts` — "issues a NEW refresh token on every refresh" |

A3's fail-closed test was **strengthened during verification**: the original
asserted only that an empty secret list returns nothing, which a
fall-back-to-a-constant bug also satisfies (it is still "closed" against a cookie
signed with a different key, and wide open to anyone who knows the constant). It
now signs cookies with the constants a fallback would plausibly use and requires
each be refused.

## Deviations from the plan

**Failed access-key attempts are logged, not audited.** The plan said append to
the audit log. `AuditEntry` is record-write shaped and feeds the compliance CSV,
so an auth event would have had to fabricate an object, a record id, and a field
change — putting invented record writes into a compliance export in order to
record a failed login. A structured server log line achieves the finding's goal
("leaves no trace at all") without corrupting that artifact.

**`lib/request-guard.ts`, not `lib/rate-limit.ts`.** It holds the Origin check
too, and naming it for one of its two jobs would have been misleading.

**`IdentityStore.listWorkspaces` was added**, which the plan did not anticipate.
The zero-admin backfill has to enumerate workspaces and nothing could.
`resolveSignIn` now takes `SignInStore` (`IdentityStore` minus that method) so a
request-path caller cannot reach deployment-wide enumeration through it — the
compiler enforces what the comment asks for.

## Accepted risk, by decision

**A2's escalation half survives.** The first person from an org to sign in
becomes its admin, through Studio *or* through a chat host, so a rep who adds the
connector before anyone opens Studio holds org-wide authority over layouts, field
denylists and `writeEnabled`. That was a product decision, taken explicitly.

What changed is that it is now survivable: the grant is reversible (People page,
with demotion taking effect on the next request), the lockout half is gone
(Studio names the admins so the buyer knows exactly who to ask), and the People
page is a hard dependency of the decision rather than a follow-on — which is why
Tasks 4 and 5 shipped in one commit.

## Not done, deliberately

**Dropping `STUDIO_SHARED_SECRET` from the signing list** is migration step 5 and
must wait 14 days after `CARDSTACK_SESSION_SECRET` is deployed. Doing it now logs
out every live session. Until then the shared secret is verify-only whenever the
real key is set.

**No deployment.** The migration has ordering constraints that a plain deploy
does not honour — see the design's section 5. In particular:

1. Set `CARDSTACK_SESSION_SECRET` first (step 1).
2. Run the zero-admin backfill **before** the admin-only Studio gate reaches
   production: `pnpm --filter @cardstack/studio backfill:admins`. A workspace
   with no admin cannot be configured by anyone once the gate is live.
3. Set `CARDSTACK_TRUSTED_CLIENT_ORIGINS` to the hosts already in use before the
   consent change lands, or every existing rep sees an interstitial.

**Pre-existing bearer tokens keep working.** They carry `user.tenantId` and
`user.userId`, which are the account and workspace ids `resolveSignIn` wrote, so
live membership resolution reads them directly — no re-authorization needed.
Refresh tokens minted before rotation have no family record and are rotated
normally on first use; treating them as reuse would have revoked every live rep
on deploy day, which is why that test was written first.

## Constraints held

- **Hard rule 8 untouched.** `confirm-token.ts` is unmodified. `signState` /
  `verifyState` are reused in the consent flow as a signing primitive only — no
  confirmation semantics are involved, and nothing lets confirmation become a
  caller-supplied claim. A1's fix removes the only way found to defeat it, which
  was becoming the wrong actor rather than bypassing the mechanism.
- **Hard rule 2.** Every check added is server-side. The widget's re-auth card
  renders a discriminator the server decided; it does not infer one.
- **Salesforce refresh behaviour unchanged.** Rotation in Task 9 concerns
  Cardstack's own opaque bearer tokens. Nothing reads, refreshes, or persists a
  Salesforce credential, `CARDSTACK_DEV_SF_ORG` still bypasses the stored
  connection, and `readSalesforceCliToken` output still never reaches a store.
- **No new session table.** `lastSeenAt` and the token families ride the existing
  TTL'd `kv_entries`.
- **`org_key` uniqueness untouched.** "A workspace IS a Salesforce org" is
  unchanged; the sandbox problem is explained to the user rather than modelled
  away.
- All five golden paths pass. The five constraint suites pass, including
  `tenant-isolation.test.ts`.
