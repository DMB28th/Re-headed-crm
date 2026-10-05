# Cardstack native Salesforce beta

`force-app/` is the authoritative deployable source. API version is **67.0**. Legacy Node/Railway applications are retired. The sibling `config/`, `audit/`, `admin-lwc/`, and `permissions/` exports are historical copies; their required metadata is consolidated in `force-app`. `compatibility/` contains retired types and spike widgets, excluded from current deployment.

Cardstack runs entirely in Salesforce: 17 Hosted MCP tools, HXL widgets, a Lightning Studio app, configuration drafts/publishing, and audit services. Execution uses the connected user, sharing, and user-mode queries. There is no delete-record tool.

## Beta limits

- Record cards use the verified flat-field renderer. Studio retains Highlights Panel and named sections; Apex also flattens those values for chat compatibility. Sectioned chat rendering remains future work.
- Named list views use a clearly labeled user-mode SOQL fallback. Arbitrary Salesforce saved-view filters, columns, and sorting are **not reproduced**. “My” filters never broaden to other owners when empty. Saved Cardstack filters remain supported.
- Hosted MCP fatally rejects `UserInfo.getSessionId()` in the named-view path. The beta removes self-REST access rather than relying on catches.
- The compatible list renderer uses `cardstackTableV2`, iterating returned `rows` and their `cells`. The list tool uses versioned Lightning types `cardstackListViewOutputValuesV2` and `cardstackListViewResultV3`; old immutable schemas referenced nonexistent Apex classes.
- The beta unlocked package contains Apex, Studio, and configuration/audit objects. HXL widgets, Lightning types, and the Hosted MCP definition require companion setup. Salesforce's package validation org rejected widgets as unavailable; McpServerDefinition is not supported in unlocked packages. This distribution gap is explicitly deferred for later investigation.
- OAuth External Client Apps are configured per org. Do not distribute this development org's OAuth configuration as subscriber setup. Assign Cardstack Admin to admins and Cardstack User to connected users; ensure connected users also have the required Apex tool access, CRM object/field permissions, and Hosted MCP access.

## Development deployment

Before every deployment session, turn OFF JWT-based access tokens on Card Stack SFAPP and obtain a fresh opaque CLI login. After deployment, restore JWT to **ON** for Claude. Never log credentials or session values.

```sh
sf org login web --alias cardstack-spike2
sf project deploy start --source-dir force-app --target-org cardstack-spike2 --api-version 67.0
sf apex run test --target-org cardstack-spike2 --test-level RunLocalTests --result-format json --wait 10 --api-version 67.0
```

See `package/UNLOCKED_PACKAGE.md` for the beta build and companion setup. Do not promote the beta.
