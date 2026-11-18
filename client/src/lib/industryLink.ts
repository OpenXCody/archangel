/**
 * Where an industry's name leads. One place decides, so every link to an
 * industry moves together when industries get pages of their own
 * (`/industries/<slug>`): until then it is the plants list filtered to it.
 */
export function industryPath(name: string): string {
  return `/explore?tab=factories&industry=${encodeURIComponent(name)}`;
}
