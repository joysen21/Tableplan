/** Symbole für Reservierungs-Status – feste Auswahl, damit Listen und Plan einheitlich bleiben */
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Accessibility, Armchair, Baby, Ban, Beer, Bell, CakeSlice, Car, CheckCheck, CircleCheck, Clock, Coffee, CreditCard, Crown, DoorOpen, Euro, Flag, Gift,
  HandPlatter, Heart, Hourglass, Martini, MessageCircle, Music, PartyPopper, Phone, Receipt, Soup, Sparkles, Star, Timer, UserX, Utensils, Wine
} from './icons';

export const STATUS_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'anfrage', label: 'Anfrage', Icon: Clock }, { key: 'ok', label: 'Bestätigt', Icon: CircleCheck }, { key: 'tuer', label: 'Eingetroffen', Icon: DoorOpen },
  { key: 'sessel', label: 'Am Tisch', Icon: Armchair }, { key: 'rechnung', label: 'Rechnung', Icon: Receipt }, { key: 'fertig', label: 'Fertig', Icon: CheckCheck },
  { key: 'storno', label: 'Storniert', Icon: Ban }, { key: 'noshow', label: 'Nicht erschienen', Icon: UserX },
  { key: 'aperitif', label: 'Aperitif', Icon: Martini }, { key: 'wein', label: 'Wein', Icon: Wine }, { key: 'bier', label: 'Bier', Icon: Beer },
  { key: 'kaffee', label: 'Kaffee', Icon: Coffee }, { key: 'suppe', label: 'Vorspeise', Icon: Soup }, { key: 'hauptgang', label: 'Hauptgang', Icon: Utensils },
  { key: 'servieren', label: 'Serviert', Icon: HandPlatter }, { key: 'dessert', label: 'Dessert', Icon: CakeSlice }, { key: 'glocke', label: 'Ruft', Icon: Bell },
  { key: 'warten', label: 'Wartet', Icon: Hourglass }, { key: 'timer', label: 'Zeit', Icon: Timer }, { key: 'zahlen', label: 'Zahlt (Karte)', Icon: CreditCard },
  { key: 'euro', label: 'Zahlt (bar)', Icon: Euro }, { key: 'stern', label: 'Stern', Icon: Star }, { key: 'krone', label: 'VIP', Icon: Crown },
  { key: 'herz', label: 'Herz', Icon: Heart }, { key: 'feier', label: 'Feier', Icon: PartyPopper }, { key: 'geschenk', label: 'Geschenk', Icon: Gift },
  { key: 'kind', label: 'Kinder', Icon: Baby }, { key: 'barrierefrei', label: 'Barrierefrei', Icon: Accessibility }, { key: 'telefon', label: 'Telefon', Icon: Phone },
  { key: 'nachricht', label: 'Nachricht', Icon: MessageCircle }, { key: 'auto', label: 'Abholung', Icon: Car }, { key: 'flagge', label: 'Markiert', Icon: Flag },
  { key: 'funken', label: 'Besonders', Icon: Sparkles }, { key: 'musik', label: 'Musik', Icon: Music }
];

const byKey = (key: string | undefined) => STATUS_ICONS.find(x => x.key === key);

/** Symbol eines Status (ohne passendes Symbol nichts) */
export function StatusIcon({ icon, size = 13, className }: { icon: string | undefined; size?: number; className?: string }) {
  const e = byKey(icon);
  return e ? <e.Icon size={size} className={'st-icon' + (className ? ' ' + className : '')} aria-hidden="true" /> : null;
}

/** Symbol wählen: Knopf mit aktuellem Symbol, klappt die Palette auf */
export function StatusIconPicker({ value, color, label, onChange }: { value: string; color: string; label: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = byKey(value);
  return (
    <span className="st-icon-picker">
      <button type="button" className="btn small icon" aria-label={`Symbol ${label}`} aria-expanded={open} title="Symbol wählen" onClick={() => setOpen(!open)} style={{ color }}>
        {cur ? <cur.Icon size={18} /> : '?'}</button>
      {open && <span className="icon-palette st-palette" role="radiogroup" aria-label={`Symbol für ${label}`}>
        {STATUS_ICONS.map(({ key, label: l, Icon }) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} className="icon-opt" title={l} aria-label={l}
            onClick={() => { onChange(key); setOpen(false); }}><Icon size={18} style={{ color }} /></button>
        ))}
      </span>}
    </span>
  );
}
