import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { US_STATES } from '@shared/states';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { AdminCompany } from '../../lib/account';
import { exploreApi } from '../../lib/api';
import {
  editPath,
  existingRecord,
  refusedField,
  useAddRecord,
  useChangeRecord,
  useSimilarRecords,
  type NewRecord,
  type RecordKind,
  type RecordLink,
  type RecordView,
} from '../../lib/records';
import CompanyLogo from '../CompanyLogo';
import {
  ErrorNote,
  Field,
  busyButtonClass,
  fieldClass,
  outlineButtonClass,
  selectContentClass,
  selectTriggerClass,
  useDebouncedValue,
} from '../account/parts';
import CompanyPicker from './CompanyPicker';

type FieldName =
  | 'company'
  | 'name'
  | 'state'
  | 'latitude'
  | 'longitude'
  | 'industry'
  | 'description'
  | 'domain'
  | 'aliases'
  | 'headquartersLat'
  | 'headquartersLng'
  | 'city'
  | 'address'
  | 'category'
  | 'onetCode'
  | 'howLearned'
  | 'tools';

/** The control to put focus on for each field with a problem, in form order. */
const FIELD_FOCUS: [FieldName, string][] = [
  ['company', 'record-company'],
  ['name', 'record-name'],
  ['industry', 'record-industry'],
  ['category', 'record-category'],
  ['state', 'record-state'],
  ['latitude', 'record-latitude'],
  ['longitude', 'record-longitude'],
  ['city', 'record-city'],
  ['address', 'record-address'],
  ['description', 'record-description'],
  ['howLearned', 'record-how-learned'],
  ['tools', 'record-tools'],
  ['onetCode', 'record-onet'],
  ['domain', 'record-domain'],
  ['aliases', 'record-aliases'],
  ['headquartersLat', 'record-hq-latitude'],
  ['headquartersLng', 'record-hq-longitude'],
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

const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** What a pasted web address comes down to, as the server will store it; null when it is not a domain. */
function bareDomain(text: string): string | null {
  const host = text
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return HOSTNAME.test(host) ? host : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

interface RecordFormProps {
  kind: RecordKind;
  /** Given, the form corrects this record; left out, it adds one. */
  record?: RecordView;
  /** A record is being sent: what the last one said no longer applies. */
  onStart?: () => void;
  onSaved: (record: RecordLink) => void;
}

/**
 * The one form for a company, a factory, a career or a skill: adding one
 * asks for the few fields that make it; correcting one shows all it has.
 * Each problem is said beside its field, the first takes focus, and a name
 * close to one already listed says so before anything is saved.
 */
export default function RecordForm({ kind, record, onStart, onSaved }: RecordFormProps) {
  const editing = Boolean(record);
  const add = useAddRecord();
  const change = useChangeRecord(kind, record?.id ?? '');
  const saving = editing ? change : add;
  const fields = record?.fields ?? {};

  const [company, setCompany] = useState<AdminCompany | null>(
    typeof fields.companyId === 'string'
      ? { id: fields.companyId, name: text(fields.companyName), slug: null, domain: null, featured: false, industry: null, description: null }
      : null
  );
  const [name, setName] = useState(text(kind === 'career' ? fields.title : fields.name));
  const [state, setState] = useState(text(fields.state));
  const [latitude, setLatitude] = useState(text(fields.latitude));
  const [longitude, setLongitude] = useState(text(fields.longitude));
  const [city, setCity] = useState(text(fields.city));
  const [address, setAddress] = useState(text(fields.address));
  const [industry, setIndustry] = useState(text(fields.industry));
  const [category, setCategory] = useState(text(fields.category));
  const [description, setDescription] = useState(text(fields.description));
  const [domain, setDomain] = useState(text(fields.domain));
  const [featured, setFeatured] = useState(fields.featured === true);
  const [aliases, setAliases] = useState((record?.aliases ?? []).join('\n'));
  const [howLearned, setHowLearned] = useState(text(fields.howLearned));
  const [tools, setTools] = useState((record?.tools ?? []).join('\n'));
  const [onetCode, setOnetCode] = useState(text(fields.onetCode));
  const [hqLatitude, setHqLatitude] = useState(text(fields.headquartersLat));
  const [hqLongitude, setHqLongitude] = useState(text(fields.headquartersLng));
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
  const hqLat = coordinate(hqLatitude, 90);
  const hqLng = coordinate(hqLongitude, 180);
  const cleanedDomain = domain.trim() ? bareDomain(domain) : null;
  // The logo follows the draft once it reads as a domain, a beat after typing stops.
  const previewDomain = useDebouncedValue(cleanedDomain, 400);

  const problems: Partial<Record<FieldName, string>> = {};
  if (!name.trim()) problems.name = NAME_PROBLEM[kind];
  if (kind === 'factory') {
    // A plant on record without a company can be corrected without being given one.
    if (!company && (!editing || fields.companyId)) problems.company = 'Choose the company that runs it.';
    if (!state) problems.state = 'Choose a state.';
    if (lat === null) problems.latitude = 'A number from -90 to 90.';
    if (lng === null) problems.longitude = 'A number from -180 to 180.';
  }
  if (kind === 'company' && editing) {
    if (domain.trim() && !cleanedDomain) problems.domain = 'Enter a domain such as tesla.com.';
    if (hqLatitude.trim() && hqLat === null) problems.headquartersLat = 'A number from -90 to 90.';
    if (hqLongitude.trim() && hqLng === null) problems.headquartersLng = 'A number from -180 to 180.';
    if (!problems.headquartersLat && !problems.headquartersLng && Boolean(hqLatitude.trim()) !== Boolean(hqLongitude.trim())) {
      problems[hqLatitude.trim() ? 'headquartersLng' : 'headquartersLat'] = 'Give both, or neither.';
    }
  }
  // What the server said about one field stands beside it until the form is sent again.
  const refused = refusedField(saving.error);
  const refusedName = refused && FIELD_FOCUS.some(([field]) => field === refused) ? (refused as FieldName) : null;
  const serverProblem = refusedName && !existingRecord(saving.error, kind) ? (saving.error as Error).message : undefined;
  const shown = (field: FieldName) => (attempted ? problems[field] : undefined) ?? (field === refusedName ? serverProblem : undefined);

  const given = (value: string) => value.trim() || undefined;
  const orNull = (value: string) => value.trim() || null;
  const aliasList = aliases
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const toolList = tools
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  /** What adding sends: an optional field left empty is left out. */
  const newRecord = (): NewRecord | null => {
    if (kind === 'company') return { kind, name: name.trim(), industry: given(industry) };
    if (kind === 'career') return { kind, title: name.trim(), description: given(description) };
    if (kind === 'skill') return { kind, name: name.trim(), category: given(category), description: given(description) };
    if (!company || lat === null || lng === null) return null;
    return { kind, companyId: company.id, name: name.trim(), state, latitude: lat, longitude: lng, city: given(city), address: given(address) };
  };

  /** What correcting sends: every field the form shows; the server changes the ones that differ. */
  const changedRecord = (): Record<string, unknown> => {
    if (kind === 'company') {
      return {
        name: name.trim(),
        industry: orNull(industry),
        description: orNull(description),
        domain: cleanedDomain,
        featured,
        aliases: aliasList,
        headquartersLat: hqLat,
        headquartersLng: hqLng,
      };
    }
    if (kind === 'career') return { title: name.trim(), description: orNull(description), onetCode: orNull(onetCode), aliases: aliasList };
    if (kind === 'skill') {
      return { name: name.trim(), category: orNull(category), description: orNull(description), howLearned: orNull(howLearned), tools: toolList, aliases: aliasList };
    }
    return {
      name: name.trim(),
      ...(company ? { companyId: company.id } : {}),
      state,
      latitude: lat,
      longitude: lng,
      city: orNull(city),
      address: orNull(address),
      industry: orNull(industry),
    };
  };

  // Whether the form differs from the record it opened with.
  const [opened] = useState(() => JSON.stringify(changedRecord()));
  const dirty = editing && JSON.stringify(changedRecord()) !== opened;

  // Leaving the page with a correction not yet saved asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // A refusal about one field puts focus on it.
  useEffect(() => {
    const target = refusedName ? FIELD_FOCUS.find(([field]) => field === refusedName) : null;
    if (target) document.getElementById(target[1])?.focus();
  }, [refusedName, saving.error]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving.isPending || (editing && !dirty)) return;
    setAttempted(true);
    saving.reset();
    const first = FIELD_FOCUS.find(([field]) => problems[field]);
    if (first) {
      window.setTimeout(() => document.getElementById(first[1])?.focus(), 0);
      return;
    }
    onStart?.();
    if (editing) {
      change.mutate(changedRecord(), { onSuccess: onSaved });
    } else {
      const body = newRecord();
      if (body) add.mutate(body, { onSuccess: onSaved });
    }
  };

  // Names close to this one. For a correction, only once the name is no longer the saved one.
  const typedName = useDebouncedValue(name.trim(), 350);
  const similar = useSimilarRecords(
    kind,
    {
      name: typedName,
      exclude: record?.id,
      company: kind === 'factory' ? company?.id : undefined,
      lat: kind === 'factory' && lat !== null ? lat : undefined,
      lng: kind === 'factory' && lng !== null ? lng : undefined,
    },
    !editing || typedName.toLowerCase() !== (record?.name ?? '').toLowerCase()
  );
  const near = typedName === name.trim() ? (similar.data ?? []) : [];

  const existing = existingRecord(saving.error, kind);
  /** One text input, marked when its field has a problem. */
  const input = (
    id: string,
    value: string,
    onChange: (value: string) => void,
    field?: FieldName,
    extra?: { maxLength?: number; list?: string; inputMode?: 'decimal' | 'url'; autoCapitalize?: 'none'; spellCheck?: boolean }
  ) => (
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
  const otherNames = (
    <Field label="Other names" htmlFor="record-aliases" optional hint={shown('aliases') ? undefined : 'One per line.'}>
      <textarea
        id="record-aliases"
        rows={Math.min(6, Math.max(2, aliasList.length + 1))}
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        aria-invalid={shown('aliases') ? true : undefined}
        aria-describedby={shown('aliases') ? 'record-aliases-error' : undefined}
        className={cn(fieldClass, 'resize-y', shown('aliases') && 'border-danger/60')}
      />
      <FieldError id="record-aliases-error" message={shown('aliases')} />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-record-form={kind} data-record-mode={editing ? 'edit' : 'add'}>
      {kind === 'factory' && (
        <Field label="Company" htmlFor="record-company">
          <CompanyPicker
            id="record-company"
            value={company}
            onChange={setCompany}
            invalid={Boolean(!company && shown('company'))}
            describedBy={!company && shown('company') ? 'record-company-error' : undefined}
          />
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
            {input('record-industry', industry, setIndustry, 'industry', { maxLength: 80, list: 'record-industries' })}
            <datalist id="record-industries">
              {(facets.data?.companyIndustries ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <FieldError id="record-industry-error" message={shown('industry')} />
          </Field>
        )}

        {kind === 'skill' && (
          <Field label="Category" htmlFor="record-category" optional>
            {input('record-category', category, setCategory, 'category', { maxLength: 80, list: 'record-categories' })}
            <datalist id="record-categories">
              {(facets.data?.skillCategories ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <FieldError id="record-category-error" message={shown('category')} />
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

      {near.length > 0 && (
        <p className="break-words text-sm text-fg-muted" data-similar-records>
          {editing ? 'Close to' : 'Already listed?'}{' '}
          {near.map((item, index) => (
            <span key={item.id}>
              {index > 0 && ', '}
              <Link to={editPath(kind, item.id)} className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
                {item.name}
              </Link>
              {item.detail && <span> ({item.detail})</span>}
            </span>
          ))}
        </p>
      )}

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
              {input('record-city', city, setCity, 'city', { maxLength: 120 })}
              <FieldError id="record-city-error" message={shown('city')} />
            </Field>
            <Field label="Address" htmlFor="record-address" optional>
              {input('record-address', address, setAddress, 'address', { maxLength: 300 })}
              <FieldError id="record-address-error" message={shown('address')} />
            </Field>
          </div>
          {editing && (
            <Field label="Industry" htmlFor="record-industry" optional>
              <Select value={industry || 'none'} onValueChange={(value) => setIndustry(value === 'none' ? '' : value)}>
                <SelectTrigger
                  id="record-industry"
                  aria-invalid={shown('industry') ? true : undefined}
                  aria-describedby={shown('industry') ? 'record-industry-error' : undefined}
                  className={cn(selectTriggerClass, 'w-full', shown('industry') && 'border-danger/60')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(selectContentClass, 'max-h-72')}>
                  <SelectItem value="none" className="py-2.5">
                    None on record
                  </SelectItem>
                  {(record?.industries ?? []).map((option) => (
                    <SelectItem key={option} value={option} className="py-2.5">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="record-industry-error" message={shown('industry')} />
            </Field>
          )}
        </>
      )}

      {(kind === 'career' || kind === 'skill' || (kind === 'company' && editing)) && (
        <Field
          label="Description"
          htmlFor="record-description"
          optional
          hint={
            shown('description')
              ? undefined
              : kind === 'company'
                ? 'One line on what the company makes.'
                : kind === 'skill'
                  ? 'What it is and what a person who has it can do.'
                  : undefined
          }
        >
          <textarea
            id="record-description"
            rows={kind === 'company' ? 2 : 3}
            maxLength={kind === 'company' ? 600 : 2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={shown('description') ? true : undefined}
            aria-describedby={shown('description') ? 'record-description-error' : undefined}
            className={cn(fieldClass, 'resize-y', shown('description') && 'border-danger/60')}
          />
          <FieldError id="record-description-error" message={shown('description')} />
        </Field>
      )}

      {kind === 'company' && editing && (
        <>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-4">
            <div className="pt-7">
              <CompanyLogo name={name || record?.name || ''} domain={previewDomain} size={42} />
            </div>
            <Field
              label="Domain"
              htmlFor="record-domain"
              optional
              hint={shown('domain') ? undefined : previewDomain ? `Logo from ${previewDomain}.` : 'The logo is looked up from it. A pasted address is cut down to its domain.'}
            >
              {input('record-domain', domain, setDomain, 'domain', { maxLength: 300, inputMode: 'url', autoCapitalize: 'none', spellCheck: false })}
              <FieldError id="record-domain-error" message={shown('domain')} />
            </Field>
            <div className="min-w-0">
              <label htmlFor="record-featured" className="mb-1.5 block text-sm font-medium text-fg-muted">
                Featured
              </label>
              <div className="flex min-h-[42px] items-center">
                <Switch id="record-featured" checked={featured} onCheckedChange={setFeatured} />
              </div>
            </div>
          </div>
          {otherNames}
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
            <Field label="Headquarters latitude" htmlFor="record-hq-latitude" optional>
              {input('record-hq-latitude', hqLatitude, setHqLatitude, 'headquartersLat', { inputMode: 'decimal', maxLength: 20 })}
              <FieldError id="record-hq-latitude-error" message={shown('headquartersLat')} />
            </Field>
            <Field label="Headquarters longitude" htmlFor="record-hq-longitude" optional>
              {input('record-hq-longitude', hqLongitude, setHqLongitude, 'headquartersLng', { inputMode: 'decimal', maxLength: 20 })}
              <FieldError id="record-hq-longitude-error" message={shown('headquartersLng')} />
            </Field>
          </div>
        </>
      )}

      {kind === 'career' && editing && (
        <Field label="O*NET code" htmlFor="record-onet" optional>
          {input('record-onet', onetCode, setOnetCode, 'onetCode', { maxLength: 20 })}
          <FieldError id="record-onet-error" message={shown('onetCode')} />
        </Field>
      )}
      {kind === 'skill' && editing && (
        <>
          <Field
            label="How it is learned"
            htmlFor="record-how-learned"
            optional
            hint={shown('howLearned') ? undefined : 'On the job, a course, an apprenticeship, a credential. Name a credential only when it is real and current.'}
          >
            <textarea
              id="record-how-learned"
              rows={2}
              maxLength={1000}
              value={howLearned}
              onChange={(e) => setHowLearned(e.target.value)}
              aria-invalid={shown('howLearned') ? true : undefined}
              aria-describedby={shown('howLearned') ? 'record-how-learned-error' : undefined}
              className={cn(fieldClass, 'resize-y', shown('howLearned') && 'border-danger/60')}
            />
            <FieldError id="record-how-learned-error" message={shown('howLearned')} />
          </Field>
          <Field label="Done with" htmlFor="record-tools" optional hint={shown('tools') ? undefined : 'Tools, machines or software. One per line, up to 12.'}>
            <textarea
              id="record-tools"
              rows={Math.min(8, Math.max(2, toolList.length + 1))}
              value={tools}
              onChange={(e) => setTools(e.target.value)}
              aria-invalid={shown('tools') ? true : undefined}
              aria-describedby={shown('tools') ? 'record-tools-error' : undefined}
              className={cn(fieldClass, 'resize-y', shown('tools') && 'border-danger/60')}
            />
            <FieldError id="record-tools-error" message={shown('tools')} />
          </Field>
        </>
      )}
      {(kind === 'career' || kind === 'skill') && editing && otherNames}

      {existing ? (
        <p role="alert" className="text-sm text-fg-muted" data-record-exists>
          Already listed:{' '}
          <Link to={editing ? editPath(kind, existingId(saving.error) ?? '') : existing.href} className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
            {existing.name}
          </Link>
          . {editing ? 'Nothing was changed. To make them one record, merge this one into it.' : 'Nothing was added.'}
        </p>
      ) : (
        !serverProblem && <ErrorNote error={saving.error} />
      )}

      <Button
        type="submit"
        variant="outline"
        aria-disabled={saving.isPending || (editing && !dirty)}
        aria-busy={saving.isPending}
        className={cn('h-10', outlineButtonClass, busyButtonClass)}
      >
        {saving.isPending && <Loader2 className="animate-spin" />}
        {editing ? 'Save' : `Add ${kind}`}
      </Button>
    </form>
  );
}

/** The id of the record a refused write would have repeated. */
function existingId(error: unknown): string | null {
  const existing = (error as { payload?: { existing?: { id?: unknown } } } | null)?.payload?.existing;
  return typeof existing?.id === 'string' ? existing.id : null;
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
