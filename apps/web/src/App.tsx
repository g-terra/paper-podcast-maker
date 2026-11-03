import { ServerStatus } from './components/ServerStatus';
import { SettingsForm } from './components/SettingsForm';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Paper Podcast Maker</h1>
          <p className="text-slate-600">
            Turn an academic paper into a podcast episode, entirely on your machine.
          </p>
          <ServerStatus />
        </header>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Episode settings</h2>
          <SettingsForm />
        </section>
      </main>
    </div>
  );
}
