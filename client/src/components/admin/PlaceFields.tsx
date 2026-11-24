import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { US_STATES } from '@shared/states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { findAddress, placeSearchAvailable, type FoundAddress } from '../../lib/geocode';
import { publicKeys } from '../../lib/queryKeys';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Field, FieldError, fieldClass, selectContentClass, selectTriggerClass, textButtonClass } from '../account/parts';

/** Where a factory is, as a form holds it: the address as typed, and the point it stands at once one is known. */
export interface PlaceValue {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
}

export const EMPTY_PLACE: PlaceValue = { street: '', city: '', state: '', zip: '', latitude: null, longitude: null };

export type PlaceField = 'street' | 'city' | 'state' | 'zip' | 'point';

/** What is wrong with a place, by field, before it can be saved. Empty when it can. */
export function placeProblems(place: PlaceValue): Partial<Record<PlaceField, string>> {
  const problems: Partial<Record<PlaceField, string>> = {};
  if (!place.city.trim() && !place.zip.trim() && place.latitude === null) problems.city = 'Enter the city.';
  if (!place.state) problems.state = 'Choose a state.';
  if (place.zip.trim() && !/^\d{5}(-\d{4})?$/.test(place.zip.trim())) problems.zip = 'Five digits.';
  if (place.latitude === null || place.longitude === null) problems.point = 'The address has to be found first, or its coordinates entered.';
  return problems;
}

/** A coordinate typed as a number within its range, or null. */
function coordinate(text: string, limit: number): number | null {
  const value = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Math.abs(number) <= limit ? number : null;
}

const quiet = 'text-xs tabular-nums text-text-3';

interface PlaceFieldsProps {
  /** Starts every field's id: "record-place" gives "record-place-street". */
  idPrefix: string;
  value: PlaceValue;
  /** The fields that changed. */
  onChange: (patch: Partial<PlaceValue>) => void;
  /** Problems to show beside their fields (the form decides when). */
  problems?: Partial<Record<PlaceField, string>>;
  /**
   * Adding: the address is looked up as it is typed. Correcting a factory
   * that already stands somewhere: only when asked, so fixing a spelling
   * does not move the factory.
   */
  lookUp: 'as-typed' | 'when-asked';
}

/**
 * A factory's address as people write one (street, city, state, ZIP code),
 * and the point on the map found from it. The form looks the address up
 * itself and says in one line what it found; latitude and longitude are
 * asked for only when the person opens "Enter coordinates instead", which
 * is also what is offered when an address cannot be found or there is no
 * map key to look it up with.
 */
export default function PlaceFields({ idPrefix, value, onChange, problems = {}, lookUp }: PlaceFieldsProps) {
  const canLookUp = placeSearchAvailable();
  // Coordinates typed by hand: opened by the person, or from the start when no address can be looked up.
  const [byHand, setByHand] = useState(!canLookUp && lookUp === 'as-typed');
  const [latitude, setLatitude] = useState(value.latitude === null ? '' : String(value.latitude));
  const [longitude, setLongitude] = useState(value.longitude === null ? '' : String(value.longitude));
  // Correcting: nothing is looked up until the person asks.
  const [asked, setAsked] = useState(lookUp === 'as-typed');

  const typed = { street: value.street.trim(), city: value.city.trim(), state: value.state, zip: value.zip.trim() };
  const settled = useDebouncedValue(JSON.stringify(typed), 700);
  const still = settled === JSON.stringify(typed);
  const enough = Boolean(typed.state && (typed.city || /^\d{5}/.test(typed.zip)));
  const lookup = useQuery({
    queryKey: publicKeys.address(typed),
    queryFn: ({ signal }) => findAddress(typed, signal),
    enabled: canLookUp && asked && !byHand && enough && still,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const found: FoundAddress | null | undefined = lookup.isFetching ? undefined : lookup.data;

  // What the lookup found is where the factory stands; an address still being typed, or not found, stands nowhere.
  const { latitude: lat, longitude: lng } = value;
  useEffect(() => {
    if (byHand || !asked) return;
    // Correcting a factory, the point on record stays until another is found.
    if (!found && lookUp === 'when-asked') return;
    const next = found ? { latitude: found.latitude, longitude: found.longitude } : { latitude: null, longitude: null };
    if (next.latitude !== lat || next.longitude !== lng) onChange(next);
  }, [byHand, asked, found, lat, lng, onChange, lookUp]);

  const typeCoordinate = (which: 'latitude' | 'longitude', text: string) => {
    if (which === 'latitude') setLatitude(text);
    else setLongitude(text);
    onChange({ [which]: coordinate(text, which === 'latitude' ? 90 : 180) });
  };
  const openByHand = () => {
    setByHand(true);
    setLatitude(value.latitude === null ? '' : String(value.latitude));
    setLongitude(value.longitude === null ? '' : String(value.longitude));
    window.setTimeout(() => document.getElementById(`${idPrefix}-latitude`)?.focus(), 0);
  };
  const useAddress = () => {
    setByHand(false);
    setAsked(true);
  };

  const text = (field: 'street' | 'city' | 'zip', extra: { maxLength: number; autoComplete: string; inputMode?: 'numeric' }) => (
    <input
      id={`${idPrefix}-${field}`}
      type="text"
      value={value[field]}
      onChange={(e) => onChange({ [field]: e.target.value })}
      aria-invalid={problems[field] ? true : undefined}
      aria-describedby={problems[field] ? `${idPrefix}-${field}-error` : undefined}
      className={cn(fieldClass, problems[field] && 'border-danger/60')}
      {...extra}
    />
  );

  return (
    <div className="space-y-4" data-place-fields>
      <Field label="Street address" htmlFor={`${idPrefix}-street`}>
        {text('street', { maxLength: 300, autoComplete: 'address-line1' })}
        <FieldError id={`${idPrefix}-street-error`} message={problems.street} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
        <Field label="City" htmlFor={`${idPrefix}-city`}>
          {text('city', { maxLength: 120, autoComplete: 'address-level2' })}
          <FieldError id={`${idPrefix}-city-error`} message={problems.city} />
        </Field>
        <Field label="State" htmlFor={`${idPrefix}-state`}>
          <Select value={value.state} onValueChange={(state) => onChange({ state })}>
            <SelectTrigger
              id={`${idPrefix}-state`}
              aria-invalid={problems.state ? true : undefined}
              aria-describedby={problems.state ? `${idPrefix}-state-error` : undefined}
              className={cn(selectTriggerClass, 'w-full', problems.state && 'border-danger/60')}
            >
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent className={cn(selectContentClass, 'max-h-72')}>
              {US_STATES.map((option) => (
                <SelectItem key={option.code} value={option.code} className="py-2.5">
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${idPrefix}-state-error`} message={problems.state} />
        </Field>
        <Field label="ZIP code" htmlFor={`${idPrefix}-zip`}>
          {text('zip', { maxLength: 10, autoComplete: 'postal-code', inputMode: 'numeric' })}
          <FieldError id={`${idPrefix}-zip-error`} message={problems.zip} />
        </Field>
      </div>

      {/* What the form found, or what it needs. One line, and under it the point in quiet type. */}
      <div className="min-h-[2.75rem] text-sm" aria-live="polite" data-place-found={byHand ? 'by-hand' : found ? found.precision : lookup.isFetching ? 'looking' : 'none'}>
        {byHand ? (
          <>
            <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
              <Field label="Latitude" htmlFor={`${idPrefix}-latitude`} hint="Decimal degrees, such as 30.2241.">
                <input
                  id={`${idPrefix}-latitude`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={20}
                  value={latitude}
                  onChange={(e) => typeCoordinate('latitude', e.target.value)}
                  aria-invalid={problems.point && value.latitude === null ? true : undefined}
                  className={cn(fieldClass, problems.point && value.latitude === null && 'border-danger/60')}
                />
              </Field>
              <Field label="Longitude" htmlFor={`${idPrefix}-longitude`} hint="West is negative, such as -97.6134.">
                <input
                  id={`${idPrefix}-longitude`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={20}
                  value={longitude}
                  onChange={(e) => typeCoordinate('longitude', e.target.value)}
                  aria-invalid={problems.point && value.longitude === null ? true : undefined}
                  className={cn(fieldClass, problems.point && value.longitude === null && 'border-danger/60')}
                />
              </Field>
            </div>
            {problems.point && <p className="mt-1.5 text-sm text-danger" id={`${idPrefix}-point-error`}>A latitude from -90 to 90 and a longitude from -180 to 180.</p>}
            {canLookUp && (
              <button type="button" onClick={useAddress} className={cn(textButtonClass, 'mt-2 flex min-h-9 items-center')} data-place-use-address>
                Find it from the address instead
              </button>
            )}
            {!canLookUp && <p className="mt-2 text-text-2">The address could not be looked up: no map key is set. The coordinates place the factory on the map.</p>}
          </>
        ) : !asked ? (
          // A factory on record: where it stands now, and the way to look its address up again.
          <>
            <p className="text-text-1">
              On the map at <span className="tabular-nums">{value.latitude}, {value.longitude}</span>
            </p>
            <Choices>
              {canLookUp && (
                <button type="button" onClick={useAddress} className={textButtonClass} data-place-look>
                  Find the address again
                </button>
              )}
              <button type="button" onClick={openByHand} className={textButtonClass} data-place-by-hand>
                Enter coordinates instead
              </button>
            </Choices>
          </>
        ) : !enough ? (
          <>
            <p className="text-text-2">The factory is placed on the map from this address.</p>
            <Choices>
              <button type="button" onClick={openByHand} className={textButtonClass} data-place-by-hand>
                Enter coordinates instead
              </button>
            </Choices>
          </>
        ) : !still || lookup.isFetching ? (
          <p className="flex items-center gap-2 text-text-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Looking up the address
          </p>
        ) : found ? (
          <>
            <p className="break-words text-text-1" data-place-label>
              Found: {found.label}
            </p>
            <p className={cn(quiet, 'mt-0.5')}>
              {found.latitude}, {found.longitude}
              {found.precision === 'street' && ' · the street, not the building number'}
              {found.precision === 'town' && ' · the town only: add the street for the exact place'}
            </p>
            <Choices>
              <button type="button" onClick={() => void lookup.refetch()} className={textButtonClass} data-place-look>
                Look again
              </button>
              <button type="button" onClick={openByHand} className={textButtonClass} data-place-by-hand>
                Enter coordinates instead
              </button>
            </Choices>
          </>
        ) : (
          <>
            <p className={cn(problems.point ? 'text-danger' : 'text-text-1')} role={lookup.isError ? 'alert' : undefined} data-place-missing>
              {lookup.isError ? 'The address could not be looked up.' : 'That address was not found. Check the street, the city and the ZIP code.'}
            </p>
            <Choices>
              <button type="button" onClick={() => void lookup.refetch()} className={textButtonClass} data-place-look>
                Look again
              </button>
              <button type="button" onClick={openByHand} className={textButtonClass} data-place-by-hand>
                Enter coordinates instead
              </button>
            </Choices>
          </>
        )}
        {!byHand && problems.point && !enough && asked && (
          <p className="mt-1.5 text-sm text-danger" id={`${idPrefix}-point-error`}>
            Enter the city and choose the state, so the address can be found.
          </p>
        )}
      </div>
    </div>
  );
}

function Choices({ children }: { children: ReactNode }) {
  return <div className="mt-1 flex min-h-9 flex-wrap items-center gap-x-5 gap-y-1">{children}</div>;
}
