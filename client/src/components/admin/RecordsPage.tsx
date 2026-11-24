import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RECORD_KINDS, editPath, useRecordSearch, type FoundRecord, type RecordKind } from '../../lib/records';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { isUuid } from '../../lib/validation';
import { CardNote, LoadError, RowsSkeleton, fieldClass, rowClass, rowHoverClass } from '../account/parts';
import Panel from './Panel';
import RecordEditor from './RecordEditor';

const KIND_WORD: Record<RecordKind, string> = { company: 'Company', factory: 'Factory', career: 'Career', skill: 'Skill' };

/**
 * Records: find one to correct. One field searches companies, factories,
 * careers and skills together (`?q=`), by name or another name a record is
 * known by; each result says its kind in a quiet word and opens in the
 * editor. With a record in the address (`?kind=&id=`) the page is that
 * record's editor.
 */
export default function RecordsPage() {
  const [searchParams] = useSearchParams();
  const kind = RECORD_KINDS.find((option) => option.kind === searchParams.get('kind'))?.kind;
  const id = searchParams.get('id');
  if (kind && id && isUuid(id)) return <RecordEditor key={`${kind}:${id}`} kind={kind} id={id} />;
  return <FindRecord />;
}

function FindRecord() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? '');
  const q = useDebouncedValue(term.trim());
  // The address follows the search a beat after typing stops, so Back from a record returns to its results.
  const inAddress = searchParams.get('q') ?? '';
  useEffect(() => {
    if (q === inAddress) return;
    const params = new URLSearchParams(searchParams);
    if (q) params.set('q', q);
    else params.delete('q');
    setSearchParams(params, { replace: true });
    // Only the settled search writes the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const companies = useRecordSearch('company', q);
  const factories = useRecordSearch('factory', q);
  const careers = useRecordSearch('career', q);
  const skills = useRecordSearch('skill', q);
  const searches = [
    { kind: 'company' as const, search: companies },
    { kind: 'factory' as const, search: factories },
    { kind: 'career' as const, search: careers },
    { kind: 'skill' as const, search: skills },
  ];
  const asked = q.length >= 2;
  const waiting = asked && searches.some(({ search }) => search.isPending);
  const failed = searches.find(({ search }) => search.isError)?.search;
  const found: { kind: RecordKind; record: FoundRecord }[] = searches.flatMap(({ kind, search }) => (search.data ?? []).map((record) => ({ kind, record })));
  // A name that is exactly what was typed comes first, whatever its kind.
  const exact = (item: { record: FoundRecord }) => (item.record.name.toLowerCase() === q.toLowerCase() ? 0 : 1);
  const results = [...found].sort((a, b) => exact(a) - exact(b));

  return (
    <Panel title="Find a record" description="A company, a factory, a career or a skill, by its name or another name it is known by. Open one to correct it.">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2" aria-hidden="true" />
        <input
          id="record-find"
          type="text"
          role="searchbox"
          enterKeyHint="search"
          aria-label="Find a record"
          placeholder="Name"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className={cn(fieldClass, 'h-11 pl-9')}
        />
      </div>
      <div className="mt-3" aria-live="polite" data-record-results>
        {!asked ? (
          <CardNote>Type two letters or more.</CardNote>
        ) : waiting && results.length === 0 ? (
          <RowsSkeleton rows={3} />
        ) : failed && results.length === 0 ? (
          <LoadError error={failed.error} onRetry={() => searches.forEach(({ search }) => void search.refetch())} />
        ) : results.length === 0 ? (
          <CardNote>
            No match.{' '}
            <Link to="/admin/add" className="font-medium text-text-1 underline hover:no-underline">
              Add it
            </Link>
          </CardNote>
        ) : (
          <ul>
            {results.map(({ kind, record }) => (
              <li key={`${kind}:${record.id}`} className={rowClass}>
                <Link to={editPath(kind, record.id)} className={cn(rowHoverClass, 'flex items-center gap-3 py-3')} data-record-result={kind}>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-text-1">{record.name}</span>
                    {record.detail && <span className="mt-0.5 block break-words text-xs text-text-3">{record.detail}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-text-3">{KIND_WORD[kind]}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
