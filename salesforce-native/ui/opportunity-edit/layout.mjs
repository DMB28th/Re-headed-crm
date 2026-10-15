// A closed declarative layout. No expressions, markup, styles or execution.
const exact = (x, keys) =>
  x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  Object.keys(x).every((k) => keys.includes(k));
export function resolveLayout(fields, layout) {
  if (layout == null)
    return [
      {
        id: 'fields',
        label: 'Details',
        columns: 2,
        fields: fields.map((f) => f.fieldApi),
      },
    ];
  if (
    !exact(layout, ['version', 'sections']) ||
    layout.version !== 1 ||
    !Array.isArray(layout.sections) ||
    layout.sections.length > 20
  )
    throw Error('INVALID_LAYOUT');
  const available = new Set(fields.map((f) => f.fieldApi)),
    seen = new Set(),
    ids = new Set();
  const sections = layout.sections.map((s) => {
    if (
      !exact(s, ['id', 'label', 'fields', 'columns']) ||
      typeof s.id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(s.id) ||
      ids.has(s.id) ||
      typeof s.label !== 'string' ||
      s.label.length > 256 ||
      ![1, 2].includes(s.columns) ||
      !Array.isArray(s.fields) ||
      s.fields.length === 0
    )
      throw Error('INVALID_LAYOUT');
    ids.add(s.id);
    for (const field of s.fields) {
      if (!available.has(field) || seen.has(field))
        throw Error('INVALID_LAYOUT');
      seen.add(field);
    }
    return {
      id: s.id,
      label: s.label,
      columns: s.columns,
      fields: [...s.fields],
    };
  });
  // A layout cannot silently hide an authorized required input.
  if (seen.size !== available.size) throw Error('INVALID_LAYOUT');
  return sections;
}
