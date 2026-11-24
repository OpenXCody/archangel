import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RECORD_KINDS, type RecordKind } from '../../lib/records';
import { SegmentedChoice, rowClass } from '../account/parts';
import { useAdminNotice } from './AdminNotice';
import CompanyAddForm, { addedWords } from './CompanyAddForm';
import Panel from './Panel';
import RecordForm from './RecordForm';

const KIND_OPTIONS = RECORD_KINDS.map((option) => ({ value: option.kind, label: option.label }));

const TITLE: Record<RecordKind, string> = {
  company: 'Add a company',
  factory: 'Add a factory',
  career: 'Add a career',
  skill: 'Add a skill',
};
const SAYS: Record<RecordKind, string> = {
  company: 'The company and its first factory are added together.',
  factory: 'A factory of a company that is already listed.',
  career: 'A job at the grain of a trade or role. Its path is written afterwards, on its record.',
  skill: 'Something specific a person can learn, be shown doing and be hired for.',
};

/** What was added this visit, newest first: each a sentence and the links to what it made. */
interface Added {
  key: number;
  said: string;
  links: { label: string; to: string }[];
}

/**
 * Add: one thing at a time, chosen first (`?kind=company|factory|career|skill`),
 * then one form in one panel. After a save the form is empty again, the
 * notice says what was added with links to it, and the same sentence stays
 * under the form for the rest of the visit.
 */
export default function AddPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const notice = useAdminNotice();
  const kind = RECORD_KINDS.find((option) => option.kind === searchParams.get('kind'))?.kind ?? 'company';
  // A fresh form after each record added.
  const [round, setRound] = useState(0);
  const [added, setAdded] = useState<Added[]>([]);

  const choose = (next: RecordKind) => {
    const params = new URLSearchParams();
    if (next !== 'company') params.set('kind', next);
    setSearchParams(params);
  };
  const say = (said: string, links: Added['links'], focusId: string) => {
    setAdded((list) => [{ key: list.length, said, links }, ...list]);
    setRound((value) => value + 1);
    notice.say(said, { links });
    // The form is new: put focus back at its start, ready for the next one.
    window.setTimeout(() => document.getElementById(focusId)?.focus({ preventScroll: true }), 0);
  };

  return (
    <>
      <SegmentedChoice label="What to add" options={KIND_OPTIONS} value={kind} onChange={choose} className="mb-4 grid-cols-4 sm:mb-5 sm:max-w-md" optionClassName="min-w-0 truncate px-1" />
      <Panel title={TITLE[kind]} description={SAYS[kind]} data-add={kind}>
        {kind === 'company' ? (
          <CompanyAddForm
            key={round}
            onSaved={(result) =>
              say(
                addedWords(result),
                [
                  { label: result.company.name, to: result.company.href },
                  ...(result.factory ? [{ label: result.factory.name, to: result.factory.href }] : []),
                ],
                'company-name'
              )
            }
          />
        ) : (
          <RecordForm
            key={`${kind}:${round}`}
            kind={kind}
            onSaved={(record) => say(`Added ${record.name}.`, [{ label: record.name, to: record.href }], kind === 'factory' ? 'record-company' : 'record-name')}
          />
        )}
      </Panel>

      {added.length > 0 && (
        <Panel title="Added this visit" data-added>
          <ul>
            {added.map((item) => (
              <li key={item.key} className={`${rowClass} py-3 text-sm`} data-record-added>
                <p className="text-text-1">{item.said}</p>
                <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                  {item.links.map((link) => (
                    <Link key={link.to} to={link.to} className="font-medium text-text-1 underline hover:no-underline">
                      {link.label}
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
