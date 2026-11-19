// A streaming CSV reader for files too large to hold: rows come out one at a
// time as arrays of text. Quoted fields may hold commas, line breaks and
// doubled quotes (RFC 4180). No dependency, so the runner needs none.

/** Where the row that starts at `start` ends (the index of its line break), or -1 when the text stops inside it. */
function rowEnd(text, start) {
  let from = start;
  let quotes = 0;
  for (;;) {
    const newline = text.indexOf('\n', from);
    if (newline < 0) return -1;
    // A line break inside a quoted field is part of the field: the row ends
    // at the first break with an even number of quotes before it.
    for (let quote = text.indexOf('"', from); quote >= 0 && quote < newline; quote = text.indexOf('"', quote + 1)) quotes += 1;
    if (quotes % 2 === 0) return newline;
    from = newline + 1;
  }
}

/** One row's fields, from text[start, end). */
export function parseCsvRow(text, start = 0, end = text.length) {
  if (end > start && text.charCodeAt(end - 1) === 13) end -= 1;
  const fields = [];
  let i = start;
  for (;;) {
    if (i < end && text.charCodeAt(i) === 34) {
      // Quoted: up to the quote that is not doubled.
      let value = '';
      let from = i + 1;
      for (;;) {
        const quote = text.indexOf('"', from);
        if (quote < 0 || quote >= end) {
          value += text.slice(from, end);
          i = end;
          break;
        }
        if (text.charCodeAt(quote + 1) === 34 && quote + 1 < end) {
          value += text.slice(from, quote + 1);
          from = quote + 2;
          continue;
        }
        value += text.slice(from, quote);
        i = quote + 1;
        break;
      }
      fields.push(value);
      // Anything between the closing quote and the comma is dropped.
      const comma = text.indexOf(',', i);
      if (comma < 0 || comma >= end) break;
      i = comma + 1;
    } else {
      const comma = text.indexOf(',', i);
      if (comma < 0 || comma >= end) {
        fields.push(text.slice(i, end));
        break;
      }
      fields.push(text.slice(i, comma));
      i = comma + 1;
    }
  }
  return fields;
}

/**
 * Rows of a CSV stream (a Readable, or anything that yields text or buffers
 * in order). Blank lines are skipped.
 */
export async function* csvRows(stream) {
  const decoder = new TextDecoder('utf-8');
  let pending = '';
  for await (const chunk of stream) {
    pending += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let start = 0;
    for (;;) {
      const end = rowEnd(pending, start);
      if (end < 0) break;
      if (end > start + 1 || (end === start + 1 && pending.charCodeAt(start) !== 13)) yield parseCsvRow(pending, start, end);
      start = end + 1;
    }
    if (start > 0) pending = pending.slice(start);
  }
  pending += decoder.decode();
  if (pending.trim() !== '') yield parseCsvRow(pending, 0, pending.length);
}
