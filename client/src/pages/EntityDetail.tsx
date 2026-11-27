import { useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from '../lib/account';
import { useViewer } from '../lib/viewer';
import { editPath, type RecordKind } from '../lib/records';
import { Loader2 } from 'lucide-react';
import {
  type EntityType,
  type CompanyDetail,
  type FactoryDetail,
  type OccupationDetail,
  type SkillDetail,
} from '../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { EmptyState, BackLink, PageContainer } from '../components/layout/Page';
import { secondaryActionClass } from '../components/layout/Panel';
import { cn } from '@/lib/utils';
import { recordQuery } from '../lib/queries';
import type { Head } from '../components/entity/parts';
import CompanyDetailView from '../components/entity/CompanyDetailView';
import FactoryDetailView from '../components/entity/FactoryDetailView';
import OccupationDetailView from '../components/entity/OccupationDetailView';
import CareerVersionView from '../components/entity/CareerVersionView';
import SkillDetailView from '../components/entity/SkillDetailView';

/** What each kind of record is called at the head of its page. */
const KIND_LABEL: Record<EntityType, string> = {
  companies: 'Company',
  factories: 'Factory',
  occupations: 'Career',
  skills: 'Skill',
};

/** What Admin Tools calls each kind of record, for the Edit link an admin sees. */
const RECORD_KIND: Record<EntityType, RecordKind> = {
  companies: 'company',
  factories: 'factory',
  occupations: 'career',
  skills: 'skill',
};

/** The kind of record a page shows is the first part of its address: /companies/:id, /factories/:id and so on. */
function getEntityType(pathname: string): EntityType {
  if (pathname.startsWith('/factories')) return 'factories';
  if (pathname.startsWith('/occupations')) return 'occupations';
  if (pathname.startsWith('/skills')) return 'skills';
  return 'companies';
}

// What a missing record is called, and the list to go to instead.
const NOT_LISTED: Record<EntityType, string> = {
  companies: 'company', factories: 'factory', occupations: 'career', skills: 'skill',
};
const BROWSE_WORD: Record<EntityType, string> = {
  companies: 'companies', factories: 'factories', occupations: 'careers', skills: 'skills',
};

// Union type for all entity details
type AnyEntityDetail = CompanyDetail | FactoryDetail | OccupationDetail | SkillDetail;

// Type guard helpers
function isCompanyDetail(data: AnyEntityDetail): data is CompanyDetail {
  // A career's response lists factories too: a company has no skills.
  return 'factories' in data && !('skills' in data);
}

function isFactoryDetail(data: AnyEntityDetail): data is FactoryDetail {
  return 'company' in data && 'occupations' in data && 'latitude' in data;
}

function isOccupationDetail(data: AnyEntityDetail): data is OccupationDetail {
  return 'skills' in data && 'factories' in data;
}

function isSkillDetail(data: AnyEntityDetail): data is SkillDetail {
  return 'relatedSkills' in data;
}

/**
 * The page of one company, factory, career or skill. The address says which
 * kind it is and that alone picks the view; each view is a file in
 * components/entity/.
 */
export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { pathname, hash, search } = useLocation();
  const entityType = getEntityType(pathname);
  // A career's page at a company (`?at=<company id or slug>`) is that company's version of the career.
  const at = entityType === 'occupations' ? new URLSearchParams(search).get('at') : null;

  const { data, isLoading, error } = useQuery<AnyEntityDetail>({
    ...recordQuery(entityType, id),
    enabled: !!id,
  });

  // The tab is named as the page's heading is: "Tesla Giga Texas · Archangel".
  useEffect(() => {
    const raw = data && ('name' in data ? data.name : 'title' in data ? data.title : null);
    // A company's version of a career names the tab itself, once it has been read.
    if (!raw || at) return;
    const shown = entityType === 'factories' ? formatFactoryName(raw) : entityType === 'companies' ? formatCompanyName(raw) : raw;
    document.title = `${shown} · Archangel`;
  }, [data, entityType, at]);

  // A company with a short name is shown under it: /companies/tesla.
  const navigate = useNavigate();
  const slug = data && entityType === 'companies' && 'slug' in data ? data.slug : null;
  useEffect(() => {
    if (slug && id !== slug) navigate(`/companies/${slug}${window.location.hash}`, { replace: true });
  }, [slug, id, navigate]);

  // A career's path is drawn as its route alone. An address from when it had views (`?path=route|atlas|flow`, and
  // `&domain=` for a domain opened on the atlas) is read as the route and loses those words; the rest is kept.
  const oldPathView = entityType === 'occupations' && /(?:^|[?&])(?:path|domain)=/.test(search);
  useEffect(() => {
    if (!oldPathView) return;
    const params = new URLSearchParams(search);
    params.delete('path');
    params.delete('domain');
    const rest = params.toString();
    navigate(`${pathname}${rest ? `?${rest}` : ''}${window.location.hash}`, { replace: true });
  }, [oldPathView, search, pathname, navigate]);

  // A factory that was merged into another is shown under the one kept: its old address leads there.
  const keptId = data && entityType === 'factories' && 'id' in data ? data.id : null;
  useEffect(() => {
    if (keptId && id && keptId !== id) navigate(`/factories/${keptId}${window.location.hash}`, { replace: true });
  }, [keptId, id, navigate]);

  // Cards deep-link to sections (#factories, #occupations, …); scroll once the data is on the page.
  useEffect(() => {
    if (!hash || !data) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, data]);

  // An admin corrects a record from its own page: Edit opens it in Admin Tools.
  const { data: viewer } = useAccount();
  // Not while the admin is looking at the product as someone else.
  const adminView = useViewer().admin;
  const canEdit = adminView && Boolean(viewer?.user?.isAdmin);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-text-2 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <PageContainer size="narrow">
        <div className="-mt-2">
          <BackLink fallback={`/explore?tab=${entityType}`} />
        </div>
        <EmptyState
          title={`This ${NOT_LISTED[entityType]} is not listed`}
          description="The link may be old, or the record was removed."
          action={
            <Link
              to={`/explore?tab=${entityType}`}
              className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-text-1 hover:bg-surface-hover"
            >
              Browse {BROWSE_WORD[entityType]}
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const head: Head = {
    back: { fallback: `/explore?tab=${entityType}` },
    edit: canEdit ? (
      <Link
        to={editPath(RECORD_KIND[entityType], data.id)}
        className={cn(secondaryActionClass, 'px-3 sm:h-9')}
        data-admin-edit
      >
        Edit
      </Link>
    ) : undefined,
  };

  return (
    // A career's page is wider from a laptop up (1120 px at most), every panel on it together, so its tree
    // of skills stands across with room for a skill opened at a reading measure; its sentences keep theirs.
    <PageContainer size="narrow" className={entityType === 'occupations' ? 'lg:max-w-[73rem]' : undefined}>
      {/* The address says which kind of record this is; the shape checks only
          narrow the type. A response that gains a field can then never draw
          another kind's page. `data-entity-view` names the view for tests. */}
      <div className="contents" data-entity-view={entityType} data-entity-kind={KIND_LABEL[entityType]}>
        {entityType === 'companies' && isCompanyDetail(data) && <CompanyDetailView data={data} head={head} />}
        {entityType === 'factories' && isFactoryDetail(data) && <FactoryDetailView data={data} head={head} />}
        {/* One career's view is one career's: keyed by it, so nothing a person opened on one career is drawn on the next. */}
        {entityType === 'occupations' && isOccupationDetail(data) && !at && <OccupationDetailView key={data.id} data={data} head={head} />}
        {entityType === 'occupations' && isOccupationDetail(data) && at && <CareerVersionView key={`${data.id}@${at}`} data={data} at={at} head={head} />}
        {entityType === 'skills' && isSkillDetail(data) && <SkillDetailView data={data} head={head} />}
      </div>
    </PageContainer>
  );
}
