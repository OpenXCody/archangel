// Sample versions of careers for the local seed (server/scripts/seed-versions.ts).
//
// LOCAL ONLY, and only for the sample's made-up companies (FICTIONAL_COMPANIES in
// companies.ts): so the screens that show a company's version of a career have
// something to show on a developer's machine. Nothing in this file is true of any
// company, and nothing like it may ever be written for a real one: what a real
// company runs is said by its own people, through the app (a unit check holds
// every name here to the made-up list).
//
// Careers, skills and makes are named as the catalogue names them. A name the
// database does not have is skipped and said so, since the standard paths change.

export interface SampleVersion {
  /** One of FICTIONAL_COMPANIES, by name. */
  company: string;
  /** A career's title. */
  career: string;
  /** Skills of the career's standard path that this version leaves out. */
  leavesOut: string[];
  /** Skills it adds to the path. */
  adds: string[];
  /** Skill name to the makes it runs for that skill. */
  runs: Record<string, string[]>;
}

export const SAMPLE_VERSIONS: SampleVersion[] = [
  {
    company: 'Pacific Aerospace Components',
    career: 'CNC Machinist',
    leavesOut: ['Manual Lathe Operation', 'Thread Measurement'],
    adds: ['5-Axis Machining', 'CMM Operation'],
    runs: {
      'CNC Control Operation': ['Haas', 'Okuma', 'Heidenhain'],
      '5-Axis Machining': ['DMG Mori', 'Hermle'],
      'CAM Programming': ['NX CAM'],
      'CMM Operation': ['PC-DMIS'],
    },
  },
  {
    company: 'Pacific Aerospace Components',
    career: 'CNC Machine Operator',
    leavesOut: ['CAM Programming'],
    adds: [],
    runs: { 'CNC Control Operation': ['Haas', 'Okuma'] },
  },
  {
    company: 'Apex Manufacturing Corp',
    career: 'CNC Machinist',
    leavesOut: [],
    adds: ['Deburring and Hand Finishing'],
    runs: { 'CNC Control Operation': ['Fanuc', 'Mazak'], 'Multi-Axis Turning': ['Mazak'] },
  },
  {
    company: 'Apex Manufacturing Corp',
    career: 'Welder',
    leavesOut: ['Pipe Welding'],
    adds: ['Robotic Arc Welding'],
    runs: { 'Robotic Arc Welding': ['Fanuc', 'Yaskawa Motoman'] },
  },
  // A version with no changes: it says only that the company hires for the career.
  { company: 'Summit Semiconductor', career: 'Wafer Fab Operator', leavesOut: [], adds: [], runs: {} },
];
