/** Startdaten der Bestellliste: Lieferanten mit Artikeln nach Gruppen (aus den Papierlisten, Okt. 2026).
 *  Telefonnummer zum Testen; wird je Lieferant in den Einstellungen gepflegt. */
export const SEED_PHONE = '+39 366 159 5025';

export const SUPPLIER_SEED: { name: string; groups: [string, string[]][] }[] = [
  {
    name: 'Agostini',
    groups: [
      ['Alkoholfreies & Bier', ['Orangensaft', 'Pfirsich Joga', 'Wasser ohne / mit Sprudel 0,75', 'Wasser ohne / mit Sprudel 0,5', 'Prosecco Cuvee', 'San Bitter Weiss / Rot',
        'Pompelmosaft', 'Schweppes Bitter Lemon', 'Schweppes Ginger Ale', 'Schweppes Tonic Water/Wild Berry', 'Fever Three Tonic Water', 'Fever Three Ginger Beer',
        'Fever Three Pink Grapefruit', 'Fentimans Rose Limonade', 'Passionsfrucht Tonic Limestone', 'Coca Cola "Zero"', 'Kiste Limonade 1l', 'Kiste Aranciata 1l',
        'Kiste Coca Cola 1l', 'Kiste Apfelsaft 1l', 'Kiste Eistee 1l', 'Forst Alkoholfrei 0,0', 'Hefe Weihenstefan 0,0', 'Forst Felsenkeller']],
      ['Bier & Spirituosen', ['Hefe Weihenstefan 0,5', 'Bier Dunkel 0,33 Sixtus', 'Fass Bier', 'Averna', 'Braulio', 'Cynar', 'Fernet Branca / Menta', 'Montenegro',
        'Ramazotti', 'Amaretto', 'Bailys', 'Contreau', 'Bacardi 8y', 'Grand Marnier', 'Limoncello', 'Sambuca', 'Villa Laviosa Nosselar / Enzian', 'Chardonnay Walcher',
        'Pircher Obstler', 'Pircher Williams', 'Unterthurner Waldler', 'Vinschgauer Marillenbrand Stocker', 'Absolut / Uro Edelschwarz', 'Tequila']]
    ]
  },
  {
    name: 'Vinothek Mairhofer',
    groups: [
      ['Weißwein & Rosé', ['Weissburgunder "Festival"', 'Weissburgunder Terlan', 'Weissburgunder Platt & Rigl', 'Riesling Laimburg', 'Riesling Vinschgau',
        'Grüner Veltliner Eisacktal', 'Grüner Veltliner Ebner', 'Sauvignon "Cosmas"', 'Sauvignon "Winkl"', 'Sauvignon "Myra"', 'Chardonnay Lageder',
        'Chardonnay "Cardellino"', 'Chardonnay "Belasy"', 'Pinot Grigio "Soll"', 'Pinot Grigio Penon', 'Pinot Grigio "Unterebner"', 'Gewürztraminer "Damian"',
        'Goldmuskateller Kaltern', 'Moscato Giallo Manincor', 'Kerner "Aristos" Eisacktal', 'Kerner Neustift', 'Sylvaner Eisacktal', 'Terlaner Cuvee', 'Stoan Cuvee',
        'Lugana Ca dei Frati', 'Bianco di Custoza', 'Gavi di Gavi', 'Lagrein Rosé Pischl', 'Rosé Innerleiterhof Schenna', 'Giardino Rosé', 'Rosa dei Frati']],
      ['Rotwein', ['Vernatsch "Fass Nr. 9"', 'Vernatsch "Quintessenz"', 'St. Magdalener "Huck am Bach"', 'St. Magdalener "Classico" Waldgries', 'Zweigelt Ebner',
        'Blauburgunder Ploner Marling', 'Blauburgunder Englar', 'Lagrein Waldgries', 'Lagrein Villa Schmid', 'Lagrein "Prestige Line"', 'Merlot Elena Walch',
        'Merlot Riserva Laimburg', 'Merlot Tramin', 'Cabernet Sauvignon Tramin', 'Cabernet Franc "Puit"', 'Cabernet Riserva "Staffes"', 'T-Rot Cuvee', 'Zeder Cuvee',
        'Amistar Cuvee', 'Reserve del Conte IGT', 'Primitivo di Manduria', 'Primitivo di Manduria il BACCA', 'Rosso di Montepulciano', 'Chianti Nipozzano Riserva',
        'Brunello di Montalcino', 'Ripassa Valpolicella Superiore', 'Amaro Cavolo', "Barbera d'Asti Montebruna", 'Barbaresco Tradizione "Marchesi"', 'Barolo "Marchesi"']],
      ['Spirituosen', ['Lagavulin 8 y', 'Ballantines', 'Remy Martin', 'Bushmills', 'Vecchia Romagna', 'Lagavulin', 'Puni Nova / Gold', 'Monkey Shoulder', 'Jack Daniels',
        'Buffalo', 'Ter Lignum', 'Abbagnac Kloster Neustift', 'Birnenschnaps Schenna', 'Altitude Amaro Schenna']],
      ['Schaumwein & weitere Weine', ['Vernablanc Schenna', 'Comitissa Pas Dosè Riserva', 'Arunda Rosé Brut Millesimato', 'Prosecco Carmina', 'Prosecco Rosé Millesimato',
        'Bollinger Special Cuvèe', 'Bellavista Grande Cuvee Alma', 'Vernaccia di San Gimigiano', 'K-White Cuvee', 'Chardonnay "Festival"', 'Rosalie Rose',
        'Vernatsch Meran', 'Alano Toggenburg', 'Lagrein / Blauburgunder "Zemmer"']],
      ['Sonstiges', ['Aperol / Campari', 'Martini Rot / Weiß', 'Ramazotti Rosato', 'Lillet Weiß/Rot', 'Italicus']],
      ['Grappa / Rum', ['Walcher St. Magdalena', 'Nonino Chardonnay', 'Berta Monpra', 'Prosecco Andrea de Ponte', 'Morbida Smooth Poli', 'Ron Zacapa 23 Centenario',
        'Diplomatico Riserva']]
    ]
  }
];
