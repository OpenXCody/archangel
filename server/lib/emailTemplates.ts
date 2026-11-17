import { appUrl, type EmailMessage } from './email.js';

/**
 * Every email the app sends, in one plain layout.
 *
 * The text version comes first and is complete on its own. The HTML version
 * is the same words in one narrow column: the reader's own font, no images,
 * and no colours but one for links, so a mail client draws it in its own
 * light or dark theme.
 *
 * Each email says in one line why the person got it. Notices (about
 * applications and company access) end with where to turn them off; sign-in
 * emails (an invite, a password reset) cannot be turned off and do not.
 */

interface Layout {
  kind: string;
  to: string;
  subject: string;
  /** Paragraphs, in order. */
  body: string[];
  /** The one thing to do next. */
  action: { label: string; url: string };
  /** Completes "You got this email because ...". */
  why: string;
  /** A notice can be turned off; a sign-in email cannot. */
  notice: boolean;
}

/** Where notice emails are turned off. */
function settingsUrl(): string {
  return appUrl('/me');
}

/** Text typed by a person, safe inside a subject or a sentence: one line, not too long. */
function oneLine(value: string, max = 120): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function footerLines({ why, notice }: Layout): string[] {
  const lines = [`You got this email because ${why}.`];
  if (notice) lines.push(`To stop emails about applications and access, turn them off on your account page: ${settingsUrl()}`);
  return lines;
}

function renderText(layout: Layout): string {
  return [
    ...layout.body,
    `${layout.action.label}:\n${layout.action.url}`,
    `--\n${footerLines(layout).join('\n')}\nArchangel · ${appUrl()}`,
  ].join('\n\n');
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function renderHtml(layout: Layout): string {
  const paragraph = (text: string) => `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`;
  const [why, off] = footerLines(layout);
  // The turn-off line ends with the address; in HTML the address is the link.
  const offHtml = off
    ? `<br>${escapeHtml(off.slice(0, off.lastIndexOf(': ') + 2))}<a href="${escapeHtml(settingsUrl())}">${escapeHtml(settingsUrl())}</a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(layout.subject)}</title>
<style>
:root { color-scheme: light dark; }
a { color: #1a62c7; }
.quiet { color: #6a6f76; }
@media (prefers-color-scheme: dark) {
  a { color: #8ab8f5; }
  .quiet { color: #a3a7ad; }
}
</style>
</head>
<body style="margin:0;padding:32px 20px;font-family:${FONT};font-size:16px;line-height:1.55">
<div style="max-width:520px;margin:0 auto">
${layout.body.map(paragraph).join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(layout.action.url)}" style="font-weight:600">${escapeHtml(layout.action.label)}</a></p>
<p class="quiet" style="margin:40px 0 0;font-size:13px;line-height:1.5">${escapeHtml(why)}${offHtml}<br>Archangel · <a href="${escapeHtml(appUrl())}">${escapeHtml(appUrl().replace(/^https?:\/\//, ''))}</a></p>
</div>
</body>
</html>
`;
}

function build(layout: Layout): EmailMessage {
  return { kind: layout.kind, to: layout.to, subject: layout.subject, text: renderText(layout), html: renderHtml(layout) };
}

// ---------------------------------------------------------------------------
// Sign-in emails: always sent when mail is on
// ---------------------------------------------------------------------------

export function inviteEmail(input: { to: string; role: 'user' | 'employer' | 'admin'; companyName: string | null; path: string; days: number }): EmailMessage {
  const what =
    input.role === 'employer' && input.companyName
      ? `You are invited to Archangel to post jobs for ${oneLine(input.companyName)} and read its applicants.`
      : input.role === 'admin'
        ? 'You are invited to Archangel as an admin.'
        : 'You are invited to Archangel, a map of US manufacturing: companies, factories, careers and the skills they take.';
  return build({
    kind: 'invite',
    to: input.to,
    subject: 'Your invite to Archangel',
    body: [what, `The link below creates your account. It works once and lasts ${input.days} days.`],
    action: { label: 'Create your account', url: appUrl(input.path) },
    why: `an Archangel admin invited ${input.to}`,
    notice: false,
  });
}

export function resetEmail(input: { to: string; path: string; hours: number; byAdmin: boolean }): EmailMessage {
  return build({
    kind: 'reset',
    to: input.to,
    subject: 'Your Archangel reset link',
    body: [
      `The link below sets a new password for ${input.to}. It works once and lasts ${input.hours} hours.`,
      input.byAdmin
        ? 'If you did not expect it, ignore this email. Your password stays as it is.'
        : 'If you did not ask for it, ignore this email. Your password stays as it is.',
    ],
    action: { label: 'Choose a new password', url: appUrl(input.path) },
    why: input.byAdmin
      ? 'an Archangel admin made a reset link for your account'
      : 'a password reset was asked for this address on Archangel',
    notice: false,
  });
}

// ---------------------------------------------------------------------------
// Notices: sent unless the person has turned them off
// ---------------------------------------------------------------------------

export function accessRequestedEmail(input: {
  to: string;
  requesterName: string;
  requesterEmail: string;
  companyName: string;
  /** True when the requester's address is at the company's own domain. */
  domainMatches: boolean | null;
}): EmailMessage {
  const company = oneLine(input.companyName);
  const body = [`${oneLine(input.requesterName, 80)} (${input.requesterEmail}) asked for access to post jobs for ${company}.`];
  if (input.domainMatches === true) body.push(`Their address is at ${company}'s own domain.`);
  if (input.domainMatches === false) body.push(`Their address is not at ${company}'s domain.`);
  return build({
    kind: 'access-requested',
    to: input.to,
    subject: `Access request for ${company}`,
    body,
    action: { label: 'Review the request', url: appUrl('/admin?tab=access') },
    why: 'you are an Archangel admin',
    notice: true,
  });
}

export function accessApprovedEmail(input: { to: string; companyName: string; requested: boolean }): EmailMessage {
  const company = oneLine(input.companyName);
  return build({
    kind: 'access-approved',
    to: input.to,
    subject: `You can now post jobs for ${company}`,
    body: [
      input.requested
        ? `Your request for access to ${company} was approved. You can post its jobs and read its applicants.`
        : `An admin gave you access to ${company}. You can post its jobs and read its applicants.`,
    ],
    action: { label: 'Open your employer page', url: appUrl('/employer') },
    why: input.requested ? `you asked for access to ${company} on Archangel` : `an Archangel admin added you to ${company}`,
    notice: true,
  });
}

export function accessDeclinedEmail(input: { to: string; companyName: string; askAgainOn: string }): EmailMessage {
  const company = oneLine(input.companyName);
  return build({
    kind: 'access-declined',
    to: input.to,
    subject: `Your request to join ${company} was declined`,
    body: [
      `An admin declined your request for access to ${company}. Nothing else about your account has changed.`,
      `You can ask again from ${input.askAgainOn}.`,
    ],
    action: { label: 'Open your employer page', url: appUrl('/employer') },
    why: `you asked for access to ${company} on Archangel`,
    notice: true,
  });
}

export function newApplicantEmail(input: {
  to: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  place: string | null;
  applicantName: string;
  heldRequired: number;
  totalRequired: number;
  /** Others who applied since the last email about this job. */
  others: number;
}): EmailMessage {
  const title = oneLine(input.jobTitle);
  const where = input.place ? `${title} (${oneLine(input.place, 80)})` : title;
  const skills =
    input.totalRequired > 0
      ? `They hold ${input.heldRequired} of the ${input.totalRequired} required skills, by their own account.`
      : 'The job lists no required skills.';
  const body = [`${oneLine(input.applicantName, 80)} applied for ${where}. ${skills}`];
  if (input.others > 0) {
    body.push(`${input.others} more ${input.others === 1 ? 'person has' : 'people have'} applied since the last email about this job.`);
  }
  return build({
    kind: 'new-applicant',
    to: input.to,
    subject: `New applicant for ${title}`,
    body,
    action: { label: 'See the applicants', url: appUrl(`/jobs/${input.jobId}`) },
    why: `you post jobs for ${oneLine(input.companyName)} on Archangel`,
    notice: true,
  });
}

const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  reviewing: 'Reviewing',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  declined: 'Declined',
};

export function stageChangedEmail(input: { to: string; jobTitle: string; companyName: string; status: string }): EmailMessage {
  const title = oneLine(input.jobTitle);
  const company = oneLine(input.companyName);
  const stage = STAGE_LABELS[input.status] ?? input.status;
  const contact = `${company} will contact you at this address.`;
  const body =
    input.status === 'declined'
      ? [`${company} declined your application for ${title}.`]
      : input.status === 'hired'
        ? [`${company} marked your application for ${title} as hired.`]
        : input.status === 'interview'
          ? [`${company} moved your application for ${title} to Interview.`, contact]
          : input.status === 'offer'
            ? [`${company} moved your application for ${title} to Offer.`, contact]
            : [`${company} moved your application for ${title} to ${stage}.`];
  return build({
    kind: 'stage-changed',
    to: input.to,
    subject: `Your application for ${title}: ${stage}`,
    body,
    action: { label: 'See your applications', url: appUrl('/me') },
    why: `you applied for ${title} at ${company} on Archangel`,
    notice: true,
  });
}
