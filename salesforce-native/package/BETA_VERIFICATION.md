# Cardstack native editor verification — October 5, 2026

Core beta **0.1.0.6**, unpromoted. [Install](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tg8000000QRZFAA4). Companion HXL/MCP setup is separate.

| Check | Result |
| --- | --- |
| Full development-org Apex suite | 162 passed; zero failures/skips |
| Installed core package Apex suite | 157 passed; zero failures/skips |
| Working-org post-install editor/card regressions | 28 passed |
| Studio model suite | 20 passed |
| Package creation | Success; 83% coverage |
| Working org package | 0.1.0.6 installed successfully in cardstack-spike2 |
| Package installation | 0.1.0.6 succeeded in disposable Developer scratch org after fresh 0.1.0.5 install |
| Native Claude widget inputs | Description entered only in HXL, exact Unicode/quotes retained; Employees zero retained |
| Integer validation | 0.5 rejected without revision advance or save |
| Back and recovered Review | Server answers retained; Back displayed previous Employees value |
| Stale review button | Older button sent its own reference/revision; Claude refused approval of newer answers; SOQL confirmed no write |
| Current review save | Exact reference/revision and current grant submitted; Completed receipt returned |
| Independent read-back | Description = NATIVE-FINAL café ✓ "quoted"; Employees = 0 |
| Refreshed HXL | Fresh Get Record rendered exact text and integer 0; currency-format defect reproduced and fixed with regression |
| Cancel | Unsaved widget text cancelled; independent read-back unchanged |
| Cleanup | Original published Account layout restored; disposable Account removed; independently verified |
| Final metadata deployment | Succeeded; JWT restored ON |
| ChatGPT new editor parity | Unverified; previous input probes do not prove this editor |

The first cancel-start attempt stalled in Claude and was interrupted. A subsequent Start and Cancel succeeded. Earlier in-flight schema updates caused recovery trouble and an old chat omitted the newly added reviewReference argument. That request was denied; the fresh refreshed-tool chat submitted the complete schema and saved correctly. Do not silently retry a save after a client outage; Resume the server state and inspect the receipt/review.

The actor-bound, hash-keyed server interaction retains typed answers and a revision. Tests cover policy/access changes, expiry, cross-actor denial, changed records, required clear rejection, no-op answers, exact reviewed patch binding, cancelled/completed states, stale/cross-session review references, and successful replay receipts. Private keys/grants are not included in this report.

This is an Account text/integer editor with one input per turn. It does not implement full Screen Flow execution, simultaneous forms, picklists/lookups, mapped record buttons, or general quick-action execution. Current Salesforce flow launch cards remain the fallback.

Evidence: Cardstack-native-edit-refreshed-proof.png. Private test/build/install/read-back receipts remain in the task workspace; no credentials are distributed. The disposable scratch org was deleted after verification.
