export type UsageWindow = {
  kind: 'weekly' | 'five-hour' | 'custom'; id: string; label: string;
  usedPercent: number; resetsAt: string | null; model: string; cost: null;
};

export function parseUsageScreen(screen: string, now = Date.now()) {
  const lines = screen.split('\n').map(line => line.trim());
  if (!lines.some(line => /Models & Quota/.test(line))) throw new Error('Usage panel not ready.');
  const windows: UsageWindow[] = [];
  let model = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'GEMINI MODELS') model = 'Gemini';
    else if (line === 'CLAUDE AND GPT MODELS') model = 'Claude & GPT';
    else if (line === 'GEMINI 4 ARGON') model = 'Gemini 4 Argon';
    if (!model || !/^(Weekly Limit Remaining|Five Hour Limit Remaining|Gemini 4 Argon Weekly Limit)$/.test(line)) continue;
    const percentage = lines[i + 1]?.match(/\]\s*(\d+(?:\.\d+)?)%\s*$/);
    if (!percentage) throw new Error('Quota percentage missing.');
    const remaining = Number(percentage[1]);
    if (remaining > 100) throw new Error('Quota percentage out of range.');
    const resetText = lines[i + 2] ?? '';
    let resetsAt: string | null = null;
    if (/^Refreshes in /.test(resetText)) {
      const duration = resetText.slice('Refreshes in '.length);
      const parts = [...duration.matchAll(/(\d+)\s*(d|h|m|s)\b/g)];
      if (!parts.length || duration.replace(/\d+\s*[dhms]\b/g, '').trim()) throw new Error('Unknown reset duration.');
      const ms = parts.reduce((sum, part) => sum + Number(part[1]) * ({d:86400000,h:3600000,m:60000,s:1000}[part[2]]!), 0);
      resetsAt = new Date(now + ms).toISOString();
    } else if (resetText !== 'Quota available') throw new Error('Quota reset missing.');
    const kind = line.includes('Five Hour') ? 'five-hour' : 'weekly';
    windows.push({kind, id: `${model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}`, label: `${model} ${kind}`, usedPercent: Math.round((100 - remaining) * 100) / 100, resetsAt, model, cost: null});
  }
  // Require the full known panel. Partial redraws and changed layouts must not
  // silently turn missing or unreadable limits into zero usage.
  if (windows.length !== 5 || new Set(windows.map(w => w.id)).size !== 5) throw new Error('Incomplete or changed usage panel.');
  return { status: 'ok' as const, plan: null, accountEmail: lines.find(line => line.startsWith('Account: '))?.slice(9).trim() || null, planLabel: null, windows };
}
