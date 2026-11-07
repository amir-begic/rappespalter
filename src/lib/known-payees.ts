// Swiss and international brands and common words in payee names, for suggesting a category when the
// user has no history with a payee. Data only, public names, no network. Adding a brand
// is one entry. A category the database doesn't have simply gives no suggestion.
//
// Brands match as whole words, and the longest match wins, so "Migros Restaurant" beats
// "Migros". Accents are ignored when matching, because banks often drop them ("HOPITAL").
// Left out on purpose: words that also mean something else, such as "Zurich"
// (the city), "Swiss" (airline or Swiss Life), "Post", "Apple" (a shop or a subscription) and
// "Marché" (a restaurant chain, but also French for market).

export interface KnownPayees {
  categories: string[] // the first one the database has
  brands:     string[]
  ambiguous?: true     // sold as several things: let the user's own categories decide
}

export const KNOWN_BRANDS: KnownPayees[] = [
  { categories: ["Groceries"], brands: [
    "migros", "migrolino", "coop", "coop pronto", "denner", "aldi", "aldi suisse", "lidl", "volg", "spar",
    "alnatura", "farmy", "prodega", "transgourmet", "aligro", "topcc", "manor food", "globus delicatessa",
    "avec", "negozio", "reformhaus", "vatter", "biomarkt", "nah&frisch",
  ]},
  { categories: ["Dining & Bars"], brands: [
    "mcdonald", "mcdonalds", "mcdonald s", "burger king", "kfc", "subway", "starbucks", "five guys", "holy cow",
    "vapiano", "tibits", "hiltl", "nordsee", "dean&david", "dean david", "molino", "autogrill", "brioche dorée",
    "migros restaurant", "coop restaurant", "manor restaurant", "ikea restaurant", "migros take away",
    "just eat", "justeat", "eat ch", "uber eats", "smood", "too good to go", "sprüngli", "spettacolo",
    "caffe spettacolo", "pret a manger", "domino s", "dominos", "yooji s", "yoojis", "negishi", "kaisin",
    "cafe de paris", "bindella", "mövenpick", "lindt cafe",
  ]},
  { categories: ["Transport"], brands: [
    "sbb", "cff", "ffs", "sbb mobile", "postauto", "bls", "sob", "rhb", "zvv", "vbz", "vbsg", "tpg", "bernmobil",
    "matterhorn gotthard", "zentralbahn", "thurbo", "ostwind", "libero", "tnw", "bvb", "tpf", "transn", "vvl",
    "mobility", "publibike", "lime", "bolt", "uber", "flixbus", "edelweiss", "easyjet", "swiss international",
    "tamoil", "avia", "socar", "migrol", "shell", "agrola", "esso", "eni", "ruedi rüssel", "coop mineraloel",
    // Romandie and Ticino
    "transports publics", "tilo", "cgn", "mbc", "tmr", "léman express", "unireso", "mobilis", "frimobil",
    "arcobaleno", "autolinee", "ferrovie luganesi", "fart",
    "easypark", "parkingpay", "sixt", "europcar", "hertz", "amag", "emil frey", "tcs garage",
  ]},
  { categories: ["Shopping"], brands: [
    // Electronics
    "digitec", "galaxus", "digitec galaxus", "brack", "interdiscount", "fust", "melectronics", "mediamarkt",
    "media markt", "microspot", "steg", "conrad", "fnac",
    // Department stores and online marketplaces
    "manor", "jelmoli", "globus", "loeb", "amazon", "aliexpress", "temu", "shein", "ricardo", "tutti", "anibis",
    // Clothes and sport
    "h&m", "zara", "c&a", "mango", "uniqlo", "tally weijl", "snipes", "zalando", "about you", "bonprix",
    "ochsner", "ochsner sport", "sportxx", "decathlon", "intersport", "athleticum", "transa", "bächli",
    // Home and garden
    "ikea", "pfister", "micasa", "conforama", "jysk", "lipo", "interio", "depot", "jumbo", "hornbach", "bauhaus",
    "obi", "do it garden", "landi", "coop bau hobby", "bau hobby",
    // Books, gifts and everything else
    "orell füssli", "thalia", "ex libris", "exlibris", "payot", "nespresso", "tchibo", "tedi", "action", "pepco",
    "ottos", "otto s", "qualipet", "fressnapf", "zooplus", "naville", "k kiosk", "press & books", "läderach",
    "douglas", "marionnaud", "import parfumerie", "lush", "müller", "mueller",
  ]},
  { categories: ["Healthcare"], brands: [
    "amavita", "sunstore", "sun store", "coop vitality", "pharmacieplus", "topwell", "dropa", "medbase", "benu", "rotpunkt",
    "hirslanden", "fielmann", "visilab", "mcoptic", "swiss medical network", "kieser",
  ]},
  { categories: ["Health Insurance"], brands: [
    "css", "helsana", "swica", "sanitas", "visana", "concordia", "assura", "kpt", "atupri", "groupe mutuel",
    "mutuel", "sympany", "vivao sympany", "oekk", "ökk", "egk", "aquilana", "agrisano", "philos", "avenir",
    "easy sana", "galenos", "rhenusana", "sodalis", "slkk", "vita surselva", "progrès", "intras",
  ]},
  { categories: ["Insurance"], brands: [
    "mobiliar", "die mobiliar", "la mobilière", "axa", "allianz", "allianz suisse", "baloise", "helvetia",
    "generali", "vaudoise", "smile direct", "dextra", "zurich versicherung", "swiss life", "pax", "simpego", "wefox",
    "emmental versicherung", "orion rechtsschutz", "protekta", "coop rechtsschutz", "tcs",
    "la mobiliare", "mobiliare", "zurich assurance", "zurich assicurazioni", "retraites populaires",
  ]},
  { categories: ["Mobile"], brands: [
    "yallo", "lebara", "lycamobile", "coop mobile", "aldi suisse mobile", "m budget mobile", "talk talk", "sbb mobile abo",
  ]},
  { categories: ["Internet"], brands: ["init7", "quickline", "green ch", "netplus", "vtx", "ggaweb", "iway", "fiber7"] },
  // Mobile, internet and TV from one provider, so either category can be right.
  { categories: ["Mobile", "Internet"], ambiguous: true, brands: [
    "swisscom", "sunrise", "upc", "salt", "wingo", "digital republic", "teleboy", "m budget",
  ]},
  { categories: ["Utilities"], brands: [
    "serafe", "ewz", "ewb", "ckw", "bkw", "axpo", "repower", "sak", "sgsw", "st galler stadtwerke", "iwb", "sig",
    "romande energie", "ewl", "aew", "ekz", "egl", "eniwa", "energie wasser bern", "groupe e", "primeo", "energie 360",
    "stadtwerk winterthur", "energie thun", "ebl", "ebm", "tb wil", "technische betriebe",
    // Romandie and Ticino
    "services industriels", "sil", "viteos", "oiken", "esr", "seic", "sierre energie", "aet", "ail", "ame",
    "aim", "azienda elettrica", "aziende industriali",
  ]},
  { categories: ["Entertainment"], brands: [
    "netflix", "spotify", "disney", "youtube", "steam", "playstation", "nintendo", "audible", "dazn", "blue tv",
    "kitag", "pathé", "cinedome", "arena cinemas", "blue cinema", "ticketcorner", "starticket", "eventfrog",
    "petzi", "ticketmaster", "seetickets", "europa park", "technorama", "verkehrshaus", "alpamare", "connyland",
    "nzz", "tages anzeiger", "tagblatt", "republik", "watson", "le temps", "24 heures", "tribune de genève",
    "corriere del ticino", "la regione",
  ]},
  { categories: ["Personal"], brands: [
    "klipp", "gidor", "update fitness", "activ fitness", "fitnesspark", "migros fitnesspark", "klubschule", "migros klubschule",
  ]},
  { categories: ["Donations"], brands: [
    "glückskette", "chaîne du bonheur", "catena della solidarietà", "caritas", "heks", "swissaid", "helvetas",
    "fastenaktion", "brot für alle", "terre des hommes", "unicef", "wwf", "greenpeace", "pro natura", "birdlife",
    "amnesty", "amnesty international", "ärzte ohne grenzen", "médecins sans frontières", "medici senza frontiere",
    "msf", "rotes kreuz", "croix rouge", "croce rossa", "srk", "heilsarmee", "armée du salut", "esercito della salvezza",
    "pro juventute", "pro senectute", "pro infirmis", "krebsliga", "ligue contre le cancer", "lega contro il cancro",
    "winterhilfe", "sos kinderdorf", "sos villages d enfants", "solidar suisse", "tierschutz", "schweizer tierschutz",
    "vier pfoten", "plan international", "world vision", "compassion", "mission 21", "rega", "public eye",
    "stiftung theodora", "theodora", "pro specie rara", "stiftung kinderhilfe", "kinderhilfe",
  ]},
  // Shops of charities: what's bought there isn't a donation.
  { categories: ["Groceries"], brands: ["caritas markt", "caritas laden", "épicerie caritas"] },
  { categories: ["Shopping"], brands: ["heilsarmee brocki", "brockenhaus", "brocki", "caritas secondhand", "texaid"] },
  // Brokers and pillar 3a providers: a fixed monthly payment to them is saving, not rent.
  { categories: ["ETF Investment"], brands: [
    "swissquote", "interactive brokers", "degiro", "saxo bank", "true wealth", "selma finance", "inyova", "descartes finance",
  ]},
  { categories: ["Säule 3a"], brands: ["viac", "frankly", "finpension", "vorsorgestiftung 3a", "stiftung 3a", "3a vorsorge"] },
  { categories: ["Transport"], brands: ["amag leasing", "bmw financial services", "multilease", "mercedes benz financial"] },

  // Abroad: what people pay while travelling.
  { categories: ["Groceries"], brands: [
    "tesco", "sainsbury", "sainsburys", "waitrose", "asda", "morrisons", "carrefour", "auchan", "monoprix", "intermarché",
    "leclerc", "rewe", "edeka", "penny", "netto", "kaufland", "albert heijn", "mercadona", "esselunga", "conad", "walmart",
    "costco", "whole foods", "trader joe s",
  ]},
  { categories: ["Dining & Bars"], brands: [
    "costa coffee", "greggs", "nando s", "wagamama", "tim hortons", "dunkin", "chipotle", "taco bell", "wendy s",
    "pizza hut", "papa john s", "deliveroo", "wolt", "lieferando", "doordash", "glovo",
  ]},
  { categories: ["Transport"], brands: [
    "ryanair", "wizz air", "lufthansa", "klm", "british airways", "air france", "emirates", "turkish airlines", "austrian airlines",
    "deutsche bahn", "sncf", "trenitalia", "öbb", "oebb", "renfe", "eurostar", "trainline", "tfl", "lyft", "freenow", "enterprise rent",
  ]},
  { categories: ["Shopping"], brands: ["primark", "ebay", "etsy", "sephora", "muji", "lego store", "rossmann"] },
  { categories: ["Healthcare"], brands: ["boots pharmacy", "walgreens", "cvs pharmacy"] },
  { categories: ["Travel"], brands: [
    "booking com", "airbnb", "expedia", "hotels com", "trivago", "agoda", "getyourguide", "hostelworld", "tripadvisor", "vrbo",
    "marriott", "hilton", "hyatt", "accor", "ibis", "novotel", "holiday inn", "best western", "motel one", "ihg",
  ]},
]

// Names that contain a brand but aren't it: these never give a suggestion.
export const NOT_THE_BRAND = [
  "migros bank", "coop bank", "swiss life select", "manor ag lohn", "axa arena", "helvetia platz", "helvetiaplatz",
]

// Common words in payee names: German, French, Italian and English, one line each. English
// is common in Switzerland and abroad. A weaker sign than a brand. From six letters they
// also match inside a word ("Stadtapotheke"), shorter ones only as a word.
export const KNOWN_WORDS: KnownPayees[] = [
  { categories: ["Dining & Bars"], brands: [
    "restaurant", "imbiss", "takeaway", "take away", "kebab", "kebap", "döner", "doener", "sushi", "burger", "pizza",
    "steakhouse", "bistro", "coffee", "lounge", "pub", "tea room", "tearoom",
    "gasthof", "gasthaus", "wirtshaus", "beiz", "kaffee", "konditorei", "confiserie",
    "brasserie", "auberge", "crêperie", "buvette", "taverne", "café", "pâtisserie",
    "ristorante", "trattoria", "osteria", "pizzeria", "grotto", "caffè", "gelateria", "pasticceria", "paninoteca",
    "takeout", "take out", "diner", "grill", "cafeteria", "canteen", "eatery", "food court", "tavern", "brewery",
  ]},
  { categories: ["Groceries"], brands: [
    "bäckerei", "baeckerei", "metzgerei", "hofladen", "käserei", "supermarkt", "getränke",
    "boulangerie", "boucherie", "fromagerie", "laiterie", "épicerie", "primeur", "charcuterie",
    "panetteria", "panificio", "macelleria", "caseificio", "latteria", "alimentari", "supermercato",
    "bakery", "butcher", "supermarket", "grocery", "groceries", "greengrocer", "deli", "minimarket", "mini market", "liquor store",
  ]},
  { categories: ["Healthcare"], brands: [
    "apotheke", "drogerie", "arztpraxis", "gruppenpraxis", "zahnarzt", "spital", "klinik", "physio", "optiker",
    "pharmacie", "droguerie", "cabinet médical", "médecin", "dentiste", "dentaire", "hôpital", "clinique", "opticien",
    "farmacia", "drogheria", "studio medico", "medico", "dentista", "ospedale", "clinica", "ottica",
    "pharmacy", "drugstore", "chemist", "hospital", "clinic", "dentist", "dental", "doctor", "medical centre", "medical center", "optician",
  ]},
  { categories: ["Transport"], brands: [
    "tankstelle", "parkhaus", "parkgarage", "autobahn", "autogarage", "parking", "vignette", "taxi",
    "station service", "autoroute", "stationnement",
    "distributore", "benzina", "autostrada", "parcheggio", "autosilo",
    "leasing",
    "gas station", "petrol", "fuel", "car park", "motorway", "toll road", "car rental", "rent a car", "railway", "ferry", "airline", "airlines", "airways",
  ]},
  { categories: ["Donations"], brands: [
    "spende", "spenden", "gönnerbeitrag", "gönnerschaft", "hilfswerk",
    "donation", "dons", "œuvre d entraide", "cotisation de soutien",
    "donazione", "donazioni", "beneficenza", "opera assistenziale",
    "charity", "donate",
  ]},
  { categories: ["Taxes"], brands: [
    "steueramt", "steuerverwaltung", "steuerrechnung",
    "administration fiscale", "administration des contributions", "impôts",
    "amministrazione fiscale", "ufficio delle contribuzioni", "imposte",
    "steuerbezug", "steuerkasse", "staatssteuer", "gemeindesteuer", "gemeindesteuern", "bundessteuer",
    "eidgenössische steuerverwaltung", "estv", "finanzverwaltung",
    "service des contributions", "impôt", "recette générale",
    "imposta", "imposta federale",
    "tax office", "tax authority",
  ]},
  { categories: ["Rent"], brands: [
    "liegenschaften", "immobilien", "hausverwaltung",
    "régie immobilière", "gérance", "immobilier",
    "immobiliare", "amministrazione stabili",
    "property management", "real estate", "letting agent",
  ]},
  { categories: ["Utilities"], brands: [
    "stadtwerke", "elektrizitätswerk", "wasserversorgung",
    "services industriels", "électricité", "service des eaux",
    "aziende industriali", "azienda elettrica", "azienda acqua",
    "gemeindewerke", "werkbetriebe", "elektra", "fernwärme", "kehricht", "abwasser",
    "electricity", "water company", "power company",
  ]},
  { categories: ["Personal"], brands: [
    "coiffeur", "friseur", "barbershop", "barber", "kosmetik", "fitness",
    "coiffure", "salon de coiffure", "esthétique", "institut de beauté", "onglerie",
    "parrucchiere", "barbiere", "estetica", "palestra",
    "hairdresser", "hair salon", "nail salon", "beauty salon", "spa", "gym",
  ]},
  { categories: ["Entertainment"], brands: [
    "kino", "theater", "konzert", "museum", "festival", "stadion", "bergbahnen", "seilbahn",
    "cinéma", "théâtre", "concert", "musée", "stade", "remontées mécaniques", "téléphérique",
    "teatro", "concerto", "museo", "stadio", "funivia", "impianti di risalita",
    "stadium", "ski lift", "cable car", "amusement park", "aquarium", "zoo",
  ]},
  { categories: ["Health Insurance"], brands: [
    "krankenkasse", "krankenversicherung",
    "caisse maladie", "assurance maladie",
    "cassa malati", "assicurazione malattia",
    "health insurance",
  ]},
  { categories: ["Insurance"], brands: [
    "versicherung",
    "assurance", "assurances",
    "assicurazione", "assicurazioni",
    "insurance",
  ]},
  { categories: ["Travel"], brands: [
    "jugendherberge", "ferienwohnung", "campingplatz", "reisebüro",
    "auberge de jeunesse", "agence de voyages",
    "albergo", "ostello", "agenzia viaggi",
    "hotel", "hostel", "motel", "resort", "guesthouse", "guest house", "bed & breakfast", "camping", "travel agency",
  ]},
  { categories: ["Shopping"], brands: [
    "buchhandlung", "boutique", "blumen", "eisenwaren",
    "librairie", "fleuriste", "papeterie", "quincaillerie",
    "libreria", "fioraio", "cartoleria", "ferramenta",
    "bookstore", "bookshop", "florist", "stationery", "hardware store", "department store", "duty free", "gift shop", "souvenir",
  ]},
]
