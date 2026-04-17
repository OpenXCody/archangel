import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Building2,
  Factory,
  Briefcase,
  Wrench,
  MapPin,
  ChevronRight,
  Boxes,
  GraduationCap,
  BookOpen,
  Clock,
} from 'lucide-react';
import {
  companiesApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  refsApi,
  schoolsApi,
  programsApi,
  type EntityType,
  type CompanyDetail,
  type FactoryDetail,
  type OccupationDetail,
  type SkillDetail,
  type RefDetail,
  type SchoolDetail,
  type ProgramDetail,
} from '../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';

// Entity type configs - monochrome with entity accent colors only on icons
const ENTITY_CONFIG: Record<
  Exclude<EntityType, 'persons'>,
  {
    icon: React.ElementType;
    label: string;
    badgeClass: string;
    iconClass: string;
    borderClass: string;
  }
> = {
  companies: {
    icon: Building2,
    label: 'Company',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-amber-500',
    borderClass: 'border-white/10',
  },
  factories: {
    icon: Factory,
    label: 'Factory',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-sky-400',
    borderClass: 'border-white/10',
  },
  occupations: {
    icon: Briefcase,
    label: 'Occupation',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-violet-400',
    borderClass: 'border-white/10',
  },
  skills: {
    icon: Wrench,
    label: 'Skill',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-emerald-500',
    borderClass: 'border-white/10',
  },
  refs: {
    icon: Boxes,
    label: 'Element',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-teal-500',
    borderClass: 'border-white/10',
  },
  schools: {
    icon: GraduationCap,
    label: 'School',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-indigo-500',
    borderClass: 'border-white/10',
  },
  programs: {
    icon: BookOpen,
    label: 'Program',
    badgeClass: 'bg-white/5 text-fg-muted border-white/10',
    iconClass: 'text-fuchsia-500',
    borderClass: 'border-white/10',
  },
};

function getEntityType(pathname: string): Exclude<EntityType, 'persons'> {
  if (pathname.includes('/companies')) return 'companies';
  if (pathname.includes('/factories')) return 'factories';
  if (pathname.includes('/occupations')) return 'occupations';
  if (pathname.includes('/skills')) return 'skills';
  if (pathname.includes('/refs')) return 'refs';
  if (pathname.includes('/schools')) return 'schools';
  if (pathname.includes('/programs')) return 'programs';
  return 'companies';
}

// Section component for related entities
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-fg-soft uppercase tracking-wider mb-4 flex items-center gap-2">
        {title}
        {count !== undefined && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-fg-muted border border-white/10">
            {count}
          </span>
        )}
      </h2>
      {children}
    </div>
  );
}

// Clickable pill for filtering - navigates to explore with filter
function FilterPill({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="
        inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm
        bg-white/5 border border-white/10 text-fg-muted
        transition-colors hover:bg-white/10 hover:text-fg-default
      "
    >
      {children}
      <ChevronRight className="w-3 h-3" />
    </Link>
  );
}

// Mini card for related entities - glass morphism style
function RelatedCard({
  to,
  icon: Icon,
  iconClass,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ElementType;
  iconClass: string;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <Link
      to={to}
      className="
        group flex items-start gap-3 p-3
        bg-white/[0.02] backdrop-blur-sm
        border border-white/10 rounded-lg
        hover:bg-white/[0.05] hover:border-white/20
        transition-all duration-200
      "
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-fg-default truncate block group-hover:text-white">
          {title}
        </span>
        {subtitle && <p className="text-sm text-fg-soft truncate">{subtitle}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
    </Link>
  );
}

// Company Detail View
function CompanyDetailView({ data }: { data: CompanyDetail }) {
  // Only show industry once, prefer industries array over legacy field
  const industryToShow = data.industries?.length > 0 ? null : data.industry;

  return (
    <>
      {/* Industry badges - clicking filters Companies tab */}
      {(industryToShow || data.industries?.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {industryToShow && (
            <FilterPill to={`/explore?tab=companies&industry=${encodeURIComponent(industryToShow)}`}>
              {industryToShow}
            </FilterPill>
          )}
          {data.industries?.map((ind) => (
            <FilterPill
              key={ind.id}
              to={`/explore?tab=companies&industry=${encodeURIComponent(ind.name)}`}
            >
              {ind.name}
            </FilterPill>
          ))}
        </div>
      )}

      {/* Stats - only show factory count as that's the real relationship */}
      {(data.factoryCount || 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
            <div className="text-2xl font-semibold text-fg-default">{data.factoryCount}</div>
            <div className="text-sm text-fg-muted">Factories</div>
          </div>
        </div>
      )}

      {/* Factories section */}
      {data.factories?.length > 0 && (
        <Section title="Factories" count={data.factories.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.factories.map((factory) => (
              <RelatedCard
                key={factory.id}
                to={`/factories/${factory.id}`}
                icon={Factory}
                iconClass="text-sky-400"
                title={formatFactoryName(factory.name)}
                subtitle={factory.state ? `${factory.specialization || ''} ${factory.specialization ? '·' : ''} ${factory.state}`.trim() : factory.specialization}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Factory Detail View
function FactoryDetailView({ data }: { data: FactoryDetail }) {
  return (
    <>
      {/* Parent company link */}
      {data.company && (
        <Link
          to={`/companies/${data.company.id}`}
          className="
            inline-flex items-center gap-2 mt-4 px-4 py-2
            bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg
            text-fg-muted hover:bg-white/[0.05] hover:text-fg-default transition-colors
          "
        >
          <Building2 className="w-4 h-4 text-amber-500" />
          <span>{formatCompanyName(data.company.name)}</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}

      {/* Location - clicking filters Factories by state */}
      {data.state && (
        <div className="mt-4">
          <FilterPill to={`/explore?tab=factories&state=${encodeURIComponent(data.state)}`}>
            <MapPin className="w-3 h-3" />
            {data.state}
          </FilterPill>
        </div>
      )}

      {/* Stats - only occupation count (real relationship) */}
      {(data.occupations?.length || 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
            <div className="text-2xl font-semibold text-fg-default">{data.occupations?.length || 0}</div>
            <div className="text-sm text-fg-muted">Occupations</div>
          </div>
        </div>
      )}

      {/* Coordinates */}
      {data.latitude && data.longitude && (
        <div className="mt-4 text-sm text-fg-soft">
          <span className="font-mono">
            {parseFloat(data.latitude).toFixed(4)}°, {parseFloat(data.longitude).toFixed(4)}°
          </span>
        </div>
      )}

      {/* Occupations at this facility */}
      {data.occupations?.length > 0 && (
        <Section title="Occupations at this facility" count={data.occupations.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.occupations.map((occ) => (
              <RelatedCard
                key={occ.id}
                to={`/occupations/${occ.id}`}
                icon={Briefcase}
                iconClass="text-violet-400"
                title={occ.title}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Occupation Detail View
function OccupationDetailView({ data }: { data: OccupationDetail }) {
  return (
    <>
      {/* Stats - skill and factory counts (real relationships) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.skills?.length || 0}</div>
          <div className="text-sm text-fg-muted">Skills</div>
        </div>
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.factories?.length || 0}</div>
          <div className="text-sm text-fg-muted">Factories</div>
        </div>
      </div>

      {/* Skills - no importance badges */}
      {data.skills?.length > 0 && (
        <Section title="Skills" count={data.skills.length}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.skills.map((skill) => (
              <RelatedCard
                key={skill.id}
                to={`/skills/${skill.id}`}
                icon={Wrench}
                iconClass="text-emerald-500"
                title={skill.name}
                subtitle={skill.category}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Factories with this role */}
      {data.factories?.length > 0 && (
        <Section title="Factories with this role" count={data.factories.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.factories.map((factory) => (
              <RelatedCard
                key={factory.id}
                to={`/factories/${factory.id}`}
                icon={Factory}
                iconClass="text-sky-400"
                title={formatFactoryName(factory.name)}
                subtitle={factory.state}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Skill Detail View
function SkillDetailView({ data }: { data: SkillDetail }) {
  return (
    <>
      {/* Category badge - clicking filters Skills tab by category */}
      {data.category && (
        <div className="mt-4">
          <FilterPill to={`/explore?tab=skills&category=${encodeURIComponent(data.category)}`}>
            {data.category}
          </FilterPill>
        </div>
      )}

      {/* Stats - occupation and related skill counts (real relationships) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.occupations?.length || 0}</div>
          <div className="text-sm text-fg-muted">Occupations</div>
        </div>
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.relatedSkills?.length || 0}</div>
          <div className="text-sm text-fg-muted">Related Skills</div>
        </div>
      </div>

      {/* Occupations - no importance badges */}
      {data.occupations?.length > 0 && (
        <Section title="Occupations requiring this skill" count={data.occupations.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.occupations.map((occ) => (
              <RelatedCard
                key={occ.id}
                to={`/occupations/${occ.id}`}
                icon={Briefcase}
                iconClass="text-violet-400"
                title={occ.title}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Related Skills (same category) */}
      {data.relatedSkills?.length > 0 && (
        <Section title="Related Skills" count={data.relatedSkills.length}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.relatedSkills.map((skill) => (
              <RelatedCard
                key={skill.id}
                to={`/skills/${skill.id}`}
                icon={Wrench}
                iconClass="text-emerald-500"
                title={skill.name}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Ref Detail View (Elements: materials, machines, standards, processes, certifications)
function RefDetailView({ data }: { data: RefDetail }) {
  // Format ref type for display
  const typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1);

  return (
    <>
      {/* Type + Manufacturer badge */}
      <div className="flex flex-wrap gap-2 mt-4">
        <span className="px-2 py-1 rounded-full text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20">
          {typeLabel}
        </span>
        {data.manufacturer && (
          <span className="px-2 py-1 rounded-full text-xs bg-white/5 text-fg-muted border border-white/10">
            {data.manufacturer}
          </span>
        )}
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {data.tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 rounded text-xs bg-white/5 text-fg-soft">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.skills?.length || 0}</div>
          <div className="text-sm text-fg-muted">Skills</div>
        </div>
      </div>

      {/* Aliases */}
      {data.aliases?.length > 0 && (
        <Section title="Also known as" count={data.aliases.length}>
          <div className="flex flex-wrap gap-2">
            {data.aliases.map((alias) => (
              <span key={alias.id} className="px-3 py-1 rounded-full text-sm bg-white/5 text-fg-muted border border-white/10">
                {alias.aliasText}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Skills that reference this element */}
      {data.skills?.length > 0 && (
        <Section title="Referenced by skills" count={data.skills.length}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.skills.map((skill) => (
              <RelatedCard
                key={skill.id}
                to={`/skills/${skill.id}`}
                icon={Wrench}
                iconClass="text-emerald-500"
                title={skill.name}
                subtitle={skill.category}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// School Detail View
function SchoolDetailView({ data }: { data: SchoolDetail }) {
  return (
    <>
      {/* Location + Type */}
      <div className="flex flex-wrap gap-2 mt-4">
        {data.state && (
          <FilterPill to={`/explore?tab=schools&state=${encodeURIComponent(data.state)}`}>
            <MapPin className="w-3 h-3" />
            {data.state}
          </FilterPill>
        )}
        {data.schoolType && (
          <span className="px-2 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {data.schoolType}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.programs?.length || 0}</div>
          <div className="text-sm text-fg-muted">Programs</div>
        </div>
      </div>

      {/* Programs */}
      {data.programs?.length > 0 && (
        <Section title="Programs offered" count={data.programs.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.programs.map((program) => (
              <RelatedCard
                key={program.id}
                to={`/programs/${program.id}`}
                icon={BookOpen}
                iconClass="text-fuchsia-500"
                title={program.title}
                subtitle={program.credentialType ? `${program.credentialType} · ${program.skillCount} skills` : `${program.skillCount} skills`}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Program Detail View
function ProgramDetailView({ data }: { data: ProgramDetail }) {
  return (
    <>
      {/* Parent school link */}
      {data.school && (
        <Link
          to={`/schools/${data.school.id}`}
          className="
            inline-flex items-center gap-2 mt-4 px-4 py-2
            bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg
            text-fg-muted hover:bg-white/[0.05] hover:text-fg-default transition-colors
          "
        >
          <GraduationCap className="w-4 h-4 text-indigo-500" />
          <span>{data.school.name}</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}

      {/* Credential type + Duration */}
      <div className="flex flex-wrap gap-2 mt-4">
        {data.credentialType && (
          <span className="px-2 py-1 rounded-full text-xs bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
            {data.credentialType}
          </span>
        )}
        {data.durationHours && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/5 text-fg-muted border border-white/10">
            <Clock className="w-3 h-3" />
            {data.durationHours} hours
          </span>
        )}
        {data.cipCode && (
          <span className="px-2 py-1 rounded-full text-xs bg-white/5 text-fg-soft font-mono border border-white/10">
            CIP: {data.cipCode}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-lg p-4">
          <div className="text-2xl font-semibold text-fg-default">{data.skills?.length || 0}</div>
          <div className="text-sm text-fg-muted">Skills Taught</div>
        </div>
      </div>

      {/* Aliases */}
      {data.aliases?.length > 0 && (
        <Section title="Also known as" count={data.aliases.length}>
          <div className="flex flex-wrap gap-2">
            {data.aliases.map((alias) => (
              <span key={alias.id} className="px-3 py-1 rounded-full text-sm bg-white/5 text-fg-muted border border-white/10">
                {alias.aliasText}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Skills taught */}
      {data.skills?.length > 0 && (
        <Section title="Skills taught" count={data.skills.length}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.skills.map((skill) => (
              <RelatedCard
                key={skill.id}
                to={`/skills/${skill.id}`}
                icon={Wrench}
                iconClass="text-emerald-500"
                title={skill.name}
                subtitle={skill.category}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Helper to get API fetch function
function getEntityFetcher(entityType: Exclude<EntityType, 'persons'>, id: string) {
  switch (entityType) {
    case 'companies':
      return () => companiesApi.get(id);
    case 'factories':
      return () => factoriesApi.get(id);
    case 'occupations':
      return () => occupationsApi.get(id);
    case 'skills':
      return () => skillsApi.get(id);
    case 'refs':
      return () => refsApi.get(id);
    case 'schools':
      return () => schoolsApi.get(id);
    case 'programs':
      return () => programsApi.get(id);
  }
}

// Union type for all entity details
type AnyEntityDetail = CompanyDetail | FactoryDetail | OccupationDetail | SkillDetail | RefDetail | SchoolDetail | ProgramDetail;

// Type guard helpers
function isCompanyDetail(data: AnyEntityDetail): data is CompanyDetail {
  return 'factories' in data && 'industries' in data;
}

function isFactoryDetail(data: AnyEntityDetail): data is FactoryDetail {
  return 'company' in data && 'occupations' in data && 'latitude' in data;
}

function isOccupationDetail(data: AnyEntityDetail): data is OccupationDetail {
  return 'skills' in data && 'factories' in data && !('industries' in data) && !('school' in data);
}

function isSkillDetail(data: AnyEntityDetail): data is SkillDetail {
  return 'relatedSkills' in data;
}

function isRefDetail(data: AnyEntityDetail): data is RefDetail {
  return 'type' in data && 'manufacturer' in data && 'properties' in data;
}

function isSchoolDetail(data: AnyEntityDetail): data is SchoolDetail {
  return 'programs' in data && 'schoolType' in data;
}

function isProgramDetail(data: AnyEntityDetail): data is ProgramDetail {
  return 'school' in data && 'cipCode' in data;
}

// Main EntityDetail component
export default function EntityDetail() {
  const { id, type: routeType } = useParams<{ id: string; type?: string }>();
  const entityType = (routeType as Exclude<EntityType, 'persons'>) || getEntityType(window.location.pathname);

  const { data, isLoading, error } = useQuery<AnyEntityDetail>({
    queryKey: [entityType, id],
    queryFn: getEntityFetcher(entityType, id!),
    enabled: !!id,
  });

  const config = ENTITY_CONFIG[entityType];
  const Icon = config.icon;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg-default mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Explorer
        </Link>
        <div className="text-center py-20">
          <p className="text-fg-muted">Entity not found</p>
        </div>
      </div>
    );
  }

  // Get name and description based on entity type
  const rawName = 'title' in data ? data.title : 'name' in data ? data.name : '';
  const name = entityType === 'factories'
    ? formatFactoryName(rawName)
    : entityType === 'companies'
    ? formatCompanyName(rawName)
    : rawName;
  const description = 'description' in data ? data.description : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        to="/explore"
        className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg-default mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Explorer
      </Link>

      {/* Header - glass morphism card */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-white/[0.02] backdrop-blur-sm border border-white/10">
          <Icon className={`w-8 h-8 ${config.iconClass}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-fg-default">{name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${config.badgeClass}`}>
              {config.label}
            </span>
          </div>
          {description && <p className="text-fg-muted">{description}</p>}
        </div>
      </div>

      {/* Entity-specific content */}
      {isCompanyDetail(data) && <CompanyDetailView data={data} />}
      {isFactoryDetail(data) && <FactoryDetailView data={data} />}
      {isOccupationDetail(data) && <OccupationDetailView data={data} />}
      {isSkillDetail(data) && <SkillDetailView data={data} />}
      {isRefDetail(data) && <RefDetailView data={data} />}
      {isSchoolDetail(data) && <SchoolDetailView data={data} />}
      {isProgramDetail(data) && <ProgramDetailView data={data} />}
    </div>
  );
}
