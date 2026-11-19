import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { REVIEW_PAGE, distance, useDecideReview, useReviewQueue, type ReviewCandidate, type ReviewDecision, type ReviewItem, type ReviewPlant } from '../../lib/intake';
import { cityState } from '../../lib/places';
import { onGroupArrowKeys } from '../../lib/roving';
import { shownIndustry } from '@shared/industry';
import { Dot, ErrorNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, outlineButtonClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';

/** The facts a source fills, in the words the pages use for them. */
export const FACT_WORD: Record<string, string> = {
  industry: 'industry',
  address: 'address',
  city: 'city',
  zip: 'ZIP code',
  coordinates: 'place on the map',
  headcount: 'people',
  products: 'what it makes',
  opened: 'year opened',
  status: 'status',
};

const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft';

/** One side of the comparison: the name, then the lines that tell one plant from another. */
export function PlantFacts({ plant, name }: { plant: ReviewPlant; name: React.ReactNode }) {
  const place = [plant.address, [cityState(plant.city, plant.state), plant.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const industry = plant.industry ? shownIndustry(plant.industry) ?? plant.industry : null;
  return (
    <>
      <p className="break-words text-sm font-medium text-fg-default">{name}</p>
      {plant.company && <p className="break-words text-sm text-fg-muted">{plant.company}</p>}
      {place && <p className="mt-1 break-words text-xs text-fg-muted">{place}</p>}
      {(industry || plant.people !== null) && (
        <p className="break-words text-xs text-fg-muted">
          {industry}
          {industry && plant.people !== null && <Dot />}
          {plant.people !== null && `${plant.people.toLocaleString('en-US')} people`}
        </p>
      )}
    </>
  );
}

/** The rule that found a candidate, as a person would say it. */
const FOUND_BY: Record<string, string> = {
  'same name': 'The same name',
  'shared word': 'A word of the name in common',
  near: 'Close by',
  'near, unrelated name': 'Close by, under an unrelated name',
};

/** How a candidate was found, and how far it is from where the source puts the record. */
function found(candidate: ReviewCandidate): string {
  const rule = FOUND_BY[candidate.rule] ?? candidate.rule.charAt(0).toUpperCase() + candidate.rule.slice(1);
  return candidate.metres === null ? rule : `${rule}, ${distance(candidate.metres)} away`;
}

function MatchRow({ item, next }: { item: ReviewItem; next: ReviewItem | undefined }) {
  const decide = useDecideReview();
  const notice = useAdminNotice();
  const [chosen, setChosen] = useState(item.candidates[0]?.id ?? '');
  const candidate = item.candidates.find((option) => option.id === chosen) ?? item.candidates[0];
  const recordName = item.record.name ?? item.sourceId;
  const doing = (decision: ReviewDecision) => decide.isPending && decide.variables?.decision === decision;

  const act = (decision: ReviewDecision) => {
    if (decide.isPending || (decision === 'same' && !candidate)) return;
    decide.mutate(
      { id: item.id, decision, plantId: decision === 'same' ? candidate?.id : undefined },
      {
        onSuccess: (outcome) => {
          const said =
            decision === 'skip'
              ? `Skipped ${recordName}. It is still waiting.`
              : outcome.status === 'same'
                ? `${recordName} is ${outcome.plant?.name ?? 'that plant'}.${outcome.filled.length > 0 ? ` Filled: ${outcome.filled.map((fact) => FACT_WORD[fact] ?? fact).join(', ')}.` : ''}`
                : outcome.added
                  ? `Added ${outcome.plant?.name ?? recordName} as a new plant.`
                  : `Kept ${recordName} apart.`;
          // The row leaves, or goes to the end: focus goes to the one that takes its place.
          notice.say(said, { focus: next ? `[data-match="${next.id}"] button` : undefined });
        },
      }
    );
  };

  return (
    <li className={cn(cardClass, 'p-4')} data-match={item.id} data-match-record={recordName}>
      <p className="break-words text-xs text-fg-muted" data-match-reason>
        {item.sourceName}
        <Dot />
        <span className="text-fg-default">{item.reason.charAt(0).toUpperCase() + item.reason.slice(1)}</span>
      </p>
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="min-w-0" data-match-theirs>
          <p className={cn(labelClass, 'mb-1.5')}>The source says</p>
          <PlantFacts
            plant={item.record}
            name={
              item.sourceUrl ? (
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                  {recordName}
                </a>
              ) : (
                recordName
              )
            }
          />
        </div>
        <div className="min-w-0" data-match-ours>
          <p className={cn(labelClass, 'mb-1.5')}>{item.candidates.length > 1 ? 'Our plants' : 'Our plant'}</p>
          {item.candidates.length === 0 ? (
            <p className="text-sm text-fg-muted">The plant it might have been is no longer there.</p>
          ) : item.candidates.length === 1 ? (
            <div>
              <PlantFacts plant={item.candidates[0]} name={<PlantLink candidate={item.candidates[0]} />} />
              <p className="mt-1 text-xs text-fg-default">{found(item.candidates[0])}</p>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label={`Which plant ${recordName} is`}
              className="space-y-2"
              onKeyDown={(event) => onGroupArrowKeys(event, item.candidates.map((option) => option.id), chosen, setChosen)}
            >
              {item.candidates.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === chosen}
                  tabIndex={option.id === chosen ? 0 : -1}
                  onClick={() => setChosen(option.id)}
                  className={cn(
                    'block w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    option.id === chosen ? 'border-fg-muted bg-bg-elevated' : 'border-border-subtle hover:bg-bg-elevated'
                  )}
                >
                  <PlantFacts plant={option} name={option.name} />
                  <p className={cn('mt-1 text-xs', option.id === chosen ? 'text-fg-default' : 'text-fg-muted')}>{found(option)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          aria-busy={doing('same')}
          aria-disabled={decide.isPending || !candidate}
          onClick={() => act('same')}
          aria-label={candidate ? `${recordName} is the same plant as ${candidate.name}` : 'Same'}
          className={cn('h-10 px-4 sm:h-9', busyButtonClass)}
        >
          {doing('same') && <Loader2 className="animate-spin" />}
          Same
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-busy={doing('different')}
          aria-disabled={decide.isPending}
          onClick={() => act('different')}
          aria-label={`${recordName} is a different plant`}
          className={cn('h-10 px-4 sm:h-9', outlineButtonClass, busyButtonClass)}
        >
          {doing('different') && <Loader2 className="animate-spin" />}
          Different
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-busy={doing('skip')}
          aria-disabled={decide.isPending}
          onClick={() => act('skip')}
          aria-label={`Skip ${recordName} for now`}
          className={cn('h-10 px-4 sm:h-9', outlineButtonClass, busyButtonClass)}
        >
          {doing('skip') && <Loader2 className="animate-spin" />}
          Skip
        </Button>
        <p className="min-w-0 basis-full text-xs text-fg-muted sm:ml-2 sm:basis-auto">
          {item.ifDifferent === 'add' ? 'Different adds it as a new plant.' : 'Different keeps it out: this source adds no plants.'}
        </p>
      </div>
      <ErrorNote error={decide.error} className="mt-2" />
    </li>
  );
}

function PlantLink({ candidate }: { candidate: ReviewCandidate }) {
  return (
    <Link to={`/factories/${candidate.id}`} className="underline-offset-4 hover:underline">
      {candidate.name}
    </Link>
  );
}

/**
 * Matches waiting for a person: a source's record that may be one of our
 * plants, set beside the plant, with how far apart they are and why the run
 * was not sure. Same ties the record to the plant: the source's id is kept
 * against it and the record's facts fill what the plant lacks. Different
 * keeps them apart for good. Skip leaves it for later, after the rest.
 * Drawn only when something waits.
 */
export default function MatchReview() {
  const queue = useReviewQueue();
  if (queue.isPending) return null;
  if (queue.isError) {
    return (
      <PageSection title="Matches to review">
        <LoadError error={queue.error} onRetry={() => void queue.refetch()} retrying={queue.isFetching} />
      </PageSection>
    );
  }
  const { items, total } = queue.data;
  if (total === 0) return null;
  return (
    <PageSection
      title="Matches to review"
      description="A source's record that may be one of our plants. Same keeps the source's id against the plant and fills what the plant lacks."
    >
      <div id="matches" className="scroll-mt-24">
        {items.length === 0 ? (
          <RowsSkeleton rows={1} />
        ) : (
          <ul className="space-y-3" data-matches>
            {items.map((item, index) => (
              // A new key once it is skipped, so the row that comes back at the end starts fresh.
              <MatchRow key={`${item.id}:${item.skipped}`} item={item} next={items[index + 1]} />
            ))}
          </ul>
        )}
        {total > items.length && (
          <p className="mt-3 text-xs tabular-nums text-fg-muted" data-matches-more>
            The first {Math.min(REVIEW_PAGE, items.length)} of {total.toLocaleString('en-US')}. The next come up as these are decided.
          </p>
        )}
      </div>
    </PageSection>
  );
}
