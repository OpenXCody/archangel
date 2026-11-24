import { type SkillDetail } from '../../../lib/api';
import { levelName } from '../../../lib/stages';
import { useMapStore } from '../../../stores/mapStore';
import { Heading, Section, CareerRows, More, PageLinks, CHIP } from './parts';

export default function SkillView({ skill }: { skill: SkillDetail }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  const careers = skill.occupations ?? [];
  const related = skill.relatedSkills ?? [];
  return (
    <>
      {/* "Hand measurement tools · Fundamentals" */}
      <Heading title={skill.name} subtitle={[skill.group?.name, levelName(skill.level)].filter(Boolean).join(' · ') || undefined} />
      {/* The way on, at the top, named for where it goes. */}
      <PageLinks links={[{ to: `/skills/${skill.id}`, label: 'Skill page' }]} />
      {skill.description && (
        <Section title="About">
          <p className="text-[15px] leading-relaxed text-text-2">{skill.description}</p>
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
                className={CHIP}
              >
                {s.name}
              </button>
            ))}
          </div>
        </Section>
      )}

    </>
  );
}
