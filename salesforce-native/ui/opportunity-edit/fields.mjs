// Public field registry only. No transport, CRM object names or write authority.
export const registry = Object.freeze({
  STRING: { tag: 'input', kind: 'text' },
  TEXTAREA: { tag: 'textarea', kind: 'text' },
  EMAIL: { tag: 'input', kind: 'text' },
  PHONE: { tag: 'input', kind: 'text' },
  URL: { tag: 'input', kind: 'text' },
  BOOLEAN: { tag: 'input', kind: 'checkbox' },
  INTEGER: { tag: 'input', kind: 'integer' },
  DECIMAL: { tag: 'input', kind: 'decimal' },
  DOUBLE: { tag: 'input', kind: 'decimal' },
  CURRENCY: { tag: 'input', kind: 'decimal' },
  DATE: { tag: 'input', kind: 'date' },
  PICKLIST: { tag: 'select', kind: 'choice' },
});
export const boundedText = (x, max = 256) =>
  typeof x === 'string' && x.length <= max;
export const scalar = (x) => x === null || boundedText(x, 4096);
export function checkedFields(rows) {
  if (!Array.isArray(rows) || rows.length > 100) throw Error('INVALID_FIELDS');
  const seen = new Set();
  return rows.map((f) => {
    if (
      !f ||
      Object.keys(f).some(
        (k) =>
          ![
            'fieldApi',
            'label',
            'value',
            'dataType',
            'required',
            'canClear',
            'choices',
            'currencyCode',
            'length',
            'precision',
            'scale',
          ].includes(k),
      ) ||
      !boundedText(f.fieldApi, 80) ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(f.fieldApi) ||
      seen.has(f.fieldApi) ||
      !boundedText(f.label) ||
      !boundedText(f.dataType, 40) ||
      !scalar(f.value)
    )
      throw Error('INVALID_FIELDS');
    seen.add(f.fieldApi);
    const choices = f.choices ?? [];
    const values = new Set();
    if (!Array.isArray(choices) || choices.length > 500)
      throw Error('INVALID_CHOICES');
    const checked = choices.map((c) => {
      if (
        !c ||
        Object.keys(c).some((key) => !['label', 'value'].includes(key)) ||
        !boundedText(c.label) ||
        !boundedText(c.value, 256) ||
        !c.value ||
        values.has(c.value)
      )
        throw Error('INVALID_CHOICES');
      values.add(c.value);
      return { label: c.label, value: c.value };
    });
    if (f.currencyCode != null && !/^[A-Z]{3}$/.test(f.currencyCode))
      throw Error('INVALID_CURRENCY');
    for (const name of ['length', 'precision', 'scale'])
      if (f[name] != null && (!Number.isSafeInteger(f[name]) || f[name] < 0 || f[name] > 131072))
        throw Error('INVALID_FIELDS');
    return {
      fieldApi: f.fieldApi,
      label: f.label,
      value: f.value,
      dataType: f.dataType.toUpperCase(),
      required: f.required === true,
      canClear: f.canClear === true,
      choices: checked,
      currencyCode: f.currencyCode ?? null,
      ...(f.length == null ? {} : { length: f.length }),
      ...(f.precision == null ? {} : { precision: f.precision }),
      ...(f.scale == null ? {} : { scale: f.scale }),
    };
  });
}
export function calendar(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map((v) => parseInt(v, 10));
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return (
    y >= 1 &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
  );
}
// Exact native bounds, using digit strings rather than floating-point coercion.
export function nativeNumericValue(value, field) {
  const canonical = canonicalNumericValue(value, field?.dataType);
  if (canonical === null) return null;
  const literal = canonical.replace(/^-/, ''), [whole, fraction = ''] = literal.split('.');
  const digits = (whole || '0').replace(/^0+/, '');
  const significantFraction = fraction.replace(/0+$/, '');
  if (field?.precision != null && (field.precision < 1 || field.scale == null || field.scale > field.precision || digits.length > field.precision - field.scale || significantFraction.length > field.scale)) return null;
  if (field?.dataType === 'INTEGER' && field.precision != null && (digits.length > 10 || (digits.length === 10 && digits > (canonical.startsWith('-') ? '2147483648' : '2147483647')))) return null;
  return canonical;
}
// Exact ASCII grouping only. No numeric coercion, locale parsing or rounding.
export function canonicalNumericValue(value, dataType) {
  // Group separators may expand a bounded canonical literal; outgoing values
  // retain the existing 4096-character limit.
  if (!boundedText(value, 5463)) return null;
  const kind =
    registry[typeof dataType === 'string' ? dataType.toUpperCase() : '']?.kind;
  const whole = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/;
  const decimal = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
  const valid =
    kind === 'integer'
      ? whole.test(value)
      : kind === 'decimal' && (decimal.test(value) || /^-?\.\d+$/.test(value));
  if (!valid) return null;
  // Native decimal grammars require an integer part. Add it as text only;
  // preserve fractional digits, sign, grouping removal and exact value identity.
  const canonical = value.replaceAll(',', '').replace(/^(-?)\./, '$10.');
  return boundedText(canonical, 4096) ? canonical : null;
}
export function formatFieldValue(field, value) {
  const canonical = canonicalNumericValue(value, field?.dataType);
  if (canonical === null) return value;
  const negative = canonical.startsWith('-'),
    literal = negative ? canonical.slice(1) : canonical;
  const [whole, fraction] = literal.split('.');
  return (
    (negative ? '-' : '') +
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (fraction === undefined ? '' : '.' + fraction)
  );
}
export function validateChanges(fields, drafts = {}) {
  const changes = [],
    errors = [];
  for (const f of fields) {
    const draft = Object.hasOwn(drafts, f.fieldApi) ? drafts[f.fieldApi] : null;
    if (!draft || draft.operation === 'keep') continue;
    let message;
    if (!registry[f.dataType])
      message = 'This field type is unavailable for editing.';
    else if (draft.operation === 'clear') {
      if (f.required || !f.canClear) message = 'This field cannot be cleared.';
      else {
        changes.push({ fieldApi: f.fieldApi, operation: 'clear' });
        continue;
      }
    } else if (
      draft.operation !== 'set' ||
      !boundedText(
        draft.value,
        ['integer', 'decimal'].includes(registry[f.dataType].kind)
          ? 5463
          : 4096,
      )
    )
      message = 'Enter a supported value.';
    else {
      const v = draft.value,
        kind = registry[f.dataType].kind;
      if (f.required && v.trim() === '')
        message = 'Enter a value for this required field.';
      else if (
        kind === 'integer' &&
        canonicalNumericValue(v, f.dataType) === null
      )
        message =
          'Enter a whole number; commas must separate groups of three digits.';
      else if (
        kind === 'decimal' &&
        canonicalNumericValue(v, f.dataType) === null
      )
        message =
          'Enter an exact decimal; commas must group three digits. Exponents are not allowed. Use Clear to remove the value.';
      else if (['integer', 'decimal'].includes(kind) && nativeNumericValue(v, f) === null)
        message = 'Enter a number within the native precision, scale and range.';
      else if (['STRING', 'TEXTAREA', 'EMAIL', 'PHONE', 'URL'].includes(f.dataType) && f.length != null && v.length > f.length)
        message = 'Enter text within the native field length.';
      else if (kind === 'date' && !calendar(v))
        message = 'Enter a valid calendar date as YYYY-MM-DD.';
      else if (kind === 'checkbox' && !['true', 'false'].includes(v))
        message = 'Choose true or false.';
      else if (kind === 'choice' && !f.choices.some((c) => c.value === v))
        message = 'Choose an available option or keep the current value.';
      else
        changes.push({
          fieldApi: f.fieldApi,
          operation: 'set',
          value: ['integer', 'decimal'].includes(kind)
            ? canonicalNumericValue(v, f.dataType)
            : v,
        });
    }
    if (message)
      errors.push({ fieldApi: f.fieldApi, code: 'CLIENT_VALUE', message });
  }
  return { changes, errors };
}

// A resumed server form projects retained answers into value. Reviewing replaces
// the complete answer map, so preserve every visible supported literal explicitly.
// Only recovery uses this projection; initial-start descriptors remain Keep.
export function draftsFromFields(fields) {
  return Object.fromEntries(
    checkedFields(fields).map((field) => {
      const shape = registry[field.dataType];
      let draft = { operation: 'keep' };
      if (shape && field.value === null) {
        if (field.canClear && !field.required) draft = { operation: 'clear' };
      } else if (
        shape &&
        (shape.kind !== 'choice' ||
          field.choices.some((choice) => choice.value === field.value))
      ) {
        draft = { operation: 'set', value: field.value };
      }
      return [field.fieldApi, draft];
    }),
  );
}
