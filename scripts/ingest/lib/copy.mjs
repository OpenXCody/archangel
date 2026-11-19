// Rows for Postgres COPY ... FROM STDIN in its text format: tab between
// columns, a line per row, \N for null, backslash escapes.

function field(value) {
  if (value === null || value === undefined) return '\\N';
  const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.replace(/[\\\t\n\r]/g, (c) => (c === '\\' ? '\\\\' : c === '\t' ? '\\t' : c === '\n' ? '\\n' : '\\r'));
}

/** One row as a line of COPY text, with its line break. An object or array goes in as JSON. */
export function copyLine(values) {
  return `${values.map(field).join('\t')}\n`;
}
