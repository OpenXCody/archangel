import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type CareerJob, type MilitaryCareerRow } from '../../lib/api';
import type { JobListSays } from '../../lib/jobRow';
import { industryLabel, industryPath } from '@shared/industry';
import { kindLine } from '@shared/military';
import FootprintMap from './FootprintMap';
import { titleCase } from '../../lib/places';
import {
  DetailSection,
  sectionLinkClass,
  RecordList,
  RecordRow,
  ShowAll,
  recordListClass,
} from '../layout/Page';
import { JobRecordRow } from '../jobs/JobRow';
import { labelClass } from '@/lib/utils';
import { ShareRing } from '../path/HeldShare';
import type { Share } from '@shared/route';

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
export const factLinkClass = 'py-[15px] text-text-1 underline';

/** A factory's street address as written: a curated factory's was typed by a person ("1530 FM 973") and is left as it is. */
export function streetAddress(plant: { address?: string | null; curated?: boolean }): string | null {
  if (!plant.address) return null;
  return plant.curated ? plant.address : titleCase(plant.address);
}

/** The footprint: the map, and under it whatever places it. */
export function Footprint({ children, ...map }: React.ComponentProps<typeof FootprintMap> & { children?: React.ReactNode }) {
  return (
    <div className={`${recordListClass} mt-6`} data-footprint>
      <div className="py-4">
        <FootprintMap {...map} className="mx-auto max-w-2xl" />
      </div>
      {children}
    </div>
  );
}

/**
 * Open jobs at a company, a factory, for a career or asking for a skill. Drawn only when there is one.
 * `said` is what the page has already said of every job in the list (its career, its company, its factory): a row's
 * first line is a job's name, always, with the opening's own name beside it, and it never repeats what the page has
 * said (`JobRecordRow`; `jobRow` in lib/jobRow.ts is the rule).
 */
export function OpenJobsSection({ jobs, said, total, all }: { jobs: CareerJob[]; said?: JobListSays; total?: number; all?: string }) {
  // The page lists the newest few. When more are open, one link leads to all of them on Jobs.
  const more = all && typeof total === 'number' && total > jobs.length;
  return (
    <DetailSection
      id="jobs"
      title="Open jobs"
      action={
        more ? (
          <Link to={all} className={sectionLinkClass} data-all-jobs>
            All {total.toLocaleString('en-US')}
          </Link>
        ) : undefined
      }
    >
      <RecordList>
        {jobs.map((job) => (
          <JobRecordRow key={job.id} job={job} said={said} />
        ))}
      </RecordList>
    </DetailSection>
  );
}

/** How many industries are listed before "Show all". */
const INDUSTRIES_SHOWN = 4;

/** Industries as rows, each leading to its page; with a figure (factories) when there is one to give. */
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
            figureLabel="factories"
          />
        ))}
      </RecordList>
      {cut && <ShowAll open={showAll} total={industries.length} onToggle={() => setShowAll((value) => !value)} />}
    </>
  );
}

/** How many military careers a section lists before "Show all". */
const MILITARY_SHOWN = 5;

/**
 * Military careers as rows, each under its full title with its kind and code
 * in the grey line ("Navy rating · HT") and, where the section says how much
 * of a path each holds, that after it ("12 of 19 skills"). The page's last
 * section wherever it stands: a military career is where a person comes from.
 */
export function MilitaryCareerRows({ careers, ...rest }: { careers: (MilitaryCareerRow & { held?: number; total?: number })[] } & Record<`data-${string}`, string>) {
  const [showAll, setShowAll] = useState(false);
  // A list a row or two longer than the cut is shown whole.
  const cut = careers.length > MILITARY_SHOWN + 2;
  return (
    <>
      <RecordList {...rest}>
        {(showAll || !cut ? careers : careers.slice(0, MILITARY_SHOWN)).map((career) => (
          <RecordRow
            key={career.id}
            to={`/occupations/${career.id}`}
            title={career.title}
            subtitle={[kindLine(career.kind, career.code), career.total ? `${career.held ?? 0} of ${career.total} skills` : null].filter(Boolean).join(' · ') || null}
            data-military-career={career.id}
          />
        ))}
      </RecordList>
      {cut && <ShowAll open={showAll} total={careers.length} onToggle={() => setShowAll((value) => !value)} />}
    </>
  );
}

/**
 * The heading of a career's skills, on the route's first line beside "Open
 * all": the word, an admin's Draft, and a seeker's share, quietly, once they
 * hold a skill of it ("5 of 33 held"; never "0 of").
 */
export function SkillsHeading({ id, held, note }: { id: string; held: Share | null; note?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className={labelClass}>
        Skills
      </h2>
      {note}
      {held && held.held > 0 && (
        <span className="inline-flex items-center gap-1.5 self-center text-[13px] text-text-3" data-held-count>
          <ShareRing share={held} className="h-4 w-4" />
          <span>
            <span className="tabular-nums text-text-1">{held.held}</span> of {held.total} held
          </span>
        </span>
      )}
    </div>
  );
}
