// Kopie dieser Datei als "config.js" ablegen und die Werte aus Supabase eintragen:
// Supabase-Dashboard → Project Settings → API (bzw. "API Keys").
// Der anon/publishable Key ist für den Browser gedacht; die Daten schützt Row Level Security.
// NIEMALS den service_role/secret Key hier eintragen!
// Ohne config.js läuft das Tool im lokalen Modus (Daten nur in diesem Browser).
window.TISCHPLAN_CONFIG = {
  supabaseUrl: 'https://IHR-PROJEKT.supabase.co',
  supabaseAnonKey: 'IHR-ANON-ODER-PUBLISHABLE-KEY',
  historyDays: 120 // so viele Tage zurück werden Reservierungen geladen
};
