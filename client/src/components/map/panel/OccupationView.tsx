import { Factory, Wrench } from 'lucide-react';
import { type OccupationDetail } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { stateName } from '../../../lib/places';
import { formatFactoryName } from '@shared/displayName';
import { shownIndustry } from '@shared/industry';
import { LEVEL_NAME } from '../../../lib/stages';
import { Heading, Section, RowList, NodeRow, More, JobRows, PageLink } from './parts';

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

      {/* Where the work is done: by industry, since few plants list their careers. */}
      {(industries.length > 0 || occupation.everywhere) && (
        <Section title="Where this work is done" column={occupation.everywhere ? undefined : 'Plants'}>
          {occupation.everywhere ? (
            <p className="text-sm text-fg-muted">Plants of every industry.</p>
          ) : (
            <div>
              {industries.map((industry) => (
                <div key={industry.name} className="flex items-baseline justify-between gap-3 py-1 text-sm">
                  <span className="min-w-0 truncate text-fg-default">{shownIndustry(industry.name) ?? industry.name}</span>
                  {industry.factoryCount > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">{industry.factoryCount.toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {occupation.elsewhereToo && <p className="mt-1 text-xs text-fg-soft">And plants of every other industry.</p>}
          {!occupation.everywhere && industries.length > 0 && (
            <p className="mt-2 text-xs text-fg-soft">Plants in these industries are lit on the map.</p>
          )}
          {states.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-fg-muted">States with the most of these plants</p>
              <div className="flex flex-wrap gap-1.5">
                {states.map((state) => (
                  <button
                    key={state.code}
                    type="button"
                    onClick={() => selectState(state.code)}
                    title={`${state.factoryCount.toLocaleString()} plants in these industries`}
                    className="map-row inline-flex items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default"
                  >
                    {stateName(state.code)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Plants that record this career */}
      {plants.length > 0 && (
        <Section title="Plants that list this career">
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
          <JobRows jobs={jobs} limit={3} />
          <More shown={Math.min(3, jobs.length)} total={occupation.openJobCount ?? jobs.length} noun="on the career's page" />
        </Section>
      )}
      {skills.length > 0 && (
        <Section title="Skills">
          {hasLevels && (
            <p className="mb-2 text-xs tabular-nums text-fg-muted">
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

      {/* Where next */}
      <PageLink to={`/occupations/${occupation.id}`}>Career page</PageLink>
    </>
  );
}
