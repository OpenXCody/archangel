import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RECORD_KINDS, editPath, type RecordKind, type RecordLink } from '../../lib/records';
import { Field, SegmentedChoice, cardClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import RecordPicker from './RecordPicker';
import RecordForm from './RecordForm';

const KIND_OPTIONS = RECORD_KINDS.map((option) => ({ value: option.kind, label: option.label }));

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
      <div className={cardClass}>
        <SegmentedChoice
          label="Kind of record"
          options={KIND_OPTIONS}
          value={kind}
          onChange={chooseKind}
          className="grid-cols-4 sm:max-w-md"
          optionClassName="min-w-0 truncate px-1"
        />

        <Field label={FIND_LABEL[kind]} htmlFor="record-find" className="mt-4">
          <RecordPicker id="record-find" kind={kind} value={null} onChange={(found) => found && navigate(editPath(kind, found.id))} />
        </Field>

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-3 text-sm font-semibold text-text-1">{ADD_LABEL[kind]}</h3>
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
            <p role="status" className="mt-3 text-sm text-text-2" data-record-added={added.kind}>
              Added{' '}
              <Link to={added.href} className="font-medium text-text-1 underline underline-offset-4 hover:no-underline">
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
