import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  INVITE_DAYS,
  INVITE_ROLES,
  inviteRoleLabel,
  useAdminInvites,
  useCreateInvite,
  useRevokeInvite,
  type AdminCompany,
  type CreatedInvite,
  type InviteRole,
} from '../../lib/account';
import { formatDate } from '../../lib/jobFormat';
import {
  CardNote,
  ErrorNote,
  Field,
  LoadError,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  textButtonClass,
} from '../account/parts';
import { PageSection } from '../layout/Page';
import CompanyPicker from './CompanyPicker';

const selectTriggerClass = 'h-[42px] rounded-lg border-border-strong bg-bg-elevated px-3 text-base text-fg-default shadow-none sm:text-sm';
const selectContentClass = 'max-w-[calc(100vw-2rem)] rounded-lg border-border-strong bg-bg-surface';

// The link of the last invite created exists nowhere else (only its hash is
// stored), so it is kept for as long as the page is open: looking at another
// tab and coming back must not lose it.
let lastCreated: CreatedInvite | null = null;

/** Invite a person by link: create, hand over the link, see what is pending. */
export default function InvitesTab() {
  const [created, setCreatedState] = useState<CreatedInvite | null>(lastCreated);
  const setCreated = (next: CreatedInvite | null) => {
    lastCreated = next;
    setCreatedState(next);
  };
  return (
    <>
      <PageSection title="New invite" description="No email is sent. The link is passed on by hand.">
        <InviteForm onCreated={setCreated} />
        {created && <InviteLink created={created} />}
      </PageSection>
      <PendingInvites
        onRevoked={(inviteId) => {
          if (created?.invite.id === inviteId) setCreated(null);
        }}
      />
    </>
  );
}

function InviteForm({ onCreated }: { onCreated: (created: CreatedInvite) => void }) {
  const create = useCreateInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('user');
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    create.reset();
    if (!email.trim()) return setProblem('Email required.');
    if (role === 'employer' && !company) return setProblem('Company required.');
    setProblem(null);
    create.mutate(
      { email: email.trim(), role, companyId: role === 'employer' ? company?.id : undefined },
      {
        onSuccess: (result) => {
          onCreated(result);
          setEmail('');
          setCompany(null);
          // Back to the ordinary role, so the next invite is not an admin's by accident.
          setRole('user');
        },
      }
    );
  };

  return (
    <form onSubmit={submit} noValidate className={cn(cardClass, 'p-4 sm:p-5')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Email" htmlFor="invite-email">
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
            <SelectTrigger id="invite-role" className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {INVITE_ROLES.map((value) => (
                <SelectItem key={value} value={value} className="py-2.5">
                  {inviteRoleLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {role === 'employer' && (
          <Field label="Company" htmlFor="invite-company" className="sm:col-span-2">
            <CompanyPicker id="invite-company" value={company} onChange={setCompany} disabled={create.isPending} />
          </Field>
        )}
      </div>
      <ErrorNote error={problem ?? create.error} className="mt-4" />
      <Button type="submit" disabled={create.isPending} className="mt-4 h-10 rounded-lg">
        {create.isPending && <Loader2 className="animate-spin" />}
        Create invite
      </Button>
    </form>
  );
}

/** The link of the invite just created. It cannot be shown again: only its hash is kept. */
function InviteLink({ created }: { created: CreatedInvite }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${created.path}`;

  useEffect(() => setCopied(false), [link]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard access (an insecure origin, or permission refused): select it for a manual copy.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div className={cn(cardClass, 'mt-3 p-4 sm:p-5')} data-invite-link>
      <Field
        label={`Invite link for ${created.invite.email}`}
        htmlFor="invite-link"
        hint={`${inviteRoleLabel(created.invite.role, created.invite.companyName)}. Shown once. Expires in ${INVITE_DAYS} days.`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            ref={inputRef}
            id="invite-link"
            type="text"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(fieldClass, 'min-w-0 font-mono text-sm')}
          />
          <Button type="button" variant="outline" onClick={() => void copy()} className={cn('h-[42px] min-w-[5.5rem]', outlineButtonClass)}>
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
      </Field>
    </div>
  );
}

function PendingInvites({ onRevoked }: { onRevoked: (inviteId: string) => void }) {
  const invites = useAdminInvites();
  const revoke = useRevokeInvite();

  return (
    <PageSection title="Pending">
      {invites.isPending ? (
        <RowsSkeleton rows={2} />
      ) : invites.isError ? (
        <LoadError error={invites.error} onRetry={() => void invites.refetch()} retrying={invites.isFetching} />
      ) : (
        <>
          {invites.data.invites.length === 0 ? (
            <CardNote>None.</CardNote>
          ) : (
            <ul className={cardClass}>
              {invites.data.invites.map((invite) => (
                <li
                  key={invite.id}
                  className={cn(rowClass, 'grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center')}
                  data-invite-email={invite.email}
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-fg-default">{invite.email}</p>
                    <p className="mt-0.5 break-words text-xs text-fg-muted">
                      {inviteRoleLabel(invite.role, invite.companyName)}
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      Created {formatDate(invite.createdAt)}
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      Expires {formatDate(invite.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(invite.id, { onSuccess: () => onRevoked(invite.id) })}
                    aria-label={`Revoke the invite for ${invite.email}`}
                    className={cn(textButtonClass, 'justify-self-start sm:justify-self-end')}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          {invites.data.accepted > 0 && (
            <p className="mt-3 text-xs tabular-nums text-fg-muted">Accepted: {invites.data.accepted.toLocaleString('en-US')}</p>
          )}
        </>
      )}
      <ErrorNote error={revoke.error} className="mt-2" />
    </PageSection>
  );
}
