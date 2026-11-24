import { useRef, useState, type ChangeEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MARK_MAX_BYTES, useHandMarks, useSetMark } from '../../lib/marks';
import type { RecordView } from '../../lib/records';
import CompanyLogo from '../CompanyLogo';
import { ErrorNote, busyButtonClass, outlineButtonClass, textButtonClass } from '../account/parts';
import { useAdminNotice } from './AdminNotice';
import Panel from './Panel';

const TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

function asDataAddress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('That image could not be read.')));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** The two sizes a mark is drawn at: in a list, and on a card. */
function Pair({ name, domain, image, label }: { name: string; domain: string | null; image?: string | false; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex h-10 items-center gap-2">
        <CompanyLogo name={name} domain={domain} size={32} image={image} />
        <CompanyLogo name={name} domain={domain} size={40} image={image} />
      </div>
      <p className="mt-1.5 text-xs text-text-3">{label}</p>
    </div>
  );
}

/**
 * A company's mark, on its record: the mark as it shows today, and the way
 * to replace it with an image (PNG, SVG or JPEG, up to 200 KB), seen at both
 * sizes before it is saved, or to go back to the one found from the website.
 */
export default function MarkEditor({ record }: { record: RecordView }) {
  const notice = useAdminNotice();
  const marks = useHandMarks();
  const set = useSetMark(record.id);
  const fileRef = useRef<HTMLInputElement>(null);
  // An image chosen and not yet saved.
  const [chosen, setChosen] = useState<{ image: string; name: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const domain = typeof record.fields.domain === 'string' ? record.fields.domain : null;
  const byHand = (marks.data ?? []).some((mark) => mark.id === record.id);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    set.reset();
    setChosen(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) return setProblem('A mark is a PNG, an SVG or a JPEG.');
    if (file.size > MARK_MAX_BYTES) return setProblem(`That image is ${Math.ceil(file.size / 1024).toLocaleString('en-US')} KB. A mark is at most ${MARK_MAX_BYTES / 1024} KB.`);
    try {
      setChosen({ image: await asDataAddress(file), name: file.name });
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That image could not be read.');
    }
  };

  return (
    <Panel
      title="Mark"
      description={byHand ? 'Set by hand. It is shown wherever the company is.' : domain ? `Found from ${domain}. Replace it when it is the wrong one.` : 'The company has no website on record, so it shows its first letter. An image can be set by hand.'}
      data-mark-editor={byHand ? 'by-hand' : 'automatic'}
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Pair name={record.name} domain={domain} label={byHand ? 'Shown today (set by hand)' : 'Shown today'} />
        {chosen && <Pair name={record.name} domain={domain} image={chosen.image} label="The image chosen" />}
        {byHand && !chosen && <Pair name={record.name} domain={domain} image={false} label="Automatic" />}
      </div>

      <input ref={fileRef} type="file" accept=".png,.svg,.jpg,.jpeg,image/png,image/svg+xml,image/jpeg" onChange={(e) => void choose(e)} className="sr-only" tabIndex={-1} aria-hidden="true" data-mark-file />
      {problem && (
        <p role="alert" className="mt-3 text-sm text-danger" data-mark-problem>
          {problem}
        </p>
      )}
      <ErrorNote error={set.error} className="mt-3" />

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {chosen ? (
          <>
            <Button
              type="button"
              aria-disabled={set.isPending}
              aria-busy={set.isPending}
              className={cn('h-10', busyButtonClass)}
              data-mark-save
              onClick={() => {
                if (set.isPending) return;
                set.mutate(chosen.image, {
                  onSuccess: () => {
                    setChosen(null);
                    notice.say(`Set the mark of ${record.name} by hand.`);
                  },
                });
              }}
            >
              {set.isPending && <Loader2 className="animate-spin" />}
              Use this mark
            </Button>
            <button type="button" onClick={() => setChosen(null)} className={cn(textButtonClass, 'min-h-10')}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" className={cn('h-10', outlineButtonClass)} onClick={() => fileRef.current?.click()} data-mark-choose>
              {byHand ? 'Replace the image' : 'Upload an image'}
            </Button>
            {byHand && (
              <button
                type="button"
                aria-disabled={set.isPending}
                className={cn(textButtonClass, 'min-h-10', busyButtonClass)}
                data-mark-automatic
                onClick={() => {
                  if (set.isPending) return;
                  set.mutate(null, { onSuccess: () => notice.say(`${record.name} shows its automatic mark again.`) });
                }}
              >
                Go back to the automatic mark
              </button>
            )}
          </>
        )}
        <p className="text-xs text-text-3">PNG, SVG or JPEG, up to {MARK_MAX_BYTES / 1024} KB. A square image reads best.</p>
      </div>
    </Panel>
  );
}
