import { isSupportedStudioKey } from 'c/cardstackStudioKeys';
import { parseExposure } from 'c/cardstackListConfigModel';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const field = value => typeof value === 'string' && value.length > 0
    || object(value) && [value.api, value.fieldApi, value.name].some(api => typeof api === 'string' && api.length > 0);

function requireShape(condition) {
    if (!condition) throw new Error('Unsupported configuration structure. Inspect the raw JSON.');
}
function validateOptional(value, names, type) {
    for (const name of names) requireShape(!owns(value, name) || typeof value[name] === type);
}
function validateFields(fields) {
    requireShape(Array.isArray(fields) && fields.every(field));
    for (const value of fields.filter(object)) {
        validateOptional(value, ['editable', 'required', 'readOnly'], 'boolean');
        validateOptional(value, ['api', 'fieldApi', 'name', 'label', 'column'], 'string');
    }
}
function validateSections(sections) {
    requireShape(Array.isArray(sections));
    for (const section of sections) {
        requireShape(object(section) && (!owns(section, 'columns') || [1, 2, 3].includes(section.columns)));
        validateOptional(section, ['label', 'title'], 'string');
        validateFields(section.fields);
    }
}
function validateMappings(mappings) {
    requireShape(Array.isArray(mappings));
    const apiName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
    for (const mapping of mappings) {
        requireShape(object(mapping) && apiName(mapping.fieldApi));
        requireShape(['current', 'field', 'constant', 'answer'].includes(mapping.source));
        // Known nullable String properties match the native Mapping DTO. Unknown
        // metadata stays intact and participates in the recursive comparison.
        requireShape(mapping.sourceField == null || apiName(mapping.sourceField));
        requireShape(mapping.value == null || typeof mapping.value === 'string');
        requireShape(mapping.source !== 'field' || apiName(mapping.sourceField));
        requireShape(mapping.source !== 'constant' || typeof mapping.value === 'string');
    }
}
function validateLayout(value) {
    requireShape(object(value));
    requireShape(['sections', 'highlights', 'fields', 'recordCard', 'actions', 'permissions'].some(key => owns(value, key)));
    if (owns(value, 'sections')) validateSections(value.sections);
    if (owns(value, 'highlights')) validateFields(value.highlights);
    if (owns(value, 'fields')) validateFields(value.fields);
    if (owns(value, 'recordCard')) {
        requireShape(object(value.recordCard));
        if (owns(value.recordCard, 'sections')) validateSections(value.recordCard.sections);
        if (owns(value.recordCard, 'fields')) validateFields(value.recordCard.fields);
        requireShape(owns(value.recordCard, 'sections') || owns(value, 'sections') || owns(value, 'fields') || owns(value, 'highlights'));
    }
    if (owns(value, 'permissions')) {
        requireShape(object(value.permissions));
        const policy = value.permissions;
        requireShape(!owns(policy, 'writeEnabled') || typeof policy.writeEnabled === 'boolean');
        requireShape(!owns(policy, 'fieldDenylist') || Array.isArray(policy.fieldDenylist) && policy.fieldDenylist.every(v => typeof v === 'string'));
    }
    if (owns(value, 'actions')) {
        requireShape(Array.isArray(value.actions));
        for (const action of value.actions) {
            requireShape(object(action) && typeof action.name === 'string');
            requireShape(!owns(action, 'enabled') || typeof action.enabled === 'boolean');
            if (owns(action, 'mappings')) validateMappings(action.mappings);
        }
    }
}

// Only migrate placement understood by the existing Studio layout authoring model.
// All other keys, values, flags, and array order remain comparison inputs.
function normalizeLayout(value, key) {
    const result = { ...value };
    if (!owns(result, 'sections') && result.recordCard?.sections) {
        result.sections = result.recordCard.sections;
        result.recordCard = { ...result.recordCard };
        delete result.recordCard.sections;
        if (!Object.keys(result.recordCard).length) delete result.recordCard;
    } else if (!owns(result, 'sections') && owns(result, 'fields')) {
        result.sections = [{ label: `${key.split(':')[1]} Information`, columns: 2, fields: result.fields }];
        delete result.fields;
    }
    return result;
}
function validate(value, key) {
    if (key.startsWith('layout:')) validateLayout(value);
    else if (key === 'flows') {
        requireShape(Array.isArray(value) && value.every(v => object(v) && typeof (v.apiName || v.flowApiName) === 'string'));
        for (const policy of value) {
            validateOptional(policy, ['enabled'], 'boolean');
            validateOptional(policy, ['apiName', 'flowApiName', 'label', 'renderMode'], 'string');
        }
    } else {
        requireShape(parseExposure(JSON.stringify(value), [], key.split(':')[1]).mode !== 'unavailable');
    }
}
function labelFor(path, before, after, owner) {
    const names = { writeEnabled: 'Write enabled', fieldDenylist: 'Denied fields', editable: 'Chat editing', required: 'Required', readOnly: 'Read only', columns: 'Section columns', highlights: 'Highlights', enabled: 'Enabled', allowAdHoc: 'Allow unnamed filtered requests', version: 'Policy version', mappings: 'Action mappings' };
    const property = path.split('.').pop();
    const changedValue = after === undefined ? before : after;
    const value = object(changedValue) ? changedValue : owner;
    const api = object(value) ? value.viewId || value.key || value.api || value.fieldApi || value.apiName || value.flowApiName || value.name : '';
    const exposureLabel = object(value) && (value.viewId || value.key) ? `${value.viewId ? 'Salesforce view' : 'Cardstack saved list'} ${property === 'enabled' ? 'enabled' : 'selection'}` : null;
    return `${exposureLabel || names[property] || property || 'Configuration'}${api ? ` — ${value.label || api} (${api})` : ''} (${path || 'configuration'})`;
}
function walk(before, after, path, changes, owner) {
    if (before === after) return;
    if (object(before) && object(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const key of keys) walk(before[key], after[key], path ? `${path}.${key}` : key, changes, after);
    } else if (Array.isArray(before) && Array.isArray(after)) {
        for (let index = 0; index < Math.max(before.length, after.length); index++) {
            walk(before[index], after[index], `${path}[${index}]`, changes);
        }
    } else {
        changes.push({ path, label: labelFor(path, before, after, owner), before, after });
    }
}

/** Pure review data; never returns an execution request or rewrites saved JSON. */
export function compareConfig(key, liveJson, draftJson) {
    try {
        requireShape(isSupportedStudioKey(key));
        const draft = JSON.parse(draftJson);
        validate(draft, key);
        const live = liveJson === null ? null : JSON.parse(liveJson);
        if (liveJson !== null) validate(live, key);
        const normalized = value => key.startsWith('layout:') ? normalizeLayout(value, key) : key.startsWith('exposures:') ? parseExposure(JSON.stringify(value), [], key.split(':')[1]).working : value;
        const changes = [];
        const before = live === null ? key.startsWith('exposures:') ? {views:[],customLists:[]} : undefined : normalized(live);
        walk(before, normalized(draft), '', changes);
        return { status: changes.length ? 'changed' : 'unchanged', changes,
            message: changes.length ? live === null ? 'New configuration — nothing is published yet.' : `${changes.length} configuration changes.` : 'No changes.' };
    } catch (error) {
        return { status: 'unavailable', changes: [], message: `Comparison unavailable: ${error.message}` };
    }
}
