import { useRecordSearch, type FoundRecord, type RecordKind } from '../../lib/records';
import Picker from './Picker';

const KIND_PLACEHOLDER: Record<RecordKind, string> = {
  company: 'Company name',
  factory: 'Plant name',
  career: 'Career title',
  skill: 'Skill name',
};
const KIND_LIST: Record<RecordKind, string> = { company: 'Companies', factory: 'Plants', career: 'Careers', skill: 'Skills' };

interface RecordPickerProps {
  id: string;
  kind: RecordKind;
  value: FoundRecord | null;
  onChange: (value: FoundRecord | null) => void;
  /** A record to leave out of the matches. */
  excludeId?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Pick one record of a kind by name, or by another name it is known by. */
export default function RecordPicker({ kind, ...props }: RecordPickerProps) {
  // A hook per kind keeps the search keyed by it; the picker itself is remounted when the kind changes.
  const useOptions = (term: string) => useRecordSearch(kind, term);
  return (
    <Picker<FoundRecord>
      key={kind}
      {...props}
      useOptions={useOptions}
      placeholder={KIND_PLACEHOLDER[kind]}
      listLabel={KIND_LIST[kind]}
      detail={(option) => option.detail}
    />
  );
}
