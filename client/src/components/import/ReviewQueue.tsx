import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ExternalLink, Check, Trash2, Loader2, Building2, MapPin, Factory } from 'lucide-react';
import { reviewApi, echoReportUrl, REASON_LABEL, type ReviewItem, type ReviewReason, type ReviewResolution } from '../../lib/reviewApi';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { EmptyState } from '../layout/Page';
import { cn } from '@/lib/utils';

const PAGE = 50;

/**
 * Manual review of factories the NAICS enrichment couldn't verify.
 * Keep = it's a real plant, leave it. Remove = move to quarantine (restorable).
 */
export default function ReviewQueue() {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReviewReason | ''>('');
  const [status, setStatus] = useState<'pending' | 'resolved'>('pending');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ['review-summary'], queryFn: reviewApi.summary, staleTime: 30_000 });
  const list = useQuery({
    queryKey: ['review', status, reason, offset],
    queryFn: () => reviewApi.list({ status, reason, limit: PAGE, offset }),
    placeholderData: (prev) => prev,
  });

  const resolve = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: ReviewResolution }) => reviewApi.resolve(id, resolution),
    onMutate: ({ id }) => setBusy(id),
    onSettled: () => {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ['review'] });
      queryClient.invalidateQueries({ queryKey: ['review-summary'] });
      queryClient.invalidateQueries({ queryKey: ['explore-factories'] });
    },
  });

  const pendingTotal = summary.data?.byReason.reduce((n, r) => n + r.pending, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Awaiting review" value={pendingTotal} accent />
        {(['no_naics', 'non_manufacturing', 'not_in_echo'] as ReviewReason[]).map((r) => (
          <Stat key={r} label={REASON_LABEL[r]} value={summary.data?.byReason.find((x) => x.reason === r)?.pending ?? 0} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg border border-border-subtle bg-bg-surface p-0.5">
          {(['pending', 'resolved'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatus(s); setOffset(0); }}
              className={cn('rounded-md px-3 py-1.5 capitalize transition-colors', status === s ? 'bg-bg-elevated text-fg-default' : 'text-fg-muted hover:text-fg-default')}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={reason}
          onChange={(e) => { setReason(e.target.value as ReviewReason | ''); setOffset(0); }}
          className="h-9 rounded-lg border border-border-subtle bg-bg-surface px-3 text-sm text-fg-default"
          aria-label="Filter by reason"
        >
          <option value="">All reasons</option>
          {(Object.keys(REASON_LABEL) as ReviewReason[]).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
        </select>
        {list.data && <span className="ml-auto text-xs text-fg-soft">{list.data.total.toLocaleString()} {status}</span>}
      </div>

      {/* List */}
      {list.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-fg-soft" /></div>
      ) : list.error ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 text-sm text-fg-muted">
          {(list.error as Error).message.includes('relation') || (list.error as Error).message.includes('Failed')
            ? 'The review table doesn’t exist yet — run scripts/enrich-naics.mjs --apply to populate it.'
            : (list.error as Error).message}
        </div>
      ) : !list.data || list.data.data.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={status === 'pending' ? 'Nothing to review' : 'No resolved items yet'}
          description={status === 'pending' ? 'Every EPA-sourced factory has a verified manufacturing NAICS, or the enrichment hasn’t run yet (scripts/enrich-naics.mjs --apply).' : undefined}
          className="py-10"
        />
      ) : (
        <ul className="space-y-2">
          {list.data.data.map((item) => (
            <ReviewRow
              key={item.factoryId}
              item={item}
              busy={busy === item.factoryId}
              onResolve={(resolution) => resolve.mutate({ id: item.factoryId, resolution })}
            />
          ))}
        </ul>
      )}

      {list.data && (list.data.hasMore || offset > 0) && (
        <div className="flex items-center justify-between text-sm">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="rounded-lg border border-border-subtle px-3 py-1.5 text-fg-muted disabled:opacity-40 hover:text-fg-default">Previous</button>
          <span className="text-xs text-fg-soft">{offset + 1}–{Math.min(offset + PAGE, list.data.total)} of {list.data.total.toLocaleString()}</span>
          <button type="button" disabled={!list.data.hasMore} onClick={() => setOffset(offset + PAGE)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-fg-muted disabled:opacity-40 hover:text-fg-default">Next</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
      <div className={cn('text-xl font-semibold tabular-nums', accent ? 'text-fg-default' : 'text-fg-muted')}>{value.toLocaleString()}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-fg-soft">{label}</div>
    </div>
  );
}

function ReviewRow({ item, busy, onResolve }: { item: ReviewItem; busy: boolean; onResolve: (r: ReviewResolution) => void }) {
  const resolved = Boolean(item.resolvedAt);
  return (
    <li className="rounded-lg border border-border-subtle bg-bg-surface p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-400/10"><Factory className="h-3.5 w-3.5 text-sky-400" /></span>
            <Link to={`/factories/${item.factoryId}`} className="truncate font-medium text-fg-default hover:underline">{formatFactoryName(item.name)}</Link>
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider', item.reason === 'non_manufacturing' ? 'bg-amber-500/10 text-amber-500' : 'bg-bg-elevated text-fg-muted')}>
              {REASON_LABEL[item.reason]}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-9 text-xs text-fg-muted">
            {item.companyName && item.companyId && (
              <Link to={`/companies/${item.companyId}`} className="inline-flex items-center gap-1 text-amber-500/90 hover:underline"><Building2 className="h-3 w-3" />{formatCompanyName(item.companyName)}</Link>
            )}
            {(item.city || item.state) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[item.city, item.state].filter(Boolean).join(', ')}</span>}
            {item.naics && <span>NAICS <span className="font-mono text-fg-default">{item.naics}</span>{item.naicsDescription ? ` · ${item.naicsDescription}` : ''}</span>}
            {item.naicsAll && item.naicsAll !== item.naics && <span>all: <span className="font-mono">{item.naicsAll}</span></span>}
            {item.sicAll && <span>SIC <span className="font-mono">{item.sicAll}</span></span>}
            {item.registryId && (
              <a href={echoReportUrl(item.registryId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-muted hover:text-fg-default">
                EPA report <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-9 sm:pl-0">
          {resolved ? (
            <span className="text-xs text-fg-soft">{item.resolution === 'keep' ? 'Kept' : 'Removed'}</span>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => onResolve('keep')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-xs text-fg-default hover:bg-bg-elevated disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />} Keep
              </button>
              <button type="button" disabled={busy} onClick={() => onResolve('quarantine')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-xs text-fg-muted hover:border-red-500/40 hover:text-red-400 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
