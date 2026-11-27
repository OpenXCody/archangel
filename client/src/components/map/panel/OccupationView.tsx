import { Factory, Wrench } from 'lucide-react';
import { type OccupationDetail } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { stateName } from '../../../lib/places';
import { formatFactoryName } from '@shared/displayName';
import { shownIndustry } from '@shared/industry';
import { LEVEL_NAME } from '../../../lib/stages';
import { Heading, Section, RowList, NodeRow, More, JobRows, PageLinks, CHIP } from './parts';

export default function OccupationView({ occupation }: { occupation: OccupationDetail }) {
  const { selectState, selectEntity, selectFactory, flyTo, setHoveredFactory } = useMapStore();
  const skills = occupation.skills ?? [];
  // How many of the career's skills are at each level.
  const levels = [1, 2, 3].map((level) => skills.filter((skill) => skill.level === level).length);
  // Said for a career that has a path, as its page lays one out.
  const hasLevels = Boolean(occupation.pathStatus) && levels.some((n) => n > 0);
  const industries = occupation.industries ?? [];
  const states = occupation.topStates ?? [];
  const plants = occupation.factories ?? [];
  const jobs = occupation.jobs ?? [];
  return (
    <>
      {/* What is this */}
      <Heading title={occupation.title} subtitle={occupation.description || undefined} />
      {/* The way on, at the top, named for where it goes. */}
      <PageLinks links={[{ to: `/occupations/${occupation.id}`, label: 'Career page' }]} />

      {/* Where the work is done: by industry, since few factories list their careers. */}
      {(industries.length > 0 || occupation.everywhere) && (
        <Section title="Where this work is done" column={occupation.everywhere ? undefined : 'Factories'}>
          {occupation.everywhere ? (
            <p className="text-[15px] text-text-2">Factories of every industry.</p>
          ) : (
            <RowList>
              {industries.map((industry) => (
                <div key={industry.name} className="-mx-4 flex items-baseline justify-between gap-3 border-b border-line px-4 py-1.5 last:border-b-0">
                  <span className="min-w-0 truncate text-[15px] text-text-1">{shownIndustry(industry.name) ?? industry.name}</span>
                  {industry.factoryCount > 0 && (
                    <span className="shrink-0 text-[13px] tabular-nums text-text-3">{industry.factoryCount.toLocaleString()}</span>
                  )}
                </div>
              ))}
            </RowList>
          )}
          {occupation.elsewhereToo && <p className="mt-2 text-[13px] text-text-3">And factories of every other industry.</p>}
          {!occupation.everywhere && industries.length > 0 && (
            <p className="mt-2 text-[13px] text-text-3">Factories in these industries are lit on the map.</p>
          )}
          {states.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[13px] text-text-2">States with the most of these factories</p>
              <div className="flex flex-wrap gap-1.5">
                {states.map((state) => (
                  <button
                    key={state.code}
                    type="button"
                    onClick={() => selectState(state.code)}
                    title={`${state.factoryCount.toLocaleString()} factories in these industries`}
                    className={`${CHIP} font-medium`}
                  >
                    {stateName(state.code)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Factories that record this career */}
      {plants.length > 0 && (
        <Section title="Factories that list this career">
          <RowList>
            {plants.slice(0, 3).map((plant) => (
              <NodeRow
                key={plant.id}
                icon={Factory}
                title={formatFactoryName(plant.name)}
                subtitle={[
                  plant.headcount ? `${plant.headcount.toLocaleString()} ${plant.headcount === 1 ? 'person' : 'people'}` : null,
                  plant.state ? stateName(plant.state) : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined}
                onPress={() => {
                  selectFactory(plant.id);
                  if (plant.latitude && plant.longitude) {
                    flyTo({ kind: 'point', lat: parseFloat(plant.latitude), lng: parseFloat(plant.longitude), zoom: 10 });
                  }
                }}
                onHover={(over) => setHoveredFactory(over ? plant.id : null)}
              />
            ))}
          </RowList>
          <More shown={Math.min(3, plants.length)} total={plants.length} noun="on the career's page" />
        </Section>
      )}

      {/* What the work takes */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={3} said={{ career: true }} />
          <More shown={Math.min(3, jobs.length)} total={occupation.openJobCount ?? jobs.length} noun="on the career's page" />
        </Section>
      )}
      {skills.length > 0 && (
        <Section title="Skills">
          {hasLevels && (
            <p className="mb-2 text-[13px] tabular-nums text-text-3">
              {`${LEVEL_NAME[1]} `}
              {levels[0]}
              {` · ${LEVEL_NAME[2]} `}
              {levels[1]}
              {` · ${LEVEL_NAME[3]} `}
              {levels[2]}
            </p>
          )}
          <RowList>
            {skills.slice(0, 5).map((skill) => (
              <NodeRow
                key={skill.id}
                icon={Wrench}
                title={skill.name}
                subtitle={skill.group?.name}
                onPress={() => selectEntity('skill', skill.id)}
              />
            ))}
          </RowList>
          <More shown={Math.min(5, skills.length)} total={skills.length} noun="on the career's page" />
        </Section>
      )}

    </>
  );
}
