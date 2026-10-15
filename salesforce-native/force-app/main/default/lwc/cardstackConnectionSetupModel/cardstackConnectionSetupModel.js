/** Shared pure state model. Manual guide history never creates connection evidence. */
export const STEPS = ['installation', 'site', 'claude', 'chatgpt', 'verify', 'nextGate'];
const CLIENTS = ['claude', 'chatgpt'];
const CODES = ['NOT_AUTHORIZED', 'STALE_SETUP', 'INVALID_SETUP', 'INVALID_CLIENT', 'DIAGNOSTIC_REJECTED', 'SETUP_UNAVAILABLE', 'INVALID_RESPONSE'];
const VIEW_KEYS = ['transportKind','routeVersion','client','revision','publicClientId','callbacks','sitePrefix','resourceUrl','metadataUrl','issuer','enabledIntent','versions','checks','summary','stepStates'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => value === null || (typeof value === 'string' && value.length <= max);
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const invalid = () => { throw new Error('INVALID_RESPONSE'); };
function checks(values) {
    if (!Array.isArray(values) || values.length > 110) invalid();
    values.forEach(c => {
        if (!keys(c,['stage','status','source','checkedAt','errorCode']) || !text(c.stage,80) || !['Pass','Fail','Unknown','Stale'].includes(c.status) || !text(c.source ?? null,256) || !text(c.checkedAt ?? null,40) || !text(c.errorCode ?? null,80)) invalid();
    });
}
function versions(value) {
    if (!keys(value,['package','transport','ui','permissionPolicy']) || !Object.values(value).every(v => text(v,80))) invalid();
}
export function parseView(serialized) {
    if (typeof serialized !== 'string' || serialized.length > 65536) invalid();
    let v;
    try { v = JSON.parse(serialized); } catch { invalid(); }
    if (!keys(v,VIEW_KEYS) || !CLIENTS.includes(v.client) || !Number.isInteger(v.revision) || v.revision < 0 || !text(v.publicClientId,256) || typeof v.enabledIntent !== 'boolean' || !text(v.sitePrefix,80) || !Array.isArray(v.callbacks) || v.callbacks.length > 10 || !v.callbacks.every(c => text(c,2048))) invalid();
    if (v.transportKind != null && (v.transportKind !== 'direct-org-api/v1' || v.routeVersion !== 'apex-probe/v1' || v.client !== 'chatgpt')) invalid();
    if (v.transportKind == null && v.routeVersion != null) invalid();
    if (!['Not configured','Needs verification','Diagnostic passed','Client UI observed','Needs attention','Stale'].includes(v.summary)) invalid();
    for (const key of ['resourceUrl','metadataUrl','issuer']) if (!text(v[key] ?? null,2048)) invalid();
    if (!keys(v.stepStates,STEPS) || !Object.values(v.stepStates).every(value => typeof value === 'boolean')) invalid();
    checks(v.checks); versions(v.versions);
    return v;
}
export function parseSupportSummary(serialized) {
    if (typeof serialized !== 'string' || serialized.length > 65536) invalid();
    let summary; try { summary = JSON.parse(serialized); } catch { invalid(); }
    if (!keys(summary,['status','versions','checks']) || !['Not configured','Needs verification','Diagnostic passed','Client UI observed','Needs attention','Stale'].includes(summary.status)) invalid();
    versions(summary.versions); checks(summary.checks);
    if (summary.checks.some(check => !keys(check,['stage','status','errorCode','checkedAt']))) invalid();
    return summary;
}
export function parseReceipt(serialized) {
    if (typeof serialized !== 'string' || serialized.length > 32768) invalid();
    let r; try { r = JSON.parse(serialized); } catch { invalid(); }
    if (!keys(r,['client','versions','configurationRevision','checkedAt','expiresAt','exactValues','stages']) || !CLIENTS.includes(r.client) || !Number.isInteger(r.configurationRevision) || typeof r.exactValues !== 'boolean' || !text(r.checkedAt,40) || !text(r.expiresAt,40)) invalid();
    checks(r.stages); versions(r.versions); return r;
}
export const createState = () => ({ clients: Object.fromEntries(CLIENTS.map(client => [client, {view:null,draft:null,dirty:false,error:null,authorized:true}])) });
export function acceptView(state, view, saved = false) {
    const entry = state.clients[view.client]; entry.view = view; entry.authorized = true;
    if (!entry.dirty || saved) {
        entry.draft = {client:view.client,expectedRevision:view.revision,publicClientId:view.publicClientId || '',callbacks:[...view.callbacks],siteId:'',sitePrefix:view.sitePrefix || '',enabledIntent:view.enabledIntent,stepStates:{...view.stepStates}};
        if (view.transportKind === 'direct-org-api/v1') Object.assign(entry.draft,{transportKind:view.transportKind,routeVersion:view.routeVersion});
        entry.dirty = false; entry.error = null;
    }
}
export function editDraft(state, client, field, value) {
    const entry = state.clients[client];
    if (!entry.authorized || !entry.draft || !['publicClientId','callbacks','siteId','sitePrefix','enabledIntent','stepStates'].includes(field)) return;
    entry.draft = {...entry.draft,[field]:value}; entry.dirty = true;
}
export function recordFailure(state, client, error) {
    const entry = state.clients[client]; entry.error = safeError(error);
    if (entry.error === 'NOT_AUTHORIZED') entry.authorized = false;
}
export function savePayload(state, client) {
    const entry = state.clients[client];
    if (!entry.authorized) throw new Error('NOT_AUTHORIZED');
    if (!entry.draft) throw new Error('INVALID_SETUP');
    return JSON.parse(JSON.stringify(entry.draft));
}
export function safeError(error) {
    const code = error?.body?.message || error?.message;
    return CODES.includes(code) ? code : 'SETUP_UNAVAILABLE';
}
export function connectionStatus(view) {
    if (!view) return 'Unknown';
    if (view.summary === 'Stale' || view.checks.some(c => c.status === 'Stale')) return 'Stale';
    if (view.checks.some(c => c.status === 'Fail')) return 'Needs attention';
    const passed = stage => view.checks.some(c => c.stage === stage && c.status === 'Pass');
    if (passed('diagnosticExchange') && passed('clientUiObserved')) return 'Client UI observed';
    if (passed('diagnosticExchange')) return 'Diagnostic passed';
    return view.revision === 0 ? 'Not configured' : 'Needs verification';
}
export function showConnectionAttention(views) {
    const clients = Object.fromEntries(CLIENTS.map(client => [client,{view:views[client]}]));
    return connectionSummary({clients}).needsAttention;
}
/** Display and event attention share the same current error, authorization and evidence state. */
export function connectionSummary(state) {
    const clients = CLIENTS.map(client => {
        const entry = state.clients[client];
        const status = entry.authorized === false || entry.error === 'NOT_AUTHORIZED' ? 'Admin permission required' :
            entry.error ? 'Needs attention' : connectionStatus(entry.view);
        return {client,status};
    });
    return {clients,needsAttention:clients.some(entry => entry.status !== 'Client UI observed')};
}
const LINKS = {site:'/lightning/setup/CustomDomain/home',oauth:'/lightning/setup/ManageExternalClientApplication/home',permissions:'/lightning/setup/PermSets/home',authorization:'/lightning/settings/personal/Connections/home'};
/** Every navigable destination is a fixed Salesforce path, never a provider response URL. */
export function recovery(stage, code, transportKind) {
    const direct = transportKind === 'direct-org-api/v1';
    if (direct && code === 'GUEST_401') return {message:'The existing direct endpoint requires a named Salesforce user with Cardstack User access. Inspect the existing connection and saved enrollment; preserve current authentication settings.',href:LINKS.permissions};
    if (direct && code === 'REDIRECT_MISMATCH') return {message:'Compare saved callback evidence with the existing named connection in Salesforce Setup. Preserve current authentication settings while inspecting the mismatch.',href:LINKS.oauth};
    if (direct && ['ISSUER_MISMATCH','METADATA_MISMATCH'].includes(code)) return {message:'Compare the existing direct endpoint and current org domain with the saved enrollment. Preserve current authentication settings while inspecting the mismatch.',href:LINKS.oauth};
    if (direct && ['TOKEN_EXPIRED','TOKEN_REVOKED'].includes(code)) return {message:'Let the existing connection refresh through Salesforce once. If it fails, inspect its connected authorization before retrying; preserve current authentication settings.',href:LINKS.authorization};
    if (code === 'ATTEMPT_EXPIRED') return {message:'This diagnostic attempt expired. Run a fresh diagnostic in the affected client; the expired attempt cannot be reused.',href:LINKS.authorization};
    if (code === 'REDIRECT_MISMATCH') return {message:'Compare the exact saved callbacks with the callback shown in this client. Correct only its app, then obtain fresh consent.',href:LINKS.oauth};
    if (code === 'GUEST_401') return {message:'Inspect the runtime app: opaque tokens, JWT OFF. Obtain fresh authorization. Guest data access must remain disabled.',href:LINKS.oauth};
    if (code === 'NOT_AUTHORIZED' || code === 'NAMED_403') return {message:'Ask an administrator to inspect Cardstack, app assignment and CRM permissions. Setup requires Cardstack Admin.',href:LINKS.permissions};
    if (['TOKEN_EXPIRED','TOKEN_REVOKED'].includes(code)) return {message:'Let the client refresh through Salesforce once. If refresh fails, reconnect and run a fresh diagnostic.',href:LINKS.authorization};
    if (code === 'SAVE_OUTCOME_UNKNOWN') return {message:'Load the authoritative saved configuration before retrying. For a CRM write, resolve its authoritative receipt; transport failure does not prove no write.',href:LINKS.authorization};
    if (code === 'STALE_SETUP' || stage === 'configuration') return {message:'Configuration changed. Compare the saved revision with your draft, explicitly reload if needed, then rerun diagnostics.',href:LINKS.oauth};
    if (['htmlLoading','hostBridge','clientUiObserved'].includes(stage)) return {message:'Inspect the actual client form, resource loading and host bridge separately. Preserve successful authorization evidence; rerun the diagnostic in this client.',href:LINKS.oauth};
    if (code === 'ISSUER_MISMATCH' || code === 'METADATA_MISMATCH') return {message:'Verification is blocked until the canonical org issuer and metadata match. Inspect the selected Site and org domain.',href:LINKS.site};
    if (direct || stage === 'directTransport') return {message:'Inspect the saved existing direct endpoint enrollment and current org domain. Preserve the existing connection and current authentication settings.',href:LINKS.oauth};
    if (stage === 'oauthPolicy') return {message:'OAuth settings are unreadable here: Unknown. Manually inspect this client’s Local External Client App in Salesforce Setup.',href:LINKS.oauth};
    return {message:'Site settings are unreadable here: Unknown. Inspect the selected Site, domain and narrow guest ingress access in Salesforce Setup.',href:LINKS.site};
}

/** Presentation uses current server evidence only; drafts and instruction history are not proof. */
export function setupStages(entry) {
    const view = entry?.view;
    const denied = entry?.authorized === false || entry?.error === 'NOT_AUTHORIZED';
    const evidence = view?.checks || [];
    const definitions = [
        ['installation','Check installation',[], 'Inspect Cardstack Admin access and the installed package.'],
        view?.transportKind === 'direct-org-api/v1' ? ['site','Inspect the existing direct endpoint',['directTransport'],'Inspect the existing Salesforce org API endpoint and its saved enrollment. Keep the existing connection and authentication settings.'] : ['site','Prepare the Site',['site'], 'Inspect the active Site, its ID, path prefix and narrow guest ingress in Salesforce Setup.'],
        ['claude','Configure Claude',view?.client === 'claude' ? ['oauthPolicy'] : [], 'Select Claude and inspect its dedicated app and exact callback in Salesforce Setup.'],
        ['chatgpt','Configure ChatGPT',view?.client === 'chatgpt' ? ['oauthPolicy'] : [], 'Select ChatGPT and inspect its dedicated app and the callback displayed by its connection draft.'],
        ['verify','Connect and verify',['diagnosticExchange','clientUiObserved'], 'Run the seven-value diagnostic in this client, then record your actual UI observation.'],
        ['nextGate','Ready for next gate',[], 'Open Record Cards. Governed CRM review, confirm, save, independent read-back and refresh are separate gates.']
    ];
    return definitions.map(([key,title,required,nextAction]) => {
        const current = evidence.filter(check => required.includes(check.stage) || key === 'verify' && check.stage === 'configuration');
        const blocked = current.find(check => check.status === 'Fail');
        const stale = current.find(check => check.status === 'Stale');
        const complete = required.length > 0 && required.every(stage => current.some(check => check.stage === stage && check.status === 'Pass'));
        const errorHere = entry?.error && (key === 'installation' && denied || key === 'verify' && !denied);
        let status = denied || errorHere || blocked ? 'blocked' : stale ? 'stale' : complete ? 'verified' : 'unknown';
        if (key === 'installation' && view && !denied) status = 'ready';
        if (key === 'nextGate' && !denied) status = 'separate gate';
        const failure = blocked || stale || current.find(check => check.status === 'Unknown');
        const hint = recovery(errorHere ? 'configuration' : failure?.stage || (CLIENTS.includes(key) ? 'oauthPolicy' : key), errorHere ? entry.error : failure?.errorCode, view?.transportKind);
        return {key,title,status,nextAction:denied ? 'Ask an administrator to inspect your Cardstack Admin access.' : blocked || stale || errorHere ? hint.message : nextAction,
            recovery:key === 'installation' ? recovery('permissions','NOT_AUTHORIZED', view?.transportKind) : hint};
    });
}
export function nextSetupStage(entry) {
    const stages = setupStages(entry);
    return stages.find(stage => ['blocked','stale'].includes(stage.status))?.key ||
        stages.find(stage => stage.status === 'unknown' && (!CLIENTS.includes(stage.key) || stage.key === entry?.view?.client))?.key || 'nextGate';
}
