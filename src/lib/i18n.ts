/** Oberflächentexte – zentral abgelegt, vorbereitet für IT/EN */
const DE: Record<string, string> = {
  live: 'Live-Plan', zeit: 'Zeitleiste', res: 'Reservierungen', hotel: 'Hotelgäste', berichte: 'Berichte',
  editor: 'Raumplan-Editor', settings: 'Einstellungen',
  angefragt: 'Angefragt', bestaetigt: 'Bestätigt', eingetroffen: 'Eingetroffen', platziert: 'Platziert',
  rechnung: 'Rechnung', abgeschlossen: 'Abgeschlossen', storniert: 'Storniert', noshow: 'No-Show',
  frei: 'Frei', reserviert: 'Reserviert', bald: 'Bald fällig', ueberfaellig: 'Überfällig', gesperrt: 'Gesperrt', ueberzogen: 'Zeit überzogen',
  admin: 'Admin / Betriebsleitung', empfang: 'Empfang / Host', service: 'Service', kueche: 'Küche',
  UF: 'Übernachtung/Frühstück', HP: 'Halbpension', VP: 'Vollpension', AI: 'All-Inclusive',
  fenster: 'Fensterplatz', rollstuhl: 'Rollstuhlgerecht', hund: 'Hundeplatz', kinder: 'Kinderecke', ruhig: 'Ruhig',
  fruehstueck: 'Frühstück', mittag: 'Mittag', abend: 'Abend',
  round: 'Rund', square: 'Quadratisch', rect: 'Rechteckig', bench: 'Bank/Sitzgruppe',
  wall: 'Wand', door: 'Tür', bar: 'Bar/Theke', buffet: 'Buffet', column: 'Säule', plant: 'Pflanze', label: 'Text'
};
export const t = (k: string): string => DE[k] ?? k;
