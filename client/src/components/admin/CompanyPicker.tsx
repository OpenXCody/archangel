import { useAdminCompanies, type AdminCompany } from '../../lib/admin';
import Picker from './Picker';

interface CompanyPickerProps {
  /** Id for the text input, so a label can point at it. */
  id: string;
  value: AdminCompany | null;
  onChange: (value: AdminCompany | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/** What tells one company from a near namesake: its domain and how many factories it has. */
function companyDetail(company: AdminCompany): string {
  const count = company.factoryCount ?? 0;
  return [company.domain, `${count.toLocaleString('en-US')} ${count === 1 ? 'factory' : 'factories'}`].filter(Boolean).join(' · ');
}

/** Pick one company by name. */
export default function CompanyPicker(props: CompanyPickerProps) {
  return <Picker<AdminCompany> {...props} useOptions={useAdminCompanies} placeholder="Company name" listLabel="Companies" detail={companyDetail} />;
}
