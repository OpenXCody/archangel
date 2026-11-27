import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';

/*
 * What a person opened on a page (a career's skill groups and the skills in
 * them, a domain of the Skills list), kept for the way back and nothing else.
 *
 * A page arrives closed: loaded, loaded again, or reached by a link, nothing
 * on it is open. Going Back or Forward to it returns it as it was left, as
 * the browser returns the place on the page. So it is kept here in memory,
 * under the entry of the browser's history it was made on, and never in
 * browser storage: a reload starts with nothing, and a link to the same page
 * is another entry.
 */
const kept = new Map<string, unknown>();

/**
 * State that the way back returns. `name` says whose it is (the kind of
 * thing and the record: "skills <career id>"); the component that calls it is
 * one record's for as long as it is mounted (keyed by the record where one
 * component draws record after record).
 */
export function useKept<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { key } = useLocation();
  const id = `${key} ${name}`;
  const [value, setValue] = useState<T>(() => (kept.has(id) ? (kept.get(id) as T) : initial));
  // Written under the entry the page is on now: the address can change under a page that stays (a filter, a cleaned address).
  useEffect(() => {
    kept.set(id, value);
  }, [id, value]);
  return [value, setValue];
}
