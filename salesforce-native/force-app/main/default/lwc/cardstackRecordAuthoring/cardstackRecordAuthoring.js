// Pure Studio authoring/presentation projection. Metadata is never execution authority.
const api = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value);
const scalarTypes = ['STRING', 'TEXTAREA', 'BOOLEAN', 'INTEGER', 'DATE', 'DECIMAL', 'DOUBLE', 'CURRENCY', 'EMAIL', 'PHONE', 'URL', 'PICKLIST'];
const boundedNativeTypes = ['EMAIL', 'PHONE', 'URL', 'PICKLIST'];
const syntheticChoices = [{label:'Synthetic option A',value:'SYNTHETIC_A'},{label:'Synthetic option B',value:'SYNTHETIC_B'}];
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f<>]/.test(value);
function descriptor(value, objectApi) {
    if (!value || value.contractVersion !== 'record-edit-eligibility/v1' || value.objectApiName !== objectApi || !api(objectApi) || typeof value.eligible !== 'boolean' || !Array.isArray(value.fields) || value.fields.length > 2000 || (value.eligible && !/^[A-Za-z0-9]{3}$/.test(value.nativeKeyPrefix || ''))) throw Error('Native edit metadata is unavailable or malformed.');
    if (!value.eligible) { if (!text(value.exclusionReason, 256)) throw Error('Native edit metadata is malformed.'); return value; }
    const seen = new Set();
    for (const field of value.fields) {
        if (!field || !api(field.fieldApi) || seen.has(field.fieldApi.toLowerCase()) || !text(field.label, 256) || typeof field.dataType !== 'string' || typeof field.nativeRequired !== 'boolean' || typeof field.canClear !== 'boolean' || typeof field.eligible !== 'boolean' || !['length','precision','scale'].every(key => Number.isInteger(field[key]) && field[key] >= 0) || (!field.eligible && !text(field.exclusionReason,256)) || (field.eligible && (!scalarTypes.includes(field.dataType.toUpperCase()) || field.nativeRequired && field.canClear || field.dataType.toUpperCase() === 'BOOLEAN' && field.canClear || ['INTEGER','DECIMAL','DOUBLE','CURRENCY'].includes(field.dataType.toUpperCase()) && ((field.precision < 1 && field.dataType.toUpperCase() !== 'INTEGER') || field.precision > 28 || field.scale > field.precision || field.dataType.toUpperCase() === 'INTEGER' && field.scale !== 0)))) throw Error('Native edit field metadata is malformed.');
        seen.add(field.fieldApi.toLowerCase());
        if (field.eligible && boundedNativeTypes.includes(field.dataType.toUpperCase()) && (field.length < 1 || field.length > 131072)) throw Error('Native edit field metadata is malformed.');
    }
    return JSON.parse(JSON.stringify(value));
}
function eligibleFields(capability, placements, permissions) {
    if (!capability?.eligible) return [];
    const denied = new Set((permissions.fieldDenylist || []).map(field => field.trim().toLowerCase()));
    const seen = new Set();
    return placements.filter(field => {
        const native = capability.fields.find(info => info.fieldApi === field.api);
        const allowed = native?.eligible && !denied.has(field.api.toLowerCase()) && placements.filter(other => other.api === field.api).every(other => other.editable && !other.readOnly);
        if (!allowed || seen.has(field.api)) return false;
        seen.add(field.api); return true;
    }).map(field => ({label:field.label || capability.fields.find(info => info.fieldApi === field.api).label,value:field.api}));
}
function actionErrors(action, capability, placements, permissions) {
    const mappings = action.mappings;
    if (action.flowApiName != null || !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 20 || mappings.some(mapping => !mapping || !api(mapping.fieldApi) || mapping.source !== 'current' || mapping.sourceField != null || mapping.value != null) || new Set(mappings.map(mapping => mapping.fieldApi.toLowerCase())).size !== mappings.length) return ['Choose one to twenty distinct fields with current-value mappings only.'];
    if (!capability?.eligible || !Array.isArray(capability.fields)) return ['Native edit metadata is unavailable.'];
    const errors = [];
    // Native staging validates canonical field shape even for disabled actions.
    // Only exposure and configured permissions may intentionally be reduced.
    mappings.forEach(mapping => {
        const native = capability.fields.find(field => field.fieldApi === mapping.fieldApi);
        if (!native?.eligible || typeof native.dataType !== 'string' || !scalarTypes.includes(native.dataType.toUpperCase())) errors.push(`${mapping.fieldApi}: native editor field unavailable (${native?.exclusionReason || 'UNKNOWN_OR_NONCANONICAL_FIELD'}).`);
    });
    if (errors.length || action.enabled === false) return errors;
    if (!permissions.writeEnabled) errors.push('Enable chat edits in Permissions before enabling this action. Drafts do not grant Salesforce access.');
    const allowed = new Set(eligibleFields(capability,placements,permissions).map(field => field.value));
    mappings.forEach(mapping => { if (!allowed.has(mapping.fieldApi)) errors.push(`${mapping.fieldApi}: expose an eligible native field and enable editing in every placement; Salesforce update access is required.`); });
    return errors;
}
function syntheticValue(field) {
    const type = field.dataType.toUpperCase();
    if (type === 'BOOLEAN') return 'false';
    if (type === 'DATE') return '2026-11-30';
    if (['INTEGER','DECIMAL','DOUBLE','CURRENCY'].includes(type)) return '0';
    if (type === 'PICKLIST') return 'SYNTHETIC_A';
    if (type === 'EMAIL') return 'synthetic@example.invalid'.slice(0,field.length);
    if (type === 'PHONE') return '+1 555 0100'.slice(0,field.length);
    if (type === 'URL') return 'https://example.invalid'.slice(0,field.length);
    return (type === 'TEXTAREA' ? 'Synthetic description' : 'Synthetic text').slice(0,field.length || 255);
}
function previewFields(action, capability, placements, permissions) {
    if (actionErrors({...action,enabled:true},capability,placements,permissions).length) return [];
    return action.mappings.map(mapping => {
        const field = capability.fields.find(info => info.fieldApi === mapping.fieldApi);
        const required = field.nativeRequired || placements.some(info => info.api === field.fieldApi && info.required === true);
        return {fieldApi:field.fieldApi,label:field.label,dataType:field.dataType.toUpperCase(),required,canClear:field.canClear && !required,length:field.length,precision:field.dataType.toUpperCase() === 'INTEGER' && field.precision === 0 ? 10 : field.precision,scale:field.scale,choices:field.dataType.toUpperCase() === 'PICKLIST' ? syntheticChoices.map(choice => ({...choice})) : [],value:syntheticValue(field),...(field.dataType.toUpperCase() === 'CURRENCY' ? {currencyCode:'USD'} : {})};
    });
}
function checkedPreviewFields(fields) {
    if (!Array.isArray(fields) || fields.length < 1 || fields.length > 20) throw Error('Invalid fields');
    const seen = new Set();
    return fields.map(field => {
        if (!field || Object.keys(field).some(key => !['fieldApi','label','dataType','required','canClear','length','precision','scale','choices','value','currencyCode'].includes(key)) || !api(field.fieldApi) || seen.has(field.fieldApi) || !text(field.label,256) || !scalarTypes.includes(field.dataType) || typeof field.required !== 'boolean' || typeof field.canClear !== 'boolean' || field.required && field.canClear || field.dataType === 'BOOLEAN' && field.canClear || !Array.isArray(field.choices) || !['length','precision','scale'].every(key => Number.isInteger(field[key]) && field[key] >= 0 && field[key] <= 131072) || field.value !== syntheticValue(field) || ['INTEGER','DECIMAL','DOUBLE','CURRENCY'].includes(field.dataType) && (field.precision < 1 || field.precision > 28 || field.scale > field.precision || field.dataType === 'INTEGER' && field.scale !== 0) || field.dataType === 'CURRENCY' && field.currencyCode !== 'USD' || boundedNativeTypes.includes(field.dataType) && (field.length < 1 || field.value.length > field.length)) throw Error('Invalid fields');
        const expected = field.dataType === 'PICKLIST' ? syntheticChoices : [];
        if (field.choices.length !== expected.length || field.choices.some((choice,index) => !choice || Object.keys(choice).some(key => !['label','value'].includes(key)) || choice.label !== expected[index].label || choice.value !== expected[index].value || choice.value.length > field.length)) throw Error('Invalid synthetic choices');
        seen.add(field.fieldApi); return {...field,choices:field.choices.map(choice => ({...choice}))};
    });
}
function previewLayout(action, highlights, sections) {
    const allowed = new Set((Array.isArray(action.mappings) ? action.mappings : []).filter(Boolean).map(mapping => mapping.fieldApi));
    const seen = new Set();
    const candidates = [{label:'Highlights',fields:highlights},...sections];
    const projected = candidates.map((section,index) => ({id:`section-${index}`,label:section.label || 'Details',columns:section.columns === 1 ? 1 : 2,fields:section.fields.filter(field => allowed.has(field.api) && !seen.has(field.api) && seen.add(field.api)).map(field => field.api)})).filter(section => section.fields.length);
    return projected.length ? {version:1,sections:projected} : null;
}
function syntheticId(prefix) {
    if (!/^[A-Za-z0-9]{3}$/.test(prefix || '')) throw Error('Invalid native key prefix');
    const id = prefix + '000000000001'; const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    let suffix = '';
    for (let i=0;i<15;i+=5) { let mask=0; for (let j=0;j<5;j++) if (/[A-Z]/.test(id[i+j])) mask |= 1 << j; suffix += alphabet[mask]; }
    return id + suffix;
}
const recordAuthoring = {descriptor,eligibleFields,actionErrors,previewFields,previewLayout,checkedPreviewFields,syntheticId};
export default recordAuthoring;
