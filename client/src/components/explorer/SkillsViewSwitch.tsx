import ViewSwitch from '../layout/ViewSwitch';

/**
 * The Skills list and the Atlas are two views of one thing: every skill, by
 * domain and group. Both sit under the Skills tab, and this is the one quiet
 * switch between them. It keeps the domain and group that are open, so the
 * list narrowed to a group opens the atlas on that group, and back.
 */
export default function SkillsViewSwitch({ current, domain, group }: { current: 'list' | 'atlas'; domain?: string | null; group?: string | null }) {
  const list = new URLSearchParams({ tab: 'skills' });
  if (domain) list.set('domain', domain);
  if (domain && group) list.set('group', group);
  const atlas = new URLSearchParams();
  if (group) atlas.set('group', group);
  else if (domain) atlas.set('domain', domain);
  const views = [
    { key: 'list', label: 'List', to: `/explore?${list.toString()}` },
    { key: 'atlas', label: 'Atlas', to: atlas.size > 0 ? `/atlas?${atlas.toString()}` : '/atlas' },
  ] as const;
  return <ViewSwitch label="Skills as" views={views} current={current} data={{ 'data-skills-view': '' }} />;
}
