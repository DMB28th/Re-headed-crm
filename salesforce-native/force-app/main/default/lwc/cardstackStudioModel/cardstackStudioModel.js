/** Native Studio events: configchange {keys,operation}; navigatetab
 * {tab,objectApi?,draftId?,action?,setupStage?}. Targets use the latter contract.
 * Readiness describes current-admin configuration; it never simulates runtime FLS.
 */
export const NAV_ITEMS = Object.freeze([
    {value:'overview',label:'Overview'},
    {value:'setup',label:'Setup'},
    {value:'objects',label:'Record Cards'},
    {value:'flows',label:'Flows'},
    {value:'publish',label:'Review & Publish'},
    {value:'audit',label:'Activity'}
]);

const apiKey = value => typeof value === 'string' ? value.toLowerCase() : null;
const present = value => typeof value === 'string' && value.trim().length > 0;
/** Saved candidates and published policy coexist. Compare raw JSON without discarding unknown properties. */
export function draftState({workingJson,savedJson,liveJson,busy,error} = {}) {
    const hasDraft = present(savedJson);
    const hasLive = present(liveJson);
    const baseline = hasDraft ? savedJson : hasLive ? liveJson : null;
    const dirty = typeof workingJson === 'string' && workingJson !== (baseline ?? '');
    let label = dirty ? 'Unsaved changes' : hasDraft ? 'Draft saved' : hasLive ? 'Published' : 'Not configured';
    if (busy) label = 'Saving…';
    else if (error) label = 'Error';
    return {dirty,hasDraft,hasLive,label};
}

/** Configuration prerequisites only. Publication and actual client evidence require their own checks. */
export function readiness({layout,fieldMetadata,actionErrors} = {}) {
    const knownLayout = layout && typeof layout === 'object' && !Array.isArray(layout);
    const malformed = knownLayout && (Array.isArray(layout.sections) && layout.sections.some(section => !section || !Array.isArray(section.fields)) || layout.permissions?.fieldDenylist != null && !Array.isArray(layout.permissions.fieldDenylist));
    const fields = knownLayout ? [
        ...(Array.isArray(layout.highlights) ? layout.highlights : []),
        ...(Array.isArray(layout.sections) ? layout.sections.flatMap(section => Array.isArray(section?.fields) ? section.fields : []) : []),
        ...(Array.isArray(layout.fields) ? layout.fields.map(field => typeof field === 'string' ? {api:field} : field) : [])
    ] : [];
    const knownMetadata = Array.isArray(fieldMetadata);
    const metadata = new Map((knownMetadata ? fieldMetadata : []).filter(field => field && typeof field.api === 'string').map(field => [field.api.toLowerCase(),field]));
    const validFields = fields.length > 0 && fields.every(field => field && typeof field.api === 'string' && metadata.has(field.api.toLowerCase()));
    const editable = fields.filter(field => field && (field.editable || field.required));
    const knowsEditability = editable.every(field => {
        const info = metadata.get(apiKey(field.api));
        return info && [true,false,'true','false'].includes(info.updateable);
    });
    const validEdits = fields.every(field => !(field?.readOnly && (field.editable || field.required)))
        && (editable.length === 0 || layout?.permissions?.writeEnabled === true)
        && editable.every(field => {
            const info = metadata.get(apiKey(field.api));
            return !field.readOnly && (info?.updateable === true || info?.updateable === 'true')
                && !(Array.isArray(layout?.permissions?.fieldDenylist) ? layout.permissions.fieldDenylist : []).some(api => typeof api === 'string' && api.toLowerCase() === apiKey(field.api));
        });
    const item = (key,status,message,target) => ({key,status,message,target});
    const objectTarget = action => ({tab:'objects',action});
    return [
        item('fields', !knownLayout || !knownMetadata ? 'unavailable' : validFields ? 'ready' : 'attention',
            !knownMetadata ? 'Field metadata is unavailable.' : validFields ? 'Configured fields are available to this admin.' : 'Choose available fields for the card.', objectTarget('fields')),
        item('edits', !knownLayout || malformed || !knownMetadata || !knowsEditability ? 'unavailable' : validFields && validEdits ? 'ready' : 'attention',
            malformed ? 'Retained edit settings are malformed; inspect configuration before editing.' : !knownMetadata || !knowsEditability ? 'Field edit metadata is unavailable.' : validEdits ? editable.length === 0 ? 'This card is read only; editing is optional.' : 'Edit settings respect the current admin metadata and card policy.' : 'Check allowed edits, required fields and write policy.', objectTarget('permissions')),
        item('actions', !knownLayout || !Array.isArray(actionErrors) ? 'unavailable' : actionErrors.length ? 'attention' : 'ready',
            !Array.isArray(actionErrors) ? 'Action validation is unavailable.' : actionErrors.length ? 'Resolve action validation errors.' : 'Action validation has no errors.', objectTarget('actions')),
        item('save','attention','Save working changes as a draft before review.',objectTarget('save')),
        item('publish','attention','Review the exact saved draft before publishing.',{tab:'publish'}),
        item('test','unavailable','Actual chat client verification is required.',{tab:'setup',setupStage:'verify'})
    ];
}
