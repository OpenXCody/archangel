// A run against the last: which of the source's records are new, changed,
// the same, back after being gone, or gone.

/**
 * `previous` is what staging holds for the source: id -> { hash, gone }.
 * `incoming` is what this run read: id -> hash. Every list is in id order.
 *   fresh    not staged before
 *   changed  staged with another hash (a record that had gone and came back changed is here too)
 *   same     staged with this hash and present last time
 *   back     staged with this hash but marked gone: the source has it again
 *   gone     staged and present last time, not in this run
 */
export function diffRun(previous, incoming) {
  const fresh = [];
  const changed = [];
  const same = [];
  const back = [];
  const gone = [];
  for (const [id, hash] of incoming) {
    const before = previous.get(id);
    if (!before) fresh.push(id);
    else if (before.hash !== hash) changed.push(id);
    else if (before.gone) back.push(id);
    else same.push(id);
  }
  for (const [id, before] of previous) {
    if (!before.gone && !incoming.has(id)) gone.push(id);
  }
  for (const list of [fresh, changed, same, back, gone]) list.sort();
  return { fresh, changed, same, back, gone };
}
