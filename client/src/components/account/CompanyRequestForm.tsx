import { useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEmailOn } from '../../lib/account';
import { requestField, useAskForCompany } from '../../lib/employerCompanies';
import { ErrorNote, Field, busyButtonClass, cardClass, fieldClass, outlineButtonClass } from './parts';

interface CompanyRequestFormProps {
  /** A plant of this company; without it, a company that is not listed. */
  company?: { id: string; name: string };
  /** What was searched for, as a start for the name. */
  initialName?: string;
  onDone: () => void;
  onCancel: () => void;
}

type FieldName = 'name' | 'place' | 'website';

/**
 * Ask for a company that is not in the data to be added, or, for a company
 * the person already posts for, a plant that is missing. Three short fields;
 * an admin does the rest. Each problem is named beside its field.
 */
export default function CompanyRequestForm({ company, initialName = '', onDone, onCancel }: CompanyRequestFormProps) {
  const ask = useAskForCompany();
  const emailOn = useEmailOn();
  const [name, setName] = useState(initialName);
  const [place, setPlace] = useState('');
  const [website, setWebsite] = useState('');
  const [attempted, setAttempted] = useState(false);
  const sending = useRef(false);
  const prefix = company ? 'plant-request' : 'company-request';

  const problems: Partial<Record<FieldName, string>> = {};
  if (!company && name.trim().length < 2) problems.name = 'Enter the company name.';
  if (place.trim().length < 2) problems.place = company ? 'Enter the address, or the city and state.' : 'Enter the city and state, or an address.';
  // What the server refused, beside the field it is about, until that field changes.
  const refused = requestField(ask.error);
  const shown = (field: FieldName) => (attempted ? problems[field] : undefined) ?? (refused === field && ask.error ? ask.error.message : undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ask.isPending || sending.current) return;
    ask.reset();
    setAttempted(true);
    const first = (['name', 'place'] as const).find((field) => problems[field]);
    if (first) {
      document.getElementById(`${prefix}-${first}`)?.focus();
      return;
    }
    sending.current = true;
    ask.mutate(
      { name: company ? undefined : name.trim(), companyId: company?.id, place: place.trim(), website: website.trim() || undefined },
      {
        onSuccess: onDone,
        onError: (error) => {
          const field = requestField(error);
          if (field) window.setTimeout(() => document.getElementById(`${prefix}-${field}`)?.focus(), 0);
        },
        onSettled: () => {
          sending.current = false;
        },
      }
    );
  };

  const input = (field: FieldName, value: string, onChange: (value: string) => void, props: { placeholder?: string; maxLength: number; url?: boolean }) => (
    <>
      <input
        id={`${prefix}-${field}`}
        type="text"
        inputMode={props.url ? 'url' : undefined}
        autoCapitalize={props.url ? 'none' : undefined}
        spellCheck={props.url ? false : undefined}
        autoComplete="off"
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        value={value}
        aria-invalid={shown(field) ? true : undefined}
        aria-describedby={shown(field) ? `${prefix}-${field}-error` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          if (refused === field) ask.reset();
        }}
        className={fieldClass}
      />
      {shown(field) && (
        <p id={`${prefix}-${field}-error`} role="alert" className="mt-1.5 text-xs text-danger">
          {shown(field)}
        </p>
      )}
    </>
  );

  return (
    <form onSubmit={submit} noValidate className={cn(cardClass, 'space-y-4 p-4 sm:p-6')} data-company-request={company ? 'plant' : 'company'}>
      <div>
        <p className="text-sm font-medium text-fg-default">{company ? `Ask for a plant of ${company.name} to be added` : 'Ask for a company to be added'}</p>
        <p className="mt-0.5 text-sm text-fg-muted">
          {company ? 'An admin adds the plant.' : 'An admin adds the company and gives you access.'}
          {emailOn && ' You get an email when it is done.'}
        </p>
      </div>
      {!company && (
        <Field label="Company name" htmlFor={`${prefix}-name`}>
          {input('name', name, setName, { maxLength: 120 })}
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={company ? 'Where the plant is' : 'Where it is'} htmlFor={`${prefix}-place`}>
          {input('place', place, setPlace, { maxLength: 160, placeholder: company ? 'Street, city and state' : 'City and state' })}
        </Field>
        <Field label="Website" htmlFor={`${prefix}-website`} optional>
          {input('website', website, setWebsite, { maxLength: 300, placeholder: 'example.com', url: true })}
        </Field>
      </div>
      {/* A refusal that is not about one field. */}
      {!refused && <ErrorNote error={ask.error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-disabled={ask.isPending} aria-busy={ask.isPending} className={cn('h-10 rounded-lg px-5', busyButtonClass)}>
          {ask.isPending && <Loader2 className="animate-spin" />}
          Send request
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className={cn('h-10 rounded-lg', outlineButtonClass)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
