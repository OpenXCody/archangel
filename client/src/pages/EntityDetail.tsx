import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import GoalButton from '../components/account/GoalButton';
import SkillStatusButton, { SkillHeldToggle } from '../components/account/SkillStatusButton';
import { ErrorNote } from '../components/account/parts';
import { signInPath, useAccount } from '../lib/account';
import { useMarkSkill, type SkillMark, useMySkills, type SkillStatus } from '../lib/seeker';
import { useSeekerTools, useViewer } from '../lib/viewer';
import { editPath, type RecordKind } from '../lib/records';
import { formatPay } from '../lib/jobFormat';
import { Loader2 } from 'lucide-react';
import {
  type EntityType,
  type CompanyDetail,
  type FactoryDetail,
  type OccupationDetail,
  type RelatedSkill,
  type CareerJob,
  type SkillDetail,
} from '../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { industryByName, industryLabel, industryPath } from '@shared/industry';
import CompanyLogo from '../components/CompanyLogo';
import FootprintMap from '../components/FootprintMap';
import { CompanyFamily, CompanyStanding, PlantFacts, SourceList, peopleCount } from '../components/RecordFacts';
import { useMapStore } from '../stores/mapStore';
import { cityState, stateName, titleCase } from '../lib/places';
import {
  DetailFacts,
  DetailHeader,
  DetailSection,
  EmptyState,
  BackLink,
  PageContainer,
  RecordList,
  RecordRow,
  ShowAll,
  detailActionClass,
  recordListClass,
} from '../components/layout/Page';
import { plural } from '@/lib/utils';
import { type Stage, STAGE_LABEL } from '../lib/stages';
import { recordQuery } from '../lib/queries';

/** What each kind of record is called at the head of its page. */
const KIND_LABEL: Record<EntityType, string> = {
  companies: 'Company',
  factories: 'Plant',
  occupations: 'Career',
  skills: 'Skill',
};

/** What Admin Tools calls each kind of record, for the Edit link an admin sees. */
const RECORD_KIND: Record<EntityType, RecordKind> = {
  companies: 'company',
  factories: 'factory',
  occupations: 'career',
  skills: 'skill',
};

/** The kind of record a page shows is the first part of its address: /companies/:id, /factories/:id and so on. */
function getEntityType(pathname: string): EntityType {
  if (pathname.startsWith('/factories')) return 'factories';
  if (pathname.startsWith('/occupations')) return 'occupations';
  if (pathname.startsWith('/skills')) return 'skills';
  return 'companies';
}

/** What every view's heading block is given by the page: the way back and an admin's Edit. */
interface Head {
  back: { fallback: string };
  edit?: React.ReactNode;
}

/** How many rows a list shows before "Show all". */
const PLANTS_SHOWN = 12;
const CAREERS_SHOWN = 8;

/** A link inside a line of facts. The padding gives a finger room without moving the line. */
const factLinkClass = 'py-[15px] underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg-default hover:decoration-fg-muted';

/** A plant's street address as written: a curated plant's was typed by a person ("1530 FM 973") and is left as it is. */
function streetAddress(plant: { address?: string | null; curated?: boolean }): string | null {
  if (!plant.address) return null;
  return plant.curated ? plant.address : titleCase(plant.address);
}

/** The footprint card: the map, and under it whatever places it. */
function Footprint({ children, ...map }: React.ComponentProps<typeof FootprintMap> & { children?: React.ReactNode }) {
  return (
    <div className={`${recordListClass} mt-6`} data-footprint>
      <div className="px-3 py-4 sm:px-6 sm:py-6">
        <FootprintMap {...map} className="mx-auto max-w-2xl" />
      </div>
      {children}
    </div>
  );
}

/**
 * A company's page. Who it is, where it is, whether it is hiring, its plants
 * and the careers at them. About seven companies in ten have one plant: for
 * those the page leads with that plant's own facts and address, in place of
 * counting to one and listing one row.
 */
function CompanyDetailView({ data, head }: { data: CompanyDetail; head: Head }) {
  const navigate = useNavigate();
  const [showAllPlants, setShowAllPlants] = useState(false);
  const [showAllCareers, setShowAllCareers] = useState(false);
  const name = formatCompanyName(data.name);
  const plants = useMemo(() => data.factories ?? [], [data.factories]);
  const jobs = data.jobs ?? [];
  const only = plants.length === 1 ? plants[0] : null;

  // Plants that can be placed, for the footprint and for framing them on the map.
  const placed = useMemo(
    () =>
      plants
        .map((plant) => ({ plant, latitude: parseFloat(plant.latitude ?? ''), longitude: parseFloat(plant.longitude ?? '') }))
        .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)),
    [plants]
  );

  // Plants per state, most first: "Texas 6 · California 2".
  const byState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plant of plants) if (plant.state) counts.set(plant.state, (counts.get(plant.state) ?? 0) + 1);
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, name: stateName(code) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [plants]);

  // Plants whose size is known come first, the largest first; the rest by state and name.
  const sortedPlants = useMemo(
    () =>
      [...plants].sort(
        (a, b) =>
          (b.workforceSize ?? 0) - (a.workforceSize ?? 0) ||
          (a.state ?? 'ZZ').localeCompare(b.state ?? 'ZZ') ||
          formatFactoryName(a.name).localeCompare(formatFactoryName(b.name))
      ),
    [plants]
  );
  // People are counted at the plants that state a figure, and said so when that is not all of them.
  const sized = plants.filter((plant) => (plant.workforceSize ?? 0) > 0).length;
  const shownPlants = showAllPlants ? sortedPlants : sortedPlants.slice(0, PLANTS_SHOWN);

  // A company's industries are the ones its plants are in (the 21), the one
  // with most of its plants first. Each is a page of its own; where the plants
  // are all in one state, that state's page of it.
  const industries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plant of plants) {
      const industry = industryByName(plant.industry);
      if (industry) counts.set(industry.name, (counts.get(industry.name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([industry]) => industry);
  }, [plants]);
  const oneState = byState.length === 1 ? byState[0].code : null;

  const facts = only
    ? [cityState(only.city, only.state), only.status === 'under construction' ? 'Under construction' : null].filter(Boolean)
    : [
        plants.length > 0 ? plural(plants.length, 'plant', 'plants') : null,
        byState.length > 1 ? `${byState.length} states` : byState.length === 1 ? byState[0].name : null,
        (data.totalWorkforce ?? 0) > 0
          ? `${peopleCount(data.totalWorkforce ?? 0)}${sized > 0 && sized < plants.length ? ` at ${plural(sized, 'plant', 'plants')}` : ''}`
          : null,
      ].filter(Boolean);

  // Show only this company's plants on the map, framed. The map reads both
  // from its store when it mounts.
  const openOnMap = () => {
    const store = useMapStore.getState();
    store.setFilters({ company: data.id, companyName: name, states: [] });
    if (placed.length > 0) {
      store.flyTo({ kind: 'points', points: placed.map((entry): [number, number] => [entry.longitude, entry.latitude]) });
    }
    navigate('/map');
  };

  const careers = data.occupations ?? [];
  const typical = careers.length === 0 ? (data.typicalCareers ?? []) : [];
  const onlyName = only ? formatFactoryName(only.name) : '';
  const onlyStreet = only ? streetAddress(only) : null;

  return (
    <>
      <DetailHeader
        {...head}
        kind="Company"
        title={name}
        mark={<CompanyLogo name={name} domain={data.domain} size={44} className="rounded-lg" />}
        description={data.description}
        action={
          placed.length > 0 ? (
            <button type="button" onClick={openOnMap} className={detailActionClass} data-open-map>
              Open on the map
            </button>
          ) : undefined
        }
      >
        {(facts.length > 0 || industries.length > 0) && (
          <DetailFacts>
            {facts.join(' · ')}
            {industries.slice(0, 2).map((industry, index) => (
              <span key={industry}>
                {index > 0 || facts.length > 0 ? ' · ' : ''}
                <Link to={industryPath(industry, { state: oneState }) ?? '/industries'} className={factLinkClass}>
                  {industryLabel(industry)}
                </Link>
              </span>
            ))}
          </DetailFacts>
        )}
        <CompanyStanding data={data} />
      </DetailHeader>

      {/* One plant: its own facts stand where a list of one would. */}
      {only && <PlantFacts factory={only} />}

      {/* Where: the footprint, and how many plants in each state (or the one plant, leading to its page) */}
      {placed.length > 0 && (
        <Footprint
          points={placed.map((entry) => ({
            id: entry.plant.id,
            latitude: entry.latitude,
            longitude: entry.longitude,
            label: formatFactoryName(entry.plant.name),
          }))}
        >
          {only ? (
            <ul className="border-t border-border-subtle" data-only-plant>
              <RecordRow
                to={`/factories/${only.id}`}
                label="Plant"
                // A plant that carries the company's own name is told by its address.
                title={onlyName.toLowerCase() === name.toLowerCase() ? (onlyStreet ?? onlyName) : onlyName}
                subtitle={onlyName.toLowerCase() === name.toLowerCase() ? null : onlyStreet}
              />
            </ul>
          ) : (
            <p className="border-t border-border-subtle px-4 py-3 text-sm text-fg-muted sm:px-6">
              {byState.slice(0, 6).map((state, index) => (
                <span key={state.code}>
                  {index > 0 && ' · '}
                  <span className="text-fg-default">{state.name}</span> {state.count}
                </span>
              ))}
              {byState.length > 6 && ` · ${byState.length - 6} more`}
            </p>
          )}
        </Footprint>
      )}
      {only && placed.length === 0 && (
        <RecordList className="mt-6" data-only-plant="">
          <RecordRow to={`/factories/${only.id}`} label="Plant" title={onlyName} subtitle={onlyStreet} />
        </RecordList>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} showCareer />}

      {/* The companies that are part of this one */}
      {(data.subsidiaries?.length ?? 0) > 0 && (
        <DetailSection id="companies" title="Companies">
          <CompanyFamily companies={data.subsidiaries ?? []} />
        </DetailSection>
      )}

      {/* Every plant: where it is and what it makes */}
      {plants.length > 1 && (
        <DetailSection id="factories" title="Plants">
          <RecordList>
            {shownPlants.map((plant) => (
              <RecordRow
                key={plant.id}
                to={`/factories/${plant.id}`}
                title={formatFactoryName(plant.name)}
                subtitle={
                  [
                    cityState(plant.city, plant.state),
                    plant.status === 'under construction' ? 'Under construction' : null,
                    plant.workforceSize ? peopleCount(plant.workforceSize) : null,
                    plant.products || (plant.industry ? industryLabel(plant.industry) : plant.specialization),
                  ]
                    .filter(Boolean)
                    .join(' · ') || null
                }
              />
            ))}
          </RecordList>
          {sortedPlants.length > PLANTS_SHOWN && (
            <ShowAll open={showAllPlants} total={sortedPlants.length} onToggle={() => setShowAllPlants((value) => !value)} />
          )}
        </DetailSection>
      )}

      {/* Careers recorded across this company's plants */}
      {careers.length > 0 && (
        <DetailSection id="occupations" title="Careers">
          <RecordList>
            {(showAllCareers ? careers : careers.slice(0, CAREERS_SHOWN)).map((career) => (
              <RecordRow
                key={career.id}
                to={`/occupations/${career.id}`}
                title={career.title}
                subtitle={
                  [only ? null : plural(career.factoryCount, 'plant', 'plants'), career.headcount ? peopleCount(career.headcount) : null]
                    .filter(Boolean)
                    .join(' · ') || null
                }
              />
            ))}
          </RecordList>
          {careers.length > CAREERS_SHOWN && (
            <ShowAll open={showAllCareers} total={careers.length} onToggle={() => setShowAllCareers((value) => !value)} />
          )}
        </DetailSection>
      )}
      {/* With none recorded, the one plant's industry says what kind of work there is. */}
      {typical.length > 0 && <TypicalCareers careers={typical} />}

      <SourceList sources={data.sources} />
    </>
  );
}

/** Careers typical of a plant's industry: what kind of work a plant like this has, never a claim about it. */
function TypicalCareers({ careers }: { careers: { id: string; title: string }[] }) {
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

/**
 * A plant's page: where it is, how many people, what it makes, who runs it,
 * whether it is hiring, the company's other plants and the careers there.
 * The same story its panel on the map tells, with room for all of it.
 */
function FactoryDetailView({ data, head }: { data: FactoryDetail; head: Head }) {
  const [showAllCareers, setShowAllCareers] = useState(false);
  const name = formatFactoryName(data.name);
  const company = data.company;
  const companyName = company ? formatCompanyName(company.name) : null;
  const place = cityState(data.city, data.state);
  const industry = data.industry ? industryLabel(data.industry) : data.specialization;
  // The plant's industry is a page of its own, for the plant's state.
  const industryPage = industryPath(data.industry, { state: data.state });
  const underConstruction = data.status === 'under construction';
  const jobs = data.jobs ?? [];
  const nearby = useMemo(() => data.nearby ?? [], [data.nearby]);
  const latitude = parseFloat(data.latitude);
  const longitude = parseFloat(data.longitude);
  const located = Number.isFinite(latitude) && Number.isFinite(longitude);
  const plantCount = company?.siteCount ?? 0;
  const stateCount = company?.stateCount ?? 0;
  // A company whose one plant this is, under the same name, would only repeat the heading.
  const companyIsThisPlant =
    companyName !== null && plantCount <= 1 && !company?.description && name.toLowerCase().startsWith(companyName.toLowerCase());
  const street = streetAddress(data);
  const careers = data.occupations ?? [];
  const counted = careers.some((career) => (career.headcount ?? 0) > 0);

  // This plant, marked, among the company's nearest others.
  const points = useMemo(
    () => [
      ...(located ? [{ id: data.id, latitude, longitude, label: formatFactoryName(data.name) }] : []),
      ...nearby
        .map((plant) => ({ id: plant.id, latitude: parseFloat(plant.latitude), longitude: parseFloat(plant.longitude), label: formatFactoryName(plant.name) }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    ],
    [data.id, data.name, located, latitude, longitude, nearby]
  );

  return (
    <>
      <DetailHeader
        {...head}
        kind="Plant"
        title={name}
        mark={companyName ? <CompanyLogo name={companyName} domain={company?.domain} size={44} className="rounded-lg" /> : undefined}
        description={data.description}
        action={
          located ? (
            <Link to={`/map?factory=${data.id}`} className={detailActionClass} data-open-map>
              Open on the map
            </Link>
          ) : undefined
        }
      >
        {(place || industry || underConstruction) && (
          <DetailFacts>
            {place}
            {place && industry ? ' · ' : ''}
            {industry && industryPage ? (
              <Link to={industryPage} className={factLinkClass}>
                {industry}
              </Link>
            ) : (
              industry
            )}
            {underConstruction ? `${place || industry ? ' · ' : ''}Under construction` : ''}
          </DetailFacts>
        )}
      </DetailHeader>

      {/* What it is: how many people, what it makes, since when */}
      <PlantFacts factory={data} />

      {/* Where it is. The town is in the heading; the street is said here, once. */}
      {located && (
        <Footprint points={points} emphasis={data.id}>
          {street && <p className="border-t border-border-subtle px-4 py-3 text-sm text-fg-muted sm:px-6">{street}</p>}
        </Footprint>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} showCareer />}

      {/* Who runs it */}
      {company && companyName && !companyIsThisPlant && (
        <DetailSection title="Company">
          <RecordList>
            <RecordRow
              to={`/companies/${company.slug ?? company.id}`}
              lead={<CompanyLogo name={companyName} domain={company.domain} size={32} className="rounded-md" />}
              title={companyName}
              // One plant is this one: counting it says nothing.
              subtitle={plantCount > 1 ? `${plural(plantCount, 'plant', 'plants')}${stateCount > 1 ? ` in ${stateCount} states` : ''}` : null}
            />
          </RecordList>
        </DetailSection>
      )}

      {/* The company's other plants, closest first */}
      {nearby.length > 0 && companyName && (
        <DetailSection title={`Other ${companyName} plants`}>
          <RecordList>
            {nearby.map((plant) => (
              <RecordRow key={plant.id} to={`/factories/${plant.id}`} title={formatFactoryName(plant.name)} subtitle={cityState(plant.city, plant.state) || null} />
            ))}
          </RecordList>
        </DetailSection>
      )}

      {/* Careers recorded at this plant, with how many people where that is known; else its industry's */}
      {careers.length > 0 && (
        <DetailSection id="occupations" title="Careers here" column={counted ? 'People' : undefined}>
          <RecordList>
            {(showAllCareers ? careers : careers.slice(0, CAREERS_SHOWN)).map((career) => (
              <RecordRow
                key={career.id}
                to={`/occupations/${career.id}`}
                title={career.title}
                figure={counted ? (career.headcount ?? 0) || null : undefined}
                figureLabel="people"
              />
            ))}
          </RecordList>
          {careers.length > CAREERS_SHOWN && (
            <ShowAll open={showAllCareers} total={careers.length} onToggle={() => setShowAllCareers((value) => !value)} />
          )}
        </DetailSection>
      )}
      {careers.length === 0 && (data.typicalCareers?.length ?? 0) > 0 && <TypicalCareers careers={data.typicalCareers ?? []} />}

      <SourceList sources={data.sources} />
    </>
  );
}

/** Open jobs at a company, a plant, for a career or asking for a skill. Drawn only when there is one. */
function OpenJobsSection({ jobs, showCareer = false }: { jobs: CareerJob[]; showCareer?: boolean }) {
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
 * The three stages of a career's path, in the order they are learned, and
 * what each means. Said the same way on a career's page and on a skill's.
 */
const STAGES: { stage: Stage; label: string; hint: string }[] = [
  { stage: 1, label: STAGE_LABEL[1], hint: 'Where to start' },
  { stage: 2, label: STAGE_LABEL[2], hint: 'The core of the work' },
  { stage: 3, label: STAGE_LABEL[3], hint: 'What sets you apart' },
];
/** A skill a career uses that has no stage yet, in both pages' words. */
const UNSTAGED = 'Not yet placed';

/** The line above one stage's rows: its number on a path, its name, what it means. */
function StageHeading({ number, label, hint }: { number?: number; label: string; hint?: string }) {
  return (
    <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
      {number && <span className="text-xs font-medium tabular-nums text-fg-soft">{number}</span>}
      <span className="font-semibold text-fg-default">{label}</span>
      {hint && <span className="text-xs font-normal text-fg-soft">{hint}</span>}
    </h3>
  );
}

/**
 * One skill on a career's path. Signed out, the row is a link to the skill.
 * For a seeker the mark at its head sets the skill held (or clears it) in
 * place, and the rest of the row is the link.
 */
function PathSkill({
  skill,
  status,
  onMark,
  disabled,
}: {
  skill: RelatedSkill;
  status: SkillStatus | undefined;
  /** Present for a signed-in seeker. */
  onMark?: (mark: SkillMark) => void;
  disabled?: boolean;
}) {
  if (!onMark) return <RecordRow to={`/skills/${skill.id}`} title={skill.name} />;
  return (
    <RecordRow
      to={`/skills/${skill.id}`}
      title={skill.name}
      control={<SkillHeldToggle label={skill.name} value={status ?? 'none'} onChange={onMark} disabled={disabled} />}
      data-path-skill={skill.id}
      data-status={status ?? 'none'}
    />
  );
}

// Career (occupation) detail: the path of skills by stage, where the work is done, open jobs, and the plants that have it.
function OccupationDetailView({ data, head }: { data: OccupationDetail; head: Head }) {
  const { data: account } = useAccount();
  // Marks and "You have N of M" are a seeker's: someone here to hire reads the path as a visitor does.
  const seekerTools = useSeekerTools();
  const signedIn = Boolean(account?.user) && seekerTools;
  const { data: mySkills, isPending: skillsPending } = useMySkills(signedIn);
  const statusBySkill = new Map((mySkills ?? []).map((s) => [s.skillId, s.status]));
  const markSkill = useMarkSkill();
  const { pathname, search } = useLocation();

  const skills = data.skills ?? [];
  const jobs = data.jobs ?? [];
  const plants = data.factories ?? [];
  const counted = plants.some((plant) => (plant.headcount ?? 0) > 0);
  const heldCount = skills.filter((s) => statusBySkill.get(s.id) === 'held').length;
  const staged = STAGES.map((def) => ({ ...def, skills: skills.filter((s) => s.stage === def.stage) }));
  const unstaged = skills.filter((s) => !s.stage);
  const hasStages = staged.some((group) => group.skills.length > 0);

  const pathSkill = (skill: RelatedSkill) => (
    <PathSkill
      key={skill.id}
      skill={skill}
      status={statusBySkill.get(skill.id)}
      disabled={skillsPending}
      onMark={signedIn ? (mark) => markSkill.mutate({ skillId: skill.id, name: skill.name, mark }) : undefined}
    />
  );

  return (
    <>
      <DetailHeader
        {...head}
        kind="Career"
        title={data.title}
        description={data.description}
        action={
          <>
            <GoalButton occupationId={data.id} />
            {signedIn && skills.length > 0 && (
              <span className="text-sm text-fg-muted" data-held-count>
                You have <span className="font-medium tabular-nums text-fg-default">{heldCount}</span> of {skills.length} skills
              </span>
            )}
          </>
        }
      />

      {/* What it is: the path, skills in the order they are learned */}
      {skills.length === 0 && (
        <DetailSection id="skills" title="Path">
          <p className="text-sm text-fg-muted">Path not written yet.</p>
        </DetailSection>
      )}
      {skills.length > 0 && (
        <DetailSection
          id="skills"
          title={hasStages ? 'Path' : 'Skills'}
          note={
            hasStages && data.pathStatus === 'draft' ? (
              // Honest without undermining the page: one quiet word, with the sentence for anyone who asks.
              <details className="group text-xs text-fg-soft" data-draft-path>
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center underline decoration-dotted underline-offset-4 hover:text-fg-muted [&::-webkit-details-marker]:hidden">
                  Draft
                </summary>
                <p className="mt-1 max-w-prose text-sm text-fg-muted">A starting point that has not been reviewed by a person yet.</p>
              </details>
            ) : undefined
          }
        >
          {signedIn && <ErrorNote error={markSkill.error} className="mb-3" />}
          {hasStages ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {staged.map((group) => (
                <div key={group.stage} className="min-w-0">
                  <StageHeading number={group.stage} label={group.label} hint={group.hint} />
                  {group.skills.length > 0 ? (
                    <RecordList>{group.skills.map(pathSkill)}</RecordList>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border-subtle p-3 text-sm text-fg-soft">Nothing at this stage yet.</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {unstaged.length > 0 && (
            <div className={hasStages ? 'mt-6' : ''}>
              {hasStages && <StageHeading label={UNSTAGED} />}
              <RecordList>{unstaged.map(pathSkill)}</RecordList>
            </div>
          )}
          {account && !signedIn && seekerTools && (
            <p className="mt-4 text-sm text-fg-soft">
              <Link to={signInPath(`${pathname}${search}`)} className="text-fg-muted underline underline-offset-2 hover:text-fg-default">
                Sign in
              </Link>{' '}
              to mark the skills you have.
            </p>
          )}
        </DetailSection>
      )}

      <WhereWorkIsDone data={data} />

      {/* Like the company and plant pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} />}

      {/* Plants where this career is on record */}
      {plants.length > 0 && (
        <DetailSection id="factories" title="Plants with this career" column={counted ? 'People' : undefined}>
          <RecordList>
            {plants.map((plant) => {
              const plantName = formatFactoryName(plant.name);
              const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
              return (
                <RecordRow
                  key={plant.id}
                  to={`/factories/${plant.id}`}
                  title={plantName}
                  // The company is said only when the plant is not simply named after it.
                  subtitle={
                    [company && !plantName.toLowerCase().startsWith(company.toLowerCase()) ? company : null, cityState(plant.city, plant.state)]
                      .filter(Boolean)
                      .join(' · ') || null
                  }
                  figure={counted ? (plant.headcount ?? 0) || null : undefined}
                  figureLabel="people"
                />
              );
            })}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}

/** How many industries are listed before "Show all". */
const INDUSTRIES_SHOWN = 4;

/** Industries as rows, each leading to its page; with a figure (plants) when there is one to give. */
function IndustryRows({ industries }: { industries: { name: string; factoryCount?: number }[] }) {
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

/** A place that opens on the map: the one thing on these pages drawn as a chip. */
const placeChipClass =
  'inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default sm:min-h-9';

/**
 * Where a career's work is done: the industries that typically have it, with
 * how many plants each has, and the states with the most of them (each opens
 * on the map). It describes industries, not what any one plant employs.
 */
function WhereWorkIsDone({ data }: { data: OccupationDetail }) {
  const industries = data.industries ?? [];
  const states = data.topStates ?? [];
  if (industries.length === 0 && !data.everywhere) return null;
  return (
    <DetailSection id="where" title="Where this work is done" column={data.everywhere ? undefined : 'Plants'}>
      {data.everywhere ? (
        <p className="text-sm text-fg-muted">Plants of every industry.</p>
      ) : (
        <>
          <IndustryRows industries={industries} />
          {data.elsewhereToo && <p className="mt-2 text-xs text-fg-soft">And plants of every other industry.</p>}
          {states.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-fg-soft">Most plants in these industries</p>
              <div className="flex flex-wrap gap-2">
                {states.map((state) => (
                  <Link key={state.code} to={`/map?state=${state.code}`} className={placeChipClass}>
                    {stateName(state.code)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </DetailSection>
  );
}

/** One stage's careers on a skill's page: the first few, and the rest on request. */
function SkillCareers({ label, hint, careers }: { label?: string; hint?: string; careers: SkillDetail['occupations'] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? careers : careers.slice(0, CAREERS_SHOWN);
  return (
    <div className="min-w-0" data-skill-stage={label ?? 'none'}>
      {label && <StageHeading label={label} hint={hint} />}
      <RecordList>
        {shown.map((career) => (
          <RecordRow key={career.id} to={`/occupations/${career.id}`} title={career.title} />
        ))}
      </RecordList>
      {careers.length > CAREERS_SHOWN && <ShowAll open={showAll} total={careers.length} onToggle={() => setShowAll((value) => !value)} />}
    </div>
  );
}

/**
 * A skill's page: what it is (the heading), how it is learned and what it is
 * done with, the industries it is used in, open jobs that ask for it, the
 * careers that use it by where it comes on their paths, and the skills that
 * go with it. A part with nothing to say is not drawn.
 */
function SkillDetailView({ data, head }: { data: SkillDetail; head: Head }) {
  const careers = data.occupations ?? [];
  const staged = STAGES.map((def) => ({ ...def, careers: careers.filter((career) => career.stage === def.stage) })).filter(
    (group) => group.careers.length > 0
  );
  const unstaged = careers.filter((career) => !career.stage);
  const tools = data.tools ?? [];
  const industries = data.industries ?? [];
  const jobs = data.jobs ?? [];
  return (
    <>
      <DetailHeader {...head} kind="Skill" title={data.name} description={data.description} action={<SkillStatusButton skillId={data.id} />}>
        {/* The category opens the skills list filtered to it. */}
        {data.category && (
          <DetailFacts>
            <Link to={`/explore?tab=skills&category=${encodeURIComponent(data.category)}`} className={factLinkClass} data-skill-category>
              {data.category}
            </Link>
          </DetailFacts>
        )}
      </DetailHeader>

      {(data.howLearned || tools.length > 0) && (
        <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {data.howLearned && (
            <DetailSection id="learned" title="How it is learned">
              <p className="text-[15px] leading-relaxed text-fg-muted" data-skill-learned>
                {data.howLearned}
              </p>
            </DetailSection>
          )}
          {tools.length > 0 && (
            <DetailSection id="tools" title="Done with">
              <ul className="space-y-1.5 text-[15px] text-fg-muted" data-skill-tools>
                {tools.map((tool) => (
                  <li key={tool} className="leading-snug">
                    {tool}
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
        </div>
      )}

      {/* Where: the industries its careers are typical of */}
      {(industries.length > 0 || data.everywhere) && (
        <DetailSection id="industries" title="Where it is used">
          {industries.length > 0 ? <IndustryRows industries={industries} /> : <p className="text-sm text-fg-muted">Plants of every industry.</p>}
        </DetailSection>
      )}

      {/* Like the other pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} />}

      {careers.length > 0 && (
        <DetailSection id="occupations" title="Careers that use it">
          <div className="space-y-6">
            {staged.map((group) => (
              <SkillCareers key={group.stage} label={group.label} hint={group.hint} careers={group.careers} />
            ))}
            {unstaged.length > 0 && <SkillCareers label={staged.length > 0 ? UNSTAGED : undefined} careers={unstaged} />}
          </div>
        </DetailSection>
      )}

      {data.relatedSkills?.length > 0 && (
        <DetailSection id="related" title="Skills that go with it">
          <RecordList>
            {data.relatedSkills.map((skill) => (
              <RecordRow
                key={skill.id}
                to={`/skills/${skill.id}`}
                title={skill.name}
                // Its category is said only when it is another one: a row of the same words says nothing.
                subtitle={skill.category !== data.category ? skill.category : null}
              />
            ))}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}

// What a missing record is called, and the list to go to instead.
const NOT_LISTED: Record<EntityType, string> = {
  companies: 'company', factories: 'plant', occupations: 'career', skills: 'skill',
};
const BROWSE_WORD: Record<EntityType, string> = {
  companies: 'companies', factories: 'plants', occupations: 'careers', skills: 'skills',
};

// Union type for all entity details
type AnyEntityDetail = CompanyDetail | FactoryDetail | OccupationDetail | SkillDetail;

// Type guard helpers
function isCompanyDetail(data: AnyEntityDetail): data is CompanyDetail {
  // A career's response lists factories too: a company has no skills.
  return 'factories' in data && !('skills' in data);
}

function isFactoryDetail(data: AnyEntityDetail): data is FactoryDetail {
  return 'company' in data && 'occupations' in data && 'latitude' in data;
}

function isOccupationDetail(data: AnyEntityDetail): data is OccupationDetail {
  return 'skills' in data && 'factories' in data;
}

function isSkillDetail(data: AnyEntityDetail): data is SkillDetail {
  return 'relatedSkills' in data;
}

// Main EntityDetail component
export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { pathname, hash } = useLocation();
  const entityType = getEntityType(pathname);

  const { data, isLoading, error } = useQuery<AnyEntityDetail>({
    ...recordQuery(entityType, id),
    enabled: !!id,
  });

  // The tab is named as the page's heading is: "Tesla Giga Texas · Archangel".
  useEffect(() => {
    const raw = data && ('name' in data ? data.name : 'title' in data ? data.title : null);
    if (!raw) return;
    const shown = entityType === 'factories' ? formatFactoryName(raw) : entityType === 'companies' ? formatCompanyName(raw) : raw;
    document.title = `${shown} · Archangel`;
  }, [data, entityType]);

  // A company with a short name is shown under it: /companies/tesla.
  const navigate = useNavigate();
  const slug = data && entityType === 'companies' && 'slug' in data ? data.slug : null;
  useEffect(() => {
    if (slug && id !== slug) navigate(`/companies/${slug}${window.location.hash}`, { replace: true });
  }, [slug, id, navigate]);

  // Cards deep-link to sections (#factories, #occupations, …); scroll once the data is on the page.
  useEffect(() => {
    if (!hash || !data) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, data]);

  // An admin corrects a record from its own page: Edit opens it in Admin Tools.
  const { data: viewer } = useAccount();
  // Not while the admin is looking at the product as someone else.
  const adminView = useViewer().admin;
  const canEdit = adminView && Boolean(viewer?.user?.isAdmin);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <PageContainer size="narrow">
        <div className="-mt-2">
          <BackLink fallback={`/explore?tab=${entityType}`} />
        </div>
        <EmptyState
          title={`This ${NOT_LISTED[entityType]} is not listed`}
          description="The link may be old, or the record was removed."
          action={
            <Link
              to={`/explore?tab=${entityType}`}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-default hover:bg-bg-elevated"
            >
              Browse {BROWSE_WORD[entityType]}
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const head: Head = {
    back: { fallback: `/explore?tab=${entityType}` },
    edit: canEdit ? (
      <Link
        to={editPath(RECORD_KIND[entityType], data.id)}
        className="inline-flex min-h-11 items-center text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
        data-admin-edit
      >
        Edit
      </Link>
    ) : undefined,
  };

  return (
    <PageContainer size="narrow">
      {/* The address says which kind of record this is; the shape checks only
          narrow the type. A response that gains a field can then never draw
          another kind's page. `data-entity-view` names the view for tests. */}
      <div className="contents" data-entity-view={entityType} data-entity-kind={KIND_LABEL[entityType]}>
        {entityType === 'companies' && isCompanyDetail(data) && <CompanyDetailView data={data} head={head} />}
        {entityType === 'factories' && isFactoryDetail(data) && <FactoryDetailView data={data} head={head} />}
        {entityType === 'occupations' && isOccupationDetail(data) && <OccupationDetailView data={data} head={head} />}
        {entityType === 'skills' && isSkillDetail(data) && <SkillDetailView data={data} head={head} />}
      </div>
    </PageContainer>
  );
}
