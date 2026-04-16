import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Factory,
  Briefcase,
  Wrench,
  Check,
  Loader2,
  Plus,
  X,
  ChevronDown,
  Search,
} from 'lucide-react';
import { US_STATES } from '../../../../shared/states';
import type { Company, Skill } from '../../lib/api';

// Importable entity types (core entities only, not refs/schools/programs/persons)
type ImportableEntityType = 'companies' | 'factories' | 'occupations' | 'skills';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Skill categories based on O*NET
const SKILL_CATEGORIES = [
  'Basic Skills',
  'Complex Problem Solving',
  'Resource Management',
  'Social Skills',
  'Systems Skills',
  'Technical Skills',
  'Tools & Technology',
  'Knowledge',
];

// Industry options for companies
const INDUSTRIES = [
  'Aerospace & Defense',
  'Agriculture & Food',
  'Automotive',
  'Construction',
  'Electronics',
  'Energy',
  'Industrial Machinery',
  'Medical & Pharmaceuticals',
  'Metals & Fabrication',
  'Polymers & Composites',
  'Other',
];

interface ManualEntryFormProps {
  entityType: ImportableEntityType;
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Reusable input components
function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  autoFocus = false,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-fg-muted mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="
          w-full px-3 py-2 rounded-lg
          bg-bg-elevated border border-border-subtle
          text-fg-default placeholder:text-fg-soft
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          transition-colors
        "
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-fg-muted mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="
          w-full px-3 py-2 rounded-lg resize-none
          bg-bg-elevated border border-border-subtle
          text-fg-default placeholder:text-fg-soft
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          transition-colors
        "
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-fg-muted mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="
            w-full px-3 py-2 rounded-lg appearance-none
            bg-bg-elevated border border-border-subtle
            text-fg-default
            focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
            transition-colors cursor-pointer
          "
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-soft pointer-events-none" />
      </div>
    </div>
  );
}

// Searchable dropdown for companies
function CompanySelect({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string, name: string) => void;
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: companiesData } = useQuery({
    queryKey: ['companies', 'list', search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/companies?${params}`);
      return res.json();
    },
  });

  const companies: Company[] = companiesData?.data || [];
  const selectedCompany = companies.find((c) => c.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-fg-muted mb-1.5">
        Company
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="
          w-full px-3 py-2 rounded-lg text-left
          bg-bg-elevated border border-border-subtle
          text-fg-default flex items-center justify-between
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          transition-colors
        "
      >
        <span className={selectedCompany ? 'text-fg-default' : 'text-fg-soft'}>
          {selectedCompany ? selectedCompany.name : 'Select a company...'}
        </span>
        <ChevronDown className="w-4 h-4 text-fg-soft" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 py-2 rounded-lg bg-bg-elevated border border-border-strong shadow-lg">
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-soft" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies..."
                autoFocus
                className="
                  w-full pl-8 pr-3 py-1.5 rounded-md text-sm
                  bg-bg-surface border border-border-subtle
                  text-fg-default placeholder:text-fg-soft
                  focus:outline-none focus:border-blue-500
                "
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {companies.length === 0 ? (
              <div className="px-3 py-2 text-sm text-fg-muted">No companies found</div>
            ) : (
              companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => {
                    onChange(company.id, company.name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="
                    w-full px-3 py-2 text-left text-sm
                    hover:bg-bg-surface transition-colors
                    flex items-center gap-2
                  "
                >
                  <Building2 className="w-4 h-4 text-amber-500" />
                  <span className="text-fg-default">{company.name}</span>
                  {company.industry && (
                    <span className="text-xs text-fg-soft ml-auto">{company.industry}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-select for skills
function SkillsMultiSelect({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: skillsData } = useQuery({
    queryKey: ['skills', 'list', search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/skills?${params}`);
      return res.json();
    },
  });

  const skills: Skill[] = skillsData?.data || [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSkill = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedSkills = skills.filter((s) => selectedIds.includes(s.id));

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-fg-muted mb-1.5">Skills</label>

      {/* Selected skills tags */}
      {selectedSkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedSkills.map((skill) => (
            <span
              key={skill.id}
              className="
                inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs
                bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
              "
            >
              {skill.name}
              <button
                type="button"
                onClick={() => toggleSkill(skill.id)}
                className="hover:text-emerald-200"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="
          w-full px-3 py-2 rounded-lg text-left
          bg-bg-elevated border border-border-subtle
          text-fg-soft flex items-center justify-between
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
          transition-colors
        "
      >
        <span className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add skills...
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 py-2 rounded-lg bg-bg-elevated border border-border-strong shadow-lg">
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-soft" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills..."
                autoFocus
                className="
                  w-full pl-8 pr-3 py-1.5 rounded-md text-sm
                  bg-bg-surface border border-border-subtle
                  text-fg-default placeholder:text-fg-soft
                  focus:outline-none focus:border-blue-500
                "
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {skills.length === 0 ? (
              <div className="px-3 py-2 text-sm text-fg-muted">No skills found</div>
            ) : (
              skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.id)}
                  className="
                    w-full px-3 py-2 text-left text-sm
                    hover:bg-bg-surface transition-colors
                    flex items-center gap-2
                  "
                >
                  <div
                    className={`
                      w-4 h-4 rounded border flex items-center justify-center
                      ${selectedIds.includes(skill.id)
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-border-strong'
                      }
                    `}
                  >
                    {selectedIds.includes(skill.id) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <Wrench className="w-4 h-4 text-emerald-500" />
                  <span className="text-fg-default">{skill.name}</span>
                  {skill.category && (
                    <span className="text-xs text-fg-soft ml-auto">{skill.category}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Entity-specific form content
function CompanyForm({
  formData,
  setFormData,
  firstInputRef,
}: {
  formData: Record<string, unknown>;
  setFormData: (data: Record<string, unknown>) => void;
  firstInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Company Name"
        value={(formData.name as string) || ''}
        onChange={(v) => setFormData({ ...formData, name: v })}
        placeholder="e.g., Tesla, Inc."
        required
        autoFocus
        inputRef={firstInputRef}
      />
      <Select
        label="Industry"
        value={(formData.industry as string) || ''}
        onChange={(v) => setFormData({ ...formData, industry: v })}
        options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
        placeholder="Select industry..."
      />
      <TextArea
        label="Description"
        value={(formData.description as string) || ''}
        onChange={(v) => setFormData({ ...formData, description: v })}
        placeholder="Brief description of the company..."
      />
    </div>
  );
}

function FactoryForm({
  formData,
  setFormData,
  firstInputRef,
}: {
  formData: Record<string, unknown>;
  setFormData: (data: Record<string, unknown>) => void;
  firstInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Factory Name"
        value={(formData.name as string) || ''}
        onChange={(v) => setFormData({ ...formData, name: v })}
        placeholder="e.g., Gigafactory Texas"
        required
        autoFocus
        inputRef={firstInputRef}
      />
      <CompanySelect
        value={(formData.companyId as string) || ''}
        onChange={(id) => setFormData({ ...formData, companyId: id })}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="State"
          value={(formData.state as string) || ''}
          onChange={(v) => setFormData({ ...formData, state: v })}
          options={US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))}
          placeholder="Select state..."
          required
        />
        <TextInput
          label="Specialization"
          value={(formData.specialization as string) || ''}
          onChange={(v) => setFormData({ ...formData, specialization: v })}
          placeholder="e.g., Battery Production"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Latitude"
          value={(formData.latitude as string) || ''}
          onChange={(v) => setFormData({ ...formData, latitude: v })}
          placeholder="e.g., 30.2672"
          required
        />
        <TextInput
          label="Longitude"
          value={(formData.longitude as string) || ''}
          onChange={(v) => setFormData({ ...formData, longitude: v })}
          placeholder="e.g., -97.7431"
          required
        />
      </div>
      <TextArea
        label="Description"
        value={(formData.description as string) || ''}
        onChange={(v) => setFormData({ ...formData, description: v })}
        placeholder="Brief description of the facility..."
      />
    </div>
  );
}

function OccupationForm({
  formData,
  setFormData,
  firstInputRef,
}: {
  formData: Record<string, unknown>;
  setFormData: (data: Record<string, unknown>) => void;
  firstInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Job Title"
        value={(formData.title as string) || ''}
        onChange={(v) => setFormData({ ...formData, title: v })}
        placeholder="e.g., CNC Machine Operator"
        required
        autoFocus
        inputRef={firstInputRef}
      />
      <TextInput
        label="O*NET Code"
        value={(formData.onetCode as string) || ''}
        onChange={(v) => setFormData({ ...formData, onetCode: v })}
        placeholder="e.g., 51-4011.00"
      />
      <TextArea
        label="Description"
        value={(formData.description as string) || ''}
        onChange={(v) => setFormData({ ...formData, description: v })}
        placeholder="Job responsibilities and requirements..."
      />
      <SkillsMultiSelect
        selectedIds={(formData.skillIds as string[]) || []}
        onChange={(ids) => setFormData({ ...formData, skillIds: ids })}
      />
    </div>
  );
}

function SkillForm({
  formData,
  setFormData,
  firstInputRef,
}: {
  formData: Record<string, unknown>;
  setFormData: (data: Record<string, unknown>) => void;
  firstInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Skill Name"
        value={(formData.name as string) || ''}
        onChange={(v) => setFormData({ ...formData, name: v })}
        placeholder="e.g., Welding, Python Programming"
        required
        autoFocus
        inputRef={firstInputRef}
      />
      <Select
        label="Category"
        value={(formData.category as string) || ''}
        onChange={(v) => setFormData({ ...formData, category: v })}
        options={SKILL_CATEGORIES.map((c) => ({ value: c, label: c }))}
        placeholder="Select category..."
        required
      />
      <TextArea
        label="Description"
        value={(formData.description as string) || ''}
        onChange={(v) => setFormData({ ...formData, description: v })}
        placeholder="What does this skill involve..."
      />
    </div>
  );
}

// Entity icon and label configs
const ENTITY_CONFIG: Record<
  ImportableEntityType,
  { icon: React.ElementType; label: string; singularLabel: string; color: string }
> = {
  companies: {
    icon: Building2,
    label: 'Companies',
    singularLabel: 'Company',
    color: 'text-amber-500',
  },
  factories: {
    icon: Factory,
    label: 'Factories',
    singularLabel: 'Factory',
    color: 'text-blue-400',
  },
  occupations: {
    icon: Briefcase,
    label: 'Occupations',
    singularLabel: 'Occupation',
    color: 'text-blue-600',
  },
  skills: {
    icon: Wrench,
    label: 'Skills',
    singularLabel: 'Skill',
    color: 'text-emerald-500',
  },
};

export default function ManualEntryForm({
  entityType,
  onSuccess,
  onCancel,
}: ManualEntryFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const config = ENTITY_CONFIG[entityType];
  const Icon = config.icon;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await fetch(`${API_BASE}/${entityType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entityType] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    },
  });

  // Reset form when entity type changes
  useEffect(() => {
    setFormData({});
  }, [entityType]);

  // Validate form
  const isValid = useCallback(() => {
    switch (entityType) {
      case 'companies':
        return !!(formData.name as string)?.trim();
      case 'factories':
        return !!(formData.name as string)?.trim() &&
          !!(formData.state as string)?.trim() &&
          !!(formData.latitude as string)?.trim() &&
          !!(formData.longitude as string)?.trim();
      case 'occupations':
        return !!(formData.title as string)?.trim();
      case 'skills':
        return !!(formData.name as string)?.trim() && !!(formData.category as string)?.trim();
      default:
        return false;
    }
  }, [entityType, formData]);

  // Handle save
  const handleSave = async (andAddAnother: boolean) => {
    if (!isValid()) return;
    await createMutation.mutateAsync(formData);
    if (andAddAnother) {
      setFormData({});
      firstInputRef.current?.focus();
    } else {
      onSuccess?.();
    }
  };

  // Keyboard shortcut for Cmd+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave(false);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [formData, isValid]);

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2 rounded-lg bg-bg-elevated ${config.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold text-fg-default">
          Add {config.singularLabel}
        </h2>
      </div>

      {/* Form */}
      <form onSubmit={(e) => e.preventDefault()}>
        {entityType === 'companies' && (
          <CompanyForm
            formData={formData}
            setFormData={setFormData}
            firstInputRef={firstInputRef}
          />
        )}
        {entityType === 'factories' && (
          <FactoryForm
            formData={formData}
            setFormData={setFormData}
            firstInputRef={firstInputRef}
          />
        )}
        {entityType === 'occupations' && (
          <OccupationForm
            formData={formData}
            setFormData={setFormData}
            firstInputRef={firstInputRef}
          />
        )}
        {entityType === 'skills' && (
          <SkillForm
            formData={formData}
            setFormData={setFormData}
            firstInputRef={firstInputRef}
          />
        )}

        {/* Error */}
        {createMutation.isError && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {createMutation.error.message}
          </div>
        )}

        {/* Success toast */}
        {showSuccess && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 flex items-center gap-2">
            <Check className="w-4 h-4" />
            {config.singularLabel} created successfully!
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
          <div className="text-xs text-fg-soft">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-fg-muted">
              ⌘
            </kbd>
            <span className="mx-1">+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-fg-muted">
              Enter
            </kbd>
            <span className="ml-2">to save</span>
          </div>
          <div className="flex items-center gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm text-fg-muted hover:text-fg-default transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={!isValid() || createMutation.isPending}
              className="
                px-4 py-2 rounded-lg text-sm font-medium
                bg-bg-elevated border border-border-subtle
                text-fg-default hover:bg-bg-surface
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Save & Add Another
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={!isValid() || createMutation.isPending}
              className="
                px-4 py-2 rounded-lg text-sm font-medium
                bg-fg-default text-bg-base hover:bg-fg-muted
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors flex items-center gap-2
              "
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save & Close
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
