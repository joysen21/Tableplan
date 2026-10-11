import { forwardRef } from 'react';
import * as L from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/* Duoton-Icons im JoKe-Design (wie im Planner): Linie + halbtransparente Fläche in der Icon-Farbe.
   Geschlossene Formen (rect, circle, …) füllt app.css automatisch. Icons, die nur aus offenen
   Linien bestehen, bekommen hier eine zusätzliche Fläche (.duo). Reine Strich-Icons
   (Chevron, Plus, Minus, X) bleiben bewusst ohne Fläche.
   Icons immer aus diesem Modul importieren, nicht direkt aus 'lucide-react'. */
export * from 'lucide-react';

function duo(Base: LucideIcon, area: string): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(({ children, ...p }, ref) => (
    <Base ref={ref} {...p}><path className="duo" d={area} />{children}</Base>
  ));
  Icon.displayName = Base.displayName;
  return Icon as LucideIcon;
}

const dots = (cx: number, ys: number[], r: number) => ys.map(y => `M${cx} ${y - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0-${2 * r}z`).join('');

export const BedDouble = duo(L.BedDouble, 'M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6zM4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4z');
export const ChartColumn = duo(L.ChartColumn, 'M6.5 13h3v4h-3zM11.5 4.5h3V17h-3zM16.5 8.5h3V17h-3z');
export const ChartGantt = duo(L.ChartGantt, 'M10 4.5h8v3h-8zM8 9.5h7v3H8zM12 14.5h6v3h-6z');
export const Download = duo(L.Download, 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z');
export const Upload = duo(L.Upload, 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z');
export const List = duo(L.List, dots(3, [5, 12, 19], 2.2));
export const ListChecks = duo(L.ListChecks, 'M4 3.5h6a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 10V5A1.5 1.5 0 0 1 4 3.5zM4 13.5h6a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 20v-5A1.5 1.5 0 0 1 4 13.5z');
export const LogOut = duo(L.LogOut, 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4z');
export const Moon = duo(L.Moon, 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401z');
export const PersonStanding = duo(L.PersonStanding, dots(12, [5], 2.6));
export const Printer = duo(L.Printer, 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2z');
export const RotateCcw = duo(L.RotateCcw, 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z');
export const Settings = duo(L.Settings, 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915z');
export const SlidersHorizontal = duo(L.SlidersHorizontal, 'M12.5 2.5h3v5h-3zM6.5 9.5h3v5h-3zM14.5 16.5h3v5h-3z');
export const Trash2 = duo(L.Trash2, 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z');
export const TriangleAlert = duo(L.TriangleAlert, 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z');
export const Utensils = duo(L.Utensils, 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2zM21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z');
