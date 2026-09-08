import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { PageContainer, EmptyState } from '../components/layout/Page';

export default function NotFound() {
  return (
    <PageContainer size="narrow">
      <EmptyState
        icon={Compass}
        title="This page doesn’t exist"
        description="The link may be old, or the record it pointed to was removed."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/map" className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-black">Open the map</Link>
            <Link to="/explore" className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-fg-default hover:bg-bg-elevated">Browse nodes</Link>
          </div>
        }
      />
    </PageContainer>
  );
}
