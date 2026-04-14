import { GitBranch } from 'lucide-react';

export default function Tree() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-4 rounded-full bg-white/5 mb-4">
          <GitBranch className="w-12 h-12 text-fg-soft" />
        </div>
        <h1 className="text-2xl font-semibold text-fg-default mb-2">Tree View</h1>
        <p className="text-fg-muted text-center max-w-md">
          Hierarchical visualization of the manufacturing ecosystem. Coming soon.
        </p>
      </div>
    </div>
  );
}
