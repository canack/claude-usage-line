export function formatRemaining(resetsAt: number | null | undefined): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return '--';
  const diff = Math.floor(resetsAt - Date.now() / 1000);
  if (diff <= 0) return 'now';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}
