# Force.com rebuild — session briefs

Overview and decisions: [../2026-09-05-force-com-rebuild-design.md](../2026-09-05-force-com-rebuild-design.md).
Read it first; each brief assumes it.

How to use a brief: open a fresh coding session, paste the brief's path, and
run the planning skill (`superpowers:writing-plans`) against it. A session is
done when its acceptance path runs in a scratch org, not when its code exists.

| # | Brief | Needs |
|---|---|---|
| 0 | [00-spike-and-foundation.md](00-spike-and-foundation.md) | — |
| 1 | [01-config-objects-and-staging.md](01-config-objects-and-staging.md) | 0 |
| 2 | [02-read-path.md](02-read-path.md) | 1 |
| 3 | [03-write-path.md](03-write-path.md) | 2 |
| 4 | [04-studio-core.md](04-studio-core.md) | 1, 2 |
| 5 | [05-home-card.md](05-home-card.md) | 3, 4 |
| 6 | [06-governance-surfaces.md](06-governance-surfaces.md) | 3, 4 |
| 7 | [07-package-and-cutover.md](07-package-and-cutover.md) | 5, 6 |

Sessions 2 and 4 can run side by side after 1; 5 and 6 after 3 and 4.
