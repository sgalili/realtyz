import { AutomationStudio } from '@/components/automations/AutomationStudio';
import { AutomationActivityFeed } from '@/components/dealroom/AutomationActivityFeed';

export default function AutomationStudioPage() {
  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Automation Studio</h1>
        <p className="text-sm text-muted-foreground">
          Build simple "If this, then that" workflows. Pick a trigger, choose an action, and Realtyz handles the rest.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <AutomationStudio />
        <AutomationActivityFeed />
      </div>
    </div>
  );
}
