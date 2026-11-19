import { useState } from 'react';
import { formatPay } from '../../lib/jobFormat';
import { type CareerJob } from '../../lib/api';
import { formatCompanyName } from '@shared/displayName';
import { industryLabel, industryPath } from '@shared/industry';
import FootprintMap from './FootprintMap';
import { titleCase } from '../../lib/places';
import {
  DetailSection,
  RecordList,
  RecordRow,
  ShowAll,
  recordListClass,
} from '../layout/Page';
import { LEVELS } from '../../lib/stages';

/*
 * What the four record pages share: the heading block's inputs, the footprint
 * card, open jobs, careers typical of an industry, the levels of a path and
 * industries as rows. Each page is its own file beside this one;
 * pages/EntityDetail.tsx picks which to draw from the address.
 */

/** What every view's heading block is given by the page: the way back and an admin's Edit. */
export interface Head {
  back: { fallback: string };
  edit?: React.ReactNode;
}

/** How many careers a list shows before "Show all". */
export const CAREERS_SHOWN = 8;

/** A link inside a line of facts. The padding gives a finger room without moving the line. */
export const factLinkClass = 'py-[15px] underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg-default hover:decoration-fg-muted';

/** A plant's street address as written: a curated plant's was typed by a person ("1530 FM 973") and is left as it is. */
export function streetAddress(plant: { address?: string | null; curated?: boolean }): string | null {
  if (!plant.address) return null;
  return plant.curated ? plant.address : titleCase(plant.address);
}

/** The footprint card: the map, and under it whatever places it. */
export function Footprint({ children, ...map }: React.ComponentProps<typeof FootprintMap> & { children?: React.ReactNode }) {
  return (
    <div className={`${recordListClass} mt-6`} data-footprint>
      <div className="px-3 py-4 sm:px-6 sm:py-6">
        <FootprintMap {...map} className="mx-auto max-w-2xl" />
      </div>
      {children}
    </div>
  );
}

/** Careers typical of a plant's industry: what kind of work a plant like this has, never a claim about it. */
export function TypicalCareers({ careers }: { careers: { id: string; title: string }[] }) {
  return (
    <DetailSection id="occupations" title="Careers in this industry">
      <RecordList>
        {careers.map((career) => (
          <RecordRow key={career.id} to={`/occupations/${career.id}`} title={career.title} />
        ))}
      </RecordList>
    </DetailSection>
  );
}

/** Open jobs at a company, a plant, for a career or asking for a skill. Drawn only when there is one. */
export function OpenJobsSection({ jobs, showCareer = false }: { jobs: CareerJob[]; showCareer?: boolean }) {
  return (
    <DetailSection id="jobs" title="Open jobs">
      <RecordList>
        {jobs.map((job) => (
          <RecordRow
            key={job.id}
            to={`/jobs/${job.id}`}
            title={job.title}
            subtitle={[
              // The career is said only when the job is not simply named after it.
              showCareer ? (job.occupationTitle !== job.title ? job.occupationTitle : null) : formatCompanyName(job.companyName),
              job.city ? titleCase(job.city) : null,
              formatPay(job.payMin, job.payMax, job.payPeriod),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </RecordList>
    </DetailSection>
  );
}

/**
 * The three levels a career's path is laid out by, in the order they are
 * learned, each with its name and the few words under it (lib/stages.ts).
 */
export const PATH_LEVELS = LEVELS.map(({ id, name, gloss }) => ({ level: id, label: name, hint: gloss }));

/** A skill with no level: only in a database no taxonomy was loaded into. */
export const UNPLACED = 'Not yet placed';

/** The line above one level's rows: its number on a path, its name, what it means. */
export function LevelHeading({ number, label, hint }: { number?: number; label: string; hint?: string }) {
  return (
    <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
      {number && <span className="text-xs font-medium tabular-nums text-fg-soft">{number}</span>}
      <span className="font-semibold text-fg-default">{label}</span>
      {hint && <span className="text-xs font-normal text-fg-soft">{hint}</span>}
    </h3>
  );
}

/** How many industries are listed before "Show all". */
const INDUSTRIES_SHOWN = 4;

/** Industries as rows, each leading to its page; with a figure (plants) when there is one to give. */
export function IndustryRows({ industries }: { industries: { name: string; factoryCount?: number }[] }) {
  const [showAll, setShowAll] = useState(false);
  // A list a row or two longer than the cut is shown whole.
  const cut = industries.length > INDUSTRIES_SHOWN + 2;
  return (
    <>
      <RecordList>
        {(showAll || !cut ? industries : industries.slice(0, INDUSTRIES_SHOWN)).map((industry) => (
          <RecordRow
            key={industry.name}
            to={industryPath(industry.name) ?? '/industries'}
            title={industryLabel(industry.name)}
            figure={industry.factoryCount}
            figureLabel="plants"
          />
        ))}
      </RecordList>
      {cut && <ShowAll open={showAll} total={industries.length} onToggle={() => setShowAll((value) => !value)} />}
    </>
  );
}
