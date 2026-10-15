/** Restrictive exposure authoring only; unknown data is retained, never interpreted. */
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const copy = value => JSON.parse(JSON.stringify(value));
function requireValue(condition) {
    if (!condition) throw new Error('Unsupported or malformed list policy. Inspect the retained JSON.');
}
function canonicalView(value) {
    requireValue(typeof value === 'string' && /^00B[A-Za-z0-9]{12}([A-Z0-5]{3})?$/.test(value));
    const base = value.slice(0, 15);
    let checksum = '';
    for (let block = 0; block < 3; block++) {
        let bits = 0;
        for (let position = 0; position < 5; position++) {
            if (/[A-Z]/.test(base[block * 5 + position])) bits += 1 << position;
        }
        checksum += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'[bits];
    }
    requireValue(value.length === 15 || value === base + checksum);
    return base + checksum;
}
function canonicalList(value, objectApi) {
    requireValue(typeof value === 'string' && /^listview:[A-Za-z][A-Za-z0-9_]*:[a-z0-9_]+$/.test(value));
    requireValue(!objectApi || value.startsWith(`listview:${objectApi}:`));
    return value;
}
function legacy(value) {
    if (has(value, 'allowAdHoc') || !Array.isArray(value.views)) return false;
    if (!value.views.every(row => isObject(row) && typeof row.viewId === 'string' && typeof row.exposed === 'boolean' && !has(row, 'enabled'))) return false;
    return !has(value, 'customLists') || Array.isArray(value.customLists) && value.customLists.every(row => isObject(row)
        && typeof row.id === 'string' && typeof row.name === 'string' && !has(row, 'enabled') && !has(row, 'key'));
}
function targets(rows, kind, objectApi) {
    requireValue(Array.isArray(rows));
    const seen = new Set();
    return rows.map(row => {
        requireValue(isObject(row) && typeof row.enabled === 'boolean');
        const property = kind === 'salesforce' ? 'viewId' : 'key';
        const key = kind === 'salesforce' ? canonicalView(row[property]) : canonicalList(row[property], objectApi);
        requireValue(!seen.has(key)); seen.add(key);
        return {...row, [property]:key};
    });
}
/** objectApi is supplied by the owning object editor/reviewer for custom-key validation. */
export function parseExposure(json, catalog = [], objectApi) {
    const model = {mode:'unavailable',working:null,preserved:null,issues:[],catalog:copy(catalog),objectApi};
    try {
        if (json === null || json === undefined) return {...model,mode:'legacy'};
        const value = JSON.parse(json);
        requireValue(isObject(value));
        model.preserved = copy(value);
        if (!has(value, 'version')) {
            requireValue(legacy(value));
            return {...model,mode:'legacy',working:copy(value)};
        }
        requireValue(value.version === 1);
        requireValue(!has(value, 'allowAdHoc') || typeof value.allowAdHoc === 'boolean');
        model.working = {...copy(value),allowAdHoc:value.allowAdHoc ?? false,
            views:targets(value.views,'salesforce',objectApi),customLists:targets(value.customLists,'cardstack',objectApi)};
        model.mode = 'v1';
    } catch (error) { model.issues = [error.message]; }
    return model;
}
export function migrateExposure(model) {
    requireValue(model.mode === 'legacy');
    const retained = model.preserved || {};
    // Keep the complete legacy rows as inert inspection data. Their old flags
    // never implicitly select a target in the new restrictive policy.
    const working = {...copy(retained),version:1,allowAdHoc:false,views:[],customLists:[]};
    if (has(retained,'views') || has(retained,'customLists')) {
        // Avoid overwriting an unrelated property with the same name.
        let archive = 'legacyExposure';
        let suffix = 2;
        while (has(retained,archive)) archive = `legacyExposure${suffix++}`;
        working[archive] = {views:copy(retained.views),...(has(retained,'customLists') ? {customLists:copy(retained.customLists)} : {})};
    }
    return {...model,mode:'v1',working,issues:[]};
}
export function setExposure(model, kind, key, enabled) {
    requireValue(model.mode === 'v1' && ['salesforce','cardstack'].includes(kind) && typeof enabled === 'boolean');
    const identity = kind === 'salesforce' ? 'viewId' : 'key';
    const array = kind === 'salesforce' ? 'views' : 'customLists';
    const canonical = kind === 'salesforce' ? canonicalView(key) : canonicalList(key,model.objectApi);
    const rows = model.working[array];
    const existing = rows.find(row => row[identity] === canonical);
    requireValue(existing || model.catalog.some(row => row.kind === kind && row.key === canonical && row.availability === 'available'));
    const updated = existing ? rows.map(row => row[identity] === canonical ? {...row,enabled} : row) : [...rows,{[identity]:canonical,enabled}];
    return {...model,working:{...model.working,[array]:updated}};
}
export function serializeExposure(model) {
    requireValue(model.mode !== 'unavailable');
    return model.working === null ? '' : JSON.stringify(model.working);
}
function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (!isObject(value)) return value;
    return Object.keys(value).sort().reduce((result,key) => ({...result,[key]:ordered(value[key])}),{});
}
/** Compare complete supported JSON, including unknown properties, independent of key order. */
export function exposureFingerprint(model) {
    return model.mode === 'unavailable' ? null : JSON.stringify(ordered(model.working));
}
export function exposureRows(model) {
    if (model.mode !== 'v1') return [];
    const rows = model.catalog.map(row => ({...row}));
    for (const [array,kind,property] of [['views','salesforce','viewId'],['customLists','cardstack','key']]) {
        for (const selected of model.working[array]) {
            if (!rows.some(row => row.kind === kind && row.key === selected[property])) rows.push({kind,key:selected[property],label:'Unavailable or deleted list',availability:'unavailable'});
        }
    }
    return rows.map(row => {
        const selected = model.working[row.kind === 'salesforce' ? 'views' : 'customLists'].find(value => value[row.kind === 'salesforce' ? 'viewId' : 'key'] === row.key);
        const source = row.kind === 'salesforce' ? 'Salesforce view' : 'Cardstack saved list';
        const unavailable = row.availability !== 'available';
        return {...row,uiKey:`${row.kind}:${row.key}`,enabled:selected?.enabled === true,unavailable,
            choiceLabel:`${row.label} · ${source} · ${row.key}`,
            description:row.kind === 'salesforce' ? 'Salesforce user-mode SOQL fallback; original filters, columns and sorting are not reproduced.' : 'Uses existing saved Cardstack filters; this editor does not change those filters.',
            availabilityLabel:unavailable ? 'Unavailable to this admin or deleted. Selection retained; enabling it does not grant access.' : 'Available in current admin metadata; connected-user access is checked at runtime.'};
    });
}
