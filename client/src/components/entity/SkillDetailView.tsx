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
import { levelName } from '../../lib/stages';
import { CAREERS_SHOWN, type Head, factLinkClass, IndustryRows, OpenJobsSection } from './parts';

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
 * A skill's page: what it is (the heading, with its domain, group and level),
 * how it is learned and what it is done with, the industries it is used in,
 * open jobs that ask for it, the careers that use it, and the skills that go
 * with it. A part with nothing to say is not drawn.
 */
export default function SkillDetailView({ data, head }: { data: SkillDetail; head: Head }) {
  const careers = data.occupations ?? [];
  const tools = data.tools ?? [];
  const industries = data.industries ?? [];
  const jobs = data.jobs ?? [];
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
              />
            ))}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}
