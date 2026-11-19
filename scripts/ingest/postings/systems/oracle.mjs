// Oracle Recruiting Cloud: a list in pages of 100, then one request per
// posting for its text. `board` is "<host>/<site number>"
// (efds.fa.em5.oraclecloud.com/CX_1).
import { distinct, isoTime, shape, words } from './shared.mjs';

export const name = 'Oracle Recruiting';
export const how = 'One request per 100 postings for the list, then one per kept posting that is new or changed.';
export const pace = 1500;

const PAGE = 100;
const MOST_PAGES = 100;

function parts(board) {
  const [host, site] = String(board).split('/');
  return { host, site };
}

const api = (host) => `https://${host}/hcmRestApi/resources/latest`;

export function feed(board, offset = 0) {
  const { host, site } = parts(board);
  return `${api(host)}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations` +
    `&finder=findReqs;siteNumber=${site},limit=${PAGE},offset=${offset},sortBy=POSTING_DATES_DESC`;
}

export async function list(board, { get }) {
  const { host, site } = parts(board);
  const out = [];
  const seen = new Set();
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const url = feed(board, page * PAGE);
    const { json } = await get(url);
    const search = json?.items?.[0];
    shape(search && Array.isArray(search.requisitionList), 'no list of requisitions', url);
    for (const job of search.requisitionList) {
      shape(job && job.Id !== undefined && typeof job.Title === 'string', 'a requisition with no id or title', url);
      const id = String(job.Id);
      if (seen.has(id)) continue;
      seen.add(id);
      const locations = distinct([job.PrimaryLocation, ...(job.secondaryLocations ?? []).map((place) => place?.Name)]);
      out.push({
        id,
        title: job.Title.trim(),
        location: locations[0] ?? null,
        locations,
        address: null,
        department: words(job.JobFamily) ?? words(job.JobFunction),
        url: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${encodeURIComponent(id)}`,
        postedAt: isoTime(job.PostedDate),
        updatedAt: null,
        country: words(job.PrimaryLocationCountry)?.toUpperCase() ?? null,
        text: null,
        hints: words(job.JobShift) ? { shift: words(job.JobShift) } : {},
      });
    }
    const total = Number(search.TotalJobsCount ?? 0);
    if (search.requisitionList.length === 0 || out.length >= total) return out;
  }
  shape(false, `more than ${MOST_PAGES} pages`, feed(board));
  return out;
}

export async function text(board, listed, { get }) {
  const { host, site } = parts(board);
  const url = `${api(host)}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${encodeURIComponent(listed.id)}%22,siteNumber=${site}`;
  const { json } = await get(url, { missingIsFine: true });
  const job = json?.items?.[0];
  shape(job && typeof job.Title === 'string', 'no requisition in the detail', url);
  const type = /full/i.test(job.JobSchedule ?? '') ? 'full-time' : /part/i.test(job.JobSchedule ?? '') ? 'part-time' : null;
  return {
    text: [job.ExternalDescriptionStr, job.ExternalResponsibilitiesStr, job.ExternalQualificationsStr].filter(Boolean).join('\n'),
    department: words(job.Category) ?? listed.department,
    hints: { ...listed.hints, ...(words(job.JobShift) ? { shift: words(job.JobShift) } : {}), ...(type ? { employmentType: type } : {}) },
  };
}
