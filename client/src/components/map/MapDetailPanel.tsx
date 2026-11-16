import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  ChevronUp,
  ChevronDown,
  Factory,
  Building2,
  Briefcase,
  Wrench,
  MapPin,
  Users,
  TrendingUp,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Tag,
  MapPinned,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  factoriesApi,
  companiesApi,
  occupationsApi,
  skillsApi,
  type FactoryDetail,
  type CompanyDetail,
  type OccupationDetail,
  type SkillDetail,
  type StateOverview,
  type AreaOverview,
  type RegionOverview,
  mapApi,
} from '../../lib/api';
import { useMapStore, type MapEntityType } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import CompanyLogo from '../CompanyLogo';
import { PANEL_WIDTH_PX, SHEET_PEEK_VH } from './camera';

// Body shared by the state panel and the focus-area panel: big totals up
// top, then top companies and top industries. Top companies are clickable —
// selectEntity navigates into the company detail view inside this same panel.
function RegionOverviewBody({ data }: { data: RegionOverview }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  const totals = [
    { label: 'Factories', value: data.totalFactories.toLocaleString() },
    { label: 'Companies', value: data.totalCompanies.toLocaleString() },
    // Shown only when there is a number: an empty tile says nothing.
    ...(data.totalWorkforce > 0 ? [{ label: 'Workforce', value: data.totalWorkforce.toLocaleString() }] : []),
  ];
  return (
    <>
      <div className={cn('grid gap-2 mb-6', totals.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {totals.map((total) => (
          <div key={total.label} className="min-w-0 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-fg-muted">{total.label}</div>
            <div className="text-lg font-semibold text-fg-default mt-0.5 truncate">{total.value}</div>
          </div>
        ))}
      </div>

      {data.topCompanies.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Top Companies</h3>
          <div className="space-y-0.5">
            {data.topCompanies.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => selectEntity('company', c.id)}
                title={`${c.count.toLocaleString()} ${c.count === 1 ? 'factory' : 'factories'} here, ${c.sites.toLocaleString()} nationwide`}
                className="w-full group flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 rounded-md hover:bg-white/[0.05] transition-colors text-left"
              >
                <CompanyLogo name={formatCompanyName(c.name)} domain={c.domain} size={28} />
                <span className="min-w-0 flex-1 truncate text-fg-default">{formatCompanyName(c.name)}</span>
                <span className="flex items-center gap-1 flex-shrink-0 text-fg-muted text-xs tabular-nums">
                  {c.count.toLocaleString()}
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.topIndustries.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Top Industries</h3>
          <div className="space-y-1">
            {data.topIndustries.map((ind, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1">
                <span className="text-fg-muted truncate">{ind.label}</span>
                <span className="text-fg-muted text-xs ml-2 flex-shrink-0 tabular-nums">{ind.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Panel body for a selected state.
function StateView({ data }: { data: StateOverview }) {
  const name = US_STATES.find(s => s.code === data.code)?.name ?? data.code;
  return (
    <>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-fg-default tracking-tight">{name}</h2>
        <p className="text-sm text-fg-muted mt-0.5">State overview</p>
      </div>
      <RegionOverviewBody data={data} />
    </>
  );
}

// Panel body for a selected focus area: the same overview, for the region
// inside the geofence.
function AreaView({ data }: { data: AreaOverview }) {
  return (
    <>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-fg-default tracking-tight">{data.name}</h2>
        <p className="text-sm text-fg-muted mt-0.5">{data.description}</p>
      </div>
      <RegionOverviewBody data={data} />
    </>
  );
}

interface MapDetailPanelProps {
  isMobile?: boolean;
}

// Entity icon and color configuration
const entityConfig: Record<MapEntityType, { icon: typeof Factory; color: string; bgColor: string; label: string }> = {
  factory: { icon: Factory, color: 'text-sky-400', bgColor: 'bg-sky-400/10', label: 'Factory' },
  company: { icon: Building2, color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: 'Company' },
  occupation: { icon: Briefcase, color: 'text-violet-400', bgColor: 'bg-violet-400/10', label: 'Career' },
  skill: { icon: Wrench, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', label: 'Skill' },
  state: { icon: MapPin, color: 'text-slate-300', bgColor: 'bg-slate-500/10', label: 'State' },
  area: { icon: MapPinned, color: 'text-sky-200', bgColor: 'bg-sky-300/10', label: 'Focus area' },
};

// Connected node link component
function ConnectedNode({
  type,
  id,
  name,
  subtitle,
  count,
  lat,
  lng,
}: {
  type: MapEntityType;
  id?: string;
  name: string;
  subtitle?: string;
  count?: number;
  lat?: number;
  lng?: number;
}) {
  const { selectEntity, selectFactory, flyTo, setHoveredFactory } = useMapStore();
  const config = entityConfig[type];
  const Icon = config.icon;

  const handleClick = () => {
    if (id) {
      // For factories, use selectFactory and fly to location if available
      if (type === 'factory') {
        selectFactory(id);
        // If we have coordinates, ask the camera to go there
        if (lat && lng) flyTo({ kind: 'point', lat, lng, zoom: 10 });
      } else {
        selectEntity(type, id);
      }
    }
  };

  // Highlight factory on map when hovering over list item
  const handleMouseEnter = () => {
    if (type === 'factory' && id) {
      setHoveredFactory(id);
    }
  };

  const handleMouseLeave = () => {
    if (type === 'factory') {
      setHoveredFactory(null);
    }
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={!id}
      className={`
        flex items-center justify-between p-3 w-full text-left
        bg-bg-elevated border border-white/10 rounded-lg
        ${id ? 'hover:bg-white/[0.05] hover:border-white/20 cursor-pointer' : 'opacity-60 cursor-default'}
        transition-all group
      `}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${config.color}`} />
        <div>
          {subtitle && <div className="text-xs text-fg-muted">{subtitle}</div>}
          <div className="text-sm font-medium text-fg-default group-hover:text-white">
            {type === 'factory' ? formatFactoryName(name) : type === 'company' ? formatCompanyName(name) : name}
          </div>
        </div>
      </div>
      {count !== undefined ? (
        <span className="px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-fg-muted">
          {count}
        </span>
      ) : id ? (
        <ChevronRight className="w-4 h-4 text-fg-muted group-hover:text-fg-default" />
      ) : null}
    </button>
  );
}

// Factory View Component
function FactoryView({ factory }: { factory: FactoryDetail }) {
  return (
    <>
      {/* Factory Name & Industry */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-fg-default mb-1">{formatFactoryName(factory.name)}</h2>
        <p className="text-sm text-fg-muted">
          {factory.specialization || factory.company?.industry || 'Manufacturing'}
        </p>
      </div>

      {/* Stats Grid - mobile-optimized with better spacing */}
      <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-6">
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Workforce</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {factory.workforceSize?.toLocaleString() || '—'}
          </div>
        </div>
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Open Positions</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {factory.openPositions?.toLocaleString() || '—'}
          </div>
        </div>
      </div>

      {/* Connected to */}
      <div className="mb-6">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
          Connected to
        </h3>
        <div className="space-y-2">
          {factory.company && (
            <ConnectedNode
              type="company"
              id={factory.company.id}
              name={factory.company.name}
              subtitle="Parent Company"
            />
          )}

          {/* Show first 3 occupations */}
          {factory.occupations?.slice(0, 3).map((occ) => (
            <ConnectedNode
              key={occ.id}
              type="occupation"
              id={occ.id}
              name={occ.title}
              subtitle={occ.headcount ? `${occ.headcount.toLocaleString()} workers` : undefined}
            />
          ))}

          {factory.occupations && factory.occupations.length > 3 && (
            <div className="text-xs text-fg-muted text-center py-2">
              +{factory.occupations.length - 3} more careers
            </div>
          )}
        </div>
      </div>

      {/* Specialization */}
      {factory.specialization && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Specialization
          </h3>
          <p className="text-sm text-fg-muted">{factory.specialization}</p>
        </div>
      )}

      {/* Description */}
      {factory.description && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Description
          </h3>
          <p className="text-sm text-fg-muted leading-relaxed">{factory.description}</p>
        </div>
      )}

      {/* Location */}
      {factory.latitude && factory.longitude && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Location
          </h3>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <MapPin className="w-4 h-4" />
            <span className="font-mono">
              {parseFloat(factory.latitude).toFixed(2)}°, {parseFloat(factory.longitude).toFixed(2)}°
            </span>
            {factory.state && <span className="text-fg-muted">• {factory.state}</span>}
          </div>
        </div>
      )}
    </>
  );
}

// Company View Component
function CompanyView({ company }: { company: CompanyDetail }) {
  const { setFilters, flyTo, resetView } = useMapStore();
  const totalWorkforce = company.factories?.reduce((sum, f) => sum + (f.workforceSize || 0), 0) || 0;

  const showAllFactories = () => {
    if (!company.factories?.length) return;

    // Set filter to show only this company's factories. Also clear any
    // lingering state filter (a user can arrive here via
    // state → top-company → "locate all" and we'd otherwise scope to
    // state × company instead of everything we cover for the company).
    setFilters({ company: company.id, companyName: formatCompanyName(company.name), states: [] });

    // Frame every factory we have coordinates for. The camera works out
    // zoom and how much room the panel or sheet needs.
    const points = company.factories
      .filter((f) => f.latitude && f.longitude)
      .map((f): [number, number] => [parseFloat(f.longitude!), parseFloat(f.latitude!)]);

    if (points.length === 0) {
      resetView();
      return;
    }
    flyTo({ kind: 'points', points });
  };

  return (
    <>
      {/* Company Name & Industry */}
      <div className="mb-6 flex items-start gap-3">
        <CompanyLogo name={formatCompanyName(company.name)} domain={company.domain} size={44} className="rounded-lg" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-fg-default mb-1">{formatCompanyName(company.name)}</h2>
          <p className="text-sm text-fg-muted">{company.industry || 'Manufacturing'}</p>
        </div>
      </div>

      {/* Stats Grid - mobile-optimized */}
      <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-6">
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Factory className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Factories</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {company.factories?.length || 0}
          </div>
        </div>
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Total Workforce</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {totalWorkforce.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Show All Factories Button */}
      {company.factories && company.factories.length > 0 && (
        <button
          onClick={showAllFactories}
          className="w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sky-400/10 border border-sky-400/20 text-sky-400 hover:bg-sky-400/20 transition-colors"
        >
          <Factory className="w-4 h-4" />
          Locate All Factories
        </button>
      )}

      {/* Connected Factories */}
      <div className="mb-6">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
          Factories ({company.factories?.length || 0})
        </h3>
        <div className="space-y-2">
          {company.factories?.slice(0, 5).map((factory) => (
            <ConnectedNode
              key={factory.id}
              type="factory"
              id={factory.id}
              name={factory.name}
              subtitle={factory.state || undefined}
              lat={factory.latitude ? parseFloat(factory.latitude) : undefined}
              lng={factory.longitude ? parseFloat(factory.longitude) : undefined}
            />
          ))}
          {company.factories && company.factories.length > 5 && (
            <div className="text-xs text-fg-muted text-center py-2">
              +{company.factories.length - 5} more factories
            </div>
          )}
        </div>
      </div>

      {/* Industries */}
      {company.industries && company.industries.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Industries
          </h3>
          <div className="flex flex-wrap gap-2">
            {company.industries.map((ind) => (
              <span
                key={ind.id}
                className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                {ind.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {company.description && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Description
          </h3>
          <p className="text-sm text-fg-muted leading-relaxed">{company.description}</p>
        </div>
      )}
    </>
  );
}

// Occupation View Component
function OccupationView({ occupation }: { occupation: OccupationDetail }) {
  return (
    <>
      {/* Occupation Title */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-fg-default mb-1">{occupation.title}</h2>
        {occupation.onetCode && (
          <p className="text-sm text-fg-muted font-mono">O*NET: {occupation.onetCode}</p>
        )}
      </div>

      {/* Stats Grid - mobile-optimized */}
      <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-6">
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Factory className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Factories</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {occupation.factories?.length || 0}
          </div>
        </div>
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Wrench className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Skills</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {occupation.skills?.length || 0}
          </div>
        </div>
      </div>

      {/* Skills */}
      {occupation.skills && occupation.skills.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
            Required Skills
          </h3>
          <div className="space-y-2">
            {occupation.skills.slice(0, 5).map((skill) => (
              <ConnectedNode
                key={skill.id}
                type="skill"
                id={skill.id}
                name={skill.name}
                subtitle={skill.category || undefined}
              />
            ))}
            {occupation.skills.length > 5 && (
              <div className="text-xs text-fg-muted text-center py-2">
                +{occupation.skills.length - 5} more skills
              </div>
            )}
          </div>
        </div>
      )}

      {/* Factories with this occupation */}
      {occupation.factories && occupation.factories.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
            Hiring Factories
          </h3>
          <div className="space-y-2">
            {occupation.factories.slice(0, 3).map((factory) => (
              <ConnectedNode
                key={factory.id}
                type="factory"
                id={factory.id}
                name={factory.name}
                subtitle={factory.headcount ? `${factory.headcount.toLocaleString()} positions` : factory.state || undefined}
                lat={factory.latitude ? parseFloat(factory.latitude) : undefined}
                lng={factory.longitude ? parseFloat(factory.longitude) : undefined}
              />
            ))}
            {occupation.factories.length > 3 && (
              <div className="text-xs text-fg-muted text-center py-2">
                +{occupation.factories.length - 3} more factories
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {occupation.description && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Description
          </h3>
          <p className="text-sm text-fg-muted leading-relaxed">{occupation.description}</p>
        </div>
      )}
    </>
  );
}

// Skill View Component
function SkillView({ skill }: { skill: SkillDetail }) {
  return (
    <>
      {/* Skill Name */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-fg-default mb-1">{skill.name}</h2>
        {skill.category && (
          <div className="flex items-center gap-2 mt-2">
            <Tag className="w-4 h-4 text-fg-muted" />
            <span className="text-sm text-fg-muted">{skill.category}</span>
          </div>
        )}
      </div>

      {/* Stats - mobile-optimized */}
      <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-6">
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Briefcase className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Careers</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {skill.occupations?.length || 0}
          </div>
        </div>
        <div className="bg-bg-elevated border border-white/10 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 md:gap-2 text-fg-muted mb-1">
            <Wrench className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[10px] md:text-xs">Related Skills</span>
          </div>
          <div className="text-xl md:text-2xl font-semibold text-fg-default">
            {skill.relatedSkills?.length || 0}
          </div>
        </div>
      </div>

      {/* Occupations using this skill */}
      {skill.occupations && skill.occupations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
            Used in Careers
          </h3>
          <div className="space-y-2">
            {skill.occupations.slice(0, 5).map((occ) => (
              <ConnectedNode
                key={occ.id}
                type="occupation"
                id={occ.id}
                name={occ.title}
                subtitle={occ.importance ? `${occ.importance.replace('_', ' ')}` : undefined}
              />
            ))}
            {skill.occupations.length > 5 && (
              <div className="text-xs text-fg-muted text-center py-2">
                +{skill.occupations.length - 5} more careers
              </div>
            )}
          </div>
        </div>
      )}

      {/* Related Skills */}
      {skill.relatedSkills && skill.relatedSkills.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
            Related Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {skill.relatedSkills.slice(0, 8).map((s) => (
              <button
                key={s.id}
                onClick={() => useMapStore.getState().selectEntity('skill', s.id)}
                className="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                {s.name}
              </button>
            ))}
            {skill.relatedSkills.length > 8 && (
              <span className="px-2 py-1 text-xs text-fg-muted">
                +{skill.relatedSkills.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {skill.description && (
        <div className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
            Description
          </h3>
          <p className="text-sm text-fg-muted leading-relaxed">{skill.description}</p>
        </div>
      )}
    </>
  );
}

export default function MapDetailPanel({ isMobile = false }: MapDetailPanelProps) {
  // Phone sheet: peek (SHEET_PEEK_VH) or expanded (85vh). The handle and the chevron both toggle it.
  const [expanded, setExpanded] = useState(false);
  const {
    selectedEntityType,
    selectedEntityId,
    setSidebarOpen,
    goBack,
    canGoBack,
  } = useMapStore();

  // Fetch entity details based on type
  const { data: factory, isLoading: factoryLoading } = useQuery<FactoryDetail>({
    queryKey: ['factory', selectedEntityId],
    queryFn: () => factoriesApi.get(selectedEntityId!),
    enabled: selectedEntityType === 'factory' && !!selectedEntityId,
  });

  const { data: company, isLoading: companyLoading } = useQuery<CompanyDetail>({
    queryKey: ['company', selectedEntityId],
    queryFn: () => companiesApi.get(selectedEntityId!),
    enabled: selectedEntityType === 'company' && !!selectedEntityId,
  });

  const { data: occupation, isLoading: occupationLoading } = useQuery<OccupationDetail>({
    queryKey: ['occupation', selectedEntityId],
    queryFn: () => occupationsApi.get(selectedEntityId!),
    enabled: selectedEntityType === 'occupation' && !!selectedEntityId,
  });

  const { data: skill, isLoading: skillLoading } = useQuery<SkillDetail>({
    queryKey: ['skill', selectedEntityId],
    queryFn: () => skillsApi.get(selectedEntityId!),
    enabled: selectedEntityType === 'skill' && !!selectedEntityId,
  });

  const { data: stateOverview, isLoading: stateLoading } = useQuery<StateOverview>({
    queryKey: ['state-overview', selectedEntityId],
    queryFn: () => mapApi.stateOverview(selectedEntityId as string),
    enabled: selectedEntityType === 'state' && !!selectedEntityId,
  });

  const { data: areaOverview, isLoading: areaLoading } = useQuery<AreaOverview>({
    queryKey: ['area-overview', selectedEntityId],
    queryFn: () => mapApi.areaOverview(selectedEntityId as string),
    enabled: selectedEntityType === 'area' && !!selectedEntityId,
  });

  const isLoading =
    factoryLoading || companyLoading || occupationLoading || skillLoading || stateLoading || areaLoading;
  const hasData = factory || company || occupation || skill || stateOverview || areaOverview;

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSidebarOpen]);

  const config = selectedEntityType ? entityConfig[selectedEntityType] : null;
  const Icon = config?.icon || Factory;

  // Size comes from camera.ts, which frames the map around this panel: one
  // source for both, so the camera can never disagree with what is on screen.
  const panelClasses = isMobile
    ? 'fixed inset-x-0 bottom-0 rounded-t-2xl z-50 animate-in slide-in-from-bottom duration-300 transition-[height]'
    : 'absolute top-0 right-0 h-full z-50 animate-in slide-in-from-right duration-300';
  const panelSize = isMobile
    ? { height: expanded ? '85vh' : `${SHEET_PEEK_VH}vh` }
    : { width: PANEL_WIDTH_PX };

  return (
    <aside
      className={`
        ${panelClasses}
        bg-bg-surface
        ${isMobile ? 'border-t' : 'border-l'} border-border-subtle
        flex flex-col
        overflow-hidden
      `}
      style={panelSize}
      role="complementary"
      aria-label={`${config?.label || 'Entity'} details`}
    >
      {isMobile && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
          className="absolute left-1/2 top-1.5 z-10 -translate-x-1/2 rounded-full px-6 py-2"
        >
          <span className="block h-1.5 w-12 rounded-full bg-white/30" />
        </button>
      )}
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border-subtle">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          {canGoBack() && (
            <button
              onClick={goBack}
              className="p-1.5 rounded-lg hover:bg-white/10 text-fg-muted hover:text-fg-default transition-colors flex-shrink-0"
              aria-label="Go back"
              title="Go back"
            >
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          )}
          <div className={`p-1.5 md:p-2 rounded-lg flex-shrink-0 ${config?.bgColor || 'bg-sky-400/10'}`}>
            <Icon className={`w-4 h-4 md:w-5 md:h-5 ${config?.color || 'text-sky-400'}`} />
          </div>
          <span className="px-2 py-0.5 text-[10px] md:text-xs font-medium rounded-full bg-white/5 border border-white/10 text-fg-muted truncate">
            {config?.label || 'Entity'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isMobile && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-fg-muted hover:text-fg-default transition-colors"
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
            </button>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-fg-muted hover:text-fg-default transition-colors"
            aria-label="Close details"
            title="Close"
          >
            <X className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
          </div>
        ) : !hasData ? (
          <div className="text-center py-12">
            <p className="text-fg-muted">Failed to load details</p>
            <button
              onClick={() => setSidebarOpen(false)}
              className="mt-4 text-sm text-sky-400 hover:underline"
            >
              Close panel
            </button>
          </div>
        ) : (
          <>
            {selectedEntityType === 'factory' && factory && <FactoryView factory={factory} />}
            {selectedEntityType === 'company' && company && <CompanyView company={company} />}
            {selectedEntityType === 'occupation' && occupation && <OccupationView occupation={occupation} />}
            {selectedEntityType === 'skill' && skill && <SkillView skill={skill} />}
            {selectedEntityType === 'state' && stateOverview && <StateView data={stateOverview} />}
            {selectedEntityType === 'area' && areaOverview && <AreaView data={areaOverview} />}
          </>
        )}
      </div>
    </aside>
  );
}
