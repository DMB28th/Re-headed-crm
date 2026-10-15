/** Active Studio authoring keys. Keep aligned with CardstackConfigService. */
export function isSupportedStudioKey(key) {
    return typeof key === 'string' && (key === 'flows'
        || /^flow-plan:[A-Za-z][A-Za-z0-9_]*:default$/.test(key)
        || /^layout:[A-Za-z][A-Za-z0-9_]*:default$/.test(key)
        || /^exposures:[A-Za-z][A-Za-z0-9_]*$/.test(key));
}

/** Human experience names; unknown/retained keys never imply active support. */
export function studioConfigLabel(key, objects = []) {
    if (!isSupportedStudioKey(key)) return `Retained configuration (${key || 'unknown key'})`;
    if (key === 'flows') return 'Flow launch cards';
    if (key.startsWith('flow-plan:')) return `${key.split(':')[1]} in-chat Flow`;
    const objectApi = key.split(':')[1];
    const label = objects.find(object => object.objectApi === objectApi)?.label || objectApi;
    return `${label} ${key.startsWith('layout:') ? 'record card' : 'lists'}`;
}
