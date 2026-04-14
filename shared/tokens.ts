export const tokens = {
  color: {
    bgBaseDark: "#050608",
    bgShellDark: "#050608",
    bgSurfaceDark: "#090c12",
    bgElevatedDark: "#11141d",
    fgDefaultDark: "#f9fafb",
    fgMutedDark: "#9ca3af",
    accentPrimary: "#3b4a60",
    accentSoftDark: "#141822",
    accentWarning: "#ff9f1c",

    bgBaseLight: "#f5f6f8",
    bgShellLight: "#f5f6f8",
    bgSurfaceLight: "#e5e7ec",
    bgElevatedLight: "#dde1e8",
    fgDefaultLight: "#080b12",
    fgMutedLight: "#6b7280",
    accentSoftLight: "#e4e6ed",
  },
  radius: {
    shell: 20,
    card: 16,
    button: 999,
    input: 10,
  },
  shadow: {
    soft: "0 18px 45px rgba(0, 0, 0, 0.7)",
  },
  font: {
    sans:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    mono:
      '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
};

// Entity colors for consistent visual identification
export const entityColors = {
  company: {
    primary: '#F59E0B',
    light: '#FCD34D',
    dark: '#B45309',
    bg: 'rgba(245, 158, 11, 0.1)',
    tailwind: 'amber',
  },
  factory: {
    primary: '#60A5FA',
    light: '#93C5FD',
    dark: '#2563EB',
    bg: 'rgba(96, 165, 250, 0.1)',
    tailwind: 'blue',
  },
  occupation: {
    primary: '#1E40AF',
    light: '#3B82F6',
    dark: '#1E3A8A',
    bg: 'rgba(30, 64, 175, 0.1)',
    tailwind: 'blue',
  },
  skill: {
    primary: '#10B981',
    light: '#34D399',
    dark: '#047857',
    bg: 'rgba(16, 185, 129, 0.1)',
    tailwind: 'emerald',
  },
  state: {
    primary: '#6366F1',
    light: '#818CF8',
    dark: '#4338CA',
    bg: 'rgba(99, 102, 241, 0.1)',
    tailwind: 'indigo',
  },
} as const;

export const entityIcons = {
  company: '🏢',
  factory: '🏭',
  occupation: '👔',
  skill: '🔧',
  state: '📍',
} as const;

export type EntityType = keyof typeof entityColors;
