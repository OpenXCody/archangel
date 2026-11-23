import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPay } from '../../lib/jobFormat';
import { type CareerJob, type MilitaryCareerRow } from '../../lib/api';
import { formatCompanyName } from '@shared/displayName';
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

/** Careers typical of a factory's industry: what kind of work a factory like this has, never a claim about it. */
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

/** Open jobs at a company, a factory, for a career or asking for a skill. Drawn only when there is one. */
export function OpenJobsSection({ jobs, showCareer = false, total, all }: { jobs: CareerJob[]; showCareer?: boolean; total?: number; all?: string }) {
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
          <RecordRow
            key={job.id}
            to={`/jobs/${job.id}`}
            title={job.title}
            subtitle={[
              // The career is said only when the job is not simply named after it.
              showCareer ? (job.occupationTitle !== job.title ? job.occupationTitle : null) : formatCompanyName(job.companyName),
              job.city ? titleCase(job.city) : null,
              // A job from a company's careers site that states no pay says nothing about pay.
              job.payMin !== null || job.payMax !== null ? formatPay(job.payMin, job.payMax, job.payPeriod) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </RecordList>
    </DetailSection>
  );
}

/** A skill with no level: only in a database no taxonomy was loaded into. */
export const UNPLACED = 'Not yet placed';

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
