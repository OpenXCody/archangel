import { cn } from '@/lib/utils';
import type { PlantCounty } from '../../lib/api';
import { usePlantCounty } from '../../lib/queries';

/**
 * What the official statistics say about manufacturing in a county, as one
 * sentence: "60,968 people work in manufacturing, at 1,354 establishments.
 * Average pay $136,250 a year." Null when nothing is published. A figure the
 * source withheld is left out, never shown as 0.
 */
export function countySentence(stats: NonNullable<PlantCounty['manufacturing']>): string | null {
  const people = stats.employment;
  const establishments = stats.establishments;
  const sites = establishments !== null ? `${establishments.toLocaleString()} ${establishments === 1 ? 'establishment' : 'establishments'}` : null;
  const first =
    people !== null
      ? `${people.toLocaleString()} ${people === 1 ? 'person works' : 'people work'} in manufacturing${sites ? `, at ${sites}` : ''}.`
      : sites
        ? `${sites} in manufacturing.`
        : null;
  if (!first) return null;
  return stats.avgAnnualPay !== null && people !== null ? `${first} Average pay $${stats.avgAnnualPay.toLocaleString()} a year.` : first;
}

/**
 * The county a plant stands in and manufacturing as a whole there, from the
 * official statistics: a fact about the county, said as one. Where it was read
 * is not shown (no public page names a source). It is never a figure about the plant, so it sits apart from
 * the plant's own people and is worded "in manufacturing". Nothing is drawn
 * until the answer is in, and nothing at all for a plant with no county or a
 * county with no published figure.
 */
export default function CountyLine({ factoryId, className }: { factoryId: string; className?: string }) {
  const { data } = usePlantCounty(factoryId);
  const stats = data?.manufacturing ?? null;
  const sentence = stats ? countySentence(stats) : null;
  if (!data?.county || !stats || !sentence) return null;
  return (
    <p className={cn('text-sm leading-relaxed text-fg-muted', className)} data-county-line={data.county.fips}>
      <span className="text-fg-default">{data.county.name}</span>
      {': '}
      {sentence}
    </p>
  );
}
