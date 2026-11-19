import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { onGroupArrowKeys } from '../../lib/roving';
import { RECORD_KINDS, editPath, type RecordKind, type RecordLink } from '../../lib/records';
import { Field, cardClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { RecordPicker } from './CompanyPicker';
import RecordForm from './RecordForm';

const FIND_LABEL: Record<RecordKind, string> = {
  company: 'Find a company to correct',
  factory: 'Find a plant to correct',
  career: 'Find a career to correct',
  skill: 'Find a skill to correct',
};
const ADD_LABEL: Record<RecordKind, string> = {
  company: 'Add a company',
  factory: 'Add a plant',
  career: 'Add a career',
  skill: 'Add a skill',
};

/**
 * Records by hand, one kind at a time: find one to correct (it opens in the
 * editor), or add one. After an add the form is empty again and names what
 * was added, linked to where it is corrected; a record that already exists
 * is linked to instead.
 */
export default function Records() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<RecordKind>('company');
  // A fresh form for each kind, and after each record added.
  const [round, setRound] = useState(0);
  const [added, setAdded] = useState<RecordLink | null>(null);
  const chooseKind = (next: RecordKind) => {
    setKind(next);
    setAdded(null);
  };

  return (
    <PageSection title="Records">
      <div className={cn(cardClass, 'p-4 sm:p-5')}>
        <div
          role="radiogroup"
          aria-label="Kind of record"
          onKeyDown={(event) => onGroupArrowKeys(event, RECORD_KINDS.map((option) => option.kind), kind, chooseKind)}
          className="grid h-[42px] grid-cols-4 gap-1 rounded-lg border border-border-strong bg-bg-elevated p-1 sm:max-w-md"
        >
          {RECORD_KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={kind === option.kind}
              tabIndex={kind === option.kind ? 0 : -1}
              onClick={() => chooseKind(option.kind)}
              className={cn(
                'min-w-0 truncate rounded-md px-1 text-sm font-medium transition-colors',
                kind === option.kind ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Field label={FIND_LABEL[kind]} htmlFor="record-find" className="mt-4">
          <RecordPicker id="record-find" kind={kind} value={null} onChange={(found) => found && navigate(editPath(kind, found.id))} />
        </Field>

        <div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="mb-3 text-sm font-semibold text-fg-default">{ADD_LABEL[kind]}</h3>
          <RecordForm
            key={`${kind}:${round}`}
            kind={kind}
            onStart={() => setAdded(null)}
            onSaved={(record) => {
              setAdded(record);
              setRound((value) => value + 1);
              // The form is new: put focus back at its start, ready for the next record.
              window.setTimeout(() => document.getElementById(kind === 'factory' ? 'record-company' : 'record-name')?.focus(), 0);
            }}
          />

          {added && (
            <p role="status" className="mt-3 text-sm text-fg-muted" data-record-added={added.kind}>
              Added{' '}
              <Link to={added.href} className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
                {added.name}
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </PageSection>
  );
}
