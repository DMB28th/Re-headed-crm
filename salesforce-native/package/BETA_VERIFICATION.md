# Cardstack beta 0.1.0.8 verification — October 6, 2026

- Core version: `04tg8000000QdnJAAS`, unpromoted unlocked beta, 84% Apex coverage.
- Successful direct installation in a fresh Developer scratch org and upgrade installation in cardstack-spike2.
- Fresh installed suite: 167/167 passed. Development-org suite: 172/172 passed. Studio model suite: 26/26 passed.
- Fresh review found and fixed Keep current after Back retaining an earlier answer, and an oversized action catalog hiding existing buttons. Regressions failed before fixes and passed afterward.
- Studio authored and published an Account action with Description mapped from exposed Name and Employees mapped from constant `0`. Original drafts were preserved.
- Claude HXL record button started the exact published action for the card’s record. Mapped defaults rendered. Literal `ACTION café ✓ "quoted"` and `0` reached Apex unchanged.
- Independent SOQL before confirmation still read Original action QA / 42. Exact current review confirmation saved both fields. Independent read-back and refreshed HXL card read ACTION café ✓ "quoted" / 0.
- Cancel with an unsent input transmitted no field value and preserved the saved values.
- Salesforce flow link: legacy Visualforce route stayed blank in the browser. A failing URL regression reproduced the old format; all flow launch links now use Salesforce’s documented Lightning route and flow__recordId prefix. The actual HXL button opened the probe screen and its review displayed the correct record context.
- Studio Dashboard, Objects, Flows, Home Card, Audit Log, and Publish Center loaded after the final package upgrade. Original one/three-column Account layout remained intact.
- Original live configs and all four original drafts restored exactly. Disposable Account and two QA drafts removed. Debug preference restored. JWT ended ON after the final deploy. Scratch installation orgs removed after verification.

Scope: native Account text/integer processes; published Salesforce flow handoffs. Full in-chat Screen Flow interpretation, picklists/lookups, other native object editors, and ChatGPT parity are not claimed. The core still needs the separate HXL/MCP companion and subscriber OAuth setup.
