/** „Heute im Dienst“ im Live-Plan: veröffentlichte Dienste des Tages (für alle Rollen sichtbar) */
import { useEffect, useState } from 'react';
import { repo } from '../data';
import type { OnDuty } from '../domain/types';
import { useData } from '../store/hooks';
import { Dot } from './RosterView';

export function OnDutyPanel({ date }: { date: string }) {
  const d = useData();
  const [list, setList] = useState<OnDuty[] | null>(null);
  // neu laden, wenn sich Dienste oder Veröffentlichungen ändern (Live-Aktualisierung)
  const stamp = d.shifts.length + '|' + d.publications.map(p => p.publishedAt).join();
  useEffect(() => { let on = true; repo.onDuty(d.venue.id, date).then(x => on && setList(x)).catch(() => on && setList([])); return () => { on = false; }; }, [d.venue.id, date, stamp]);
  if (!list?.length) return null;
  return (
    <details className="on-duty" open>
      <summary>Heute im Dienst <span className="count">{list.length}</span></summary>
      <ul>{list.map((x, i) => (
        <li key={i}><Dot color={x.color} /><b>{x.staffName}</b> <span className="muted">{x.departmentName}</span>
          <span className="t">{x.start}–{x.end}{x.start2 ? ` · ${x.start2}–${x.end2}` : ''}</span></li>
      ))}</ul>
    </details>
  );
}
