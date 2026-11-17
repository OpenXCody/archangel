import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { US_STATES } from '@shared/states';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AdminCompany } from '../../lib/account';
import { exploreApi } from '../../lib/api';
import { RECORD_KINDS, existingRecord, useAddRecord, type NewRecord, type RecordKind, type RecordLink } from '../../lib/records';
import {
  ErrorNote,
  Field,
  busyButtonClass,
  cardClass,
  fieldClass,
  outlineButtonClass,
  selectContentClass,
  selectTriggerClass,
} from '../account/parts';
import { PageSection } from '../layout/Page';
import CompanyPicker from './CompanyPicker';

type FieldName = 'company' | 'name' | 'state' | 'latitude' | 'longitude';

/** The control to put focus on for each field with a problem, in form order. */
const FIELD_FOCUS: [FieldName, string][] = [
  ['company', 'record-company'],
  ['name', 'record-name'],
  ['state', 'record-state'],
  ['latitude', 'record-latitude'],
  ['longitude', 'record-longitude'],
];

const NAME_LABEL: Record<RecordKind, string> = { company: 'Name', factory: 'Name', career: 'Title', skill: 'Name' };
const NAME_PROBLEM: Record<RecordKind, string> = {
  company: 'Enter the company’s name.',
  factory: 'Enter the factory’s name.',
  career: 'Enter the career’s title.',
  skill: 'Enter the skill’s name.',
};

/** A coordinate typed as a number within its range, or null. */
function coordinate(text: string, limit: number): number | null {
  const value = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Math.abs(number) <= limit ? number : null;
}

/**
 * Add one company, factory, career or skill. The kind chosen decides the few
 * fields shown. Afterwards the form is empty again and names what was added,
 * linked to its page; a record that already exists is linked to instead.
 */
export default function AddRecord() {
  const [kind, setKind] = useState<RecordKind>('company');
  // A fresh form for each kind, and after each record added.
  const [round, setRound] = useState(0);
  const [added, setAdded] = useState<RecordLink | null>(null);

  return (
    <PageSection title="Add a record">
      <div className={cn(cardClass, 'p-4 sm:p-5')}>
        <div
          role="radiogroup"
          aria-label="Kind of record"
          className="grid h-[42px] grid-cols-4 gap-1 rounded-lg border border-border-strong bg-bg-elevated p-1 sm:max-w-md"
        >
          {RECORD_KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={kind === option.kind}
              onClick={() => {
                setKind(option.kind);
                setAdded(null);
              }}
              className={cn(
                'min-w-0 truncate rounded-md px-1 text-sm font-medium transition-colors',
                kind === option.kind ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <RecordForm
          key={`${kind}:${round}`}
          kind={kind}
          onStart={() => setAdded(null)}
          onAdded={(record) => {
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
    </PageSection>
  );
}

interface RecordFormProps {
  kind: RecordKind;
  /** A record is being sent: what the last one said no longer applies. */
  onStart: () => void;
  onAdded: (record: RecordLink) => void;
}

function RecordForm({ kind, onStart, onAdded }: RecordFormProps) {
  const add = useAddRecord();
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [industry, setIndustry] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [attempted, setAttempted] = useState(false);

  // Industries and categories already in use, offered as the field is typed in.
  const facets = useQuery({
    queryKey: ['explore-facets'],
    queryFn: exploreApi.facets,
    staleTime: 1000 * 60 * 10,
    enabled: kind === 'company' || kind === 'skill',
  });

  const lat = coordinate(latitude, 90);
  const lng = coordinate(longitude, 180);
  const problems: Partial<Record<FieldName, string>> = {};
  if (!name.trim()) problems.name = NAME_PROBLEM[kind];
  if (kind === 'factory') {
    if (!company) problems.company = 'Choose the company that runs it.';
    if (!state) problems.state = 'Choose a state.';
    if (lat === null) problems.latitude = 'A number from -90 to 90.';
    if (lng === null) problems.longitude = 'A number from -180 to 180.';
  }
  const shown = (field: FieldName) => (attempted ? problems[field] : undefined);

  const record = (): NewRecord | null => {
    // An optional field left empty is left out.
    const given = (value: string) => value.trim() || undefined;
    if (kind === 'company') return { kind, name: name.trim(), industry: given(industry) };
    if (kind === 'career') return { kind, title: name.trim(), description: given(description) };
    if (kind === 'skill') return { kind, name: name.trim(), category: given(category), description: given(description) };
    if (!company || lat === null || lng === null) return null;
    return {
      kind,
      companyId: company.id,
      name: name.trim(),
      state,
      latitude: lat,
      longitude: lng,
      city: given(city),
      address: given(address),
    };
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (add.isPending) return;
    setAttempted(true);
    add.reset();
    const first = FIELD_FOCUS.find(([field]) => problems[field]);
    const body = first ? null : record();
    if (!body) {
      if (first) window.setTimeout(() => document.getElementById(first[1])?.focus(), 0);
      return;
    }
    onStart();
    add.mutate(body, { onSuccess: onAdded });
  };

  const existing = existingRecord(add.error, kind);
  /** One text input, marked when its field has a problem. */
  const input = (id: string, value: string, onChange: (value: string) => void, field?: FieldName, extra?: { maxLength?: number; list?: string; inputMode?: 'decimal' }) => (
    <input
      id={id}
      type="text"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={field && shown(field) ? true : undefined}
      aria-describedby={field && shown(field) ? `${id}-error` : undefined}
      // Suggestions come up as the field is typed in; the browser's own arrow for them is left off.
      className={cn(fieldClass, field && shown(field) && 'border-danger/60', extra?.list && '[&::-webkit-calendar-picker-indicator]:!hidden')}
      {...extra}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4" data-record-form={kind}>
      {kind === 'factory' && (
        <Field label="Company" htmlFor="record-company">
          <CompanyPicker id="record-company" value={company} onChange={setCompany} />
          <FieldError id="record-company-error" message={company ? undefined : shown('company')} />
        </Field>
      )}

      <div className={cn('grid grid-cols-1 gap-4', kind !== 'career' && 'sm:grid-cols-2')}>
        <Field label={NAME_LABEL[kind]} htmlFor="record-name">
          {input('record-name', name, setName, 'name', { maxLength: kind === 'factory' ? 300 : 200 })}
          <FieldError id="record-name-error" message={shown('name')} />
        </Field>

        {kind === 'company' && (
          <Field label="Industry" htmlFor="record-industry" optional>
            {input('record-industry', industry, setIndustry, undefined, { maxLength: 80, list: 'record-industries' })}
            <datalist id="record-industries">
              {(facets.data?.companyIndustries ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Field>
        )}

        {kind === 'skill' && (
          <Field label="Category" htmlFor="record-category" optional>
            {input('record-category', category, setCategory, undefined, { maxLength: 80, list: 'record-categories' })}
            <datalist id="record-categories">
              {(facets.data?.skillCategories ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Field>
        )}

        {kind === 'factory' && (
          <Field label="State" htmlFor="record-state">
            <Select value={state} onValueChange={setState}>
              <SelectTrigger
                id="record-state"
                aria-invalid={shown('state') ? true : undefined}
                aria-describedby={shown('state') ? 'record-state-error' : undefined}
                className={cn(selectTriggerClass, shown('state') && 'border-danger/60')}
              >
                <SelectValue placeholder="Choose a state" />
              </SelectTrigger>
              <SelectContent className={cn(selectContentClass, 'max-h-72')}>
                {US_STATES.map((option) => (
                  <SelectItem key={option.code} value={option.code} className="py-2.5">
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="record-state-error" message={shown('state')} />
          </Field>
        )}
      </div>

      {kind === 'factory' && (
        <>
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
            <Field label="Latitude" htmlFor="record-latitude" hint={shown('latitude') ? undefined : 'Decimal degrees.'}>
              {input('record-latitude', latitude, setLatitude, 'latitude', { inputMode: 'decimal', maxLength: 20 })}
              <FieldError id="record-latitude-error" message={shown('latitude')} />
            </Field>
            <Field label="Longitude" htmlFor="record-longitude" hint={shown('longitude') ? undefined : 'West is negative.'}>
              {input('record-longitude', longitude, setLongitude, 'longitude', { inputMode: 'decimal', maxLength: 20 })}
              <FieldError id="record-longitude-error" message={shown('longitude')} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="record-city" optional>
              {input('record-city', city, setCity, undefined, { maxLength: 120 })}
            </Field>
            <Field label="Address" htmlFor="record-address" optional>
              {input('record-address', address, setAddress, undefined, { maxLength: 300 })}
            </Field>
          </div>
        </>
      )}

      {(kind === 'career' || kind === 'skill') && (
        <Field label="Description" htmlFor="record-description" optional>
          <textarea
            id="record-description"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={cn(fieldClass, 'resize-y')}
          />
        </Field>
      )}

      {existing ? (
        <p role="alert" className="text-sm text-fg-muted" data-record-exists>
          Already listed:{' '}
          <Link to={existing.href} className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
            {existing.name}
          </Link>
          . Nothing was added.
        </p>
      ) : (
        <ErrorNote error={add.error} />
      )}

      <Button
        type="submit"
        variant="outline"
        aria-disabled={add.isPending}
        aria-busy={add.isPending}
        className={cn('h-10', outlineButtonClass, busyButtonClass)}
      >
        {add.isPending && <Loader2 className="animate-spin" />}
        Add {kind}
      </Button>
    </form>
  );
}

/** A problem with one field, said beside it. */
function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  );
}
