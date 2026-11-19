import { useState } from 'react';
import { Link } from 'react-router-dom';
import SkillStatusButton from '../account/SkillStatusButton';
import { type SkillDetail } from '../../lib/api';
import {
  DetailFacts,
  DetailHeader,
  DetailSection,
  RecordList,
  RecordRow,
  ShowAll,
} from '../layout/Page';
import { LEVELS, levelName } from '../../lib/stages';
import { SkillHeldToggle } from '../account/SkillStatusButton';
import { ErrorNote } from '../account/parts';
import { SkillGroupBox } from '../path/SkillGroupBox';
import type { SkillMarks } from '../path/model';
import { useSkillMarks } from '../path/useSkillMarks';
import { CAREERS_SHOWN, type Head, factLinkClass, IndustryRows, OpenJobsSection } from './parts';
import SkillMakes from './SkillMakes';

/** The careers that use a skill: the first few, and the rest on request. A skill sits at its own level in each. */
function SkillCareers({ careers }: { careers: SkillDetail['occupations'] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? careers : careers.slice(0, CAREERS_SHOWN);
  return (
    <div className="min-w-0" data-skill-careers>
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
 * A skill's group, with this skill among the others: the group's frame, its
 * skills as tags under their levels, the person's marks on each and how much
 * of the group they hold. This skill's tag is the one that is not a link.
 */
function SkillGroup({ data, marks }: { data: SkillDetail; marks: SkillMarks | null }) {
  // The response lists the others; this skill takes its place at its own level.
  const all = [...(data.groupSkills ?? []), { id: data.id, name: data.name, level: data.level }];
  const parts = LEVELS.map((level) => ({ label: level.name, skills: all.filter((skill) => skill.level === level.id) })).filter(
    (part) => part.skills.length > 0
  );
  return (
    <SkillGroupBox
      name={data.group.name}
      skills={parts.flatMap((part) => part.skills)}
      // One level says nothing the heading has not said.
      parts={parts.length > 1 ? parts : undefined}
      marks={marks}
      currentId={data.id}
    />
  );
}

/**
 * A skill's page: what it is (the heading, with its domain, group and level,
 * then its group: the skills it stands among, then its makes), how it is
 * learned and what it is done with, the industries it is used in, open jobs that ask for it, the
 * careers that use it, and the skills that go with it. A part with nothing
 * to say is not drawn.
 */
export default function SkillDetailView({ data, head }: { data: SkillDetail; head: Head }) {
  const careers = data.occupations ?? [];
  const tools = data.tools ?? [];
  const industries = data.industries ?? [];
  const jobs = data.jobs ?? [];
  const { marks, error: markError } = useSkillMarks();
  return (
    <>
      <DetailHeader {...head} kind="Skill" title={data.name} description={data.description} action={<SkillStatusButton skillId={data.id} />}>
        {/* The domain and the group each open the skills list narrowed to it; the level is the skill's own. */}
        {data.group && data.domain && (
          <DetailFacts>
            <Link to={`/explore?tab=skills&domain=${data.domain.slug}`} className={factLinkClass} data-skill-domain>
              {data.domain.name}
            </Link>
            {' · '}
            <Link to={`/explore?tab=skills&domain=${data.domain.slug}&group=${data.group.slug}`} className={factLinkClass} data-skill-group>
              {data.group.name}
            </Link>
            {levelName(data.level) && (
              <>
                {' · '}
                <span data-skill-level>{levelName(data.level)}</span>
              </>
            )}
          </DetailFacts>
        )}
      </DetailHeader>

      {/* What it is, first of all: one of a group. Alone in its group there is nothing to show. */}
      {data.group && (data.groupSkills?.length ?? 0) > 0 && (
        <DetailSection id="group" title="Group">
          {marks && <ErrorNote error={markError} className="mb-3" />}
          <SkillGroup data={data} marks={marks} />
        </DetailSection>
      )}

      {/* Beyond the skill: the makes of equipment and software it is run on. */}
      <SkillMakes skillId={data.id} makes={data.makes ?? []} />

      {(data.howLearned || tools.length > 0) && (
        <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {data.howLearned && (
            <DetailSection id="learned" title="How it is learned">
              <p className="text-[15px] leading-relaxed text-text-2" data-skill-learned>
                {data.howLearned}
              </p>
            </DetailSection>
          )}
          {tools.length > 0 && (
            <DetailSection id="tools" title="Done with">
              <ul className="space-y-1.5 text-[15px] text-text-2" data-skill-tools>
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
          {industries.length > 0 ? <IndustryRows industries={industries} /> : <p className="text-sm text-text-2">Plants of every industry.</p>}
        </DetailSection>
      )}

      {/* Like the other pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} total={data.openJobCount} all={`/jobs?skill=${data.id}`} />}

      {careers.length > 0 && (
        <DetailSection id="occupations" title="Careers that use it">
          <SkillCareers careers={careers} />
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
                // Its group is said only when it is another one: a row of the same words says nothing.
                subtitle={skill.group && skill.group.slug !== data.group?.slug ? skill.group.name : null}
                control={
                  marks ? (
                    <SkillHeldToggle label={skill.name} value={marks.statusOf(skill.id)} disabled={marks.pending} onChange={(next) => marks.mark(skill, next)} />
                  ) : undefined
                }
              />
            ))}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}
