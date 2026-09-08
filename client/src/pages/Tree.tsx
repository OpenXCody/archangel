import { GitBranch } from 'lucide-react';
import { PageContainer, PageHeader, EmptyState } from '../components/layout/Page';

export default function Tree() {
  return (
    <PageContainer>
      <PageHeader
        title="Tree View"
        description="Hierarchical view of the manufacturing ecosystem: companies, their factories, the occupations inside them, and the skills those occupations need."
      />
      <EmptyState
        icon={GitBranch}
        title="Coming soon"
        description="This view is being built. Use the Map or Nodes tabs to explore in the meantime."
      />
    </PageContainer>
  );
}
