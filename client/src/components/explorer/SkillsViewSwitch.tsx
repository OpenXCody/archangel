import ViewSwitch from '../layout/ViewSwitch';
import { atlasHref, skillsListHref } from '../atlas/state';

/**
 * The Skills list and the Atlas are two views of one thing: every skill, by
 * group. Both sit under the Skills tab, and this is the one quiet switch
 * between them. It keeps what is open: the list narrowed to a group opens the
 * atlas on that group, and the atlas on a group opens the list narrowed to it
 * and its domain. The list narrowed to a domain alone opens the atlas on the
 * field that holds most of that domain's groups.
 */
export default function SkillsViewSwitch({ current, domain, group }: { current: 'list' | 'atlas'; domain?: string | null; group?: string | null }) {
  const views = [
    { key: 'list', label: 'List', to: skillsListHref(domain, group) },
    { key: 'atlas', label: 'Atlas', to: atlasHref(group ? { group } : { domain }) },
  ] as const;
  return <ViewSwitch label="Skills as" views={views} current={current} data={{ 'data-skills-view': '' }} />;
}
