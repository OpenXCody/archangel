import { cn } from '@/lib/utils';
import type { FoundRecord } from '../../lib/records';
import { fieldClass, textButtonClass } from '../account/parts';
import RecordPicker from './RecordPicker';

/** A career on a ladder, as the form holds it. */
export interface LadderCareer {
  id: string;
  title: string;
}

/** The most careers one career leads to (MAX_LEADS_TO in server/lib/careers.ts). */
const MOST = 12;

interface LeadsToFieldProps {
  /** Id for the search box, so the label and a refusal's focus can find it. */
  id: string;
  value: LadderCareer[];
  onChange: (value: LadderCareer[]) => void;
  /** The career being corrected: it cannot lead to itself. */
  excludeId?: string;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * The careers a career leads to: up to twelve, found by search, kept in the
 * order they are listed. The first is the usual next step. Whether a link
 * would close a ladder on itself is the server's to say; its reason stands
 * under this field.
 */
export default function LeadsToField({ id, value, onChange, excludeId, invalid, describedBy }: LeadsToFieldProps) {
  const full = value.length >= MOST;
  const add = (found: FoundRecord | null) => {
    if (!found || value.some((career) => career.id === found.id)) return;
    onChange([...value, { id: found.id, title: found.name }]);
  };
  const move = (index: number) => {
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };
  return (
    <div className="space-y-2" data-leads-to aria-describedby={describedBy}>
      {value.length > 0 && (
        <ol className={cn(fieldClass, 'divide-y divide-line !py-0', invalid && 'border-danger/60')}>
          {value.map((career, index) => (
            <li key={career.id} className="flex min-h-11 items-center gap-3 py-1.5" data-leads-to-career={career.id}>
              <span className="w-4 shrink-0 text-sm tabular-nums text-text-3">{index + 1}</span>
              <span className="min-w-0 flex-1 break-words text-sm text-text-1">{career.title}</span>
              {index > 0 && (
                <button type="button" onClick={() => move(index)} aria-label={`Move ${career.title} up`} className={cn(textButtonClass, 'flex min-h-9 shrink-0 items-center')}>
                  Up
                </button>
              )}
              <button
                type="button"
                // With all twelve chosen there is no search box: the first row answers for the field.
                id={full && index === 0 ? id : undefined}
                onClick={() => onChange(value.filter((item) => item.id !== career.id))}
                aria-label={`Remove ${career.title}`}
                className={cn(textButtonClass, 'flex min-h-9 shrink-0 items-center')}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      {!full && <RecordPicker id={id} kind="career" value={null} onChange={add} excludeId={excludeId} />}
    </div>
  );
}
