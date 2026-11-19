import { type SkillDetail } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { Heading, Section, CareerRows, More, PageLink } from './parts';

export default function SkillView({ skill }: { skill: SkillDetail }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  const careers = skill.occupations ?? [];
  const related = skill.relatedSkills ?? [];
  return (
    <>
      <Heading title={skill.name} subtitle={skill.category || undefined} />
      {skill.description && (
        <Section title="About">
          <p className="text-sm leading-relaxed text-fg-muted">{skill.description}</p>
        </Section>
      )}

      {careers.length > 0 && (
        <Section title="Careers that use it">
          <CareerRows careers={careers.map((occ) => ({ id: occ.id, title: occ.title }))} limit={5} />
          <More shown={Math.min(5, careers.length)} total={careers.length} noun="on the skill's page" />
        </Section>
      )}

      {related.length > 0 && (
        <Section title="Related skills">
          <div className="flex flex-wrap gap-1.5">
            {related.slice(0, 8).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectEntity('skill', s.id)}
                className="map-row inline-flex items-center rounded-md border border-border-strong px-2.5 text-xs text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default"
              >
                {s.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      <PageLink to={`/skills/${skill.id}`}>Skill page</PageLink>
    </>
  );
}
