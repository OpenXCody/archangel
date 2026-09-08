import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Factory, Briefcase, Wrench, ChevronRight, ChevronDown } from 'lucide-react';

// Mock data matching Boeing/Everett style from the reference
const MOCK_DATA = {
  companies: [
    {
      id: '1',
      name: 'Boeing',
      industry: 'Aerospace',
      factoryCount: 14,
      factories: [
        {
          id: 'f1',
          name: 'Everett Final Assembly',
          specialization: 'Commercial Aircraft Assembly',
          state: 'WA',
          occupationCount: 12,
          occupations: [
            {
              id: 'o1',
              title: 'Aircraft Assembler',
              onetCode: '51-2011.00',
              headcount: 8,
              skills: [
                { id: 's1', name: 'Composite layup', category: 'Technical' },
                { id: 's2', name: 'Torque fastening', category: 'Technical' },
                { id: 's3', name: 'Blueprint reading', category: 'Technical' },
                { id: 's4', name: 'Quality inspection', category: 'Technical' },
                { id: 's5', name: 'Sealant application', category: 'Technical' },
                { id: 's6', name: 'Safety protocols', category: 'Safety' },
                { id: 's7', name: 'Hand tools operation', category: 'Technical' },
              ],
            },
            {
              id: 'o2',
              title: 'CNC Machinist',
              onetCode: '51-4041.00',
              headcount: 5,
              skills: [
                { id: 's8', name: 'CNC programming', category: 'Technical' },
                { id: 's9', name: 'CAD/CAM software', category: 'Software' },
                { id: 's10', name: 'Precision measurement', category: 'Technical' },
                { id: 's11', name: 'Tool path optimization', category: 'Technical' },
                { id: 's12', name: 'Quality control', category: 'Technical' },
              ],
            },
            {
              id: 'o3',
              title: 'Avionics Technician',
              onetCode: '49-2091.00',
              headcount: 7,
              skills: [
                { id: 's13', name: 'Electronics troubleshooting', category: 'Technical' },
                { id: 's14', name: 'Wiring harness installation', category: 'Technical' },
                { id: 's15', name: 'System testing', category: 'Technical' },
              ],
            },
            {
              id: 'o4',
              title: 'Quality Inspector',
              onetCode: '51-9061.00',
              headcount: 12,
              skills: [
                { id: 's16', name: 'Non-destructive testing', category: 'Technical' },
                { id: 's17', name: 'Statistical process control', category: 'Technical' },
              ],
            },
            {
              id: 'o5',
              title: 'Production Supervisor',
              onetCode: '51-1011.00',
              headcount: 5,
              skills: [
                { id: 's18', name: 'Team leadership', category: 'Management' },
                { id: 's19', name: 'Production scheduling', category: 'Management' },
              ],
            },
            { id: 'o6', title: 'Welder', onetCode: '51-4121.00', headcount: 3, skills: [] },
          ],
        },
        {
          id: 'f2',
          name: 'Renton Factory',
          specialization: '737 Production',
          state: 'WA',
          occupationCount: 8,
          occupations: [],
        },
        {
          id: 'f3',
          name: 'Charleston Facility',
          specialization: '787 Components',
          state: 'SC',
          occupationCount: 6,
          occupations: [],
        },
        {
          id: 'f4',
          name: 'Seattle Parts Center',
          specialization: 'Parts Manufacturing',
          state: 'WA',
          occupationCount: 4,
          occupations: [],
        },
        {
          id: 'f5',
          name: 'Portland Composites',
          specialization: 'Composite Materials',
          state: 'OR',
          occupationCount: 5,
          occupations: [],
        },
        { id: 'f6', name: 'Spokane Wing Plant', specialization: 'Wing Assembly', state: 'WA', occupationCount: 7, occupations: [] },
      ],
    },
    {
      id: '2',
      name: 'Lockheed Martin',
      industry: 'Aerospace',
      factoryCount: 8,
      factories: [],
    },
    {
      id: '3',
      name: 'General Electric',
      industry: 'Industrial Manufacturing',
      factoryCount: 23,
      factories: [],
    },
  ],
};

type EntityCategory = 'companies' | 'factories' | 'occupations' | 'skills';

interface SkillNode {
  id: string;
  name: string;
  category: string | null;
}

interface OccupationNode {
  id: string;
  title: string;
  onetCode: string | null;
  headcount: number;
  skills: SkillNode[];
}

interface FactoryNode {
  id: string;
  name: string;
  specialization: string | null;
  state: string | null;
  occupationCount: number;
  occupations: OccupationNode[];
}

interface CompanyNode {
  id: string;
  name: string;
  industry: string | null;
  factoryCount: number;
  factories: FactoryNode[];
}

// Entity type badge component
function EntityBadge({ type }: { type: EntityCategory }) {
  const styles = {
    companies: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    factories: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    occupations: 'bg-blue-800/10 text-blue-400 border-blue-800/20',
    skills: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };

  const labels = {
    companies: 'COMPANY',
    factories: 'FACTORY',
    occupations: 'OCCUPATION',
    skills: 'SKILL',
  };

  return (
    <span
      className={`text-[9px] font-normal px-1.5 py-0.5 rounded-full border ${styles[type]}`}
      style={{ fontSize: '9px' }}
    >
      {labels[type]}
    </span>
  );
}

// Expandable node component
function ExpandableNode({
  children,
  count,
  isExpanded,
  onToggle,
  leftBarColor,
}: {
  children: React.ReactNode;
  count?: number;
  isExpanded: boolean;
  onToggle: () => void;
  leftBarColor: string;
}) {
  return (
    <div className={`border-l-2 ${leftBarColor} pl-4 ml-2`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg-default transition-colors py-1"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        {count !== undefined && <span className="text-xs">({count})</span>}
      </button>
      {isExpanded && <div className="mt-1 space-y-2">{children}</div>}
    </div>
  );
}

// Skill item component
function SkillItem({ skill }: { skill: SkillNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Wrench className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      <span className="text-sm text-fg-default">{skill.name}</span>
      <EntityBadge type="skills" />
      {skill.category && (
        <span className="text-xs text-fg-muted ml-auto">{skill.category}</span>
      )}
    </div>
  );
}

// Occupation item component
function OccupationItem({ occupation }: { occupation: OccupationNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleSkills = occupation.skills.slice(0, 5);
  const hasMore = occupation.skills.length > 5;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 py-1.5">
        <Briefcase className="w-3.5 h-3.5 text-blue-800 shrink-0" />
        <span className="text-sm text-fg-default">{occupation.title}</span>
        <EntityBadge type="occupations" />
        {occupation.headcount > 0 && (
          <span className="text-xs text-fg-muted ml-auto">{occupation.headcount} employees</span>
        )}
      </div>

      {occupation.skills.length > 0 && (
        <ExpandableNode
          count={occupation.skills.length}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          leftBarColor="border-emerald-500"
        >
          {visibleSkills.map((skill) => (
            <SkillItem key={skill.id} skill={skill} />
          ))}
          {hasMore && (
            <Link
              to={`/occupations/${occupation.id}`}
              className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg-default py-1 transition-colors"
            >
              View all {occupation.skills.length} skills
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </ExpandableNode>
      )}
    </div>
  );
}

// Factory item component
function FactoryItem({ factory }: { factory: FactoryNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleOccupations = factory.occupations.slice(0, 5);
  const hasMore = factory.occupations.length > 5;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 py-1.5">
        <Factory className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="text-sm text-fg-default">{factory.name}</span>
        <EntityBadge type="factories" />
        {factory.state && (
          <span className="text-xs text-fg-muted">{factory.state}</span>
        )}
        {factory.specialization && (
          <span className="text-xs text-fg-muted ml-auto truncate max-w-[200px]">
            {factory.specialization}
          </span>
        )}
      </div>

      {factory.occupationCount > 0 && (
        <ExpandableNode
          count={factory.occupationCount}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          leftBarColor="border-blue-800"
        >
          {visibleOccupations.map((occupation) => (
            <OccupationItem key={occupation.id} occupation={occupation} />
          ))}
          {hasMore && (
            <Link
              to={`/factories/${factory.id}`}
              className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg-default py-1 transition-colors"
            >
              View all {factory.occupationCount} occupations
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </ExpandableNode>
      )}
    </div>
  );
}

// Company item component
function CompanyItem({ company }: { company: CompanyNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleFactories = company.factories.slice(0, 5);
  const hasMore = company.factories.length > 5;

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-medium text-fg-default">{company.name}</span>
        <EntityBadge type="companies" />
        {company.industry && (
          <span className="text-xs text-fg-muted ml-auto">{company.industry}</span>
        )}
      </div>

      {company.factoryCount > 0 && (
        <ExpandableNode
          count={company.factoryCount}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          leftBarColor="border-blue-400"
        >
          {visibleFactories.map((factory) => (
            <FactoryItem key={factory.id} factory={factory} />
          ))}
          {hasMore && (
            <Link
              to={`/companies/${company.id}`}
              className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg-default py-1 transition-colors"
            >
              View all {company.factoryCount} factories
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </ExpandableNode>
      )}
    </div>
  );
}

export default function NodesV2() {
  const [activeCategory, setActiveCategory] = useState<EntityCategory>('companies');

  const categories = [
    { id: 'companies' as const, label: 'Companies', icon: Building2, count: MOCK_DATA.companies.length },
    { id: 'factories' as const, label: 'Factories', icon: Factory, count: 186 },
    { id: 'occupations' as const, label: 'Occupations', icon: Briefcase, count: 890 },
    { id: 'skills' as const, label: 'Skills', icon: Wrench, count: 640 },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-fg-default mb-2">Node Explorer v2</h1>
            <p className="text-fg-muted flex items-center gap-2">
              <span>Browse the knowledge graph</span>
              <span className="hidden md:inline-flex items-center gap-1">
                or press
                <kbd className="inline-flex items-center gap-0.5 px-2 py-1 bg-bg-surface border border-border-subtle rounded text-xs text-fg-soft">
                  <span className="text-[10px]">⌘</span>K
                </kbd>
                to search
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Category Navigation - 2 column grid, equal spacing */}
      <div className="mb-6">
        <div className="grid grid-cols-2 gap-3">
          {categories.map(({ id, label, icon: Icon, count }) => {
            const isActive = activeCategory === id;
            return (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                className={`
                  flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium
                  transition-colors
                  ${
                    isActive
                      ? 'bg-bg-elevated text-fg-default border-2 border-border-subtle'
                      : 'bg-bg-surface text-fg-muted hover:text-fg-default hover:bg-bg-elevated border-2 border-transparent'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </div>
                <span className="text-xs text-fg-muted">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeCategory === 'companies' && (
          <>
            {MOCK_DATA.companies.map((company) => (
              <CompanyItem key={company.id} company={company} />
            ))}
          </>
        )}
        {activeCategory === 'factories' && (
          <div className="text-center py-20 text-fg-muted">
            <Factory className="w-12 h-12 mx-auto mb-3 text-fg-soft" />
            <p>Factory view coming soon</p>
          </div>
        )}
        {activeCategory === 'occupations' && (
          <div className="text-center py-20 text-fg-muted">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-fg-soft" />
            <p>Occupation view coming soon</p>
          </div>
        )}
        {activeCategory === 'skills' && (
          <div className="text-center py-20 text-fg-muted">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-fg-soft" />
            <p>Skills view coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
