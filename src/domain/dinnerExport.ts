/** Export „Abendessen“ eines Tages: je Zimmer bzw. externer Reservierung Tisch, Personen, Gerichte je Gang, Notiz und Allergien –
 *  als Tabelle (Bericht) und CSV; später auch als tägliche Mail. */
import { menuCourses, menuRooms } from './guestMenu';
import { allergyText } from './menu';
import { byId, isCancelled, tableNames } from './logic';
import type { Course, Menu, VenueData } from './types';

export interface DinnerRow { room: string; name: string; table: string; persons: number; dishes: Partial<Record<Course, string>>; note: string; allergies: string; chosen: boolean }
export interface DinnerExport { menu?: Menu; serviceName: string; courses: Course[]; rows: DinnerRow[]; totals: { course: Course; name: string; n: number }[]; open: number }

export function dinnerExport(d: VenueData, date: string): DinnerExport {
  const svc = d.services.find(s => s.kind === 'abend');
  const menu = svc && d.menus.find(m => m.date === date && m.serviceId === svc.id);
  if (!svc || !menu) return { serviceName: svc?.name ?? 'Abendessen', courses: [], rows: [], totals: [], open: 0 };
  const courses = menuCourses(menu.items);
  const name = (dishId: string) => byId(d.dishes, dishId)?.name ?? menu.items.find(i => i.dishId === dishId)?.name ?? '?';
  const totals = new Map<string, { course: Course; name: string; n: number }>();
  const rows = menuRooms(d, menu).map((p): DinnerRow => {
    const counts = p.choice?.counts ?? {};
    const dishes: Partial<Record<Course, string>> = {};
    for (const c of courses) {
      const list = menu.items.filter(i => i.course === c && (counts[i.dishId] ?? 0) > 0);
      if (list.length) dishes[c] = list.map(i => `${counts[i.dishId]}× ${name(i.dishId)}`).join(', ');
      for (const i of list) {
        const e = totals.get(i.dishId) ?? { course: c, name: name(i.dishId), n: 0 };
        e.n += counts[i.dishId]; totals.set(i.dishId, e);
      }
    }
    // Tisch: Reservierung des Zimmers bzw. die externe Reservierung selbst
    const res = p.res ?? (p.stay && d.reservations.find(r => r.stayId === p.stay!.id && r.date === date && r.serviceId === svc.id && !isCancelled(r)));
    return {
      room: p.stay?.roomNo ?? '', name: p.stay?.name ?? p.res?.name ?? '', table: res ? tableNames(d, res.tableIds) : '', persons: p.persons, dishes,
      note: p.choice?.note ?? '', allergies: [p.stay && allergyText(p.stay), p.res && allergyText(p.res)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · '),
      chosen: Object.values(counts).some(n => n > 0)
    };
  });
  return {
    menu, serviceName: svc.name, courses, rows,
    totals: courses.flatMap(c => [...totals.values()].filter(x => x.course === c)),
    open: rows.filter(r => !r.chosen).length
  };
}

/** CSV-Zeilen: Kopf, je Zimmer eine Zeile, danach Summen je Gericht */
export function dinnerCsv(x: DinnerExport, courseLabel: (c: Course) => string): (string | number)[][] {
  return [
    ['Zimmer', 'Name', 'Tisch', 'Personen', ...x.courses.map(courseLabel), 'Notiz', 'Allergien'],
    ...x.rows.map(r => [r.room, r.name, r.table, r.persons, ...x.courses.map(c => r.dishes[c] ?? ''), r.note, r.allergies]),
    [],
    ['Summe je Gericht'],
    ...x.totals.map(t => [courseLabel(t.course), t.name, t.n])
  ];
}
