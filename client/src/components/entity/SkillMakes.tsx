import { cn } from '@/lib/utils';
import type { Make } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { useMySkills } from '../../lib/seeker';
import { useSeekerTools } from '../../lib/viewer';
import { DetailSection } from '../layout/Page';

const chipClass = 'inline-flex min-h-8 max-w-full items-center rounded-full border px-3 py-1 text-sm leading-tight [overflow-wrap:anywhere]';

/**
 * A skill's makes: the named equipment and software it is run on, as quiet
 * chips in the order they are shown. They are names, never controls: nothing
 * on a skill's page marks anything. A make a seeker has marked as run is
 * brighter; there is no colour, count or icon. (Nothing in the interface sets
 * that mark at present: marking is Profile's, and the API still takes it.)
 */
export default function SkillMakes({ skillId, makes }: { skillId: string; makes: Make[] }) {
  const { data: account } = useAccount();
  const seekerTools = useSeekerTools();
  const signedIn = Boolean(account?.user) && seekerTools;
  const { data: mySkills } = useMySkills(signedIn);
  const mine = signedIn ? mySkills?.find((skill) => skill.skillId === skillId) : undefined;
  const ran = new Set((mine?.makes ?? []).map((make) => make.id));

  if (makes.length === 0) return null;

  return (
    <DetailSection id="makes" title="Makes">
      <ul className="flex flex-wrap gap-2" data-skill-makes>
        {makes.map((make) => (
          <li
            key={make.id}
            data-make={make.id}
            data-ran={ran.has(make.id) || undefined}
            className={cn(chipClass, ran.has(make.id) ? 'border-text-1 font-medium text-text-1' : 'border-line text-text-2')}
          >
            {make.name}
            {ran.has(make.id) && <span className="sr-only">, which you have run</span>}
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}
