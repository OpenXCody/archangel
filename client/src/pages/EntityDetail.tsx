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
import { recordQuery } from '../lib/queries';
import type { Head } from '../components/entity/parts';
import CompanyDetailView from '../components/entity/CompanyDetailView';
import FactoryDetailView from '../components/entity/FactoryDetailView';
import OccupationDetailView from '../components/entity/OccupationDetailView';
import SkillDetailView from '../components/entity/SkillDetailView';

/** What each kind of record is called at the head of its page. */
const KIND_LABEL: Record<EntityType, string> = {
  companies: 'Company',
  factories: 'Plant',
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
  companies: 'company', factories: 'plant', occupations: 'career', skills: 'skill',
};
const BROWSE_WORD: Record<EntityType, string> = {
  companies: 'companies', factories: 'plants', occupations: 'careers', skills: 'skills',
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
 * The page of one company, plant, career or skill. The address says which
 * kind it is and that alone picks the view; each view is a file in
 * components/entity/.
 */
export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { pathname, hash } = useLocation();
  const entityType = getEntityType(pathname);

  const { data, isLoading, error } = useQuery<AnyEntityDetail>({
    ...recordQuery(entityType, id),
    enabled: !!id,
  });

  // The tab is named as the page's heading is: "Tesla Giga Texas · Archangel".
  useEffect(() => {
    const raw = data && ('name' in data ? data.name : 'title' in data ? data.title : null);
    if (!raw) return;
    const shown = entityType === 'factories' ? formatFactoryName(raw) : entityType === 'companies' ? formatCompanyName(raw) : raw;
    document.title = `${shown} · Archangel`;
  }, [data, entityType]);

  // A company with a short name is shown under it: /companies/tesla.
  const navigate = useNavigate();
  const slug = data && entityType === 'companies' && 'slug' in data ? data.slug : null;
  useEffect(() => {
    if (slug && id !== slug) navigate(`/companies/${slug}${window.location.hash}`, { replace: true });
  }, [slug, id, navigate]);

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
        <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
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
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-default hover:bg-bg-elevated"
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
        className="inline-flex min-h-11 items-center text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
        data-admin-edit
      >
        Edit
      </Link>
    ) : undefined,
  };

  return (
    <PageContainer size="narrow">
      {/* The address says which kind of record this is; the shape checks only
          narrow the type. A response that gains a field can then never draw
          another kind's page. `data-entity-view` names the view for tests. */}
      <div className="contents" data-entity-view={entityType} data-entity-kind={KIND_LABEL[entityType]}>
        {entityType === 'companies' && isCompanyDetail(data) && <CompanyDetailView data={data} head={head} />}
        {entityType === 'factories' && isFactoryDetail(data) && <FactoryDetailView data={data} head={head} />}
        {entityType === 'occupations' && isOccupationDetail(data) && <OccupationDetailView data={data} head={head} />}
        {entityType === 'skills' && isSkillDetail(data) && <SkillDetailView data={data} head={head} />}
      </div>
    </PageContainer>
  );
}
