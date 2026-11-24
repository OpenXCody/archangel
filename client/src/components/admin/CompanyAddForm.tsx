import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { editPath, existingRecord, refusedField, useAddCompany, useSimilarRecords, type AddedCompany, type NewFactoryPlace } from '../../lib/records';
import { cityState } from '../../lib/places';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import CompanyLogo from '../CompanyLogo';
import { labelClass } from '@/lib/utils';
import { ErrorNote, Field, FieldError, busyButtonClass, fieldClass, textButtonClass } from '../account/parts';
import PlaceFields, { EMPTY_PLACE, placeProblems, type PlaceField, type PlaceValue } from './PlaceFields';
import { bareDomain } from './domain';

/** A place as the API takes it. Null until it has a state and a point. */
export function placeToSend(place: PlaceValue, name?: string): NewFactoryPlace | null {
  if (!place.state || place.latitude === null || place.longitude === null) return null;
  return {
    name: name?.trim() || undefined,
    address: place.street.trim() || undefined,
    city: place.city.trim() || undefined,
    state: place.state,
    zip: place.zip.trim() || undefined,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

/** What was just added, in one sentence: "Added Acme and its factory in Austin, TX." */
export function addedWords(added: AddedCompany): string {
  if (!added.factory) return `Added ${added.company.name}. It has no factory yet.`;
  const where = cityState(added.factory.city, added.factory.state);
  return `Added ${added.company.name} and its factory${where ? ` in ${where}` : ''}.`;
}

interface CompanyAddFormProps {
  onSaved: (added: AddedCompany) => void;
  /** A company is being sent: what the last one said no longer applies. */
  onStart?: () => void;
}

/**
 * Adding a company: its name, its website (the mark is found from it and
 * shown as it will appear), a sentence on what it makes, and its first
 * factory as an address. One save adds the company and the factory together.
 * "Add without a factory" adds the company alone.
 */
export default function CompanyAddForm({ onSaved, onStart }: CompanyAddFormProps) {
  const add = useAddCompany();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState<PlaceValue>(EMPTY_PLACE);
  const [factoryName, setFactoryName] = useState('');
  // Which save was tried: the problems of the factory are shown only when it was to be added.
  const [attempted, setAttempted] = useState<'with' | 'without' | null>(null);

  const domain = website.trim() ? bareDomain(website) : null;
  const previewDomain = useDebouncedValue(domain, 400);
  // The factory's name when none is typed: the company and its town.
  const defaultFactoryName = [name.trim(), place.city.trim()].filter(Boolean).join(' ');

  const problems: { name?: string; website?: string } = {};
  if (!name.trim()) problems.name = 'Enter the company’s name.';
  if (website.trim() && !domain) problems.website = 'Enter a website such as tesla.com.';
  const ofPlace = placeProblems(place);

  // What the server said about one field stands beside it until the form is sent again.
  const refused = refusedField(add.error);
  const existing = existingRecord(add.error, 'company');
  const serverSaid = refused && !existing ? (add.error as Error).message : undefined;
  const shown = (field: 'name' | 'website') => (attempted ? problems[field] : undefined) ?? (refused === (field === 'website' ? 'domain' : field) ? serverSaid : undefined);
  const shownPlace: Partial<Record<PlaceField, string>> = {};
  if (attempted === 'with') Object.assign(shownPlace, ofPlace);
  for (const field of ['city', 'state', 'zip'] as const) if (refused === `factory.${field}`) shownPlace[field] = serverSaid;
  if (refused === 'factory.address') shownPlace.street = serverSaid;
  if (refused === 'factory.latitude' || refused === 'factory.longitude') shownPlace.point = serverSaid;

  const typedName = useDebouncedValue(name.trim(), 350);
  const similar = useSimilarRecords('company', { name: typedName });
  const near = typedName === name.trim() ? (similar.data ?? []) : [];

  const save = (withFactory: boolean) => {
    if (add.isPending) return;
    setAttempted(withFactory ? 'with' : 'without');
    add.reset();
    const first =
      (problems.name && 'company-name') ||
      (problems.website && 'company-website') ||
      (withFactory &&
        ((ofPlace.city && 'company-place-city') ||
          (ofPlace.state && 'company-place-state') ||
          (ofPlace.zip && 'company-place-zip') ||
          (ofPlace.point && (document.getElementById('company-place-latitude') ? 'company-place-latitude' : 'company-place-street'))));
    if (first) {
      window.setTimeout(() => document.getElementById(first)?.focus(), 0);
      return;
    }
    const factory = withFactory ? placeToSend(place, factoryName) : undefined;
    if (withFactory && !factory) return;
    onStart?.();
    add.mutate(
      { name: name.trim(), domain: domain ?? undefined, description: description.trim() || undefined, factory: factory ?? undefined },
      { onSuccess: onSaved }
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save(true);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-company-add>
      <Field label="Name" htmlFor="company-name">
        <input
          id="company-name"
          type="text"
          autoComplete="off"
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={shown('name') ? true : undefined}
          aria-describedby={shown('name') ? 'company-name-error' : undefined}
          className={cn(fieldClass, shown('name') && 'border-danger/60')}
        />
        <FieldError id="company-name-error" message={shown('name')} />
      </Field>
      {near.length > 0 && (
        <p className="break-words text-sm text-text-2" data-similar-records>
          Already listed?{' '}
          {near.map((item, index) => (
            <span key={item.id}>
              {index > 0 && ', '}
              <Link to={editPath('company', item.id)} className="font-medium text-text-1 underline hover:no-underline">
                {item.name}
              </Link>
              {item.detail && <span> ({item.detail})</span>}
            </span>
          ))}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <Field
          label="Website"
          htmlFor="company-website"
          optional
          hint={shown('website') ? undefined : 'The company’s mark is found from it. It can be changed on the company’s record.'}
        >
          <input
            id="company-website"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            maxLength={300}
            placeholder="acme.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            aria-invalid={shown('website') ? true : undefined}
            aria-describedby={shown('website') ? 'company-website-error' : undefined}
            className={cn(fieldClass, shown('website') && 'border-danger/60')}
          />
          <FieldError id="company-website-error" message={shown('website')} />
        </Field>
        {/* The mark as it will appear: in a list, and on a card. */}
        <div data-mark-preview>
          <p className={cn(labelClass, 'mb-2')}>Mark</p>
          <div className="flex h-[42px] items-center gap-2">
            <CompanyLogo name={name || '?'} domain={previewDomain} size={32} image={false} />
            <CompanyLogo name={name || '?'} domain={previewDomain} size={40} image={false} />
          </div>
        </div>
      </div>

      <Field label="What it makes" htmlFor="company-description" optional hint="One sentence.">
        <textarea
          id="company-description"
          rows={2}
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(fieldClass, 'resize-y')}
        />
      </Field>

      <fieldset className="space-y-4 border-t border-line pt-4" data-first-factory>
        <legend className="float-left mb-1 w-full text-sm font-semibold text-text-1">Its first factory</legend>
        <p className="clear-both text-sm text-text-2">Where the company makes things. More factories are added afterwards, under Factory.</p>
        <PlaceFields idPrefix="company-place" value={place} onChange={(patch) => setPlace((current) => ({ ...current, ...patch }))} problems={shownPlace} lookUp="as-typed" />
        <Field label="Factory name" htmlFor="company-factory-name" optional hint={defaultFactoryName ? `Left empty, it is named ${defaultFactoryName}.` : 'Left empty, it is named for the company and its city.'}>
          <input
            id="company-factory-name"
            type="text"
            autoComplete="off"
            maxLength={300}
            placeholder={defaultFactoryName}
            value={factoryName}
            onChange={(e) => setFactoryName(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </fieldset>

      {existing ? (
        <p role="alert" className="text-sm text-text-2" data-record-exists>
          Already listed:{' '}
          <Link to={existing.href} className="font-medium text-text-1 underline hover:no-underline">
            {existing.name}
          </Link>
          . Nothing was added.
        </p>
      ) : (
        !serverSaid && <ErrorNote error={add.error} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button type="submit" aria-disabled={add.isPending} aria-busy={add.isPending} className={cn('h-10', busyButtonClass)} data-add-with-factory>
          {add.isPending && <Loader2 className="animate-spin" />}
          Add company and factory
        </Button>
        <button type="button" onClick={() => save(false)} aria-disabled={add.isPending} className={cn(textButtonClass, 'min-h-10', busyButtonClass)} data-add-without-factory>
          Add without a factory
        </button>
      </div>
    </form>
  );
}
