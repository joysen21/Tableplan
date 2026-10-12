/** Dienstplan: Woche (Raster Mitarbeitende × Tage), Tag (Zeitstrahl), Monat (Übersicht).
 *  Planen per Vorlagen-„Pinsel“ (antippen/klicken) oder Drag & Drop; Prüfhinweise; Veröffentlichen je Bereich und Woche. */
import { useMemo, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, Printer, TriangleAlert } from '../ui/icons';
import { newId } from '../domain/demo';
import { canPlanDept, fmtHours, plannableDepartments, sortDepartments, templateTimes } from '../domain/roster';
import {
  ABSENCE_LABEL, ABSENCE_SHORT, absenceOn, changedSince, copyWeek, expectedGuests, holidayName, hoursCsv, hoursRows, isoWeek, monthDays,
  plannedCount, publicationFor, rosterSettings, rosterWarnings, shiftFromTemplate, shiftsOverlap, shiftWorkMin, sortShifts, staffForDepartment,
  staffMinutes, staffNeeded, weekDays, weekStart, type RosterWarning
} from '../domain/rosterPlan';
import type { Shift, Staff, VenueData } from '../domain/types';
import { downloadBlob } from '../lib/download';
import { t } from '../lib/i18n';
import { addDays, fmtShort, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRole, useUserId } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { confirmDialog, toast } from '../ui/notify';
import { Dot } from './RosterView';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const dmy = (s: string) => s.split('-').reverse().join('.');
const shiftLabel = (d: VenueData, s: Shift) => d.shiftTemplates.find(x => x.id === s.templateId)?.short || `${s.start}–${s.end}`;
const shiftColor = (d: VenueData, s: Shift) => d.shiftTemplates.find(x => x.id === s.templateId)?.color ?? d.departments.find(x => x.id === s.departmentId)?.color ?? '#4F7BD1';

export function RosterPlan({ dept }: { dept: string }) {
  const d = useData();
  const ui = useUi();
  const store = useApp();
  const user = useApp(s => s.user)!;
  const role = useRole(), userId = useUserId();
  const date = ui.rosterDate, mode = ui.rosterMode;
  const settings = rosterSettings(d.venue);
  const scope = dept ? d.departments.filter(x => x.id === dept) : sortDepartments(d.departments);
  const mine = plannableDepartments(role, d.departments, userId).filter(x => scope.some(s => s.id === x.id));
  const canPlan = (depId: string) => canPlanDept(role, d.departments, userId, depId);
  const days = mode === 'monat' ? monthDays(date) : mode === 'tag' ? [date] : weekDays(date);
  const from = days[0], to = days[days.length - 1];
  const warnings = useMemo(() => (mode === 'monat' ? [] : rosterWarnings(d, date, settings)
    .filter(w => !dept || d.shifts.some(s => s.id === w.shiftId && s.departmentId === dept) || (w.shiftId === null && d.staff.find(x => x.id === w.staffId) && staffForDepartment(d, dept, from, to).some(x => x.id === w.staffId)))),
  [d, date, mode, dept]); // eslint-disable-line react-hooks/exhaustive-deps
  const brush = d.shiftTemplates.find(x => x.id === ui.rosterBrush && canPlan(x.departmentId)) ?? null;

  // Zeilen: im Bereichsfilter die dort einsetzbaren/eingeplanten Personen, sonst alle aktiven (+ eingeplante Ausgeschiedene)
  const rows = useMemo(() => {
    const list = dept ? staffForDepartment(d, dept, from, to)
      : d.staff.filter(s => s.active || d.shifts.some(x => x.staffId === s.id && x.date >= from && x.date <= to));
    const depSort = (s: Staff) => d.departments.find(x => x.id === s.departmentId)?.sort ?? 999;
    return [...list].sort((a, b) => Number(a.departmentId !== dept && !!dept) - Number(b.departmentId !== dept && !!dept) || depSort(a) - depSort(b) || a.name.localeCompare(b.name, 'de'));
  }, [d, dept, from, to]);
  const open = d.shifts.filter(s => !s.staffId && s.date >= from && s.date <= to && scope.some(x => x.id === s.departmentId));

  const step = mode === 'monat' ? 0 : mode === 'tag' ? 1 : 7;
  const go = (n: number) => {
    if (mode === 'monat') { const [y, m] = date.split('-').map(Number); const nd = new Date(Date.UTC(y, m - 1 + n, 1)); ui.set({ rosterDate: nd.toISOString().slice(0, 10) }); }
    else ui.set({ rosterDate: addDays(date, n * step) });
  };
  const title = mode === 'monat' ? `${MONTHS[+date.slice(5, 7) - 1]} ${date.slice(0, 4)}` : mode === 'tag' ? fmtShort(date) + date.slice(0, 4)
    : `KW ${isoWeek(date)} · ${fmtShort(from)} – ${fmtShort(to)}`;

  /* ---------- Planen ---------- */
  async function saveShift(s: Shift, log: [string, string]) {
    const clash = s.staffId && d.shifts.some(o => o.id !== s.id && o.staffId === s.staffId && shiftsOverlap(o, s));
    if (clash) return toast('Diese Person hat zu dieser Zeit schon einen Dienst.', 'err');
    await store.upsert('shifts', [{ ...s, updatedAt: new Date().toISOString() }], log);
  }
  const who = (id: string | null) => d.staff.find(x => x.id === id)?.name ?? 'offen';
  function cellClick(staffId: string | null, day: string) {
    if (brush) return saveShift(shiftFromTemplate(brush, staffId, day, newId()), ['Dienst eingetragen', `${who(staffId)} ${dmy(day)} ${brush.name}`]);
    const st = d.staff.find(x => x.id === staffId);
    const depId = (dept && canPlan(dept) ? dept : st?.departmentId && canPlan(st.departmentId) ? st.departmentId : mine[0]?.id);
    if (!depId) return;
    openDialog({ type: 'shift', preset: { staffId, date: day, departmentId: depId } });
  }
  function onDrop(e: DragEvent, staffId: string | null, day: string) {
    e.preventDefault();
    const [kind, id] = e.dataTransfer.getData('text/plain').split(':');
    if (kind === 'tpl') { const tp = d.shiftTemplates.find(x => x.id === id); if (tp && canPlan(tp.departmentId)) saveShift(shiftFromTemplate(tp, staffId, day, newId()), ['Dienst eingetragen', `${who(staffId)} ${dmy(day)} ${tp.name}`]); }
    if (kind === 'shift') {
      const s = d.shifts.find(x => x.id === id);
      if (s && canPlan(s.departmentId) && (s.staffId !== staffId || s.date !== day)) saveShift({ ...s, staffId, date: day }, ['Dienst verschoben', `${who(s.staffId)} ${dmy(s.date)} → ${who(staffId)} ${dmy(day)}`]);
    }
  }
  const dropProps = (staffId: string | null, day: string) => ({
    onDragOver: (e: DragEvent) => { if (mine.length) e.preventDefault(); },
    onDrop: (e: DragEvent) => onDrop(e, staffId, day)
  });

  async function copyPrev() {
    const r = copyWeek(d, addDays(date, -7), date, mine.map(x => x.id), newId);
    if (!r.created.length) return toast(r.filled.length ? 'Diese Woche ist schon geplant – nur leere Bereiche werden übernommen.' : 'In der Vorwoche gibt es nichts zu übernehmen.', 'err');
    const now = new Date().toISOString();
    if (await store.upsert('shifts', r.created.map(s => ({ ...s, updatedAt: now })), ['Vorwoche übernommen', `KW ${isoWeek(date)}: ${r.created.length} Dienste`]))
      toast(`${r.created.length} Dienste übernommen` + (r.skipped.length ? ` · ausgelassen: ${r.skipped.slice(0, 3).join(', ')}${r.skipped.length > 3 ? ' …' : ''}` : ''));
  }
  async function publish(depId: string) {
    const dep = d.departments.find(x => x.id === depId)!;
    const pub = publicationFor(d, depId, date);
    const severe = warnings.filter(w => w.severe && d.shifts.some(s => s.id === w.shiftId && s.departmentId === depId)).length;
    const lines = [`${dep.name} · KW ${isoWeek(date)}`, 'Die Mitarbeitenden sehen den Plan danach über ihren Link und im Kalender-Abo.'];
    if (severe) lines.push(`Achtung: ${severe} schwere Konflikte (Abwesenheit/Überschneidung) sind noch offen.`);
    if (!(await confirmDialog(pub ? 'Erneut veröffentlichen?' : 'Plan veröffentlichen?', lines, 'Veröffentlichen'))) return;
    if (await store.upsert('publications', [{ id: pub?.id ?? newId(), departmentId: depId, weekStart: weekStart(date), publishedAt: new Date().toISOString(), publishedBy: user.name }],
      ['Dienstplan veröffentlicht', `${dep.name} KW ${isoWeek(date)}`])) toast('Veröffentlicht');
  }
  async function unpublish(depId: string) {
    const pub = publicationFor(d, depId, date); if (!pub) return;
    const dep = d.departments.find(x => x.id === depId)!;
    if (await confirmDialog('Veröffentlichung zurücknehmen?', [`${dep.name} · KW ${isoWeek(date)}`, 'Die Mitarbeitenden sehen diese Woche dann nicht mehr.'], 'Zurücknehmen', true))
      store.remove('publications', [pub.id], ['Veröffentlichung zurückgenommen', `${dep.name} KW ${isoWeek(date)}`]);
  }
  function exportHours() {
    const m = monthDays(date);
    downloadBlob(`dienstplan-stunden-${date.slice(0, 7)}.csv`, new Blob([hoursCsv(hoursRows(d, m[0], m[m.length - 1]), t)], { type: 'text/csv;charset=utf-8' }));
  }

  const palette = d.shiftTemplates.filter(x => mine.some(m => m.id === x.departmentId)).sort((a, b) => a.sort - b.sort);
  return (
    <div className="roster-plan">
      <div className="row roster-toolbar no-print">
        <button className="btn small icon" aria-label="Zurück" title="Zurück" onClick={() => go(-1)}><ChevronLeft /></button>
        <b className="roster-title">{title}</b>
        <button className="btn small icon" aria-label="Weiter" title="Weiter" onClick={() => go(1)}><ChevronRight /></button>
        <button className="btn small" onClick={() => ui.set({ rosterDate: today() })}>Heute</button>
        <div className="seg" role="group" aria-label="Zeitraum">
          {(['tag', 'woche', 'monat'] as const).map(m => <button key={m} className="btn small" aria-pressed={mode === m} onClick={() => ui.set({ rosterMode: m })}>{m === 'tag' ? 'Tag' : m === 'woche' ? 'Woche' : 'Monat'}</button>)}
        </div>
        <span className="spacer" />
        {mode === 'woche' && mine.length > 0 && <button className="btn small" onClick={copyPrev}><Copy />Vorwoche übernehmen</button>}
        <button className="btn small" onClick={exportHours} title="Geplante Stunden des Monats als CSV (Excel)"><Download />Stunden {MONTHS[+date.slice(5, 7) - 1]}</button>
        <button className="btn small" onClick={() => window.print()}><Printer />Drucken</button>
      </div>

      {mode === 'woche' && <div className="roster-publish no-print">
        {scope.map(dep => {
          const pub = publicationFor(d, dep.id, date), changed = changedSince(d, dep.id, date), edit = canPlan(dep.id);
          return (
            <span key={dep.id} className={'pub-chip' + (pub ? ' on' : '')}>
              <Dot color={dep.color} /><b>{dep.name}</b>
              <span className="muted">{pub ? `veröffentlicht ${new Date(pub.publishedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Entwurf'}</span>
              {changed > 0 && <span className="badge warn" title="Seit dem Veröffentlichen geändert">{changed} geändert</span>}
              {edit && <button className="btn small" onClick={() => publish(dep.id)}>{pub ? (changed ? 'Erneut veröffentlichen' : 'Neu veröffentlichen') : 'Veröffentlichen'}</button>}
              {edit && pub && <button className="btn small ghost" onClick={() => unpublish(dep.id)} aria-label={`Veröffentlichung ${dep.name} zurücknehmen`} title="Zurücknehmen">✕</button>}
            </span>
          );
        })}
      </div>}

      {mode !== 'monat' && palette.length > 0 && (
        <div className="roster-palette no-print" role="group" aria-label="Vorlagen">
          <small className="muted">{brush ? `Pinsel „${brush.name}“: Zellen anklicken zum Eintragen` : 'Vorlage wählen und in die Tage klicken – oder ziehen:'}</small>
          {palette.map(tp => (
            <button key={tp.id} type="button" className="btn small tpl-btn" aria-pressed={brush?.id === tp.id} draggable
              onDragStart={e => e.dataTransfer.setData('text/plain', 'tpl:' + tp.id)}
              onClick={() => ui.set({ rosterBrush: brush?.id === tp.id ? null : tp.id })} title={`${tp.name} ${templateTimes(tp)}`}>
              <span className="tpl-chip" style={{ background: tp.color }}>{tp.short || tp.name.slice(0, 2)}</span>{tp.name}
              {!dept && scope.length > 1 && <small className="muted"> · {d.departments.find(x => x.id === tp.departmentId)?.name}</small>}
            </button>
          ))}
          {brush && <button className="btn small ghost" onClick={() => ui.set({ rosterBrush: null })}>Pinsel aus</button>}
        </div>
      )}

      <div className="print-area">
        <h2 className="print-only">{d.venue.name} · Dienstplan {scope.length === 1 ? scope[0].name : ''} · {title}</h2>
        {mode === 'woche' && <WeekGrid days={days} rows={rows} open={open} scope={scope.map(x => x.id)} dept={dept} warnings={warnings} canPlan={canPlan} onCell={cellClick} dropProps={dropProps} />}
        {mode === 'tag' && <DayView date={date} rows={rows} open={open} scope={scope.map(x => x.id)} canPlan={canPlan} onCell={cellClick} />}
        {mode === 'monat' && <MonthGrid days={days} rows={rows} />}
      </div>

      {mode !== 'monat' && <WarningList warnings={warnings} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Woche */
function WeekGrid({ days, rows, open, scope, dept, warnings, canPlan, onCell, dropProps }: {
  days: string[]; rows: Staff[]; open: Shift[]; scope: string[]; dept: string; warnings: RosterWarning[];
  canPlan: (dep: string) => boolean; onCell: (staffId: string | null, day: string) => void;
  dropProps: (staffId: string | null, day: string) => { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };
}) {
  const d = useData();
  const t0 = today();
  const settings = rosterSettings(d.venue);
  const warnIds = new Set(warnings.map(w => w.shiftId).filter(Boolean));
  const guests = days.map(day => expectedGuests(d, day));
  const cols = { '--days': days.length } as React.CSSProperties;
  const cell = (staffId: string | null, day: string, list: Shift[]) => {
    const ab = staffId ? absenceOn(d, staffId, day) : undefined;
    return (
      <div key={day} className={'rg-cell' + (day === t0 ? ' today' : '') + (holidayName(day) ? ' holiday' : '')} {...dropProps(staffId, day)}
        role="gridcell" aria-label={`${staffId ? d.staff.find(x => x.id === staffId)?.name : 'Offene Schichten'} ${fmtShort(day)}`}>
        {ab && <button className={'abs-chip ' + ab.kind} onClick={() => openDialog({ type: 'absence', absence: ab })} title={`${ABSENCE_LABEL[ab.kind]} ${dmy(ab.from)}–${dmy(ab.to)}${ab.note ? ' · ' + ab.note : ''}`}>
          {ABSENCE_SHORT[ab.kind]} <span>{ABSENCE_LABEL[ab.kind]}</span></button>}
        {sortShifts(list).map(s => {
          const other = !scope.includes(s.departmentId) || (!!dept && s.departmentId !== dept);
          return (
            <button key={s.id} className={'shift-chip' + (other ? ' other' : '') + (warnIds.has(s.id) ? ' warn' : '')} style={{ '--c': shiftColor(d, s) } as React.CSSProperties}
              draggable={canPlan(s.departmentId)} onDragStart={e => e.dataTransfer.setData('text/plain', 'shift:' + s.id)}
              onClick={e => { e.stopPropagation(); openDialog({ type: 'shift', shift: s }); }}
              title={`${d.departments.find(x => x.id === s.departmentId)?.name}: ${templateTimes(s)}${s.breakMin ? `, ${s.breakMin} Min. Pause` : ''}${s.note ? ' · ' + s.note : ''}`}>
              {warnIds.has(s.id) && <TriangleAlert className="w" aria-label="Hinweis" />}
              <b>{shiftLabel(d, s)}</b>{d.shiftTemplates.some(x => x.id === s.templateId) && <small>{s.start}–{s.end}{s.start2 ? ' +' : ''}</small>}{!d.shiftTemplates.some(x => x.id === s.templateId) && s.start2 && <small>+</small>}{s.note && <i className="note" aria-label="Notiz">•</i>}
            </button>
          );
        })}
        <button className="cell-add no-print" onClick={() => onCell(staffId, day)} aria-label={`Dienst ${fmtShort(day)} eintragen`}>+</button>
      </div>
    );
  };
  return (
    <div className="table-scroll"><div className="roster-grid" style={cols} role="grid">
      <div className="rg-head rg-name">Mitarbeiter/in</div>
      {days.map((day, i) => {
        const hol = holidayName(day), g = guests[i];
        return (
          <div key={day} className={'rg-head' + (day === t0 ? ' today' : '')}>
            <b>{fmtShort(day)}</b>{hol && <span className="badge" title="Feiertag">{hol}</span>}
            {g.peak.guests > 0 && <small className="muted" title={g.services.map(s => `${s.name}: ${s.guests}`).join('\n')}>{g.peak.guests} Gäste ({g.peak.name})</small>}
            {scope.map(depId => {
              const dep = d.departments.find(x => x.id === depId)!, need = staffNeeded(dep, g.peak.guests), have = plannedCount(d, depId, day);
              if (need === null && !have) return null;
              return <small key={depId} className={'staffing' + (need !== null && have < need ? ' low' : '')} title={need !== null ? `${dep.name}: ${have} eingeplant, Vorschlag ${need}` : `${dep.name}: ${have} eingeplant`}>
                <Dot color={dep.color} />{have}{need !== null ? `/${need}` : ''}</small>;
            })}
          </div>
        );
      })}
      <div className="rg-head rg-sum">Std.</div>
      {rows.map(s => {
        const min = staffMinutes(d, s.id, days[0], days[6]);
        const cls = min > settings.maxWeekHours * 60 ? ' danger' : min > s.weeklyHours * 60 ? ' over' : '';
        return [
          <div key={s.id + 'n'} className={'rg-name' + (s.active ? '' : ' inactive')}><Dot color={s.color} /><span>{s.name}</span>
            {dept && s.departmentId !== dept && <small className="muted"> {d.departments.find(x => x.id === s.departmentId)?.name ?? ''}</small>}</div>,
          ...days.map(day => cell(s.id, day, d.shifts.filter(x => x.staffId === s.id && x.date === day))),
          <div key={s.id + 's'} className={'rg-sum' + cls} title={`Soll ${s.weeklyHours.toLocaleString('de-DE')} h`}>{fmtHours(min).replace(' h', '')}<small>/{s.weeklyHours.toLocaleString('de-DE')}</small></div>
        ];
      })}
      <div className="rg-name open-row">Offene Schichten</div>
      {days.map(day => cell(null, day, open.filter(x => x.date === day)))}
      <div className="rg-sum" />
    </div></div>
  );
}

/* ---------------------------------------------------------------- Tag */
function DayView({ date, rows, open, scope, canPlan, onCell }: { date: string; rows: Staff[]; open: Shift[]; scope: string[]; canPlan: (dep: string) => boolean; onCell: (staffId: string | null, day: string) => void }) {
  const d = useData();
  const g = expectedGuests(d, date);
  const H0 = 5, H1 = 29; // 05:00 bis 05:00 Folgetag (Nachtschichten)
  const pct = (min: number) => `${Math.max(0, Math.min(100, ((min - H0 * 60) / ((H1 - H0) * 60)) * 100))}%`;
  const bars = (s: Shift) => {
    const out: [number, number][] = [];
    const add = (a: string, b: string) => { const x = toMin(a) < H0 * 60 ? toMin(a) + 1440 : toMin(a); out.push([x, x + ((toMin(b) - toMin(a) + 1440) % 1440)]); };
    add(s.start, s.end); if (s.start2 && s.end2) add(s.start2, s.end2);
    return out;
  };
  const people = rows.filter(s => d.shifts.some(x => x.staffId === s.id && x.date === date) || absenceOn(d, s.id, date));
  const line = (key: string, name: string, list: Shift[], staffId: string | null, extra?: string) => (
    <div key={key} className="rd-row">
      <div className="rd-name">{name}{extra && <small className="muted"> {extra}</small>}</div>
      <div className="rd-track" onClick={() => onCell(staffId, date)}>
        {list.flatMap(s => bars(s).map(([a, b], i) => (
          <button key={s.id + i} className={'rd-bar' + (scope.includes(s.departmentId) ? '' : ' other')} style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})`, background: shiftColor(d, s) }}
            onClick={e => { e.stopPropagation(); openDialog({ type: 'shift', shift: s }); }} draggable={false} title={`${templateTimes(s)}`}>
            {i === 0 ? `${shiftLabel(d, s)} ${s.start}–${s.end}` : `${s.start2}–${s.end2}`}</button>
        )))}
      </div>
    </div>
  );
  return (
    <div className="roster-day">
      <div className="rd-guests">{g.services.map(s => <span key={s.id} className="badge">{s.name}: {s.guests} Gäste</span>)}{holidayName(date) && <span className="badge">{holidayName(date)}</span>}</div>
      <div className="rd-row rd-scale"><div className="rd-name" /><div className="rd-track">{Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i).filter(h => h % 2 === 1).map(h =>
        <span key={h} style={{ left: pct(h * 60) }}>{String(h % 24).padStart(2, '0')}</span>)}</div></div>
      {people.map(s => { const ab = absenceOn(d, s.id, date); return line(s.id, s.name, d.shifts.filter(x => x.staffId === s.id && x.date === date), s.id, ab ? `(${ABSENCE_LABEL[ab.kind]})` : undefined); })}
      {open.filter(x => x.date === date).length > 0 && line('open', 'Offene Schichten', open.filter(x => x.date === date), null)}
      {!people.length && !open.some(x => x.date === date) && <p className="muted">An diesem Tag ist noch niemand eingeplant.</p>}
      {scope.some(canPlan) && <p className="muted no-print" style={{ fontSize: 12 }}>Tipp: In eine Zeile klicken, um einen Dienst einzutragen – oder in der Wochenansicht planen.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- Monat */
function MonthGrid({ days, rows }: { days: string[]; rows: Staff[] }) {
  const d = useData();
  const ui = useUi();
  const t0 = today();
  return (
    <div className="table-scroll"><table className="list roster-month">
      <thead><tr><th>Mitarbeiter/in</th>{days.map(day => <th key={day} className={(day === t0 ? 'today ' : '') + (holidayName(day) ? 'holiday' : '')} title={holidayName(day)}>{+day.slice(8)}<br /><small>{fmtShort(day).slice(0, 2)}</small></th>)}<th>Std.</th></tr></thead>
      <tbody>{rows.map(s => (
        <tr key={s.id}>
          <td className="nm"><Dot color={s.color} />{s.name}</td>
          {days.map(day => {
            const list = d.shifts.filter(x => x.staffId === s.id && x.date === day), ab = absenceOn(d, s.id, day);
            return <td key={day} className={'mc' + (day === t0 ? ' today' : '') + (ab ? ' abs ' + ab.kind : '')} onClick={() => ui.set({ rosterMode: 'woche', rosterDate: day })}
              title={ab ? ABSENCE_LABEL[ab.kind] : list.map(x => templateTimes(x)).join(', ')}>
              {ab ? ABSENCE_SHORT[ab.kind] : list.map(x => <span key={x.id} className="mc-shift" style={{ background: shiftColor(d, x) }}>{shiftLabel(d, x).slice(0, 3)}</span>)}</td>;
          })}
          <td className="sum">{fmtHours(staffMinutes(d, s.id, days[0], days[days.length - 1]))}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/* ---------------------------------------------------------------- Hinweise */
function WarningList({ warnings }: { warnings: RosterWarning[] }) {
  const d = useData();
  if (!warnings.length) return <p className="muted roster-ok no-print">✓ Keine Hinweise zu Ruhezeiten, Pausen, Wochenstunden, Abwesenheiten und Qualifikationen.</p>;
  const sorted = [...warnings].sort((a, b) => Number(b.severe) - Number(a.severe) || a.date.localeCompare(b.date));
  return (
    <details className="roster-warnings no-print" open={warnings.some(w => w.severe)}>
      <summary><TriangleAlert />{warnings.length} Hinweis{warnings.length > 1 ? 'e' : ''} zur Prüfung{warnings.some(w => w.severe) && <span className="badge warn">{warnings.filter(w => w.severe).length} Konflikt{warnings.filter(w => w.severe).length > 1 ? 'e' : ''}</span>}</summary>
      <ul>{sorted.map((w, i) => {
        const s = d.shifts.find(x => x.id === w.shiftId);
        return <li key={i} className={w.severe ? 'severe' : ''}><span className="muted">{fmtShort(w.date)}</span> {w.text}
          {s && <button className="link" onClick={() => openDialog({ type: 'shift', shift: s })}>Dienst öffnen</button>}</li>;
      })}</ul>
    </details>
  );
}

/** Kurzinfo zur Arbeitszeit eines Dienstes (für Dialoge) */
export const shiftHoursText = (s: Shift) => fmtHours(shiftWorkMin(s));
