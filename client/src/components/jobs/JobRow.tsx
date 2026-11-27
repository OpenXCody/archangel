import { Fragment } from 'react';
import { jobPath } from '@shared/jobs';
import type { CareerJob } from '../../lib/api';
import { jobRow, type JobListSays, type JobRowPart } from '../../lib/jobRow';
import { RecordRow } from '../layout/Page';

/**
 * The grey line of a job's row: the facts after its names, in the order the
 * rule gives them (`jobRow` in lib/jobRow.ts). The pay and the day are each
 * one piece: where the line wraps they go to the next line whole, never cut
 * at a dash. Null when there is nothing to say, so no row is left with an
 * empty line.
 */
export function jobRowLine(facts: JobRowPart[]) {
  if (facts.length === 0) return null;
  return facts.map((part, index) => (
    <Fragment key={part.kind}>
      {index > 0 && ' · '}
      {part.kind === 'pay' || part.kind === 'day' ? <span className="whitespace-nowrap">{part.text}</span> : part.text}
    </Fragment>
  ));
}

/**
 * A job as a row of a record list (a career's, a company's, a factory's, a
 * skill's and an industry's page, the other jobs on a job's own page).
 * `said` is what the list's heading and its page have already said of every
 * job in it (`jobRow` in lib/jobRow.ts is the one rule): the first line is a
 * job's name, always; the opening's own name is the next line where the first
 * is the standard name; then the facts the heading has not said.
 */
export function JobRecordRow({ job, said }: { job: CareerJob; said?: JobListSays }) {
  const { head, second, facts } = jobRow(job, said);
  return (
    <RecordRow
      to={jobPath(job)}
      // An opening's own name can be a sentence: two lines of it at most, as where it stands under the standard name.
      title={head.kind === 'own' ? <span className="line-clamp-2">{head.text}</span> : head.text}
      second={second ?? undefined}
      subtitle={jobRowLine(facts) ?? undefined}
      whole
      data-job-head={head.kind}
    />
  );
}
