import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AUDIT_KINDS, editPath, useAudit, type AuditEntry, type RecordKind } from '../../lib/records';
import { CardNote, LoadError, RowsSkeleton, cardClass, outlineButtonClass, rowClass } from '../account/parts';

/** What each stored action reads as at the start of a line. */
const ACTION: Record<string, string> = {
  added: 'Added',
  edited: 'Edited',
  deleted: 'Deleted',
  merged: 'Merged',
  'path edited': 'Path edited',
  'path approved': 'Path approved',
  'path returned to draft': 'Path returned to draft',
  'made admin': 'Made admin',
  'admin role removed': 'Admin role removed',
  'password reset link': 'Password reset link made',
  'sessions ended': 'Signed out everywhere',
  'added to company': 'Access given',
  approved: 'Request approved',
  declined: 'Request declined',
  'decision taken back': 'Decision taken back',
  'removed from company': 'Access removed',
  'request cleared': 'Request cleared',
  invited: 'Invited',
  'invite revoked': 'Invite revoked',
  'company request declined': 'Company request declined',
  'plant request declined': 'Plant request declined',
  'plant request marked added': 'Plant request marked added',
  'company request answered, access given': 'Company added, access given',
};

const FIELD: Record<string, string> = {
  name: 'name',
  title: 'title',
  industry: 'industry',
  description: 'description',
  domain: 'domain',
  featured: 'featured',
  aliases: 'other names',
  headquartersLat: 'headquarters latitude',
  headquartersLng: 'headquarters longitude',
  company: 'company',
  state: 'state',
  latitude: 'latitude',
  longitude: 'longitude',
  city: 'city',
  address: 'address',
  onetCode: 'O*NET code',
  category: 'category',
  pathStatus: 'path',
  email: 'email',
  specialization: 'specialization',
  workforceSize: 'workforce',
  openPositions: 'open positions',
};

/** What a count of attached things is called, one and many. */
const ATTACHED: Record<string, [string, string]> = {
  factories: ['factory', 'factories'],
  jobs: ['job', 'jobs'],
  applications: ['application', 'applications'],
  members: ['person with access', 'people with access'],
  requests: ['access request', 'access requests'],
  invites: ['pending invite', 'pending invites'],
  careers: ['career', 'careers'],
  skills: ['skill on its path', 'skills on its path'],
  goals: ['person aiming at it', 'people aiming at it'],
  industries: ['industry', 'industries'],
  people: ['person who marked it', 'people who marked it'],
  memberships: ['company membership', 'company memberships'],
};

/** "12 factories, 3 jobs": what hangs from a record, in words. Empty when nothing does. */
export function attachedWords(attached: Record<string, number> | null | undefined): string {
  return Object.entries(attached ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const [one, many] = ATTACHED[key] ?? [key, key];
      return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
    })
    .join(', ');
}

function value(input: unknown): string {
  if (input === null || input === undefined || input === '') return 'none';
  if (typeof input === 'boolean') return input ? 'yes' : 'no';
  if (Array.isArray(input)) return input.length > 0 ? input.map(String).join(', ') : 'none';
  return String(input);
}

function names(input: unknown): string {
  return Array.isArray(input) ? input.map(String).join(', ') : '';
}

/** The short before and after of one line, in words. Null when the line has none. */
function detailWords(entry: AuditEntry): string | null {
  const detail = entry.detail;
  if (!detail) return null;
  const parts: string[] = [];
  const changes = detail.changes as Record<string, [unknown, unknown]> | undefined;
  if (changes && typeof changes === 'object') {
    for (const [field, pair] of Object.entries(changes)) {
      if (!Array.isArray(pair)) continue;
      parts.push(`${FIELD[field] ?? field}: ${value(pair[0])} → ${value(pair[1])}`);
    }
  }
  const moved = attachedWords(detail.moved as Record<string, number> | undefined);
  if (moved) parts.push(`moved ${moved}`);
  if (detail.removed && typeof detail.removed === 'object') {
    const removed = attachedWords(detail.removed as Record<string, number>);
    if (removed) parts.push(`with ${removed}`);
  }
  if (names(detail.skillsAdded)) parts.push(`added ${names(detail.skillsAdded)}`);
  if (names(detail.skillsRemoved)) parts.push(`removed ${names(detail.skillsRemoved)}`);
  if (names(detail.skillsMoved)) parts.push(`moved stage: ${names(detail.skillsMoved)}`);
  if (typeof detail.role === 'string') parts.push(`as ${detail.role}${typeof detail.company === 'string' ? ` of ${detail.company}` : ''}`);
  if (detail.replacedEarlier === true) parts.push('replaced an earlier invite');
  if (typeof detail.ended === 'number') parts.push(`${detail.ended} ${detail.ended === 1 ? 'session' : 'sessions'}`);
  if (typeof detail.name === 'string' && entry.kind === 'person') parts.push(detail.name);
  return parts.length > 0 ? parts.join('; ') : null;
}

const KIND_WORD: Record<string, string> = {
  company: 'Company',
  factory: 'Factory',
  career: 'Career',
  skill: 'Skill',
  person: 'Person',
  access: 'Company access',
  invite: 'Invite',
};

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isRecordKind(kind: string): kind is RecordKind {
  return kind === 'company' || kind === 'factory' || kind === 'career' || kind === 'skill';
}

interface HistoryListProps {
  /** Narrow the list to one kind of record, or to one record. */
  filter?: { kind?: string; record?: string };
  /** On a record's own editor the record is not named again on every line. */
  ownRecord?: boolean;
  /** What to say when there is nothing. */
  empty?: string;
}

/** What admins changed, newest first: who, when, what, and a short before and after. */
export default function HistoryList({ filter = {}, ownRecord = false, empty = 'Nothing yet.' }: HistoryListProps) {
  const [pages, setPages] = useState(1);
  const audit = useAudit(filter, pages);

  if (audit.isPending) return <RowsSkeleton rows={3} />;
  if (audit.isError) return <LoadError error={audit.error} onRetry={() => void audit.refetch()} retrying={audit.isFetching} />;
  if (audit.data.entries.length === 0) return <CardNote>{empty}</CardNote>;

  return (
    <>
      <ul className={cn(cardClass, audit.isPlaceholderData && 'opacity-60')} data-history>
        {audit.data.entries.map((entry) => {
          const words = detailWords(entry);
          const merged = entry.action === 'merged' ? (entry.detail?.merged as { name?: unknown } | undefined)?.name : null;
          // A record that still exists links to where it is corrected. One deleted since simply will not open.
          const linked = !ownRecord && entry.recordId && isRecordKind(entry.kind) && entry.action !== 'deleted';
          return (
            <li key={entry.id} className={cn(rowClass, 'px-4 py-3')} data-history-action={entry.action}>
              <p className="break-words text-sm text-fg-muted">
                {ACTION[entry.action] ?? entry.action}
                {typeof merged === 'string' && <span className="text-fg-default"> {merged}</span>}
                {typeof merged === 'string' && (ownRecord ? ' into this' : ' into')}
                {!ownRecord && (
                  <>
                    {' '}
                    {linked ? (
                      <Link to={editPath(entry.kind as RecordKind, entry.recordId as string)} className="font-medium text-fg-default underline-offset-4 hover:underline">
                        {entry.recordName}
                      </Link>
                    ) : (
                      <span className="font-medium text-fg-default">{entry.recordName}</span>
                    )}
                  </>
                )}
              </p>
              {words && <p className="mt-0.5 break-words text-xs text-fg-muted">{words}</p>}
              <p className="mt-0.5 break-words text-xs text-fg-soft">
                {!ownRecord && `${KIND_WORD[entry.kind] ?? entry.kind} · `}
                {entry.actorName} · {when(entry.at)}
              </p>
            </li>
          );
        })}
      </ul>
      {audit.data.hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled={audit.isFetching}
          onClick={() => {
            if (!audit.isFetching) setPages((value) => value + 1);
          }}
          className={cn('mt-3 h-9', outlineButtonClass)}
        >
          {audit.isFetching && <Loader2 className="animate-spin" />}
          More
        </Button>
      )}
    </>
  );
}

export { AUDIT_KINDS };
