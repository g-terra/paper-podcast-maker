import type { ReactNode } from 'react';

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100';

export const buttonClass =
  'rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButtonClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
