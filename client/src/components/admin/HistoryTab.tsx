import { useSearchParams } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AUDIT_KINDS } from '../../lib/records';
import { selectContentClass, selectTriggerClass } from '../account/parts';
import Panel from './Panel';
import HistoryList from './HistoryList';

/**
 * What admins changed, newest first: edits, merges and deletions of records,
 * roles and company access, invites and reset links. The kind shown is kept
 * in the address (`?show=company`).
 */
export default function HistoryTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = AUDIT_KINDS.find((option) => option.kind === searchParams.get('show'))?.kind ?? '';

  const choose = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('show');
    else params.set('show', value);
    setSearchParams(params, { replace: true });
  };

  return (
    <Panel title="History" description="Every change an admin makes is kept here, with who made it and when.">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={kind || 'all'} onValueChange={choose}>
          <SelectTrigger aria-label="Show" className={cn(selectTriggerClass, 'w-full xs:w-48')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            <SelectItem value="all" className="py-2.5">
              Everything
            </SelectItem>
            {AUDIT_KINDS.map((option) => (
              <SelectItem key={option.kind} value={option.kind} className="py-2.5">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <HistoryList key={kind} filter={kind ? { kind } : {}} empty="None yet." />
    </Panel>
  );
}
