import { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Factory, Briefcase, Wrench, ChevronRight, MapPin, Users, Boxes, GraduationCap, BookOpen, Clock } from 'lucide-react';
import type { Company, Factory as FactoryType, Occupation, Skill, Ref, School, Program, EntityType } from '../../lib/api';
import { companiesApi, factoriesApi, occupationsApi, skillsApi, refsApi, schoolsApi, programsApi } from '../../lib/api';

interface EntityCardProps {
  type: EntityType;
  data: Company | FactoryType | Occupation | Skill | Ref | School | Program;
}

const ENTITY_CONFIG: Record<
  Exclude<EntityType, 'persons'>,
  {
    icon: React.ElementType;
    iconClass: string;
    hoverBorder: string;
    borderAccent: string;
  }
> = {
  companies: {
    icon: Building2,
    iconClass: 'text-amber-500',
    hoverBorder: 'hover:border-amber-500/30',
    borderAccent: 'border-l-4 border-l-amber-500',
  },
  factories: {
    icon: Factory,
    iconClass: 'text-sky-400',
    hoverBorder: 'hover:border-sky-400/30',
    borderAccent: 'border-l-4 border-l-sky-400',
  },
  occupations: {
    icon: Briefcase,
    iconClass: 'text-violet-400',
    hoverBorder: 'hover:border-violet-400/30',
    borderAccent: 'border-l-4 border-l-violet-400',
  },
  skills: {
    icon: Wrench,
    iconClass: 'text-emerald-500',
    hoverBorder: 'hover:border-emerald-500/30',
    borderAccent: 'border-l-4 border-l-emerald-500',
  },
  refs: {
    icon: Boxes,
    iconClass: 'text-teal-500',
    hoverBorder: 'hover:border-teal-500/30',
    borderAccent: 'border-l-4 border-l-teal-500',
  },
  schools: {
    icon: GraduationCap,
    iconClass: 'text-indigo-500',
    hoverBorder: 'hover:border-indigo-500/30',
    borderAccent: 'border-l-4 border-l-indigo-500',
  },
  programs: {
    icon: BookOpen,
    iconClass: 'text-fuchsia-500',
    hoverBorder: 'hover:border-fuchsia-500/30',
    borderAccent: 'border-l-4 border-l-fuchsia-500',
  },
};

// Compact stat pill component
function StatPill({
  icon: Icon,
  value,
  label,
  colorClass
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  colorClass: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/5`}>
      <Icon className={`w-3 h-3 ${colorClass}`} />
      <span className="text-xs text-fg-default font-medium">{value}</span>
      <span className="text-xs text-fg-soft">{label}</span>
    </div>
  );
}

// Format large numbers compactly
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// Shared card props
interface CardProps {
  onMouseEnter?: () => void;
}

// Company Card - cleaner design with stats at bottom
function CompanyCard({ data, onMouseEnter }: { data: Company } & CardProps) {
  const Icon = ENTITY_CONFIG.companies.icon;

  return (
    <Link
      to={`/companies/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.companies.hoverBorder}
        ${ENTITY_CONFIG.companies.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header: Icon + Name */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.name}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* Industry */}
      {data.industry && (
        <p className="text-xs text-fg-muted mb-2 ml-9">{data.industry}</p>
      )}

      {/* Description - truncated */}
      {data.description && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.description}</p>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-2">
        {data.factoryCount !== undefined && data.factoryCount > 0 && (
          <StatPill
            icon={Factory}
            value={data.factoryCount}
            label={data.factoryCount === 1 ? 'factory' : 'factories'}
            colorClass="text-sky-400"
          />
        )}
        {data.totalWorkforce !== undefined && data.totalWorkforce > 0 && (
          <StatPill
            icon={Users}
            value={formatNumber(data.totalWorkforce)}
            label="employees"
            colorClass="text-fg-muted"
          />
        )}
      </div>
    </Link>
  );
}

// Factory Card
function FactoryCard({ data, onMouseEnter }: { data: FactoryType } & CardProps) {
  const Icon = ENTITY_CONFIG.factories.icon;

  return (
    <Link
      to={`/factories/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.factories.hoverBorder}
        ${ENTITY_CONFIG.factories.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-sky-400/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-sky-400" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.name}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* Location + Company */}
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-2 ml-9">
        {data.state && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {data.state}
          </span>
        )}
        {data.state && data.companyName && <span className="text-fg-soft">•</span>}
        {data.companyName && (
          <span className="truncate">{data.companyName}</span>
        )}
      </div>

      {/* Specialization */}
      {data.specialization && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.specialization}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {data.workforceSize != null && data.workforceSize > 0 && (
          <StatPill
            icon={Users}
            value={formatNumber(data.workforceSize)}
            label="employees"
            colorClass="text-fg-muted"
          />
        )}
        {data.occupationCount !== undefined && data.occupationCount > 0 && (
          <StatPill
            icon={Briefcase}
            value={data.occupationCount}
            label="roles"
            colorClass="text-violet-400"
          />
        )}
      </div>
    </Link>
  );
}

// Occupation Card
function OccupationCard({ data, onMouseEnter }: { data: Occupation } & CardProps) {
  const Icon = ENTITY_CONFIG.occupations.icon;

  return (
    <Link
      to={`/occupations/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.occupations.hoverBorder}
        ${ENTITY_CONFIG.occupations.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-violet-400/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-violet-400" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.title}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* O*NET Code */}
      {data.onetCode && (
        <p className="text-xs text-fg-soft font-mono mb-2 ml-9">O*NET: {data.onetCode}</p>
      )}

      {/* Description */}
      {data.description && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.description}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {data.skillCount !== undefined && data.skillCount > 0 && (
          <StatPill
            icon={Wrench}
            value={data.skillCount}
            label="skills"
            colorClass="text-emerald-500"
          />
        )}
        {data.factoryCount !== undefined && data.factoryCount > 0 && (
          <StatPill
            icon={Factory}
            value={data.factoryCount}
            label="factories"
            colorClass="text-sky-400"
          />
        )}
      </div>
    </Link>
  );
}

// Skill Card
function SkillCard({ data, onMouseEnter }: { data: Skill } & CardProps) {
  const Icon = ENTITY_CONFIG.skills.icon;

  return (
    <Link
      to={`/skills/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.skills.hoverBorder}
        ${ENTITY_CONFIG.skills.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.name}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* Category */}
      {data.category && (
        <p className="text-xs text-fg-muted mb-2 ml-9">{data.category}</p>
      )}

      {/* Description */}
      {data.description && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.description}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {data.occupationCount !== undefined && data.occupationCount > 0 && (
          <StatPill
            icon={Briefcase}
            value={data.occupationCount}
            label="occupations"
            colorClass="text-violet-400"
          />
        )}
      </div>
    </Link>
  );
}

// Ref Card (Elements: materials, machines, standards, processes, certifications)
function RefCard({ data, onMouseEnter }: { data: Ref } & CardProps) {
  const Icon = ENTITY_CONFIG.refs.icon;

  // Format ref type for display
  const typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1);

  return (
    <Link
      to={`/refs/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.refs.hoverBorder}
        ${ENTITY_CONFIG.refs.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-teal-500/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-teal-500" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.name}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* Type badge + Manufacturer */}
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-2 ml-9">
        <span className="px-1.5 py-0.5 bg-teal-500/10 text-teal-400 rounded text-[10px] uppercase font-medium">
          {typeLabel}
        </span>
        {data.manufacturer && (
          <>
            <span className="text-fg-soft">•</span>
            <span className="truncate">{data.manufacturer}</span>
          </>
        )}
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.description}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {data.skillCount !== undefined && data.skillCount > 0 && (
          <StatPill
            icon={Wrench}
            value={data.skillCount}
            label="skills"
            colorClass="text-emerald-500"
          />
        )}
      </div>
    </Link>
  );
}

// School Card
function SchoolCard({ data, onMouseEnter }: { data: School } & CardProps) {
  const Icon = ENTITY_CONFIG.schools.icon;

  return (
    <Link
      to={`/schools/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.schools.hoverBorder}
        ${ENTITY_CONFIG.schools.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.name}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* Location + Type */}
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-2 ml-9">
        {data.state && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {data.state}
          </span>
        )}
        {data.state && data.schoolType && <span className="text-fg-soft">•</span>}
        {data.schoolType && (
          <span className="truncate">{data.schoolType}</span>
        )}
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.description}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {data.programCount !== undefined && data.programCount > 0 && (
          <StatPill
            icon={BookOpen}
            value={data.programCount}
            label="programs"
            colorClass="text-fuchsia-500"
          />
        )}
      </div>
    </Link>
  );
}

// Program Card
function ProgramCard({ data, onMouseEnter }: { data: Program } & CardProps) {
  const Icon = ENTITY_CONFIG.programs.icon;

  return (
    <Link
      to={`/programs/${data.id}`}
      onMouseEnter={onMouseEnter}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.programs.hoverBorder}
        ${ENTITY_CONFIG.programs.borderAccent}
        transition-all duration-200
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-fuchsia-500/10 flex-shrink-0">
            <Icon className="w-4 h-4 text-fuchsia-500" />
          </div>
          <h3 className="font-medium text-fg-default truncate group-hover:text-white">
            {data.title}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
      </div>

      {/* School + Credential */}
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-2 ml-9">
        {data.schoolName && (
          <span className="truncate">{data.schoolName}</span>
        )}
        {data.schoolName && data.credentialType && <span className="text-fg-soft">•</span>}
        {data.credentialType && (
          <span className="px-1.5 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 rounded text-[10px] uppercase font-medium">
            {data.credentialType}
          </span>
        )}
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-sm text-fg-soft line-clamp-2 mb-3">{data.description}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {data.durationHours != null && data.durationHours > 0 && (
          <StatPill
            icon={Clock}
            value={data.durationHours}
            label="hours"
            colorClass="text-fg-muted"
          />
        )}
        {data.skillCount !== undefined && data.skillCount > 0 && (
          <StatPill
            icon={Wrench}
            value={data.skillCount}
            label="skills"
            colorClass="text-emerald-500"
          />
        )}
      </div>
    </Link>
  );
}

// Main EntityCard - routes to appropriate card type with prefetch on hover
function EntityCardInner({ type, data }: EntityCardProps) {
  const queryClient = useQueryClient();

  // Prefetch entity detail on hover for instant navigation
  // Query keys must match EntityDetail.tsx: [entityType, id] where entityType is plural
  const handleMouseEnter = useCallback(() => {
    const id = data.id;

    // Use switch for proper TypeScript type inference
    switch (type) {
      case 'companies':
        queryClient.prefetchQuery({
          queryKey: ['companies', id],
          queryFn: () => companiesApi.get(id),
          staleTime: 60000,
        });
        break;
      case 'factories':
        queryClient.prefetchQuery({
          queryKey: ['factories', id],
          queryFn: () => factoriesApi.get(id),
          staleTime: 60000,
        });
        break;
      case 'occupations':
        queryClient.prefetchQuery({
          queryKey: ['occupations', id],
          queryFn: () => occupationsApi.get(id),
          staleTime: 60000,
        });
        break;
      case 'skills':
        queryClient.prefetchQuery({
          queryKey: ['skills', id],
          queryFn: () => skillsApi.get(id),
          staleTime: 60000,
        });
        break;
      case 'refs':
        queryClient.prefetchQuery({
          queryKey: ['refs', id],
          queryFn: () => refsApi.get(id),
          staleTime: 60000,
        });
        break;
      case 'schools':
        queryClient.prefetchQuery({
          queryKey: ['schools', id],
          queryFn: () => schoolsApi.get(id),
          staleTime: 60000,
        });
        break;
      case 'programs':
        queryClient.prefetchQuery({
          queryKey: ['programs', id],
          queryFn: () => programsApi.get(id),
          staleTime: 60000,
        });
        break;
    }
  }, [queryClient, type, data.id]);

  const cardProps = { onMouseEnter: handleMouseEnter };

  switch (type) {
    case 'companies':
      return <CompanyCard data={data as Company} {...cardProps} />;
    case 'factories':
      return <FactoryCard data={data as FactoryType} {...cardProps} />;
    case 'occupations':
      return <OccupationCard data={data as Occupation} {...cardProps} />;
    case 'skills':
      return <SkillCard data={data as Skill} {...cardProps} />;
    case 'refs':
      return <RefCard data={data as Ref} {...cardProps} />;
    case 'schools':
      return <SchoolCard data={data as School} {...cardProps} />;
    case 'programs':
      return <ProgramCard data={data as Program} {...cardProps} />;
    default:
      return null;
  }
}

// Memoized export - only re-renders when type or data.id changes
const EntityCard = memo(EntityCardInner, (prev, next) =>
  prev.type === next.type && prev.data.id === next.data.id
);

export default EntityCard;
