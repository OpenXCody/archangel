import { Link } from 'react-router-dom';
import { Building2, Factory, Briefcase, Wrench, ChevronRight, MapPin, Users } from 'lucide-react';
import type { Company, Factory as FactoryType, Occupation, Skill, EntityType } from '../../lib/api';

interface EntityCardProps {
  type: EntityType;
  data: Company | FactoryType | Occupation | Skill;
}

const ENTITY_CONFIG: Record<
  EntityType,
  {
    icon: React.ElementType;
    iconClass: string;
    hoverBorder: string;
  }
> = {
  companies: {
    icon: Building2,
    iconClass: 'text-amber-500',
    hoverBorder: 'hover:border-amber-500/30',
  },
  factories: {
    icon: Factory,
    iconClass: 'text-sky-400',
    hoverBorder: 'hover:border-sky-400/30',
  },
  occupations: {
    icon: Briefcase,
    iconClass: 'text-violet-400',
    hoverBorder: 'hover:border-violet-400/30',
  },
  skills: {
    icon: Wrench,
    iconClass: 'text-emerald-500',
    hoverBorder: 'hover:border-emerald-500/30',
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

// Company Card - cleaner design with stats at bottom
function CompanyCard({ data }: { data: Company }) {
  const Icon = ENTITY_CONFIG.companies.icon;

  return (
    <Link
      to={`/companies/${data.id}`}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.companies.hoverBorder}
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
function FactoryCard({ data }: { data: FactoryType }) {
  const Icon = ENTITY_CONFIG.factories.icon;

  return (
    <Link
      to={`/factories/${data.id}`}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.factories.hoverBorder}
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
function OccupationCard({ data }: { data: Occupation }) {
  const Icon = ENTITY_CONFIG.occupations.icon;

  return (
    <Link
      to={`/occupations/${data.id}`}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.occupations.hoverBorder}
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
function SkillCard({ data }: { data: Skill }) {
  const Icon = ENTITY_CONFIG.skills.icon;

  return (
    <Link
      to={`/skills/${data.id}`}
      className={`
        group block p-4
        bg-white/[0.02]
        border border-white/10 rounded-xl
        hover:bg-white/[0.04]
        ${ENTITY_CONFIG.skills.hoverBorder}
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

// Main EntityCard - routes to appropriate card type
export default function EntityCard({ type, data }: EntityCardProps) {
  switch (type) {
    case 'companies':
      return <CompanyCard data={data as Company} />;
    case 'factories':
      return <FactoryCard data={data as FactoryType} />;
    case 'occupations':
      return <OccupationCard data={data as Occupation} />;
    case 'skills':
      return <SkillCard data={data as Skill} />;
    default:
      return null;
  }
}
