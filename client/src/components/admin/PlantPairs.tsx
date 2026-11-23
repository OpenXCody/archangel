import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, focusRing, optionTileClass } from '@/lib/utils';
import { distance } from '../../lib/intake';
import { PAIRS_PAGE, useKeepApart, useMergePlants, usePairList, type PairList, type PlantPair, type PlantSide } from '../../lib/plantPairs';
import { stateName } from '../../lib/places';
import { onGroupArrowKeys } from '../../lib/roving';
import { CardNote, Dot, ErrorNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, outlineButtonClass, rowHoverClass } from '../account/parts';
import ConfirmDialog from '../layout/ConfirmDialog';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';
import { attachedWords } from './HistoryList';
import { FACT_WORD, PlantFacts } from './MatchReview';

/** Why the cleanup left a pair for a person, as a person would say it. */
const REASON: Record<string, string> = {
  'two companies': 'One factory under two companies',
  'far apart': 'Far apart',
  'names and addresses differ': 'The names and addresses differ',
  'two states': 'Filed under two states',
  'both written from sources': 'Both written from sources',
  'same name, different street addresses': 'One name at two street addresses',
};

/** An outside id as it is said: the register's name, then the id. */
function idWords(id: string): string {
  const [source, ...rest] = id.split(' ');
  return `${source === 'EPA_ECHO' ? 'EPA registry id' : source} ${rest.join(' ')}`;
}

/** The facts a kept row would take, in the pages' words: "industry, ZIP code". */
function takesWords(side: PlantSide): string {
  return side.takes.map((fact) => FACT_WORD[fact] ?? fact).join(', ');
}

/** Where a list of pairs lives: the Data tab, taken over by it. */
export function pairsPath(list: PairList, state?: string | null): string {
  return `/admin?tab=data&pairs=${list}${state ? `&state=${state}` : ''}`;
}

interface PairCardProps {
  pair: PlantPair;
  /** Where the keyboard goes when a decision takes this card away. */
  nextFocus?: string;
  /** After a merge: the factory kept and the one that went. */
  onMerged?: (kept: { id: string; name: string }, merged: { id: string; name: string }) => void;
}

/**
 * Two rows that may be one factory, side by side. The row that is kept is
 * chosen here (the rule's choice to begin with): it keeps its name, its
 * company and its place, and takes from the other what it lacks. Merge folds
 * the other into it; Two factories keeps both and stops offering them as one.
 */
export function PairCard({ pair, nextFocus, onMerged }: PairCardProps) {
  const merge = useMergePlants();
  const apart = useKeepApart();
  const notice = useAdminNotice();
  const sides = [pair.a, pair.b];
  // A row written from sources is never folded into one that was not.
  const mustKeep = pair.a.curated !== pair.b.curated ? (pair.a.curated ? pair.a.id : pair.b.id) : null;
  const [chosen, setChosen] = useState(mustKeep ?? pair.keep);
  const [confirming, setConfirming] = useState(false);
  const kept = sides.find((side) => side.id === chosen) ?? pair.a;
  const gone = kept.id === pair.a.id ? pair.b : pair.a;
  const busy = merge.isPending || apart.isPending;
  const taken = takesWords(kept);
  const moving = attachedWords(gone.jobs > 0 ? { jobs: gone.jobs } : {});

  const head = [
    pair.shared ? idWords(pair.shared) : pair.by === 'spot' ? 'One company, one spot' : null,
    pair.reason ? REASON[pair.reason] ?? pair.reason.charAt(0).toUpperCase() + pair.reason.slice(1) : null,
    pair.metres === null ? null : pair.metres === 0 ? 'The same point' : `${distance(pair.metres)} apart`,
  ].filter((part): part is string => part !== null);

  const keepApart = (value: boolean) => {
    if (busy) return;
    apart.mutate(
      { a: pair.a.id, b: pair.b.id, apart: value },
      {
        onSuccess: () =>
          notice.say(value ? `Kept ${pair.a.name} and ${pair.b.name} as two factories.` : `${pair.a.name} and ${pair.b.name} are offered as one factory again.`, {
            undo: value ? () => keepApart(false) : undefined,
            focus: nextFocus,
          }),
      }
    );
  };

  return (
    <div className={cardClass} data-pair={`${pair.a.id}:${pair.b.id}`}>
      <p className="break-words text-xs text-text-3" data-pair-reason>
        {head.map((part, index) => (
          <span key={part} className={index === 1 && pair.reason ? 'text-text-1' : undefined}>
            {index > 0 && <Dot />}
            {part}
          </span>
        ))}
      </p>
      <div
        role="radiogroup"
        aria-label="The row to keep"
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
        onKeyDown={(event) => {
          if (!mustKeep) onGroupArrowKeys(event, sides.map((side) => side.id), chosen, setChosen);
        }}
      >
        {sides.map((side) => {
          const on = side.id === chosen;
          const locked = mustKeep !== null && side.id !== mustKeep;
          return (
            <div
              key={side.id}
              role="radio"
              aria-checked={on}
              aria-disabled={locked || undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => {
                if (!locked) setChosen(side.id);
              }}
              onKeyDown={(event) => {
                if ((event.key === ' ' || event.key === 'Enter') && !locked && event.target === event.currentTarget) {
                  event.preventDefault();
                  setChosen(side.id);
                }
              }}
              className={cn(
                'min-w-0 px-3 py-2.5',
                optionTileClass(on),
                !on && !locked ? 'cursor-pointer' : 'hover:bg-transparent',
                focusRing
              )}
              data-pair-side={side.id}
            >
              <p className={cn('mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em]', on ? 'text-text-1' : 'text-text-3')}>{on ? 'Kept' : 'Merged into it'}</p>
              <PlantFacts
                plant={side}
                name={
                  <Link to={`/factories/${side.id}`} className="hover:underline" onClick={(event) => event.stopPropagation()}>
                    {side.name}
                  </Link>
                }
              />
              {side.curated && <p className="mt-1 text-xs text-text-1">Written from sources</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 break-words text-xs text-text-3" data-pair-takes>
        {mustKeep ? 'The row written from sources is the one kept. ' : ''}
        {taken ? `It takes from the other: ${taken}.` : 'It takes nothing from the other: it has every fact the other has.'}
        {/* Under two companies the row kept decides which the factory is filed under. */}
        {kept.companyId !== gone.companyId && kept.company ? ` It stays under ${kept.company.replace(/\.$/, '')}.` : ''}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            merge.reset();
            setConfirming(true);
          }}
          aria-label={`Merge ${gone.name} into ${kept.name}`}
          className={cn('h-10 px-4 sm:h-9', busyButtonClass)}
          data-pair-merge
        >
          Merge
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-busy={apart.isPending}
          aria-disabled={busy}
          onClick={() => keepApart(!pair.apart)}
          aria-label={pair.apart ? `Offer ${pair.a.name} and ${pair.b.name} as one factory again` : `${pair.a.name} and ${pair.b.name} are two factories`}
          className={cn('h-10 px-4 sm:h-9', outlineButtonClass, busyButtonClass)}
          data-pair-apart
        >
          {apart.isPending && <Loader2 className="animate-spin" />}
          {pair.apart ? 'Not two factories' : 'Two factories'}
        </Button>
        {pair.apart && <p className="min-w-0 basis-full text-xs text-text-3 sm:ml-2 sm:basis-auto">An admin said these are two factories.</p>}
      </div>
      <ErrorNote error={apart.error} className="mt-2" />
      <ConfirmDialog
        open={confirming}
        title="Merge factories"
        description={
          <>
            <p>
              <span className="font-medium text-text-1">{gone.name}</span> into <span className="font-medium text-text-1">{kept.name}</span>
              {kept.company ? ` (${kept.company})` : ''}.
            </p>
            <p>
              {kept.name} keeps its name, company and place{taken ? `, and takes: ${taken}` : ''}.
              {moving ? ` Moves to it: ${moving}.` : ''}
            </p>
            <p>The other row is deleted, and its old address leads here. Cannot be undone.</p>
          </>
        }
        confirmLabel="Merge"
        busy={merge.isPending}
        error={merge.error}
        onConfirm={() =>
          merge.mutate(
            { from: gone.id, into: kept.id },
            {
              onSuccess: (result) => {
                setConfirming(false);
                notice.say(`Merged ${result.merged.name} into ${result.kept.name}.`, { focus: nextFocus });
                onMerged?.(result.kept, result.merged);
              },
            }
          )
        }
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/** What each list is, in a heading and a sentence. */
const LISTS: Record<PairList, { title: string; description: string; none: string }> = {
  id: {
    title: 'Factories listed twice',
    description: 'Two rows that carry one registry id, which the cleanup was not sure are one factory. Merge keeps one row; Two factories keeps both.',
    none: 'No two rows carry one registry id.',
  },
  spot: {
    title: 'Factories on one spot',
    description: 'Two rows of one company at the same place on the map. Merge keeps one row; Two factories keeps both, as two buildings of one site.',
    none: 'No two rows of one company share a spot.',
  },
};

/**
 * One list of pairs, worked through a page at a time: the Data tab, taken
 * over by it (`?tab=data&pairs=id|spot`, `&state=TX`, `&at=<offset>`). A pair
 * that is decided leaves, and the next comes up in its place.
 */
export function PairsView({ list }: { list: PairList }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = searchParams.get('state');
  const at = Math.max(0, Number(searchParams.get('at')) || 0);
  const page = usePairList(list, state, at);
  const words = LISTS[list];
  const total = page.data?.total ?? 0;
  const pairs = page.data?.pairs ?? [];

  const move = (to: number) => {
    const next = new URLSearchParams(searchParams);
    if (to > 0) next.set('at', String(to));
    else next.delete('at');
    setSearchParams(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div data-pairs-view={list}>
      <Link to="/admin?tab=data" className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-text-2 transition-colors hover:text-text-1">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <PageSection title={state ? `${words.title}: ${state === 'none' ? 'no state' : stateName(state)}` : words.title} description={words.description}>
        {page.isPending ? (
          <RowsSkeleton rows={3} />
        ) : page.isError ? (
          <LoadError error={page.error} onRetry={() => void page.refetch()} retrying={page.isFetching} />
        ) : total === 0 ? (
          <CardNote>{words.none}</CardNote>
        ) : (
          <>
            <p className="mb-3 text-xs tabular-nums text-text-3" data-pairs-count>
              {pairs.length === 0
                ? `${total.toLocaleString('en-US')} in all.`
                : `${(at + 1).toLocaleString('en-US')} to ${(at + pairs.length).toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`}
            </p>
            <ul className="space-y-3">
              {pairs.map((pair, index) => {
                const next = pairs[index + 1];
                return (
                  <li key={`${pair.a.id}:${pair.b.id}:${pair.apart}`}>
                    <PairCard pair={pair} nextFocus={next ? `[data-pair="${next.a.id}:${next.b.id}"] [role="radio"][tabindex="0"]` : undefined} />
                  </li>
                );
              })}
            </ul>
            {(at > 0 || at + pairs.length < total) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" aria-disabled={at === 0} onClick={() => at > 0 && move(Math.max(0, at - PAIRS_PAGE))} className={cn('h-10 px-4 sm:h-9', outlineButtonClass, busyButtonClass)}>
                  Earlier
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-disabled={at + pairs.length >= total}
                  onClick={() => at + pairs.length < total && move(at + PAIRS_PAGE)}
                  className={cn('h-10 px-4 sm:h-9', outlineButtonClass, busyButtonClass)}
                  data-pairs-next
                >
                  Later
                </Button>
              </div>
            )}
          </>
        )}
      </PageSection>
    </div>
  );
}

/**
 * The way into the list of rows that carry one registry id, on the Data tab:
 * one line, drawn only while some wait.
 */
export function PairsWaiting() {
  const page = usePairList('id', null, 0, 1);
  const total = page.data?.total ?? 0;
  if (total === 0) return null;
  return (
    <PageSection title={LISTS.id.title} description="Two rows that carry one registry id, which the cleanup was not sure are one factory.">
      <Link
        to={pairsPath('id')}
        className={cn(rowHoverClass, 'flex items-center justify-between gap-4 py-3')}
        data-pairs-waiting
      >
        <span className="min-w-0 text-sm text-text-1">Open the list</span>
        <span className="shrink-0 text-xs tabular-nums text-text-3">
          {total.toLocaleString('en-US')} {total === 1 ? 'pair' : 'pairs'}
        </span>
      </Link>
    </PageSection>
  );
}
