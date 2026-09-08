    // =========================================================
    // Global state
    // =========================================================

    let map = null;
    let baseTileLayer = null;
    let initialMapReadyFallbackTimer = null;
    let initialMapPanelHideTimer = null;
    let directRouteLayer = null;
    let lastPosition = null;
    let geolocationWatchId = null;
    let meAccuracyCircle = null;
    let locationControlButton = null;
    let locationTrackingWanted = false;
    let lastRoutePosition = null;
    let lastRouteRefreshAt = 0;
    let latestRouteInstructions = null;
    let latestDirectionsExternalUrl = '';
    let locations = [];            // parsed locations from CSV
    let markers = [];              // Leaflet markers
    let markerLayoutController = null;
    let meLocationMarker = null;   // current user location marker
    let controlsVisible = false;   // controls panel visibility
    let controlsCollapsed = false; // collapsed atlas state across layouts
    let directionsVisible = false; // directions panel visibility
    let shelfVisible = false;      // stash shelf overlay visibility
    let heroPopupVisible = false; // intro popup is opt-in from settings.
    let selectionCardCollapsed = false; // compact landscape destination card state
    let previousCompactLandscapeLayout = false;
    let strainListVisible = false; // Strain matching stays collapsed until requested.
    let viewportResyncTimers = [];
    let uiTogglePositionTimer = null;
    let locationSearchText = '';
    let locationSearchAreaAnchorCache = { key: '', anchors: [] };
    let globalSearchStrainTimer = null;
    let globalSearchFocusTimer = null;
    let globalSearchAppliedStrainKey = '';
    let globalSearchResolveRequestId = 0;
    let destinationSearchComposing = false;
    let pendingInitialSearchPresentation = false;
    let locationRequestInFlight = null;
    let missionMode = 'free-roam';
    let activePopupLocationIndex = null;
    let nearbyExploreActive = false;
    let mapFilterHistory = [];
    let restoringMapFilterState = false;
    let mapSessionReady = false;
    let mapSessionSaveTimer = null;
    let activeMapSessionDatasetKey = '';
    let initialViewportRestored = false;
    let lastDestinationSelectValue = '';
    let guideVisible = false;
    let journeyPlanner = {
      start: null,
      stops: []
    };
    let savedJourneys = [];
    let journeyLayerGroup = null;

    // Multi-select categories: 'all', 'favourites', and CSV Y/N flags
    let selectedCategories = ['all'];
    let categoryOptions = [];

    // Category fallback icons are used only when a location has no custom logo.
    const fallbackCategoryOrder = [
      'coffeeshop',
      'hotel',
      'museum',
      'landmark',
      'food',
      'bar',
      'transport',
      'park',
      'shopping',
      'viewpoint',
      'area',
      'other'
    ];
    const fallbackCategoryLabels = {
      coffeeshop: 'Coffeeshop',
      hotel: 'Hotel',
      museum: 'Museum',
      landmark: 'Landmark',
      food: 'Food',
      bar: 'Bar',
      transport: 'Transport',
      park: 'Park',
      shopping: 'Shopping',
      viewpoint: 'Viewpoint',
      area: 'Area',
      other: 'Location'
    };
    const categoryIcons = {};
    let defaultIcon;

    // Distance at which we consider "already at this location" (in meters)
    const VISITED_RADIUS_METERS = 5;

    // Downloaded logos live under images/logos/. Keep this narrow so missing
    // files do not trigger repeated fallback requests during map rendering.
    const STRAIN_IMAGE_BASE_PATHS = ['images/strains/', './images/strains/', '/images/strains/'];
    const STRAIN_IMAGE_MAP_CANDIDATES = [
      'database/strain_image_map.csv',
      './database/strain_image_map.csv',
      '/database/strain_image_map.csv',
      'strain_image_map.csv',
      './strain_image_map.csv',
      '/strain_image_map.csv'
    ];
    const FALLBACK_MARKER_ICON_URL =
      'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png';
    const LOGO_MARKER_SIZE = 44;
    const POPUP_LOGO_SIZE = 76;
    const ME_MARKER_SIZE = 32;
    const AREA_SEARCH_RADIUS_METERS = 900;

    // DB integration state
    let dbIntegrationReady = false;
    let dbIntegrationSource = 'none'; // 'flask' | 'json' | 'none'
    let dbRouteLinksEnabled = false;
    let dbByShopKey = new Map();    // "cs-shop" -> shop_id
    let dbByPath = new Map();       // "/cs-shop.html" -> shop_id
    let dbByNameCity = new Map();   // "name|city" -> shop_id
    let dbByUniqueName = new Map(); // "name" -> shop_id when unique
    let dbShopMetaById = new Map(); // shop_id -> { name, city, shop_url }
    let dbUnavailableShopIds = new Set(); // shop ids hidden from current browsing
    let explorerFocusShopIds = null; // Set<string> | null, from Price & Menus handoff
    let explorerFocusStrainName = '';
    let explorerFocusStrainShopIds = null; // Set<string> | null, all shops carrying handoff strain

    // Strain filter state (DB-backed)
    let strainFilterText = '';
    let strainAllowedShopIds = null; // Set<number> | null
    let strainAllowedNameCityKeys = null; // Set<string> | null
    let strainPriceByShopId = null; // Map<number, string> | null
    let strainPriceByNameCity = null; // Map<string, string> | null
    let strainCheapestShopIds = null; // Set<number> | null
    let strainCheapestNameCityKeys = null; // Set<string> | null
    let strainCheapestPriceLabel = '';
    let offeringAttributeFilterKind = ''; // '' | 'grower' | 'legal'
    let offeringAttributeFilterValue = '';
    let strainIndexRows = null;      // cached JSON strain index
    let strainIndexRowsPromise = null;
    let activeOfferingsRows = null;  // cached JSON offerings rows
    let activeOfferingsRowsPromise = null;
    let activeStrainNames = [];      // clickable strain list for UI panel
    let popupStrainsByShopId = new Map();      // shop_id -> [strain names]
    let popupStrainsByNameCity = new Map();    // "name|city" -> [strain names]
    let popupStrainDetailsByShopId = new Map();   // shop_id -> Map(strain_key -> {priceText, growerText, notesText, priceEntries})
    let popupStrainDetailsByNameCity = new Map(); // "name|city" -> Map(strain_key -> {priceText, growerText, notesText, priceEntries})
    let popupMenuUpdatedByShopId = new Map();     // shop_id -> latest offering updated timestamp
    let popupMenuUpdatedByNameCity = new Map();   // "name|city" -> latest offering updated timestamp
    let popupMenuBatchSignal = null;              // shared export refresh window, if detected
    let strainAveragePricesByKey = new Map(); // strain_key -> Map("currency|unit" -> average price info)
    let popupStrainIndexReady = false;
    let popupStrainIndexPromise = null;
    let strainMetaByKey = new Map(); // normalised strain name -> visual metadata
    let strainImageByKey = new Map(); // normalised strain name -> image filename
    let strainImageMapReady = false;
    let strainImageMapPromise = null;
    const MASTER_COFFEESHOP_CSV_PATH = 'database/locations/coffeeshops.csv';
    let masterCoffeeshopRowsPromise = null;
    let nationwideLocationRowsPromise = null;
    let discoveredCsvPaths = [];     // discovered CSV paths in the hosted folder
    let currentCsvPath = '';         // current CSV path when loaded from URL
    // Versionless Budfinder keys are the permanent home; legacy locate keys keep older pages compatible.
    const PERSONALISATION_STORAGE_KEYS = ['budfinder_personalisation', 'locate3_personalisation', 'locate2_personalisation'];
    const LOCATION_PREFERENCES_STORAGE_KEYS = ['budfinder_location_preferences', 'locate3_location_preferences'];
    const LOCATION_DATA_STORAGE_KEYS = ['budfinder_location_data_csv_path'];
    const LOCATION_DATA_EXPLICIT_SELECTION_STORAGE_KEYS = ['budfinder_location_data_user_selected'];
    const LEGACY_FAVORITES_STORAGE_KEY = 'favorites';
    const RECENT_DESTINATIONS_STORAGE_KEYS = ['budfinder_recent_destinations', 'locate3_recent_destinations'];
    const STRAIN_SHELF_STORAGE_KEYS = ['budfinder_strain_shelf', 'locate3_strain_shelf'];
    const SAVED_JOURNEYS_STORAGE_KEYS = ['budfinder_saved_journeys'];
    const TOP_SHELF_RAIL_COLLAPSED_STORAGE_KEYS = ['budfinder_top_shelf_rail_collapsed', 'locate3_top_shelf_rail_collapsed'];
    const MAP_FOCUS_SHOPS_STORAGE_KEY = 'budfinder_map_focus_shops';
    const MAP_SESSION_STORAGE_KEY = 'budfinder_map_sessions_v1';
    const MAP_SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
    const MAP_SESSION_VIEWPORT_MAX_DISTANCE_METERS = 100000;
    const HOW_GUIDE_DISABLED_STORAGE_KEY = 'budfinder_how_guide_disabled';
    const MENU_BATCH_FRESHNESS_FIELDS = new Set(['menu_checked_at_utc', 'last_seen_at_utc', 'last_seen_at', 'updated_at']);
    const MENU_SHARED_BATCH_CLUSTER_GAP_MS = 10 * 60 * 1000;
    const accentThemeAliases = {
      'neon-night': 'kings-juice',
      'midnight-radar': 'blue-zushi',
      'canal-glow': 'shoreline',
      'emerald-haze': 'amazing-haze',
      'amber-route': 'moonrocks',
      'kings juice': 'kings-juice',
      "king's juice": 'kings-juice',
      'blue zushi': 'blue-zushi',
      amazinghaze: 'amazing-haze',
      'amazing haze': 'amazing-haze',
      amber: 'moonrocks',
      lagoon: 'shoreline',
      ember: 'moonrocks',
      moss: 'northern-lights',
      'golden-haze': 'moonrocks',
      'pine-resin': 'amazing-haze',
      'citrus-haze': 'pineapple-express',
      'rosewood-smoke': 'shoreline',
      'coastal-kush': 'blue-zushi',
      'sour diesel': 'sour-diesel',
      'super silver haze': 'super-silver-haze',
      'tropicana cherry': 'tropicana-cherry',
      'white widow': 'white-widow',
      'wedding cake': 'wedding-cake',
      'strawberry cough': 'strawberry-cough',
      'purple haze': 'purple-haze',
      'wizard fuel pheno': 'wizard-fuel-pheno',
      'west-ham': 'west-ham-united',
      'tottenham-hotspur': 'spurs'
    };
    const accentThemes = {
      'northern-lights': {
        accent: '#2e7b59',
        accentStrong: '#205b42',
        accentSoft: 'rgba(46, 123, 89, 0.16)',
        accentGlow: 'rgba(46, 123, 89, 0.28)',
        bgTop: '#efe2b6',
        bgMid: '#e6d9b6',
        bgBottom: '#d4e2cb',
        panel: 'rgba(255, 249, 239, 0.84)',
        panelStrong: 'rgba(255, 252, 246, 0.94)',
        panelBorder: 'rgba(98, 113, 95, 0.16)',
        sunWash: 'rgba(255, 243, 210, 0.92)',
        mistWash: 'rgba(184, 223, 206, 0.7)',
        resinGlow: 'rgba(222, 160, 82, 0.34)'
      },
      'lemon-haze': {
        accent: '#c3b018',
        accentStrong: '#7f7208',
        accentSoft: 'rgba(195, 176, 24, 0.18)',
        accentGlow: 'rgba(195, 176, 24, 0.34)',
        bgTop: '#fff09f',
        bgMid: '#f4e67a',
        bgBottom: '#d8e7a2',
        panel: 'rgba(255, 250, 232, 0.87)',
        panelStrong: 'rgba(255, 252, 241, 0.96)',
        panelBorder: 'rgba(152, 139, 42, 0.18)',
        sunWash: 'rgba(255, 247, 157, 0.98)',
        mistWash: 'rgba(217, 232, 147, 0.72)',
        resinGlow: 'rgba(236, 212, 60, 0.4)'
      },
      mimosa: {
        accent: '#df7a2f',
        accentStrong: '#8f4413',
        accentSoft: 'rgba(223, 122, 47, 0.18)',
        accentGlow: 'rgba(223, 122, 47, 0.32)',
        bgTop: '#ffd2a1',
        bgMid: '#ffbc87',
        bgBottom: '#f0d0a7',
        panel: 'rgba(255, 244, 232, 0.88)',
        panelStrong: 'rgba(255, 251, 241, 0.96)',
        panelBorder: 'rgba(169, 108, 52, 0.18)',
        sunWash: 'rgba(255, 198, 126, 0.96)',
        mistWash: 'rgba(245, 207, 166, 0.62)',
        resinGlow: 'rgba(241, 137, 52, 0.38)'
      },
      'og-kush': {
        accent: '#3d7a3c',
        accentStrong: '#224a27',
        accentSoft: 'rgba(61, 122, 60, 0.18)',
        accentGlow: 'rgba(61, 122, 60, 0.3)',
        bgTop: '#e7d7b0',
        bgMid: '#dbd1af',
        bgBottom: '#cadec6',
        panel: 'rgba(248, 247, 238, 0.86)',
        panelStrong: 'rgba(252, 252, 246, 0.95)',
        panelBorder: 'rgba(74, 99, 75, 0.18)',
        sunWash: 'rgba(245, 230, 191, 0.9)',
        mistWash: 'rgba(176, 213, 189, 0.68)',
        resinGlow: 'rgba(138, 113, 63, 0.28)'
      },
      'sour-diesel': {
        accent: '#7aa11f',
        accentStrong: '#4e6713',
        accentSoft: 'rgba(122, 161, 31, 0.18)',
        accentGlow: 'rgba(122, 161, 31, 0.3)',
        bgTop: '#efe39c',
        bgMid: '#dde09a',
        bgBottom: '#cfe0b7',
        panel: 'rgba(251, 250, 235, 0.87)',
        panelStrong: 'rgba(255, 252, 242, 0.96)',
        panelBorder: 'rgba(121, 135, 63, 0.18)',
        sunWash: 'rgba(245, 230, 149, 0.92)',
        mistWash: 'rgba(197, 222, 167, 0.7)',
        resinGlow: 'rgba(176, 188, 72, 0.34)'
      },
      'wizard-fuel-pheno': {
        accent: '#3f6e5a',
        accentStrong: '#233e35',
        accentSoft: 'rgba(63, 110, 90, 0.18)',
        accentGlow: 'rgba(63, 110, 90, 0.28)',
        bgTop: '#ddd9c5',
        bgMid: '#d2d8cf',
        bgBottom: '#c8d5dd',
        panel: 'rgba(244, 248, 245, 0.87)',
        panelStrong: 'rgba(250, 252, 250, 0.96)',
        panelBorder: 'rgba(84, 104, 95, 0.18)',
        sunWash: 'rgba(235, 227, 197, 0.88)',
        mistWash: 'rgba(181, 206, 197, 0.64)',
        resinGlow: 'rgba(102, 136, 123, 0.28)'
      },
      'pineapple-express': {
        accent: '#b36d2b',
        accentStrong: '#78451a',
        accentSoft: 'rgba(179, 109, 43, 0.18)',
        accentGlow: 'rgba(179, 109, 43, 0.28)',
        bgTop: '#f4dc9e',
        bgMid: '#ebcf8e',
        bgBottom: '#d7e0b5',
        panel: 'rgba(255, 248, 234, 0.87)',
        panelStrong: 'rgba(255, 251, 242, 0.96)',
        panelBorder: 'rgba(138, 101, 54, 0.18)',
        sunWash: 'rgba(255, 232, 171, 0.94)',
        mistWash: 'rgba(204, 223, 173, 0.68)',
        resinGlow: 'rgba(219, 163, 77, 0.34)'
      },
      'super-silver-haze': {
        accent: '#7b889b',
        accentStrong: '#475366',
        accentSoft: 'rgba(123, 136, 155, 0.18)',
        accentGlow: 'rgba(123, 136, 155, 0.28)',
        bgTop: '#e8e7df',
        bgMid: '#d6dde4',
        bgBottom: '#c5d1dd',
        panel: 'rgba(247, 249, 251, 0.89)',
        panelStrong: 'rgba(252, 254, 255, 0.97)',
        panelBorder: 'rgba(103, 116, 134, 0.18)',
        sunWash: 'rgba(236, 237, 240, 0.88)',
        mistWash: 'rgba(190, 205, 223, 0.7)',
        resinGlow: 'rgba(142, 162, 186, 0.26)'
      },
      'tropicana-cherry': {
        accent: '#d4684b',
        accentStrong: '#8a3d28',
        accentSoft: 'rgba(212, 104, 75, 0.18)',
        accentGlow: 'rgba(212, 104, 75, 0.3)',
        bgTop: '#ffc8a3',
        bgMid: '#ffb4a0',
        bgBottom: '#f0c8bf',
        panel: 'rgba(255, 244, 239, 0.88)',
        panelStrong: 'rgba(255, 249, 245, 0.96)',
        panelBorder: 'rgba(165, 102, 82, 0.18)',
        sunWash: 'rgba(255, 186, 132, 0.92)',
        mistWash: 'rgba(243, 189, 171, 0.64)',
        resinGlow: 'rgba(235, 122, 74, 0.32)'
      },
      gelonade: {
        accent: '#8bb020',
        accentStrong: '#55700f',
        accentSoft: 'rgba(139, 176, 32, 0.18)',
        accentGlow: 'rgba(139, 176, 32, 0.3)',
        bgTop: '#f0ef9b',
        bgMid: '#dfe97d',
        bgBottom: '#cce2a5',
        panel: 'rgba(251, 252, 235, 0.88)',
        panelStrong: 'rgba(255, 255, 242, 0.96)',
        panelBorder: 'rgba(123, 148, 53, 0.18)',
        sunWash: 'rgba(243, 246, 144, 0.96)',
        mistWash: 'rgba(200, 228, 154, 0.68)',
        resinGlow: 'rgba(180, 210, 69, 0.34)'
      },
      'blue-dream': {
        accent: '#2a6d99',
        accentStrong: '#184564',
        accentSoft: 'rgba(42, 109, 153, 0.18)',
        accentGlow: 'rgba(42, 109, 153, 0.28)',
        bgTop: '#e4dfc7',
        bgMid: '#d9e0d8',
        bgBottom: '#c8dff0',
        panel: 'rgba(245, 249, 252, 0.87)',
        panelStrong: 'rgba(250, 252, 255, 0.96)',
        panelBorder: 'rgba(73, 109, 134, 0.18)',
        sunWash: 'rgba(244, 236, 201, 0.88)',
        mistWash: 'rgba(183, 214, 236, 0.66)',
        resinGlow: 'rgba(100, 155, 193, 0.26)'
      },
      'cherry-gelato': {
        accent: '#8f4058',
        accentStrong: '#572438',
        accentSoft: 'rgba(143, 64, 88, 0.18)',
        accentGlow: 'rgba(143, 64, 88, 0.28)',
        bgTop: '#efd0d9',
        bgMid: '#e4ccd1',
        bgBottom: '#d9d5d8',
        panel: 'rgba(255, 247, 248, 0.87)',
        panelStrong: 'rgba(255, 251, 251, 0.96)',
        panelBorder: 'rgba(122, 77, 92, 0.18)',
        sunWash: 'rgba(245, 206, 218, 0.9)',
        mistWash: 'rgba(216, 205, 211, 0.62)',
        resinGlow: 'rgba(170, 94, 126, 0.28)'
      },
      'white-widow': {
        accent: '#7ea69a',
        accentStrong: '#4a625b',
        accentSoft: 'rgba(126, 166, 154, 0.16)',
        accentGlow: 'rgba(126, 166, 154, 0.24)',
        bgTop: '#fbfaf2',
        bgMid: '#edf3ee',
        bgBottom: '#dce8e4',
        panel: 'rgba(252, 253, 250, 0.9)',
        panelStrong: 'rgba(255, 255, 252, 0.97)',
        panelBorder: 'rgba(113, 133, 127, 0.16)',
        sunWash: 'rgba(255, 252, 239, 0.92)',
        mistWash: 'rgba(210, 231, 223, 0.64)',
        resinGlow: 'rgba(195, 210, 204, 0.2)'
      },
      'wedding-cake': {
        accent: '#b7818d',
        accentStrong: '#744754',
        accentSoft: 'rgba(183, 129, 141, 0.18)',
        accentGlow: 'rgba(183, 129, 141, 0.24)',
        bgTop: '#f5e4db',
        bgMid: '#ece2dd',
        bgBottom: '#dddcd7',
        panel: 'rgba(255, 249, 247, 0.89)',
        panelStrong: 'rgba(255, 252, 251, 0.97)',
        panelBorder: 'rgba(151, 113, 121, 0.18)',
        sunWash: 'rgba(250, 231, 219, 0.9)',
        mistWash: 'rgba(224, 215, 211, 0.62)',
        resinGlow: 'rgba(205, 161, 170, 0.24)'
      },
      runtz: {
        accent: '#c2479c',
        accentStrong: '#7c2a63',
        accentSoft: 'rgba(194, 71, 156, 0.18)',
        accentGlow: 'rgba(194, 71, 156, 0.28)',
        bgTop: '#ffd0dd',
        bgMid: '#f5c8e4',
        bgBottom: '#e5d2f2',
        panel: 'rgba(255, 246, 251, 0.88)',
        panelStrong: 'rgba(255, 250, 253, 0.97)',
        panelBorder: 'rgba(149, 80, 131, 0.18)',
        sunWash: 'rgba(255, 204, 227, 0.92)',
        mistWash: 'rgba(228, 196, 239, 0.66)',
        resinGlow: 'rgba(214, 109, 189, 0.28)'
      },
      zkittlez: {
        accent: '#6aa53f',
        accentStrong: '#3f6626',
        accentSoft: 'rgba(106, 165, 63, 0.18)',
        accentGlow: 'rgba(106, 165, 63, 0.28)',
        bgTop: '#efe3a6',
        bgMid: '#dfe0a6',
        bgBottom: '#d0e2bb',
        panel: 'rgba(250, 249, 236, 0.88)',
        panelStrong: 'rgba(255, 252, 242, 0.96)',
        panelBorder: 'rgba(111, 136, 71, 0.18)',
        sunWash: 'rgba(247, 232, 168, 0.92)',
        mistWash: 'rgba(202, 225, 176, 0.7)',
        resinGlow: 'rgba(163, 192, 88, 0.3)'
      },
      'strawberry-cough': {
        accent: '#c85e64',
        accentStrong: '#823038',
        accentSoft: 'rgba(200, 94, 100, 0.18)',
        accentGlow: 'rgba(200, 94, 100, 0.26)',
        bgTop: '#f5d3d1',
        bgMid: '#edd5d7',
        bgBottom: '#e0d9dc',
        panel: 'rgba(255, 247, 247, 0.88)',
        panelStrong: 'rgba(255, 251, 251, 0.97)',
        panelBorder: 'rgba(151, 98, 103, 0.18)',
        sunWash: 'rgba(250, 217, 215, 0.9)',
        mistWash: 'rgba(224, 214, 219, 0.62)',
        resinGlow: 'rgba(214, 132, 136, 0.24)'
      },
      'purple-haze': {
        accent: '#7a4cff',
        accentStrong: '#4025a8',
        accentSoft: 'rgba(122, 76, 255, 0.18)',
        accentGlow: 'rgba(122, 76, 255, 0.3)',
        bgTop: '#e7dcff',
        bgMid: '#d5d3ff',
        bgBottom: '#c8d9f2',
        panel: 'rgba(248, 246, 255, 0.89)',
        panelStrong: 'rgba(252, 251, 255, 0.97)',
        panelBorder: 'rgba(102, 89, 182, 0.18)',
        sunWash: 'rgba(226, 215, 255, 0.92)',
        mistWash: 'rgba(189, 201, 244, 0.68)',
        resinGlow: 'rgba(118, 104, 255, 0.3)'
      },
      'granddaddy-purple': {
        accent: '#6c3f84',
        accentStrong: '#3e234f',
        accentSoft: 'rgba(108, 63, 132, 0.18)',
        accentGlow: 'rgba(108, 63, 132, 0.3)',
        bgTop: '#e8d0ea',
        bgMid: '#dcc7e0',
        bgBottom: '#d4c6d4',
        panel: 'rgba(251, 246, 252, 0.88)',
        panelStrong: 'rgba(255, 250, 255, 0.96)',
        panelBorder: 'rgba(103, 78, 120, 0.18)',
        sunWash: 'rgba(233, 203, 241, 0.9)',
        mistWash: 'rgba(206, 188, 210, 0.64)',
        resinGlow: 'rgba(126, 82, 148, 0.3)'
      },
      'west-ham-united': {
        accent: '#7a263a',
        accentStrong: '#4d1826',
        accentSoft: 'rgba(122, 38, 58, 0.18)',
        accentGlow: 'rgba(122, 38, 58, 0.3)',
        bgTop: '#efd8de',
        bgMid: '#e1d7df',
        bgBottom: '#d3e1eb',
        panel: 'rgba(255, 248, 250, 0.87)',
        panelStrong: 'rgba(255, 251, 252, 0.96)',
        panelBorder: 'rgba(108, 73, 87, 0.2)',
        sunWash: 'rgba(236, 202, 213, 0.88)',
        mistWash: 'rgba(175, 207, 228, 0.64)',
        resinGlow: 'rgba(98, 162, 206, 0.24)'
      },
      spurs: {
        accent: '#10264d',
        accentStrong: '#09162e',
        accentSoft: 'rgba(16, 38, 77, 0.16)',
        accentGlow: 'rgba(16, 38, 77, 0.24)',
        bgTop: '#f4f4f8',
        bgMid: '#e8eaf2',
        bgBottom: '#d8deec',
        panel: 'rgba(250, 251, 255, 0.88)',
        panelStrong: 'rgba(255, 255, 255, 0.97)',
        panelBorder: 'rgba(94, 106, 136, 0.18)',
        sunWash: 'rgba(250, 250, 255, 0.9)',
        mistWash: 'rgba(208, 217, 236, 0.66)',
        resinGlow: 'rgba(127, 140, 172, 0.22)'
      }
    };
    Object.assign(accentThemes, {
      'kings-juice': {
        accent: '#4df49a',
        accentStrong: '#16b76d',
        accentSoft: 'rgba(77, 244, 154, 0.14)',
        accentGlow: 'rgba(77, 244, 154, 0.32)',
        bgTop: '#06100e',
        bgMid: '#0a1918',
        bgBottom: '#07100f',
        panel: 'rgba(10, 22, 20, 0.76)',
        panelStrong: 'rgba(12, 27, 24, 0.93)',
        panelBorder: 'rgba(153, 255, 203, 0.16)',
        sunWash: 'rgba(77, 244, 154, 0.12)',
        mistWash: 'rgba(78, 170, 158, 0.16)',
        resinGlow: 'rgba(240, 184, 84, 0.16)'
      },
      'blue-zushi': {
        accent: '#61e8ff',
        accentStrong: '#2aa8bd',
        accentSoft: 'rgba(97, 232, 255, 0.14)',
        accentGlow: 'rgba(97, 232, 255, 0.28)',
        bgTop: '#030b13',
        bgMid: '#071622',
        bgBottom: '#050a12',
        panel: 'rgba(7, 18, 29, 0.78)',
        panelStrong: 'rgba(8, 22, 34, 0.94)',
        panelBorder: 'rgba(97, 232, 255, 0.18)',
        sunWash: 'rgba(97, 232, 255, 0.1)',
        mistWash: 'rgba(164, 255, 106, 0.12)',
        resinGlow: 'rgba(97, 232, 255, 0.16)'
      },
      shoreline: {
        accent: '#5fe6b0',
        accentStrong: '#249b79',
        accentSoft: 'rgba(95, 230, 176, 0.14)',
        accentGlow: 'rgba(95, 230, 176, 0.28)',
        bgTop: '#061416',
        bgMid: '#10241f',
        bgBottom: '#07100f',
        panel: 'rgba(14, 28, 25, 0.78)',
        panelStrong: 'rgba(17, 33, 29, 0.94)',
        panelBorder: 'rgba(246, 198, 111, 0.2)',
        sunWash: 'rgba(95, 230, 176, 0.1)',
        mistWash: 'rgba(246, 198, 111, 0.12)',
        resinGlow: 'rgba(246, 198, 111, 0.16)'
      },
      'amazing-haze': {
        accent: '#7df37b',
        accentStrong: '#2aa94b',
        accentSoft: 'rgba(125, 243, 123, 0.14)',
        accentGlow: 'rgba(125, 243, 123, 0.28)',
        bgTop: '#07120a',
        bgMid: '#0d2012',
        bgBottom: '#09100b',
        panel: 'rgba(10, 25, 13, 0.78)',
        panelStrong: 'rgba(13, 32, 18, 0.94)',
        panelBorder: 'rgba(125, 243, 123, 0.18)',
        sunWash: 'rgba(125, 243, 123, 0.1)',
        mistWash: 'rgba(214, 232, 108, 0.12)',
        resinGlow: 'rgba(214, 232, 108, 0.16)'
      },
      moonrocks: {
        accent: '#ffbf63',
        accentStrong: '#c97822',
        accentSoft: 'rgba(255, 191, 99, 0.14)',
        accentGlow: 'rgba(255, 191, 99, 0.28)',
        bgTop: '#120d07',
        bgMid: '#21170c',
        bgBottom: '#0d0c09',
        panel: 'rgba(26, 19, 11, 0.78)',
        panelStrong: 'rgba(35, 25, 13, 0.94)',
        panelBorder: 'rgba(255, 191, 99, 0.2)',
        sunWash: 'rgba(255, 191, 99, 0.11)',
        mistWash: 'rgba(85, 231, 156, 0.1)',
        resinGlow: 'rgba(85, 231, 156, 0.15)'
      },
      'classic-budfinder': accentThemes['northern-lights']
    });

    const categoryColorBase = {
      coffeeshop: { offset: 0, s: 62, l: 37 },
      hotel: { offset: 204, s: 70, l: 45 },
      museum: { offset: 266, s: 58, l: 49 },
      landmark: { offset: 38, s: 68, l: 43 },
      food: { offset: 112, s: 72, l: 46 },
      bar: { offset: 318, s: 58, l: 45 },
      transport: { offset: 172, s: 68, l: 39 },
      park: { offset: 74, s: 58, l: 39 },
      shopping: { offset: 232, s: 78, l: 42 },
      viewpoint: { offset: 140, s: 62, l: 44 },
      area: { offset: 324, s: 64, l: 46 },
      other: { offset: 292, s: 28, l: 43 }
    };

    function clampNumber(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }

    function normaliseHue(value) {
      return ((Number(value) % 360) + 360) % 360;
    }

    function hexToHsl(hex) {
      const raw = (hex || '').toString().trim().replace('#', '');
      const full = raw.length === 3
        ? raw.split('').map(ch => ch + ch).join('')
        : raw;
      if (!/^[0-9a-f]{6}$/i.test(full)) return null;
      let r = parseInt(full.slice(0, 2), 16) / 255;
      let g = parseInt(full.slice(2, 4), 16) / 255;
      let b = parseInt(full.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      const d = max - min;
      if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        if (max === g) h = ((b - r) / d + 2) / 6;
        if (max === b) h = ((r - g) / d + 4) / 6;
      }
      return { h: h * 360, s: s * 100, l: l * 100 };
    }

    function hslToHex(h, s, l) {
      const hue = normaliseHue(h) / 360;
      const sat = clampNumber(s, 0, 100) / 100;
      const light = clampNumber(l, 0, 100) / 100;
      const hueToRgb = (p, q, t) => {
        let channel = t;
        if (channel < 0) channel += 1;
        if (channel > 1) channel -= 1;
        if (channel < 1 / 6) return p + (q - p) * 6 * channel;
        if (channel < 1 / 2) return q;
        if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
        return p;
      };
      let r;
      let g;
      let b;
      if (sat === 0) {
        r = light;
        g = light;
        b = light;
      } else {
        const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
        const p = 2 * light - q;
        r = hueToRgb(p, q, hue + 1 / 3);
        g = hueToRgb(p, q, hue);
        b = hueToRgb(p, q, hue - 1 / 3);
      }
      return '#' + [r, g, b].map(channel => {
        const value = Math.round(channel * 255).toString(16);
        return value.length === 1 ? '0' + value : value;
      }).join('');
    }

    function hexToRgb(hex) {
      const raw = (hex || '').toString().trim().replace('#', '');
      const full = raw.length === 3
        ? raw.split('').map(ch => ch + ch).join('')
        : raw;
      if (!/^[0-9a-f]{6}$/i.test(full)) return null;
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
      };
    }

    function rgbaFromHex(hex, alpha) {
      const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clampNumber(alpha, 0, 1)})`;
    }

    function getRelativeLuminance(hex) {
      const rgb = hexToRgb(hex);
      if (!rgb) return 1;
      const channels = [rgb.r, rgb.g, rgb.b].map(channel => {
        const value = channel / 255;
        return value <= 0.03928
          ? value / 12.92
          : Math.pow((value + 0.055) / 1.055, 2.4);
      });
      return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    }

    function contrastRatio(firstHex, secondHex) {
      const first = getRelativeLuminance(firstHex);
      const second = getRelativeLuminance(secondHex);
      const lighter = Math.max(first, second);
      const darker = Math.min(first, second);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function bestTextForBackground(hex) {
      return contrastRatio(hex, '#06100e') >= contrastRatio(hex, '#ffffff')
        ? '#06100e'
        : '#ffffff';
    }

    const mapThemeToneOverrides = {
      'kings-juice': { text: '#f4fff8', muted: '#c4d9cf', secondary: '#f0b854', surface: '#0a1614', surfaceStrong: '#0f2420', dark: true },
      'blue-zushi': { text: '#eff8ff', muted: '#c2d6e1', secondary: '#a4ff6a', surface: '#071622', surfaceStrong: '#0c2232', dark: true },
      shoreline: { text: '#fff8e8', muted: '#ded4b9', secondary: '#f6c66f', surface: '#0e1c19', surfaceStrong: '#142b26', dark: true },
      'amazing-haze': { text: '#f4fff1', muted: '#c8dec2', secondary: '#d6e86c', surface: '#0a190d', surfaceStrong: '#102615', dark: true },
      moonrocks: { text: '#fff7e8', muted: '#e4d1b4', secondary: '#55e79c', surface: '#1a130b', surfaceStrong: '#2a1d0f', dark: true }
    };

    function getMapThemeTone(themeKey) {
      if (mapThemeToneOverrides[themeKey]) return mapThemeToneOverrides[themeKey];
      return {
        text: '#203128',
        muted: '#46534b',
        secondary: themeKey === 'lemon-haze' ? '#8a7614' : '#b46b20',
        surface: '#ffffff',
        surfaceStrong: '#ffffff',
        dark: false
      };
    }

    function applyCategoryMarkerPalette(theme) {
      const accentHsl = hexToHsl(theme && theme.accent) || { h: 145, s: 56, l: 38 };
      const saturationShift = (accentHsl.s - 56) * 0.14;
      const lightnessShift = (accentHsl.l - 38) * 0.16;
      Object.entries(categoryColorBase).forEach(([category, base]) => {
        document.documentElement.style.setProperty(
          `--category-${category}`,
          hslToHex(
            accentHsl.h + base.offset,
            clampNumber(base.s + saturationShift, 46, 82),
            clampNumber(base.l + lightnessShift, 34, 54)
          )
        );
      });
    }

    let legacyFavoriteIndices = loadStoredJson(LEGACY_FAVORITES_STORAGE_KEY, []);
    let recentDestinationKeys = loadStoredArray(RECENT_DESTINATIONS_STORAGE_KEYS, []);
    let shelfStrainNames = loadStoredArray(STRAIN_SHELF_STORAGE_KEYS, []);
    savedJourneys = loadStoredArray(SAVED_JOURNEYS_STORAGE_KEYS, []);
    const storedTopShelfRailCollapsed = loadStoredJson(TOP_SHELF_RAIL_COLLAPSED_STORAGE_KEYS, null);
    let topShelfRailCollapsed = typeof storedTopShelfRailCollapsed === 'boolean'
      ? storedTopShelfRailCollapsed
      : isCompactMobileLayout();
    let locationPreferences = loadStoredObject(LOCATION_PREFERENCES_STORAGE_KEYS, {});
    let favorites = [];
    let personalisation = {
      displayName: 'Explorer',
      accent: 'kings-juice',
      defaultCity: 'amsterdamLoc.csv',
      distanceUnit: 'metric',
      reduceMotion: false,
      showIntroPopupOnLoad: false
    };

    function normaliseStorageKeys(keys) {
      return Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean);
    }

    function parseStoredJson(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
      } catch (_err) {
        return undefined;
      }
    }

    function loadStoredJson(keys, fallback) {
      const storageKeys = normaliseStorageKeys(keys);
      for (const key of storageKeys) {
        const parsed = parseStoredJson(key);
        if (Array.isArray(fallback)) {
          if (Array.isArray(parsed)) return parsed;
          continue;
        }
        if (fallback && typeof fallback === 'object') {
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
          continue;
        }
        if (typeof parsed !== 'undefined') return parsed;
      }
      return fallback;
    }

    function loadStoredObject(keys, fallback = {}) {
      const storageKeys = normaliseStorageKeys(keys);
      const merged = {};
      let found = false;
      storageKeys.slice().reverse().forEach(key => {
        const parsed = parseStoredJson(key);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        Object.assign(merged, parsed);
        found = true;
      });
      return found ? merged : fallback;
    }

    function loadStoredArray(keys, fallback = []) {
      const storageKeys = normaliseStorageKeys(keys);
      const merged = [];
      const seen = new Set();
      let found = false;
      storageKeys.forEach(key => {
        const parsed = parseStoredJson(key);
        if (!Array.isArray(parsed)) return;
        found = true;
        parsed.forEach(item => {
          const marker = JSON.stringify(item);
          if (seen.has(marker)) return;
          seen.add(marker);
          merged.push(item);
        });
      });
      return found ? merged : fallback;
    }

    function saveStoredJson(keys, value) {
      const storageKeys = normaliseStorageKeys(keys);
      let raw = '';
      try {
        raw = JSON.stringify(value);
      } catch (_err) {
        return;
      }
      storageKeys.forEach(key => {
        try {
          localStorage.setItem(key, raw);
        } catch (_err) {
          // Storage can be blocked in private browsing or hardened browser modes.
        }
      });
    }

    function parseShopIdList(raw) {
      const seen = new Set();
      return (raw || '')
        .toString()
        .split(',')
        .map(value => value.trim())
        .filter(value => /^\d+$/.test(value))
        .filter(value => {
          if (seen.has(value)) return false;
          seen.add(value);
          return true;
        });
    }

    function priceMenusUrl(context = {}) {
      const params = new URLSearchParams();
      const strain = (context.strain || '').toString().trim();
      const rawShopId = context.shopId == null ? '' : String(context.shopId).trim();
      const shopId = rawShopId && Number.isFinite(Number(rawShopId)) ? String(Number(rawShopId)) : '';
      if (shopId) {
        params.set('mode', 'shop');
        params.set('view', 'shops');
        params.set('shop_id', shopId);
        params.set('detail', 'shop');
      } else if (strain) {
        params.set('mode', 'strain');
        if (context.detail !== false) params.set('detail', 'strain');
      }
      if (strain) params.set('strain', strain);
      const query = params.toString();
      return query ? `database.html?${query}` : 'database.html';
    }

    function syncPriceMenusLinks() {
      const mapResearchLink = document.getElementById('map-price-menus-link');
      const navResearchLink = document.getElementById('nav-price-menus-link');
      const activeName = offeringAttributeFilterKind ? '' : getCanonicalStrainName(strainFilterText);
      const selectedIndex = getSelectedDestinationIndex();
      const selectedLocation = selectedIndex !== null ? locations[selectedIndex] : null;
      const selectedShopId = selectedLocation && Number.isFinite(Number(selectedLocation.db_shop_id))
        ? Number(selectedLocation.db_shop_id)
        : null;
      const href = activeName || selectedShopId
        ? priceMenusUrl({ strain: activeName, shopId: selectedShopId })
        : 'database.html';
      if (mapResearchLink) mapResearchLink.href = activeName ? priceMenusUrl({ strain: activeName }) : href;
      if (navResearchLink) {
        navResearchLink.href = href;
        navResearchLink.title = activeName
          ? `Continue viewing ${activeName} in Price & Menus`
          : selectedLocation
            ? `Open the known menu for ${selectedLocation.name || 'this coffeeshop'}`
            : 'Open Price & Menus';
      }
    }

    function loadExplorerFocusContext() {
      const params = new URLSearchParams(window.location.search || '');
      const fromUrl = parseShopIdList(params.get('shops') || params.get('shop_ids') || '');
      const strainName = (params.get('strain') || params.get('strain_name') || '').toString().trim();
      const strainShopIds = parseShopIdList(params.get('strain_shops') || params.get('all_shops') || '');
      if (fromUrl.length || strainName || strainShopIds.length) {
        return {
          shopIds: fromUrl,
          strainName,
          strainShopIds
        };
      }

      try {
        localStorage.removeItem(MAP_FOCUS_SHOPS_STORAGE_KEY);
      } catch (_err) {
        // Storage can be blocked; the important part is that no hidden focus is applied.
      }
      return null;
    }

    function getInitialSearchFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        return (params.get('search') || params.get('q') || '').toString().replace(/\s+/g, ' ').trim();
      } catch (_err) {
        return '';
      }
    }

    function applyInitialSearchFromUrlAfterCsvLoad() {
      const query = getInitialSearchFromUrl();
      if (!query || explorerFocusStrainName) return;

      pendingInitialSearchPresentation = true;
      const searchInput = document.getElementById('destination-search');
      locationSearchText = query;
      if (searchInput) searchInput.value = query;
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      updateControlsSummary();
      refreshDestinationCards();
      setControlsVisible(true, { collapsed: false });
      const visibleLocationCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
      scheduleGlobalSearchStrainResolve(query, visibleLocationCount, {
        immediate: true,
        allowTownSwitch: true
      });
      scheduleInitialSearchPresentation();
    }

    function focusSearchResultsPanel() {
      if (!isCompactMobileLayout()) return;
      setControlsVisible(true, { collapsed: false });
      const content = document.getElementById('map-tools-content');
      const panel = document.querySelector('.search-wanted-panel');
      if (!content || !panel) return;
      const searchInput = document.getElementById('destination-search');
      const target = searchInput || panel;
      const contentRect = content.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = Math.max(0, content.scrollTop + targetRect.top - contentRect.top - 12);
      content.scrollTo({ top: targetTop, behavior: 'auto' });
    }

    function scheduleInitialSearchPresentation() {
      [120, 520, 1100].forEach(delay => {
        window.setTimeout(() => {
          if (!pendingInitialSearchPresentation) return;
          focusSearchResultsPanel();
          fitMapToVisibleMarkers({ searchResults: true });
        }, delay);
      });
    }

    function applyExplorerFocusContext(context) {
      explorerFocusShopIds = context && Array.isArray(context.shopIds) && context.shopIds.length
        ? new Set(context.shopIds)
        : null;
      explorerFocusStrainName = context && context.strainName ? String(context.strainName).trim() : '';
      explorerFocusStrainShopIds = context && Array.isArray(context.strainShopIds) && context.strainShopIds.length
        ? new Set(context.strainShopIds)
        : null;
    }

    function hasExplorerFocus() {
      return explorerFocusShopIds instanceof Set && explorerFocusShopIds.size > 0;
    }

    function locationMatchesExplorerFocus(loc) {
      if (!hasExplorerFocus()) return true;
      if (!loc || !loc.db_shop_id) return false;
      return explorerFocusShopIds.has(String(loc.db_shop_id));
    }

    function clearExplorerFocus(options = {}) {
      explorerFocusShopIds = null;
      if (!options.keepStrainContext) {
        explorerFocusStrainName = '';
        explorerFocusStrainShopIds = null;
      }
      try {
        if (options.keepStrainContext && explorerFocusStrainName) {
          localStorage.setItem(MAP_FOCUS_SHOPS_STORAGE_KEY, JSON.stringify({
            shopIds: [],
            strainName: explorerFocusStrainName,
            strainShopIds: explorerFocusStrainShopIds ? Array.from(explorerFocusStrainShopIds) : [],
            createdAt: new Date().toISOString()
          }));
        } else {
          localStorage.removeItem(MAP_FOCUS_SHOPS_STORAGE_KEY);
        }
      } catch (_err) {
        // Storage can be blocked in private browsing or hardened browser modes.
      }
      if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('shops');
        url.searchParams.delete('shop_ids');
        if (!options.keepStrainContext) {
          url.searchParams.delete('source');
          url.searchParams.delete('strain');
          url.searchParams.delete('strain_name');
          url.searchParams.delete('strain_shops');
          url.searchParams.delete('all_shops');
        }
        window.history.replaceState({}, document.title, url.href);
      }
    }

    function canShowAllExplorerStrainShops() {
      return !!(
        explorerFocusStrainName &&
        explorerFocusStrainShopIds instanceof Set &&
        explorerFocusStrainShopIds.size > 0 &&
        (!explorerFocusShopIds || explorerFocusShopIds.size < explorerFocusStrainShopIds.size)
      );
    }

    function syncExplorerFocusControls() {
      const btn = document.getElementById('show-strain-shops-btn');
      if (!btn) return;
      const canExpand = canShowAllExplorerStrainShops();
      btn.hidden = !canExpand;
      if (canExpand) {
        btn.textContent = `Show all ${explorerFocusStrainShopIds.size} shops`;
        btn.title = `Show every coffeeshop carrying ${explorerFocusStrainName}`;
      } else {
        btn.removeAttribute('title');
      }
    }

    function expandExplorerFocusToStrainShops() {
      if (!canShowAllExplorerStrainShops()) return;
      explorerFocusShopIds = new Set(explorerFocusStrainShopIds);
      try {
        localStorage.setItem(MAP_FOCUS_SHOPS_STORAGE_KEY, JSON.stringify({
          shopIds: Array.from(explorerFocusShopIds),
          strainName: explorerFocusStrainName,
          strainShopIds: Array.from(explorerFocusStrainShopIds),
          createdAt: new Date().toISOString()
        }));
      } catch (_err) {
        // URL still carries the important state.
      }
      if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('source', 'explorer');
        url.searchParams.set('strain', explorerFocusStrainName);
        url.searchParams.delete('shops');
        url.searchParams.delete('shop_ids');
        url.searchParams.delete('strain_shops');
        url.searchParams.delete('all_shops');
        window.history.replaceState({}, document.title, url.href);
      }
      setRouteStatus(`Showing all shops carrying ${explorerFocusStrainName}.`, 'ok');
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      updateControlsSummary();
      refreshDestinationCards();
      syncClearSelectionToggle();
      window.setTimeout(() => fitMapToVisibleMarkers(), 80);
    }

    applyExplorerFocusContext(loadExplorerFocusContext());

    function saveLocationPreferences() {
      saveStoredJson(LOCATION_PREFERENCES_STORAGE_KEYS, locationPreferences);
    }

    function normaliseAccentThemeKey(value) {
      const raw = (value || '').toString().trim();
      const lower = raw.toLowerCase();
      return accentThemeAliases[raw] || accentThemeAliases[lower] || raw;
    }

    function getLocationPreferenceKey(loc) {
      if (!loc) return '';
      const websitePath = normaliseUrlPath(loc.website);
      if (websitePath) return `url:${websitePath}`;
      const nameCityKey = normaliseNameCityKey(loc.name, loc.city || '');
      if (nameCityKey !== '|') return `name:${nameCityKey}`;
      if (Array.isArray(loc.coords) && loc.coords.length === 2) {
        return `coords:${loc.coords[0]},${loc.coords[1]}`;
      }
      return '';
    }

    function readLocationPreference(loc) {
      const key = getLocationPreferenceKey(loc);
      if (!key) return null;
      const stored = locationPreferences[key];
      return (stored && typeof stored === 'object') ? stored : null;
    }

    function writeLocationPreference(loc, patch) {
      const key = getLocationPreferenceKey(loc);
      if (!key || !patch || typeof patch !== 'object') return;
      const current = readLocationPreference(loc) || {};
      locationPreferences[key] = { ...current, ...patch };
      saveLocationPreferences();
    }

    function persistLegacyFavorites() {
      legacyFavoriteIndices = favorites.slice();
      saveStoredJson(LEGACY_FAVORITES_STORAGE_KEY, favorites);
    }

    function saveRecentDestinations() {
      saveStoredJson(RECENT_DESTINATIONS_STORAGE_KEYS, recentDestinationKeys);
    }

    function getCanonicalStrainName(name) {
      const raw = (name || '').toString().replace(/\s+/g, ' ').trim();
      const key = normaliseText(raw);
      if (!key) return '';
      const meta = strainMetaByKey.get(key);
      if (meta && meta.name) return meta.name;
      const activeName = activeStrainNames.find(entry => normaliseText(entry) === key);
      if (activeName) return activeName;
      return raw;
    }

    function normaliseShelfStrainNames(names) {
      const out = [];
      const seen = new Set();
      (Array.isArray(names) ? names : []).forEach(name => {
        const canonical = getCanonicalStrainName(name);
        const key = normaliseText(canonical);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(canonical);
      });
      return out.slice(0, 10);
    }

    function saveShelfStrains() {
      shelfStrainNames = normaliseShelfStrainNames(shelfStrainNames);
      saveStoredJson(STRAIN_SHELF_STORAGE_KEYS, shelfStrainNames);
    }

    function isStrainShelved(name) {
      const key = normaliseText(name);
      if (!key) return false;
      return shelfStrainNames.some(entry => normaliseText(entry) === key);
    }

    function addStrainToShelf(name) {
      const canonical = getCanonicalStrainName(name);
      const key = normaliseText(canonical);
      if (!key) return;
      shelfStrainNames = [canonical, ...shelfStrainNames.filter(entry => normaliseText(entry) !== key)].slice(0, 10);
      saveShelfStrains();
    }

    function removeStrainFromShelf(name) {
      const key = normaliseText(name);
      if (!key) return;
      shelfStrainNames = shelfStrainNames.filter(entry => normaliseText(entry) !== key);
      saveShelfStrains();
    }

    function syncActiveStrainShelfButton() {
      const btn = document.getElementById('toggle-current-strain-shelf-btn');
      const exploreLink = document.getElementById('explore-current-strain-btn');
      if (!btn) return;

      if (!strainFilterText || offeringAttributeFilterKind) {
        btn.disabled = true;
        btn.textContent = offeringAttributeFilterKind ? 'Product filter active' : 'Save strain';
        if (exploreLink) {
          exploreLink.href = 'database.html';
          exploreLink.classList.add('is-disabled');
          exploreLink.setAttribute('aria-disabled', 'true');
          exploreLink.textContent = 'Explore strain';
          exploreLink.removeAttribute('aria-label');
        }
        return;
      }

      btn.disabled = false;
      btn.textContent = isStrainShelved(strainFilterText)
        ? 'Remove saved strain'
        : 'Save strain';
      if (exploreLink) {
        const strainName = getCanonicalStrainName(strainFilterText);
        exploreLink.href = priceMenusUrl({ strain: strainName });
        exploreLink.classList.remove('is-disabled');
        exploreLink.removeAttribute('aria-disabled');
        exploreLink.textContent = 'Explore';
        exploreLink.setAttribute('aria-label', `Explore ${strainName} prices and shops`);
      }
    }

    function toggleShelfMembershipForStrain(name, options = {}) {
      const canonical = getCanonicalStrainName(name);
      if (!canonical) return;
      if (isStrainShelved(canonical)) {
        removeStrainFromShelf(canonical);
      } else {
        addStrainToShelf(canonical);
      }

      renderStrainList();
      updateControlsSummary();
      refreshOpenPopupStrainLists();
    }

    function hydrateLocationPreferences() {
      shelfStrainNames = normaliseShelfStrainNames(shelfStrainNames);
      saveShelfStrains();
      favorites = [];
      let hasStoredFavourite = false;

      locations.forEach((loc, index) => {
        const pref = readLocationPreference(loc);
        if (!pref) return;

        if (typeof pref.visited === 'boolean') {
          loc.visited = pref.visited;
        }

        if (Number.isFinite(pref.rating)) {
          loc.rating = Math.max(0, Math.min(5, Math.round(pref.rating)));
        }

        if (pref.favorite) {
          favorites.push(index);
          hasStoredFavourite = true;
        }
      });

      if (!hasStoredFavourite && Array.isArray(legacyFavoriteIndices)) {
        legacyFavoriteIndices.forEach(index => {
          if (!Number.isInteger(index) || index < 0 || index >= locations.length) return;
          favorites.push(index);
          writeLocationPreference(locations[index], { favorite: true });
        });
      }

      favorites = Array.from(new Set(favorites)).slice(0, 10);
      persistLegacyFavorites();
    }

    function setUploadPanelState(titleText, messageText, allowManualCsv) {
      const panel = document.getElementById('upload-panel');
      const title = document.getElementById('upload-title');
      const message = document.getElementById('upload-message');
      if (title) title.textContent = titleText || '';
      if (message) message.textContent = messageText || '';
      if (panel) panel.style.display = titleText || messageText ? 'block' : 'none';
    }

    function setLandingVisible(visible) {
      const landing = document.getElementById('landing-page');
      const show = !!visible;
      document.body.classList.toggle('landing-active', show);
      if (!landing) return;
      landing.classList.toggle('is-dismissed', !show);
      landing.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (!show) {
        window.setTimeout(() => {
          if (landing.classList.contains('is-dismissed')) landing.hidden = true;
        }, 240);
      } else {
        landing.hidden = false;
      }
    }

    function isHowGuideDisabled() {
      try {
        return localStorage.getItem(HOW_GUIDE_DISABLED_STORAGE_KEY) === '1';
      } catch (_err) {
        return false;
      }
    }

    function setHowGuideDisabled(disabled) {
      try {
        if (disabled) {
          localStorage.setItem(HOW_GUIDE_DISABLED_STORAGE_KEY, '1');
        } else {
          localStorage.removeItem(HOW_GUIDE_DISABLED_STORAGE_KEY);
        }
      } catch (_err) {
        // Storage can be unavailable in private browsing.
      }
      syncHowGuidePreferenceUi();
    }

    function shouldOpenHowGuideFromUrl() {
      return false;
    }

    function syncHowGuidePreferenceUi() {
      const disabled = isHowGuideDisabled();
      const checkbox = document.getElementById('guide-disable-checkbox');
      const toggleBtn = document.getElementById('toggle-how-guide-pref-btn');
      const note = document.getElementById('how-guide-pref-note');
      if (checkbox) checkbox.checked = disabled;
      if (toggleBtn) toggleBtn.textContent = disabled ? 'Enable how guide' : 'Disable how guide';
      if (note) {
        note.textContent = disabled
          ? 'The how guide is disabled. You can still open it manually.'
          : 'The guide can appear when a link asks for it, and it is always available from Map tools.';
      }
    }

    function setGuideVisible(visible, options = {}) {
      const overlay = document.getElementById('how-guide');
      if (!overlay) {
        guideVisible = false;
        return;
      }
      guideVisible = !!visible;
      overlay.hidden = !guideVisible;
      overlay.classList.toggle('is-visible', guideVisible);
      syncHowGuidePreferenceUi();
      if (guideVisible && options.focus !== false) {
        const closeBtn = document.getElementById('guide-close-btn');
        if (closeBtn) closeBtn.focus({ preventScroll: true });
      }
    }

    function openBudfinderFromLanding(options = {}) {
      setLandingVisible(false);
      dismissHeroPopup();
      if (locations.length && !controlsVisible) {
        setControlsVisible(true, { collapsed: isCompactMobileLayout() });
      }
    }

    function loadPersonalisation() {
      try {
        const merged = loadStoredObject(PERSONALISATION_STORAGE_KEYS, {});
        if (merged && typeof merged === 'object') {
          const hasDisplayName = Object.prototype.hasOwnProperty.call(merged, 'displayName');
          const displayName = (merged.displayName || '').toString().replace(/\s+/g, ' ').trim().slice(0, 24);
          const accent = normaliseAccentThemeKey(merged.accent || '');
          if (hasDisplayName) personalisation.displayName = displayName;
          if (accentThemes[accent]) personalisation.accent = accent;
          personalisation.defaultCity = (merged.defaultCity || personalisation.defaultCity).toString().split('/').pop() || 'amsterdamLoc.csv';
          personalisation.distanceUnit = merged.distanceUnit === 'miles' ? 'miles' : 'metric';
          personalisation.reduceMotion = merged.reduceMotion === true;
        }
        personalisation.showIntroPopupOnLoad = false;
        heroPopupVisible = false;
      } catch (_err) {
        // Ignore malformed stored preferences.
      }
    }

    function savePersonalisation() {
      saveStoredJson(PERSONALISATION_STORAGE_KEYS, personalisation);
    }

    function currentMapUserName() {
      const value = (personalisation.displayName || '')
        .toString()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24);
      return value && value.toLowerCase() !== 'explorer' ? value : '';
    }

    function applyPersonalisation() {
      const theme = accentThemes[personalisation.accent] || accentThemes['northern-lights'];
      const rawName = (personalisation.displayName || '').toString().replace(/\s+/g, ' ').trim().slice(0, 24);
      const userName = currentMapUserName();
      const root = document.documentElement;
      root.setAttribute('data-budfinder-reduced-motion', personalisation.reduceMotion ? 'true' : 'false');
      root.style.setProperty('--bg-top', theme.bgTop);
      root.style.setProperty('--bg-mid', theme.bgMid);
      root.style.setProperty('--bg-bottom', theme.bgBottom);
      root.style.setProperty('--sun-wash', theme.sunWash);
      root.style.setProperty('--mist-wash', theme.mistWash);
      root.style.setProperty('--resin-glow', theme.resinGlow);
      root.style.setProperty('--panel', theme.panel);
      root.style.setProperty('--panel-strong', theme.panelStrong);
      root.style.setProperty('--panel-border', theme.panelBorder);
      root.style.setProperty('--accent', theme.accent);
      root.style.setProperty('--accent-strong', theme.accentStrong);
      root.style.setProperty('--accent-soft', theme.accentSoft);
      root.style.setProperty('--accent-glow', theme.accentGlow);
      const tone = getMapThemeTone(personalisation.accent);
      root.setAttribute('data-map-theme', personalisation.accent);
      root.setAttribute('data-map-theme-tone', tone.dark ? 'dark' : 'light');
      root.style.setProperty('--ink', tone.text);
      root.style.setProperty('--muted', tone.muted);
      root.style.setProperty('--soft', rgbaFromHex(tone.text, tone.dark ? 0.58 : 0.62));
      root.style.setProperty('--secondary-accent', tone.secondary);
      root.style.setProperty('--button-text', tone.dark ? '#06100e' : bestTextForBackground(theme.accent));
      root.style.setProperty('--map-primary-button-bg', tone.dark
        ? `linear-gradient(135deg, ${theme.accent}, ${tone.secondary})`
        : `linear-gradient(135deg, ${theme.accent}, ${theme.accentStrong})`);
      root.style.setProperty('--map-primary-button-hover', tone.dark
        ? `linear-gradient(135deg, ${tone.secondary}, ${theme.accent})`
        : `linear-gradient(135deg, ${theme.accentStrong}, ${theme.accent})`);
      root.style.setProperty('--control-color-scheme', tone.dark ? 'dark' : 'light');
      root.style.setProperty('--control-bg', tone.dark ? rgbaFromHex(tone.surface, 0.94) : 'rgba(255, 255, 255, 0.72)');
      root.style.setProperty('--control-bg-strong', tone.dark ? rgbaFromHex(tone.surfaceStrong, 0.98) : 'rgba(255, 255, 255, 0.88)');
      root.style.setProperty('--control-bg-hover', tone.dark ? rgbaFromHex(tone.surfaceStrong, 1) : 'rgba(255, 255, 255, 0.96)');
      root.style.setProperty('--control-border', tone.dark ? rgbaFromHex(tone.text, 0.34) : 'rgba(92, 107, 97, 0.16)');
      root.style.setProperty('--control-text', tone.text);
      root.style.setProperty('--control-muted', tone.muted);
      root.style.setProperty('--control-selected-bg', tone.dark ? rgbaFromHex(theme.accent, 0.28) : rgbaFromHex(theme.accent, 0.14));
      root.style.setProperty('--control-selected-border', rgbaFromHex(theme.accent, tone.dark ? 0.62 : 0.3));
      root.style.setProperty('--leaf-pattern-opacity', tone.dark ? '0.035' : '0.065');
      root.style.setProperty('--leaf-pattern-blend', tone.dark ? 'screen' : 'multiply');
      applyCategoryMarkerPalette(theme);

      const kicker = document.getElementById('hero-kicker');
      const mapToolsTitle = document.getElementById('map-tools-title');
      const mapIntentTitle = document.getElementById('map-intent-title');
      const journeySectionTitle = document.getElementById('journey-section-title');
      const journeyNameInput = document.getElementById('journey-name-input');
      const nameInput = document.getElementById('display-name-input');
      const defaultCitySelect = document.getElementById('settings-default-city-select');
      const distanceUnitSelect = document.getElementById('settings-distance-unit-select');
      const reduceMotionInput = document.getElementById('settings-reduce-motion-input');
      const heroPopupBtn = document.getElementById('toggle-hero-popup-pref-btn');
      const heroPopupNote = document.getElementById('hero-popup-pref-note');
      if (kicker) kicker.textContent = userName ? `Map for ${userName}` : 'Mission map';
      if (mapToolsTitle) mapToolsTitle.textContent = userName ? `Map tools · ${userName}` : 'Map tools';
      if (mapIntentTitle) {
        mapIntentTitle.textContent = userName
          ? `Where do you want to go next, ${userName}?`
          : 'Search the map';
      }
      if (journeySectionTitle) {
        journeySectionTitle.textContent = userName ? `Build a route for ${userName}` : 'Build your route';
      }
      if (journeyNameInput) {
        const locationLabel = getActiveLocationLabel();
        journeyNameInput.placeholder = userName
          ? `${locationLabel} day out for ${userName}`
          : `Saturday in ${locationLabel}`;
      }
      if (nameInput && nameInput.value !== rawName) nameInput.value = rawName;
      if (defaultCitySelect && discoveredCsvPaths.length) {
        const preferredPath = discoveredCsvPaths.find(path => csvFileNameFromPath(path) === personalisation.defaultCity) || currentCsvPath;
        if (preferredPath && defaultCitySelect.value !== preferredPath) defaultCitySelect.value = preferredPath;
      }
      if (distanceUnitSelect) distanceUnitSelect.value = personalisation.distanceUnit;
      if (reduceMotionInput) reduceMotionInput.checked = personalisation.reduceMotion;
      document.querySelectorAll('[data-budfinder-vibe-selector], #accent-select').forEach(select => {
        if (select && select.value !== personalisation.accent) select.value = personalisation.accent;
      });
      if (heroPopupBtn) {
        heroPopupBtn.textContent = personalisation.showIntroPopupOnLoad ? 'Disable intro popup' : 'Enable intro popup';
      }
      if (heroPopupNote) {
        heroPopupNote.textContent = personalisation.showIntroPopupOnLoad
          ? 'Intro popup shows when Budfinder opens.'
          : 'Intro popup is disabled and will stay hidden on load.';
      }
      updateLocationContext();
    }

    function resetPersonalisation() {
      personalisation = {
        displayName: 'Explorer',
        accent: 'kings-juice',
        defaultCity: 'amsterdamLoc.csv',
        distanceUnit: 'metric',
        reduceMotion: false,
        showIntroPopupOnLoad: false
      };
      savePersonalisation();
      saveSelectedCsvPath('database/locations/amsterdamLoc.csv', { explicit: true });
      applyPersonalisation();
      renderSettingsLocationSelect('database/locations/amsterdamLoc.csv');
      updateControlsSummary();
    }

    function resetMapState() {
      viewportResyncTimers.forEach(timerId => window.clearTimeout(timerId));
      viewportResyncTimers = [];
      if (geolocationWatchId !== null && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(geolocationWatchId);
        } catch (_err) {
          // Ignore if watch id is stale.
        }
        geolocationWatchId = null;
      }

      if (map) {
        try {
          map.stop();
          if (map._animatingZoom && typeof map._onZoomTransitionEnd === 'function') {
            map._onZoomTransitionEnd();
          }
          if (directRouteLayer) {
            directRouteLayer.remove();
          }
        } catch (_err) {
          // Ignore if the direct route line was already removed.
        }
        map.remove();
        map = null;
      }
      directRouteLayer = null;
      baseTileLayer = null;
      if (initialMapReadyFallbackTimer) {
        window.clearTimeout(initialMapReadyFallbackTimer);
        initialMapReadyFallbackTimer = null;
      }
      if (initialMapPanelHideTimer) {
        window.clearTimeout(initialMapPanelHideTimer);
        initialMapPanelHideTimer = null;
      }
      journeyLayerGroup = null;
      markers = [];
      lastPosition = null;
      meLocationMarker = null;
      meAccuracyCircle = null;
      locationControlButton = null;
      locationRequestInFlight = null;
      lastRoutePosition = null;
      lastRouteRefreshAt = 0;

      const mapDiv = document.getElementById('map');
      const instructionsDiv = document.getElementById('instructions');
      if (mapDiv) mapDiv.innerHTML = '';
      if (instructionsDiv) instructionsDiv.innerHTML = '';
    }

    function getViewportSize() {
      const visualViewport = window.visualViewport;
      const docEl = document.documentElement;
      const body = document.body;
      const widths = [
        visualViewport && Number.isFinite(visualViewport.width) ? visualViewport.width : null,
        docEl && Number.isFinite(docEl.clientWidth) ? docEl.clientWidth : null,
        body && Number.isFinite(body.clientWidth) ? body.clientWidth : null,
        Number.isFinite(window.innerWidth) ? window.innerWidth : null
      ].filter(v => Number.isFinite(v) && v > 0);
      const heights = [
        visualViewport && Number.isFinite(visualViewport.height) ? visualViewport.height : null,
        docEl && Number.isFinite(docEl.clientHeight) ? docEl.clientHeight : null,
        body && Number.isFinite(body.clientHeight) ? body.clientHeight : null,
        Number.isFinite(window.innerHeight) ? window.innerHeight : null
      ].filter(v => Number.isFinite(v) && v > 0);
      return {
        width: widths.length ? Math.min(...widths) : window.innerWidth,
        height: heights.length ? Math.min(...heights) : window.innerHeight
      };
    }

    function syncViewportCssVars() {
      const root = document.documentElement;
      if (!root) return;

      const viewport = getViewportSize();
      const viewportHeight = Math.max(240, Math.round(viewport.height));
      const controlsHeader = document.getElementById('controls-header');
      const measuredHeaderHeight = controlsHeader
        ? Math.max(74, Math.round(controlsHeader.getBoundingClientRect().height))
        : 92;
      const controlsMaxHeight = Math.max(180, viewportHeight - 48);
      const controlsContentMaxHeight = Math.max(120, controlsMaxHeight - measuredHeaderHeight - 8);
      const mobileNavigationClearance = 106;
      const mobileControlsMaxHeight = Math.min(540, Math.max(220, viewportHeight - mobileNavigationClearance));
      const mobileControlsContentMaxHeight = Math.max(120, mobileControlsMaxHeight - measuredHeaderHeight - 8);
      const strainPanelMaxHeight = Math.min(320, Math.max(240, Math.round(viewportHeight * 0.38)));
      const strainListMaxHeight = Math.max(144, Math.min(200, strainPanelMaxHeight - 96));
      const mobileStrainPanelMaxHeight = Math.min(280, Math.max(240, Math.round(viewportHeight * 0.34)));
      const mobileStrainListMaxHeight = Math.max(148, Math.min(180, mobileStrainPanelMaxHeight - 92));

      root.style.setProperty('--app-controls-header-height', `${measuredHeaderHeight}px`);
      root.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
      root.style.setProperty('--app-controls-max-height', `${controlsMaxHeight}px`);
      root.style.setProperty('--app-controls-content-max-height', `${controlsContentMaxHeight}px`);
      root.style.setProperty('--app-strain-panel-max-height', `${strainPanelMaxHeight}px`);
      root.style.setProperty('--app-strain-list-max-height', `${strainListMaxHeight}px`);
      root.style.setProperty('--app-mobile-controls-max-height', `${mobileControlsMaxHeight}px`);
      root.style.setProperty('--app-mobile-controls-content-max-height', `${mobileControlsContentMaxHeight}px`);
      root.style.setProperty('--app-mobile-strain-panel-max-height', `${mobileStrainPanelMaxHeight}px`);
      root.style.setProperty('--app-mobile-strain-list-max-height', `${mobileStrainListMaxHeight}px`);
    }

    function isCompactMobileLayout() {
      const viewport = getViewportSize();
      const isLandscape = viewport.width > viewport.height;
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const screenShortSide = Math.min(
        (window.screen && Number.isFinite(window.screen.width) ? window.screen.width : viewport.width),
        (window.screen && Number.isFinite(window.screen.height) ? window.screen.height : viewport.height)
      );
      return viewport.width < 768 ||
        (coarsePointer &&
         isLandscape &&
         (viewport.height <= 560 || screenShortSide <= 500));
    }

    function isCompactLandscapeLayout() {
      const viewport = getViewportSize();
      return isCompactMobileLayout() && viewport.width > viewport.height;
    }

    function syncCompactLayoutState() {
      document.body.classList.toggle('compact-layout', isCompactMobileLayout());
    }

    function syncSelectionCardChrome() {
      const isLandscapeCompact = isCompactLandscapeLayout();
      const card = document.getElementById('selection-card');
      const toggleBtn = document.getElementById('selection-card-toggle');
      const summaryEl = document.getElementById('selection-card-summary');
      const head = document.getElementById('selection-card-head');
      const selectedIndex = getSelectedDestinationIndex();
      const shouldShow = selectedIndex !== null && !!locations[selectedIndex];
      if (card) {
        card.hidden = !shouldShow;
        card.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        card.style.display = shouldShow ? 'block' : 'none';
        card.classList.toggle('is-empty', !shouldShow);
        card.classList.toggle('is-collapsed', shouldShow && selectionCardCollapsed);
      }
      if (toggleBtn) {
        toggleBtn.hidden = !shouldShow || !isCompactMobileLayout();
        toggleBtn.textContent = selectionCardCollapsed ? 'Expand' : 'Collapse';
      }
      if (summaryEl) summaryEl.hidden = !shouldShow;
      if (head) head.setAttribute('aria-expanded', shouldShow && !selectionCardCollapsed ? 'true' : 'false');
      document.body.classList.toggle('mobile-selection-visible', shouldShow && isCompactMobileLayout());
      document.body.classList.toggle('selection-card-collapsed', shouldShow && selectionCardCollapsed);
      document.body.classList.toggle('compact-landscape-layout', isLandscapeCompact);
    }

    function getControlsToggleLabel() {
      if (isCompactMobileLayout()) {
        return controlsVisible ? 'Close tools' : 'Map tools';
      }
      return controlsVisible ? 'Hide map tools' : 'Show map tools';
    }

    function syncHeroBannerState() {
      const hero = document.getElementById('hero-banner');
      document.body.classList.toggle('hero-popup-hidden', !heroPopupVisible);
      if (!hero) return;
      hero.setAttribute('aria-hidden', heroPopupVisible ? 'false' : 'true');
    }

    function hasLocationSearchFilter() {
      return !!(locationSearchText || '').trim();
    }

    function hasMissionFilter() {
      return missionMode !== 'free-roam';
    }

    function hasCategoryFilter() {
      return !(Array.isArray(selectedCategories) &&
        selectedCategories.length === 1 &&
        selectedCategories.includes('all'));
    }

    function hasAnyMapFilter() {
      return getSelectedDestinationIndex() !== null ||
        !!(strainFilterText || '').trim() ||
        hasExplorerFocus() ||
        hasLocationSearchFilter() ||
        hasMissionFilter() ||
        hasCategoryFilter();
    }

    function captureMapFilterState() {
      return {
        selectedDestination: getSelectedDestinationIndex(),
        locationSearchText: (locationSearchText || '').toString(),
        missionMode,
        selectedCategories: Array.isArray(selectedCategories) ? selectedCategories.slice() : ['all'],
        strainFilterText: (strainFilterText || '').toString(),
        offeringAttributeFilterKind: (offeringAttributeFilterKind || '').toString(),
        offeringAttributeFilterValue: (offeringAttributeFilterValue || '').toString(),
        explorerFocusShopIds: explorerFocusShopIds instanceof Set ? Array.from(explorerFocusShopIds) : [],
        explorerFocusStrainName: (explorerFocusStrainName || '').toString(),
        explorerFocusStrainShopIds: explorerFocusStrainShopIds instanceof Set ? Array.from(explorerFocusStrainShopIds) : [],
        nearbyExploreActive: !!nearbyExploreActive
      };
    }

    function serialiseMapFilterState(state) {
      return JSON.stringify({
        selectedDestination: state && state.selectedDestination !== null ? String(state.selectedDestination) : '',
        locationSearchText: (state && state.locationSearchText || '').toString(),
        missionMode: state && state.missionMode || 'free-roam',
        selectedCategories: Array.isArray(state && state.selectedCategories) ? state.selectedCategories.slice().sort() : ['all'],
        strainFilterText: (state && state.strainFilterText || '').toString(),
        offeringAttributeFilterKind: (state && state.offeringAttributeFilterKind || '').toString(),
        offeringAttributeFilterValue: (state && state.offeringAttributeFilterValue || '').toString(),
        explorerFocusShopIds: Array.isArray(state && state.explorerFocusShopIds) ? state.explorerFocusShopIds.map(String).sort() : [],
        explorerFocusStrainName: (state && state.explorerFocusStrainName || '').toString(),
        explorerFocusStrainShopIds: Array.isArray(state && state.explorerFocusStrainShopIds) ? state.explorerFocusStrainShopIds.map(String).sort() : [],
        nearbyExploreActive: !!(state && state.nearbyExploreActive)
      });
    }

    function pushMapFilterSnapshot(snapshot) {
      if (restoringMapFilterState) return;
      if (!snapshot) return;
      const key = serialiseMapFilterState(snapshot);
      const lastKey = mapFilterHistory.length ? serialiseMapFilterState(mapFilterHistory[mapFilterHistory.length - 1]) : '';
      if (key === lastKey) return;
      mapFilterHistory.push(snapshot);
      if (mapFilterHistory.length > 24) mapFilterHistory = mapFilterHistory.slice(-24);
    }

    function rememberMapFilterState() {
      pushMapFilterSnapshot(captureMapFilterState());
    }

    function clearMapFilterHistory() {
      mapFilterHistory = [];
    }

    function getMapSessionDatasetKey(pathLike) {
      const key = canonicalCsvPath(pathLike || currentCsvPath || '').toLowerCase();
      return key || 'default';
    }

    function hasExplicitMapContextInUrl() {
      const params = new URLSearchParams(window.location.search || '');
      return [
        'q', 'query', 'search', 'strain', 'shop', 'shops', 'shop_id', 'shop_ids',
        'strain_shops', 'all_shops', 'intent', 'destination'
      ].some(key => params.has(key));
    }

    function loadPersistedMapSession(pathLike) {
      const envelope = loadStoredJson(MAP_SESSION_STORAGE_KEY, {});
      const datasets = envelope && envelope.datasets && typeof envelope.datasets === 'object'
        ? envelope.datasets
        : {};
      const entry = datasets[getMapSessionDatasetKey(pathLike)];
      if (!entry || !entry.state || typeof entry.state !== 'object') return null;
      const updatedAt = Number(entry.updatedAt || 0);
      if (!updatedAt || Date.now() - updatedAt > MAP_SESSION_MAX_AGE_MS) return null;
      return entry.state;
    }

    function getSelectedDestinationRef() {
      const index = getSelectedDestinationIndex();
      return index !== null && locations[index]
        ? getJourneyLocationRef(locations[index], index)
        : '';
    }

    function capturePersistedMapSession() {
      const filterState = captureMapFilterState();
      const destinationSearch = document.getElementById('destination-search');
      const modeSelect = document.getElementById('mode');
      const sortSelect = document.getElementById('destination-sort');
      const center = map ? map.getCenter() : null;
      const zoom = map ? map.getZoom() : null;
      return {
        ...filterState,
        selectedDestination: null,
        selectedDestinationRef: getSelectedDestinationRef(),
        searchText: destinationSearch ? destinationSearch.value : (locationSearchText || strainFilterText || ''),
        travelMode: modeSelect ? modeSelect.value : 'walking',
        destinationSort: sortSelect ? sortSelect.value : 'best-match',
        locationTrackingWanted: !!locationTrackingWanted,
        viewport: center && Number.isFinite(center.lat) && Number.isFinite(center.lng) && Number.isFinite(zoom)
          ? { lat: center.lat, lng: center.lng, zoom }
          : null
      };
    }

    function persistMapSessionNow() {
      if (!mapSessionReady || !activeMapSessionDatasetKey || !locations.length) return;
      if (mapSessionSaveTimer !== null) {
        window.clearTimeout(mapSessionSaveTimer);
        mapSessionSaveTimer = null;
      }
      const envelope = loadStoredJson(MAP_SESSION_STORAGE_KEY, {});
      const datasets = envelope && envelope.datasets && typeof envelope.datasets === 'object'
        ? { ...envelope.datasets }
        : {};
      datasets[activeMapSessionDatasetKey] = {
        updatedAt: Date.now(),
        state: capturePersistedMapSession()
      };
      const retained = Object.entries(datasets)
        .filter(([, entry]) => entry && Date.now() - Number(entry.updatedAt || 0) <= MAP_SESSION_MAX_AGE_MS)
        .sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0))
        .slice(0, 8);
      saveStoredJson(MAP_SESSION_STORAGE_KEY, { version: 1, datasets: Object.fromEntries(retained) });
    }

    function schedulePersistMapSession(delay = 360) {
      if (!mapSessionReady) return;
      if (mapSessionSaveTimer !== null) window.clearTimeout(mapSessionSaveTimer);
      mapSessionSaveTimer = window.setTimeout(persistMapSessionNow, delay);
    }

    function isValidPersistedViewport(viewport) {
      return viewport &&
        Number.isFinite(Number(viewport.lat)) && Math.abs(Number(viewport.lat)) <= 90 &&
        Number.isFinite(Number(viewport.lng)) && Math.abs(Number(viewport.lng)) <= 180 &&
        Number.isFinite(Number(viewport.zoom)) && Number(viewport.zoom) >= 2 && Number(viewport.zoom) <= 19;
    }

    function isPersistedViewportRelevantToLocations(viewport) {
      if (!isValidPersistedViewport(viewport) || !locations.length) return false;
      const viewportCenter = [Number(viewport.lat), Number(viewport.lng)];
      return locations.some(loc => {
        if (!loc || !Array.isArray(loc.coords) || loc.coords.length !== 2) return false;
        if (!loc.coords.every(Number.isFinite)) return false;
        return haversineDistance(viewportCenter, loc.coords) <= MAP_SESSION_VIEWPORT_MAX_DISTANCE_METERS;
      });
    }

    async function restorePersistedMapSession(state) {
      if (!state || !map) return false;

      const destinationRef = (state.selectedDestinationRef || '').toString();
      const destinationIndex = destinationRef ? findJourneyLocationIndexByRef(destinationRef) : null;
      const allowedCategories = new Set(categoryOptions);
      const restoredCategories = Array.isArray(state.selectedCategories)
        ? state.selectedCategories.filter(category => allowedCategories.has(category))
        : [];
      const filterState = {
        ...state,
        selectedDestination: destinationIndex,
        selectedCategories: restoredCategories.length ? restoredCategories : ['all']
      };

      const modeSelect = document.getElementById('mode');
      if (modeSelect && Array.from(modeSelect.options).some(option => option.value === state.travelMode)) {
        modeSelect.value = state.travelMode;
      }
      const sortSelect = document.getElementById('destination-sort');
      if (sortSelect && Array.from(sortSelect.options).some(option => option.value === state.destinationSort)) {
        sortSelect.value = state.destinationSort;
      }

      await restoreMapFilterState(filterState, { preserveViewport: true });

      const searchInput = document.getElementById('destination-search');
      if (searchInput && typeof state.searchText === 'string') {
        searchInput.value = state.searchText;
      }

      if (isPersistedViewportRelevantToLocations(state.viewport)) {
        const viewport = state.viewport;
        map.setView([Number(viewport.lat), Number(viewport.lng)], Number(viewport.zoom), { animate: false });
        initialViewportRestored = true;
      }

      locationTrackingWanted = !!state.locationTrackingWanted;
      syncLocationControlUi();
      updateControlsSummary();
      return true;
    }

    async function restoreMapFilterState(state, options = {}) {
      if (!state) return false;
      restoringMapFilterState = true;
      const preserveViewport = options.preserveViewport !== false;
      const previousView = preserveViewport && map
        ? { center: map.getCenter(), zoom: map.getZoom() }
        : null;
      try {
        const searchInput = document.getElementById('destination-search');
        const missionSelect = document.getElementById('mission-mode');
        const destinationSelect = document.getElementById('destination-select');

        locationSearchText = (state.locationSearchText || '').toString();
        if (searchInput) searchInput.value = locationSearchText;

        missionMode = state.missionMode || 'free-roam';
        if (missionSelect) missionSelect.value = missionMode;

        selectedCategories = Array.isArray(state.selectedCategories) && state.selectedCategories.length
          ? state.selectedCategories.slice()
          : ['all'];
        syncCategoryCheckboxes();

        explorerFocusShopIds = Array.isArray(state.explorerFocusShopIds) && state.explorerFocusShopIds.length
          ? new Set(state.explorerFocusShopIds.map(String))
          : null;
        explorerFocusStrainName = (state.explorerFocusStrainName || '').toString();
        explorerFocusStrainShopIds = Array.isArray(state.explorerFocusStrainShopIds) && state.explorerFocusStrainShopIds.length
          ? new Set(state.explorerFocusStrainShopIds.map(String))
          : null;
        syncExplorerFocusControls();

        nearbyExploreActive = !!state.nearbyExploreActive;

        const destinationIndex = Number.isInteger(state.selectedDestination)
          ? state.selectedDestination
          : parseInt(state.selectedDestination, 10);
        if (destinationSelect) {
          destinationSelect.value = Number.isInteger(destinationIndex) && locations[destinationIndex]
            ? String(destinationIndex)
            : '';
          lastDestinationSelectValue = String(destinationSelect.value || '');
        }
        activePopupLocationIndex = null;
        if (map) map.closePopup();

        clearActiveStrainFilterState();
        const restoredStrain = (state.strainFilterText || '').toString().trim();
        const restoredAttributeKind = (state.offeringAttributeFilterKind || '').toString().trim();
        const restoredAttributeValue = (state.offeringAttributeFilterValue || '').toString().trim();
        if (restoredAttributeKind && restoredAttributeValue) {
          await applyOfferingAttributeFilter(restoredAttributeKind, restoredAttributeValue);
        } else if (restoredStrain) {
          await applyStrainFilter(restoredStrain);
        }

        if (destinationSelect && destinationSelect.value) {
          const selectedIndex = getSelectedDestinationIndex();
          if (selectedIndex !== null) {
            rememberRecentDestination(selectedIndex);
            if (lastPosition) {
              findRoute({ coords: { latitude: lastPosition[0], longitude: lastPosition[1] } });
            } else {
              clearRouteUi();
            }
            if (!preserveViewport) {
              focusDestinationOnMap(selectedIndex);
            }
          }
        } else {
          clearRouteUi();
        }

        updateNearestLabel();
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        updateSelectionCard();
        refreshDestinationCards();
        updateControlsSummary();
        syncClearSelectionToggle();
        if (previousView && map) {
          map.setView(previousView.center, previousView.zoom, { animate: false });
        } else if (!preserveViewport) {
          window.setTimeout(() => fitMapToVisibleMarkers(), 80);
        }
        return true;
      } finally {
        restoringMapFilterState = false;
      }
    }

    function setHeroPopupVisible(visible, options = {}) {
      const nextVisible = !!visible;
      const changed = heroPopupVisible !== nextVisible;
      heroPopupVisible = nextVisible;
      syncHeroBannerState();
      updateTopShelfRail();
      if ((changed || options.force) && map) {
        invalidateMapSizeSettled([0, 120, 260]);
      }
    }

    function dismissHeroPopup(options = {}) {
      if (!heroPopupVisible && !options.force) return;
      setHeroPopupVisible(false, options);
    }

    function syncDesktopTogglePosition() {
      const uiToggles = document.getElementById('ui-toggles');
      const selectionCard = document.getElementById('selection-card');
      if (!uiToggles) return;

      if (!selectionCard) {
        uiToggles.style.bottom = '';
        return;
      }

      const style = window.getComputedStyle(selectionCard);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
        uiToggles.style.bottom = '';
        return;
      }

      const rect = selectionCard.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        uiToggles.style.bottom = '';
        return;
      }

      const isCompact = isCompactMobileLayout();
      const baseGap = isCompact ? 10 : 24;
      const cardGap = isCompact ? 10 : 16;
      const viewportHeight = Math.round(getViewportSize().height);
      const offsetAboveCard = Math.max(baseGap, viewportHeight - Math.round(rect.top) + cardGap);
      uiToggles.style.bottom = `${offsetAboveCard}px`;
    }

    function scheduleTogglePositionSync(delay = 0) {
      if (uiTogglePositionTimer !== null) {
        window.clearTimeout(uiTogglePositionTimer);
      }
      uiTogglePositionTimer = window.setTimeout(() => {
        syncDesktopTogglePosition();
        uiTogglePositionTimer = null;
      }, delay);
    }

    function invalidateMapSizeSettled(delays = [0, 80, 180, 320]) {
      if (!map) return;
      const run = () => {
        if (!map) return;
        map.invalidateSize({ pan: false });
      };
      requestAnimationFrame(run);
      delays.forEach(delay => {
        window.setTimeout(run, delay);
      });
    }

    function syncClearSelectionToggle() {
      const clearBtn = document.getElementById('clear-selection-toggle');
      const clearRouteBtn = document.getElementById('clear-route-focus-btn');
      const hasDestination = getSelectedDestinationIndex() !== null;
      const hasStrain = !!(strainFilterText || '').trim();
      const hasMapFocus = hasExplorerFocus();
      const hasFilters = hasAnyMapFilter();
      const hasOnlyDestination = hasDestination &&
        !hasStrain &&
        !hasMapFocus &&
        !hasLocationSearchFilter() &&
        !hasMissionFilter() &&
        !hasCategoryFilter();
      if (clearBtn) {
        clearBtn.hidden = !hasFilters;
        clearBtn.textContent = hasOnlyDestination ? 'Clear Destination' : 'Clear filters';
      }
      if (clearRouteBtn) {
        clearRouteBtn.disabled = !hasDestination;
      }
      syncExplorerFocusControls();
    }

    function syncControlsChrome() {
      syncViewportCssVars();
      syncCompactLayoutState();
      const btn = document.getElementById('toggle-controls');
      const uiToggles = document.getElementById('ui-toggles');
      const backdrop = document.getElementById('controls-backdrop');
      const controlsDiv = document.querySelector('.controls');
      const hideBtn = document.getElementById('mobile-hide-controls');
      const headerToggle = document.getElementById('controls-header-toggle');
      const isMobile = isCompactMobileLayout();
      const showMobileOverlay = controlsVisible && !controlsCollapsed && isCompactMobileLayout();
      const showMobileDirections = directionsVisible && isCompactMobileLayout();
      const hideDesktopGap = !controlsVisible && !shelfVisible && !isCompactMobileLayout();

      if (controlsDiv) {
        controlsDiv.classList.toggle('is-collapsed', controlsVisible && controlsCollapsed);
      }

      syncHeroBannerState();
      document.body.classList.toggle('mobile-controls-open', showMobileOverlay);
      document.body.classList.toggle('mobile-directions-open', showMobileDirections);
      document.body.classList.toggle('desktop-controls-hidden', hideDesktopGap);
      if (uiToggles) {
        const togglesReady = uiToggles.dataset.ready === 'true';
        uiToggles.style.display = togglesReady && (!isMobile || (!controlsVisible && !shelfVisible))
          ? (isMobile ? 'grid' : 'block')
          : 'none';
      }
      if (backdrop) {
        backdrop.style.display = showMobileOverlay ? 'block' : 'none';
      }
      if (btn) {
        btn.textContent = getControlsToggleLabel();
      }
      if (headerToggle) {
        headerToggle.setAttribute('aria-expanded', String(!controlsCollapsed));
        headerToggle.setAttribute('aria-label', controlsCollapsed ? 'Open map tools' : 'Collapse map tools');
      }
      syncClearSelectionToggle();
      if (hideBtn) {
        if (!controlsVisible) {
          hideBtn.style.display = 'none';
        } else if (isMobile) {
          hideBtn.textContent = 'Close';
          hideBtn.style.display = 'inline-flex';
        } else {
          hideBtn.style.display = 'none';
        }
      }
      updateControlsSummary();
      scheduleTogglePositionSync(isMobile ? 240 : 120);
      invalidateMapSizeSettled(isMobile ? [0, 120, 260] : [0, 120, 260, 380]);
    }

    function minimiseControlsForMapFocus() {
      if (controlsVisible && isCompactMobileLayout()) {
        setControlsCollapsed(true);
      }
      if (heroPopupVisible) {
        dismissHeroPopup();
      }
      if (isCompactMobileLayout() && !selectionCardCollapsed) {
        setSelectionCardCollapsed(true);
      }
    }

    function setSelectionCardCollapsed(collapsed) {
      selectionCardCollapsed = !!collapsed;
      syncSelectionCardChrome();
      syncDesktopTogglePosition();
      scheduleTogglePositionSync(isCompactMobileLayout() ? 240 : 120);
      invalidateMapSizeSettled([0, 140, 280]);
    }

    function setControlsCollapsed(collapsed) {
      if (!controlsVisible) {
        controlsCollapsed = false;
      } else if (!isCompactMobileLayout()) {
        if (collapsed) {
          setControlsVisible(false);
          return;
        }
        controlsCollapsed = false;
      } else {
        controlsCollapsed = !!collapsed;
      }
      syncControlsChrome();
      invalidateMapSizeSettled([0, 120, 260, 380]);
    }

    function setControlsVisible(show, options = {}) {
      if (show && shelfVisible) {
        shelfVisible = false;
      }
      controlsVisible = !!show;
      const controlsDiv = document.querySelector('.controls');
      if (!controlsVisible) {
        controlsCollapsed = false;
      } else {
        controlsCollapsed = !!options.collapsed;
      }
      if (controlsDiv) controlsDiv.style.display = controlsVisible ? 'block' : 'none';
      syncControlsChrome();
      invalidateMapSizeSettled([0, 120, 260, 420]);
    }

    function setShelfVisible(show) {
      const nextVisible = !!show;
      if (nextVisible && directionsVisible) {
        setDirectionsVisible(false);
      }
      if (nextVisible && controlsVisible) {
        setControlsVisible(false);
      }
      shelfVisible = nextVisible;
      syncControlsChrome();
      invalidateMapSizeSettled([0, 120, 260, 380]);
    }

    function setDirectionsVisible(show) {
      directionsVisible = !!show;
      const directionsDiv = document.getElementById('instructions');
      const mapDiv = document.getElementById('map');
      const btn = document.getElementById('toggle-directions');

      if (directionsDiv) {
        directionsDiv.hidden = !directionsVisible;
        directionsDiv.style.display = directionsVisible ? 'block' : 'none';
        if (directionsVisible) {
          renderDirectionsPanel(latestRouteInstructions, 'Choose a Destination to compare direct distance.');
        } else {
          directionsDiv.innerHTML = '';
        }
      }
      if (btn) {
        btn.hidden = false;
        btn.textContent = directionsVisible ? 'Hide distance' : 'Direct distance';
      }

      if (mapDiv) {
        if (directionsVisible) {
          mapDiv.style.right = isCompactMobileLayout() ? '12px' : '432px';
          mapDiv.style.bottom = isCompactMobileLayout() ? 'calc(42% + 28px)' : '24px';
        } else {
          mapDiv.style.right = isCompactMobileLayout() ? '12px' : '24px';
          mapDiv.style.bottom = isCompactMobileLayout() ? '14px' : '24px';
        }
      }

      invalidateMapSizeSettled([0, 120, 260, 420]);
      syncControlsChrome();
    }

    function normaliseText(s) {
      if (window.BudfinderSearch) return window.BudfinderSearch.normalise(s);
      return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function normaliseNameCityKey(name, city) {
      return `${normaliseText(name)}|${normaliseText(city)}`;
    }

    function normaliseStrainBaseType(value) {
      const t = normaliseText(value || '');
      if (t === 'sativa' || t === 'indica' || t === 'hybrid' || t === 'hash' || t === 'kush') return t;
      return '';
    }

    function ensureStrainMetaEntry(key, displayName) {
      if (!key) return null;
      if (!strainMetaByKey.has(key)) {
        strainMetaByKey.set(key, {
          name: (displayName || '').toString().trim(),
          typeCounts: { sativa: 0, indica: 0, hybrid: 0, hash: 0, kush: 0 },
          listingCount: 0,
          caliListingCount: 0
        });
      }
      const meta = strainMetaByKey.get(key);
      if (displayName && !meta.name) {
        meta.name = (displayName || '').toString().trim();
      }
      return meta;
    }

    function mergeStrainMeta(displayName, baseTypeValue, isCaliValue, countListing = true) {
      const name = (displayName || '').toString().trim();
      const key = normaliseText(name);
      if (!key) return;
      const meta = ensureStrainMetaEntry(key, name);
      if (!meta) return;

      const baseType = normaliseStrainBaseType(baseTypeValue);
      if (baseType) {
        meta.typeCounts[baseType] = (meta.typeCounts[baseType] || 0) + 1;
      }
      if (countListing) {
        meta.listingCount += 1;
        if (Number(isCaliValue) === 1 || isCaliValue === true) {
          meta.caliListingCount += 1;
        }
      }
    }

    function deriveStrainBaseType(meta) {
      if (!meta || !meta.typeCounts) return 'unknown';
      const order = ['sativa', 'indica', 'hybrid', 'hash', 'kush'];
      const types = order.filter(t => (meta.typeCounts[t] || 0) > 0);
      if (!types.length) return 'unknown';
      if (types.length === 1) return types[0];
      types.sort((a, b) => {
        const diff = (meta.typeCounts[b] || 0) - (meta.typeCounts[a] || 0);
        if (diff !== 0) return diff;
        return order.indexOf(a) - order.indexOf(b);
      });
      return types[0] || 'unknown';
    }

    function getStrainVisualMeta(name) {
      const key = normaliseText(name || '');
      const meta = key ? strainMetaByKey.get(key) : null;
      const listingCount = Number(meta && meta.listingCount) || 0;
      const caliListingCount = Number(meta && meta.caliListingCount) || 0;
      const caliStatus = caliListingCount <= 0
        ? 'none'
        : (listingCount > 0 && caliListingCount >= listingCount ? 'all' : 'mixed');
      return {
        baseType: deriveStrainBaseType(meta),
        listingCount,
        caliListingCount,
        caliStatus,
        isCali: caliStatus === 'all',
        hasCaliOption: caliStatus !== 'none'
      };
    }

    function getStrainTypeHeading(baseType) {
      const t = normaliseStrainBaseType(baseType);
      if (t === 'sativa') return 'Sativa shelf';
      if (t === 'indica') return 'Indica shelf';
      if (t === 'hybrid') return 'Hybrid shelf';
      if (t === 'hash') return 'Hash shelf';
      if (t === 'kush') return 'Kush shelf';
      return 'House shelf';
    }

    function getStrainTypeOrder(baseType) {
      const order = { sativa: 0, indica: 1, hybrid: 2, hash: 3, kush: 4, unknown: 5 };
      const key = normaliseStrainBaseType(baseType) || 'unknown';
      return order[key] ?? order.unknown;
    }

    function normaliseUrlPath(url) {
      const raw = (url || '').toString().trim();
      if (!raw) return '';
      try {
        const u = new URL(raw, window.location.href);
        return (u.pathname || '').toLowerCase().replace(/\/+$/, '');
      } catch {
        return '';
      }
    }

    function extractShopIdFromHref(href) {
      const m = (href || '').match(/\/shop\/(\d+)/);
      if (!m) return null;
      const id = parseInt(m[1], 10);
      return Number.isFinite(id) ? id : null;
    }

    function fallbackLogoSlug(value) {
      return (value || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/^cs-/, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    function fallbackLogoCandidates(logoFilename, loc = null, options = {}) {
      const filenames = [];
      const explicit = (logoFilename || '').toString().trim();
      if (explicit) filenames.push(explicit);

      if (options.skipGuesses !== true) {
        [
          fallbackLogoSlug(loc && loc.shop_key),
          fallbackLogoSlug(loc && loc.name)
        ].filter(Boolean).forEach(slug => {
          filenames.push(`${slug}.png`, `${slug}.jpg`, `${slug}.svg`);
        });
      }

      const paths = [];
      const seen = new Set();
      filenames.forEach(filename => {
        const clean = filename.replace(/^\.?\//, '').replace(/^\/+/, '');
        const basename = clean.split('/').filter(Boolean).at(-1) || clean;
        const candidates = clean.includes('/')
          ? [`/${clean}`, clean]
          : [`/images/logos/${encodeURIComponent(basename)}`, `images/logos/${encodeURIComponent(basename)}`];
        candidates.forEach(path => {
          if (!path || seen.has(path)) return;
          seen.add(path);
          paths.push(path);
        });
      });

      if (options.includeMonogram !== false) {
        const label = ((loc && loc.name) || fallbackLogoSlug(loc && loc.shop_key) || 'Coffeeshop').toString().trim();
        const initials = label
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(part => part.charAt(0).toUpperCase())
          .join('')
          .slice(0, 2) || 'CS';
        const svg =
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
            `<rect width="96" height="96" rx="22" fill="#ffffff"/>` +
            `<circle cx="48" cy="48" r="35" fill="#183f32"/>` +
            `<text x="48" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="#ffffff">${initials}</text>` +
          `</svg>`;
        paths.push(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`);
      }
      return paths;
    }

    function logoCandidates(logoFilename, loc = null, options = {}) {
      const explicitLogo = (logoFilename || '').toString().trim();
      const localWithoutLogo = !explicitLogo && (loc && loc.shop_key || '').toString().startsWith('ams-');
      if (window.BudfinderLogos && !localWithoutLogo) {
        return window.BudfinderLogos.candidates({
          filename: logoFilename,
          shopKey: loc && loc.shop_key,
          shopName: loc && loc.name,
          includeMonogram: options.includeMonogram !== false
        });
      }
      return fallbackLogoCandidates(logoFilename, loc, { ...options, skipGuesses: localWithoutLogo });
    }

    function strainImageCandidates(imageFilename) {
      const raw = (imageFilename || '').toString().trim();
      if (!raw) return [];
      const encoded = encodeURIComponent(raw);
      const out = [];
      STRAIN_IMAGE_BASE_PATHS.forEach(base => {
        out.push(`${base}${encoded}`);
        out.push(`${base}${raw}`);
      });
      return Array.from(new Set(out));
    }

    function escapeHtmlAttr(s) {
      return (s || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function escapeHtml(s) {
      return (s || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function getStrainImageFilename(name) {
      const key = normaliseText(name || '');
      if (!key || !strainImageByKey.has(key)) return '';
      return strainImageByKey.get(key) || '';
    }

    function getStrainImageHtml(name) {
      const filename = getStrainImageFilename(name);
      if (!filename) return '';
      const candidates = strainImageCandidates(filename);
      if (!candidates.length) return '';
      const first = escapeHtmlAttr(candidates[0]);
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const safeName = escapeHtmlAttr(name || 'strain');
      return (
        `<span class="stash-bag-art-media">` +
          `<img src="${first}" alt="${safeName} strain art" ` +
          `data-candidates="${joined}" data-idx="0" onerror="strainImageFallback(this)">` +
        `</span>`
      );
    }

    function getStrainRailFallbackLabel(name) {
      const canonical = getCanonicalStrainName(name) || (name || '').toString().trim();
      const parts = canonical.split(/\s+/).filter(Boolean);
      const letters = parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
      return (letters || canonical.slice(0, 2).toUpperCase() || 'ST').slice(0, 2);
    }

    function getTopShelfRailIconHtml(name) {
      const fallbackLabel = escapeHtml(getStrainRailFallbackLabel(name));
      const filename = getStrainImageFilename(name);
      if (!filename) {
        return (
          `<span class="top-shelf-rail-chip-art">` +
            `<span class="top-shelf-rail-chip-fallback">${fallbackLabel}</span>` +
          `</span>`
        );
      }

      const candidates = strainImageCandidates(filename);
      if (!candidates.length) {
        return (
          `<span class="top-shelf-rail-chip-art">` +
            `<span class="top-shelf-rail-chip-fallback">${fallbackLabel}</span>` +
          `</span>`
        );
      }

      const first = escapeHtmlAttr(candidates[0]);
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const safeName = escapeHtmlAttr(name || 'strain');
      return (
        `<span class="top-shelf-rail-chip-art">` +
          `<img src="${first}" alt="${safeName} strain art" data-candidates="${joined}" data-idx="0" onerror="strainImageFallback(this)">` +
          `<span class="top-shelf-rail-chip-fallback" style="display:none;">${fallbackLabel}</span>` +
        `</span>`
      );
    }

    function getSavedToggleThumbHtml(name) {
      const fallbackLabel = escapeHtml(getStrainRailFallbackLabel(name));
      const filename = getStrainImageFilename(name);
      if (!filename) {
        return `<span class="saved-toggle-thumb"><span class="saved-toggle-thumb-fallback">${fallbackLabel}</span></span>`;
      }

      const candidates = strainImageCandidates(filename);
      if (!candidates.length) {
        return `<span class="saved-toggle-thumb"><span class="saved-toggle-thumb-fallback">${fallbackLabel}</span></span>`;
      }

      const first = escapeHtmlAttr(candidates[0]);
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const safeName = escapeHtmlAttr(name || 'strain');
      return (
        `<span class="saved-toggle-thumb">` +
          `<img src="${first}" alt="${safeName} strain art" data-candidates="${joined}" data-idx="0" onerror="strainImageFallback(this)">` +
          `<span class="saved-toggle-thumb-fallback" style="display:none;">${fallbackLabel}</span>` +
        `</span>`
      );
    }

    function getSavedToggleHtml(entries, isOpen) {
      const label = isCompactMobileLayout()
        ? (isOpen ? 'Hide strains' : 'Strains')
        : (isOpen ? 'Hide saved strains' : 'Saved strains');
      const visibleEntries = (entries || []).slice(0, 3);
      if (!visibleEntries.length) {
        return `<span class="saved-toggle-content"><span class="saved-toggle-label">${escapeHtml(label)}</span></span>`;
      }
      return (
        `<span class="saved-toggle-content">` +
          `<span class="saved-toggle-thumbs">${visibleEntries.map(entry => getSavedToggleThumbHtml(entry.name)).join('')}</span>` +
          `<span class="saved-toggle-label">${escapeHtml(label)}</span>` +
        `</span>`
      );
    }

    function getStrainSpotlightMediaHtml(name) {
      const filename = getStrainImageFilename(name);
      if (!filename) {
        return '<div class="strain-spotlight-fallback">No strain art yet. Add an image mapping in the data tools and it will show up here.</div>';
      }

      const candidates = strainImageCandidates(filename);
      if (!candidates.length) {
        return '<div class="strain-spotlight-fallback">No strain art yet. Add an image mapping in the data tools and it will show up here.</div>';
      }

      const first = escapeHtmlAttr(candidates[0]);
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const safeName = escapeHtmlAttr(name || 'strain');
      return (
        `<img src="${first}" alt="${safeName} strain art" data-candidates="${joined}" data-idx="0" onerror="strainImageFallback(this)">` +
        `<div class="strain-spotlight-fallback" style="display:none;">No strain art yet. Add an image mapping in the data tools and it will show up here.</div>`
      );
    }

    function getStashBagToneClass(seedValue) {
      const tones = ['stash-bag-tone-0', 'stash-bag-tone-1', 'stash-bag-tone-2', 'stash-bag-tone-3', 'stash-bag-tone-4'];
      const key = (seedValue || '').toString().trim() || 'stash-bag';
      let score = 0;
      for (let i = 0; i < key.length; i += 1) {
        score = (score + key.charCodeAt(i)) % tones.length;
      }
      return tones[score] || tones[0];
    }

    function getStashShelfEntries() {
      const entries = [];
      const used = new Set();
      const activeName = offeringAttributeFilterKind ? '' : getCanonicalStrainName(strainFilterText);

      const pushEntry = (name, source) => {
        const canonical = getCanonicalStrainName(name);
        const key = normaliseText(canonical);
        if (!key || used.has(key)) return;
        used.add(key);
        entries.push({ name: canonical, key, source, meta: getStrainVisualMeta(canonical) });
      };

      if (activeName) pushEntry(activeName, 'active');
      shelfStrainNames.forEach(name => pushEntry(name, 'shelf'));
      return entries.slice(0, 8);
    }

    function updateStashShelf() {
      const shelf = document.getElementById('stash-shelf');
      const grid = document.getElementById('stash-shelf-grid');
      const summary = document.getElementById('stash-shelf-summary');
      const toggle = document.getElementById('toggle-shelf');
      if (!shelf || !grid) return;

      const showShelf = shelfVisible;
      shelf.style.display = showShelf ? 'block' : 'none';
      document.body.classList.toggle('shelf-open', showShelf);
      document.body.classList.toggle('mobile-shelf-open', showShelf && isCompactMobileLayout());
      const entries = getStashShelfEntries();
      if (toggle) toggle.innerHTML = getSavedToggleHtml(entries, showShelf);
      if (!strainImageMapReady && !strainImageMapPromise) {
        ensureStrainImageMap().then(() => {
          updateStashShelf();
        });
      }
      if (!showShelf) return;

      if (summary) {
        if (!locations.length) {
          summary.textContent = `Once the ${getActiveLocationLabel()} data is ready, saved strains will stay available for quick map matching.`;
        } else {
          summary.textContent = entries.length
            ? `${entries.length} saved strain${entries.length === 1 ? '' : 's'}. Select one to show matching shops.`
            : 'No saved strains yet. Pick a strain from the map or Price & Menus to add it here.';
        }
      }

      if (!entries.length) {
        grid.innerHTML = '<div class="stash-shelf-empty">Pick a strain from the radar or a shop popup, then save it for quick access.</div>';
        return;
      }

      grid.innerHTML = entries.map(({ name, key, source, meta }) => {
        const isCurrent = normaliseText(strainFilterText) === key;
        const isShelved = isStrainShelved(name);
        const market = getStrainMarketInfo(name);
        const artHtml = getStrainImageHtml(name);
        const ribbon = isCurrent ? 'Current' : (source === 'shelf' ? 'Saved' : 'Live');
        const artSub = market.matchCount
          ? `${market.matchCount} shop${market.matchCount === 1 ? '' : 's'} lit up`
          : 'Ready to scan the map';
        const metaBits = [];
        if (meta.baseType !== 'unknown') metaBits.push(meta.baseType);
        if (meta.caliStatus === 'all') metaBits.push('Cali');
        if (meta.caliStatus === 'mixed') metaBits.push('Cali option available');
        if (market.matchCount) metaBits.push(`${market.matchCount} sellers`);
        if (market.cheapestShopLine) metaBits.push(`Lowest at ${market.cheapestShopLine}`);
        if (isShelved && !isCurrent) metaBits.push('Saved');
        const lowestText = market.cheapestPriceLabel
          ? `Lowest listed: ${market.cheapestPriceLabel}${market.cheapestShopName ? ` at ${market.cheapestShopName}` : ''}`
          : 'Lowest listed price appears when menu pricing is live.';

        return (
          `<article class="stash-bag ${getStashBagToneClass(getStrainShelfToneSeed(name))}${artHtml ? ' has-art' : ''}${isCurrent ? ' is-current is-active-filter' : ''}" data-strain="${escapeHtmlAttr(name)}">` +
            `<button type="button" class="stash-bag-remove" data-stash-remove="${escapeHtmlAttr(name)}" aria-label="Remove ${escapeHtmlAttr(name)} from saved strains">&times;</button>` +
            `<button type="button" class="stash-bag-main" data-stash-activate="${escapeHtmlAttr(name)}">` +
              `<span class="stash-bag-art">` +
                `${artHtml}` +
                `<span class="stash-bag-ribbon">${escapeHtml(ribbon)}</span>` +
                `<span class="stash-bag-art-title">${escapeHtml(getStrainShelfArtTitle(meta))}</span>` +
                `<span class="stash-bag-art-sub">${escapeHtml(artSub)}</span>` +
              `</span>` +
              `<span class="stash-bag-name">${escapeHtml(name || 'Mystery strain')}</span>` +
              `<span class="stash-bag-city">${escapeHtml(market.bestCityCopy || (isCurrent ? 'Current map match' : 'Saved strain'))}</span>` +
              `<span class="stash-bag-meta">${escapeHtml(metaBits.join(' · '))}</span>` +
              `<span class="stash-bag-price">${escapeHtml(lowestText)}</span>` +
              `<span class="stash-bag-footer">Tap to show the shops carrying this strain</span>` +
            `</button>` +
          `</article>`
        );
      }).join('');
    }

    function setTopShelfRailCollapsed(collapsed, options = {}) {
      topShelfRailCollapsed = !!collapsed;
      if (!options.skipSave) {
        saveStoredJson(TOP_SHELF_RAIL_COLLAPSED_STORAGE_KEYS, topShelfRailCollapsed);
      }
      updateTopShelfRail();
      if (map && !options.skipMapResize) {
        window.setTimeout(() => map.invalidateSize(), 180);
      }
    }

    function removeStashShelfEntry(name) {
      const canonical = getCanonicalStrainName(name);
      const key = normaliseText(canonical);
      if (!key) return;

      if (isStrainShelved(canonical)) {
        removeStrainFromShelf(canonical);
      }

      if (normaliseText(strainFilterText) === key) {
        clearStrainFilter();
      }

      renderStrainList();
      updateStashShelf();
      updateControlsSummary();
      refreshOpenPopupStrainLists();
      syncActiveStrainShelfButton();
      setRouteStatus(`${canonical} removed from saved strains.`, 'good');
    }

    function updateTopShelfRail() {
      const rail = document.getElementById('top-shelf-rail');
      const list = document.getElementById('top-shelf-rail-list');
      const toggleBtn = document.getElementById('top-shelf-rail-toggle');
      const toggleLabel = document.getElementById('top-shelf-rail-toggle-label');
      const toggleIcon = document.getElementById('top-shelf-rail-toggle-icon');
      if (!rail || !list) return;

      if (!strainImageMapReady && !strainImageMapPromise) {
        ensureStrainImageMap().then(() => {
          updateTopShelfRail();
        });
      }

      const entries = getStashShelfEntries();
      const shouldShowRail = !!locations.length && !!entries.length && !heroPopupVisible;
      document.body.classList.toggle('top-shelf-rail-active', shouldShowRail);
      document.body.classList.toggle('top-shelf-rail-collapsed', shouldShowRail && topShelfRailCollapsed);
      rail.classList.toggle('is-collapsed', shouldShowRail && topShelfRailCollapsed);

      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', String(!topShelfRailCollapsed));
        toggleBtn.setAttribute('aria-label', topShelfRailCollapsed ? 'Show saved strains' : 'Collapse saved strains');
        toggleBtn.title = topShelfRailCollapsed ? 'Show saved strains' : 'Collapse saved strains';
      }
      if (toggleLabel) {
        toggleLabel.textContent = `Saved · ${entries.length}`;
      }
      if (toggleIcon) {
        toggleIcon.textContent = topShelfRailCollapsed ? '▾' : '−';
      }

      if (!shouldShowRail) {
        rail.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      rail.style.display = 'block';
      list.innerHTML = entries.map(({ name, key, source }) => {
        const isCurrent = normaliseText(strainFilterText) === key;
        const isShelved = isStrainShelved(name);
        const market = getStrainMarketInfo(name);
        const metaText = isCurrent
          ? 'Current strain'
          : (market.cheapestPriceLabel
              ? `Cheapest ${market.cheapestPriceLabel}`
              : (market.countLabel || (source === 'shelf' ? 'Saved' : 'Live')));
        const removeBtn = isShelved
          ? `<button type="button" class="top-shelf-rail-remove" data-top-rail-remove="${escapeHtmlAttr(name)}" aria-label="Remove ${escapeHtmlAttr(name)} from shelf">&times;</button>`
          : '';

        return (
          `<div class="top-shelf-rail-item">` +
            `<button type="button" class="top-shelf-rail-chip${isCurrent ? ' is-active' : ''}" data-top-rail-strain="${escapeHtmlAttr(name)}">` +
              `${getTopShelfRailIconHtml(name)}` +
              `<span class="top-shelf-rail-chip-copy">` +
                `<span class="top-shelf-rail-chip-name">${escapeHtml(name)}</span>` +
                `<span class="top-shelf-rail-chip-meta">${escapeHtml(metaText)}</span>` +
              `</span>` +
            `</button>` +
            `${removeBtn}` +
          `</div>`
        );
      }).join('');
    }

    function tryNextImageCandidate(imgEl) {
      return Boolean(window.BudfinderLogos && window.BudfinderLogos.advanceImage(imgEl));
    }

    // Used by popup <img onerror> to try fallback logo paths.
    function popupLogoFallback(imgEl) {
      const advanced = tryNextImageCandidate(imgEl);
      if (!advanced) {
        imgEl.style.display = 'none';
      }
    }

    function strainImageFallback(imgEl) {
      const advanced = tryNextImageCandidate(imgEl);
      if (!advanced) {
        const spotlight = imgEl.closest('.strain-spotlight-media');
        if (spotlight) {
          imgEl.style.display = 'none';
          const fallback = spotlight.querySelector('.strain-spotlight-fallback');
          if (fallback) fallback.style.display = 'flex';
          return;
        }
        const railArt = imgEl.closest('.top-shelf-rail-chip-art');
        if (railArt) {
          imgEl.style.display = 'none';
          const fallback = railArt.querySelector('.top-shelf-rail-chip-fallback');
          if (fallback) fallback.style.display = 'flex';
          return;
        }
        const savedToggleThumb = imgEl.closest('.saved-toggle-thumb');
        if (savedToggleThumb) {
          imgEl.style.display = 'none';
          const fallback = savedToggleThumb.querySelector('.saved-toggle-thumb-fallback');
          if (fallback) fallback.style.display = 'grid';
          return;
        }
        const media = imgEl.closest('.stash-bag-art-media');
        if (media) media.style.display = 'none';
        const bag = imgEl.closest('.stash-bag');
        if (bag) bag.classList.remove('has-art');
      }
    }

    // Same fallback logic for marker logo images.
    // If no logo path works, use a plain marker pin image.
    function markerLogoFallback(imgEl) {
      const advanced = tryNextImageCandidate(imgEl);
      if (!advanced) {
        imgEl.onerror = null;
        imgEl.src = FALLBACK_MARKER_ICON_URL;
        imgEl.style.maxWidth = '100%';
        imgEl.style.maxHeight = '100%';
        imgEl.style.width = 'auto';
        imgEl.style.height = 'auto';
        imgEl.style.objectFit = 'contain';
        imgEl.style.objectPosition = 'center center';
        imgEl.style.padding = '0';
        imgEl.style.background = 'transparent';
        imgEl.style.margin = '0 auto';
      }
    }
    window.popupLogoFallback = popupLogoFallback;
    window.strainImageFallback = strainImageFallback;
    window.markerLogoFallback = markerLogoFallback;

    // =========================================================
    // Icons
    // =========================================================

    function getCategoryFallbackSvg(category) {
      const icons = {
        coffeeshop:
          '<path d="M5 8h11v4a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 5 12Z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M7 5h7"/><path d="M8 2h5"/>',
        hotel:
          '<path d="M3 18V6"/><path d="M3 13h16v5"/><path d="M7 13V9h5a3 3 0 0 1 3 3v1"/><path d="M3 18h18"/><path d="M7 9h2"/>',
        museum:
          '<path d="M4 8h16"/><path d="M6 8l6-4 6 4"/><path d="M7 8v9"/><path d="M12 8v9"/><path d="M17 8v9"/><path d="M5 17h14"/>',
        landmark:
          '<path d="M12 3l2.3 4.7 5.2.8-3.8 3.7.9 5.2L12 14.9l-4.6 2.5.9-5.2-3.8-3.7 5.2-.8Z"/>',
        food:
          '<path d="M6 3v8"/><path d="M4 3v5a2 2 0 0 0 4 0V3"/><path d="M6 11v8"/><path d="M16 3v16"/><path d="M16 3c2 1.4 3 3.2 3 5.4 0 2.1-1 3.6-3 4.6"/>',
        bar:
          '<path d="M5 4h14l-2 7a5 5 0 0 1-10 0Z"/><path d="M12 16v4"/><path d="M8 20h8"/><path d="M7 8h10"/>',
        transport:
          '<rect x="5" y="4" width="14" height="13" rx="3"/><path d="M8 17l-2 3"/><path d="M16 17l2 3"/><path d="M8 8h8"/><path d="M8 13h.01"/><path d="M16 13h.01"/>',
        park:
          '<path d="M12 19v-6"/><path d="M8 19h8"/><path d="M12 4c-3 3-5 5.4-5 7.4A5 5 0 0 0 17 11.4C17 9.4 15 7 12 4Z"/>',
        shopping:
          '<path d="M6 8h12l-1 12H7Z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 12h.01"/><path d="M15 12h.01"/>',
        viewpoint:
          '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="3"/>',
        area:
          '<path d="M4 6.5 10 4l6 2.5 4-1.5v13.5l-4 1.5-6-2.5-6 2.5Z"/><path d="M10 4v13.5"/><path d="M16 6.5V20"/><circle cx="12" cy="11.5" r="2.2"/>',
        other:
          '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>'
      };
      return icons[category] || icons.other;
    }

    function normaliseFallbackCategory(category) {
      const key = (category || '').toString().toLowerCase();
      return fallbackCategoryOrder.includes(key) ? key : 'other';
    }

    function getFallbackCategoryLabel(category) {
      return fallbackCategoryLabels[normaliseFallbackCategory(category)] || fallbackCategoryLabels.other;
    }

    function getFallbackCategoryFromLabel(label) {
      const key = normaliseText(label || '');
      if (key === 'coffeeshop' || key === 'coffee shop') return 'coffeeshop';
      if (key === 'hotel' || key === 'hostel') return 'hotel';
      if (key === 'museum' || key === 'gallery') return 'museum';
      if (key === 'attraction' || key === 'landmark') return 'landmark';
      if (key === 'food' || key === 'restaurant' || key === 'grocery' || key === 'cafe') return 'food';
      if (key === 'bar' || key === 'pub') return 'bar';
      if (key === 'transport' || key === 'station') return 'transport';
      if (key === 'park' || key === 'garden') return 'park';
      if (key === 'shopping' || key === 'shop' || key === 'market') return 'shopping';
      if (key === 'viewpoint' || key === 'view point' || key === 'lookout') return 'viewpoint';
      if (key === 'area' || key === 'district' || key === 'neighbourhood' || key === 'neighborhood') return 'area';
      return 'other';
    }

    function getCategoryIconSvg(category) {
      const safeCategory = normaliseFallbackCategory(category);
      return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${getCategoryFallbackSvg(safeCategory)}</svg>`;
    }

    function getLocationIconHtml(loc, category) {
      const candidates = loc ? logoCandidates(loc.logo, loc) : [];
      if (candidates.length) {
        const joined = candidates.map(escapeHtmlAttr).join('|');
        const first = escapeHtmlAttr(candidates[0]);
        return {
          html:
            `<img src="${first}" alt="" data-candidates="${joined}" data-idx="0" onerror="markerLogoFallback(this)">`,
          hasLogo: true
        };
      }
      return {
        html: getCategoryIconSvg(category),
        hasLogo: false
      };
    }

    function createCategoryFallbackIcon(category, priceLabel = '') {
      const safeCategory = normaliseFallbackCategory(category);
      const label = getFallbackCategoryLabel(safeCategory);
      return L.divIcon({
        html:
          `<div class="fallback-location-marker is-${escapeHtmlAttr(safeCategory)}" aria-label="${escapeHtmlAttr(label)} location">` +
            `<svg viewBox="0 0 38 44" aria-hidden="true" focusable="false">` +
              `<path class="fallback-pin" d="M19 0.75C29.1 0.75 37.25 8.75 37.25 18.65C37.25 30.55 23.65 41.25 19 43.15C14.35 41.25 0.75 30.55 0.75 18.65C0.75 8.75 8.9 0.75 19 0.75Z"/>` +
              `<circle class="fallback-face" cx="19" cy="18.2" r="11.8"/>` +
              `<g transform="translate(7 6)">${getCategoryFallbackSvg(safeCategory)}</g>` +
            `</svg>` +
            (priceLabel ? `<span class="marker-price-badge">${escapeHtml(priceLabel)}</span>` : '') +
          `</div>`,
        iconSize: [38, 44],
        iconAnchor: [19, 44],
        popupAnchor: [0, -38],
        className: `fallback-location-marker-icon fallback-location-marker-${safeCategory}`
      });
    }

    /**
     * Initialise category fallback markers. Existing logos are still preferred.
     */
    function initCategoryIcons() {
      fallbackCategoryOrder.forEach(category => {
        categoryIcons[category] = createCategoryFallbackIcon(category);
      });

      // Default grey icon if no category match
      defaultIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
        shadowUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
    }

    function hasLocationFlag(loc, names) {
      if (!loc) return false;
      const lookup = new Map(Object.keys(loc).map(key => [normaliseText(key), key]));
      return names.some(name => {
        const key = lookup.get(normaliseText(name));
        return !!(key && loc[key]);
      });
    }

    function getLocationFallbackCategory(loc) {
      if (!loc) return 'other';

      if (isAreaLocation(loc)) return 'area';
      if (hasLocationFlag(loc, ['Coffeeshop', 'Coffee shop', 'CoffeeShop'])) return 'coffeeshop';
      if (hasLocationFlag(loc, ['Hotel', 'Hotels'])) return 'hotel';
      if (hasLocationFlag(loc, ['Museum', 'Museums'])) return 'museum';
      if (hasLocationFlag(loc, ['Food', 'Restaurant', 'Restaurants', "McDonald's", 'Cafe', 'Café'])) return 'food';
      if (hasLocationFlag(loc, ['Bar', 'Bars', 'Pub', 'Pubs'])) return 'bar';
      if (hasLocationFlag(loc, ['Transport', 'Station', 'Train', 'Metro', 'Tram'])) return 'transport';
      if (hasLocationFlag(loc, ['Park', 'Parks', 'Garden', 'Gardens'])) return 'park';
      if (hasLocationFlag(loc, ['Shopping', 'Shop', 'Shops', 'Market', 'Albert Heijn'])) return 'shopping';
      if (hasLocationFlag(loc, ['Viewpoint', 'View point', 'Lookout', 'Observation'])) return 'viewpoint';
      if (hasLocationFlag(loc, ['Landmark', 'Landmarks'])) return 'landmark';

      const name = normaliseText(loc.name || '');
      if (hasLocationFlag(loc, ['Attraction', 'Attractions', 'Tourist attraction'])) {
        if (/\b(museum|rijksmuseum|stedelijk|foam|rembrandt|van gogh|gallery|galleries)\b/.test(name)) return 'museum';
        if (/\b(park|garden|gardens|vondelpark|westerpark|sarphatipark)\b/.test(name)) return 'park';
        if (/\b(view|lookout|tower|a'dam|adam lookout|sky|panorama|observation)\b/.test(name)) return 'viewpoint';
        if (/\b(market|mall|store|shop|shopping|nine streets|kalverstraat|albert heijn)\b/.test(name)) return 'shopping';
        return 'landmark';
      }

      if (/\b(hotel|hostel|inn|stay|suite|suites)\b/.test(name)) return 'hotel';
      if (/\b(station|centraal|airport|metro|tram|terminal|ferry)\b/.test(name)) return 'transport';
      if (/\b(restaurant|food|burger|pizza|cafe|café|bakery|kitchen|diner|mcdonald)\b/.test(name)) return 'food';
      if (/\b(bar|pub|taproom|cocktail|brewery)\b/.test(name)) return 'bar';
      if (/\b(park|garden|gardens)\b/.test(name)) return 'park';
      if (/\b(museum|gallery|galleries)\b/.test(name)) return 'museum';
      if (/\b(view|lookout|tower|panorama|observation)\b/.test(name)) return 'viewpoint';
      if (/\b(shop|shopping|market|store|albert heijn)\b/.test(name)) return 'shopping';

      return 'other';
    }

    /**
     * NEW:
     * Create a Leaflet icon using a coffee shop logo filename from the CSV.
     * If logo is missing/blank, return null so we can fall back to pin icons.
     *
     * CSV column: logo
     * Example value: boerejongens.png
     */
    function createLogoIcon(loc, priceLabel = '', options = {}) {
      const candidates = loc ? logoCandidates(loc.logo, loc, options) : [];
      if (!candidates.length) return null;
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const first = escapeHtmlAttr(candidates[0]);
      const labelText = (priceLabel || '').toString().trim();
      const safeLabel = escapeHtml(labelText);
      const badgeClass = safeLabel ? 'marker-price-badge' : 'marker-price-badge hidden';

      return L.divIcon({
        html:
          `<div class="shop-marker-wrap">` +
            `<div class="shop-logo-icon">` +
              `<img src="${first}" alt="" aria-hidden="true" ` +
              `data-candidates="${joined}" data-idx="0" onerror="markerLogoFallback(this)">` +
            `</div>` +
            `<span class="${badgeClass}">${safeLabel}</span>` +
          `</div>`,
        iconSize: [LOGO_MARKER_SIZE, LOGO_MARKER_SIZE],
        iconAnchor: [Math.round(LOGO_MARKER_SIZE / 2), LOGO_MARKER_SIZE],
        popupAnchor: [0, -LOGO_MARKER_SIZE],
        className: 'shop-marker-icon'
      });
    }

    function createSimpleShopIcon(loc, priceLabel = '') {
      const label = (loc && loc.name ? loc.name : 'Coffeeshop').toString().trim();
      const initial = escapeHtml((label.charAt(0) || 'B').toUpperCase());
      const price = (priceLabel || '').toString().trim();
      return L.divIcon({
        html:
          `<div class="simple-shop-marker" aria-hidden="true">` +
            `<span aria-hidden="true">${initial}</span>` +
            (price ? `<b>${escapeHtml(price)}</b>` : '') +
          `</div>`,
        iconSize: [34, 42],
        iconAnchor: [17, 38],
        popupAnchor: [0, -34],
        className: 'simple-shop-marker-icon'
      });
    }

    /**
     * Decide which icon to use for a location:
      *  1) Use logo icon if present
      *  2) Else fall back to category icon
      *  3) Else default icon
      */
    function chooseMarkerIcon(loc, priceLabel = '') {
      if (isCoffeeShopLocation(loc)) {
        const logoIcon = createLogoIcon(loc, priceLabel);
        if (logoIcon) return logoIcon;
        return createSimpleShopIcon(loc, priceLabel);
      }

      // Branded hotels, shops, restaurants, and other locations may also
      // provide an explicit logo. Keep category pins for unbranded places.
      if ((loc && loc.logo || '').toString().trim()) {
        const brandedLocationIcon = createLogoIcon(loc, priceLabel, { includeMonogram: false });
        if (brandedLocationIcon) return brandedLocationIcon;
      }

      const fallbackCategory = getLocationFallbackCategory(loc);
      return priceLabel ? createCategoryFallbackIcon(fallbackCategory, priceLabel) : (categoryIcons[fallbackCategory] || defaultIcon);
    }

    function createMeMarkerIcon() {
      return L.divIcon({
        html:
          `<div class="me-marker-wrap" aria-label="Your location">` +
            `<span class="me-marker-ping"></span>` +
            `<span class="me-marker-dot"></span>` +
          `</div>`,
        iconSize: [ME_MARKER_SIZE, ME_MARKER_SIZE],
        iconAnchor: [Math.round(ME_MARKER_SIZE / 2), Math.round(ME_MARKER_SIZE / 2)],
        className: 'me-marker-icon'
      });
    }

    function syncLocationControlUi(options = {}) {
      if (!locationControlButton) return;
      const hasFix = Array.isArray(lastPosition);
      const isLoading = !!options.loading;
      const hasError = !!options.error;
      locationControlButton.classList.toggle('is-active', hasFix && !hasError);
      locationControlButton.classList.toggle('is-loading', isLoading);
      locationControlButton.classList.toggle('has-error', hasError);
      locationControlButton.setAttribute('aria-pressed', String(hasFix));
      locationControlButton.setAttribute('aria-label', hasFix ? 'Re-centre on your location' : 'Show your location');
      locationControlButton.title = hasFix ? 'Re-centre on your location' : 'Show your location';
      const label = locationControlButton.querySelector('span');
      if (label) label.textContent = isLoading ? 'Locating…' : (hasFix ? 'Your location' : 'Locate me');
    }

    function addLocationMapControl() {
      if (!map) return;
      const LocationControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
          const container = L.DomUtil.create('div', 'leaflet-control location-map-control');
          const button = L.DomUtil.create('button', 'location-map-button', container);
          button.type = 'button';
          button.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path><circle cx="12" cy="12" r="8"></circle></svg>' +
            '<span>Locate me</span>';
          locationControlButton = button;
          syncLocationControlUi();
          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);
          L.DomEvent.on(button, 'click', async event => {
            L.DomEvent.stop(event);
            if (!lastPosition) {
              try {
                await requestUserLocation({ label: 'Finding your live location...' });
              } catch (_err) {
                return;
              }
            }
            focusMapOnCoords(lastPosition, {
              minZoom: isCompactMobileLayout() ? 15 : 16,
              animate: true,
              duration: 0.4
            });
            minimiseControlsForMapFocus();
          });
          return container;
        }
      });
      map.addControl(new LocationControl());
    }

    function updateMeLocationMarker(coords, accuracy) {
      if (!map || !Array.isArray(coords) || coords.length !== 2) return;

      const safeAccuracy = Number.isFinite(Number(accuracy))
        ? Math.max(8, Math.min(500, Number(accuracy)))
        : 24;
      if (!meAccuracyCircle) {
        meAccuracyCircle = L.circle(coords, {
          radius: safeAccuracy,
          interactive: false,
          color: '#1683ff',
          weight: 1,
          opacity: 0.52,
          fillColor: '#1683ff',
          fillOpacity: 0.1
        }).addTo(map);
      } else {
        meAccuracyCircle.setLatLng(coords);
        meAccuracyCircle.setRadius(safeAccuracy);
        if (!map.hasLayer(meAccuracyCircle)) meAccuracyCircle.addTo(map);
      }

      if (!meLocationMarker) {
        meLocationMarker = L.marker(coords, {
          icon: createMeMarkerIcon(),
          interactive: false,
          keyboard: false,
          zIndexOffset: 3000
        }).addTo(map).bindTooltip('You', {
          permanent: true,
          direction: 'top',
          offset: [0, -12],
          className: 'me-location-tooltip'
        });
        return;
      }

      meLocationMarker.setLatLng(coords);
      if (!map.hasLayer(meLocationMarker)) {
        meLocationMarker.addTo(map);
      }
      if (typeof meLocationMarker.bringToFront === 'function') meLocationMarker.bringToFront();
    }

    function popupLogoHtml(loc) {
      const candidates = logoCandidates(loc.logo, loc);
      if (!candidates.length) return '';
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const first = escapeHtmlAttr(candidates[0]);
      return `<img src="${first}" alt="" aria-hidden="true"
                  data-candidates="${joined}" data-idx="0"
                  onerror="popupLogoFallback(this)"
                  style="width:${POPUP_LOGO_SIZE}px;height:${POPUP_LOGO_SIZE}px;box-sizing:border-box;padding:6px;object-fit:contain;display:block;margin:8px auto;border:1px solid rgba(92,107,97,.16);border-radius:8px;background:#fff;">`;
    }

    function bestMatchLogoHtml(loc) {
      const candidates = loc ? logoCandidates(loc.logo, loc) : [];
      if (!candidates.length) return '';
      const joined = candidates.map(escapeHtmlAttr).join('|');
      const first = escapeHtmlAttr(candidates[0]);
      const label = escapeHtmlAttr(`${cleanDisplayName(loc.name || 'Coffeeshop')} logo`);
      return `<img class="best-match-logo" src="${first}" alt="${label}"
                  data-candidates="${joined}" data-idx="0"
                  onerror="popupLogoFallback(this)">`;
    }

    // =========================================================
    // Rating stars
    // =========================================================

    /**
     * Convert a rating 0–5 to a "★★★☆☆" string.
     */
    function renderStars(rating) {
      const r = Math.max(0, Math.min(5, rating || 0));
      const full = '★'.repeat(r);
      const empty = '☆'.repeat(5 - r);
      return full + empty;
    }

    async function fetchDbIndex() {
      const res = await fetch('/browse?table=shops&limit=5000', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`DB index unavailable (${res.status})`);

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = [];

      doc.querySelectorAll('tbody tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 4) return;
        const id = parseInt((tds[0].textContent || '').trim(), 10);
        if (!Number.isFinite(id)) return;
        rows.push({
          shop_id: id,
          name: (tds[1].textContent || '').trim(),
          city: (tds[2].textContent || '').trim(),
          shop_url: (tds[3].textContent || '').trim(),
        });
      });
      return rows;
    }

    function setDbStatus(text) {
      const el = document.getElementById('db-status');
      if (!el) return;
      if (!text) {
        el.textContent = '';
        el.style.display = 'none';
        return;
      }
      el.textContent = text;
      el.style.display = 'block';
    }

    function normaliseDbRow(raw) {
      const shopId = parseInt(raw && (raw.shop_id ?? raw.id), 10);
      if (!Number.isFinite(shopId)) return null;
      return {
        shop_id: shopId,
        name: ((raw && raw.name) || '').toString().trim(),
        city: ((raw && raw.city) || '').toString().trim(),
        shop_url: ((raw && (raw.shop_url || raw.website)) || '').toString().trim(),
        shop_key: ((raw && raw.shop_key) || '').toString().trim(),
        image_url: ((raw && raw.image_url) || '').toString().trim(),
        menu_status: ((raw && raw.menu_status) || '').toString().trim(),
        is_closed: raw && raw.is_closed,
        show_in_admin: raw && raw.show_in_admin,
        fetched_at_utc: ((raw && raw.fetched_at_utc) || '').toString().trim(),
        updated_at: ((raw && raw.updated_at) || '').toString().trim(),
      };
    }

    function isUnavailableDbRow(row) {
      if (!row) return false;
      const closedValue = row.is_closed;
      const adminValue = row.show_in_admin;
      const adminText = normaliseText(adminValue);
      const status = normaliseText(row.menu_status);
      const isClosed = closedValue === true || Number(closedValue) === 1 || normaliseText(closedValue) === 'true';
      const isHidden = adminValue != null && (
        adminValue === false ||
        Number(adminValue) === 0 ||
        ['false', 'no', 'n', 'off'].includes(adminText)
      );
      return isClosed || isHidden || ['closed', 'archived', 'archive', 'previous', 'old', 'error', 'failed'].includes(status);
    }

    function isUnavailableDbShopId(shopId) {
      const id = String(shopId || '').trim();
      return Boolean(id && dbUnavailableShopIds.has(id));
    }

    function isActiveOfferingRowAvailable(row) {
      const shopId = parseInt(row && row.shop_id, 10);
      return !Number.isFinite(shopId) || !isUnavailableDbShopId(shopId);
    }

    async function fetchDbIndexFromJson() {
      const candidates = [
        'database/shops.json',
        './database/shops.json',
        '/database/shops.json',
        'database/shop_lookup.json',
        './database/shop_lookup.json',
        '/database/shop_lookup.json',
        'shops.json',
        './shops.json',
        '/shops.json',
        'shop_lookup.json',
        './shop_lookup.json',
        '/shop_lookup.json',
      ];

      for (const url of candidates) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) continue;
          const data = await res.json();
          let rows = [];

          if (Array.isArray(data)) {
            rows = data.map(normaliseDbRow).filter(Boolean);
          } else if (data && typeof data === 'object') {
            rows = Object.entries(data)
              .map(([shopKey, value]) => normaliseDbRow({ ...(value || {}), shop_key: (value && value.shop_key) || shopKey }))
              .filter(Boolean);
          }

          if (rows.length) return rows;
        } catch (_err) {
          // Try next candidate path.
        }
      }

      throw new Error('No JSON shop index available');
    }

    async function fetchStrainShopIdsFromFlask(q) {
      const res = await fetch(`/strain_lookup?q=${encodeURIComponent(q)}&limit=5000`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const ids = new Set();

      doc.querySelectorAll('tbody tr').forEach(tr => {
        const link = tr.querySelector('a[href*="/shop/"]');
        if (!link) return;
        const id = extractShopIdFromHref(link.getAttribute('href') || '');
        if (id) ids.add(id);
      });
      return ids;
    }

    async function loadStrainIndexRows() {
      if (Array.isArray(strainIndexRows)) return strainIndexRows;
      if (strainIndexRowsPromise) return strainIndexRowsPromise;

      strainIndexRowsPromise = (async () => {
        const candidates = [
          'database/strain_index.json',
          './database/strain_index.json',
          '/database/strain_index.json',
          'strain_index.json',
          './strain_index.json',
          '/strain_index.json'
        ];
        for (const url of candidates) {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data)) {
              strainIndexRows = data;
              return strainIndexRows;
            }
          } catch (_err) {
            // Try next candidate path.
          }
        }
        throw new Error('No strain index JSON available');
      })();
      try {
        return await strainIndexRowsPromise;
      } finally {
        strainIndexRowsPromise = null;
      }
    }

    async function loadActiveOfferingsRows() {
      if (Array.isArray(activeOfferingsRows)) return activeOfferingsRows;
      if (activeOfferingsRowsPromise) return activeOfferingsRowsPromise;

      activeOfferingsRowsPromise = (async () => {
        const candidates = [
          'database/active_offerings.json',
          './database/active_offerings.json',
          '/database/active_offerings.json',
          'active_offerings.json',
          './active_offerings.json',
          '/active_offerings.json'
        ];
        for (const url of candidates) {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data)) {
              activeOfferingsRows = data;
              popupMenuBatchSignal = buildPopupMenuBatchSignal(activeOfferingsRows.filter(isActiveOfferingRowAvailable));
              return activeOfferingsRows;
            }
          } catch (_err) {
            // Try next candidate path.
          }
        }
        throw new Error('No active offerings JSON available');
      })();
      try {
        return await activeOfferingsRowsPromise;
      } finally {
        activeOfferingsRowsPromise = null;
      }
    }

    function formatPriceAmount(value) {
      if (!Number.isFinite(value)) return '';
      const rounded = Math.round(value * 100) / 100;
      return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
    }

    function buildPriceLabel(entries) {
      if (!Array.isArray(entries) || !entries.length) return '';
      const valid = entries.filter(e => Number.isFinite(e && e.amount));
      if (!valid.length) return '';

      const unit = ((valid[0].unit || 'g') + '').trim() || 'g';
      const currency = ((valid[0].currency || '€') + '').trim() || '€';
      const amounts = valid.map(e => e.amount).sort((a, b) => a - b);
      const min = amounts[0];
      const max = amounts[amounts.length - 1];

      if (Math.abs(max - min) < 0.0001) {
        return `${currency}${formatPriceAmount(min)}/${unit}`;
      }
      return `${currency}${formatPriceAmount(min)}-${formatPriceAmount(max)}/${unit}`;
    }

    function formatPriceValue(amount, currency = '€', unit = 'g') {
      if (!Number.isFinite(amount)) return '';
      const safeCurrency = (currency || '€').toString().trim() || '€';
      const safeUnit = (unit || 'g').toString().trim() || 'g';
      return `${safeCurrency}${formatPriceAmount(amount)}/${safeUnit}`;
    }

    function getOfferingPriceEntry(row) {
      const amount = parseFloat(row && row.price_amount);
      if (!Number.isFinite(amount)) return null;
      return {
        amount,
        currency: ((row && row.price_currency) || '€').toString().trim() || '€',
        unit: ((row && row.price_unit) || 'g').toString().trim() || 'g'
      };
    }

    function formatPackageWeight(value) {
      const weight = parseFloat(value);
      if (!Number.isFinite(weight) || weight <= 0) return '';
      return `${formatPriceAmount(weight)}g`;
    }

    function getOfferingPackageLabel(row) {
      const packageAmount = parseFloat(row && row.package_price_amount);
      const packageWeight = parseFloat(row && row.package_weight_g);
      const currency = ((row && row.price_currency) || '€').toString().trim() || '€';
      if (!Number.isFinite(packageAmount) || !Number.isFinite(packageWeight) || packageWeight <= 0) return '';
      const perGram = packageAmount / packageWeight;
      return `${currency}${formatPriceAmount(packageAmount)} · ${formatPackageWeight(packageWeight)} pack (${currency}${formatPriceAmount(perGram)}/g)`;
    }

    function getPriceCompareKey(priceEntry) {
      if (!priceEntry) return '';
      const currency = (priceEntry.currency || '€').toString().trim() || '€';
      const unit = (priceEntry.unit || 'g').toString().trim() || 'g';
      return `${currency}|${unit}`;
    }

    function buildStrainAveragePriceMap(rows) {
      const raw = new Map();

      (rows || []).forEach(row => {
        const strainName = ((row && (row.strain_name || row.strain_name_normalised)) || '').toString().trim();
        const strainKey = normaliseText(strainName);
        if (!strainKey) return;

        const priceEntry = getOfferingPriceEntry(row);
        if (!priceEntry) return;

        const compareKey = getPriceCompareKey(priceEntry);
        if (!compareKey) return;

        const shopId = parseInt(row && row.shop_id, 10);
        const locationIndex = findLocationIndexForShopMatch(shopId, row && row.shop_name, row && row.shop_city);
        const nameCityKey = normaliseNameCityKey(row && row.shop_name, row && row.shop_city);
        const shopKey = locationIndex !== null
          ? `loc:${locationIndex}`
          : (Number.isFinite(shopId) ? `id:${shopId}` : `name:${nameCityKey}`);
        if (!shopKey || shopKey === 'name:|') return;

        if (!raw.has(strainKey)) raw.set(strainKey, new Map());
        const byGroup = raw.get(strainKey);
        const current = byGroup.get(compareKey) || {
          shops: new Map(),
          currency: priceEntry.currency,
          unit: priceEntry.unit
        };
        const currentShopAmount = current.shops.get(shopKey);
        if (!Number.isFinite(currentShopAmount) || priceEntry.amount < currentShopAmount) {
          current.shops.set(shopKey, priceEntry.amount);
        }
        byGroup.set(compareKey, current);
      });

      const out = new Map();
      raw.forEach((byGroup, strainKey) => {
        const averagedGroups = new Map();
        byGroup.forEach((group, compareKey) => {
          const amounts = group && group.shops ? Array.from(group.shops.values()) : [];
          if (amounts.length < 2) return;
          const total = amounts.reduce((sum, amount) => sum + amount, 0);
          averagedGroups.set(compareKey, {
            average: total / amounts.length,
            count: amounts.length,
            currency: group.currency,
            unit: group.unit
          });
        });
        if (averagedGroups.size) out.set(strainKey, averagedGroups);
      });
      return out;
    }

    function getAveragePriceComparisonForEntries(strainName, priceEntries) {
      const strainKey = normaliseText((strainName || '').toString());
      if (!strainKey || !Array.isArray(priceEntries) || !priceEntries.length) return null;

      const byAverageGroup = strainAveragePricesByKey.get(strainKey);
      if (!byAverageGroup) return null;

      const candidatesByGroup = new Map();
      priceEntries.forEach(entry => {
        if (!Number.isFinite(entry && entry.amount)) return;
        const compareKey = getPriceCompareKey(entry);
        const averageInfo = byAverageGroup.get(compareKey);
        if (!averageInfo || averageInfo.count < 2) return;

        const current = candidatesByGroup.get(compareKey);
        if (!current || entry.amount < current.amount) {
          candidatesByGroup.set(compareKey, {
            amount: entry.amount,
            averageInfo
          });
        }
      });

      const candidates = Array.from(candidatesByGroup.values())
        .sort((a, b) => {
          const countDiff = (b.averageInfo.count || 0) - (a.averageInfo.count || 0);
          if (countDiff !== 0) return countDiff;
          return a.amount - b.amount;
        });
      if (!candidates.length) return null;

      const { amount, averageInfo } = candidates[0];
      const diff = amount - averageInfo.average;
      const averageText = formatPriceValue(averageInfo.average, averageInfo.currency, averageInfo.unit);
      const diffText = formatPriceValue(Math.abs(diff), averageInfo.currency, averageInfo.unit);

      if (Math.abs(diff) < 0.01) {
        return {
          tone: 'average',
          label: `At avg ${averageText}`,
          title: `Average ${averageText} from ${averageInfo.count} listings`,
          diff,
          average: averageInfo.average
        };
      }

      return {
        tone: diff < 0 ? 'cheaper' : 'expensive',
        label: `${diff < 0 ? 'Below' : 'Above'} avg ${diffText}`,
        title: `Average ${averageText} from ${averageInfo.count} listings`,
        diff,
        average: averageInfo.average
      };
    }

    function getLocationMenuValueSummary(loc, strains) {
      const entries = [];

      (strains || []).forEach(name => {
        const detail = getPopupStrainDetail(loc, name);
        const comparison = getAveragePriceComparisonForEntries(name, detail && detail.priceEntries);
        if (!comparison || !Number.isFinite(comparison.diff) || !Number.isFinite(comparison.average) || comparison.average <= 0) return;
        entries.push(comparison);
      });

      if (!entries.length) {
        return {
          tone: 'unknown',
          label: 'No average price signal yet',
          title: 'Not enough comparable strain prices yet'
        };
      }

      const belowCount = entries.filter(entry => entry.diff < -0.01).length;
      const aboveCount = entries.filter(entry => entry.diff > 0.01).length;
      const averageCount = entries.length - belowCount - aboveCount;
      const averageDeltaRatio = entries.reduce((sum, entry) => sum + (entry.diff / entry.average), 0) / entries.length;
      const absoluteRatio = Math.abs(averageDeltaRatio);
      let tone = 'average';

      if (belowCount && aboveCount && absoluteRatio < 0.08) {
        tone = 'mixed';
      } else if (averageDeltaRatio < -0.03) {
        tone = 'cheaper';
      } else if (averageDeltaRatio > 0.03) {
        tone = 'expensive';
      }

      const percentText = `${Math.round(absoluteRatio * 100)}%`;
      const label = tone === 'cheaper'
        ? `Menu ${percentText} below avg`
        : tone === 'expensive'
          ? `Menu ${percentText} above avg`
          : tone === 'mixed'
            ? 'Mixed value menu'
            : 'Menu around average';

      const titleParts = [
        `${entries.length} priced strain${entries.length === 1 ? '' : 's'} compared`,
        `${belowCount} below avg`,
        `${aboveCount} above avg`
      ];
      if (averageCount) titleParts.push(`${averageCount} around avg`);

      return {
        tone,
        label,
        title: titleParts.join(' · ')
      };
    }

    function collectMatchedActiveOfferingRows(qNorm, rows) {
      if (!qNorm) return [];
      const exact = [];
      const partial = [];
      (rows || []).forEach(r => {
        const n = normaliseText((r && (r.strain_name_normalised || r.strain_name)) || '');
        if (!n) return;
        if (n === qNorm) {
          exact.push(r);
        } else if (n.includes(qNorm)) {
          partial.push(r);
        }
      });
      return exact.length ? exact : partial;
    }

    function parseCompareGroupKey(groupKey) {
      const [currency = '€', unit = 'g'] = (groupKey || '').split('|');
      return { currency, unit };
    }

    function findLocationIndexForShopMatch(shopId, shopName, shopCity) {
      if (Number.isFinite(shopId)) {
        const byIdIndex = locations.findIndex(loc => loc && loc.db_shop_id === shopId);
        if (byIdIndex !== -1) return byIdIndex;
      }

      const key = normaliseNameCityKey(shopName, shopCity);
      if (key !== '|') {
        const byKeyIndex = locations.findIndex(loc => normaliseNameCityKey(loc && loc.name, (loc && loc.city) || '') === key);
        if (byKeyIndex !== -1) return byKeyIndex;
      }

      const nameKey = normaliseText(shopName || '');
      if (nameKey) {
        const nameMatches = locations
          .map((loc, index) => ({ loc, index }))
          .filter(entry => normaliseText(entry.loc && entry.loc.name) === nameKey);
        if (nameMatches.length === 1) return nameMatches[0].index;
      }

      return null;
    }

    function isOfferingRowInCurrentAtlas(row) {
      if (!locations.length) return true;
      const shopId = parseInt(row && row.shop_id, 10);
      return findLocationIndexForShopMatch(shopId, row && row.shop_name, row && row.shop_city) !== null;
    }

    function buildStrainPricingInsightFromRows(queryText, rows) {
      const qNorm = normaliseText(queryText);
      if (!qNorm) {
        return {
          byShopId: new Map(),
          byNameCity: new Map(),
          matchedShopIds: new Set(),
          matchedNameCityKeys: new Set(),
          cheapestShopIds: new Set(),
          cheapestNameCityKeys: new Set(),
          cheapestPriceLabel: ''
        };
      }

      const matchedRows = collectMatchedActiveOfferingRows(qNorm, rows)
        .filter(isActiveOfferingRowAvailable)
        .filter(isOfferingRowInCurrentAtlas);
      const byShopRaw = new Map();
      const byNameCityRaw = new Map();
      const matchedShopIds = new Set();
      const matchedNameCityKeys = new Set();
      const compareGroups = new Map();
      const comparableEntries = [];

      matchedRows.forEach(r => {
        const shopId = parseInt(r && r.shop_id, 10);
        if (Number.isFinite(shopId)) {
          matchedShopIds.add(shopId);
        }

        const key = normaliseNameCityKey(r && r.shop_name, r && r.shop_city);
        if (key !== '|') {
          matchedNameCityKeys.add(key);
        }

        const amount = parseFloat(r && r.price_amount);
        if (!Number.isFinite(amount)) return;
        const currency = ((r && r.price_currency) || '€').toString().trim() || '€';
        const unit = ((r && r.price_unit) || 'g').toString().trim() || 'g';
        const priceEntry = { amount, currency, unit };
        const compareKey = `${currency}|${unit}`;
        const currentGroup = compareGroups.get(compareKey) || { count: 0, minAmount: Infinity };
        currentGroup.count += 1;
        currentGroup.minAmount = Math.min(currentGroup.minAmount, amount);
        compareGroups.set(compareKey, currentGroup);

        if (Number.isFinite(shopId)) {
          if (!byShopRaw.has(shopId)) byShopRaw.set(shopId, []);
          byShopRaw.get(shopId).push(priceEntry);
        }

        if (key !== '|') {
          if (!byNameCityRaw.has(key)) byNameCityRaw.set(key, []);
          byNameCityRaw.get(key).push(priceEntry);
        }

        comparableEntries.push({ amount, compareKey, shopId, nameCityKey: key });
      });

      const byShopId = new Map();
      byShopRaw.forEach((entries, shopId) => {
        const label = buildPriceLabel(entries);
        if (label) byShopId.set(shopId, label);
      });

      const byNameCity = new Map();
      byNameCityRaw.forEach((entries, key) => {
        const label = buildPriceLabel(entries);
        if (label) byNameCity.set(key, label);
      });

      let cheapestShopIds = new Set();
      let cheapestNameCityKeys = new Set();
      let cheapestPriceLabel = '';

      const preferredGroup = Array.from(compareGroups.entries())
        .sort((a, b) => {
          const countDiff = (b[1].count || 0) - (a[1].count || 0);
          if (countDiff !== 0) return countDiff;
          const minDiff = (a[1].minAmount || Infinity) - (b[1].minAmount || Infinity);
          if (Math.abs(minDiff) > 0.0001) return minDiff;
          return a[0].localeCompare(b[0]);
        })[0];

      if (preferredGroup) {
        const [groupKey] = preferredGroup;
        const inGroup = comparableEntries.filter(entry => entry.compareKey === groupKey);
        const cheapestAmount = inGroup.reduce((min, entry) => Math.min(min, entry.amount), Infinity);
        if (Number.isFinite(cheapestAmount)) {
          const { currency, unit } = parseCompareGroupKey(groupKey);
          cheapestPriceLabel = `${currency}${formatPriceAmount(cheapestAmount)}/${unit}`;
          inGroup.forEach(entry => {
            if (Math.abs(entry.amount - cheapestAmount) > 0.0001) return;
            if (Number.isFinite(entry.shopId)) cheapestShopIds.add(entry.shopId);
            if (entry.nameCityKey && entry.nameCityKey !== '|') cheapestNameCityKeys.add(entry.nameCityKey);
          });
        }
      }

      return {
        byShopId,
        byNameCity,
        matchedShopIds,
        matchedNameCityKeys,
        cheapestShopIds,
        cheapestNameCityKeys,
        cheapestPriceLabel
      };
    }

    async function fetchStrainPriceMapsFromJson(q) {
      const rows = (await loadActiveOfferingsRows()).filter(isActiveOfferingRowAvailable);
      return buildStrainPricingInsightFromRows(q, rows);
    }

    async function fetchStrainShopIdsFromJson(q) {
      const qNorm = normaliseText(q);
      if (!qNorm) return { ids: new Set(), nameCityKeys: new Set(), source: 'none' };

      try {
        const rows = (await loadActiveOfferingsRows()).filter(isActiveOfferingRowAvailable);
        const exact = rows.filter(r => {
          const n = normaliseText((r && (r.strain_name_normalised || r.strain_name)) || '');
          return n === qNorm;
        });
        const partial = rows.filter(r => {
          const n = normaliseText((r && (r.strain_name_normalised || r.strain_name)) || '');
          return n.includes(qNorm);
        });
        const matchedRows = exact.length ? exact : partial;
        const ids = new Set();
        const nameCityKeys = new Set();
        matchedRows.forEach(r => {
          const id = parseInt(r && r.shop_id, 10);
          if (Number.isFinite(id)) ids.add(id);
          const key = normaliseNameCityKey(r && r.shop_name, r && r.shop_city);
          if (key !== '|') nameCityKeys.add(key);
        });
        return { ids, nameCityKeys, source: 'active_offerings' };
      } catch (_offeringErr) {
        // Fall back to strain_index.json only when the current listings are unavailable.
      }

      const rows = await loadStrainIndexRows();
      const exactMatches = [];
      const partialMatches = [];

      rows.forEach(r => {
        const n = normaliseText((r && (r.strain_name_normalised || r.strain_name_display)) || '');
        if (!n) return;
        if (n === qNorm) {
          exactMatches.push(r);
        } else if (n.includes(qNorm)) {
          partialMatches.push(r);
        }
      });

      const matchedRows = exactMatches.length ? exactMatches : partialMatches;
      const ids = new Set();
      const nameCityKeys = new Set();
      matchedRows.forEach(r => {
        const shops = (r && Array.isArray(r.shops)) ? r.shops : [];
        shops.forEach(s => {
          const id = parseInt(s && s.shop_id, 10);
          if (Number.isFinite(id) && isUnavailableDbShopId(id)) return;
          if (Number.isFinite(id)) ids.add(id);
          const key = normaliseNameCityKey(s && s.shop_name, s && s.shop_city);
          if (key !== '|') nameCityKeys.add(key);
        });
      });
      return { ids, nameCityKeys, source: 'strain_index' };
    }

    function dedupeAndSortStrainNames(names) {
      const byKey = new Map();
      (names || []).forEach(name => {
        const n = (name || '').toString().trim();
        const key = normaliseText(n);
        if (!key) return;
        if (!byKey.has(key)) byKey.set(key, n);
      });
      return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    function pushStrainIntoIndex(indexMap, key, strainName) {
      const k = (key || '').toString().trim();
      const n = (strainName || '').toString().trim();
      if (!k || !n) return;
      if (!indexMap.has(k)) indexMap.set(k, []);
      indexMap.get(k).push(n);
    }

    function finalisePopupStrainMap(indexMap, allowedStrainKeys = null) {
      const out = new Map();
      indexMap.forEach((names, key) => {
        const deduped = dedupeAndSortStrainNames(names).filter(name =>
          !(allowedStrainKeys instanceof Set) || allowedStrainKeys.has(normaliseText(name))
        );
        if (deduped.length) out.set(key, deduped);
      });
      return out;
    }

    function formatOfferingPriceLabel(row) {
      const priceEntry = getOfferingPriceEntry(row);
      return priceEntry ? formatPriceValue(priceEntry.amount, priceEntry.currency, priceEntry.unit) : '';
    }

    function formatDisplayDate(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(date);
    }

    function getAgeInDays(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      const diffMs = Date.now() - date.getTime();
      return Math.max(0, Math.floor(diffMs / 86400000));
    }

    function getFreshnessTime(value) {
      const time = new Date(value || '').getTime();
      return Number.isFinite(time) ? time : null;
    }

    function offeringFreshnessDateSource(row, options = {}) {
      const source = row || {};
      const includeBatchFields = options.includeBatchFields !== false;
      const candidates = [
        ['source_menu_date', source.source_menu_date],
        ['menu_date', source.menu_date],
        ['listing_date', source.listing_date],
        ['menu_changed_at_utc', source.menu_changed_at_utc],
        ['checked_at', source.checked_at],
        ['checked_at_utc', source.checked_at_utc],
        ['source_checked_at', source.source_checked_at],
        ['source_updated_at', source.source_updated_at],
        ['source_seen_at', source.source_seen_at],
        ['scraped_at', source.scraped_at],
        ['scraped_at_utc', source.scraped_at_utc],
        ['fetched_at_utc', source.fetched_at_utc],
        ['created_at', source.created_at],
        ...(includeBatchFields ? [
          ['menu_checked_at_utc', source.menu_checked_at_utc],
          ['last_seen_at_utc', source.last_seen_at_utc],
          ['last_seen_at', source.last_seen_at],
          ['updated_at', source.updated_at]
        ] : [])
      ];
      for (const [field, value] of candidates) {
        if (getFreshnessTime(value) !== null) return { field, value: (value || '').toString().trim() };
      }
      return { field: '', value: '' };
    }

    function trustedOfferingUpdatedAt(row) {
      return offeringFreshnessDateSource(row, { includeBatchFields: false }).value || '';
    }

    function buildPopupMenuBatchSignal(rows) {
      const latestByShop = new Map();
      let trustedDateCount = 0;
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const shopId = parseInt(row && row.shop_id, 10);
        const nameCityKey = normaliseNameCityKey(row && row.shop_name, row && row.shop_city);
        const key = Number.isFinite(shopId) ? `id:${shopId}` : `name:${nameCityKey}`;
        const source = offeringFreshnessDateSource(row);
        const time = getFreshnessTime(source.value);
        if (!key || key === 'name:|' || !Number.isFinite(time)) return;
        latestByShop.set(key, Math.max(latestByShop.get(key) || 0, time));
        if (trustedOfferingUpdatedAt(row)) trustedDateCount += 1;
      });

      const dateCounts = new Map();
      latestByShop.forEach(time => {
        const dateKey = new Date(time).toISOString().slice(0, 10);
        dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
      });
      const dominant = Array.from(dateCounts.entries()).sort((a, b) => b[1] - a[1])[0] || ['', 0];
      const timesOnDominantDate = Array.from(latestByShop.values())
        .filter(time => dominant[0] && new Date(time).toISOString().slice(0, 10) === dominant[0])
        .sort((a, b) => a - b);
      const clusters = [];
      timesOnDominantDate.forEach(time => {
        const last = clusters.at(-1);
        if (!last || time - last.end > MENU_SHARED_BATCH_CLUSTER_GAP_MS) {
          clusters.push({ start: time, end: time, count: 1 });
        } else {
          last.end = time;
          last.count += 1;
        }
      });
      const dominantCluster = clusters.sort((a, b) => b.count - a.count)[0] || { start: 0, end: 0, count: dominant[1] };
      const shopCount = latestByShop.size;
      const ratio = shopCount ? (dominantCluster.count || 0) / shopCount : 0;
      return {
        date: dominant[0],
        shopCount,
        count: dominantCluster.count || 0,
        ratio,
        windowStart: dominantCluster.start || 0,
        windowEnd: dominantCluster.end || 0,
        trustedDateCount,
        isSharedBatch: shopCount >= 8 && ratio >= 0.8
      };
    }

    function isSharedBatchOfferingDate(row) {
      const batch = popupMenuBatchSignal;
      if (!batch || !batch.isSharedBatch || !Number.isFinite(batch.windowStart) || !Number.isFinite(batch.windowEnd)) return false;
      if (trustedOfferingUpdatedAt(row)) return false;
      const source = offeringFreshnessDateSource(row);
      if (!MENU_BATCH_FRESHNESS_FIELDS.has(source.field)) return false;
      const time = getFreshnessTime(source.value);
      return Number.isFinite(time) && time >= batch.windowStart && time <= batch.windowEnd;
    }

    function getDisplayOfferingUpdatedAt(row) {
      const trustedValue = trustedOfferingUpdatedAt(row);
      if (trustedValue) return trustedValue;
      if (isSharedBatchOfferingDate(row)) return '';
      const source = offeringFreshnessDateSource(row);
      return MENU_BATCH_FRESHNESS_FIELDS.has(source.field) ? '' : source.value;
    }

    function getDisplayShopMetaUpdatedAt(meta) {
      if (!meta) return '';
      const changedValue = (meta.menu_changed_at_utc || '').toString().trim();
      if (changedValue && getFreshnessTime(changedValue) !== null) return changedValue;
      const value = ((meta.fetched_at_utc || meta.updated_at) || '').toString().trim();
      const time = getFreshnessTime(value);
      const batch = popupMenuBatchSignal;
      if (value && batch && batch.isSharedBatch && Number.isFinite(time) && time >= batch.windowStart && time <= batch.windowEnd) {
        return '';
      }
      return value;
    }

    function formatFreshnessLabel(value) {
      const days = getAgeInDays(value);
      if (days === null) return 'Menu date unknown';
      return `Menu date: ${formatDisplayDate(value)}`;
    }

    function freshnessTone(value) {
      const days = getAgeInDays(value);
      if (days === null) return 'unknown';
      if (days <= 14) return 'fresh';
      if (days <= 60) return 'recent';
      return 'old';
    }

    function ensurePopupStrainDetailEntry(rawMap, locationKey, strainKey) {
      if (!rawMap.has(locationKey)) rawMap.set(locationKey, new Map());
      const byStrain = rawMap.get(locationKey);
      if (!byStrain.has(strainKey)) {
        byStrain.set(strainKey, {
          prices: new Set(),
          packages: new Set(),
          growers: new Set(),
          notes: new Set(),
          priceEntries: [],
          listingCount: 0,
          caliListingCount: 0,
          legalListingCount: 0
        });
      }
      return byStrain.get(strainKey);
    }

    function pushPopupMenuUpdated(rawMap, locationKey, row) {
      const key = (locationKey || '').toString().trim();
      const updatedAt = getDisplayOfferingUpdatedAt(row);
      if (!key || !updatedAt) return;
      const current = rawMap.get(key) || '';
      if (!current || updatedAt > current) rawMap.set(key, updatedAt);
    }

    function pushPopupStrainDetail(rawMap, locationKey, strainName, row) {
      const locKey = (locationKey || '').toString().trim();
      const strainKey = normaliseText((strainName || '').toString().trim());
      if (!locKey || !strainKey) return;

      const entry = ensurePopupStrainDetailEntry(rawMap, locKey, strainKey);
      entry.listingCount += 1;
      if (Number(row && row.is_cali) === 1 || (row && row.is_cali) === true) {
        entry.caliListingCount += 1;
      }
      if (Number(row && row.is_legal) === 1 || (row && row.is_legal) === true) {
        entry.legalListingCount += 1;
      }
      const priceEntry = getOfferingPriceEntry(row);
      if (priceEntry) {
        entry.priceEntries.push(priceEntry);
        entry.prices.add(formatPriceValue(priceEntry.amount, priceEntry.currency, priceEntry.unit));
      }
      const packageLabel = getOfferingPackageLabel(row);
      if (packageLabel) entry.packages.add(packageLabel);

      const growerRaw = ((row && row.grower) || '').toString().replace(/\s+/g, ' ').trim();
      if (growerRaw) entry.growers.add(growerRaw);

      const noteRaw = ((row && (row.notes ?? row.note)) || '').toString().replace(/\s+/g, ' ').trim();
      if (noteRaw) entry.notes.add(noteRaw);
    }

    function finalisePopupStrainDetailMap(rawMap) {
      const out = new Map();
      rawMap.forEach((byStrainRaw, locationKey) => {
        const byStrain = new Map();
        byStrainRaw.forEach((raw, strainKey) => {
          const packageText = Array.from(raw.packages || [])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .join(', ');
          const priceText = packageText || Array.from(raw.prices || [])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .join(', ');
          const growerText = Array.from(raw.growers || []).join(' | ');
          const notesText = Array.from(raw.notes || []).join(' | ');
          byStrain.set(strainKey, {
            priceText,
            growerText,
            notesText,
            priceEntries: Array.isArray(raw.priceEntries) ? raw.priceEntries.slice() : [],
            isCali: Number(raw.caliListingCount) > 0,
            isLegal: Number(raw.legalListingCount) > 0
          });
        });
        if (byStrain.size) out.set(locationKey, byStrain);
      });
      return out;
    }

    async function ensurePopupStrainIndex() {
      if (popupStrainIndexReady) return true;
      if (popupStrainIndexPromise) return popupStrainIndexPromise;

      popupStrainIndexPromise = (async () => {
        const byIdRaw = new Map();
        const byNameCityRaw = new Map();
        const detailsByIdRaw = new Map();
        const detailsByNameCityRaw = new Map();
        const menuUpdatedByIdRaw = new Map();
        const menuUpdatedByNameCityRaw = new Map();
        strainAveragePricesByKey = new Map();
        let sawRows = false;
        let activeStrainKeys = null;

        try {
          const rows = await loadStrainIndexRows();
          if (rows.length) sawRows = true;
          rows.forEach(r => {
            const strainName = ((r && (r.strain_name_display || r.strain_name_normalised)) || '').toString().trim();
            if (!strainName) return;
            mergeStrainMeta(strainName, '', 0, false);
            const shops = (r && Array.isArray(r.shops)) ? r.shops : [];
            shops.forEach(s => {
              const id = parseInt(s && s.shop_id, 10);
              if (Number.isFinite(id) && isUnavailableDbShopId(id)) return;
              if (Number.isFinite(id)) {
                pushStrainIntoIndex(byIdRaw, String(id), strainName);
              }
              const key = normaliseNameCityKey(s && s.shop_name, s && s.shop_city);
              if (key !== '|') {
                pushStrainIntoIndex(byNameCityRaw, key, strainName);
              }
            });
          });
        } catch (_err) {
          // Optional source; keep going.
        }

        try {
          const rows = (await loadActiveOfferingsRows()).filter(isActiveOfferingRowAvailable);
          if (rows.length) sawRows = true;
          activeStrainKeys = new Set(rows
            .map(r => normaliseText((r && (r.strain_name || r.strain_name_normalised)) || ''))
            .filter(Boolean));
          popupMenuBatchSignal = buildPopupMenuBatchSignal(rows);
          strainAveragePricesByKey = buildStrainAveragePriceMap(rows.filter(isOfferingRowInCurrentAtlas));
          rows.forEach(r => {
            const strainName = ((r && (r.strain_name || r.strain_name_normalised)) || '').toString().trim();
            if (!strainName) return;
            mergeStrainMeta(strainName, r && r.base_type, r && r.is_cali);
            const id = parseInt(r && r.shop_id, 10);
            if (Number.isFinite(id)) {
              pushStrainIntoIndex(byIdRaw, String(id), strainName);
              pushPopupStrainDetail(detailsByIdRaw, String(id), strainName, r);
              pushPopupMenuUpdated(menuUpdatedByIdRaw, String(id), r);
            }
            const key = normaliseNameCityKey(r && r.shop_name, r && r.shop_city);
            if (key !== '|') {
              pushStrainIntoIndex(byNameCityRaw, key, strainName);
              pushPopupStrainDetail(detailsByNameCityRaw, key, strainName, r);
              pushPopupMenuUpdated(menuUpdatedByNameCityRaw, key, r);
            }
          });
        } catch (_err) {
          // Optional source; keep going.
        }

        if (activeStrainKeys instanceof Set) {
          Array.from(strainMetaByKey.keys()).forEach(key => {
            if (!activeStrainKeys.has(key)) strainMetaByKey.delete(key);
          });
        }

        popupStrainsByShopId = finalisePopupStrainMap(byIdRaw, activeStrainKeys);
        popupStrainsByNameCity = finalisePopupStrainMap(byNameCityRaw, activeStrainKeys);
        popupStrainDetailsByShopId = finalisePopupStrainDetailMap(detailsByIdRaw);
        popupStrainDetailsByNameCity = finalisePopupStrainDetailMap(detailsByNameCityRaw);
        popupMenuUpdatedByShopId = menuUpdatedByIdRaw;
        popupMenuUpdatedByNameCity = menuUpdatedByNameCityRaw;
        popupStrainIndexReady = true;
        updateAllMarkerValueTones();

        return sawRows || popupStrainsByShopId.size > 0 || popupStrainsByNameCity.size > 0;
      })()
        .finally(() => {
          popupStrainIndexPromise = null;
        });

      return popupStrainIndexPromise;
    }

    function isCoffeeShopLocation(loc) {
      if (!loc || typeof loc !== 'object') return false;
      if (typeof loc.Coffeeshop === 'boolean') return loc.Coffeeshop;
      const coffeeKey = Object.keys(loc).find(k => normaliseText(k) === 'coffeeshop');
      return coffeeKey ? !!loc[coffeeKey] : false;
    }

    function isAreaLocation(loc) {
      if (!loc || typeof loc !== 'object') return false;
      if (typeof loc.Area === 'boolean') return loc.Area;
      const areaKey = Object.keys(loc).find(k => normaliseText(k) === 'area');
      return areaKey ? !!loc[areaKey] : false;
    }

    function isClosedLocation(loc) {
      if (!loc || typeof loc !== 'object') return false;
      if (typeof loc.Closed === 'boolean') return loc.Closed;
      const closedKey = Object.keys(loc).find(k => normaliseText(k) === 'closed');
      return closedKey ? !!loc[closedKey] : false;
    }

    function popupStrainContainerId(index) {
      return `popup-strains-${index}`;
    }

    function popupCardId(index) {
      return `shop-popup-card-${index}`;
    }

    function setPopupCardValueTone(index, summary) {
      const card = document.getElementById(popupCardId(index));
      if (!card) return;
      const tone = summary && summary.tone ? summary.tone : 'unknown';
      card.classList.remove(
        'is-value-cheaper',
        'is-value-expensive',
        'is-value-mixed',
        'is-value-average',
        'is-value-unknown'
      );
      card.classList.add(`is-value-${tone}`);
      card.setAttribute('title', (summary && summary.title) ? summary.title : '');
    }

    function syncMarkerValueTone(index) {
      const marker = markers[index];
      const loc = locations[index];
      if (!marker || !loc || !marker._usesLogoIcon) return;

      const iconEl = marker.getElement && marker.getElement();
      if (!iconEl) return;

      const strains = popupStrainIndexReady ? getPopupStrainsForLocation(loc) : [];
      const summary = strains.length
        ? getLocationMenuValueSummary(loc, strains)
        : {
            tone: 'unknown',
            label: 'No average price signal yet',
            title: 'Not enough comparable strain prices yet'
          };
      const tone = summary && summary.tone ? summary.tone : 'unknown';

      iconEl.classList.remove(
        'is-value-cheaper',
        'is-value-expensive',
        'is-value-mixed',
        'is-value-average',
        'is-value-unknown'
      );
      iconEl.classList.add(`is-value-${tone}`);
      iconEl.setAttribute('title', `${loc.name || 'Coffeeshop'} · ${(summary && (summary.title || summary.label)) || ''}`);
    }

    function updateAllMarkerValueTones() {
      markers.forEach((_marker, index) => {
        syncMarkerValueTone(index);
      });
    }

    function getPopupStrainsForLocation(loc) {
      if (!loc) return [];

      if (loc.db_shop_id) {
        const byId = popupStrainsByShopId.get(String(loc.db_shop_id));
        if (Array.isArray(byId) && byId.length) return byId;
      }

      const key = normaliseNameCityKey(loc.name, loc.city || '');
      const byNameCity = popupStrainsByNameCity.get(key);
      if (Array.isArray(byNameCity) && byNameCity.length) return byNameCity;

      return [];
    }

    function getPopupStrainDetail(loc, strainName) {
      const strainKey = normaliseText((strainName || '').toString());
      if (!loc || !strainKey) return { priceText: '', growerText: '', notesText: '', priceEntries: [], isCali: false, isLegal: false };

      if (loc.db_shop_id) {
        const byId = popupStrainDetailsByShopId.get(String(loc.db_shop_id));
        if (byId && byId.has(strainKey)) {
          return byId.get(strainKey);
        }
      }

      const locationKey = normaliseNameCityKey(loc.name, loc.city || '');
      const byNameCity = popupStrainDetailsByNameCity.get(locationKey);
      if (byNameCity && byNameCity.has(strainKey)) {
        return byNameCity.get(strainKey);
      }

      return { priceText: '', growerText: '', notesText: '', priceEntries: [], isCali: false, isLegal: false };
    }

    function getPopupMenuUpdatedAt(loc) {
      if (!loc) return '';

      if (loc.db_shop_id) {
        const byId = popupMenuUpdatedByShopId.get(String(loc.db_shop_id));
        if (byId) return byId;
        const meta = dbShopMetaById.get(loc.db_shop_id);
        if (meta && meta.menu_changed_at_utc) {
          return getDisplayShopMetaUpdatedAt(meta);
        }
      }

      const locationKey = normaliseNameCityKey(loc.name, loc.city || '');
      return popupMenuUpdatedByNameCity.get(locationKey) || '';
    }

    function getShopSourceMeta(loc) {
      if (!loc || !loc.db_shop_id) return null;
      return dbShopMetaById.get(loc.db_shop_id) || null;
    }

    function getShopSourceImageUrl(loc) {
      const meta = getShopSourceMeta(loc);
      return meta && meta.image_url ? meta.image_url : '';
    }

    function settleOpenPopupLayout(index) {
      const marker = markers[index];
      if (!marker || typeof marker.isPopupOpen !== 'function' || !marker.isPopupOpen()) return;
      const popup = typeof marker.getPopup === 'function' ? marker.getPopup() : null;
      if (!popup || typeof popup.update !== 'function') return;

      const panPopupInsideMap = () => {
        if (!map || !marker.isPopupOpen() || typeof popup.getElement !== 'function') return;
        const popupElement = popup.getElement();
        const mapElement = typeof map.getContainer === 'function' ? map.getContainer() : null;
        if (!popupElement || !mapElement) return;

        const popupRect = popupElement.getBoundingClientRect();
        const mapRect = mapElement.getBoundingClientRect();
        const padding = 12;
        const viewportInsets = clampViewportInsets(getMapViewportInsets(), mapRect, {
          minVisibleWidthRatio: 0.56,
          minVisibleHeightRatio: 0.54
        });
        const leftInset = Math.max(padding, viewportInsets.paddingTopLeft[0]);
        const topInset = Math.max(padding, viewportInsets.paddingTopLeft[1]);
        const rightInset = Math.max(padding, viewportInsets.paddingBottomRight[0]);
        const bottomInset = Math.max(padding, viewportInsets.paddingBottomRight[1]);
        const leftEdge = mapRect.left + leftInset;
        const rightEdge = mapRect.right - rightInset;
        const topEdge = mapRect.top + topInset;
        const bottomEdge = mapRect.bottom - bottomInset;
        let panX = 0;
        let panY = 0;

        if (popupRect.left < leftEdge) {
          panX = popupRect.left - leftEdge;
        } else if (popupRect.right > rightEdge) {
          panX = popupRect.right - rightEdge;
        }
        if (popupRect.top < topEdge) {
          panY = popupRect.top - topEdge;
        } else if (popupRect.bottom > bottomEdge) {
          panY = popupRect.bottom - bottomEdge;
        }

        if (Math.abs(panX) > 1 || Math.abs(panY) > 1) {
          map.panBy([panX, panY], { animate: false });
        }
      };

      requestAnimationFrame(() => {
        if (!marker.isPopupOpen()) return;
        const popupElement = typeof popup.getElement === 'function' ? popup.getElement() : null;
        const liveContent = popupElement
          ? popupElement.querySelector('.leaflet-popup-content > *')
          : null;
        if (liveContent && typeof popup.getContent === 'function' && popup.getContent() !== liveContent) {
          // Leaflet stores string popup content and rebuilds it during update().
          // Promote the live card node first so asynchronously rendered menus
          // are preserved while the popup is remeasured and repositioned.
          popup.setContent(liveContent);
        } else {
          popup.update();
        }
        panPopupInsideMap();
        window.setTimeout(() => {
          if (!marker.isPopupOpen()) return;
          popup.update();
          panPopupInsideMap();
        }, 90);
      });
    }

    function getLocationFreshnessLabel(loc) {
      return formatFreshnessLabel(getPopupMenuUpdatedAt(loc));
    }

    async function refreshPopupStrainsForLocation(index) {
      const loc = locations[index];
      if (!loc || !isCoffeeShopLocation(loc)) return;

      const containerId = popupStrainContainerId(index);
      const container = document.getElementById(containerId);
      if (!container) return;

      container.style.display = 'block';
      container.innerHTML = '<p class="popup-strains-status">Checking menu matches...</p>';

      if (!loc.db_shop_id) {
        ensureDbIntegration()
          .then(dbOk => {
            if (dbOk) bindDbShopIdToLocation(loc);
          })
          .catch(() => {
            // Name-and-city menu matching below does not depend on DB linking.
          });
      }

      try {
        await ensurePopupStrainIndex();
      } catch (_err) {
        const failedContainer = document.getElementById(containerId);
        if (failedContainer) {
          failedContainer.innerHTML = '<p class="popup-strains-empty">Menu data could not be loaded. Close this shop and try again.</p>';
          settleOpenPopupLayout(index);
        }
        return;
      }

      const liveContainer = document.getElementById(containerId);
      if (!liveContainer) return;

      const strains = getPopupStrainsForLocation(loc);
      if (!strains.length) {
        setPopupCardValueTone(index, {
          tone: 'unknown',
          title: 'No matched menu prices yet'
        });
        liveContainer.style.display = 'block';
        liveContainer.innerHTML = '<p class="popup-strains-empty">No menu match for this shop yet. Try another Destination or check the shop directly.</p>';
        settleOpenPopupLayout(index);
        return;
      }

      liveContainer.style.display = 'block';
      const updatedAt = getPopupMenuUpdatedAt(loc);
      const updatedLabel = formatFreshnessLabel(updatedAt) || formatDisplayDate(updatedAt);
      const countText = `${strains.length} strain${strains.length === 1 ? '' : 's'} available${updatedLabel ? ` · ${updatedLabel}` : ''}`;
      const menuValueSummary = getLocationMenuValueSummary(loc, strains);
      setPopupCardValueTone(index, menuValueSummary);
      const menuValueSummaryHtml = menuValueSummary && menuValueSummary.label
        ? (
            `<span class="popup-menu-value-summary is-${escapeHtmlAttr(menuValueSummary.tone)}" title="${escapeHtmlAttr(menuValueSummary.title)}">` +
              `${escapeHtml(menuValueSummary.label)}` +
            `</span>`
          )
        : '';
      const activeKey = normaliseText(strainFilterText || '');
      const groupedPopupRows = new Map();
      strains.forEach(name => {
        const n = (name || '').toString();
        const key = normaliseText(n);
        const isActive = activeKey !== '' && key === activeKey;
        const isCheapest = isActive && isLocationCheapestForActiveStrain(loc);
        const isShelved = isStrainShelved(n);
        const meta = getStrainVisualMeta(n);
        const detail = getPopupStrainDetail(loc, n);
        const metaParts = [];
        const baseType = meta.baseType !== 'unknown' ? meta.baseType : 'unknown';
        if (detail && detail.growerText) {
          metaParts.push(`<span class="popup-strain-grower">Grower: ${escapeHtml(detail.growerText)}</span>`);
        }
        if (detail && detail.priceText) {
          metaParts.push(`<span class="popup-strain-price">${escapeHtml(detail.priceText)}</span>`);
        }
        const valueComparison = getAveragePriceComparisonForEntries(n, detail && detail.priceEntries);
        if (valueComparison) {
          metaParts.push(
            `<span class="popup-strain-value is-${escapeHtmlAttr(valueComparison.tone)}" title="${escapeHtmlAttr(valueComparison.title)}">` +
              `${escapeHtml(valueComparison.label)}` +
            `</span>`
          );
        }
        if (detail && detail.notesText) {
          metaParts.push(`<span class="popup-strain-notes">Notes: ${escapeHtml(detail.notesText)}</span>`);
        }
        const metaHtml = metaParts.length
          ? `<span class="popup-strain-meta">${metaParts.join('<span class="popup-strain-meta-sep">•</span>')}</span>`
          : '';
        const caliClass = detail && detail.isCali ? ' is-cali' : '';
        const caliBadge = detail && detail.isCali ? '<span class="strain-cali-badge">Cali</span>' : '';
        const legalBadge = detail && detail.isLegal ? '<span class="strain-legal-badge">Legal project</span>' : '';
        const cheapestBadge = isCheapest ? '<span class="strain-cheapest-badge">Cheapest</span>' : '';
        const rowHtml = (
          `<li>` +
            `<details class="popup-strain-row" name="popup-strain-${index}"${isActive ? ' open' : ''}>` +
              `<summary class="popup-strain-btn${caliClass}${isActive ? ' active' : ''}${isCheapest ? ' is-cheapest' : ''}" data-strain="${escapeHtmlAttr(n)}" data-popup-index="${index}" role="button">` +
                `<span class="strain-item-main">` +
                  `<span>${escapeHtml(n)}</span>` +
                  `<span class="strain-item-badges">` +
                    `${caliBadge}` +
                    `${legalBadge}` +
                    `${cheapestBadge}` +
                  `</span>` +
                `</span>` +
                `${metaHtml}` +
              `</summary>` +
              `<span class="popup-strain-actions">` +
                `<button type="button" class="popup-strain-show-shops" data-popup-strain-show-shops="${escapeHtmlAttr(n)}" aria-label="Show all shops carrying ${escapeHtmlAttr(n)}">` +
                  `<span class="popup-strain-action-icon" aria-hidden="true">` +
                    `<svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>` +
                  `</span>` +
                  `<span class="popup-strain-action-copy"><strong>Show other shops</strong><small>See every map match</small></span>` +
                `</button>` +
                `<button type="button" class="strain-shelf-chip-btn${isShelved ? ' is-active' : ''}" data-strain-shelf-toggle="${escapeHtmlAttr(n)}" data-popup-index="${index}">` +
                  `<span class="popup-strain-action-icon" aria-hidden="true">` +
                    `<svg viewBox="0 0 24 24"><path d="M6.5 4.5h11v16L12 17l-5.5 3.5v-16Z"></path></svg>` +
                  `</span>` +
                  `<span>${isShelved ? 'Saved strain' : 'Save strain'}</span>` +
                `</button>` +
                `<a class="popup-strain-explore" href="${escapeHtmlAttr(priceMenusUrl({ strain: n }))}" aria-label="Explore ${escapeHtmlAttr(n)} prices and shops">` +
                  `<span class="popup-strain-action-icon" aria-hidden="true">` +
                    `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"></ellipse><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"></path></svg>` +
                  `</span>` +
                  `<span>Explore prices</span>` +
                `</a>` +
              `</span>` +
            `</details>` +
          `</li>`
        );
        if (!groupedPopupRows.has(baseType)) groupedPopupRows.set(baseType, []);
        groupedPopupRows.get(baseType).push(rowHtml);
      });

      const itemsHtml = Array.from(groupedPopupRows.entries())
        .sort((a, b) => getStrainTypeOrder(a[0]) - getStrainTypeOrder(b[0]))
        .map(([baseType, rows]) => (
          `<li class="popup-strain-group">` +
            `<div class="popup-strain-group-title">` +
              `<span class="popup-strain-group-name">${escapeHtml(getStrainTypeHeading(baseType))}</span>` +
              `<span class="popup-strain-group-count">${rows.length}</span>` +
            `</div>` +
            `<ul class="popup-strain-group-list">${rows.join('')}</ul>` +
          `</li>`
        ))
        .join('');
      liveContainer.innerHTML =
        `<p class="popup-strains-count">${countText}${menuValueSummaryHtml}</p>` +
        `<ul class="popup-strains-list">${itemsHtml}</ul>`;
      liveContainer.querySelectorAll('[data-strain-shelf-toggle]').forEach(shelfBtn => {
        shelfBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const strain = (shelfBtn.getAttribute('data-strain-shelf-toggle') || '').trim();
          const popupIndex = parseInt(shelfBtn.getAttribute('data-popup-index') || '', 10);
          toggleShelfMembershipForStrain(strain, {
            popupIndex: Number.isInteger(popupIndex) ? popupIndex : null
          });
        });
      });
      settleOpenPopupLayout(index);
    }

    function refreshOpenPopupStrainLists() {
      markers.forEach((marker, index) => {
        if (!marker || typeof marker.isPopupOpen !== 'function' || !marker.isPopupOpen()) return;
        if (!isCoffeeShopLocation(locations[index])) return;
        refreshPopupStrainsForLocation(index);
      });
    }

    async function fetchActiveStrainNames() {
      try {
        const rows = await loadStrainIndexRows();
        const names = rows.map(r => (r && (r.strain_name_display || r.strain_name_normalised)) || '');
        const out = dedupeAndSortStrainNames(names);
        if (out.length) return out;
      } catch (_err) {
        // Fall back to the richer menu index below.
      }

      try {
        await ensurePopupStrainIndex();
        const namesFromMeta = Array.from(strainMetaByKey.values())
          .map(meta => meta && meta.name)
          .filter(Boolean);
        const outFromMeta = dedupeAndSortStrainNames(namesFromMeta);
        if (outFromMeta.length) return outFromMeta;
      } catch (_err) {
        // Fallback below.
      }

      try {
        const rows = (await loadActiveOfferingsRows()).filter(isActiveOfferingRowAvailable);
        const names = rows.map(r => (r && (r.strain_name || r.strain_name_normalised)) || '');
        const out = dedupeAndSortStrainNames(names);
        if (out.length) return out;
      } catch (_err) {
        // Fallback below.
      }

      return [];
    }

    function updateStrainListSelection() {
      const key = normaliseText(strainFilterText || '');
      document.querySelectorAll('#strain-list .strain-item').forEach(btn => {
        const btnKey = normaliseText(btn.getAttribute('data-strain') || '');
        btn.classList.toggle('active', key !== '' && btnKey === key);
      });
      document.querySelectorAll('.popup-strain-btn').forEach(btn => {
        const btnKey = normaliseText(btn.getAttribute('data-strain') || '');
        btn.classList.toggle('active', key !== '' && btnKey === key);
      });
    }

    function renderStrainList() {
      const listEl = document.getElementById('strain-list');
      const searchEl = document.getElementById('strain-list-search');
      if (!listEl || !searchEl) return;

      const q = normaliseText(searchEl.value || '');
      const names = activeStrainNames
        .filter(name => !q || normaliseText(name).includes(q))
        .slice(0, 24);
      listEl.innerHTML = '';

      if (!names.length) {
        listEl.innerHTML = '<div class="strain-empty">No strains found. Try a shorter name or clear the filter.</div>';
        return;
      }

      const frag = document.createDocumentFragment();
      names.forEach(name => {
        const row = document.createElement('div');
        row.className = 'strain-chip-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strain-item';
        btn.setAttribute('data-strain', name);
        const meta = getStrainVisualMeta(name);
        if (meta.baseType !== 'unknown') {
          btn.classList.add(`type-${meta.baseType}`);
        }
        if (meta.caliStatus === 'all') {
          btn.classList.add('is-cali');
        }

        const caliBadge = meta.caliStatus === 'all'
          ? '<span class="strain-cali-badge">Cali</span>'
          : (meta.caliStatus === 'mixed' ? '<span class="strain-cali-badge">Cali option</span>' : '');
        const isShelved = isStrainShelved(name);
        const cheapestBadge = normaliseText(strainFilterText) === normaliseText(name) && strainCheapestPriceLabel
          ? '<span class="strain-cheapest-badge">Cheapest</span>'
          : '';
        const metaBits = [];
        if (isShelved) metaBits.push('Saved');
        if (normaliseText(strainFilterText) === normaliseText(name) && strainCheapestPriceLabel) {
          metaBits.push(`Cheapest ${strainCheapestPriceLabel}`);
        }
        const metaHtml = metaBits.length
          ? `<span class="strain-item-meta">${escapeHtml(metaBits.join(' · '))}</span>`
          : '';
        btn.innerHTML =
          `<span class="strain-item-main">` +
            `<span>${escapeHtml(name)}</span>` +
            `<span class="strain-item-badges">` +
              `${caliBadge}` +
              `${cheapestBadge}` +
            `</span>` +
          `</span>` +
          `${metaHtml}`;
        const shelfBtn = document.createElement('button');
        shelfBtn.type = 'button';
        shelfBtn.className = `strain-shelf-chip-btn${isShelved ? ' is-active' : ''}`;
        shelfBtn.setAttribute('data-strain-shelf-toggle', name);
        shelfBtn.textContent = isShelved ? 'Saved' : 'Save';
        row.appendChild(btn);
        row.appendChild(shelfBtn);
        frag.appendChild(row);
      });
      listEl.appendChild(frag);
      updateStrainListSelection();
    }

    async function populateStrainListPanel() {
      const statusEl = document.getElementById('strain-list-status');
      const listEl = document.getElementById('strain-list');
      if (!statusEl || !listEl) return;

      if (!activeStrainNames.length) {
          statusEl.textContent = 'Preparing strain matches...';
        listEl.innerHTML = '';
        try {
          activeStrainNames = await fetchActiveStrainNames();
          shelfStrainNames = normaliseShelfStrainNames(shelfStrainNames);
          saveShelfStrains();
          updateGlobalSearchSuggestions();
          ensureStrainImageMap().then(() => {
            if (shelfVisible) updateStashShelf();
          });
        } catch (_err) {
          statusEl.textContent = 'Strain suggestions are unavailable right now.';
          listEl.innerHTML = '<div class="strain-empty">You can still search shops, areas, or try again in a moment.</div>';
          return;
        }
      }

      statusEl.textContent = `${activeStrainNames.length} strain-match options`;
      updateGlobalSearchSuggestions();
      renderStrainList();
    }

    function bestGlobalStrainMatch(query, visibleLocationCount) {
      const qNorm = normaliseText(query);
      if (!qNorm || !activeStrainNames.length) return '';

      if (window.BudfinderSearch) {
        const availabilityByKey = new Map((Array.isArray(strainIndexRows) ? strainIndexRows : []).map(row => [
          normaliseText(row && (row.strain_name_display || row.strain_name_normalised)),
          Array.isArray(row && row.shops) ? row.shops.length : 0
        ]));
        const best = window.BudfinderSearch.rank(query, activeStrainNames, {
          threshold: visibleLocationCount > 0 ? 0.86 : 0.72,
          limit: 120
        }).map(result => ({
          ...result,
          availability: availabilityByKey.get(normaliseText(result.item)) || 0
        })).sort((a, b) => b.score - a.score || b.availability - a.availability || a.index - b.index).slice(0, 2);
        if (!best.length) return '';
        const availabilityWinner = best.length > 1 && best[0].availability >= 3 && best[0].availability >= best[1].availability * 2;
        const hasClearWinner = best.length === 1 || best[0].score - best[1].score >= 0.08 || best[0].score >= 0.98 || availabilityWinner;
        return hasClearWinner ? best[0].item : '';
      }

      const exact = activeStrainNames.find(name => normaliseText(name) === qNorm);
      if (exact) return exact;

      if (visibleLocationCount > 0 || qNorm.length < 3) return '';

      const startsWith = activeStrainNames.filter(name => normaliseText(name).startsWith(qNorm));
      if (startsWith.length === 1) return startsWith[0];

      const contains = activeStrainNames.filter(name => normaliseText(name).includes(qNorm));
      return contains.length === 1 ? contains[0] : '';
    }

    function getOfferingAttributeMatch(query, rows) {
      const queryKey = normaliseText(query);
      if (!queryKey) return null;
      const legalAliases = new Set(['legal', 'legal weed', 'legal cannabis', 'regulated', 'regulated weed', 'wietexperiment', 'weed experiment']);
      if (legalAliases.has(queryKey)) {
        return {
          kind: 'legal',
          value: 'Legal project',
          rows: rows.filter(row => Number(row && row.is_legal) === 1 || (row && row.is_legal) === true)
        };
      }

      const growerByKey = new Map();
      rows.forEach(row => {
        const grower = ((row && row.grower) || '').toString().replace(/\s+/g, ' ').trim();
        const key = normaliseText(grower);
        if (key && !growerByKey.has(key)) growerByKey.set(key, grower);
      });
      const simplifiedQueryKey = queryKey
        .replace(/\b(seed bank|genetics|farms?|seeds?|collective|company)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const queryKeys = Array.from(new Set([queryKey, simplifiedQueryKey].filter(key => key.length >= 3)));
      if (window.BudfinderSearch) {
        const growers = Array.from(growerByKey.values());
        const ranked = window.BudfinderSearch.rank(query, growers, { threshold: 0.72, limit: 2 });
        const winner = ranked[0];
        const isClearWinner = winner && (
          ranked.length === 1 || winner.score - ranked[1].score >= 0.08 || winner.score >= 0.94
        );
        if (isClearWinner) {
          const grower = winner.item;
          const growerKey = normaliseText(grower);
          return {
            kind: 'grower',
            value: grower,
            rows: rows.filter(row => normaliseText(row && row.grower) === growerKey)
          };
        }
      }
      const exactEntry = queryKeys
        .map(key => growerByKey.has(key) ? [key, growerByKey.get(key)] : null)
        .find(Boolean);
      const exact = exactEntry ? exactEntry[1] : '';
      const partial = exact ? [] : Array.from(growerByKey.entries()).filter(([key]) =>
        queryKeys.some(queryCandidate => key.includes(queryCandidate) || queryCandidate.includes(key))
      );
      const grower = exact || (partial.length === 1 ? partial[0][1] : '');
      if (!grower) return null;
      const growerKey = normaliseText(grower);
      return {
        kind: 'grower',
        value: grower,
        rows: rows.filter(row => normaliseText(row && row.grower) === growerKey)
      };
    }

    async function applyOfferingAttributeFilter(kind, value, options = {}) {
      const isCurrentRequest = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
      const rows = (await loadActiveOfferingsRows()).filter(isActiveOfferingRowAvailable);
      if (!isCurrentRequest()) return false;
      const match = kind === 'legal'
        ? getOfferingAttributeMatch('legal weed', rows)
        : getOfferingAttributeMatch(value, rows);
      if (!match || !match.rows.length) return false;

      const ids = new Set();
      const nameCityKeys = new Set();
      match.rows.forEach(row => {
        const shopId = parseInt(row && row.shop_id, 10);
        if (Number.isFinite(shopId)) ids.add(shopId);
        const nameCityKey = normaliseNameCityKey(row && row.shop_name, row && row.shop_city);
        if (nameCityKey !== '|') nameCityKeys.add(nameCityKey);
      });

      offeringAttributeFilterKind = match.kind;
      offeringAttributeFilterValue = match.value;
      strainFilterText = match.kind === 'grower' ? `Grower: ${match.value}` : 'Legal project';
      strainAllowedShopIds = ids;
      strainAllowedNameCityKeys = nameCityKeys.size ? nameCityKeys : null;
      strainPriceByShopId = null;
      strainPriceByNameCity = null;
      strainCheapestShopIds = null;
      strainCheapestNameCityKeys = null;
      strainCheapestPriceLabel = '';
      locationSearchText = '';

      const matchedCount = locations.filter(loc => locationMatchesStrainMatchSets(loc, ids, strainAllowedNameCityKeys)).length;
      const label = match.kind === 'grower' ? `Grower: ${match.value}` : 'Legal project products';
      const status = document.getElementById('strain-status');
      if (status) status.textContent = `${label} (${matchedCount} shops nationwide)`;
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      refreshOpenPopupStrainLists();
      syncActiveStrainShelfButton();
      return true;
    }

    function updateGlobalSearchSuggestions(queryText = '') {
      const list = document.getElementById('global-search-suggestions');
      if (!list) return;

      const values = [];
      const seen = new Set();
      const queryKey = normaliseText(queryText);
      const push = value => {
        const text = (value || '').toString().replace(/\s+/g, ' ').trim();
        const key = normaliseText(text);
        if (!text || !key || seen.has(key)) return;
        seen.add(key);
        values.push(text);
      };

      if (queryKey) {
        const shopCandidates = Array.from(dbShopMetaById.entries())
          .filter(([shopId, meta]) => meta && !isUnavailableDbShopId(shopId))
          .map(([shopId, meta]) => ({ shopId, ...meta }));
        const matchingShops = window.BudfinderSearch
          ? window.BudfinderSearch.rank(queryText, shopCandidates, {
              getLabel: meta => meta && meta.name,
              getAliases: meta => [meta && meta.city, `${meta && meta.name} ${meta && meta.city}`],
              threshold: 0.72,
              limit: 60
            }).map(result => result.item)
          : shopCandidates
              .filter(meta => normaliseText(`${meta.name || ''} ${meta.city || ''}`).includes(queryKey))
              .slice(0, 60);
        matchingShops.forEach(meta => {
          push(meta && meta.name);
          const cityMatches = window.BudfinderSearch
            ? window.BudfinderSearch.matches(meta && meta.city, queryText, { threshold: 0.72 })
            : normaliseText(meta && meta.city).includes(queryKey);
          if (cityMatches) push(meta && meta.city);
        });
        const matchingStrains = window.BudfinderSearch
          ? window.BudfinderSearch.rank(queryText, activeStrainNames, { threshold: 0.72, limit: 60 }).map(result => result.item)
          : activeStrainNames.filter(name => normaliseText(name).includes(queryKey)).slice(0, 60);
        matchingStrains.forEach(push);
      } else {
        Array.from(dbShopMetaById.values()).forEach(meta => push(meta && meta.city));
      }

      locations.filter(isCoffeeShopLocation).slice(0, 50).forEach(loc => {
        push(loc && loc.name);
        push(loc && loc.city);
      });
      locations.filter(isAreaLocation).slice(0, 15).forEach(loc => push(loc && loc.name));
      const offeringRows = Array.isArray(activeOfferingsRows) ? activeOfferingsRows : [];
      const growerNames = Array.from(new Set(offeringRows
        .map(row => ((row && row.grower) || '').toString().replace(/\s+/g, ' ').trim())
        .filter(Boolean)));
      const matchingGrowers = queryKey && window.BudfinderSearch
        ? window.BudfinderSearch.rank(queryText, growerNames, { threshold: 0.72, limit: 60 }).map(result => result.item)
        : growerNames.filter(grower => !queryKey || normaliseText(grower).includes(queryKey)).slice(0, 60);
      matchingGrowers.forEach(push);
      if (!queryKey || normaliseText('Legal project').includes(queryKey) || normaliseText('legal weed').includes(queryKey)) {
        push('Legal weed');
      }
      (queryKey ? activeStrainNames.filter(name => normaliseText(name).includes(queryKey)) : activeStrainNames)
        .slice(0, 60)
        .forEach(push);

      list.innerHTML = values
        .slice(0, 105)
        .map(value => `<option value="${escapeHtmlAttr(value)}"></option>`)
        .join('');
    }

    function normaliseGlobalSearchCity(value) {
      const key = normaliseText(value);
      if (key === 'the hague' || key === 's gravenhage') return 'den haag';
      return key;
    }

    function findCsvPathForGlobalSearchCity(city) {
      const cityKey = normaliseGlobalSearchCity(city);
      if (!cityKey) return '';
      return discoveredCsvPaths.find(path => (
        !isMasterCoffeeshopPath(path) &&
        normaliseGlobalSearchCity(csvLabelFromPath(path)) === cityKey
      )) || '';
    }

    function mapViewPathForSearchRows(rows) {
      const cities = Array.from(new Map((Array.isArray(rows) ? rows : [])
        .map(row => ((row && row.shop_city) || '').toString().replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map(city => [normaliseGlobalSearchCity(city), city])).values());
      if (cities.length === 1) return findCsvPathForGlobalSearchCity(cities[0]);
      if (cities.length > 1) return discoveredCsvPaths.find(isMasterCoffeeshopPath) || '';
      return '';
    }

    function syncMapViewToSearchRows(rows, query) {
      const targetPath = mapViewPathForSearchRows(rows);
      if (!targetPath || canonicalCsvPath(targetPath) === canonicalCsvPath(currentCsvPath)) return false;
      return switchMapViewArea(targetPath, {
        persist: false,
        explicitSelection: false,
        searchTextOverride: query,
        focusSearchResults: true
      });
    }

    function findGlobalDestinationSearchTarget(query) {
      const queryKey = normaliseText(query);
      if (!queryKey || queryKey.length < 3 || !dbIntegrationReady) return null;

      let cityPath = findCsvPathForGlobalSearchCity(query);
      if (!cityPath && window.BudfinderSearch) {
        const rankedCities = window.BudfinderSearch.rank(
          query,
          discoveredCsvPaths.filter(path => !isMasterCoffeeshopPath(path)),
          { getLabel: path => csvLabelFromPath(path), threshold: 0.76, limit: 2 }
        );
        const winner = rankedCities[0];
        if (winner && (rankedCities.length === 1 || winner.score - rankedCities[1].score >= 0.08 || winner.score >= 0.94)) {
          cityPath = winner.item;
        }
      }
      if (cityPath && canonicalCsvPath(cityPath) !== canonicalCsvPath(currentCsvPath)) {
        const cityLabel = csvLabelFromPath(cityPath);
        return {
          kind: 'city',
          city: cityLabel,
          label: cityLabel,
          csvPath: cityPath
        };
      }

      const searchableShops = Array.from(dbShopMetaById.entries())
        .filter(([shopId, meta]) => (
          meta &&
          meta.name &&
          meta.city &&
          !isUnavailableDbShopId(shopId)
        ))
        .map(([shopId, meta]) => ({ shopId, ...meta }));
      const exactMatches = searchableShops.filter(shop => normaliseText(shop.name) === queryKey);
      const partialMatches = exactMatches.length
        ? exactMatches
        : window.BudfinderSearch
          ? window.BudfinderSearch.rank(query, searchableShops, {
              getLabel: shop => shop.name,
              getAliases: shop => [`${shop.name} ${shop.city}`],
              threshold: 0.72,
              limit: 4
            }).filter((result, index, all) => index === 0 || result.score >= all[0].score - 0.04).map(result => result.item)
          : searchableShops.filter(shop => normaliseText(shop.name).includes(queryKey));
      const uniqueTargets = Array.from(new Map(
        partialMatches.map(shop => [
          `${normaliseText(shop.name)}|${normaliseGlobalSearchCity(shop.city)}`,
          shop
        ])
      ).values());
      if (!uniqueTargets.length) return null;

      if (uniqueTargets.length > 1) {
        const cityKeys = new Set(uniqueTargets.map(shop => normaliseGlobalSearchCity(shop.city)).filter(Boolean));
        if (cityKeys.size === 1) {
          const sharedCity = uniqueTargets[0].city;
          const sharedCityPath = findCsvPathForGlobalSearchCity(sharedCity);
          if (sharedCityPath && canonicalCsvPath(sharedCityPath) !== canonicalCsvPath(currentCsvPath)) {
            return { kind: 'city', city: sharedCity, label: sharedCity, csvPath: sharedCityPath };
          }
        }
        const nationwidePath = discoveredCsvPaths.find(isMasterCoffeeshopPath);
        if (nationwidePath && canonicalCsvPath(nationwidePath) !== canonicalCsvPath(currentCsvPath)) {
          return { kind: 'nationwide', city: 'the Netherlands', label: query, csvPath: nationwidePath };
        }
        return null;
      }

      const match = uniqueTargets[0];
      const csvPath = findCsvPathForGlobalSearchCity(match.city);
      if (!csvPath || canonicalCsvPath(csvPath) === canonicalCsvPath(currentCsvPath)) return null;
      return {
        kind: 'shop',
        city: match.city,
        label: match.name,
        shopId: match.shopId,
        csvPath
      };
    }

    async function openGlobalDestinationSearchTarget(query, isCurrentRequest, options = {}) {
      const dbOk = await ensureDbIntegration();
      if (!dbOk || !isCurrentRequest()) return false;
      const target = findGlobalDestinationSearchTarget(query);
      if (!target) return false;
      if (target.kind === 'shop' && options.allowShop === false) return false;

      const status = document.getElementById('destination-search-status');
      if (status) {
        status.textContent = target.kind === 'shop'
          ? `Opening ${target.label} in ${target.city}…`
          : target.kind === 'nationwide'
            ? 'Opening nationwide coffeeshop results…'
            : `Opening the ${target.city} map…`;
      }
      switchMapViewArea(target.csvPath, {
        persist: false,
        explicitSelection: false,
        searchTextOverride: query,
        searchCategoryOverride: target.kind === 'city' ? '' : 'Coffeeshop',
        focusSearchResults: target.kind !== 'city'
      });
      setRouteStatus(
        target.kind === 'shop'
          ? `Showing ${target.label} in ${target.city}.`
          : target.kind === 'nationwide'
            ? `Showing matching coffeeshops across the Netherlands.`
            : `Showing the ${target.city} map.`,
        'ok'
      );
      return true;
    }

    function clearGlobalSearchAppliedStrainIfNeeded(query) {
      if (!globalSearchAppliedStrainKey) return false;
      const nextKey = normaliseText(query);
      if (nextKey === globalSearchAppliedStrainKey) return false;
      globalSearchAppliedStrainKey = '';
      clearStrainFilter();
      return true;
    }

    function scheduleGlobalSearchStrainResolve(query, visibleLocationCount, options = {}) {
      const requestId = ++globalSearchResolveRequestId;
      if (globalSearchStrainTimer !== null) {
        window.clearTimeout(globalSearchStrainTimer);
        globalSearchStrainTimer = null;
      }

      const q = (query || '').toString().replace(/\s+/g, ' ').trim();
      if (q.length < 3) return;
      const searchStatus = document.getElementById('destination-search-status');
      if (searchStatus && visibleLocationCount === 0) {
        searchStatus.textContent = `Checking nationwide shops and menus for "${q}"…`;
        const bestMatchSummary = document.getElementById('best-match-summary');
        const bestMatchList = document.getElementById('best-match-list');
        if (bestMatchSummary) {
          bestMatchSummary.textContent = `Checking all Budfinder locations for ${q}…`;
        }
        if (bestMatchList) {
          bestMatchList.innerHTML = '<p class="best-match-empty">Searching towns, shops, growers, and the full strain index…</p>';
        }
      }

      globalSearchStrainTimer = window.setTimeout(async () => {
        globalSearchStrainTimer = null;
        const searchInput = document.getElementById('destination-search');
        let acceptedResolvedQueryKey = '';
        const isCurrentRequest = () => {
          const currentQ = (searchInput ? searchInput.value : q).toString().replace(/\s+/g, ' ').trim();
          const currentKey = normaliseText(currentQ);
          return requestId === globalSearchResolveRequestId && (
            currentKey === normaliseText(q) ||
            (acceptedResolvedQueryKey && currentKey === acceptedResolvedQueryKey)
          );
        };
        if (!isCurrentRequest()) return;

        // Do not turn a paused first word into a completed search while the
        // user is still typing a longer name. Enter, blur/change, URL searches,
        // and multi-word queries still resolve immediately as expected.
        const queryWordCount = q.split(/\s+/).filter(Boolean).length;
        if (options.deferFocusedSingleWord === true &&
            searchInput === document.activeElement &&
            queryWordCount < 2) {
          if (searchStatus && visibleLocationCount === 0) {
            searchStatus.textContent = `Keep typing or press Enter to search all towns for "${q}".`;
          }
          return;
        }

        try {
          if (!activeStrainNames.length) {
            activeStrainNames = await fetchActiveStrainNames();
            if (!isCurrentRequest()) return;
          }
          const hasExactStrainMatch = activeStrainNames.some(name => normaliseText(name) === normaliseText(q));
          const likelyStrainMatch = window.BudfinderSearch ? bestGlobalStrainMatch(q, 0) : '';
          const hasLikelyStrainMatch = hasExactStrainMatch || Boolean(likelyStrainMatch);
          if (options.allowTownSwitch === true) {
            const openedDestination = await openGlobalDestinationSearchTarget(q, isCurrentRequest, {
              allowShop: !hasLikelyStrainMatch
            });
            if (openedDestination) return;
            if (!isCurrentRequest()) return;
          }

          const offeringRows = (await loadActiveOfferingsRows()).filter(isActiveOfferingRowAvailable);
          if (!isCurrentRequest()) return;
          const attributeMatch = getOfferingAttributeMatch(q, offeringRows);
          if (attributeMatch && attributeMatch.rows.length) {
            acceptedResolvedQueryKey = normaliseText(attributeMatch.kind === 'grower' ? attributeMatch.value : 'Legal weed');
            if (options.allowTownSwitch === true) {
              syncMapViewToSearchRows(
                attributeMatch.rows,
                attributeMatch.kind === 'grower' ? attributeMatch.value : 'Legal weed'
              );
            }
            const appliedAttribute = await applyOfferingAttributeFilter(
              attributeMatch.kind,
              attributeMatch.value,
              { isCurrent: isCurrentRequest }
            );
            if (!appliedAttribute || !isCurrentRequest()) return;
            const appliedLabel = attributeMatch.kind === 'grower' ? attributeMatch.value : 'Legal weed';
            globalSearchAppliedStrainKey = normaliseText(appliedLabel);
            if (searchInput) searchInput.value = appliedLabel;
            syncMapSearchUrl(appliedLabel);
            updateGlobalSearchSuggestions(appliedLabel);
            if (pendingInitialSearchPresentation) {
              focusSearchResultsPanel();
              fitMapToVisibleMarkers({ searchResults: true });
              pendingInitialSearchPresentation = false;
            }
            return;
          }

          if (!activeStrainNames.length) {
            activeStrainNames = await fetchActiveStrainNames();
            if (!isCurrentRequest()) return;
            if (strainListVisible) renderStrainList();
            updateGlobalSearchSuggestions(q);
          }

          const match = likelyStrainMatch || bestGlobalStrainMatch(q, visibleLocationCount);
          if (!match || !isCurrentRequest()) {
            if (isCurrentRequest()) {
              updateDestinationSearchStatus();
              refreshDestinationCards();
            }
            return;
          }

          globalSearchAppliedStrainKey = normaliseText(match);
          acceptedResolvedQueryKey = normaliseText(match);
          if (options.allowTownSwitch === true) {
            const matchedRows = collectMatchedActiveOfferingRows(normaliseText(match), offeringRows);
            syncMapViewToSearchRows(matchedRows, match);
          }
          locationSearchText = '';
          if (searchInput) searchInput.value = match;
          syncMapSearchUrl(match);
          const applied = await applyStrainFilter(match, { isCurrent: isCurrentRequest });
          if (!applied || !isCurrentRequest()) return;
          updateDestinationDropdown();
          updateMarkers();
          if (pendingInitialSearchPresentation) {
            focusSearchResultsPanel();
            fitMapToVisibleMarkers({ searchResults: true });
            pendingInitialSearchPresentation = false;
          }
        } catch (_err) {
          // Keep plain shop/city search if strain data is not available.
          if (isCurrentRequest()) {
            updateDestinationSearchStatus();
            refreshDestinationCards();
          }
        }
      }, options.immediate ? 0 : 520);
    }

    function setStrainListVisible(show) {
      strainListVisible = !!show;
      const panel = document.getElementById('strain-list-panel');
      const drawer = document.getElementById('map-strain-tools');
      if (panel) panel.style.display = strainListVisible ? 'block' : 'none';
      if (drawer) drawer.open = strainListVisible;
      if (strainListVisible) {
        populateStrainListPanel();
      }
    }

    async function ensureDbIntegration() {
      if (dbIntegrationReady) return true;
      let rows = [];

      try {
        rows = await fetchDbIndexFromJson();
        dbIntegrationSource = 'json';
        dbRouteLinksEnabled = false;
      } catch (_jsonErr) {
        try {
          rows = await fetchDbIndex();
          dbIntegrationSource = 'flask';
          dbRouteLinksEnabled = true;
        } catch (_flaskErr) {
          dbIntegrationReady = false;
          dbIntegrationSource = 'none';
          dbRouteLinksEnabled = false;
          dbUnavailableShopIds = new Set();
          setDbStatus('');
          return false;
        }
      }

      dbByShopKey = new Map();
      dbByPath = new Map();
      dbByNameCity = new Map();
      dbShopMetaById = new Map();
      dbUnavailableShopIds = new Set(
        rows
          .filter(isUnavailableDbRow)
          .map(r => String(r.shop_id || '').trim())
          .filter(Boolean)
      );
      const nameCounts = new Map();

      rows.forEach(r => {
        const sk = (r.shop_key || '').toString().trim();
        if (sk) dbByShopKey.set(sk, r.shop_id);
        const p = normaliseUrlPath(r.shop_url);
        if (p) dbByPath.set(p, r.shop_id);
        const nc = normaliseNameCityKey(r.name, r.city);
        if (nc !== '|') dbByNameCity.set(nc, r.shop_id);
        if (r && r.shop_id) {
          dbShopMetaById.set(r.shop_id, {
            name: (r.name || '').toString().trim(),
            city: (r.city || '').toString().trim(),
            shop_url: (r.shop_url || '').toString().trim(),
            image_url: (r.image_url || '').toString().trim(),
            menu_status: (r.menu_status || '').toString().trim(),
            is_closed: r.is_closed,
            show_in_admin: r.show_in_admin,
            fetched_at_utc: (r.fetched_at_utc || '').toString().trim(),
            updated_at: (r.updated_at || '').toString().trim()
          });
        }
        const nk = normaliseText(r.name);
        nameCounts.set(nk, (nameCounts.get(nk) || 0) + 1);
      });

      dbByUniqueName = new Map();
      rows.forEach(r => {
        const nk = normaliseText(r.name);
        if ((nameCounts.get(nk) || 0) === 1) {
          dbByUniqueName.set(nk, r.shop_id);
        }
      });

      dbIntegrationReady = true;
      if (dbIntegrationSource === 'flask') {
        setDbStatus(`DB links: connected (${rows.length} shops indexed)`);
      } else {
        // No warning banner for JSON/static mode.
        setDbStatus('');
      }
      return true;
    }

    function bindDbShopIdToLocation(loc) {
      let shopId = null;
      const locationKey = (loc.shop_key || '').toString().trim();
      const explicitMenuKey = (loc.menu_shop_key || '').toString().trim();
      const isLocalOnlyLocation = locationKey.startsWith('ams-') && !explicitMenuKey;

      const byShopKey = explicitMenuKey || (locationKey.startsWith('cs-') ? locationKey : '');
      if (byShopKey && dbByShopKey.has(byShopKey)) {
        shopId = dbByShopKey.get(byShopKey);
      }

      const byPath = normaliseUrlPath(loc.website);
      if (!shopId && !isLocalOnlyLocation && byPath && dbByPath.has(byPath)) {
        shopId = dbByPath.get(byPath);
      }

      if (!shopId && !isLocalOnlyLocation) {
        const nc = normaliseNameCityKey(loc.name, loc.city || '');
        if (dbByNameCity.has(nc)) {
          shopId = dbByNameCity.get(nc);
        }
      }

      if (!shopId && !isLocalOnlyLocation) {
        const nk = normaliseText(loc.name);
        if (dbByUniqueName.has(nk)) {
          shopId = dbByUniqueName.get(nk);
        }
      }

      loc.db_shop_id = shopId || null;
      // The nationwide catalogue owns whether a physical shop is open. A menu
      // record can be unavailable without removing that shop from the map.
      loc.db_shop_unavailable = !loc.catalog_shop_id && isUnavailableDbShopId(shopId);
      if (!loc.city && loc.db_shop_id && dbShopMetaById.has(loc.db_shop_id)) {
        const shopMeta = dbShopMetaById.get(loc.db_shop_id);
        if (shopMeta && shopMeta.city) {
          loc.city = shopMeta.city;
        }
      }
    }

    async function applyStrainFilter(queryText, options = {}) {
      const status = document.getElementById('strain-status');
      const q = (typeof queryText === 'string' ? queryText : '').trim();
      const isCurrentRequest = typeof options.isCurrent === 'function'
        ? options.isCurrent
        : () => true;
      if (options.recordHistory !== false && normaliseText(q) !== normaliseText(strainFilterText)) {
        rememberMapFilterState();
      }
      if (!q) {
        globalSearchAppliedStrainKey = '';
        strainFilterText = '';
        offeringAttributeFilterKind = '';
        offeringAttributeFilterValue = '';
        strainAllowedShopIds = null;
        strainAllowedNameCityKeys = null;
        strainPriceByShopId = null;
        strainPriceByNameCity = null;
        strainCheapestShopIds = null;
        strainCheapestNameCityKeys = null;
        strainCheapestPriceLabel = '';
        if (status) status.textContent = 'No map matching strains selected yet.';
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        if (activeStrainNames.length) {
          renderStrainList();
        } else {
          updateStrainListSelection();
        }
        refreshOpenPopupStrainLists();
        syncActiveStrainShelfButton();
        return true;
      }

      const dbOk = await ensureDbIntegration();
      if (!isCurrentRequest()) return false;

      // If DB index is available, link shop ids now.
      if (dbOk) {
        locations.forEach(bindDbShopIdToLocation);
      }

      try {
        let result;
        if (dbRouteLinksEnabled) {
          try {
            const ids = await fetchStrainShopIdsFromFlask(q);
            result = { ids, nameCityKeys: new Set(), source: 'flask' };
          } catch (_err) {
            // Flask endpoint not available: fall back to JSON index.
            dbRouteLinksEnabled = false;
            result = await fetchStrainShopIdsFromJson(q);
          }
        } else {
          result = await fetchStrainShopIdsFromJson(q);
        }
        if (!isCurrentRequest()) return false;

        let pricing = null;
        try {
          pricing = await fetchStrainPriceMapsFromJson(q);
        } catch (_err) {
          pricing = null;
        }
        if (!isCurrentRequest()) return false;

        strainFilterText = q;
        offeringAttributeFilterKind = '';
        offeringAttributeFilterValue = '';
        strainAllowedShopIds = result.ids;
        strainAllowedNameCityKeys = result.nameCityKeys.size ? result.nameCityKeys : null;

        if (pricing) {
          strainPriceByShopId = pricing.byShopId;
          strainPriceByNameCity = pricing.byNameCity;
          strainCheapestShopIds = pricing.cheapestShopIds.size ? pricing.cheapestShopIds : null;
          strainCheapestNameCityKeys = pricing.cheapestNameCityKeys.size ? pricing.cheapestNameCityKeys : null;
          strainCheapestPriceLabel = pricing.cheapestPriceLabel || '';
        } else {
          strainPriceByShopId = null;
          strainPriceByNameCity = null;
          strainCheapestShopIds = null;
          strainCheapestNameCityKeys = null;
          strainCheapestPriceLabel = '';
        }

        const matchedCount = locations.filter(loc => locationMatchesStrainMatchSets(loc, strainAllowedShopIds, strainAllowedNameCityKeys)).length;
        if (status) {
          status.textContent = strainCheapestPriceLabel
            ? `Map match: "${q}" (${matchedCount} shops · cheapest ${strainCheapestPriceLabel})`
            : `Map match: "${q}" (${matchedCount} shops)`;
        }
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        if (activeStrainNames.length) {
          renderStrainList();
        } else {
          updateStrainListSelection();
        }
        refreshOpenPopupStrainLists();
        syncActiveStrainShelfButton();
        return true;
      } catch (err) {
        if (!isCurrentRequest()) return false;
        strainPriceByShopId = null;
        strainPriceByNameCity = null;
        strainCheapestShopIds = null;
        strainCheapestNameCityKeys = null;
        strainCheapestPriceLabel = '';
        if (status) status.textContent = 'Strain search is still getting ready. Try again in a moment.';
        syncActiveStrainShelfButton();
        return false;
      }
    }

    function clearStrainFilter() {
      if ((strainFilterText || '').trim()) rememberMapFilterState();
      clearActiveStrainFilterState();
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
    }

    function selectInitialExplorerShopIfUnique() {
      if (!(explorerFocusShopIds instanceof Set) || explorerFocusShopIds.size !== 1) return false;
      const [shopId] = Array.from(explorerFocusShopIds);
      const index = locations.findIndex(loc => String(loc && loc.db_shop_id || '') === String(shopId));
      return index >= 0 ? selectDestinationIndex(index) : false;
    }

    async function applyExplorerStrainContextAfterCsvLoad() {
      if (!explorerFocusStrainName) {
        selectInitialExplorerShopIfUnique();
        syncExplorerFocusControls();
        return;
      }

      const applied = await applyStrainFilter(explorerFocusStrainName);
      if (applied) {
        const canonicalName = getCanonicalStrainName(explorerFocusStrainName);
        explorerFocusStrainName = canonicalName || explorerFocusStrainName;
        if (!(explorerFocusStrainShopIds instanceof Set) || !explorerFocusStrainShopIds.size) {
          explorerFocusStrainShopIds = strainAllowedShopIds instanceof Set
            ? new Set(strainAllowedShopIds)
            : null;
        }
        globalSearchAppliedStrainKey = normaliseText(explorerFocusStrainName);
        const searchInput = document.getElementById('destination-search');
        if (searchInput) searchInput.value = explorerFocusStrainName;
      }
      selectInitialExplorerShopIfUnique();
      const isNarrowedExplorerFocus = canShowAllExplorerStrainShops();
      setRouteStatus(
        isNarrowedExplorerFocus
          ? `Focused on the cheapest visible ${explorerFocusStrainName} shop. Use "Show all shops" to widen the map.`
          : `Showing shops carrying ${explorerFocusStrainName}.`,
        'ok'
      );
      syncExplorerFocusControls();
      updateControlsSummary();
      window.setTimeout(() => fitMapToVisibleMarkers(), 120);
    }

    // =========================================================
    // CSV loading
    // =========================================================

    function normaliseDiscoveredCsvPath(pathLike) {
      const raw = (pathLike || '').toString().trim();
      if (!raw) return '';

      let pathPart = raw;
      const isAbsoluteUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      if (isAbsoluteUrl) {
        try {
          pathPart = (new URL(raw)).pathname || '';
        } catch (_err) {
          pathPart = raw;
        }
      }

      // Normalize separators and remove query/hash fragments.
      let p = pathPart
        .replace(/\\/g, '/')
        .split('#')[0]
        .split('?')[0]
        .trim()
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '');

      if (!p || !/\.csv$/i.test(p)) return '';

      // If the path includes a database/locations/ or locations/ segment anywhere,
      // keep only the data-root-relative portion.
      const lower = p.toLowerCase();
      const dbIdx = lower.lastIndexOf('database/locations/');
      if (dbIdx >= 0) {
        p = p.slice(dbIdx);
      } else {
        const idx = lower.lastIndexOf('locations/');
        if (idx >= 0) {
          p = p.slice(idx);
        }
      }

      return p;
    }

    function ensureLocationsPrefix(pathLike) {
      const p = (pathLike || '').toString().replace(/^\/+/, '');
      if (!p) return '';
      const lower = p.toLowerCase();
      if (lower.startsWith('database/locations/')) return p;
      if (lower.startsWith('locations/')) return `database/${p}`;
      return `database/locations/${p}`;
    }

    function pickFirstCsvPath(paths) {
      const out = Array.from(new Set(
        (paths || [])
          .map(p => (p || '').toString().trim())
          .filter(p => p && /\.csv$/i.test(p))
      ));
      out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return out[0] || null;
    }

    function pickDefaultCsvPath(paths) {
      const available = Array.from(new Set(
        (paths || [])
          .map(canonicalCsvPath)
          .filter(p => p && /\.csv$/i.test(p))
      ));
      const exactAmsterdam = available.find(path =>
        csvFileNameFromPath(path).toLowerCase() === 'amsterdamloc.csv'
      );
      if (exactAmsterdam) return exactAmsterdam;

      const otherAmsterdam = available.find(path =>
        /^amsterdam(?:[\s_-]|loc|location|\.csv)/i.test(csvFileNameFromPath(path))
      );
      return otherAmsterdam || pickFirstCsvPath(available);
    }

    function canonicalCsvPath(pathLike) {
      const normalised = normaliseDiscoveredCsvPath(pathLike);
      if (normalised) return ensureLocationsPrefix(normalised);
      return (pathLike || '').toString().trim();
    }

    function loadSavedCsvPath() {
      const saved = loadStoredJson(LOCATION_DATA_STORAGE_KEYS, '');
      return canonicalCsvPath((saved || '').toString().trim());
    }

    function saveSelectedCsvPath(pathLike, options = {}) {
      const path = canonicalCsvPath(pathLike);
      if (!path) return;
      saveStoredJson(LOCATION_DATA_STORAGE_KEYS, path);
      if (options.explicit === true) {
        saveStoredJson(LOCATION_DATA_EXPLICIT_SELECTION_STORAGE_KEYS, true);
      }
    }

    function requestedLocationLabelFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        return (params.get('location_file') || params.get('location') || params.get('city') || '')
          .toString()
          .replace(/\s+/g, ' ')
          .trim();
      } catch (_err) {
        return '';
      }
    }

    function normaliseLocationLookupKey(value) {
      return (value || '')
        .toString()
        .toLowerCase()
        .replace(/\.csv$/i, '')
        .replace(/[^a-z0-9]+/g, '');
    }

    function getActiveLocationLabel(fallback = 'Amsterdam') {
      if (isMasterCoffeeshopPath(currentCsvPath)) return 'Netherlands';
      const currentLabel = csvLabelFromPath(currentCsvPath);
      if (currentLabel) return currentLabel;
      const requested = requestedLocationLabelFromUrl();
      const requestedLabel = requested ? csvLabelFromPath(requested) : '';
      return requestedLabel || fallback;
    }

    function updateLocationContext() {
      const locationLabel = getActiveLocationLabel();
      const isNationwideView = isMasterCoffeeshopPath(currentCsvPath);
      const userName = currentMapUserName();
      const landingKicker = document.getElementById('landing-location-kicker');
      const landingTitle = document.getElementById('landing-title');
      const journeyContent = document.getElementById('journey-progressive-content');
      const journeyNameInput = document.getElementById('journey-name-input');
      if (landingKicker) {
        landingKicker.textContent = isNationwideView
          ? 'Dutch coffeeshop guide'
          : `Dutch coffeeshop guide · Viewing ${locationLabel}`;
      }
      if (landingTitle) {
        landingTitle.textContent = 'Find coffeeshops across the Netherlands carrying the strains you actually want.';
      }
      if (journeyContent) {
        journeyContent.setAttribute('aria-label', isNationwideView ? 'Netherlands route planner' : `${locationLabel} map view and route planner`);
      }
      if (journeyNameInput && !journeyNameInput.value) {
        journeyNameInput.placeholder = isNationwideView
          ? (userName ? `Netherlands trip for ${userName}` : 'Netherlands coffeeshop trip')
          : (userName ? `${locationLabel} day out for ${userName}` : `Saturday in ${locationLabel}`);
      }
      document.title = isNationwideView
        ? 'Netherlands Coffeeshop Map & Ranked Matches | Budfinder'
        : `${locationLabel} View · Netherlands Coffeeshop Map | Budfinder`;
    }

    function resetAreaNavigationContext(pathLike, searchText = '') {
      clearExplorerFocus();
      locationSearchText = (searchText || '').toString().replace(/\s+/g, ' ').trim();
      missionMode = 'free-roam';
      nearbyExploreActive = false;
      activePopupLocationIndex = null;
      clearMapFilterHistory();
      const destinationSelect = document.getElementById('destination-select');
      if (destinationSelect) destinationSelect.value = '';
      lastDestinationSelectValue = '';
      if (map) map.closePopup();

      if (!window.history || !window.history.replaceState) return;
      const url = new URL(window.location.href);
      [
        'location_file', 'location', 'q', 'query', 'search', 'strain', 'strain_name',
        'shop', 'shops', 'shop_id', 'shop_ids', 'strain_shops', 'all_shops',
        'intent', 'destination', 'source'
      ].forEach(key => url.searchParams.delete(key));
      url.searchParams.set('city', isMasterCoffeeshopPath(pathLike) ? 'Netherlands' : csvLabelFromPath(pathLike));
      window.history.replaceState({}, document.title, url.href);
    }

    function pickRequestedCsvPath(paths) {
      const request = requestedLocationLabelFromUrl();
      if (!request) return null;
      const available = Array.from(new Set(
        (paths || [])
          .map(canonicalCsvPath)
          .filter(path => path && /\.csv$/i.test(path))
      ));
      const requestedCanonical = canonicalCsvPath(request);
      if (/\.csv$/i.test(request) && available.includes(requestedCanonical)) {
        return requestedCanonical;
      }
      const requestKey = normaliseLocationLookupKey(request);
      if (!requestKey) return null;
      if (requestKey === 'netherlands' || requestKey === 'allnetherlands') {
        return available.find(path => csvFileNameFromPath(path).toLowerCase() === 'coffeeshops.csv') || null;
      }
      return available.find(path => {
        const labelKey = normaliseLocationLookupKey(csvLabelFromPath(path));
        const fileKey = normaliseLocationLookupKey(csvFileNameFromPath(path));
        return labelKey === requestKey || fileKey === requestKey;
      }) || null;
    }

    function pickInitialCsvPath(paths) {
      const available = Array.from(new Set(
        (paths || [])
          .map(canonicalCsvPath)
          .filter(p => p && /\.csv$/i.test(p))
      ));
      const saved = loadSavedCsvPath();
      const defaultPath = pickDefaultCsvPath(available);
      const savedWasExplicit = loadStoredJson(LOCATION_DATA_EXPLICIT_SELECTION_STORAGE_KEYS, false) === true;
      if (saved && available.includes(saved)) {
        const looksLikeOldAutomaticFallback =
          !savedWasExplicit &&
          saved !== defaultPath &&
          saved === pickFirstCsvPath(available);
        if (!looksLikeOldAutomaticFallback) return saved;
      }
      return defaultPath;
    }

    function csvFileNameFromPath(pathLike) {
      const p = canonicalCsvPath(pathLike);
      if (!p) return '';
      const parts = p.split('/');
      return parts[parts.length - 1] || p;
    }

    function inferCityFromCsvPath(pathLike) {
      const label = csvFileNameFromPath(pathLike).replace(/\.csv$/i, '');
      if (!label) return '';

      const cleaned = label
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b(?:database|locations?|location)\b/ig, ' ')
        .replace(/(?:locations?|location|loc)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned) return '';
      return cleaned
        .split(' ')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }

    function csvLabelFromPath(pathLike) {
      if (csvFileNameFromPath(pathLike).toLowerCase() === 'coffeeshops.csv') return 'All Netherlands';
      const label = inferCityFromCsvPath(pathLike) || csvFileNameFromPath(pathLike);
      if (normaliseLocationLookupKey(label) === 'gronigen') return 'Groningen';
      if (normaliseLocationLookupKey(label) === 'denhaag') return 'Den Haag';
      return label;
    }

    function inferCityForLocationRow(row, csvPathLike) {
      const candidates = ['city', 'town', 'area', 'municipality', 'district', 'shop_city', 'address_city'];
      for (const key of candidates) {
        const value = ((row && row[key]) || '').toString().trim();
        if (value) return value;
      }
      return csvLabelFromPath(csvPathLike);
    }

    function renderCsvSwitchSelect(selectedPathLike) {
      const wrap = document.getElementById('csv-switch-wrap');
      const select = document.getElementById('csv-switch-select');
      if (!wrap || !select) return;

      select.innerHTML = '';

      if (!Array.isArray(discoveredCsvPaths) || discoveredCsvPaths.length === 0) {
        wrap.style.display = 'none';
        return;
      }

      wrap.style.display = 'block';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.text = 'Choose a map view...';
      placeholder.disabled = true;
      select.appendChild(placeholder);

      discoveredCsvPaths.forEach(path => {
        const opt = document.createElement('option');
        opt.value = path;
        opt.text = csvLabelFromPath(path);
        select.appendChild(opt);
      });

      const selectedPath = canonicalCsvPath(selectedPathLike);
      if (selectedPath && discoveredCsvPaths.includes(selectedPath)) {
        select.value = selectedPath;
      } else if (currentCsvPath && discoveredCsvPaths.includes(currentCsvPath)) {
        select.value = currentCsvPath;
      } else {
        select.value = '';
      }
    }

    function renderSettingsLocationSelect(selectedPathLike) {
      const select = document.getElementById('settings-default-city-select');
      if (!select) return;
      const selectedPath = canonicalCsvPath(selectedPathLike || currentCsvPath);
      select.innerHTML = (discoveredCsvPaths || []).map(path =>
        `<option value="${escapeHtmlAttr(path)}"${path === selectedPath ? ' selected' : ''}>${escapeHtml(csvLabelFromPath(path))}</option>`
      ).join('');
      select.disabled = !discoveredCsvPaths.length;
    }

    function setDiscoveredCsvPaths(paths, selectedPathLike) {
      discoveredCsvPaths = Array.from(new Set(
        (paths || [])
          .map(canonicalCsvPath)
          .filter(p => p && /\.csv$/i.test(p))
      )).sort((a, b) => {
        const aMaster = csvFileNameFromPath(a).toLowerCase() === 'coffeeshops.csv';
        const bMaster = csvFileNameFromPath(b).toLowerCase() === 'coffeeshops.csv';
        if (aMaster !== bMaster) return aMaster ? -1 : 1;
        return csvLabelFromPath(a).localeCompare(csvLabelFromPath(b), undefined, { sensitivity: 'base' });
      });

      renderCsvSwitchSelect(selectedPathLike);
      renderSettingsLocationSelect(selectedPathLike);
    }

    function buildCsvPathVariants(pathLike) {
      const raw = (pathLike || '').toString().trim();
      if (!raw) return [];

      const out = [];
      const seen = new Set();
      const pushUnique = p => {
        const v = (p || '').toString().trim();
        if (!v || seen.has(v)) return;
        seen.add(v);
        out.push(v);
      };

      pushUnique(raw);

      const isAbsoluteUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      const isDataUrl = raw.toLowerCase().startsWith('data:');
      if (isAbsoluteUrl || isDataUrl) {
        return out;
      }

      const stripped = raw.replace(/^\.\/+/, '').replace(/^\/+/, '');
      if (!stripped) {
        return out;
      }

      pushUnique(stripped);
      pushUnique(`./${stripped}`);
      pushUnique(`/${stripped}`);

      const strippedLower = stripped.toLowerCase();
      if (strippedLower.startsWith('database/locations/')) {
        const withoutDatabasePrefix = stripped.slice('database/'.length);
        const withoutLocationsPrefix = stripped.slice('database/locations/'.length);
        pushUnique(withoutDatabasePrefix);
        pushUnique(`./${withoutDatabasePrefix}`);
        pushUnique(`/${withoutDatabasePrefix}`);
        pushUnique(withoutLocationsPrefix);
        pushUnique(`./${withoutLocationsPrefix}`);
        pushUnique(`/${withoutLocationsPrefix}`);
      } else if (strippedLower.startsWith('locations/')) {
        const withoutPrefix = stripped.slice('locations/'.length);
        pushUnique(`database/${stripped}`);
        pushUnique(`./database/${stripped}`);
        pushUnique(`/database/${stripped}`);
        pushUnique(withoutPrefix);
        pushUnique(`./${withoutPrefix}`);
        pushUnique(`/${withoutPrefix}`);
      } else {
        pushUnique(`database/locations/${stripped}`);
        pushUnique(`./database/locations/${stripped}`);
        pushUnique(`/database/locations/${stripped}`);
        pushUnique(`locations/${stripped}`);
        pushUnique(`./locations/${stripped}`);
        pushUnique(`/locations/${stripped}`);
      }

      return out;
    }

    async function discoverCsvPathsInLocations() {
      const jsonCandidates = [
        'database/locations/index.json',
        './database/locations/index.json',
        '/database/locations/index.json',
        'locations/index.json',
        './locations/index.json',
        '/locations/index.json'
      ];
      for (const url of jsonCandidates) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) continue;
          const data = await res.json();
          const cityFiles = data && Array.isArray(data.cities)
            ? data.cities.map(city => city && city.file).filter(Boolean)
            : [];
          const files = Array.isArray(data)
            ? data
            : (cityFiles.length ? cityFiles : (data && Array.isArray(data.files) ? data.files : []));
          const masterFile = !Array.isArray(data) && data && data.master
            ? data.master
            : 'coffeeshops.csv';
          const csvPaths = files
            .map(normaliseDiscoveredCsvPath)
            .filter(Boolean)
            .map(ensureLocationsPrefix);
          const masterPath = ensureLocationsPrefix(normaliseDiscoveredCsvPath(masterFile));
          if (masterPath) csvPaths.unshift(masterPath);
          if (csvPaths.length) {
            return Array.from(new Set(csvPaths));
          }
        } catch (_err) {
          // Try next discovery source.
        }
      }

      const dirCandidates = [
        'database/locations/',
        './database/locations/',
        '/database/locations/',
        'locations/',
        './locations/',
        '/locations/'
      ];
      for (const url of dirCandidates) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const base = new URL(url, window.location.href);
          const csvPaths = [];

          doc.querySelectorAll('a[href]').forEach(a => {
            const href = (a.getAttribute('href') || '').trim();
            if (!href) return;
            let resolved;
            try {
              resolved = new URL(href, base);
            } catch (_err) {
              return;
            }
            if (resolved.origin !== window.location.origin) return;
            const p = (resolved.pathname || '').replace(/^\/+/, '');
            if (!/\.csv$/i.test(p)) return;
            csvPaths.push(p);
          });

          const inLocations = csvPaths
            .map(normaliseDiscoveredCsvPath)
            .filter(p => {
              const lower = p.toLowerCase();
              return lower.startsWith('database/locations/') || lower.startsWith('locations/');
            })
            .map(ensureLocationsPrefix);
          if (inLocations.length) {
            return Array.from(new Set(inLocations))
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
          }
        } catch (_err) {
          // Try next discovery source.
        }
      }

      return [];
    }

    async function parseCsvInput(input, parseOptions) {
      return new Promise((resolve, reject) => {
        Papa.parse(input, {
          header: true,
          skipEmptyLines: true,
          ...(parseOptions || {}),
          complete: async results => {
            const hasData = results && Array.isArray(results.data) && results.data.length > 0;
            if (!hasData) {
              reject(new Error('No valid rows found in the data file.'));
              return;
            }
            resolve(results.data);
          },
          error: err => {
            reject(err || new Error('Data parsing failed.'));
          }
        });
      });
    }

    function csvRowValue(row, key) {
      if (!row || !key) return '';
      const match = Object.keys(row).find(candidate => candidate.toLowerCase() === key.toLowerCase());
      return match ? String(row[match] ?? '').trim() : '';
    }

    function isMasterCoffeeshopPath(pathLike) {
      return csvFileNameFromPath(pathLike).toLowerCase() === 'coffeeshops.csv';
    }

    function isCoffeeshopCsvRow(row) {
      const explicit = csvRowValue(row, 'Coffeeshop');
      if (explicit) return ['y', 'yes', 'true', '1'].includes(explicit.toLowerCase());
      return Boolean(csvRowValue(row, 'shop_key'));
    }

    function normaliseMasterCoffeeshopRow(row) {
      const status = csvRowValue(row, 'status').toLowerCase();
      return {
        ...row,
        city: csvRowValue(row, 'city'),
        Coffeeshop: 'y',
        Closed: status === 'closed' ? 'y' : 'n'
      };
    }

    async function loadMasterCoffeeshopRows(seedRows = null) {
      if (Array.isArray(seedRows)) {
        const rows = seedRows.map(normaliseMasterCoffeeshopRow);
        masterCoffeeshopRowsPromise = Promise.resolve(rows);
        return rows;
      }
      if (!masterCoffeeshopRowsPromise) {
        masterCoffeeshopRowsPromise = parseCsvInput(MASTER_COFFEESHOP_CSV_PATH, { download: true })
          .then(rows => rows.map(normaliseMasterCoffeeshopRow))
          .catch(err => {
            masterCoffeeshopRowsPromise = null;
            throw err;
          });
      }
      return masterCoffeeshopRowsPromise;
    }

    async function buildLocationScopeRows(seedRows, csvPathLike) {
      if (nationwideLocationRowsPromise) return nationwideLocationRowsPromise;

      nationwideLocationRowsPromise = (async () => {
        const selectedPath = canonicalCsvPath(csvPathLike);
        const masterRows = isMasterCoffeeshopPath(selectedPath)
          ? await loadMasterCoffeeshopRows(seedRows)
          : await loadMasterCoffeeshopRows();
        const localPaths = discoveredCsvPaths.filter(path => !isMasterCoffeeshopPath(path));
        const localGroups = await Promise.all(localPaths.map(async path => {
          try {
            const rows = path === selectedPath
              ? (Array.isArray(seedRows) ? seedRows : [])
              : await parseCsvInput(path, { download: true });
            const fallbackCity = csvLabelFromPath(path);
            return rows
              .filter(row => !isCoffeeshopCsvRow(row))
              .map(row => ({
                ...row,
                city: csvRowValue(row, 'city') || fallbackCity
              }));
          } catch (_err) {
            // A missing local place file must not block the nationwide shop map.
            return [];
          }
        }));

        const localPlaces = [];
        const seenPlaces = new Set();
        localGroups.flat().forEach(row => {
          const identity = [
            csvRowValue(row, 'shop_key'),
            csvRowValue(row, 'name'),
            csvRowValue(row, 'city'),
            csvRowValue(row, 'lat'),
            csvRowValue(row, 'lng')
          ].join('|').toLowerCase();
          if (!identity.replace(/\|/g, '') || seenPlaces.has(identity)) return;
          seenPlaces.add(identity);
          localPlaces.push(row);
        });
        return [...masterRows, ...localPlaces];
      })().catch(err => {
        nationwideLocationRowsPromise = null;
        throw err;
      });

      return nationwideLocationRowsPromise;
    }

    function buildStrainImageMap(rows) {
      const nextMap = new Map();
      (rows || []).forEach(row => {
        const strainName = ((row && (row.strain_name || row.name)) || '').toString().trim();
        const imageFilename = ((row && (row.image_filename || row.filename || row.image)) || '').toString().trim();
        const key = normaliseText(strainName);
        if (!key || !imageFilename) return;
        if (!nextMap.has(key)) {
          nextMap.set(key, imageFilename);
        }
      });
      strainImageByKey = nextMap;
      strainImageMapReady = true;
      return nextMap;
    }

    async function ensureStrainImageMap() {
      if (strainImageMapReady) return strainImageByKey.size > 0;
      if (strainImageMapPromise) return strainImageMapPromise;

      strainImageMapPromise = (async () => {
        for (const path of STRAIN_IMAGE_MAP_CANDIDATES) {
          try {
            const rows = await parseCsvInput(path, { download: true });
            buildStrainImageMap(rows);
            return strainImageByKey.size > 0;
          } catch (_err) {
            // Try next candidate path.
          }
        }
        strainImageByKey = new Map();
        strainImageMapReady = true;
        return false;
      })().finally(() => {
        strainImageMapPromise = null;
      });

      return strainImageMapPromise;
    }

    function cleanDisplayName(value) {
      return (value || '')
        .toString()
        .replace(/Caf�/g, 'Café')
        .replace(/\bSatvia\b/g, 'Sativa')
        .replace(/\bKadinski\b/g, 'Kadinsky')
        .trim();
    }

    async function applyCsvRows(rows, options = {}) {
      const csvPathLike = (options && options.csvPathLike) || currentCsvPath || '';
      const hasSearchTextOverride = Object.prototype.hasOwnProperty.call(options || {}, 'searchTextOverride');
      const searchTextOverride = hasSearchTextOverride
        ? (options.searchTextOverride || '').toString().replace(/\s+/g, ' ').trim()
        : '';
      const searchCategoryOverride = (options.searchCategoryOverride || '').toString().trim();
      persistMapSessionNow();
      if (options.resetAreaContext === true) {
        resetAreaNavigationContext(csvPathLike, hasSearchTextOverride ? searchTextOverride : '');
      }
      mapSessionReady = false;
      if (mapSessionSaveTimer !== null) {
        window.clearTimeout(mapSessionSaveTimer);
        mapSessionSaveTimer = null;
      }
      activeMapSessionDatasetKey = getMapSessionDatasetKey(csvPathLike);
      const persistedMapSession = options.resetAreaContext === true || hasExplicitMapContextInUrl()
        ? null
        : loadPersistedMapSession(csvPathLike);
      initialViewportRestored = false;
      // Map each CSV row into a location object.
      // NOTE:
      //  - "logo" is optional.
      //  - Any additional Y/N columns become boolean flags (categories).
      locations = rows.map(r => {
        const obj = {
          catalog_shop_id: (r.shop_id || '').toString().trim(),
          name: cleanDisplayName(r.name),
          city: inferCityForLocationRow(r, csvPathLike),
          coords: [parseFloat(r.lat), parseFloat(r.lng)],
          website: r.website,
          shop_key: (r.shop_key || '').toString().trim(),
          menu_shop_key: (r.menu_shop_key || '').toString().trim(),
          address: (r.address || '').toString().trim(),
          source: (r.source || '').toString().trim(),
          source_url: (r.source_url || '').toString().trim(),
          logo: r.logo,
          visited: false,
          rating: 0,
          db_shop_id: null
        };

        // Parse visited flag (Y/N)
        if (typeof r.visited === 'string') {
          obj.visited = r.visited.trim().toLowerCase() === 'y';
        }

        // Parse rating as integer 1-5 (anything invalid -> 0 = no rating)
        if (r.rating !== undefined && r.rating !== null && r.rating !== '') {
          const pr = parseInt(r.rating, 10);
          if (!isNaN(pr)) {
            obj.rating = Math.max(1, Math.min(5, pr));
          }
        }

        // Parse other boolean Y/N fields as category flags.
        Object.entries(r).forEach(([k, v]) => {
          if (['shop_id','name','lat','lng','city','city_slug','province','address','postcode','status','website','shop_key','menu_shop_key','source','source_url','visited','rating','logo'].includes(k)) return;
          if (typeof v === 'string' && v.trim() !== '') {
            obj[k] = v.toLowerCase() === 'y';
          }
        });

        return obj;
      }).filter(loc => (
        loc.name &&
        Number.isFinite(loc.coords[0]) &&
        Number.isFinite(loc.coords[1]) &&
        Math.abs(loc.coords[0]) <= 90 &&
        Math.abs(loc.coords[1]) <= 180
      ));

      if (!locations.length) {
        throw new Error('No valid rows found in the data file.');
      }

      initialViewportRestored = !!(
        persistedMapSession &&
        isPersistedViewportRelevantToLocations(persistedMapSession.viewport)
      );

      resetMapState();

      // Reset per-CSV UI/filter state.
      strainFilterText = '';
      offeringAttributeFilterKind = '';
      offeringAttributeFilterValue = '';
      strainAllowedShopIds = null;
      strainAllowedNameCityKeys = null;
      setStrainListVisible(false);
      const strainStatus = document.getElementById('strain-status');
      const strainSearch = document.getElementById('strain-list-search');
      const strainList = document.getElementById('strain-list');
      const strainListStatus = document.getElementById('strain-list-status');
      strainPriceByShopId = null;
      strainPriceByNameCity = null;
      strainCheapestShopIds = null;
      strainCheapestNameCityKeys = null;
      strainCheapestPriceLabel = '';
      popupStrainIndexReady = false;
      popupStrainIndexPromise = null;
      popupStrainsByShopId = new Map();
      popupStrainsByNameCity = new Map();
      popupStrainDetailsByShopId = new Map();
      popupStrainDetailsByNameCity = new Map();
      popupMenuUpdatedByShopId = new Map();
      popupMenuUpdatedByNameCity = new Map();
      strainAveragePricesByKey = new Map();
      if (strainStatus) strainStatus.textContent = 'No map matching strains selected yet.';
      if (strainSearch) strainSearch.value = '';
      if (strainList) strainList.innerHTML = '';
      if (strainListStatus) strainListStatus.textContent = 'Open strain search to browse map-matching options.';
      const eta = document.getElementById('time-estimate');
      const distance = document.getElementById('distance-info');
      const destinationSearchInput = document.getElementById('destination-search');
      if (eta) eta.textContent = '--';
      if (distance) distance.textContent = '--';
      if (destinationSearchInput && destinationSearchInput.value !== locationSearchText) {
        destinationSearchInput.value = locationSearchText;
      }

      // Link CSV shops to DB shop ids (if backend is reachable).
      const dbOk = await ensureDbIntegration();
      if (dbOk) {
        locations.forEach(bindDbShopIdToLocation);
      }
      updateGlobalSearchSuggestions();

      hydrateLocationPreferences();

      // Determine the union of boolean category flags across the nationwide
      // catalogue and every town's local places.
      const reservedLocationKeys = new Set([
        'catalog_shop_id','name','city','coords','website','shop_key','menu_shop_key',
        'address','source','source_url','visited','rating','logo','Closed',
        'db_shop_id','db_shop_unavailable'
      ]);
      const categoryKeySet = new Set();
      locations.forEach(loc => {
        Object.entries(loc || {}).forEach(([key, value]) => {
          if (!reservedLocationKeys.has(key) && typeof value === 'boolean') {
            categoryKeySet.add(key);
          }
        });
      });
      locationSearchAreaAnchorCache = { key: '', anchors: [] };
      categoryOptions = Array.from(categoryKeySet).sort((a, b) => {
        if (a === 'Coffeeshop') return -1;
        if (b === 'Coffeeshop') return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      });

      // Keep the most useful map choices first; Saved shops remains available at the end.
      categoryOptions = ['all', ...categoryOptions, 'favourites'];

      selectedCategories = getDefaultLocationCategories();

      initCategoryIcons();
      populateCategorySelect();

      document.getElementById('map').style.display = 'block';
      document.getElementById('ui-toggles').dataset.ready = 'true';
      document.getElementById('ui-toggles').style.display = 'block';

      setStrainListVisible(false);
      // Start desktop in the primary search panel; keep mobile map-first.
      setControlsVisible(!isCompactMobileLayout(), { collapsed: false });
      setDirectionsVisible(false);

      initApp();
      if (persistedMapSession) {
        await restorePersistedMapSession(persistedMapSession);
      }
      if (hasSearchTextOverride) {
        locationSearchText = searchTextOverride;
        const searchInput = document.getElementById('destination-search');
        if (searchInput) searchInput.value = searchTextOverride;
        if (searchCategoryOverride && categoryOptions.includes(searchCategoryOverride)) {
          selectedCategories = [searchCategoryOverride];
          syncCategoryCheckboxes();
        }
        updateGlobalSearchSuggestions(searchTextOverride);
        updateNearestLabel();
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        updateControlsSummary();
        pendingInitialSearchPresentation = !!searchTextOverride;
        if (searchTextOverride) {
          window.setTimeout(() => {
            if (normaliseText(locationSearchText) !== normaliseText(searchTextOverride)) return;
            focusSearchResultsPanel();
            fitMapToVisibleMarkers({ searchResults: true });
            pendingInitialSearchPresentation = false;
          }, 180);
        }
      }
      ensurePopupStrainIndex().then(() => {
        updateDestinationDropdown();
        updateControlsSummary();
        refreshDestinationCards();
        renderJourneyPlanner();
      }).catch(() => {
        // Rich menu metadata is optional; the map still works without it.
      });
      await applyExplorerStrainContextAfterCsvLoad();
      if (!hasSearchTextOverride) {
        applyInitialSearchFromUrlAfterCsvLoad();
      }
      if ((hasSearchTextOverride || !getInitialSearchFromUrl()) && (locationSearchText || '').trim()) {
        const pendingQuery = locationSearchText.toString().replace(/\s+/g, ' ').trim();
        const visibleLocationCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
        scheduleGlobalSearchStrainResolve(pendingQuery, visibleLocationCount, { immediate: true });
      }
      mapSessionReady = true;
      schedulePersistMapSession(0);
      if (locationTrackingWanted) {
        requestUserLocation({
          label: 'Updating your location...',
          centerMap: false,
          animate: false,
          remember: false
        }).catch(() => {});
      }
      openSettingsFromHash();
    }

    async function loadCsvFromPath(path, options = {}) {
      const csvPath = (path || '').toString().trim();
      if (!csvPath) throw new Error('Map area path is empty.');

      const variants = buildCsvPathVariants(csvPath);
      const attempts = [];

      for (const candidate of variants) {
        const previousCsvPath = currentCsvPath;
        try {
          const rows = await parseCsvInput(candidate, { download: true });
          const scopedRows = await buildLocationScopeRows(rows, candidate);
          currentCsvPath = canonicalCsvPath(candidate);
          await applyCsvRows(scopedRows, {
            csvPathLike: candidate,
            resetAreaContext: options.explicitSelection === true,
            ...(Object.prototype.hasOwnProperty.call(options, 'searchTextOverride')
              ? { searchTextOverride: options.searchTextOverride }
              : {}),
            searchCategoryOverride: options.searchCategoryOverride || ''
          });
          updateLocationContext();
          if (options.persist !== false) {
            saveSelectedCsvPath(currentCsvPath, { explicit: options.explicitSelection === true });
          }
          renderCsvSwitchSelect(currentCsvPath);
          updateControlsSummary();
          return;
        } catch (err) {
          currentCsvPath = previousCsvPath;
          const reason = (err && err.message) ? err.message : 'unknown error';
          attempts.push(`${candidate}: ${reason}`);
        }
      }

      if (window.location.protocol === 'file:') {
        throw new Error(
          'Budfinder cannot read the built-in map data from this local file view. Open it through Budfinder and choose a map area from Settings > Data.'
        );
      }

      throw new Error('Budfinder could not reach the built-in location data.');
    }

    function syncMapViewUrl(pathLike) {
      if (!window.history || !window.history.replaceState) return;
      const url = new URL(window.location.href);
      url.searchParams.delete('location_file');
      url.searchParams.delete('location');
      url.searchParams.set('city', isMasterCoffeeshopPath(pathLike) ? 'Netherlands' : csvLabelFromPath(pathLike));
      window.history.replaceState({}, document.title, url.href);
    }

    function syncMapSearchUrl(query) {
      if (!window.history || !window.history.replaceState) return;
      const value = (query || '').toString().replace(/\s+/g, ' ').trim();
      const url = new URL(window.location.href);
      url.searchParams.delete('q');
      url.searchParams.delete('query');
      if (value) url.searchParams.set('search', value);
      else url.searchParams.delete('search');
      window.history.replaceState({}, document.title, url.href);
    }

    function switchMapViewArea(pathLike, options = {}) {
      const selectedPath = canonicalCsvPath(pathLike);
      if (!selectedPath || !discoveredCsvPaths.includes(selectedPath)) return false;
      const hasSearchTextOverride = Object.prototype.hasOwnProperty.call(options, 'searchTextOverride');
      const searchTextOverride = hasSearchTextOverride
        ? String(options.searchTextOverride || '').replace(/\s+/g, ' ').trim()
        : locationSearchText;

      persistMapSessionNow();
      if (hasExplorerFocus() || explorerFocusStrainName) {
        clearExplorerFocus({ keepStrainContext: !hasSearchTextOverride && Boolean(explorerFocusStrainName) });
        syncExplorerFocusControls();
      }
      const destinationSelect = document.getElementById('destination-select');
      if (destinationSelect) destinationSelect.value = '';
      lastDestinationSelectValue = '';
      activePopupLocationIndex = null;
      nearbyExploreActive = false;
      clearRouteUi();
      if (map) map.closePopup();

      currentCsvPath = selectedPath;
      activeMapSessionDatasetKey = getMapSessionDatasetKey(selectedPath);
      initialViewportRestored = false;
      if (hasSearchTextOverride) {
        locationSearchText = searchTextOverride;
        const searchInput = document.getElementById('destination-search');
        if (searchInput) searchInput.value = searchTextOverride;
      }
      if (options.searchCategoryOverride && categoryOptions.includes(options.searchCategoryOverride)) {
        selectedCategories = [options.searchCategoryOverride];
        syncCategoryCheckboxes();
      }

      updateLocationContext();
      syncMapViewUrl(selectedPath);
      if (options.persist !== false) {
        saveSelectedCsvPath(selectedPath, { explicit: options.explicitSelection === true });
      }
      renderCsvSwitchSelect(selectedPath);
      renderSettingsLocationSelect(selectedPath);
      updateGlobalSearchSuggestions(searchTextOverride);
      updateNearestLabel();
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      updateControlsSummary();

      window.setTimeout(() => {
        if (!map) return;
        if (options.focusSearchResults === true || (hasSearchTextOverride && searchTextOverride)) {
          fitMapToVisibleMarkers({ searchResults: true });
        } else {
          focusMapViewArea(selectedPath, { animate: options.animate !== false });
        }
      }, 80);
      schedulePersistMapSession();
      return true;
    }

    async function bootstrapInitialCsvLoad() {
      const requestedLocation = requestedLocationLabelFromUrl();
      const openingLabel = requestedLocation ? csvLabelFromPath(requestedLocation) : 'Amsterdam';
      setUploadPanelState(`Opening the ${openingLabel} view`, 'Loading the nationwide coffeeshop catalogue...', false);

      const csvPaths = await discoverCsvPathsInLocations();
      const requestedCsv = pickRequestedCsvPath(csvPaths);
      if (requestedLocation && !requestedCsv) {
        setUploadPanelState(
          `${openingLabel} map data was not found`,
          'Budfinder could not match that location to an available map. Return home and try the location again.',
          false
        );
        return;
      }
      const initialCsv = requestedCsv || pickInitialCsvPath(csvPaths);
      if (!initialCsv) {
        if (window.location.protocol === 'file:') {
          setUploadPanelState(
            `${openingLabel} data needs a little help`,
            'Budfinder cannot read the built-in map data from this view. Open it through Budfinder and choose a map area from Settings > Data.',
            false
          );
          return;
        }

        setUploadPanelState(
          `${openingLabel} data was not found`,
          'The built-in location data is missing. Check the database/locations folder and refresh Budfinder.',
          false
        );
        return;
      }

      setDiscoveredCsvPaths(csvPaths, initialCsv);

      try {
        await loadCsvFromPath(initialCsv, { persist: !requestedCsv });
      } catch (err) {
        const fallbackCsv = requestedCsv ? null : pickFirstCsvPath(csvPaths);
        if (fallbackCsv && fallbackCsv !== initialCsv) {
          try {
            setDiscoveredCsvPaths(csvPaths, fallbackCsv);
            await loadCsvFromPath(fallbackCsv);
            setRouteStatus('Your saved map area was unavailable, so Budfinder loaded the default area.', 'warn');
            return;
          } catch (_fallbackErr) {
            // Fall through to the standard load error below.
          }
        }
        setUploadPanelState(`${openingLabel} map data could not be loaded`, 'Try refreshing the page, then choose a map area from Settings > Data.', false);
      }
    }

    document.getElementById('csv-switch-select').addEventListener('change', e => {
      const selectedPath = canonicalCsvPath(e.target.value);
      if (!selectedPath || selectedPath === currentCsvPath) return;
      if (switchMapViewArea(selectedPath, { explicitSelection: true })) {
        personalisation.defaultCity = csvFileNameFromPath(selectedPath);
        savePersonalisation();
        setRouteStatus(
          isMasterCoffeeshopPath(selectedPath)
            ? 'Showing the nationwide coffeeshop view.'
            : `Viewing ${csvLabelFromPath(selectedPath)} with nationwide search still available.`,
          'ok'
        );
      }
    });

    // =========================================================
    // Map initialisation
    // =========================================================

    /**
     * Set up the map, markers, routing, and event listeners.
     */
    function initApp() {
      // Create the Leaflet map
      map = L.map('map').setView([0, 0], 2);

      map.on('moveend zoomend', () => schedulePersistMapSession());
      markerLayoutController = BudfinderMarkerLayout.attach(map, () => {
        const selectedIndex = getSelectedDestinationIndex();
        return markers.map((marker, index) => ({ marker,
          id: locations[index].shop_key || locations[index].shop_id || index,
          name: locations[index].name,
          visible: marker._budfinderVisible !== false,
          selected: activePopupLocationIndex === index || selectedIndex === index
        }));
      });

      map.on('click', () => {
        minimiseControlsForMapFocus();
      });

      map.on('dragstart zoomstart', () => {
        if (!controlsVisible && !directionsVisible && !shelfVisible) {
          invalidateMapSizeSettled([0, 90, 180]);
        }
      });

      baseTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        keepBuffer: 5,
        updateWhenIdle: false,
        updateWhenZooming: true,
        attribution: '© OSM contributors'
      }).addTo(map);
      addLocationMapControl();
      const scopeControl = L.control({ position: 'bottomleft' });
      scopeControl.onAdd = () => {
        const note = L.DomUtil.create('div', 'map-scope-note');
        note.innerHTML = '<strong id="map-scope-summary">Search covers all Netherlands</strong><span>Lines connect spaced logos to their locations.</span>';
        L.DomEvent.disableClickPropagation(note);
        return note;
      };
      scopeControl.addTo(map);

      // Create a marker for each location
      locations.forEach((loc, i) => {
        const initialPriceLabel = getMarkerPriceLabel(loc);
        const icon = chooseMarkerIcon(loc, initialPriceLabel);
        const isCoffeeShop = isCoffeeShopLocation(loc);
        const usesLogoIcon = isCoffeeShop && logoCandidates(loc.logo, loc).length > 0;
        const isArea = isAreaLocation(loc);

        // Popup logo supports multiple fallback paths.
        const logoHtml = popupLogoHtml(loc);

        const popupStrainsHtml = isCoffeeShop
          ? (
              `<div class="popup-strains-box" id="${popupStrainContainerId(i)}">` +
                `<p class="popup-strains-status">Checking menu matches...</p>` +
              `</div>`
            )
          : '';

        // If this CSV shop maps to a DB shop, show quick links.
        const dbMenuLinks = (dbRouteLinksEnabled && loc.db_shop_id)
          ? (
              `<a href="/shop/${loc.db_shop_id}/digitised" target="_blank">Menu (database)</a><br>` +
              `<a href="/shop/${loc.db_shop_id}" target="_blank">Edit menu entry</a><br>`
            )
          : '';
        const popupCardClass = isCoffeeShop
          ? 'shop-popup-card is-coffeeshop is-value-unknown'
          : isArea
          ? 'shop-popup-card is-area-anchor'
          : 'shop-popup-card';
        const websiteHref = (loc.website || '').toString().trim();
        const websiteLinkHtml = websiteHref
          ? `<a href="${escapeHtmlAttr(websiteHref)}" target="_blank">Website</a><br>`
          : '';
        const streetViewLinkHtml = `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.coords[0]},${loc.coords[1]}" target="_blank">Street View</a><br>`;
        const journeyControlsHtml = isArea
          ? ''
          : (
              `<button type="button" class="popup-journey-start-btn" data-index="${i}">Set route start</button>` +
              `<button type="button" class="popup-journey-add-btn" data-index="${i}">Add Stop</button>` +
              `<span class="popup-journey-order" data-popup-journey-order="${i}" hidden>` +
                `<button type="button" class="popup-journey-move-btn" data-popup-journey-move="up" data-index="${i}" aria-label="Move ${escapeHtmlAttr(loc.name || 'place')} earlier in itinerary" title="Move earlier">−</button>` +
                `<button type="button" class="popup-journey-move-btn" data-popup-journey-move="down" data-index="${i}" aria-label="Move ${escapeHtmlAttr(loc.name || 'place')} later in itinerary" title="Move later">+</button>` +
              `</span>`
            );
        const areaControlsHtml = isArea
          ? (
              `<span class="popup-area-note">Area search anchor. Use this to find nearby coffeeshops and useful stops.</span>` +
              `<button type="button" class="popup-area-search-btn" data-area-search-index="${i}">Show nearby coffeeshops</button>`
            )
          : '';
        const personalControlsHtml = isArea
          ? ''
          : (
              `<button class="fav-btn" data-index="${i}">` +
                `${favorites.includes(i) ? 'Remove saved shop' : 'Save shop'}` +
              `</button>` +
              `<br>` +
              `<label><input type="checkbox" class="visited-checkbox" data-index="${i}" ${loc.visited ? 'checked' : ''}> Visited</label><br>` +
              `<span class="rating-label">Rating: </span>` +
              `<span class="rating-stars" data-index="${i}" data-rating="${loc.rating}">${renderStars(loc.rating)}</span>`
            );

        const marker = L.marker(loc.coords, {
          icon,
          zIndexOffset: 1000,
          keyboard: true,
          title: loc.name || 'Map place',
          alt: loc.name || 'Map place',
          riseOnHover: true
        })
          .addTo(map)
          .bindPopup(
            `<div id="${popupCardId(i)}" class="${popupCardClass}">` +
            `<strong>${loc.name}</strong><br>` +
            logoHtml +
            popupStrainsHtml +
            dbMenuLinks +
            areaControlsHtml +
            journeyControlsHtml +
            websiteLinkHtml +
            streetViewLinkHtml +
            personalControlsHtml +
            `</div>`
          )
          .on('click', function () {
            this.openPopup();
          })
          .on('popupopen', () => {
            activePopupLocationIndex = i;
            document.body.classList.add('shop-popup-open');
            updateControlsSummary();
            syncItineraryActionButtons();
            if (isCoffeeShop) {
              refreshPopupStrainsForLocation(i);
            }
            markerLayoutController.schedule();
          })
          .on('popupclose', () => {
            if (activePopupLocationIndex === i) {
              activePopupLocationIndex = null;
              updateControlsSummary();
            }
            document.body.classList.remove('shop-popup-open');
            markerLayoutController.schedule();
          });

        marker._usesLogoIcon = usesLogoIcon;
        marker._priceLabelText = initialPriceLabel || '';

        markers[i] = marker;
        syncMarkerValueTone(i);
      });

      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      updateControlsSummary();
      renderJourneyPlanner();
      // Let the layout settle before choosing a useful city-level opening
      // view. Fitting every marker makes dense cities look zoomed out and
      // visually overloaded.
      if (markers.length > 0) {
        const initialFitDelay = isCompactMobileLayout() ? 60 : 260;
        window.setTimeout(() => {
          if (!map) return;
          map.invalidateSize();
          requestAnimationFrame(() => {
            if (!map) return;
            focusInitialMapViewport();
          });
        }, initialFitDelay);
      }

      // Recalculate route if mode changes.
      const modeSelect = document.getElementById('mode');
      if (modeSelect) {
        modeSelect.onchange = () => {
          if (lastPosition) {
            findRoute({ coords: { latitude: lastPosition[0], longitude: lastPosition[1] } });
          }
          updateDestinationDropdown();
          updateControlsSummary();
        };
      }

      // Change destination from dropdown.
      const destinationSelect = document.getElementById('destination-select');
      if (destinationSelect) {
        destinationSelect.onchange = () => {
          if (!restoringMapFilterState && String(destinationSelect.value || '') !== lastDestinationSelectValue) {
            const previousState = captureMapFilterState();
            const previousIndex = parseInt(lastDestinationSelectValue || '', 10);
            previousState.selectedDestination = Number.isInteger(previousIndex) && locations[previousIndex]
              ? previousIndex
              : null;
            pushMapFilterSnapshot(previousState);
          }
          lastDestinationSelectValue = String(destinationSelect.value || '');
          const destIndex = getSelectedDestinationIndex();
          if (destIndex === null) {
            nearbyExploreActive = false;
            clearRouteUi();
            updateDistanceInfo();
            refreshDestinationCards();
            return;
          }

          rememberRecentDestination(destIndex);

          if (lastPosition) {
            findRoute({ coords: { latitude: lastPosition[0], longitude: lastPosition[1] } });
          } else {
            clearRouteUi();
          }
          focusDestinationOnMap(destIndex);
          updateDistanceInfo();
          refreshDestinationCards();
        };
      }

      setRouteStatus('Location is off until you ask for Closest, Near me, or direct distance.');
    }

    // =========================================================
    // Distance helpers
    // =========================================================

    /**
     * Haversine distance between two [lat,lng] in meters.
     */
    function haversineDistance([a1, a2], [b1, b2]) {
      const R = 6371e3;
      const t = d => d * Math.PI / 180;
      const φ1 = t(a1);
      const φ2 = t(b1);
      const Δφ = t(b1 - a1);
      const Δλ = t(b2 - a2);

      const a = Math.sin(Δφ / 2) ** 2 +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) ** 2;

      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatDistanceMeters(meters, precision = 2) {
      if (!Number.isFinite(meters) || meters < 0) return '';
      if (personalisation.distanceUnit === 'miles') {
        return `${(meters / 1609.344).toFixed(precision)} mi`;
      }
      return meters >= 1000
        ? `${(meters / 1000).toFixed(precision)} km`
        : `${Math.round(meters)} m`;
    }

    // =========================================================
    // Routing
    // =========================================================

    /**
     * Draw a direct comparison line from the user's position to the selected
     * destination, then populate its distance and direct-time estimate.
     */
    function getSelectedDestinationIndex() {
      const sel = document.getElementById('destination-select');
      if (!sel) return null;
      const i = parseInt(sel.value, 10);
      if (isNaN(i) || i < 0 || i >= locations.length) {
        return null;
      }
      return i;
    }

    function getMeasuredMapRect() {
      const mapDiv = document.getElementById('map');
      if (!mapDiv) return null;
      const rect = mapDiv.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return rect;
    }

    function getMapViewportInsets() {
      const isMobile = isCompactMobileLayout();
      const baseInset = isMobile ? 14 : 24;
      let top = baseInset;
      let right = baseInset;
      let bottom = baseInset;
      let left = baseInset;
      const mapRect = getMeasuredMapRect();
      if (!mapRect) {
        return {
          paddingTopLeft: [left, top],
          paddingBottomRight: [right, bottom]
        };
      }

      function applyOverlayInset(id) {
        const el = document.getElementById(id);
        if (!el) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
          return;
        }

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const overlapLeft = Math.max(mapRect.left, rect.left);
        const overlapRight = Math.min(mapRect.right, rect.right);
        const overlapTop = Math.max(mapRect.top, rect.top);
        const overlapBottom = Math.min(mapRect.bottom, rect.bottom);
        if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return;

        const overlapWidth = overlapRight - overlapLeft;
        const mapMidX = mapRect.left + (mapRect.width / 2);
        const mapMidY = mapRect.top + (mapRect.height / 2);
        const rectMidX = rect.left + (rect.width / 2);
        const rectMidY = rect.top + (rect.height / 2);

        if (rectMidY <= mapMidY) {
          top = Math.max(top, Math.round(overlapBottom - mapRect.top + baseInset));
        } else {
          bottom = Math.max(bottom, Math.round(mapRect.bottom - overlapTop + baseInset));
        }

        if (overlapWidth < mapRect.width * 0.72) {
          if (rectMidX <= mapMidX) {
            left = Math.max(left, Math.round(overlapRight - mapRect.left + baseInset));
          } else {
            right = Math.max(right, Math.round(mapRect.right - overlapLeft + baseInset));
          }
        }
      }

      applyOverlayInset('top-shelf-rail');
      applyOverlayInset('selection-card');
      applyOverlayInset('stash-shelf');

      if (isMobile && controlsVisible && !controlsCollapsed) {
        const controlsDiv = document.querySelector('.controls');
        if (controlsDiv && controlsDiv.id !== 'selection-card') {
          const style = window.getComputedStyle(controlsDiv);
          if (style.display !== 'none') {
            const rect = controlsDiv.getBoundingClientRect();
            if (rect.width && rect.height) {
              const overlapLeft = Math.max(mapRect.left, rect.left);
              const overlapRight = Math.min(mapRect.right, rect.right);
              const overlapTop = Math.max(mapRect.top, rect.top);
              const overlapBottom = Math.min(mapRect.bottom, rect.bottom);
              if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
                bottom = Math.max(bottom, Math.round(mapRect.bottom - overlapTop + baseInset));
              }
            }
          }
        }
      }

      return {
        paddingTopLeft: [left, top],
        paddingBottomRight: [right, bottom]
      };
    }

    function clampInsetPair(startInset, endInset, totalSpace, minVisibleSpace) {
      const safeTotalSpace = Math.max(0, totalSpace);
      const safeVisibleSpace = Math.min(Math.max(0, minVisibleSpace), safeTotalSpace);
      const maxInsetTotal = Math.max(0, safeTotalSpace - safeVisibleSpace);
      const currentTotal = Math.max(0, startInset) + Math.max(0, endInset);

      if (currentTotal <= maxInsetTotal || currentTotal === 0) {
        return [Math.max(0, startInset), Math.max(0, endInset)];
      }

      const overflow = currentTotal - maxInsetTotal;
      const startShare = startInset / currentTotal;
      const endShare = endInset / currentTotal;
      let nextStart = Math.max(0, Math.round(startInset - (overflow * startShare)));
      let nextEnd = Math.max(0, Math.round(endInset - (overflow * endShare)));
      const adjustedTotal = nextStart + nextEnd;

      if (adjustedTotal > maxInsetTotal) {
        const remainder = adjustedTotal - maxInsetTotal;
        if (nextStart >= nextEnd) {
          nextStart = Math.max(0, nextStart - remainder);
        } else {
          nextEnd = Math.max(0, nextEnd - remainder);
        }
      }

      return [nextStart, nextEnd];
    }

    function clampViewportInsets(insets, mapRect, options = {}) {
      if (!mapRect) return insets;

      let left = Math.max(0, Math.round((insets && insets.paddingTopLeft && insets.paddingTopLeft[0]) || 0));
      let top = Math.max(0, Math.round((insets && insets.paddingTopLeft && insets.paddingTopLeft[1]) || 0));
      let right = Math.max(0, Math.round((insets && insets.paddingBottomRight && insets.paddingBottomRight[0]) || 0));
      let bottom = Math.max(0, Math.round((insets && insets.paddingBottomRight && insets.paddingBottomRight[1]) || 0));

      const minVisibleWidthRatio = Number.isFinite(options.minVisibleWidthRatio) ? options.minVisibleWidthRatio : 0.56;
      const minVisibleHeightRatio = Number.isFinite(options.minVisibleHeightRatio) ? options.minVisibleHeightRatio : 0.54;
      const minVisibleWidth = Math.round(mapRect.width * minVisibleWidthRatio);
      const minVisibleHeight = Math.round(mapRect.height * minVisibleHeightRatio);

      [left, right] = clampInsetPair(left, right, mapRect.width, minVisibleWidth);
      [top, bottom] = clampInsetPair(top, bottom, mapRect.height, minVisibleHeight);

      return {
        paddingTopLeft: [left, top],
        paddingBottomRight: [right, bottom]
      };
    }

    function getViewportAdjustedCenter(coords, zoom) {
      if (!map) return L.latLng(coords[0], coords[1]);
      const latLng = Array.isArray(coords) ? L.latLng(coords[0], coords[1]) : L.latLng(coords);
      const insets = getMapViewportInsets();
      const offset = L.point(
        (insets.paddingBottomRight[0] - insets.paddingTopLeft[0]) / 2,
        (insets.paddingBottomRight[1] - insets.paddingTopLeft[1]) / 2
      );
      return map.unproject(map.project(latLng, zoom).subtract(offset), zoom);
    }

    function focusMapOnCoords(coords, options = {}) {
      if (!map) return;
      const minZoom = Number.isFinite(options.minZoom) ? options.minZoom : (isCompactMobileLayout() ? 15 : 16);
      const currentZoom = Number.isFinite(map.getZoom()) ? map.getZoom() : minZoom;
      const targetZoom = Number.isFinite(options.zoom) ? options.zoom : Math.max(currentZoom, minZoom);
      const popupIndex = Number.isInteger(options.popupIndex) ? options.popupIndex : null;
      let adjustedCenter = getViewportAdjustedCenter(coords, targetZoom);

      if (popupIndex !== null && isCompactMobileLayout()) {
        const mapRect = getMeasuredMapRect();
        const popupBreathingRoom = Math.min(180, Math.max(120, Math.round((mapRect && mapRect.height ? mapRect.height : 520) * 0.34)));
        adjustedCenter = map.unproject(
          map.project(adjustedCenter, targetZoom).subtract(L.point(0, popupBreathingRoom)),
          targetZoom
        );
      }

      if (popupIndex !== null) {
        map.once('moveend', () => {
          if (!markers[popupIndex]) return;
          markers[popupIndex].openPopup();
          if (typeof markers[popupIndex].bringToFront === 'function') {
            markers[popupIndex].bringToFront();
          }
        });
      }

      map.flyTo(adjustedCenter, targetZoom, {
        animate: options.animate !== false,
        duration: options.duration || 0.45
      });
    }

    function focusDestinationOnMap(index, options = {}) {
      const safeIndex = Number.isInteger(index) ? index : parseInt(index, 10);
      if (isNaN(safeIndex) || safeIndex < 0 || safeIndex >= locations.length) return;
      if (options.minimise !== false) {
        minimiseControlsForMapFocus();
      }
      focusMapOnCoords(locations[safeIndex].coords, {
        popupIndex: options.openPopup === false ? null : safeIndex,
        minZoom: options.minZoom,
        zoom: options.zoom,
        animate: options.animate,
        duration: options.duration
      });
    }

    function mapCenterForEntries(entries) {
      const coords = (Array.isArray(entries) ? entries : [])
        .map(item => locations[item.index] && locations[item.index].coords)
        .filter(value => Array.isArray(value) && value.length === 2);
      if (!coords.length) return null;
      const latitudes = coords.map(value => Number(value[0])).filter(Number.isFinite).sort((a, b) => a - b);
      const longitudes = coords.map(value => Number(value[1])).filter(Number.isFinite).sort((a, b) => a - b);
      if (!latitudes.length || !longitudes.length) return null;
      const midpoint = values => {
        const middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : ((values[middle - 1] + values[middle]) / 2);
      };
      return [midpoint(latitudes), midpoint(longitudes)];
    }

    function shouldShowMarkerOnMap(loc, index) {
      return passesCategoryFilter(loc, index);
    }

    function finishInitialMapLoad() {
      if (initialMapReadyFallbackTimer) {
        window.clearTimeout(initialMapReadyFallbackTimer);
        initialMapReadyFallbackTimer = null;
      }
      document.body.classList.remove('map-is-loading');
      if (initialMapPanelHideTimer) window.clearTimeout(initialMapPanelHideTimer);
      initialMapPanelHideTimer = window.setTimeout(() => {
        initialMapPanelHideTimer = null;
        setUploadPanelState('', '', false);
      }, 220);
    }

    function waitForInitialMapTiles() {
      if (!baseTileLayer) {
        finishInitialMapLoad();
        return;
      }
      baseTileLayer.once('load', finishInitialMapLoad);
      if (initialMapReadyFallbackTimer) window.clearTimeout(initialMapReadyFallbackTimer);
      initialMapReadyFallbackTimer = window.setTimeout(finishInitialMapLoad, 1800);
    }

    function mapViewShopEntries(pathLike, options = {}) {
      const nationwideView = isMasterCoffeeshopPath(pathLike);
      const cityKey = nationwideView ? '' : normaliseGlobalSearchCity(csvLabelFromPath(pathLike));
      const allAreaShops = markers
        .map((marker, index) => ({ marker, index }))
        .filter(item => {
          const loc = locations[item.index];
          if (!item.marker || !isCoffeeShopLocation(loc) || isClosedLocation(loc)) return false;
          return nationwideView || normaliseGlobalSearchCity(loc && loc.city) === cityKey;
        });
      if (options.respectFilters === false) return allAreaShops;
      const visibleAreaShops = allAreaShops.filter(item => shouldShowMarkerOnMap(locations[item.index], item.index));
      return visibleAreaShops.length ? visibleAreaShops : allAreaShops;
    }

    function focusMapViewArea(pathLike, options = {}) {
      if (!map || !markers.length) return false;
      const entries = mapViewShopEntries(pathLike, options);
      if (!entries.length) return false;
      const bounds = L.featureGroup(entries.map(item => item.marker)).getBounds();
      if (!bounds.isValid()) return false;
      const rawInsets = getMapViewportInsets();
      const mapRect = getMeasuredMapRect();
      const insets = isCompactMobileLayout()
        ? rawInsets
        : clampViewportInsets(rawInsets, mapRect, {
            minVisibleWidthRatio: 0.56,
            minVisibleHeightRatio: 0.54
          });
      map.fitBounds(bounds, {
        animate: options.animate !== false,
        paddingTopLeft: insets.paddingTopLeft,
        paddingBottomRight: insets.paddingBottomRight,
        maxZoom: isCompactMobileLayout() ? 14 : 14
      });
      return true;
    }

    function focusInitialMapViewport() {
      if (!map || !markers.length) return;
      if (initialViewportRestored) {
        waitForInitialMapTiles();
        return;
      }
      const hasActiveSearchResults = Boolean(
        (locationSearchText || '').trim() ||
        (strainFilterText || '').trim() ||
        (explorerFocusStrainName || '').trim() ||
        offeringAttributeFilterKind
      );
      if (hasActiveSearchResults) {
        fitMapToVisibleMarkers({ searchResults: true });
      } else if (!focusMapViewArea(currentCsvPath, { animate: false })) {
        fitMapToVisibleMarkers();
      }
      waitForInitialMapTiles();
    }

    function fitMapToVisibleMarkers(options = {}) {
      if (!map || !markers.length) return;
      const visibleEntries = markers
        .map((marker, index) => ({ marker, index }))
        .filter(item => item.marker && shouldShowMarkerOnMap(locations[item.index], item.index));
      const markerEntries = visibleEntries.length
        ? visibleEntries
        : markers
            .map((marker, index) => ({ marker, index }))
            .filter(item => item.marker);
      if (!markerEntries.length) return;

      const fitBounds = L.featureGroup(markerEntries.map(item => item.marker)).getBounds();
      if (!fitBounds.isValid()) return;
      const rawInsets = getMapViewportInsets();
      const mapRect = getMeasuredMapRect();
      const insets = isCompactMobileLayout()
        ? rawInsets
        : clampViewportInsets(rawInsets, mapRect, {
            minVisibleWidthRatio: 0.56,
            minVisibleHeightRatio: 0.54
          });
      map.fitBounds(fitBounds, {
        animate: options.searchResults ? false : options.animate,
        paddingTopLeft: insets.paddingTopLeft,
        paddingBottomRight: insets.paddingBottomRight,
        maxZoom: isCompactMobileLayout() ? 15 : 16
      });
      const minimumUsefulZoom = options.searchResults
        ? (isCompactMobileLayout() ? 13 : 13)
        : null;
      const southWest = fitBounds.getSouthWest();
      const northEast = fitBounds.getNorthEast();
      const latitudeSpan = Math.abs(Number(northEast.lat) - Number(southWest.lat));
      const longitudeSpan = Math.abs(Number(northEast.lng) - Number(southWest.lng));
      const isCompactSearchCluster = markerEntries.length <= 40 && latitudeSpan <= 0.18 && longitudeSpan <= 0.26;
      if (minimumUsefulZoom && isCompactSearchCluster && map.getZoom() < minimumUsefulZoom) {
        map.setZoom(minimumUsefulZoom, { animate: false });
      }
    }

    function selectDestinationIndex(index) {
      const destinationSelect = document.getElementById('destination-select');
      const safeIndex = Number.isInteger(index) ? index : parseInt(index, 10);
      if (!destinationSelect || !Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= locations.length) {
        return false;
      }
      if (String(destinationSelect.value || '') !== String(safeIndex)) {
        rememberMapFilterState();
      }

      if (!Array.from(destinationSelect.options).some(option => option.value === String(safeIndex))) {
        const option = document.createElement('option');
        option.value = String(safeIndex);
        option.textContent = locations[safeIndex].name || 'Selected destination';
        destinationSelect.appendChild(option);
      }
      destinationSelect.value = String(safeIndex);
      destinationSelect.dispatchEvent(new Event('change', { bubbles: true }));
      refreshSelectedMarkerIcons();
      return true;
    }

    function refreshSelectedMarkerIcons() {
      markers.forEach((marker, markerIndex) => {
        const loc = locations[markerIndex];
        if (!marker || !loc) return;
        syncMarkerHighlightState(markerIndex, passesCategoryFilter(loc, markerIndex));
      });
    }

    function toggleFavouriteDestination(index) {
      const safeIndex = Number.isInteger(index) ? index : parseInt(index, 10);
      if (!Number.isInteger(safeIndex) || !locations[safeIndex]) return false;
      const idx = favorites.indexOf(safeIndex);
      if (idx > -1) {
        favorites.splice(idx, 1);
      } else if (favorites.length < 10) {
        favorites.push(safeIndex);
      } else {
        setRouteStatus('Maximum of 10 Saved shops reached. Remove one before saving another.', 'warn');
        return false;
      }
      writeLocationPreference(locations[safeIndex], { favorite: favorites.includes(safeIndex) });
      persistLegacyFavorites();
      updateDestinationDropdown();
      updateControlsSummary();
      setRouteStatus(
        favorites.includes(safeIndex)
          ? `${locations[safeIndex].name} saved to Saved shops.`
          : `${locations[safeIndex].name} removed from Saved shops.`,
        'good'
      );
      return true;
    }

    async function openDirectionsForDestinationIndex(index) {
      const safeIndex = Number.isInteger(index) ? index : parseInt(index, 10);
      if (!Number.isInteger(safeIndex) || !locations[safeIndex]) return;
      selectDestinationIndex(safeIndex);
      if (!lastPosition) {
        try {
          await requestUserLocation({
            label: 'Getting your location for direct distance...',
            routeIfSelected: true
          });
        } catch (_err) {
          return;
        }
      } else {
        findRoute({ coords: { latitude: lastPosition[0], longitude: lastPosition[1] } });
      }
      setDirectionsVisible(true);
    }

    function exploreFromCurrentStop() {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null || !locations[selectedIndex]) {
        nearbyExploreActive = true;
        setRouteStatus('Choose a mapped place first, or use your location to see what is nearby.', 'warn');
        if (!controlsVisible) setControlsVisible(true, { collapsed: false });
        refreshDestinationCards();
        return;
      }
      nearbyExploreActive = true;
      if (directionsVisible) setDirectionsVisible(false);
      setControlsVisible(true, { collapsed: false });
      refreshDestinationCards();
      updateControlsSummary();
      setRouteStatus(`Exploring possible Destinations from ${locations[selectedIndex].name}.`, 'good');
    }

    async function clearOneActiveMapFilter() {
      const destinationSelect = document.getElementById('destination-select');
      const searchInput = document.getElementById('destination-search');
      const missionSelect = document.getElementById('mission-mode');
      if (!hasAnyMapFilter()) return false;

      if (destinationSelect && getSelectedDestinationIndex() !== null) {
        destinationSelect.value = '';
        lastDestinationSelectValue = '';
        if (map) {
          map.closePopup();
        }
        activePopupLocationIndex = null;
        nearbyExploreActive = false;
        clearRouteUi();
        return true;
      }

      if (hasExplorerFocus()) {
        clearExplorerFocus();
        syncExplorerFocusControls();
        return true;
      }

      if (directionsVisible) {
        setDirectionsVisible(false);
      }

      if ((strainFilterText || '').trim()) {
        clearActiveStrainFilterState();
        return true;
      }

      if ((locationSearchText || '').trim()) {
        locationSearchText = '';
        if (searchInput) searchInput.value = '';
        return true;
      }

      if (missionMode !== 'free-roam') {
        missionMode = 'free-roam';
        if (missionSelect) missionSelect.value = missionMode;
        return true;
      }

      if (hasCategoryFilter()) {
        selectedCategories = getDefaultLocationCategories();
        syncCategoryCheckboxes();
        return true;
      }

      return false;
    }

    async function clearDestinationSelection() {
      if (!hasAnyMapFilter()) return;

      const previousState = mapFilterHistory.pop();
      if (previousState && serialiseMapFilterState(previousState) !== serialiseMapFilterState(captureMapFilterState())) {
        await restoreMapFilterState(previousState, { preserveViewport: true });
        setRouteStatus('Last filter cleared. Previous map view restored.', 'good');
      } else {
        const previousView = map ? { center: map.getCenter(), zoom: map.getZoom() } : null;
        await clearOneActiveMapFilter();
        updateNearestLabel();
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        updateSelectionCard();
        refreshDestinationCards();
        updateControlsSummary();
        syncClearSelectionToggle();
        if (previousView && map) {
          map.setView(previousView.center, previousView.zoom, { animate: false });
        }
        setRouteStatus('Last filter cleared.', 'good');
      }
    }

    function clearActiveStrainFilterState() {
      const status = document.getElementById('strain-status');
      globalSearchAppliedStrainKey = '';
      strainFilterText = '';
      strainAllowedShopIds = null;
      strainAllowedNameCityKeys = null;
      strainPriceByShopId = null;
      strainPriceByNameCity = null;
      strainCheapestShopIds = null;
      strainCheapestNameCityKeys = null;
      strainCheapestPriceLabel = '';
      offeringAttributeFilterKind = '';
      offeringAttributeFilterValue = '';
      if (status) status.textContent = 'No map matching strains selected yet.';
      if (activeStrainNames.length) {
        renderStrainList();
      } else {
        updateStrainListSelection();
      }
      refreshOpenPopupStrainLists();
      syncActiveStrainShelfButton();
    }

    function resetMapFilters(options = {}) {
      if (!options.preserveHistory) clearMapFilterHistory();
      const searchInput = document.getElementById('destination-search');
      const missionSelect = document.getElementById('mission-mode');
      locationSearchText = '';
      if (searchInput) searchInput.value = '';

      missionMode = 'free-roam';
      if (missionSelect) missionSelect.value = missionMode;

      selectedCategories = getDefaultLocationCategories();
      syncCategoryCheckboxes();
      clearExplorerFocus();
      clearActiveStrainFilterState();

      updateNearestLabel();
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      updateSelectionCard();
      refreshDestinationCards();
      updateControlsSummary();
      syncClearSelectionToggle();
      if (!options.silent) {
        setRouteStatus('Filters reset. Showing the nationwide coffeeshop list.', 'good');
      }
      if (map) {
        window.setTimeout(() => fitMapToVisibleMarkers(), 80);
      }
      schedulePersistMapSession();
    }

    function getSavedDataStorageKeys() {
      return Array.from(new Set([
        ...normaliseStorageKeys(LOCATION_PREFERENCES_STORAGE_KEYS),
        LEGACY_FAVORITES_STORAGE_KEY,
        ...normaliseStorageKeys(RECENT_DESTINATIONS_STORAGE_KEYS),
        ...normaliseStorageKeys(STRAIN_SHELF_STORAGE_KEYS),
        ...normaliseStorageKeys(SAVED_JOURNEYS_STORAGE_KEYS),
        MAP_FOCUS_SHOPS_STORAGE_KEY,
        MAP_SESSION_STORAGE_KEY,
        'budfinder_explorer_selected_shops',
        'budfinder_database_navigation_state'
      ]));
    }

    function removeStorageKey(key) {
      try {
        localStorage.removeItem(key);
      } catch (_err) {
        // Storage can be blocked in private browsing or hardened browser modes.
      }
    }

    function clearSavedDataFromBrowser() {
      getSavedDataStorageKeys().forEach(removeStorageKey);

      locationPreferences = {};
      favorites = [];
      legacyFavoriteIndices = [];
      recentDestinationKeys = [];
      shelfStrainNames = [];
      savedJourneys = [];
      stopLocationTracking();

      locations.forEach(loc => {
        loc.visited = false;
        loc.rating = 0;
      });

      saveLocationPreferences();
      persistLegacyFavorites();
      saveRecentDestinations();
      saveShelfStrains();
      saveSavedJourneys();
      resetMapFilters({ silent: true });
      renderJourneyPlanner();
      updateStashShelf();
      updateDestinationDropdown();
      updateMarkers();
      updateControlsSummary();
      setSavedDataConfirmationVisible(false);
      setRouteStatus('Saved shops, ratings, visit notes, recent Destinations, and saved strains were cleared.', 'good');
    }

    function setSavedDataConfirmationVisible(confirming) {
      const btn = document.getElementById('clear-saved-data-btn');
      const confirmEl = document.getElementById('clear-saved-data-confirm');
      const note = document.getElementById('clear-saved-data-note');
      if (btn) btn.classList.toggle('is-confirming', !!confirming);
      if (confirmEl) {
        confirmEl.hidden = !confirming;
        confirmEl.classList.toggle('is-visible', !!confirming);
      }
      if (note) {
        note.textContent = confirming
          ? 'Confirm below to clear saved local map data.'
          : 'Saved shops, recent Destinations, ratings, visit notes, and saved strains stay on this device.';
      }
    }

    function locateDestinationIndex(index) {
      selectDestinationIndex(index);
    }

    function renderDirectionsPanel(instructions = null, emptyMessage = 'Choose a Destination to compare direct distance.') {
      const ins = document.getElementById('instructions');
      if (!ins) return;

      const rows = Array.isArray(instructions) ? instructions : [];
      const bodyHtml = rows.length
        ? `<ol>${rows.map(step => {
            const text = (step && (step.text || step.instruction || step.type)) || 'Continue';
            const distance = Number.isFinite(step && step.distance)
              ? ` <span class="directions-distance">${formatDistanceMeters(step.distance)}</span>`
              : '';
            return `<li>${escapeHtml(text)}${distance}</li>`;
          }).join('')}</ol>`
        : `<p class="directions-empty">${escapeHtml(emptyMessage)}</p>`;
      const methodNote = rows.length
        ? `<p class="directions-method-note">Measured as the crow flies. ${escapeHtml(getActiveLocationLabel())} streets, crossings, and traffic rules are deliberately excluded from this comparison.</p>`
        : '';
      const externalLink = rows.length && latestDirectionsExternalUrl
        ? `<a class="directions-external-link" href="${escapeHtmlAttr(latestDirectionsExternalUrl)}" target="_blank" rel="noopener noreferrer">Open turn-by-turn directions</a>`
        : '';

      ins.hidden = !directionsVisible;
      ins.style.display = directionsVisible ? 'block' : 'none';
      ins.innerHTML =
        `<div class="directions-panel-head">` +
          `<h4>Direct distance</h4>` +
          `<button type="button" class="directions-hide-btn">Hide</button>` +
        `</div>` +
        methodNote + bodyHtml + externalLink;
    }

    function clearRouteUi() {
      if (directRouteLayer && map) {
        try {
          directRouteLayer.remove();
        } catch (_err) {
          // Ignore if already removed.
        }
      }
      directRouteLayer = null;
      latestRouteInstructions = null;
      latestDirectionsExternalUrl = '';

      const eta = document.getElementById('time-estimate');
      if (eta) eta.textContent = '--';

      const ins = document.getElementById('instructions');
      if (ins) {
        if (directionsVisible) {
          renderDirectionsPanel(null, 'Choose a Destination to compare direct distance.');
        } else {
          ins.innerHTML = '';
        }
      }
      updateControlsSummary();
    }

    function setRouteStatus(message, tone = '') {
      const el = document.getElementById('route-status');
      if (!el) return;
      el.textContent = message || '';
      el.classList.remove('is-good', 'is-warn', 'is-bad');
      if (tone) el.classList.add(`is-${tone}`);
    }

    function updatePositionFromGeolocation(position, options = {}) {
      if (!position || !position.coords) return null;
      const nextPosition = [position.coords.latitude, position.coords.longitude];
      const previousPosition = lastPosition;
      const movedDistance = previousPosition ? haversineDistance(previousPosition, nextPosition) : Infinity;
      const movedSinceRoute = lastRoutePosition ? haversineDistance(lastRoutePosition, nextPosition) : Infinity;
      const movedEnough = !previousPosition || movedDistance > 10;
      updateMeLocationMarker(nextPosition, position.coords.accuracy);
      lastPosition = nextPosition;
      syncLocationControlUi();

      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex !== null && options.routeIfSelected) {
        findRoute(position);
        focusDestinationOnMap(selectedIndex, { animate: false });
      } else if (
        selectedIndex !== null &&
        directionsVisible &&
        movedSinceRoute > 30 &&
        Date.now() - lastRouteRefreshAt > 45000
      ) {
        findRoute(position);
      } else if (selectedIndex === null && movedEnough) {
        clearRouteUi();
        if (options.centerMap !== false) {
          focusMapOnCoords(nextPosition, {
            zoom: isCompactMobileLayout() ? 15 : 16,
            animate: options.animate !== false
          });
        }
      }

      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
      setRouteStatus('Live location on. The blue dot will follow you as you move.', 'good');
      return nextPosition;
    }

    function explainGeolocationError(err) {
      if (!err) return 'Could not read your location.';
      if (err.code === 1) return 'Location permission was denied. You can still search and choose shops manually.';
      if (err.code === 2) return 'Your location is unavailable right now. Search still works.';
      if (err.code === 3) return 'Location lookup timed out. Try again when your signal settles.';
      return err.message || 'Could not read your location.';
    }

    function stopLocationTracking(options = {}) {
      if (geolocationWatchId !== null && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(geolocationWatchId);
        } catch (_err) {
          // Ignore if the browser has already ended the watch.
        }
      }
      geolocationWatchId = null;
      locationRequestInFlight = null;
      if (options.forget !== false) locationTrackingWanted = false;
      syncLocationControlUi();
      schedulePersistMapSession();
    }

    function requestUserLocation(options = {}) {
      if (!navigator.geolocation) {
        setRouteStatus('This browser does not support location. Search and manual routing still work.', 'bad');
        syncLocationControlUi({ error: true });
        return Promise.reject(new Error('Geolocation not supported'));
      }

      if (locationRequestInFlight) return locationRequestInFlight;

      if (options.remember !== false) {
        locationTrackingWanted = true;
        schedulePersistMapSession();
      }

      if (lastPosition && geolocationWatchId !== null) {
        syncLocationControlUi();
        return Promise.resolve({
          coords: {
            latitude: lastPosition[0],
            longitude: lastPosition[1]
          }
        });
      }

      const label = options.label || 'Getting your location...';
      setRouteStatus(label, 'warn');
      syncLocationControlUi({ loading: true });

      locationRequestInFlight = new Promise((resolve, reject) => {
        let firstFixReceived = false;
        geolocationWatchId = navigator.geolocation.watchPosition(
          position => {
            const firstFix = !firstFixReceived;
            firstFixReceived = true;
            updatePositionFromGeolocation(position, firstFix
              ? options
              : { centerMap: false, routeIfSelected: false, animate: false });
            if (firstFix) {
              locationRequestInFlight = null;
              resolve(position);
            }
          },
          err => {
            setRouteStatus(explainGeolocationError(err), 'bad');
            syncLocationControlUi({ error: true });
            if (err && err.code === 1) {
              locationTrackingWanted = false;
              stopLocationTracking();
            }
            if (!firstFixReceived) {
              locationRequestInFlight = null;
              if (geolocationWatchId !== null && navigator.geolocation) {
                navigator.geolocation.clearWatch(geolocationWatchId);
                geolocationWatchId = null;
              }
              reject(err || new Error('Geolocation failed'));
            }
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );
      });

      return locationRequestInFlight;
    }

    function findRoute(position) {
      const userCoords = [position.coords.latitude, position.coords.longitude];
      const di = getSelectedDestinationIndex();
      if (di === null) {
        clearRouteUi();
        return;
      }
      const destCoords = locations[di].coords;
      lastRoutePosition = userCoords;
      lastRouteRefreshAt = Date.now();
      if (directRouteLayer) directRouteLayer.remove();

      const mode = document.getElementById('mode').value;
      const distance = haversineDistance(userCoords, destCoords);
      const bearing = getBearingDegrees(userCoords, destCoords);
      const direction = cardinalDirectionLabel(bearing);
      const totalSec = estimateTravelSecondsForMode(distance, mode);
      const etaEl = document.getElementById('time-estimate');
      if (etaEl) etaEl.textContent = formatCompactDuration(totalSec) || '--';

      directRouteLayer = L.layerGroup([
        L.polyline([userCoords, destCoords], {
          color: '#fffdf7',
          weight: 9,
          opacity: 0.88,
          dashArray: '10 10',
          interactive: false
        }),
        L.polyline([userCoords, destCoords], {
          color: '#184e39',
          weight: 5,
          opacity: 0.96,
          dashArray: '10 10',
          interactive: false
        })
      ]).addTo(map);

      latestRouteInstructions = [{
        text: `Straight-line bearing ${direction}`,
        distance
      }];
      latestDirectionsExternalUrl = buildExternalDirectionsUrl(userCoords, destCoords, mode);
      renderDirectionsPanel(latestRouteInstructions);
      updateDistanceInfo();
      updateControlsSummary();
    }

    // =========================================================
    // Category filters (checkbox UI)
    // =========================================================

    /**
     * Build the list of category checkboxes.
     */
    function getCategoryFilterLabel(cat) {
      const labels = {
        all: 'All',
        favourites: 'Saved'
      };
      if (labels[cat]) return labels[cat];
      return (cat || '')
        .toString()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
    }

    function populateCategorySelect() {
      const container = document.getElementById('category-filters');
      if (!container) return;

      container.innerHTML = '';

      const cats = Array.isArray(selectedCategories)
        ? selectedCategories.filter(cat => categoryOptions.includes(cat))
        : [];
      selectedCategories = cats.length ? Array.from(new Set(cats)) : ['all'];

      categoryOptions.forEach(cat => {
        const id = 'cat-' + cat;
        const labelEl = document.createElement('label');
        labelEl.style.display = 'block';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'category-checkbox';
        input.value = cat;
        input.id = id;

        input.checked = selectedCategories.includes(cat);

        const niceName = getCategoryFilterLabel(cat);
        labelEl.appendChild(input);
        labelEl.appendChild(document.createTextNode(' ' + niceName));
        container.appendChild(labelEl);
      });

      updateNearestLabel();
    }

    function getDefaultLocationCategories() {
      const hasRowsForCategory = category => categoryOptions.includes(category) &&
        locations.some(loc => loc && !isClosedLocation(loc) && loc[category]);

      const firstAvailable = categoryOptions.find(category =>
        category !== 'all' &&
        category !== 'favourites' &&
        hasRowsForCategory(category)
      );

      return firstAvailable ? [firstAvailable] : ['all'];
    }

    function syncCategoryCheckboxes() {
      const activeCategories = (selectedCategories || []).filter(cat => categoryOptions.includes(cat));
      selectedCategories = activeCategories.length ? Array.from(new Set(activeCategories)) : ['all'];
      document.querySelectorAll('.category-checkbox').forEach(cb => {
        cb.checked = selectedCategories.includes(cb.value);
      });
    }

    async function prepareLocationForDirectSelect(index) {
      if (!Number.isInteger(index) || index < 0 || index >= locations.length) return;

      let needsRefresh = false;
      const searchInput = document.getElementById('destination-search');
      const missionSelect = document.getElementById('mission-mode');

      if (locationSearchText) {
        locationSearchText = '';
        if (searchInput) searchInput.value = '';
        needsRefresh = true;
      }

      if (missionMode !== 'free-roam') {
        missionMode = 'free-roam';
        if (missionSelect) missionSelect.value = missionMode;
        needsRefresh = true;
      }

      if (!(selectedCategories || []).includes('all') || (selectedCategories || []).length !== 1) {
        selectedCategories = ['all'];
        syncCategoryCheckboxes();
        needsRefresh = true;
      }

      if (needsRefresh) {
        updateNearestLabel();
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
      }

      if (strainFilterText && !passesCategoryFilter(locations[index], index)) {
        clearStrainFilter();
      }
    }

    /**
     * Update the "Closest ..." button label based on selected categories.
     */
    function updateNearestLabel() {
      const btn = document.getElementById('nearest-btn');
      if (!btn) return;

      if (missionMode === 'fresh-territory') {
        btn.textContent = 'Closest new spot';
        return;
      }

      if (missionMode === 'favourites-only') {
        btn.textContent = 'Closest Saved shops';
        return;
      }

      if (missionMode === 'top-shelf') {
        btn.textContent = 'Closest Best matches';
        return;
      }

      if (getSelectedDestinationIndex() !== null) {
        btn.textContent = "What's nearby?";
        return;
      }

      const cats = selectedCategories || [];
      let label = 'Location';

      // If nothing selected or 'all' selected, keep generic label
      if (cats.length === 0 || cats.includes('all')) {
        label = 'Location';
      } else {
        const nonAll = cats.filter(c => c !== 'all');
        // Only favourites selected
        if (nonAll.length === 1 && nonAll[0] === 'favourites') {
          label = 'Saved shops';
        } else if (nonAll.length === 1 && nonAll[0] !== 'favourites') {
          const cat = nonAll[0];
          label = cat.charAt(0).toUpperCase() + cat.slice(1);
        } else {
          // Multiple specific categories selected
          label = 'Location';
        }
      }

      btn.textContent = label === 'Location' ? "What's nearby?" : 'Closest ' + label;
    }

    function getMissionLabel(mode = missionMode) {
      switch (mode) {
        case 'fresh-territory':
          return 'Fresh territory';
        case 'favourites-only':
          return 'Saved shops journey';
        case 'top-shelf':
          return 'Top shelf';
        default:
          return 'Free roam';
      }
    }

    function passesMissionMode(loc, index) {
      switch (missionMode) {
        case 'fresh-territory':
          return !loc.visited;
        case 'favourites-only':
          return favorites.includes(index);
        case 'top-shelf':
          return (loc.rating || 0) >= 4 || favorites.includes(index);
        default:
          return true;
      }
    }

    function getVisibleLocationIndexes() {
      return locations
        .map((loc, index) => (passesCategoryFilter(loc, index) ? index : null))
        .filter(index => index !== null);
    }

    function findLocationIndexByPreferenceKey(key) {
      if (!key) return null;
      for (let i = 0; i < locations.length; i += 1) {
        if (getLocationPreferenceKey(locations[i]) === key) return i;
      }
      return null;
    }

    function rememberRecentDestination(index) {
      if (!Number.isInteger(index) || index < 0 || index >= locations.length) return;
      const key = getLocationPreferenceKey(locations[index]);
      if (!key) return;

      recentDestinationKeys = [key, ...recentDestinationKeys.filter(entry => entry !== key)].slice(0, 8);
      saveRecentDestinations();
    }

    function updateMissionStatus() {
      const statusEl = document.getElementById('mission-status');
      if (!statusEl) return;

      if (!locations.length) {
        statusEl.textContent = 'Choose a mode once the map data loads.';
        return;
      }

      const visibleCount = getVisibleLocationIndexes().length;
      switch (missionMode) {
        case 'fresh-territory':
          statusEl.textContent = visibleCount
            ? `Fresh territory keeps ${visibleCount} unvisited Destination${visibleCount === 1 ? '' : 's'} in play.`
            : 'Fresh territory is dry right now. Mark fewer places as visited or switch missions.';
          return;
        case 'favourites-only':
          statusEl.textContent = visibleCount
            ? `Saved shops journey keeps ${visibleCount} Saved shops on deck.`
            : 'No Saved shops yet. Save a few Destinations first.';
          return;
        case 'top-shelf':
          statusEl.textContent = visibleCount
            ? `Top shelf is serving ${visibleCount} highly rated Destination${visibleCount === 1 ? '' : 's'}.`
            : 'Top shelf is empty. Rate a few places 4 or 5 stars to stock it.';
          return;
        default:
          statusEl.textContent = 'Free roam keeps every visible Destination in play.';
      }
    }

    function surpriseMe() {
      const visibleIndexes = getVisibleLocationIndexes();
      if (!visibleIndexes.length) {
        setRouteStatus(`No Destinations are available for ${getMissionLabel().toLowerCase()} right now.`, 'bad');
        return;
      }

      let pool = visibleIndexes.slice();
      const selectedIndex = getSelectedDestinationIndex();
      if (pool.length > 1 && selectedIndex !== null) {
        const withoutCurrent = pool.filter(index => index !== selectedIndex);
        if (withoutCurrent.length) pool = withoutCurrent;
      }

      if (missionMode === 'free-roam') {
        const freshPool = pool.filter(index => !locations[index].visited);
        if (freshPool.length >= 2) {
          pool = freshPool;
        }
      }

      const chosenIndex = pool[Math.floor(Math.random() * pool.length)];
      selectDestinationIndex(chosenIndex);
      focusDestinationOnMap(chosenIndex, {
        minZoom: isCompactMobileLayout() ? 15 : 16,
        animate: true,
        duration: 0.48
      });
    }

    function getAreaSearchAliases(loc) {
      const name = normaliseText(loc && loc.name);
      const aliases = [];
      const add = value => {
        const key = normaliseText(value);
        if (key && !aliases.includes(key)) aliases.push(key);
      };

      if (name.includes('de pijp')) {
        ['pijp', 'albert cuyp', 'albert cuypmarkt', 'sarphatipark'].forEach(add);
      }
      if (name.includes('jordaan')) {
        ['westerstraat', 'noordermarkt'].forEach(add);
      }
      if (name.includes('centrum') || name.includes('dam square')) {
        ['centre', 'center', 'dam', 'dam square', 'central'].forEach(add);
      }
      if (name.includes('de wallen')) {
        ['red light district', 'old town', 'oudezijds'].forEach(add);
      }
      if (name.includes('nieuwmarkt')) {
        ['waterlooplein', 'oude schans'].forEach(add);
      }
      if (name.includes('leidseplein')) {
        ['leidsestraat', 'nightlife'].forEach(add);
      }
      if (name.includes('museumplein')) {
        ['museum quarter', 'rijksmuseum', 'van gogh', 'museum district'].forEach(add);
      }
      if (name.includes('oud-west')) {
        ['oud west', 'kinkerstraat', 'foodhallen', 'ten kate'].forEach(add);
      }
      if (name.includes('amsterdam noord')) {
        ['noord', 'north', 'ndsm'].forEach(add);
      }
      if (name.includes('amsterdam oost')) {
        ['oost', 'east', 'oosterpark', 'dappermarkt'].forEach(add);
      }
      if (name.includes('negen straatjes')) {
        ['nine streets', '9 streets', 'canal belt'].forEach(add);
      }
      if (name.includes('haarlemmerbuurt')) {
        ['haarlemmerstraat', 'haarlemmerdijk'].forEach(add);
      }
      if (name.includes('plantage')) {
        ['artis', 'hortus', 'zoo'].forEach(add);
      }
      if (name.includes('sloterdijk')) {
        ['station sloterdijk'].forEach(add);
      }

      return aliases;
    }

    function getAreaSearchText(loc) {
      return [
        loc && loc.name,
        ...(isAreaLocation(loc) ? getAreaSearchAliases(loc) : [])
      ]
        .filter(Boolean)
        .map(normaliseText)
        .join(' ');
    }

    function getMatchingAreaAnchors(queryText) {
      const q = normaliseText(queryText);
      if (!q || q.length < 3) return [];
      if (locationSearchAreaAnchorCache.key === q) {
        return locationSearchAreaAnchorCache.anchors;
      }
      const anchors = locations.filter(loc =>
        loc &&
        isAreaLocation(loc) &&
        Array.isArray(loc.coords) &&
        Number.isFinite(loc.coords[0]) &&
        Number.isFinite(loc.coords[1]) &&
        getAreaSearchText(loc).includes(q)
      );
      locationSearchAreaAnchorCache = { key: q, anchors };
      return anchors;
    }

    function matchesAreaSearchAnchor(loc, queryText) {
      if (!loc || !Array.isArray(loc.coords)) return false;
      const anchors = getMatchingAreaAnchors(queryText);
      if (!anchors.length) return false;
      return anchors.some(anchor => {
        if (anchor === loc) return true;
        const distance = haversineDistance(anchor.coords, loc.coords);
        return Number.isFinite(distance) && distance <= AREA_SEARCH_RADIUS_METERS;
      });
    }

    function matchesLocationSearch(loc) {
      const q = (locationSearchText || '').toString().trim().toLowerCase();
      if (!q) return true;
      const qNorm = normaliseText(q);

      const haystack = [
        loc && loc.name,
        loc && loc.city,
        loc && loc.website,
        isAreaLocation(loc) ? getAreaSearchAliases(loc).join(' ') : ''
      ]
        .filter(Boolean)
        .join(' ');

      if (window.BudfinderSearch && window.BudfinderSearch.matches(loc && loc.name, qNorm, {
        aliases: [loc && loc.city, haystack],
        threshold: 0.72
      })) return true;
      if (normaliseText(haystack).includes(qNorm)) return true;
      return matchesAreaSearchAnchor(loc, qNorm);
    }

    function locationMatchesStrainMatchSets(loc, ids, nameCityKeys) {
      if (!loc) return false;
      if (loc.db_shop_id && ids && ids.has(loc.db_shop_id)) {
        return true;
      }
      if (nameCityKeys) {
        const key = normaliseNameCityKey(loc.name, loc.city || '');
        return nameCityKeys.has(key);
      }
      return false;
    }

    function isLocationCheapestForActiveStrain(loc) {
      if (!strainFilterText) return false;
      return locationMatchesStrainMatchSets(loc, strainCheapestShopIds, strainCheapestNameCityKeys);
    }

    function formatStrainTypeLabel(meta) {
      if (!meta) return 'Type unknown';
      const baseType = meta.baseType && meta.baseType !== 'unknown'
        ? `${meta.baseType.charAt(0).toUpperCase()}${meta.baseType.slice(1)}`
        : 'Type unknown';
      if (meta.caliStatus === 'all' && meta.baseType !== 'unknown') return `${baseType} · Cali`;
      if (meta.caliStatus === 'all') return 'Cali cut';
      if (meta.caliStatus === 'mixed' && meta.baseType !== 'unknown') return `${baseType} · Cali option available`;
      if (meta.caliStatus === 'mixed') return 'Cali option available';
      return baseType;
    }

    function getStrainMarketInfo(name) {
      const canonicalName = getCanonicalStrainName(name);
      const rows = Array.isArray(activeOfferingsRows) ? activeOfferingsRows : [];
      const meta = getStrainVisualMeta(canonicalName);
      const strainKey = normaliseText(canonicalName);
      const emptyInfo = {
        name: canonicalName,
        typeLabel: formatStrainTypeLabel(meta),
        matchCount: 0,
        countLabel: rows.length ? '0 shops' : 'Matches loading',
        cheapestPriceLabel: '',
        cheapestShopName: '',
        cheapestShopCity: '',
        cheapestShopLine: '',
        bestCity: '',
        bestCityCopy: 'Waiting on menu data',
        notesText: 'No notes yet for this strain on the nationwide map.',
        topShops: []
      };

      if (!strainKey) return emptyInfo;

      if (!rows.length) {
        const matchCount = locations.filter(loc => getPopupStrainsForLocation(loc).some(entry => normaliseText(entry) === strainKey)).length;
        return {
          ...emptyInfo,
          matchCount,
          countLabel: `${matchCount} shop${matchCount === 1 ? '' : 's'}`,
          bestCityCopy: matchCount ? 'Listed on the nationwide map' : 'Waiting on menu data'
        };
      }

      const pricing = buildStrainPricingInsightFromRows(canonicalName, rows);
      const matchedRows = collectMatchedActiveOfferingRows(strainKey, rows)
        .filter(isOfferingRowInCurrentAtlas);
      const shopsByKey = new Map();
      const notesSet = new Set();

      matchedRows.forEach(row => {
        const shopId = parseInt(row && row.shop_id, 10);
        const locationIndex = findLocationIndexForShopMatch(shopId, row && row.shop_name, row && row.shop_city);
        if (locationIndex === null || !locations[locationIndex]) return;

        const loc = locations[locationIndex];
        const shopName = (loc.name || (row && row.shop_name) || '').toString().trim();
        const shopCity = (loc.city || (row && row.shop_city) || '').toString().trim();
        const nameCityKey = normaliseNameCityKey(shopName, shopCity);
        const resolvedShopId = Number.isFinite(loc.db_shop_id) ? loc.db_shop_id : (Number.isFinite(shopId) ? shopId : null);
        const summaryKey = resolvedShopId ? `id:${resolvedShopId}` : `name:${nameCityKey}`;

        if (!shopsByKey.has(summaryKey)) {
          shopsByKey.set(summaryKey, {
            index: locationIndex,
            shopId: resolvedShopId,
            name: shopName,
            city: shopCity,
            nameCityKey,
            priceEntries: [],
            notes: new Set(),
            updatedAt: ''
          });
        }

        const entry = shopsByKey.get(summaryKey);
        const updatedAt = getDisplayOfferingUpdatedAt(row);
        if (updatedAt && (!entry.updatedAt || updatedAt > entry.updatedAt)) {
          entry.updatedAt = updatedAt;
        }
        const amount = parseFloat(row && row.price_amount);
        if (Number.isFinite(amount)) {
          entry.priceEntries.push({
            amount,
            currency: ((row && row.price_currency) || '€').toString().trim() || '€',
            unit: ((row && row.price_unit) || 'g').toString().trim() || 'g'
          });
        }

        const noteRaw = ((row && (row.notes ?? row.note)) || '').toString().replace(/\s+/g, ' ').trim();
        if (noteRaw) {
          entry.notes.add(noteRaw);
          notesSet.add(noteRaw);
        }
      });

      const shopSummaries = Array.from(shopsByKey.values()).map(entry => {
        const priceLabel = buildPriceLabel(entry.priceEntries);
        const minPriceAmount = entry.priceEntries.length
          ? entry.priceEntries.reduce((min, priceEntry) => Math.min(min, priceEntry.amount), Infinity)
          : Infinity;
        const loc = locations[entry.index];
        return {
          ...entry,
          priceLabel,
          minPriceAmount,
          isCheapest: !!(loc && locationMatchesStrainMatchSets(loc, pricing.cheapestShopIds, pricing.cheapestNameCityKeys)),
          notesText: Array.from(entry.notes).slice(0, 2).join(' | ')
        };
      });

      const cityCounts = new Map();
      shopSummaries.forEach(shop => {
        if (!shop.city) return;
        cityCounts.set(shop.city, (cityCounts.get(shop.city) || 0) + 1);
      });
      const bestCityEntry = Array.from(cityCounts.entries())
        .sort((a, b) => {
          const diff = (b[1] || 0) - (a[1] || 0);
          if (diff !== 0) return diff;
          return a[0].localeCompare(b[0]);
        })[0];
      const bestCity = bestCityEntry ? bestCityEntry[0] : '';

      const sortedShops = shopSummaries.slice().sort((a, b) => {
        if (a.isCheapest && !b.isCheapest) return -1;
        if (!a.isCheapest && b.isCheapest) return 1;
        const aPriced = Number.isFinite(a.minPriceAmount) ? 0 : 1;
        const bPriced = Number.isFinite(b.minPriceAmount) ? 0 : 1;
        if (aPriced !== bPriced) return aPriced - bPriced;
        if (Number.isFinite(a.minPriceAmount) && Number.isFinite(b.minPriceAmount)) {
          const diff = a.minPriceAmount - b.minPriceAmount;
          if (Math.abs(diff) > 0.0001) return diff;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      const cheapestShop = sortedShops.find(shop => shop.isCheapest) || sortedShops[0] || null;
      const matchCount = shopSummaries.length;
      return {
        ...emptyInfo,
        matchCount,
        countLabel: `${matchCount} shop${matchCount === 1 ? '' : 's'}`,
        cheapestPriceLabel: pricing.cheapestPriceLabel || (cheapestShop && cheapestShop.priceLabel) || '',
        cheapestShopName: cheapestShop ? cheapestShop.name : '',
        cheapestShopCity: cheapestShop ? cheapestShop.city : '',
        cheapestShopLine: cheapestShop
          ? `${cheapestShop.name}${cheapestShop.city ? ` · ${cheapestShop.city}` : ''}`
          : '',
        bestCity,
        bestCityCopy: bestCity
          ? `${matchCount > 1 ? 'Best in' : 'Live in'} ${bestCity}`
          : (matchCount ? 'Listed on the nationwide map' : 'Waiting on menu data'),
        notesText: notesSet.size
          ? Array.from(notesSet).slice(0, 3).join(' | ')
          : 'No notes yet for this strain on the nationwide map.',
        topShops: sortedShops.slice(0, 3)
      };
    }

    function getStrainShelfArtTitle(meta) {
      if (meta.caliStatus === 'all' && meta.baseType !== 'unknown') {
        return `Cali ${meta.baseType}`;
      }
      if (meta.caliStatus === 'all') return 'Cali cut';
      if (meta.caliStatus === 'mixed' && meta.baseType !== 'unknown') return `${meta.baseType} · Cali option`;
      if (meta.caliStatus === 'mixed') return 'Cali option';
      if (meta.baseType !== 'unknown') return `${meta.baseType} cut`;
      return 'House pick';
    }

    function getStrainShelfToneSeed(name) {
      return getCanonicalStrainName(name) || name || 'stash';
    }

    function resetAtlasFiltersForShelfStrain() {
      let changed = false;
      const destinationSearchInput = document.getElementById('destination-search');
      const missionModeSelect = document.getElementById('mission-mode');

      if (locationSearchText ||
          missionMode !== 'free-roam' ||
          !((selectedCategories || []).includes('all') && (selectedCategories || []).length === 1)) {
        rememberMapFilterState();
      }

      if (locationSearchText) {
        locationSearchText = '';
        changed = true;
        if (destinationSearchInput) destinationSearchInput.value = '';
      }

      if (missionMode !== 'free-roam') {
        missionMode = 'free-roam';
        changed = true;
        if (missionModeSelect) missionModeSelect.value = missionMode;
      }

      if (!(selectedCategories || []).includes('all') || (selectedCategories || []).length !== 1) {
        selectedCategories = ['all'];
        syncCategoryCheckboxes();
        changed = true;
      }

      if (changed) {
        updateNearestLabel();
      }
    }

    async function activateShelfStrain(strain, options = {}) {
      const query = (strain || '').toString().trim();
      if (!query) return;

      resetAtlasFiltersForShelfStrain();
      await applyStrainFilter(query, { recordHistory: false });
      if (map) {
        window.setTimeout(() => {
          if (!map) return;
          fitMapToVisibleMarkers();
        }, 120);
      }
      if (isCompactMobileLayout() && options.closeShelf !== false) {
        setShelfVisible(false);
      }
    }

    async function showOtherShopsForStrain(strain) {
      const query = getCanonicalStrainName(strain);
      if (!query) return false;

      resetAtlasFiltersForShelfStrain();
      const applied = await applyStrainFilter(query, { recordHistory: false });
      const isActive = normaliseText(strainFilterText) === normaliseText(query);
      if (!applied && !isActive) return false;

      const matchCount = locations.filter((loc, index) => passesCategoryFilter(loc, index)).length;
      setRouteStatus(
        `Showing ${matchCount} shop${matchCount === 1 ? '' : 's'} carrying ${query}.`,
        'good'
      );

      if (map) {
        map.closePopup();
        window.setTimeout(() => {
          if (!map) return;
          map.closePopup();
          fitMapToVisibleMarkers({ searchResults: true });
          window.setTimeout(() => {
            if (map) map.closePopup();
          }, 180);
        }, 120);
      }

      if (isCompactMobileLayout() || document.body.classList.contains('compact-layout')) {
        setControlsVisible(false);
      }
      return true;
    }

    function passesBaseFilters(loc, index) {
      if (isClosedLocation(loc)) {
        return false;
      }

      if (loc && loc.db_shop_unavailable) {
        return false;
      }

      if (!locationMatchesExplorerFocus(loc)) {
        return false;
      }

      const cats = (Array.isArray(selectedCategories) && selectedCategories.length > 0)
        ? selectedCategories.slice()
        : ['all'];

      let categoryOk = true;
      if (!cats.includes('all')) {
        const isFav = favorites.includes(index);
        const nonSpecial = cats.filter(c => c !== 'favourites');

        let baseMatch;
        if (nonSpecial.length === 0) {
          baseMatch = true;
        } else {
          baseMatch = nonSpecial.some(cat => loc[cat]);
        }

        if (cats.includes('favourites')) {
          categoryOk = isFav && baseMatch;
        } else {
          categoryOk = baseMatch;
        }
      }

      if (!categoryOk) {
        return false;
      }

      if (!passesMissionMode(loc, index)) {
        return false;
      }

      if (strainAllowedShopIds !== null || strainAllowedNameCityKeys !== null) {
        return locationMatchesStrainMatchSets(loc, strainAllowedShopIds, strainAllowedNameCityKeys);
      }

      return true;
    }

    function updateDestinationSearchStatus() {
      const statusEl = document.getElementById('destination-search-status');
      if (!statusEl) return;

      if (!locations.length) {
        statusEl.textContent = `Loading ${getActiveLocationLabel()} menu data...`;
        return;
      }

      const baseVisibleCount = locations.filter((loc, idx) => passesBaseFilters(loc, idx)).length;
      const visibleCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
      const hasSearch = !!(locationSearchText || '').trim();

      if (!hasSearch) {
        if (!baseVisibleCount) {
          statusEl.textContent = hasExplorerFocus()
            ? 'No route stops are visible on this map yet. Try showing all strain matches or clearing filters.'
          : 'No Destinations are visible yet. Clear a filter or choose another strain to widen the map.';
          return;
        }

        statusEl.textContent = hasExplorerFocus()
          ? `Scanning ${baseVisibleCount} explorer-selected coffeeshop${baseVisibleCount === 1 ? '' : 's'}.`
          : strainFilterText
          ? `Scanning ${baseVisibleCount} strain-match Destination${baseVisibleCount === 1 ? '' : 's'}.`
          : `Scanning ${baseVisibleCount} visible Destination${baseVisibleCount === 1 ? '' : 's'}.`;
        return;
      }

      statusEl.textContent = visibleCount
        ? `${visibleCount} Destination${visibleCount === 1 ? '' : 's'} match "${locationSearchText}".`
        : `No visible Destinations match "${locationSearchText}". Try a broader shop, area, or strain name.`;
    }

    function getLocationSourceLabel(loc) {
      const explicitSource = (loc && loc.source || '').toString().trim();
      if (explicitSource) return explicitSource;
      const meta = getShopSourceMeta(loc);
      const sourceUrl = meta && (meta.shop_url || meta.image_url);
      if (sourceUrl) {
        try {
          const host = new URL(sourceUrl, window.location.href).hostname.replace(/^www\./i, '');
          if (host) return host;
        } catch (_err) {
          // Fall through to the friendly default.
        }
      }
      return loc && loc.db_shop_id ? 'Budfinder menu index' : 'Budfinder map catalogue';
    }

    function getConfidenceInfo(loc) {
      const updatedAt = getPopupMenuUpdatedAt(loc);
      const days = getAgeInDays(updatedAt);
      const strains = getPopupStrainsForLocation(loc);
      const source = getLocationSourceLabel(loc);
      if (days !== null && days <= 14 && strains.length) {
        return { label: 'High confidence', tone: 'high', source };
      }
      if (days !== null && days <= 60) {
        return { label: 'Medium confidence', tone: 'medium', source };
      }
      if (days !== null) {
        return { label: 'Low confidence', tone: 'low', source };
      }
      return { label: 'Confidence unknown', tone: 'unknown', source };
    }

    function getSavedStrainMatchesForLocation(loc) {
      const strains = getPopupStrainsForLocation(loc);
      if (!strains.length || !shelfStrainNames.length) return [];
      const available = new Map(strains.map(name => [normaliseText(name), name]));
      return shelfStrainNames
        .filter(name => available.has(normaliseText(name)))
        .map(name => available.get(normaliseText(name)) || name);
    }

    function getPriceInsightForLocation(loc, priceLabel) {
      const amount = parsePriceAmountFromLabel(priceLabel);
      if (Number.isFinite(amount)) {
        if (amount <= 10) return { label: 'Under €10/g', tone: 'deal', text: `Last seen at ${priceLabel}` };
        if (amount <= 12) return { label: 'Good deal', tone: 'deal', text: `Last seen at ${priceLabel}` };
        return { label: `Last seen at ${priceLabel}`, tone: 'price', text: `Price guidance: ${priceLabel}` };
      }
      if (strainFilterText) return { label: 'Price unknown', tone: 'unknown', text: 'Price not listed for this strain yet.' };
      const strains = getPopupStrainsForLocation(loc);
      if (!strains.length) return { label: 'Price unknown', tone: 'unknown', text: 'No matched menu prices yet.' };
      return { label: 'Prices in menu', tone: 'price', text: `${strains.length} menu item${strains.length === 1 ? '' : 's'} matched.` };
    }

    function getExplorationOriginInfo() {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex !== null && locations[selectedIndex]) {
        return {
          type: 'selected',
          index: selectedIndex,
          label: locations[selectedIndex].name || 'Destination',
          coords: locations[selectedIndex].coords
        };
      }
      if (lastPosition) {
        return {
          type: 'location',
          index: null,
          label: 'your location',
          coords: lastPosition
        };
      }
      return null;
    }

    function buildDestinationWhyReasons(item, activeName) {
      const parts = [];
      if (activeName) {
        if (item.isClosest) {
          parts.push(`Closest known shop with ${activeName}.`);
        } else if (item.priceInsight && item.priceInsight.tone === 'deal') {
          parts.push(`Good-value lead for ${activeName} where price is known.`);
        } else {
          parts.push(`Strong map match for ${activeName}.`);
        }
      } else if (item.savedMatches && item.savedMatches.length) {
        parts.push(item.savedMatches.length === 1
          ? 'Nearby option with one saved-strain match.'
          : `Strong saved-strain match with ${item.savedMatches.length} saved strains.`);
      } else {
        parts.push('Useful nearby option for the current route.');
      }
      if (item.etaLabel) parts.push(`${item.etaLabel} from Starting point`);
      if (item.priceInsight && item.priceInsight.tone === 'deal') parts.push(item.priceInsight.label);
      if (item.priceInsight && item.priceInsight.label === 'Price unknown') parts.push('Worth checking, but price data is incomplete');
      if (item.freshnessLabel) parts.push(item.freshnessLabel);
      return parts.slice(0, 5);
    }

    function updateTripPanelStatus(summaryText) {
      const modeEl = document.getElementById('current-mode-status');
      const startEl = document.getElementById('trip-starting-point');
      const destEl = document.getElementById('trip-destination');
      const selectedIndex = getSelectedDestinationIndex();
      const selected = selectedIndex !== null ? locations[selectedIndex] : null;
      const stopCount = journeyPlanner && Array.isArray(journeyPlanner.stops) ? journeyPlanner.stops.length : 0;

      if (modeEl) {
        modeEl.textContent = stopCount
          ? `${stopCount} stop${stopCount === 1 ? '' : 's'} added`
          : 'No stops yet';
      }
      if (startEl) {
        if (selected) {
          startEl.textContent = selected.name || 'Selected coffeeshop';
        } else if (lastPosition) {
          startEl.textContent = 'Near me';
        } else if (!locations.length) {
          startEl.textContent = `${getActiveLocationLabel()} data is loading`;
        } else {
          startEl.textContent = 'Choose a shop or use Near me';
        }
      }
      if (destEl) {
        destEl.textContent = selected
          ? (selected.name || 'Selected Destination')
          : 'No Destination selected';
      }
      const summary = summaryText || '';
      if (modeEl && summary && !selected && !lastPosition) {
        modeEl.setAttribute('title', summary);
      }
    }

    function updateHeroStats() {
      const visibleEl = document.getElementById('hero-visible-count');
      const favouritesEl = document.getElementById('hero-favourites-count');
      const modeEl = document.getElementById('hero-mode-value');
      const filterEl = document.getElementById('hero-filter-state');
      const csvEl = document.getElementById('hero-csv-name');

      const visibleCount = locations.length
        ? locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length
        : 0;

      if (visibleEl) visibleEl.textContent = String(visibleCount);
      if (favouritesEl) favouritesEl.textContent = String(favorites.length);

      const modeSelect = document.getElementById('mode');
      const modeLabel = modeSelect
        ? ((modeSelect.options[modeSelect.selectedIndex] && modeSelect.options[modeSelect.selectedIndex].text) || 'Walk')
        : 'Walk';
      if (modeEl) modeEl.textContent = modeLabel;

      if (filterEl) {
        const filterBits = [];
        if (hasExplorerFocus()) filterBits.push(`Explorer shops: ${explorerFocusShopIds.size}`);
        if (missionMode !== 'free-roam') filterBits.push(`Mission: ${getMissionLabel()}`);
        if (strainFilterText) filterBits.push(`Strain: ${strainFilterText}`);
        if (strainCheapestPriceLabel) filterBits.push(`Lowest: ${strainCheapestPriceLabel}`);
        if (locationSearchText) filterBits.push(`Search: ${locationSearchText}`);
        filterEl.textContent = filterBits.length ? filterBits.join(' · ') : 'No live filters';
      }

      if (csvEl) {
        if (currentCsvPath) {
          csvEl.textContent = `Coverage: All Netherlands · Viewing: ${isMasterCoffeeshopPath(currentCsvPath) ? 'Nationwide' : csvLabelFromPath(currentCsvPath)}`;
        } else if (discoveredCsvPaths.length) {
          csvEl.textContent = 'Coverage: All Netherlands · Opening Amsterdam';
        } else {
          csvEl.textContent = 'Loading nationwide coverage...';
        }
      }
    }

    function updateSelectionCard() {
      const card = document.getElementById('selection-card');
      const selectedIndex = getSelectedDestinationIndex();
      if (!card || selectedIndex === null || !locations[selectedIndex]) {
        syncSelectionCardChrome();
        syncDesktopTogglePosition();
        return;
      }

      const loc = locations[selectedIndex];
      const nameEl = document.getElementById('selected-destination-name');
      const summaryEl = document.getElementById('selection-card-summary');
      const metaEl = document.getElementById('selected-destination-meta');
      const cityEl = document.getElementById('selected-destination-city');
      const etaEl = document.getElementById('selected-destination-eta');
      const siteLink = document.getElementById('selection-website-link');
      const priceMenusLink = document.getElementById('selection-price-menus-link');
      const addStopBtn = document.getElementById('selection-add-stop-btn');
      const moveUpBtn = document.getElementById('selection-move-up-btn');
      const moveDownBtn = document.getElementById('selection-move-down-btn');
      const modeSelect = document.getElementById('mode');
      const modeText = modeSelect && modeSelect.options[modeSelect.selectedIndex]
        ? modeSelect.options[modeSelect.selectedIndex].text
        : 'Walking';
      const distanceMeters = lastPosition ? haversineDistance(lastPosition, loc.coords) : null;
      const distanceText = Number.isFinite(distanceMeters) ? formatDistanceMeters(distanceMeters) : '';
      const etaLabel = formatCompactDuration(estimateTravelSecondsForMode(distanceMeters, modeSelect ? modeSelect.value : 'walking'));
      const strains = getPopupStrainsForLocation(loc);
      const savedMatches = getSavedStrainMatchesForLocation(loc);
      const priceLabel = getMarkerPriceLabel(loc);
      const priceInsight = getPriceInsightForLocation(loc, priceLabel);
      const menuUpdatedAt = getPopupMenuUpdatedAt(loc);
      const freshnessLabel = formatFreshnessLabel(menuUpdatedAt);
      const checkedDate = formatDisplayDate(menuUpdatedAt);
      const confidence = getConfidenceInfo(loc);
      const isArea = isAreaLocation(loc);
      const hasMenuRecord = Number.isFinite(loc.db_shop_id);

      if (nameEl) nameEl.textContent = loc.name || 'Destination';
      if (summaryEl) {
        summaryEl.textContent = isArea
          ? [
              'Area search anchor',
              etaLabel ? `${etaLabel} direct ${modeText.toLowerCase()} estimate` : (distanceText || 'direct distance unknown')
            ].filter(Boolean).join(' · ')
          : [
              loc.city || inferCityFromCsvPath(currentCsvPath) || 'Current city',
              etaLabel ? `${etaLabel} direct ${modeText.toLowerCase()} estimate` : (distanceText || 'direct distance unknown')
            ].filter(Boolean).join(' · ');
      }
      if (metaEl) {
        const nearbyCoffeeShopCount = isArea
          ? locations.filter(candidate =>
              candidate &&
              candidate !== loc &&
              isCoffeeShopLocation(candidate) &&
              !isClosedLocation(candidate) &&
              Array.isArray(candidate.coords) &&
              haversineDistance(loc.coords, candidate.coords) <= AREA_SEARCH_RADIUS_METERS
            ).length
          : 0;
        const nearbyCopy = isArea
          ? `${nearbyCoffeeShopCount} coffeeshop${nearbyCoffeeShopCount === 1 ? '' : 's'} near this area anchor. Use search to narrow nearby stops.`
          : !hasMenuRecord
          ? `No menu is currently available in Budfinder. Source: ${getLocationSourceLabel(loc)}.`
          : savedMatches.length
          ? `${savedMatches.length} saved strain${savedMatches.length === 1 ? '' : 's'} matched here.`
          : strains.length
          ? `${strains.length} listed strain${strains.length === 1 ? '' : 's'} in the current menu data.`
          : 'Menu matches are still loading for this shop.';
        metaEl.textContent = isArea || !hasMenuRecord
          ? nearbyCopy
          : `${nearbyCopy} ${priceInsight.text} ${freshnessLabel}. ${confidence.label}; availability is not guaranteed.`;
      }
      if (cityEl) cityEl.textContent = loc.address || loc.city || getActiveLocationLabel();
      if (etaEl) etaEl.textContent = etaLabel
        ? `${etaLabel} direct ${modeText.toLowerCase()} estimate`
        : (lastPosition ? 'Direct distance ready' : 'Set Starting point');
      if (siteLink) {
        const href = (loc.website || '').toString().trim();
        if (href) {
          siteLink.hidden = false;
          siteLink.href = href;
        } else {
          siteLink.hidden = true;
          siteLink.removeAttribute('href');
        }
      }
      if (priceMenusLink) {
        if (Number.isFinite(loc.db_shop_id)) {
          priceMenusLink.hidden = false;
          priceMenusLink.href = priceMenusUrl({
            shopId: loc.db_shop_id,
            strain: offeringAttributeFilterKind ? '' : getCanonicalStrainName(strainFilterText)
          });
          priceMenusLink.textContent = 'Price & Menus';
          priceMenusLink.setAttribute('aria-label', `Research prices for ${loc.name || 'this destination'}`);
        } else {
          priceMenusLink.hidden = true;
          priceMenusLink.href = 'database.html';
          priceMenusLink.removeAttribute('aria-label');
        }
      }
      const stopIndex = getJourneyStopIndexByLocationIndex(selectedIndex);
      const inItinerary = stopIndex >= 0;
      if (addStopBtn) {
        addStopBtn.hidden = isArea;
        addStopBtn.textContent = inItinerary ? 'Remove from route' : 'Add to route';
        addStopBtn.classList.toggle('is-remove', inItinerary);
        addStopBtn.setAttribute('aria-pressed', inItinerary ? 'true' : 'false');
      }
      if (moveUpBtn) {
        moveUpBtn.hidden = isArea || !inItinerary;
        moveUpBtn.disabled = isArea || !inItinerary || stopIndex <= 0;
      }
      if (moveDownBtn) {
        moveDownBtn.hidden = isArea || !inItinerary;
        moveDownBtn.disabled = isArea || !inItinerary || stopIndex >= journeyPlanner.stops.length - 1;
      }

      syncPriceMenusLinks();
      syncSelectionCardChrome();
      syncDesktopTogglePosition();
    }

    function updateStrainSpotlight() {
      const card = document.getElementById('strain-spotlight-card');
      const mediaEl = document.getElementById('strain-spotlight-media');
      const nameEl = document.getElementById('strain-spotlight-name');
      const summaryEl = document.getElementById('strain-spotlight-summary');
      const typeEl = document.getElementById('strain-spotlight-type');
      const priceEl = document.getElementById('strain-spotlight-price');
      const countEl = document.getElementById('strain-spotlight-count');
      const notesEl = document.getElementById('strain-spotlight-notes');
      const cityEl = document.getElementById('strain-spotlight-city');
      const topShopsEl = document.getElementById('strain-spotlight-top-shops');
      const priceGuideLink = document.getElementById('strain-price-guide-link');
      if (!card || !mediaEl || !nameEl || !summaryEl || !typeEl || !priceEl || !countEl || !notesEl || !cityEl || !topShopsEl) return;

      const activeName = offeringAttributeFilterKind ? '' : getCanonicalStrainName(strainFilterText);
      if (!activeName) {
      mediaEl.innerHTML = '<div class="strain-spotlight-fallback">Pick a strain to open its profile.</div>';
      nameEl.textContent = 'No strain selected';
      summaryEl.textContent = 'Choose a strain to see map matches. For average prices and full listings, open Price & Menus.';
        typeEl.textContent = 'Type loads after search';
        priceEl.textContent = 'Price signal pending';
        countEl.textContent = 'Matches load after search';
        notesEl.textContent = 'Search a strain, then Budfinder will surface useful shops to visit next.';
        cityEl.textContent = 'Waiting for your search';
        topShopsEl.innerHTML = '<div class="strain-spotlight-empty">Search or tap a strain to see matching shops.</div>';
        if (priceGuideLink) {
          priceGuideLink.href = 'database.html';
          priceGuideLink.textContent = 'Price & Menus';
        }
        return;
      }

      if (!strainImageMapReady && !strainImageMapPromise) {
        ensureStrainImageMap().then(() => {
          if (normaliseText(strainFilterText) === normaliseText(activeName)) {
            updateStrainSpotlight();
          }
        });
      }

      const market = getStrainMarketInfo(activeName);
      mediaEl.innerHTML = getStrainSpotlightMediaHtml(activeName);
      nameEl.textContent = activeName;
      summaryEl.textContent = market.cheapestShopLine
        ? `${market.bestCityCopy}. Cheapest visible price signal at ${market.cheapestShopLine}.`
        : `${market.bestCityCopy}.`;
      typeEl.textContent = market.typeLabel;
      priceEl.textContent = market.cheapestPriceLabel ? `Cheapest ${market.cheapestPriceLabel}` : 'Cheapest unavailable';
      countEl.textContent = market.countLabel;
      notesEl.textContent = market.notesText;
      cityEl.textContent = market.bestCityCopy || 'Current map matches';
      if (priceGuideLink) {
        priceGuideLink.href = priceMenusUrl({ strain: activeName });
        priceGuideLink.textContent = `Research ${activeName} prices`;
      }

      if (!market.topShops.length) {
        topShopsEl.innerHTML = '<div class="strain-spotlight-empty">No matching shops on the nationwide map yet. Try clearing filters or broadening the strain name.</div>';
        return;
      }

      topShopsEl.innerHTML = market.topShops.map(shop => {
        const metaBits = [];
        if (shop.city) metaBits.push(shop.city);
        metaBits.push(shop.isCheapest ? 'Cheapest match' : 'Tap to route');
        const freshLabel = formatFreshnessLabel(shop.updatedAt);
        if (freshLabel) metaBits.push(freshLabel);
        if (shop.notesText) metaBits.push(shop.notesText);
        return (
          `<button type="button" class="strain-spotlight-shop${shop.isCheapest ? ' is-cheapest' : ''}" data-index="${shop.index}">` +
            `<span class="strain-spotlight-shop-copy">` +
              `<span class="strain-spotlight-shop-name">${escapeHtml(shop.name)}</span>` +
              `<span class="strain-spotlight-shop-meta">${escapeHtml(metaBits.join(' · '))}</span>` +
            `</span>` +
            `<span class="strain-spotlight-shop-price">${escapeHtml(shop.priceLabel || 'Price offline')}</span>` +
          `</button>`
        );
      }).join('');
    }

    function syncRoutePanelOrder() {
      const journeyCard = document.getElementById('journey-planner-card');
      const modeStrip = document.querySelector('.route-panel .map-mode-strip');
      if (!journeyCard || !modeStrip || modeStrip.nextElementSibling === journeyCard) return;
      modeStrip.after(journeyCard);
    }

    function openRouteTools() {
      const routeTools = document.getElementById('route-tools-dropdown');
      if (routeTools) routeTools.open = true;
      const planner = document.getElementById('journey-planner-card');
      if (planner) planner.open = true;
      return planner;
    }

    function updateControlsSummary() {
      const summaryEl = document.getElementById('controls-summary');
      let summaryText = '';
      syncRoutePanelOrder();
      updateHeroStats();
      updateSelectionCard();
      updateDestinationSearchStatus();
      updateMissionStatus();
      updateStashShelf();
      updateTopShelfRail();
      updateStrainSpotlight();
      syncActiveStrainShelfButton();
      syncPriceMenusLinks();
      syncClearSelectionToggle();
      if (!summaryEl) return;

      if (!locations.length) {
        summaryText = `Loading ${getActiveLocationLabel()} menu data...`;
        summaryEl.textContent = summaryText;
        updateTripPanelStatus(summaryText);
        return;
      }

      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex !== null && locations[selectedIndex]) {
        const loc = locations[selectedIndex];
        if (lastPosition) {
          const distText = formatDistanceMeters(haversineDistance(lastPosition, loc.coords));
          summaryText = `${loc.name} · ${distText}`;
        } else {
          summaryText = loc.name;
        }
      } else {
        const visibleCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
        if (missionMode !== 'free-roam' && strainFilterText && locationSearchText) {
          summaryText = `${visibleCount} ${getMissionLabel().toLowerCase()} hits for ${strainFilterText}`;
        } else if (missionMode !== 'free-roam' && locationSearchText) {
          summaryText = `${visibleCount} ${getMissionLabel().toLowerCase()} Destinations for "${locationSearchText}"`;
        } else if (missionMode !== 'free-roam' && strainFilterText) {
          summaryText = `${visibleCount} ${getMissionLabel().toLowerCase()} matches`;
        } else if (strainFilterText && locationSearchText) {
          summaryText = `${visibleCount} matches for ${strainFilterText} + ${locationSearchText}`;
        } else if (locationSearchText) {
          summaryText = `${visibleCount} Destinations for "${locationSearchText}"`;
        } else if (strainFilterText) {
          summaryText = `${visibleCount} matches for ${strainFilterText}`;
        } else if (hasExplorerFocus()) {
          summaryText = `${visibleCount} explorer shop${visibleCount === 1 ? '' : 's'} visible`;
        } else if ((selectedCategories || []).includes('all')) {
          summaryText = `${visibleCount} places visible`;
        } else {
          summaryText = `${visibleCount} filtered places`;
        }
      }

      if (isCompactMobileLayout() && controlsVisible && controlsCollapsed) {
        summaryText = summaryText ? `Tap to open · ${summaryText}` : 'Tap to open';
      }

      summaryEl.textContent = summaryText;
      updateTripPanelStatus(summaryText);
    }

    /**
     * Check whether a location passes the currently selected category filters.
     */
    function passesCategoryFilter(loc, index) {
      if (!passesBaseFilters(loc, index)) {
        return false;
      }
      return matchesLocationSearch(loc);
    }

    // Handle the multi-select location category controls. "All" remains exclusive.
    document.getElementById('category-filters').addEventListener('change', e => {
      if (!e.target.classList.contains('category-checkbox')) return;
      rememberMapFilterState();

      const cat = e.target.value;
      const checked = e.target.checked;
      let current = Array.isArray(selectedCategories)
        ? selectedCategories.filter(value => categoryOptions.includes(value))
        : [];

      if (checked && cat === 'all') {
        current = ['all'];
      } else if (checked) {
        current = current.filter(value => value !== 'all');
        if (!current.includes(cat)) current.push(cat);
      } else {
        current = current.filter(value => value !== cat);
        if (!current.length) current = ['all'];
      }

      selectedCategories = current;
      syncCategoryCheckboxes();
      updateNearestLabel();
      updateDestinationDropdown();
      updateDistanceInfo();
      updateMarkers();
    });

    const clearStrainBtn = document.getElementById('clear-strain-btn');
    if (clearStrainBtn) {
      clearStrainBtn.addEventListener('click', () => {
        clearStrainFilter();
      });
    }

    const toggleCurrentStrainShelfBtn = document.getElementById('toggle-current-strain-shelf-btn');
    if (toggleCurrentStrainShelfBtn) {
      toggleCurrentStrainShelfBtn.addEventListener('click', () => {
        if (!strainFilterText) return;
        toggleShelfMembershipForStrain(strainFilterText);
      });
    }

    const destinationSearchInput = document.getElementById('destination-search');
    const isSearchAllTownsEnabled = () => true;
    if (destinationSearchInput) {
      const handleDestinationSearch = () => {
        if (destinationSearchComposing) return;
        const rawQuery = (destinationSearchInput.value || '').toString().replace(/\s+/g, ' ').trim();
        if (rawQuery !== locationSearchText) {
          rememberMapFilterState();
        }
        if (rawQuery && (hasExplorerFocus() || explorerFocusStrainName)) {
          clearExplorerFocus();
          syncExplorerFocusControls();
        }
        if (clearGlobalSearchAppliedStrainIfNeeded(rawQuery)) {
          // clearStrainFilter refreshes the UI; continue with the new search below.
        }
        locationSearchText = rawQuery;
        syncMapSearchUrl(rawQuery);
        updateGlobalSearchSuggestions(rawQuery);
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        const visibleLocationCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
        scheduleGlobalSearchStrainResolve(rawQuery, visibleLocationCount, {
          allowTownSwitch: isSearchAllTownsEnabled(),
          deferFocusedSingleWord: true
        });
        if (globalSearchFocusTimer !== null) {
          window.clearTimeout(globalSearchFocusTimer);
          globalSearchFocusTimer = null;
        }
        if (rawQuery) {
          pendingInitialSearchPresentation = isCompactMobileLayout();
          const expectedQueryKey = normaliseText(rawQuery);
          globalSearchFocusTimer = window.setTimeout(() => {
            globalSearchFocusTimer = null;
            const currentQuery = (destinationSearchInput.value || '').toString().replace(/\s+/g, ' ').trim();
            if (normaliseText(currentQuery) !== expectedQueryKey) return;
            if (destinationSearchInput === document.activeElement && currentQuery.split(/\s+/).filter(Boolean).length < 2) return;
            focusSearchResultsPanel();
            fitMapToVisibleMarkers({ searchResults: true });
          }, 620);
        }
      };

      destinationSearchInput.addEventListener('compositionstart', () => {
        destinationSearchComposing = true;
      });
      destinationSearchInput.addEventListener('compositionend', () => {
        destinationSearchComposing = false;
        handleDestinationSearch();
      });
      destinationSearchInput.addEventListener('input', handleDestinationSearch);
      destinationSearchInput.addEventListener('search', handleDestinationSearch);
      destinationSearchInput.addEventListener('change', () => {
        const rawQuery = (destinationSearchInput.value || '').toString().replace(/\s+/g, ' ').trim();
        if (!rawQuery) return;
        const visibleLocationCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
        scheduleGlobalSearchStrainResolve(rawQuery, visibleLocationCount, {
          immediate: true,
          allowTownSwitch: isSearchAllTownsEnabled()
        });
      });
      destinationSearchInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const rawQuery = (destinationSearchInput.value || '').toString().replace(/\s+/g, ' ').trim();
        if (!rawQuery) return;
        const visibleLocationCount = locations.filter((loc, idx) => passesCategoryFilter(loc, idx)).length;
        scheduleGlobalSearchStrainResolve(rawQuery, visibleLocationCount, {
          immediate: true,
          allowTownSwitch: isSearchAllTownsEnabled()
        });
      });
    }

    document.querySelectorAll('[data-map-quick-search]').forEach(button => {
      button.addEventListener('click', () => {
        const query = (button.getAttribute('data-map-quick-search') || '').toString().replace(/\s+/g, ' ').trim();
        const searchInput = document.getElementById('destination-search');
        if (!query || !searchInput) return;
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
      });
    });

    const missionModeSelect = document.getElementById('mission-mode');
    if (missionModeSelect) {
      missionModeSelect.addEventListener('change', e => {
        const nextMissionMode = (e.target.value || 'free-roam').toString();
        if (nextMissionMode !== missionMode) {
          rememberMapFilterState();
        }
        missionMode = nextMissionMode;
        updateNearestLabel();
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
      });
    }

    const destinationSortSelect = document.getElementById('destination-sort');
    if (destinationSortSelect) {
      destinationSortSelect.addEventListener('change', () => {
        updateDestinationDropdown();
      });
    }

    const surpriseBtn = document.getElementById('surprise-btn');
    if (surpriseBtn) {
      surpriseBtn.addEventListener('click', () => {
        surpriseMe();
      });
    }

    const toggleShelfBtn = document.getElementById('toggle-shelf');
    if (toggleShelfBtn) {
      toggleShelfBtn.addEventListener('click', () => {
        setShelfVisible(!shelfVisible);
      });
    }

    const stashShelfCloseBtn = document.getElementById('stash-shelf-close');
    if (stashShelfCloseBtn) {
      stashShelfCloseBtn.addEventListener('click', () => {
        setShelfVisible(false);
      });
    }

    const topShelfRailToggleBtn = document.getElementById('top-shelf-rail-toggle');
    if (topShelfRailToggleBtn) {
      topShelfRailToggleBtn.addEventListener('click', () => {
        setTopShelfRailCollapsed(!topShelfRailCollapsed);
      });
    }

    document.getElementById('stash-shelf-grid').addEventListener('click', async e => {
      const removeBtn = e.target.closest('[data-stash-remove]');
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        removeStashShelfEntry((removeBtn.getAttribute('data-stash-remove') || '').trim());
        return;
      }

      const activateBtn = e.target.closest('[data-stash-activate]');
      if (!activateBtn) return;
      const strain = (activateBtn.getAttribute('data-stash-activate') || '').trim();
      if (!strain) return;

      await activateShelfStrain(strain);
    });

    const topShelfRailList = document.getElementById('top-shelf-rail-list');
    if (topShelfRailList) {
      topShelfRailList.addEventListener('click', async e => {
        const removeBtn = e.target.closest('[data-top-rail-remove]');
        if (removeBtn) {
          e.preventDefault();
          e.stopPropagation();
          const strain = (removeBtn.getAttribute('data-top-rail-remove') || '').trim();
          if (!strain) return;
          removeStrainFromShelf(strain);
          renderStrainList();
          updateControlsSummary();
          return;
        }

        const chip = e.target.closest('[data-top-rail-strain]');
        if (!chip) return;
        e.preventDefault();
        const strain = (chip.getAttribute('data-top-rail-strain') || '').trim();
        if (!strain) return;
        await activateShelfStrain(strain, { closeShelf: false });
      });
    }

    document.getElementById('destination-card-list').addEventListener('click', e => {
      const actionBtn = e.target.closest('[data-card-action]');
      if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(actionBtn.getAttribute('data-card-index') || '', 10);
        if (!Number.isInteger(index) || !locations[index]) return;
        const action = actionBtn.getAttribute('data-card-action');
        if (action === 'save') {
          toggleFavouriteDestination(index);
          return;
        }
        if (action === 'directions') {
          openDirectionsForDestinationIndex(index);
          return;
        }
        if (action === 'itinerary') {
          toggleJourneyStopByIndex(index);
          return;
        }
        if (action === 'itinerary-up' || action === 'itinerary-down') {
          moveJourneyStopByLocationIndex(index, action === 'itinerary-up' ? 'up' : 'down', { fit: true });
          return;
        }
        if (action === 'details') {
          selectDestinationIndex(index);
          focusDestinationOnMap(index, {
            minZoom: isCompactMobileLayout() ? 15 : 16,
            animate: true,
            duration: 0.45
          });
          return;
        }
        if (action === 'route') {
          selectDestinationIndex(index);
          setRouteStatus(`${locations[index].name} selected as the Destination preview.`, 'good');
          return;
        }
      }
      if (e.target.closest('.destination-card-details')) return;
      const card = e.target.closest('[data-destination-card-index]');
      if (!card) return;
      const index = parseInt(card.getAttribute('data-destination-card-index') || '', 10);
      if (!Number.isInteger(index) || !locations[index]) return;
      selectDestinationIndex(index);
    });

    const bestMatchList = document.getElementById('best-match-list');
    if (bestMatchList) {
      bestMatchList.addEventListener('click', e => {
        const actionBtn = e.target.closest('[data-best-match-action]');
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          const index = parseInt(actionBtn.getAttribute('data-best-match-index') || '', 10);
          if (!Number.isInteger(index) || !locations[index]) return;
          const action = actionBtn.getAttribute('data-best-match-action');
          if (action === 'itinerary') {
            toggleJourneyStopByIndex(index);
            return;
          }
          if (action === 'directions') {
            openDirectionsForDestinationIndex(index);
            return;
          }
          selectDestinationIndex(index);
          focusDestinationOnMap(index, {
            minZoom: isCompactMobileLayout() ? 15 : 16,
            animate: true,
            duration: 0.45
          });
          return;
        }

        const card = e.target.closest('[data-best-match-index]');
        if (!card) return;
        const index = parseInt(card.getAttribute('data-best-match-index') || '', 10);
        if (!Number.isInteger(index) || !locations[index]) return;
        selectDestinationIndex(index);
      });
    }

    document.getElementById('strain-spotlight-top-shops').addEventListener('click', e => {
      const shopBtn = e.target.closest('.strain-spotlight-shop');
      if (!shopBtn) return;
      const index = parseInt(shopBtn.getAttribute('data-index') || '', 10);
      if (!Number.isInteger(index) || !locations[index]) return;
      selectDestinationIndex(index);
      focusDestinationOnMap(index, {
        minZoom: isCompactMobileLayout() ? 15 : 16,
        animate: true,
        duration: 0.45
      });
    });

    document.getElementById('strain-list-search').addEventListener('input', () => {
      renderStrainList();
    });

    document.body.addEventListener('click', async e => {
      const showOtherShopsBtn = e.target.closest('[data-popup-strain-show-shops]');
      if (showOtherShopsBtn) {
        e.preventDefault();
        e.stopPropagation();
        const strain = (showOtherShopsBtn.getAttribute('data-popup-strain-show-shops') || '').trim();
        showOtherShopsBtn.disabled = true;
        showOtherShopsBtn.setAttribute('aria-busy', 'true');
        const applied = await showOtherShopsForStrain(strain);
        if (!applied && showOtherShopsBtn.isConnected) {
          showOtherShopsBtn.disabled = false;
          showOtherShopsBtn.removeAttribute('aria-busy');
        }
        return;
      }

      const shelfBtn = e.target.closest('[data-strain-shelf-toggle]');
      if (!shelfBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const strain = (shelfBtn.getAttribute('data-strain-shelf-toggle') || '').trim();
      const popupIndex = parseInt(shelfBtn.getAttribute('data-popup-index') || '', 10);
      toggleShelfMembershipForStrain(strain, {
        popupIndex: Number.isInteger(popupIndex) ? popupIndex : null
      });
    });

    document.getElementById('strain-list').addEventListener('click', async e => {
      const target = e.target.closest('.strain-item');
      if (!target) return;
      const strain = target.getAttribute('data-strain') || '';
      await applyStrainFilter(strain);
    });

    // =========================================================
    // Destination dropdown + markers
    // =========================================================

    function getDestinationSortMode() {
      const sortSelect = document.getElementById('destination-sort');
      const value = sortSelect ? (sortSelect.value || '').toString().trim() : '';
      return value || 'best-match';
    }

    function getDestinationSortLabel() {
      const sortSelect = document.getElementById('destination-sort');
      if (!sortSelect) return 'best match';
      const opt = sortSelect.options[sortSelect.selectedIndex];
      return ((opt && opt.text) || 'Best matches').toLowerCase();
    }

    function compareOptionalNumbersAsc(a, b) {
      const aOk = Number.isFinite(a);
      const bOk = Number.isFinite(b);
      if (aOk && bOk) {
        if (Math.abs(a - b) < 0.0001) return 0;
        return a - b;
      }
      if (aOk) return -1;
      if (bOk) return 1;
      return 0;
    }

    function compareStringsAlpha(a, b) {
      return (a || '').localeCompare((b || ''), undefined, { sensitivity: 'base' });
    }

    function parsePriceAmountFromLabel(label) {
      const match = (label || '').toString().match(/(\d+(?:[.,]\d+)?)/);
      if (!match) return null;
      const amount = parseFloat(match[1].replace(',', '.'));
      return Number.isFinite(amount) ? amount : null;
    }

    const WALKING_METERS_PER_SECOND = 1.25;
    const WALKING_LEG_BUFFER_SECONDS = 45;

    function estimateWalkingSeconds(distanceMeters, legCount = 0) {
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
      const movingSeconds = distanceMeters / WALKING_METERS_PER_SECOND;
      const bufferSeconds = Math.max(0, legCount || 0) * WALKING_LEG_BUFFER_SECONDS;
      return movingSeconds + bufferSeconds;
    }

    function estimateTravelSecondsForMode(distanceMeters, mode) {
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
      if (mode === 'walking') return estimateWalkingSeconds(distanceMeters);
      if (mode === 'cycling') return distanceMeters / 4.1667;
      return distanceMeters / 9.7222;
    }

    function formatCompactDuration(totalSeconds) {
      if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
      const roundedMinutes = Math.max(1, Math.round(totalSeconds / 60));
      const hours = Math.floor(roundedMinutes / 60);
      const minutes = roundedMinutes % 60;
      if (hours > 0) {
        return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
      }
      return `${roundedMinutes}m`;
    }

    const JOURNEY_START_LANDMARKS = [
      {
        id: 'amsterdam-centraal',
        name: 'Amsterdam Centraal',
        city: 'Amsterdam',
        coords: [52.37898, 4.90031]
      }
    ];

    function getAvailableJourneyLandmarks() {
      const activeCity = normaliseText(getActiveLocationLabel(''));
      return JOURNEY_START_LANDMARKS.filter(point => (
        !activeCity || normaliseText(point.city) === activeCity
      ));
    }

    function saveSavedJourneys() {
      saveStoredJson(SAVED_JOURNEYS_STORAGE_KEYS, savedJourneys);
    }

    function getJourneyLocationRef(loc, index) {
      if (!loc) return '';
      if (Number.isFinite(loc.db_shop_id)) return `db:${loc.db_shop_id}`;
      if (loc.shop_key) return `shop:${loc.shop_key}`;
      if (Array.isArray(loc.coords)) return `coords:${loc.coords[0]}:${loc.coords[1]}:${normaliseText(loc.name || '')}`;
      const prefKey = getLocationPreferenceKey(loc);
      if (prefKey) return `pref:${prefKey}`;
      return Number.isInteger(index) ? `index:${index}` : '';
    }

    function findJourneyLocationIndexByRef(ref) {
      const value = (ref || '').toString();
      if (!value) return null;
      if (value.startsWith('db:')) {
        const id = parseInt(value.slice(3), 10);
        const index = locations.findIndex(loc => Number.isFinite(loc && loc.db_shop_id) && loc.db_shop_id === id);
        return index >= 0 ? index : null;
      }
      if (value.startsWith('shop:')) {
        const key = value.slice(5);
        const index = locations.findIndex(loc => (loc && loc.shop_key) === key);
        return index >= 0 ? index : null;
      }
      if (value.startsWith('pref:')) {
        const key = value.slice(5);
        const index = locations.findIndex(loc => getLocationPreferenceKey(loc) === key);
        return index >= 0 ? index : null;
      }
      if (value.startsWith('coords:')) {
        const [, latRaw, lngRaw, nameRaw = ''] = value.split(':');
        const lat = parseFloat(latRaw);
        const lng = parseFloat(lngRaw);
        const nameKey = normaliseText(nameRaw);
        const index = locations.findIndex(loc => {
          if (!loc || !Array.isArray(loc.coords)) return false;
          const coordsMatch = Math.abs(loc.coords[0] - lat) < 0.000001 && Math.abs(loc.coords[1] - lng) < 0.000001;
          return coordsMatch && (!nameKey || normaliseText(loc.name || '') === nameKey);
        });
        return index >= 0 ? index : null;
      }
      if (value.startsWith('index:')) {
        const index = parseInt(value.slice(6), 10);
        return Number.isInteger(index) && locations[index] ? index : null;
      }
      return null;
    }

    function getJourneyStartPoint() {
      const start = journeyPlanner.start || {};
      if (start.type === 'location') {
        const index = findJourneyLocationIndexByRef(start.ref);
        if (index !== null && locations[index]) {
          const loc = locations[index];
          return {
            type: 'location',
            index,
            label: loc.name || 'Starting point',
            city: loc.city || '',
            coords: loc.coords
          };
        }
      }
      if (start.type !== 'landmark') return null;
      const landmark = getAvailableJourneyLandmarks().find(item => item.id === start.id);
      if (!landmark) return null;
      return {
        type: 'landmark',
        id: landmark.id,
        label: landmark.name,
        city: landmark.city,
        coords: landmark.coords
      };
    }

    function getJourneyStopLocation(stop) {
      const index = findJourneyLocationIndexByRef(stop && stop.ref);
      if (index === null || !locations[index]) return null;
      return { index, loc: locations[index] };
    }

    function normaliseJourneyStops(stops) {
      const seen = new Set();
      return (Array.isArray(stops) ? stops : [])
        .map(stop => {
          const ref = (stop && stop.ref ? stop.ref : '').toString();
          const index = findJourneyLocationIndexByRef(ref);
          if (index === null || !locations[index]) return null;
          const stableRef = getJourneyLocationRef(locations[index], index);
          if (!stableRef || seen.has(stableRef)) return null;
          seen.add(stableRef);
          return {
            ref: stableRef,
            strains: isCoffeeShopLocation(locations[index])
              ? normaliseShelfStrainNames(Array.isArray(stop.strains) ? stop.strains : []).slice(0, 12)
              : []
          };
        })
        .filter(Boolean)
        .slice(0, 12);
    }

    function getJourneyLocationTypeLabel(loc) {
      return getFallbackCategoryLabel(getLocationFallbackCategory(loc));
    }

    function getJourneyLocationTypeIconForLabel(label) {
      return getCategoryIconSvg(getFallbackCategoryFromLabel(label));
    }

    function getJourneyLocationDisplay(loc, fallbackLabel = 'Location') {
      const label = loc ? getJourneyLocationTypeLabel(loc) : fallbackLabel;
      const category = loc ? getLocationFallbackCategory(loc) : getFallbackCategoryFromLabel(fallbackLabel);
      const icon = getLocationIconHtml(loc, category);
      return {
        label,
        category,
        icon: icon.html,
        hasLogo: icon.hasLogo
      };
    }

    function getJourneyDisplayName() {
      const input = document.getElementById('journey-name-input');
      const raw = ((input && input.value) || '').toString().replace(/\s+/g, ' ').trim();
      const userName = currentMapUserName();
      const locationLabel = getActiveLocationLabel();
      return raw || (userName ? `${locationLabel} day out for ${userName}` : `${locationLabel} day out`);
    }

    function getJourneyLocationOptions() {
      return locations
        .map((loc, index) => ({ loc, index }))
        .filter(item => item.loc && Array.isArray(item.loc.coords) && !isClosedLocation(item.loc))
        .sort((a, b) => compareStringsAlpha(a.loc.name, b.loc.name) || compareStringsAlpha(getJourneyLocationTypeLabel(a.loc), getJourneyLocationTypeLabel(b.loc)));
    }

    function setJourneyStatus(message, tone = '') {
      const el = document.getElementById('journey-status');
      if (!el) return;
      el.textContent = message || '';
      el.classList.remove('is-good', 'is-warn', 'is-bad');
      if (tone) el.classList.add(`is-${tone}`);
    }

    function journeySelectValueForStart(start) {
      if (!start) return '';
      if (start.type !== 'location') return start.id ? `landmark:${start.id}` : '';
      return start.ref ? `locref:${encodeURIComponent(start.ref)}` : '';
    }

    function journeySelectValueForLocation(loc, index) {
      const ref = getJourneyLocationRef(loc, index);
      return ref ? `locref:${encodeURIComponent(ref)}` : `loc:${index}`;
    }

    function readJourneyLocationSelectIndex(value) {
      const raw = (value || '').toString();
      if (!raw) return null;
      if (raw.startsWith('locref:')) {
        let ref = '';
        try {
          ref = decodeURIComponent(raw.slice(7));
        } catch (_err) {
          ref = raw.slice(7);
        }
        return findJourneyLocationIndexByRef(ref);
      }
      if (raw.startsWith('loc:')) {
        const index = parseInt(raw.slice(4), 10);
        return Number.isInteger(index) && locations[index] ? index : null;
      }
      return null;
    }

    function readJourneyPointValue(value) {
      const raw = (value || '').toString();
      if (!raw) return null;
      if (raw.startsWith('landmark:')) {
        const id = raw.slice(9);
        return getAvailableJourneyLandmarks().some(point => point.id === id)
          ? { type: 'landmark', id }
          : null;
      }
      if (raw.startsWith('loc:')) {
        const index = readJourneyLocationSelectIndex(raw);
        if (Number.isInteger(index) && locations[index]) {
          return { type: 'location', ref: getJourneyLocationRef(locations[index], index) };
        }
      }
      if (raw.startsWith('locref:')) {
        const index = readJourneyLocationSelectIndex(raw);
        if (Number.isInteger(index) && locations[index]) {
          return { type: 'location', ref: getJourneyLocationRef(locations[index], index) };
        }
      }
      return null;
    }

    function renderJourneySelects() {
      const startSelect = document.getElementById('journey-start-select');
      const stopSelect = document.getElementById('journey-stop-select');
      if (!startSelect || !stopSelect) return;

      const startValue = journeySelectValueForStart(journeyPlanner.start);
      startSelect.innerHTML = '';
      const startPlaceholder = document.createElement('option');
      startPlaceholder.value = '';
      startPlaceholder.textContent = 'Choose a start point...';
      startSelect.appendChild(startPlaceholder);
      getAvailableJourneyLandmarks().forEach(point => {
        const opt = document.createElement('option');
        opt.value = `landmark:${point.id}`;
        opt.textContent = point.name;
        startSelect.appendChild(opt);
      });
      const journeyOptions = getJourneyLocationOptions();
      const progressiveStartOptions = journeyOptions
        .filter(({ loc, index }) => {
          const ref = getJourneyLocationRef(loc, index);
          return journeyPlanner.start && journeyPlanner.start.ref === ref;
        })
        .concat(journeyOptions.slice(0, 12))
        .filter((item, itemIndex, items) => items.findIndex(candidate => candidate.index === item.index) === itemIndex);
      progressiveStartOptions.forEach(({ loc, index }) => {
        const ref = getJourneyLocationRef(loc, index);
        const opt = document.createElement('option');
        opt.value = journeySelectValueForLocation(loc, index);
        opt.dataset.locationRef = ref;
        opt.textContent = `${loc.name}${loc.city ? ` · ${loc.city}` : ''} · ${getJourneyLocationTypeLabel(loc)}`;
        startSelect.appendChild(opt);
      });
      startSelect.value = Array.from(startSelect.options).some(opt => opt.value === startValue)
        ? startValue
        : '';

      const existingRefs = new Set(journeyPlanner.stops.map(stop => stop.ref));
      const previousStopValue = stopSelect.value;
      stopSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose a mapped place...';
      stopSelect.appendChild(placeholder);
      const progressiveStopOptions = journeyOptions
        .filter(({ loc, index }) => journeyPlanner.stops.some(stop => stop.ref === getJourneyLocationRef(loc, index)))
        .concat(journeyOptions.slice(0, 12))
        .filter((item, itemIndex, items) => items.findIndex(candidate => candidate.index === item.index) === itemIndex);
      progressiveStopOptions.forEach(({ loc, index }) => {
        const ref = getJourneyLocationRef(loc, index);
        if (existingRefs.has(ref)) return;
        const opt = document.createElement('option');
        opt.value = journeySelectValueForLocation(loc, index);
        opt.dataset.locationRef = ref;
        opt.textContent = `${loc.name}${loc.city ? ` · ${loc.city}` : ''} · ${getJourneyLocationTypeLabel(loc)}`;
        stopSelect.appendChild(opt);
      });
      stopSelect.value = Array.from(stopSelect.options).some(opt => opt.value === previousStopValue)
        ? previousStopValue
        : '';
    }

    function formatJourneyDistance(meters) {
      if (!Number.isFinite(meters) || meters <= 0) return '--';
      return formatDistanceMeters(meters, 1);
    }

    function formatJourneyMoney(amount) {
      if (!Number.isFinite(amount) || amount <= 0) return '--';
      return `€${Math.round(amount)}`;
    }

    function priceAmountFromEntries(entries) {
      const amounts = (Array.isArray(entries) ? entries : [])
        .map(entry => Number(entry && entry.amount))
        .filter(value => Number.isFinite(value) && value > 0 && value <= 80)
        .sort((a, b) => a - b);
      return amounts.length ? amounts[0] : null;
    }

    function getShopAverageSpend(loc) {
      if (!isCoffeeShopLocation(loc)) return 0;
      const amounts = [];
      getPopupStrainsForLocation(loc).forEach(name => {
        const detail = getPopupStrainDetail(loc, name);
        (detail.priceEntries || []).forEach(entry => {
          const amount = Number(entry && entry.amount);
          if (Number.isFinite(amount) && amount > 0 && amount <= 80) amounts.push(amount);
        });
      });
      if (!amounts.length) return 12;
      return amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    }

    function getJourneyStopSpend(stop, loc) {
      if (!isCoffeeShopLocation(loc)) return 0;
      const strains = Array.isArray(stop.strains) ? stop.strains : [];
      if (!strains.length) return getShopAverageSpend(loc);
      return strains.reduce((sum, strain) => {
        const detail = getPopupStrainDetail(loc, strain);
        const amount = priceAmountFromEntries(detail && detail.priceEntries);
        return sum + (Number.isFinite(amount) ? amount : getShopAverageSpend(loc));
      }, 0);
    }

    function getJourneyMetrics() {
      const start = getJourneyStartPoint();
      const stops = journeyPlanner.stops
        .map(stop => ({ stop, ...getJourneyStopLocation(stop) }))
        .filter(item => item.loc && Array.isArray(item.loc.coords));
      const stopPoints = stops.map(item => ({
        type: 'stop',
        index: item.index,
        label: item.loc.name,
        city: item.loc.city || '',
        coords: item.loc.coords
      }));
      const points = start && Array.isArray(start.coords)
        ? [start, ...stopPoints].filter(point => point && Array.isArray(point.coords))
        : [];

      let distanceMeters = 0;
      const segments = [];
      for (let i = 1; i < points.length; i += 1) {
        const segmentDistance = haversineDistance(points[i - 1].coords, points[i].coords);
        const walkingSeconds = estimateWalkingSeconds(segmentDistance, 1);
        distanceMeters += segmentDistance;
        segments.push({
          from: points[i - 1],
          to: points[i],
          distanceMeters: segmentDistance,
          walkingSeconds
        });
      }

      const spend = stops.reduce((sum, item) => sum + getJourneyStopSpend(item.stop, item.loc), 0);
      const selectedStrains = journeyPlanner.stops.reduce((sum, stop) => sum + ((stop.strains || []).length), 0);
      const availableStrains = new Set();
      stops.forEach(item => {
        getPopupStrainsForLocation(item.loc).forEach(name => availableStrains.add(normaliseText(name)));
      });

      return {
        start,
        stops,
        points,
        segments,
        distanceMeters,
        walkingSeconds: segments.reduce((sum, segment) => sum + (segment.walkingSeconds || 0), 0),
        spend,
        averageSpend: stops.length ? spend / stops.length : 0,
        selectedStrains,
        availableStrainCount: availableStrains.size
      };
    }

    function renderJourneySummary(metrics) {
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      const distanceLabel = formatJourneyDistance(metrics.distanceMeters);
      const timeLabel = metrics.walkingSeconds ? formatCompactDuration(metrics.walkingSeconds) : '--';
      const spendLabel = formatJourneyMoney(metrics.spend);
      const placeCount = metrics.start ? metrics.stops.length + 1 : metrics.stops.length;
      const lastStop = metrics.stops.length ? metrics.stops[metrics.stops.length - 1].loc : null;
      const routeLabel = metrics.start && lastStop
        ? `${metrics.start.label || 'Start'} to ${lastStop.name || 'final stop'}`
        : metrics.start
          ? 'Add the places you want to visit after your start point.'
          : 'Choose a start point, then add the places you want to visit.';
      setText('journey-itinerary-title', getJourneyDisplayName());
      setText('journey-itinerary-route', routeLabel);
      setText('journey-itinerary-places', String(placeCount));
      setText('journey-itinerary-distance', distanceLabel);
      setText('journey-itinerary-time', timeLabel);
      setText('journey-itinerary-spend', spendLabel);
      setText('journey-summary-distance', distanceLabel);
      setText('journey-summary-time', timeLabel);
      setText('journey-summary-stops', String(metrics.stops.length));
      setText('journey-summary-spend', spendLabel);
      setText('journey-summary-average', formatJourneyMoney(metrics.averageSpend));
      setText('journey-summary-strains', String(metrics.selectedStrains));
      const plannerSummary = document.getElementById('journey-planner-summary-text');
      if (plannerSummary) {
        if (metrics.stops.length && metrics.start) {
          plannerSummary.textContent = [
            `${metrics.stops.length} stop${metrics.stops.length === 1 ? '' : 's'}`,
            distanceLabel !== '--' ? distanceLabel : '',
            timeLabel !== '--' ? timeLabel : ''
          ].filter(Boolean).join(' · ');
        } else if (metrics.stops.length) {
          plannerSummary.textContent = `${metrics.stops.length} stop${metrics.stops.length === 1 ? '' : 's'} added · choose a start`;
        } else if (metrics.start) {
          plannerSummary.textContent = 'Start chosen · add your first stop';
        } else {
          plannerSummary.textContent = 'Choose a start and add your first stop.';
        }
      }

      const distanceEl = document.getElementById('distance-info');
      const timeEl = document.getElementById('time-estimate');
      if (distanceEl) distanceEl.textContent = distanceLabel;
      if (timeEl) timeEl.textContent = timeLabel;
    }

    function formatJourneySegment(segment) {
      if (!segment) return '';
      const distance = formatJourneyDistance(segment.distanceMeters);
      const time = segment.walkingSeconds ? formatCompactDuration(segment.walkingSeconds) : '';
      return [distance, time].filter(Boolean).join(' • ');
    }

    function renderJourneyTimeline(metrics) {
      const timeline = document.getElementById('journey-timeline');
      if (!timeline) return;
      const hasStart = !!(metrics.start && Array.isArray(metrics.start.coords));
      const segmentHtml = index => {
        if (!hasStart) return '';
        return `<div class="journey-segment" aria-hidden="true"><span class="journey-segment-arrow">↓</span></div>`;
      };
      const startHtml = hasStart
        ? (
          (() => {
            const startLoc = Number.isInteger(metrics.start.index) ? locations[metrics.start.index] : null;
            const startDisplay = startLoc
              ? getJourneyLocationDisplay(startLoc)
              : getJourneyLocationDisplay(null, metrics.start.type === 'landmark' ? 'Transport' : 'Start');
            return (
          `<article class="journey-stop-card">` +
            `<div class="journey-stop-main">` +
	              `<span class="journey-stop-number is-start">Start</span>` +
	              `<span class="journey-location-icon is-${escapeHtmlAttr(startDisplay.category)}${startDisplay.hasLogo ? ' has-logo' : ''}" aria-hidden="true">${startDisplay.icon}</span>` +
	              `<span class="journey-stop-copy">` +
	                `<span class="journey-stop-role">Start location</span>` +
	                `<strong>${escapeHtml(metrics.start.label || 'Starting point')}</strong>` +
	                `<span>${escapeHtml(metrics.start.city || getActiveLocationLabel())}</span>` +
	                `<span class="journey-stop-type">${escapeHtml(startDisplay.label)}</span>` +
              `</span>` +
            `</div>` +
            `<div class="journey-stop-actions journey-start-actions">` +
              `<button type="button" class="secondary-btn" data-journey-clear-start>Remove start location</button>` +
            `</div>` +
          `</article>`
            );
          })()
        )
        : (
          `<article class="journey-stop-card">` +
          `<div class="journey-stop-main">` +
	            `<span class="journey-stop-number is-start">Start</span>` +
	            `<span class="journey-location-icon is-other" aria-hidden="true">${getCategoryIconSvg('other')}</span>` +
	            `<span class="journey-stop-copy">` +
	              `<span class="journey-stop-role">Start location</span>` +
	              `<strong>Choose a start point</strong>` +
	              `<span>Select one above, or use Set route start from a map card.</span>` +
	              `<span class="journey-stop-type">Start point</span>` +
            `</span>` +
          `</div>` +
        `</article>`
        );
      if (!metrics.stops.length) {
        timeline.innerHTML = startHtml + '<p class="journey-empty">Add mapped places you want to visit. Strains are optional at coffeeshop stops.</p>';
        return;
      }

      timeline.innerHTML = startHtml + metrics.stops.map((item, idx) => {
        const stop = item.stop;
        const loc = item.loc;
        const strains = getPopupStrainsForLocation(loc);
        const selected = Array.isArray(stop.strains) ? stop.strains : [];
        const isShop = isCoffeeShopLocation(loc);
        const isEnd = idx === metrics.stops.length - 1;
        const display = getJourneyLocationDisplay(loc);
        const legLabel = formatJourneySegment((metrics.segments || [])[idx]);
        const spendAmount = getJourneyStopSpend(stop, loc);
        const spendLabel = Number.isFinite(spendAmount) && spendAmount > 0 ? formatJourneyMoney(spendAmount) : '';
        const roleLabel = isEnd ? 'End location' : `Stop ${idx + 1}`;
        const metaBits = [
          loc.city || getActiveLocationLabel(),
          display.label,
          selected.length ? `${selected.length} selected strain${selected.length === 1 ? '' : 's'}` : '',
          spendLabel ? `${spendLabel} estimated spend` : ''
        ].filter(Boolean);
        const strainOptions = strains
          .filter(name => !selected.some(entry => normaliseText(entry) === normaliseText(name)))
          .map(name => `<option value="${escapeHtmlAttr(name)}">${escapeHtml(name)}</option>`)
          .join('');
        const chips = selected.length
          ? selected.map(name => (
              `<span class="journey-strain-chip">` +
                `${escapeHtml(name)}` +
                `<button type="button" data-journey-remove-strain="${idx}" data-strain="${escapeHtmlAttr(name)}" aria-label="Remove ${escapeHtmlAttr(name)}">×</button>` +
              `</span>`
            )).join('')
          : `<span class="field-note">${isShop ? 'No strains selected for this stop.' : 'Strain selection is only available for matched coffeeshop menu data.'}</span>`;
        return (
          segmentHtml(idx) +
          `<article class="journey-stop-card" data-journey-stop="${idx}">` +
            `<div class="journey-stop-main">` +
	              `<span class="journey-stop-number${isEnd ? ' is-end' : ''}">${idx + 1}</span>` +
	              `<span class="journey-location-icon is-${escapeHtmlAttr(display.category)}${display.hasLogo ? ' has-logo' : ''}" aria-hidden="true">${display.icon}</span>` +
	              `<span class="journey-stop-copy">` +
	                `<span class="journey-stop-role">${escapeHtml(roleLabel)}</span>` +
	                `<strong>${escapeHtml(loc.name || 'Location')}</strong>` +
	                `<span>${escapeHtml(metaBits.join(' · '))}</span>` +
	                `${legLabel ? `<span class="journey-stop-leg">From previous: ${escapeHtml(legLabel)}</span>` : ''}` +
	                `<span class="journey-stop-type">${escapeHtml(display.label)}</span>` +
	              `</span>` +
            `</div>` +
            `<div class="journey-stop-actions">` +
              `<button type="button" class="secondary-btn journey-order-btn" data-journey-move="up" data-stop-index="${idx}" aria-label="Move ${escapeHtmlAttr(loc.name || 'place')} earlier" title="Move earlier" ${idx === 0 ? 'disabled' : ''}>↑</button>` +
              `<button type="button" class="secondary-btn journey-order-btn" data-journey-move="down" data-stop-index="${idx}" aria-label="Move ${escapeHtmlAttr(loc.name || 'place')} later" title="Move later" ${idx === metrics.stops.length - 1 ? 'disabled' : ''}>↓</button>` +
              `<button type="button" class="secondary-btn" data-journey-focus="${idx}">View</button>` +
              `<button type="button" class="secondary-btn" data-journey-remove-stop="${idx}">Remove</button>` +
            `</div>` +
            `<div class="journey-strain-row">` +
              `<select data-journey-strain-select="${idx}" aria-label="Optional strain for ${escapeHtmlAttr(loc.name || 'stop')}" ${isShop && strainOptions ? '' : 'disabled'}>` +
                `<option value="">${isShop ? (strainOptions ? 'Optional strain...' : 'No menu strains found') : 'Not a coffeeshop stop'}</option>` +
                `${strainOptions}` +
              `</select>` +
              `<button type="button" class="secondary-btn" data-journey-add-strain="${idx}" ${isShop && strainOptions ? '' : 'disabled'}>Add strain</button>` +
            `</div>` +
            `<div class="journey-strain-chips">${chips}</div>` +
          `</article>`
        );
      }).join('');
    }

    function renderSavedJourneySelect() {
      const select = document.getElementById('journey-saved-select');
      if (!select) return;
      const previous = select.value;
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = savedJourneys.length ? 'Choose saved route...' : 'No saved routes yet';
      select.appendChild(placeholder);
      savedJourneys.forEach(journey => {
        const opt = document.createElement('option');
        opt.value = journey.id;
        opt.textContent = journey.name || 'Saved route';
        select.appendChild(opt);
      });
      select.value = Array.from(select.options).some(opt => opt.value === previous) ? previous : '';
    }

    function getBearingDegrees(fromCoords, toCoords) {
      if (!Array.isArray(fromCoords) || !Array.isArray(toCoords)) return 0;
      const lat1 = fromCoords[0] * Math.PI / 180;
      const lat2 = toCoords[0] * Math.PI / 180;
      const deltaLng = (toCoords[1] - fromCoords[1]) * Math.PI / 180;
      const y = Math.sin(deltaLng) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function cardinalDirectionLabel(degrees) {
      const labels = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const index = Math.round((((Number(degrees) % 360) + 360) % 360) / 45) % labels.length;
      return labels[index];
    }

    function buildExternalDirectionsUrl(fromCoords, toCoords, mode) {
      if (!Array.isArray(fromCoords) || !Array.isArray(toCoords)) return '';
      const travelMode = mode === 'cycling' ? 'bicycling' : (mode === 'driving' ? 'driving' : 'walking');
      const params = new URLSearchParams({
        api: '1',
        origin: `${fromCoords[0]},${fromCoords[1]}`,
        destination: `${toCoords[0]},${toCoords[1]}`,
        travelmode: travelMode
      });
      return `https://www.google.com/maps/dir/?${params.toString()}`;
    }

    function midpointCoords(fromCoords, toCoords) {
      return [
        (fromCoords[0] + toCoords[0]) / 2,
        (fromCoords[1] + toCoords[1]) / 2
      ];
    }

    function createJourneyMarkerIcon(label, className = '') {
      return L.divIcon({
        className: `journey-map-marker-icon ${className}`.trim(),
        html: `<span class="journey-map-marker ${className}">${escapeHtml(label)}</span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        tooltipAnchor: [0, -22]
      });
    }

    function createJourneyArrowIcon(rotation) {
      return L.divIcon({
        className: 'journey-map-arrow-icon',
        html: `<span class="journey-map-arrow" style="transform: rotate(${Math.round(rotation)}deg);">↑</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
    }

    function getJourneyNodePopupHtml(point, pointIndex, metrics) {
      const safeLabel = escapeHtml(point && point.label ? point.label : 'Route point');
      const safeCity = escapeHtml(point && point.city ? point.city : getActiveLocationLabel());
      if (pointIndex === 0) {
        return (
          `<div class="journey-node-popup">` +
            `<strong>Start: ${safeLabel}</strong>` +
            `<span>${safeCity}</span>` +
            `<div class="journey-node-actions">` +
              `<button type="button" data-journey-clear-start>Clear start</button>` +
            `</div>` +
          `</div>`
        );
      }

      const stopIndex = pointIndex - 1;
      const stopCount = Array.isArray(metrics && metrics.stops) ? metrics.stops.length : 0;
      return (
        `<div class="journey-node-popup">` +
          `<strong>Stop ${pointIndex}: ${safeLabel}</strong>` +
          `<span>${safeCity}</span>` +
          `<div class="journey-node-actions">` +
            `<button type="button" data-journey-node-move="up" data-stop-index="${stopIndex}" ${stopIndex <= 0 ? 'disabled' : ''}>↑ Earlier</button>` +
            `<button type="button" data-journey-node-move="down" data-stop-index="${stopIndex}" ${stopIndex >= stopCount - 1 ? 'disabled' : ''}>↓ Later</button>` +
            `<button type="button" data-journey-node-remove="${stopIndex}">Remove from route</button>` +
          `</div>` +
        `</div>`
      );
    }

    function updateJourneyMapOverlay(metrics = getJourneyMetrics(), options = {}) {
      if (!map || typeof L === 'undefined') return;
      if (journeyLayerGroup) {
        journeyLayerGroup.remove();
        journeyLayerGroup = null;
      }
      const points = metrics.points || [];
      if (points.length < 1) return;
      journeyLayerGroup = L.layerGroup().addTo(map);
      const latLngs = points.map(point => L.latLng(point.coords[0], point.coords[1]));
      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color: '#fffdf7',
          weight: 12,
          opacity: 0.92,
          dashArray: '12 10',
          className: 'journey-map-line'
        }).addTo(journeyLayerGroup);
        L.polyline(latLngs, {
          color: '#184e39',
          weight: 7,
          opacity: 0.98,
          dashArray: '12 10',
          className: 'journey-map-line'
        }).addTo(journeyLayerGroup);
      }
      points.forEach((point, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === points.length - 1 && idx > 0;
        const label = isStart ? 'Start' : String(idx);
        L.marker(point.coords, {
          icon: createJourneyMarkerIcon(label, isStart ? 'is-start' : (isEnd ? 'is-end' : '')),
          zIndexOffset: 2600 + idx
        })
          .bindTooltip(`${label}: ${point.label}`, { permanent: false, direction: 'top' })
          .bindPopup(getJourneyNodePopupHtml(point, idx, metrics), {
            closeButton: true,
            autoPan: true,
            className: 'journey-node-leaflet-popup'
          })
          .addTo(journeyLayerGroup);
      });
      (metrics.segments || []).forEach(segment => {
        if (!segment || !segment.from || !segment.to) return;
        const middle = midpointCoords(segment.from.coords, segment.to.coords);
        const bearing = getBearingDegrees(segment.from.coords, segment.to.coords);
        L.marker(middle, {
          icon: createJourneyArrowIcon(bearing),
          interactive: false,
          keyboard: false,
          zIndexOffset: 2500
        }).addTo(journeyLayerGroup);
      });
      if (options.fit && latLngs.length) {
        const bounds = L.latLngBounds(latLngs);
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
      }
    }

    function getJourneyStopIndexByLocationIndex(index) {
      if (!Number.isInteger(index) || !locations[index]) return -1;
      const ref = getJourneyLocationRef(locations[index], index);
      return journeyPlanner.stops.findIndex(stop => stop && stop.ref === ref);
    }

    function isLocationInItinerary(index) {
      return getJourneyStopIndexByLocationIndex(index) >= 0;
    }

    function syncItineraryActionButtons() {
      document.querySelectorAll('.popup-journey-add-btn').forEach(btn => {
        const index = parseInt(btn.getAttribute('data-index') || '', 10);
        const stopIndex = getJourneyStopIndexByLocationIndex(index);
        const inItinerary = stopIndex >= 0;
        btn.textContent = inItinerary ? 'Remove Stop' : 'Add Stop';
        btn.classList.toggle('is-remove', inItinerary);
        btn.setAttribute('aria-pressed', inItinerary ? 'true' : 'false');
      });
      document.querySelectorAll('[data-popup-journey-order]').forEach(group => {
        const index = parseInt(group.getAttribute('data-popup-journey-order') || '', 10);
        const stopIndex = getJourneyStopIndexByLocationIndex(index);
        const inItinerary = stopIndex >= 0;
        group.hidden = !inItinerary;
        group.querySelectorAll('[data-popup-journey-move]').forEach(btn => {
          const direction = btn.getAttribute('data-popup-journey-move');
          btn.disabled = !inItinerary ||
            (direction === 'up' && stopIndex <= 0) ||
            (direction === 'down' && stopIndex >= journeyPlanner.stops.length - 1);
        });
      });
    }

    function moveJourneyStopAtIndex(stopIndex, direction, options = {}) {
      const offset = direction === 'up' ? -1 : 1;
      const nextIndex = stopIndex + offset;
      if (!Number.isInteger(stopIndex) || !journeyPlanner.stops[stopIndex] || !journeyPlanner.stops[nextIndex]) {
        return false;
      }
      [journeyPlanner.stops[stopIndex], journeyPlanner.stops[nextIndex]] = [journeyPlanner.stops[nextIndex], journeyPlanner.stops[stopIndex]];
      renderJourneyPlanner({ fit: options.fit !== false });
      setJourneyStatus('Place order updated.', 'good');
      return true;
    }

    function moveJourneyStopByLocationIndex(index, direction, options = {}) {
      const stopIndex = getJourneyStopIndexByLocationIndex(index);
      if (stopIndex < 0) {
        if (Number.isInteger(index) && locations[index]) {
          setJourneyStatus(`${locations[index].name} is not in your route yet.`, 'warn');
        }
        return false;
      }
      return moveJourneyStopAtIndex(stopIndex, direction, options);
    }

    function clearJourneyStart(options = {}) {
      if (!journeyPlanner.start) return false;
      journeyPlanner.start = null;
      renderJourneyPlanner({ fit: options.fit === true });
      setJourneyStatus('Route start cleared. Choose a new start point when you are ready.', 'good');
      return true;
    }

    function renderJourneyPlanner(options = {}) {
      journeyPlanner.stops = normaliseJourneyStops(journeyPlanner.stops);
      renderJourneySelects();
      const metrics = getJourneyMetrics();
      renderJourneySummary(metrics);
      renderJourneyTimeline(metrics);
      renderSavedJourneySelect();
      updateJourneyMapOverlay(metrics, options);
      if (metrics.points.length > 1) {
        setJourneyStatus('Route distance is measured as the crow flies between each stop.', 'good');
      }
      syncItineraryActionButtons();
      refreshDestinationCards();
      updateControlsSummary();
    }

    function removeJourneyStopAtIndex(stopIndex, options = {}) {
      if (!Number.isInteger(stopIndex) || !journeyPlanner.stops[stopIndex]) return false;
      const item = journeyPlanner.stops[stopIndex];
      const location = getJourneyStopLocation(item);
      journeyPlanner.stops.splice(stopIndex, 1);
      renderJourneyPlanner({ fit: options.fit !== false });
      setJourneyStatus(`${location && location.loc ? location.loc.name : 'Place'} removed from your route.`, 'good');
      return true;
    }

    function addJourneyStopByIndex(index) {
      if (!Number.isInteger(index) || !locations[index]) return false;
      const ref = getJourneyLocationRef(locations[index], index);
      if (getJourneyStopIndexByLocationIndex(index) >= 0) {
        setJourneyStatus(`${locations[index].name} is already in this route.`, 'warn');
        return false;
      }
      journeyPlanner.stops.push({ ref, strains: [] });
      openRouteTools();
      setJourneyStatus(`${locations[index].name} added to your route.`, 'good');
      renderJourneyPlanner({ fit: true });
      return true;
    }

    function toggleJourneyStopByIndex(index) {
      const stopIndex = getJourneyStopIndexByLocationIndex(index);
      if (stopIndex >= 0) return removeJourneyStopAtIndex(stopIndex, { fit: true });
      return addJourneyStopByIndex(index);
    }

    function setJourneyStartFromLocationIndex(index, options = {}) {
      if (!Number.isInteger(index) || !locations[index]) return false;
      journeyPlanner.start = {
        type: 'location',
        ref: getJourneyLocationRef(locations[index], index)
      };
      openRouteTools();
      renderJourneyPlanner({ fit: options.fit !== false && journeyPlanner.stops.length > 0 });
      setJourneyStatus(`${locations[index].name || 'Location'} set as route start.`, 'good');
      return true;
    }

    function saveCurrentJourney() {
      const input = document.getElementById('journey-name-input');
      const name = ((input && input.value) || '').toString().replace(/\s+/g, ' ').trim();
      if (!name) {
        setJourneyStatus('Name the route before saving it.', 'warn');
        if (input) input.focus();
        return;
      }
      if (!journeyPlanner.stops.length) {
        setJourneyStatus('Add at least one place before saving.', 'warn');
        return;
      }
      if (!getJourneyStartPoint()) {
        setJourneyStatus('Choose a start point before saving.', 'warn');
        return;
      }
      const id = `journey-${Date.now()}`;
      const payload = {
        id,
        name,
        start: journeyPlanner.start,
        stops: normaliseJourneyStops(journeyPlanner.stops),
        savedAt: new Date().toISOString()
      };
      savedJourneys = [payload, ...savedJourneys.filter(item => item.name !== name)].slice(0, 12);
      saveSavedJourneys();
      renderSavedJourneySelect();
      const select = document.getElementById('journey-saved-select');
      if (select) select.value = id;
      setJourneyStatus(`${name} saved on this device.`, 'good');
    }

    function loadSelectedJourney() {
      const select = document.getElementById('journey-saved-select');
      const id = select ? select.value : '';
      const saved = savedJourneys.find(item => item.id === id);
      if (!saved) {
        setJourneyStatus('Choose a saved route to load.', 'warn');
        return;
      }
      journeyPlanner = {
        start: saved.start || null,
        stops: normaliseJourneyStops(saved.stops)
      };
      const input = document.getElementById('journey-name-input');
      if (input) input.value = saved.name || '';
      renderJourneyPlanner({ fit: true });
      setJourneyStatus(`${saved.name || 'Saved route'} loaded.`, 'good');
    }

    function deleteSelectedJourney() {
      const select = document.getElementById('journey-saved-select');
      const id = select ? select.value : '';
      const saved = savedJourneys.find(item => item.id === id);
      if (!saved) {
        setJourneyStatus('Choose a saved route to delete.', 'warn');
        return;
      }
      savedJourneys = savedJourneys.filter(item => item.id !== id);
      saveSavedJourneys();
      renderSavedJourneySelect();
      setJourneyStatus(`${saved.name || 'Saved route'} deleted from this device.`, 'good');
    }

    function buildDestinationItems() {
      const modeSelect = document.getElementById('mode');
      const mode = modeSelect ? (modeSelect.value || 'walking') : 'walking';
      const modeLabel = modeSelect && modeSelect.options[modeSelect.selectedIndex]
        ? modeSelect.options[modeSelect.selectedIndex].text
        : 'Walking';
      const originInfo = getExplorationOriginInfo();
      const items = locations
        .map((loc, index) => {
          if (!passesCategoryFilter(loc, index)) return null;

          const distanceMeters = originInfo && originInfo.coords
            ? haversineDistance(originInfo.coords, loc.coords)
            : null;
          const etaLabel = formatCompactDuration(estimateTravelSecondsForMode(distanceMeters, mode));
          const priceLabel = getMarkerPriceLabel(loc);
          const rating = Number.isFinite(loc.rating) ? Math.max(0, Math.min(5, Math.round(loc.rating))) : 0;
          const updatedAt = getPopupMenuUpdatedAt(loc);
          const savedMatches = getSavedStrainMatchesForLocation(loc);
          const priceInsight = getPriceInsightForLocation(loc, priceLabel);
          const confidence = getConfidenceInfo(loc);

          return {
            index,
            loc,
            name: loc.name || 'Unknown Destination',
            city: loc.city || inferCityFromCsvPath(currentCsvPath) || '',
            originInfo,
            distanceMeters,
            distText: Number.isFinite(distanceMeters) ? formatDistanceMeters(distanceMeters) : '',
            etaLabel,
            travelModeLabel: modeLabel,
            isFav: favorites.includes(index),
            isCheapest: isLocationCheapestForActiveStrain(loc),
            priceLabel,
            priceAmount: parsePriceAmountFromLabel(priceLabel),
            priceInsight,
            updatedAt,
            freshnessLabel: formatFreshnessLabel(updatedAt),
            freshnessTone: freshnessTone(updatedAt),
            confidence,
            savedMatches,
            sourceLabel: getLocationSourceLabel(loc),
            strainCount: getPopupStrainsForLocation(loc).length,
            hasSourceImage: !!getShopSourceImageUrl(loc),
            rating,
            visited: !!loc.visited,
            isClosest: false
          };
        })
        .filter(Boolean);

      const minDistance = items.reduce((min, item) => {
        if (!Number.isFinite(item.distanceMeters)) return min;
        if (originInfo && originInfo.type === 'selected' && item.index === originInfo.index) return min;
        return Math.min(min, item.distanceMeters);
      }, Infinity);

      items.forEach(item => {
        item.isClosest = Number.isFinite(minDistance) && Number.isFinite(item.distanceMeters)
          ? Math.abs(item.distanceMeters - minDistance) < 0.5
          : false;
      });

      return items;
    }

    function sortDestinationItems(items) {
      const sortMode = getDestinationSortMode();
      return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
        const alpha = compareStringsAlpha(a.name, b.name) || compareStringsAlpha(a.city, b.city);
        const byFavourite = a.isFav === b.isFav ? 0 : (a.isFav ? -1 : 1);
        const byCheapest = a.isCheapest === b.isCheapest ? 0 : (a.isCheapest ? -1 : 1);
        const byClosest = compareOptionalNumbersAsc(a.distanceMeters, b.distanceMeters);
        const byPrice = compareOptionalNumbersAsc(a.priceAmount, b.priceAmount);
        const byRating = b.rating - a.rating;

        if (sortMode === 'cheapest') {
          return byCheapest || byPrice || byClosest || byFavourite || alpha;
        }
        if (sortMode === 'closest') {
          return byClosest || byCheapest || byFavourite || byRating || alpha;
        }
        if (sortMode === 'best-rated') {
          return byRating || byFavourite || byCheapest || byClosest || alpha;
        }
        if (sortMode === 'alphabetical') {
          return alpha || byCheapest || byFavourite;
        }

        if (strainFilterText) {
          return byCheapest || byPrice || byFavourite || byClosest || byRating || alpha;
        }
        return byFavourite || byClosest || byRating || alpha;
      });
    }

    function renderDestinationCards(items) {
      const pickerWrap = document.getElementById('destination-picker-wrap');
      const cardDeck = document.getElementById('destination-card-deck');
      const titleEl = document.getElementById('destination-card-title');
      const statusEl = document.getElementById('destination-card-status');
      const listEl = document.getElementById('destination-card-list');
      if (!pickerWrap || !cardDeck || !titleEl || !statusEl || !listEl) return;

      const selectedIndex = getSelectedDestinationIndex();
      const hasSelectedOrigin = selectedIndex !== null && !!locations[selectedIndex];
      const activeName = getCanonicalStrainName(strainFilterText) || strainFilterText;
      const showCards = !!activeName || hasSelectedOrigin || nearbyExploreActive;
      pickerWrap.style.display = showCards ? 'none' : 'block';

      if (!showCards) {
        cardDeck.style.display = 'none';
        listEl.innerHTML = '';
        return;
      }

      cardDeck.style.display = 'block';
      titleEl.textContent = activeName
        ? `Best matches for ${activeName}`
        : (hasSelectedOrigin ? `Nearby from ${locations[selectedIndex].name}` : 'Nearby places');

      const displayItems = hasSelectedOrigin
        ? items.filter(item => item.index !== selectedIndex)
        : items;

      if (!displayItems.length) {
        statusEl.textContent = activeName
          ? `No visible shops are carrying ${activeName} under the current filters.`
          : 'No nearby places match the current filters yet.';
        listEl.innerHTML = '<p class="destination-card-empty">Try clearing a filter, searching a different strain, or setting a different Starting point.</p>';
        return;
      }

      statusEl.textContent = activeName
        ? `${displayItems.length} visible Destination${displayItems.length === 1 ? '' : 's'} carrying ${activeName}, sorted by ${getDestinationSortLabel()}.`
        : `${displayItems.length} possible Destination${displayItems.length === 1 ? '' : 's'}, sorted by ${getDestinationSortLabel()}.`;
      listEl.innerHTML = displayItems.map(item => {
        const whyReasons = buildDestinationWhyReasons(item, activeName);
        const matchNames = activeName
          ? [activeName]
          : (Array.isArray(item.savedMatches) ? item.savedMatches : []);
        const visibleMatches = matchNames.slice(0, 3);
        const extraMatchCount = Math.max(0, matchNames.length - visibleMatches.length);
        const matchLabel = activeName || item.savedMatches.length
          ? (item.savedMatches.length > 1 ? 'Strong match' : 'Saved match')
          : (item.isClosest ? 'Nearby option' : 'Possible match');
        const distanceLabel = item.etaLabel
          ? `${item.etaLabel} direct ${item.travelModeLabel.toLowerCase()} estimate`
          : (item.distText ? `${item.distText} direct` : 'Direct distance unknown');
        const compactMeta = [matchLabel, distanceLabel].filter(Boolean).join(' · ');
        const matchesHtml = visibleMatches.length
          ? `Matches: ${visibleMatches.map(name => `<strong>${escapeHtml(name)}</strong>`).join(', ')}${extraMatchCount ? ` <span>+${extraMatchCount} more</span>` : ''}`
          : (item.strainCount ? `${item.strainCount} listed strain${item.strainCount === 1 ? '' : 's'} to check` : 'No saved strains matched yet');
        const recommendedLine = whyReasons[0]
          ? whyReasons[0]
          : 'Worth checking, but menu data may have changed.';
        const priceLabel = item.priceLabel || (item.priceInsight && item.priceInsight.label) || 'Price unknown';
        const priceKnown = priceLabel !== 'Price unknown';
        const detailBadges = [
          `<span class="destination-card-badge ${priceKnown ? 'is-deal' : 'is-confidence-unknown'}">${priceKnown ? 'Price known' : 'Price unknown'}</span>`,
          item.freshnessLabel ? `<span class="destination-card-badge is-freshness-${escapeHtmlAttr(item.freshnessTone)}">${escapeHtml(item.freshnessLabel)}</span>` : '<span class="destination-card-badge is-confidence-unknown">Unknown</span>',
          item.confidence && item.confidence.label ? `<span class="destination-card-badge is-confidence-${escapeHtmlAttr(item.confidence.tone)}">${escapeHtml(item.confidence.label)}</span>` : '<span class="destination-card-badge is-confidence-unknown">Possible match</span>',
          '<span class="destination-card-badge is-confidence-low">Check before travelling</span>'
        ];
        const detailBits = [
          priceLabel ? `<span>Price signal: <strong>${escapeHtml(priceLabel)}</strong></span>` : '',
          item.distText ? `<span>Direct distance: <strong>${escapeHtml(item.distText)}</strong></span>` : '',
          item.etaLabel ? `<span>Direct walking estimate: <strong>${escapeHtml(item.etaLabel)}</strong></span>` : '',
          item.sourceLabel ? `<span>Source: ${escapeHtml(item.sourceLabel)}</span>` : '',
          item.rating > 0 ? `<span>${escapeHtml(renderStars(item.rating))}</span>` : '',
          item.isFav ? '<span>Saved shops</span>' : '',
          item.visited ? '<span>Visited before</span>' : ''
        ].filter(Boolean);
        const allMatchHtml = matchNames.length
          ? matchNames.map(name => `<span class="destination-card-chip">${escapeHtml(name)}</span>`).join('')
          : '<span class="destination-card-chip">No saved strains matched yet</span>';
        const inItinerary = !!item.inItinerary;
        const itineraryStopIndex = Number.isInteger(item.itineraryStopIndex) ? item.itineraryStopIndex : -1;
        const itineraryActionText = inItinerary ? 'Remove Stop' : 'Add Stop';
        const itineraryOrderHtml = inItinerary
          ? (
              `<span class="destination-card-order">` +
                `<button type="button" class="destination-card-action" data-card-action="itinerary-up" data-card-index="${item.index}" aria-label="Move ${escapeHtmlAttr(item.name || 'place')} earlier in itinerary" title="Move earlier" ${itineraryStopIndex <= 0 ? 'disabled' : ''}>−</button>` +
                `<button type="button" class="destination-card-action" data-card-action="itinerary-down" data-card-index="${item.index}" aria-label="Move ${escapeHtmlAttr(item.name || 'place')} later in itinerary" title="Move later" ${itineraryStopIndex >= journeyPlanner.stops.length - 1 ? 'disabled' : ''}>+</button>` +
              `</span>`
            )
          : '';

        return (
          `<article class="destination-card${item.isSelected ? ' is-selected' : ''}${item.isCheapest ? ' is-cheapest' : ''}" data-destination-card-index="${item.index}">` +
            `<div class="destination-card-body">` +
              `<span class="destination-card-main">` +
                `<span class="destination-card-copy">` +
                  `<span class="destination-card-name">${escapeHtml(item.name)}</span>` +
                  `<span class="destination-card-city">${escapeHtml(compactMeta)}</span>` +
                `</span>` +
                `<span class="destination-card-badge is-selected">${escapeHtml(matchLabel)}</span>` +
              `</span>` +
              `<span class="destination-card-matches">${matchesHtml}</span>` +
              `<span class="destination-card-why"><strong>Recommended because:</strong><span>${escapeHtml(recommendedLine)}</span></span>` +
            `</div>` +
            `<button type="button" class="destination-card-action is-primary" data-card-action="route" data-card-index="${item.index}">${item.isSelected ? 'Current Destination' : 'Set as Destination'}</button>` +
            `<details class="destination-card-details">` +
              `<summary>More details</summary>` +
              `<div class="destination-card-detail-body">` +
                `<div class="destination-card-badges">${detailBadges.join('')}</div>` +
                `<div class="destination-card-match-list">${allMatchHtml}</div>` +
                `${detailBits.length ? `<div class="destination-card-meta">${detailBits.join('')}</div>` : ''}` +
                `<span class="destination-card-actions">` +
                  `<button type="button" class="destination-card-action${inItinerary ? ' is-remove' : ''}" data-card-action="itinerary" data-card-index="${item.index}" aria-pressed="${inItinerary ? 'true' : 'false'}">${itineraryActionText}</button>` +
                  itineraryOrderHtml +
                  `<button type="button" class="destination-card-action" data-card-action="save" data-card-index="${item.index}">${item.isFav ? 'Saved shops' : 'Save shop'}</button>` +
                  `<button type="button" class="destination-card-action" data-card-action="directions" data-card-index="${item.index}">Direct distance</button>` +
                  `<button type="button" class="destination-card-action" data-card-action="details" data-card-index="${item.index}">View on map</button>` +
                `</span>` +
              `</div>` +
            `</details>` +
          `</article>`
        );
      }).join('');
    }

    function hasBestMatchContext() {
      const activeCategories = Array.isArray(selectedCategories) ? selectedCategories : [];
      const defaultCategories = getDefaultLocationCategories();
      const isDefaultCategoryView = activeCategories.length === defaultCategories.length &&
        activeCategories.every(category => defaultCategories.includes(category));
      const hasFocusedCategory = activeCategories.length > 0 &&
        !activeCategories.includes('all') &&
        !isDefaultCategoryView;
      return !!(
        (locationSearchText || '').trim() ||
        (strainFilterText || '').trim() ||
        hasExplorerFocus() ||
        nearbyExploreActive ||
        missionMode !== 'free-roam' ||
        hasFocusedCategory ||
        getSelectedDestinationIndex() !== null
      );
    }

    function getBestMatchSummary(items) {
      const count = Array.isArray(items) ? items.length : 0;
      if (!hasBestMatchContext()) {
        return 'Search for a strain, shop, or area to see suggested stops.';
      }
      if (!count) {
        return 'No visible stops match the current search or filters.';
      }
      if ((strainFilterText || '').trim()) {
        return `${count} visible stop${count === 1 ? '' : 's'} match ${strainFilterText}.`;
      }
      if ((locationSearchText || '').trim()) {
        return `${count} visible stop${count === 1 ? '' : 's'} match "${locationSearchText}".`;
      }
      return `${count} visible stop${count === 1 ? '' : 's'} match the current filters.`;
    }

    function buildBestMatchReason(item) {
      const activeName = getCanonicalStrainName(strainFilterText) || strainFilterText;
      if (offeringAttributeFilterKind === 'grower') {
        return `Lists products from ${offeringAttributeFilterValue}; check before travelling.`;
      }
      if (offeringAttributeFilterKind === 'legal') {
        return 'Lists a Legal-project product; check the current menu before travelling.';
      }
      if (activeName) {
        if (item.isCheapest && item.priceLabel) return `Good price signal for ${activeName}: ${item.priceLabel}.`;
        if (item.priceLabel) return `Matches ${activeName}; last seen at ${item.priceLabel}.`;
        return `Matches ${activeName}; check before travelling.`;
      }
      if ((locationSearchText || '').trim()) {
        return `Matches your search for "${locationSearchText}".`;
      }
      if (item.savedMatches && item.savedMatches.length) {
        return `Matches ${item.savedMatches.slice(0, 2).join(', ')} from saved strains.`;
      }
      if (item.isClosest && item.distText) {
        return `Closest visible option at ${item.distText}.`;
      }
      if (item.priceInsight && item.priceInsight.tone === 'deal') {
        return item.priceInsight.text || 'Useful price signal where data is available.';
      }
      return 'Useful visible stop from the current map filters.';
    }

    function renderBestMatches(items) {
      const listEl = document.getElementById('best-match-list');
      const summaryEl = document.getElementById('best-match-summary');
      if (!listEl || !summaryEl) return;

      const coffeeItems = (Array.isArray(items) ? items : [])
        .filter(item => item && locations[item.index] && isCoffeeShopLocation(locations[item.index]));
      const displayLimit = isCompactMobileLayout() ? 6 : 10;
      const displayItems = coffeeItems.slice(0, displayLimit);
      const baseSummary = getBestMatchSummary(coffeeItems);
      summaryEl.textContent = coffeeItems.length > displayItems.length
        ? `${baseSummary} Showing the best ${displayItems.length}.`
        : baseSummary;

      if (!hasBestMatchContext()) {
        listEl.innerHTML = '<p class="best-match-empty">Search for a strain, shop, or area to see suggested stops.</p>';
        return;
      }

      if (!displayItems.length) {
        listEl.innerHTML = '<p class="best-match-empty">Try a broader search or clear one filter to widen the map.</p>';
        return;
      }

      listEl.innerHTML = displayItems.map(item => {
        const loc = locations[item.index] || {};
        const locationLabel = item.city || inferCityFromCsvPath(currentCsvPath) || '';
        const priceLabel = item.priceLabel || (item.priceInsight && item.priceInsight.label) || '';
        const freshnessLabel = item.freshnessLabel || '';
        const distanceLabel = item.etaLabel || item.distText || '';
        const reason = buildBestMatchReason(item);
        const badges = [
          locationLabel ? `<span class="best-match-badge">${escapeHtml(locationLabel)}</span>` : '',
          priceLabel ? `<span class="best-match-badge${item.priceInsight && item.priceInsight.tone === 'deal' ? ' is-deal' : ''}">${escapeHtml(priceLabel)}</span>` : '',
          distanceLabel ? `<span class="best-match-badge">${escapeHtml(distanceLabel)}</span>` : '',
          freshnessLabel ? `<span class="best-match-badge is-fresh">${escapeHtml(freshnessLabel)}</span>` : ''
        ].filter(Boolean).join('');
        const inItinerary = !!item.inItinerary;
        const researchUrl = loc.db_shop_id != null && Number.isFinite(Number(loc.db_shop_id))
          ? priceMenusUrl({
              shopId: loc.db_shop_id,
              strain: offeringAttributeFilterKind ? '' : getCanonicalStrainName(strainFilterText)
            })
          : '';
        return (
          `<article class="best-match-card" data-best-match-index="${item.index}">` +
            `<div class="best-match-identity">` +
              bestMatchLogoHtml(loc) +
              `<div class="best-match-main">` +
                `<span class="best-match-name">${escapeHtml(item.name)}</span>` +
                `<span class="best-match-reason">${escapeHtml(reason)}</span>` +
                (badges ? `<span class="best-match-meta">${badges}</span>` : '') +
              `</div>` +
            `</div>` +
            `<div class="best-match-actions">` +
              `<button type="button" class="best-match-action is-primary" data-best-match-action="details" data-best-match-index="${item.index}">View</button>` +
              `<button type="button" class="best-match-action${inItinerary ? ' is-primary' : ''}" data-best-match-action="itinerary" data-best-match-index="${item.index}" aria-pressed="${inItinerary ? 'true' : 'false'}">${inItinerary ? 'Added' : 'Add to route'}</button>` +
              (researchUrl ? `<a class="best-match-action" href="${escapeHtmlAttr(researchUrl)}">Prices</a>` : '') +
            `</div>` +
          `</article>`
        );
      }).join('');
    }

    function refreshDestinationCards(items = null) {
      const preparedItems = sortDestinationItems(items || buildDestinationItems()).map(item => ({
        ...item,
        isSelected: getSelectedDestinationIndex() === item.index,
        inItinerary: isLocationInItinerary(item.index),
        itineraryStopIndex: getJourneyStopIndexByLocationIndex(item.index)
      }));
      renderDestinationCards(preparedItems);
      renderBestMatches(preparedItems);
    }

    /**
     * Rebuild the destination dropdown based on filters, sorting according to the route view.
     */
    function updateDestinationDropdown() {
      const destSelect = document.getElementById('destination-select');
      const previousSelection = getSelectedDestinationIndex();
      destSelect.innerHTML = '';

      const items = sortDestinationItems(buildDestinationItems());

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.text = items.length
        ? 'Select a Destination...'
        : ((locationSearchText && locationSearchText.trim())
            ? `No Destinations match "${locationSearchText}". Try a broader search.`
            : 'No Destinations match the current filters. Try clearing one.');
      placeholder.disabled = true;
      placeholder.selected = true;
      destSelect.appendChild(placeholder);

      const progressiveItems = items.slice();
      if (previousSelection !== null && !progressiveItems.some(item => item.index === previousSelection)) {
        const selectedItem = items.find(item => item.index === previousSelection);
        if (selectedItem) progressiveItems.push(selectedItem);
      }

      progressiveItems.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.index;
        opt.text = item.name +
          (item.city ? ` · ${item.city}` : '') +
          (item.isCheapest ? ` · Cheapest${item.priceLabel ? ` ${item.priceLabel}` : ''}` : '') +
          (item.isFav ? ' ★' : '') +
          (!item.isCheapest && item.priceLabel ? ` · ${item.priceLabel}` : '') +
          (item.distText ? ` (${item.distText})` : '');
        destSelect.appendChild(opt);
      });

      const canRestoreSelection = previousSelection !== null &&
        progressiveItems.some(item => item.index === previousSelection);
      if (canRestoreSelection) {
        destSelect.value = String(previousSelection);
      } else {
        destSelect.value = '';
        clearRouteUi();
      }

      refreshDestinationCards(items);
      updateControlsSummary();
      updateDistanceInfo();
      refreshSelectedMarkerIcons();
    }

    /**
     * Update distance label for currently selected destination.
     */
    function updateDistanceInfo() {
      const i = getSelectedDestinationIndex();
      const distanceDiv = document.getElementById('distance-info');

      if (lastPosition && i !== null && distanceDiv) {
        const distText = formatDistanceMeters(haversineDistance(lastPosition, locations[i].coords));
        distanceDiv.textContent = distText;
      } else if (distanceDiv) {
        distanceDiv.textContent = '--';
      }
      updateControlsSummary();
    }

    function getMarkerPriceLabel(loc) {
      if (!strainFilterText) return '';
      if (!strainPriceByShopId && !strainPriceByNameCity) return '';

      if (loc && loc.db_shop_id && strainPriceByShopId && strainPriceByShopId.has(loc.db_shop_id)) {
        return strainPriceByShopId.get(loc.db_shop_id) || '';
      }

      if (loc && strainPriceByNameCity) {
        const key = normaliseNameCityKey(loc.name, loc.city || '');
        if (strainPriceByNameCity.has(key)) {
          return strainPriceByNameCity.get(key) || '';
        }
      }

      return '';
    }

    function syncMarkerHighlightState(index, visible) {
      const marker = markers[index];
      const loc = locations[index];
      if (!marker || !loc) return;

      const isCheapest = !!(visible && isLocationCheapestForActiveStrain(loc));
      marker._isCheapest = isCheapest;
      marker.setZIndexOffset(isCheapest ? 1400 : 1000);

      const iconEl = marker.getElement();
      if (iconEl) {
        iconEl.classList.toggle('is-cheapest', isCheapest);
        const badge = iconEl.querySelector('.marker-price-badge');
        if (badge) {
          badge.classList.toggle('is-cheapest', isCheapest);
        }
      }

      const tooltip = marker.getTooltip && marker.getTooltip();
      if (tooltip) {
        const tooltipEl = tooltip.getElement && tooltip.getElement();
        if (tooltipEl) {
          tooltipEl.classList.toggle('is-cheapest', isCheapest);
        }
      }
    }

    function syncMarkerPriceDisplay(index, visible, showPriceLabel = true) {
      const marker = markers[index];
      const loc = locations[index];
      if (!marker || !loc) return;

      const label = visible && showPriceLabel ? getMarkerPriceLabel(loc) : '';
      const current = marker._priceLabelText || '';
      // Keep prices inside every icon, including fallback pins, so spacing
      // measures the badge and moves it together with its shop.
      if (current !== label) {
        marker.setIcon(chooseMarkerIcon(loc, label));
        marker._priceLabelText = label;
      }
      if (marker.getTooltip()) marker.unbindTooltip();
      syncMarkerHighlightState(index, visible);
      syncMarkerValueTone(index);
    }

    /**
     * Show or hide markers based on category filters.
     */
    function updateMarkers() {
      let activePopupWasHidden = false;
      const markerVisibility = locations.map((loc, index) => shouldShowMarkerOnMap(loc, index));
      const visibleMarkerCount = markerVisibility.filter(Boolean).length;
      const scopeSummary = document.getElementById('map-scope-summary');
      if (scopeSummary) scopeSummary.textContent = `${visibleMarkerCount} matching places · Netherlands`;
      const filterSummary = document.getElementById('map-filter-summary');
      if (filterSummary) filterSummary.textContent = (selectedCategories || []).map(getCategoryFilterLabel).join(', ') || 'All places';
      const markerPriceLimit = isCompactMobileLayout() ? 12 : 36;
      const showMarkerPriceLabels = visibleMarkerCount > 0 && visibleMarkerCount <= markerPriceLimit;
      const priceContextKey = [
        strainFilterText || '',
        offeringAttributeFilterKind || '',
        offeringAttributeFilterValue || '',
        strainCheapestPriceLabel || '',
        strainPriceByShopId ? strainPriceByShopId.size : 0,
        strainPriceByNameCity ? strainPriceByNameCity.size : 0,
        showMarkerPriceLabels ? 'labels' : 'no-labels'
      ].join('|');
      locations.forEach((loc, i) => {
        const visible = markerVisibility[i];
        const marker = markers[i];
        if (!marker) return;

        // Removing hundreds of Leaflet layers on every keystroke blocks the
        // browser, especially on phones. Keep the marker layer mounted and
        // hide only its rendered elements; fitting and result counts already
        // use shouldShowMarkerOnMap(), so the visual result stays identical.
        if (!map.hasLayer(marker)) map.addLayer(marker);
        const markerPriceContextKey = `${priceContextKey}|${showMarkerPriceLabels && visible ? 'visible' : 'no-price'}`;
        if (marker._budfinderPriceContextKey !== markerPriceContextKey) {
          syncMarkerPriceDisplay(i, visible, showMarkerPriceLabels);
          marker._budfinderPriceContextKey = markerPriceContextKey;
        }
        marker._budfinderVisible = visible;

        const iconEl = marker.getElement && marker.getElement();
        const shadowEl = marker._shadow || null;
        [iconEl, shadowEl].filter(Boolean).forEach(element => {
          element.style.display = visible ? '' : 'none';
          element.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });
        const tooltip = marker.getTooltip && marker.getTooltip();
        const tooltipEl = tooltip && tooltip.getElement && tooltip.getElement();
        if (tooltipEl) {
          tooltipEl.style.display = visible ? '' : 'none';
          tooltipEl.setAttribute('aria-hidden', 'true');
        }
        if (!visible && activePopupLocationIndex === i) activePopupWasHidden = true;
      });
      if (activePopupWasHidden && map) {
        map.closePopup();
        activePopupLocationIndex = null;
      }
      if (journeyLayerGroup) updateJourneyMapOverlay(getJourneyMetrics());
      if (markerLayoutController) markerLayoutController.schedule();
    }

    // =========================================================
    // Favourites, visited, rating interactions
    // =========================================================

    // Handle favourite (Add / Remove) button clicks in popups
    document.body.addEventListener('click', e => {
      const journeyNodeMoveBtn = e.target.closest('[data-journey-node-move]');
      if (journeyNodeMoveBtn) {
        const idx = parseInt(journeyNodeMoveBtn.getAttribute('data-stop-index'), 10);
        const dir = journeyNodeMoveBtn.getAttribute('data-journey-node-move');
        moveJourneyStopAtIndex(idx, dir, { fit: true });
        return;
      }

      const journeyNodeRemoveBtn = e.target.closest('[data-journey-node-remove]');
      if (journeyNodeRemoveBtn) {
        const idx = parseInt(journeyNodeRemoveBtn.getAttribute('data-journey-node-remove'), 10);
        removeJourneyStopAtIndex(idx, { fit: true });
        return;
      }

      if (e.target.closest('[data-journey-clear-start]')) {
        clearJourneyStart();
        return;
      }

      const journeyStartBtn = e.target.closest('.popup-journey-start-btn');
      if (journeyStartBtn) {
        const i = parseInt(journeyStartBtn.getAttribute('data-index'), 10);
        if (isNaN(i) || !locations[i]) return;
        setJourneyStartFromLocationIndex(i, { fit: true });
        setControlsVisible(true, { collapsed: false });
        return;
      }

      const journeyAddBtn = e.target.closest('.popup-journey-add-btn');
      if (journeyAddBtn) {
        const i = parseInt(journeyAddBtn.getAttribute('data-index'), 10);
        if (isNaN(i) || !locations[i]) return;
        toggleJourneyStopByIndex(i);
        setControlsVisible(true, { collapsed: false });
        return;
      }

      const journeyMoveBtn = e.target.closest('[data-popup-journey-move]');
      if (journeyMoveBtn) {
        const i = parseInt(journeyMoveBtn.getAttribute('data-index'), 10);
        if (isNaN(i) || !locations[i]) return;
        moveJourneyStopByLocationIndex(i, journeyMoveBtn.getAttribute('data-popup-journey-move'), { fit: true });
        setControlsVisible(true, { collapsed: false });
        return;
      }

      const areaSearchBtn = e.target.closest('[data-area-search-index]');
      if (areaSearchBtn) {
        const i = parseInt(areaSearchBtn.getAttribute('data-area-search-index'), 10);
        if (isNaN(i) || !locations[i]) return;
        rememberMapFilterState();
        locationSearchText = (locations[i].name || '').toString().trim();
        const searchInput = document.getElementById('destination-search');
        if (searchInput) searchInput.value = locationSearchText;
        if (categoryOptions.includes('Coffeeshop')) {
          selectedCategories = ['Coffeeshop'];
          syncCategoryCheckboxes();
        }
        if (map) map.closePopup();
        updateNearestLabel();
        updateDestinationDropdown();
        updateDistanceInfo();
        updateMarkers();
        updateSelectionCard();
        updateControlsSummary();
        setControlsVisible(true, { collapsed: false });
        window.setTimeout(() => fitMapToVisibleMarkers(), 80);
        return;
      }

      if (e.target.classList.contains('fav-btn')) {
        const i = parseInt(e.target.getAttribute('data-index'));
        const idx = favorites.indexOf(i);

        if (idx > -1) {
          favorites.splice(idx, 1);
        } else if (favorites.length < 10) {
          favorites.push(i);
        } else {
          setRouteStatus('Maximum of 10 Saved shops reached. Remove one before adding another.', 'warn');
          return;
        }

        writeLocationPreference(locations[i], { favorite: favorites.includes(i) });
        persistLegacyFavorites();
        updateDestinationDropdown();
        updateControlsSummary();

        e.target.textContent = favorites.includes(i)
          ? 'Remove saved shop'
          : 'Save shop';
      }
    });

    // Handle visited checkbox changes
    document.body.addEventListener('change', e => {
      if (e.target.classList.contains('visited-checkbox')) {
        const i = parseInt(e.target.getAttribute('data-index'));
        if (!isNaN(i) && locations[i]) {
          locations[i].visited = e.target.checked;
          writeLocationPreference(locations[i], { visited: e.target.checked });
          updateDestinationDropdown();
          updateControlsSummary();
        }
      }
    });

    // Handle rating star clicks: cycle rating from 1–5
    document.body.addEventListener('click', e => {
      if (e.target.classList.contains('rating-stars')) {
        const i = parseInt(e.target.getAttribute('data-index'));
        if (isNaN(i) || !locations[i]) return;

        let current = locations[i].rating || 0;
        // Cycle 1 → 2 → 3 → 4 → 5 → 1 ...
        current = current >= 5 ? 1 : current + 1;

        locations[i].rating = current;
        writeLocationPreference(locations[i], { rating: current });
        e.target.setAttribute('data-rating', current);
        e.target.textContent = renderStars(current);
        updateDestinationDropdown();
        updateControlsSummary();
      }
    });

    // =========================================================
    // Nearest button
    // =========================================================

    document.getElementById('center-on-me-btn').addEventListener('click', async () => {
      if (!map) return;
      if (!lastPosition) {
        try {
          await requestUserLocation({ label: 'Getting your location for map centering...' });
        } catch (_err) {
          return;
        }
      }
      focusMapOnCoords(lastPosition, {
        minZoom: isCompactMobileLayout() ? 14 : 15,
        animate: true,
        duration: 0.4
      });
      minimiseControlsForMapFocus();
    });

    document.getElementById('nearest-btn').addEventListener('click', async () => {
      if (!lastPosition) {
        try {
          await requestUserLocation({ label: 'Getting your location to find the closest Destination...' });
        } catch (_err) {
          return;
        }
      }

      let nearestOutsideRadius = null;
      let minOutside = Infinity;
      let nearestAny = null;
      let minAny = Infinity;

      locations.forEach((loc, idx) => {
        if (!passesCategoryFilter(loc, idx)) return;

        const d = haversineDistance(lastPosition, loc.coords);

        // Track absolute nearest (for fallback)
        if (d < minAny) {
          minAny = d;
          nearestAny = idx;
        }

        // Track nearest that isn't effectively "where we already are"
        if (d > VISITED_RADIUS_METERS && d < minOutside) {
          minOutside = d;
          nearestOutsideRadius = idx;
        }
      });

      // Prefer a location not essentially on top of us
      const chosenIndex = (nearestOutsideRadius !== null) ? nearestOutsideRadius : nearestAny;
      if (chosenIndex === null) {
        setRouteStatus('No Destinations match the current filters. Clear a filter or try a broader search.', 'bad');
        return;
      }

      const destSelect = document.getElementById('destination-select');
      destSelect.value = chosenIndex;
      destSelect.dispatchEvent(new Event('change'));
      setRouteStatus(`Closest visible Destination: ${locations[chosenIndex].name}.`, 'good');
    });

    document.getElementById('clear-route-focus-btn').addEventListener('click', () => {
      const destSelect = document.getElementById('destination-select');
      if (!destSelect || getSelectedDestinationIndex() === null) return;
      rememberMapFilterState();
      destSelect.value = '';
      lastDestinationSelectValue = '';
      if (map) map.closePopup();
      activePopupLocationIndex = null;
      clearRouteUi();
      destSelect.dispatchEvent(new Event('change', { bubbles: true }));
      updateDistanceInfo();
      refreshDestinationCards();
      syncClearSelectionToggle();
    });

    document.getElementById('show-strain-shops-btn').addEventListener('click', () => {
      expandExplorerFocusToStrainShops();
    });

    // =========================================================
    // UI toggles (controls + directions)
    // =========================================================

    const openBudfinderBtn = document.getElementById('open-budfinder-btn');
    if (openBudfinderBtn) {
      openBudfinderBtn.addEventListener('click', () => {
        openBudfinderFromLanding();
      });
    }

    const landingGuideBtn = document.getElementById('landing-guide-btn');
    if (landingGuideBtn) {
      landingGuideBtn.addEventListener('click', () => {
        window.location.href = 'index.html#how-it-works';
      });
    }

    document.getElementById('journey-start-select').addEventListener('change', e => {
      journeyPlanner.start = readJourneyPointValue(e.target.value);
      renderJourneyPlanner({ fit: journeyPlanner.stops.length > 0 });
      setJourneyStatus(
        journeyPlanner.start ? 'Route start updated.' : 'Choose a start, then add mapped places to build your route.',
        journeyPlanner.start ? 'good' : ''
      );
    });

    document.getElementById('journey-add-stop-btn').addEventListener('click', () => {
      const select = document.getElementById('journey-stop-select');
      const value = select ? select.value : '';
      const index = readJourneyLocationSelectIndex(value);
      if (!Number.isInteger(index) || !locations[index]) {
        setJourneyStatus('Choose a mapped place to add next.', 'warn');
        return;
      }
      if (addJourneyStopByIndex(index) && select) {
        select.value = '';
      }
    });

    document.getElementById('add-destination-stop-btn').addEventListener('click', () => {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null || !locations[selectedIndex]) {
        setJourneyStatus('Choose a place first, then add it to the route.', 'warn');
        return;
      }
      addJourneyStopByIndex(selectedIndex);
    });

    document.getElementById('journey-timeline').addEventListener('click', e => {
      const moveBtn = e.target.closest('[data-journey-move]');
      if (moveBtn) {
        const idx = parseInt(moveBtn.getAttribute('data-stop-index'), 10);
        const dir = moveBtn.getAttribute('data-journey-move');
        moveJourneyStopAtIndex(idx, dir, { fit: true });
        return;
      }

      const removeStopBtn = e.target.closest('[data-journey-remove-stop]');
      if (removeStopBtn) {
        const idx = parseInt(removeStopBtn.getAttribute('data-journey-remove-stop'), 10);
        removeJourneyStopAtIndex(idx, { fit: true });
        return;
      }

      const focusBtn = e.target.closest('[data-journey-focus]');
      if (focusBtn) {
        const idx = parseInt(focusBtn.getAttribute('data-journey-focus'), 10);
        const item = journeyPlanner.stops[idx];
        const location = item ? getJourneyStopLocation(item) : null;
        if (location) focusDestinationOnMap(location.index, { minZoom: 15, animate: true });
        return;
      }

      const addStrainBtn = e.target.closest('[data-journey-add-strain]');
      if (addStrainBtn) {
        const idx = parseInt(addStrainBtn.getAttribute('data-journey-add-strain'), 10);
        const select = document.querySelector(`[data-journey-strain-select="${idx}"]`);
        const strain = select ? select.value : '';
        if (!strain || !journeyPlanner.stops[idx]) return;
        const selected = journeyPlanner.stops[idx].strains || [];
        if (!selected.some(name => normaliseText(name) === normaliseText(strain))) {
          journeyPlanner.stops[idx].strains = [...selected, getCanonicalStrainName(strain)];
        }
        renderJourneyPlanner();
        setJourneyStatus(`${strain} added to place ${idx + 1}.`, 'good');
        return;
      }

      const removeStrainBtn = e.target.closest('[data-journey-remove-strain]');
      if (removeStrainBtn) {
        const idx = parseInt(removeStrainBtn.getAttribute('data-journey-remove-strain'), 10);
        const strain = removeStrainBtn.getAttribute('data-strain') || '';
        if (journeyPlanner.stops[idx]) {
          journeyPlanner.stops[idx].strains = (journeyPlanner.stops[idx].strains || [])
            .filter(name => normaliseText(name) !== normaliseText(strain));
        }
        renderJourneyPlanner();
        setJourneyStatus(`${strain} removed from place ${idx + 1}.`, 'good');
      }
    });

    document.getElementById('journey-save-btn').addEventListener('click', saveCurrentJourney);
    document.getElementById('journey-load-btn').addEventListener('click', loadSelectedJourney);
    document.getElementById('journey-delete-btn').addEventListener('click', deleteSelectedJourney);
    document.getElementById('journey-fit-map-btn').addEventListener('click', () => {
      const metrics = getJourneyMetrics();
      if (!metrics || !Array.isArray(metrics.points) || !metrics.points.length) {
        setJourneyStatus('Choose a start point or add places before fitting the route on the map.', 'warn');
        return;
      }
      updateJourneyMapOverlay(metrics, { fit: true });
      setJourneyStatus(metrics.points.length > 1 ? 'Route fitted on the map.' : 'Route start fitted on the map.', 'good');
    });
    document.getElementById('journey-name-input').addEventListener('input', () => {
      renderJourneySummary(getJourneyMetrics());
    });

    document.getElementById('toggle-controls').addEventListener('click', () => {
      if (isCompactMobileLayout()) {
        if (!controlsVisible) {
          if (directionsVisible) {
            setDirectionsVisible(false);
          }
          setControlsVisible(true, { collapsed: false });
          return;
        }
        if (controlsCollapsed) {
          setControlsCollapsed(false);
          return;
        }
        setControlsCollapsed(true);
        return;
      }

      const nextVisible = !controlsVisible;
      setControlsVisible(nextVisible);
    });

    function openSettingsPanel() {
      if (directionsVisible && isCompactMobileLayout()) {
        setDirectionsVisible(false);
      }
      setControlsVisible(true, { collapsed: false });
      const panel = document.getElementById('settings-panel');
      if (panel) panel.hidden = false;
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#settings`);
      }
      window.setTimeout(() => {
        if (!panel) return;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel.focus({ preventScroll: true });
      }, 80);
    }

    function closeSettingsPanel() {
      const panel = document.getElementById('settings-panel');
      if (panel) panel.hidden = true;
      if ((window.location.hash || '').toLowerCase() === '#settings' && window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      }
      const searchInput = document.getElementById('destination-search');
      if (searchInput) searchInput.focus({ preventScroll: true });
    }

    function openSettingsFromHash() {
      if ((window.location.hash || '').toLowerCase() !== '#settings') return;
      openSettingsPanel();
    }

    function applyInitialWorkflowIntent() {
      let intent = '';
      try {
        intent = (new URLSearchParams(window.location.search || '').get('intent') || '').toLowerCase();
      } catch (_err) {
        intent = '';
      }
      if (intent === 'nearby') {
        setControlsVisible(true, { collapsed: isCompactMobileLayout() });
        requestUserLocation({
          label: 'Getting your location for nearby results...',
          centerMap: true
        }).then(() => {
          nearbyExploreActive = true;
          updateDestinationDropdown();
          updateMarkers();
        }).catch(() => {
          focusInitialMapViewport();
        });
        return;
      }
      if (intent !== 'itinerary') return;
      setControlsVisible(true, { collapsed: false });
      const planner = openRouteTools();
      if (planner) {
        window.setTimeout(() => {
          setControlsVisible(true, { collapsed: false });
          const content = document.getElementById('map-tools-content');
          if (!content) return;
          const targetTop = Math.max(0, planner.offsetTop - content.offsetTop - 12);
          content.scrollTo({ top: targetTop, behavior: 'auto' });
        }, 700);
      }
      setJourneyStatus('Choose a start, then add places in the order you want to visit them.', 'good');
    }

    document.getElementById('nav-settings-btn').addEventListener('click', openSettingsPanel);
    document.getElementById('close-map-settings-btn').addEventListener('click', closeSettingsPanel);

    window.addEventListener('hashchange', openSettingsFromHash);

    document.getElementById('toggle-directions').addEventListener('click', () => {
      setDirectionsVisible(!directionsVisible);
    });

    document.querySelectorAll('[data-map-intent]').forEach(button => {
      button.addEventListener('click', async () => {
        const intent = button.getAttribute('data-map-intent');
        setControlsVisible(true, { collapsed: false });
        if (intent === 'wanted') {
          setStrainListVisible(true);
          const strainSearch = document.getElementById('strain-list-search');
          if (strainSearch) strainSearch.focus();
          setRouteStatus('Add one or more strains to compare Best matches.', 'good');
          return;
        }
        if (intent === 'nearby') {
          try {
            await requestUserLocation({
              label: 'Getting your location for nearby results...',
              centerMap: true
            });
            nearbyExploreActive = true;
            updateDestinationDropdown();
            updateMarkers();
            setRouteStatus('Showing useful stops around your location.', 'good');
          } catch (_err) {
            focusInitialMapViewport();
          }
          return;
        }
        if (intent === 'value') {
          const sortSelect = document.getElementById('destination-sort');
          if (sortSelect) {
            sortSelect.value = 'cheapest';
            refreshDestinationCards();
            updateDestinationDropdown();
          }
          setRouteStatus('Good-value shops are sorted by known price signals where available.', 'good');
        }
      });
    });

    const strainToolsDrawer = document.getElementById('map-strain-tools');
    if (strainToolsDrawer) {
      strainToolsDrawer.addEventListener('toggle', () => {
        strainListVisible = strainToolsDrawer.open;
        const panel = document.getElementById('strain-list-panel');
        if (panel) panel.style.display = strainListVisible ? 'block' : 'none';
        if (strainListVisible) populateStrainListPanel();
      });
    }

    document.getElementById('clear-selection-toggle').addEventListener('click', () => {
      clearDestinationSelection();
    });

    document.getElementById('instructions').addEventListener('click', e => {
      if (!e.target.closest('.directions-hide-btn')) return;
      setDirectionsVisible(false);
    });

    function toggleSelectionCardFromUi() {
      const card = document.getElementById('selection-card');
      if (!card || card.classList.contains('is-empty') || card.style.display === 'none') return;
      setSelectionCardCollapsed(!selectionCardCollapsed);
    }

    document.getElementById('selection-card-toggle').addEventListener('click', e => {
      e.stopPropagation();
      toggleSelectionCardFromUi();
    });

    document.getElementById('selection-card-head').addEventListener('click', e => {
      if (e.target.closest('button')) return;
      toggleSelectionCardFromUi();
    });

    document.getElementById('selection-card-head').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggleSelectionCardFromUi();
    });

    document.getElementById('selection-directions-btn').addEventListener('click', async () => {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null) {
        setControlsVisible(true, { collapsed: false });
        return;
      }
      let routedDuringLocationRequest = false;
      if (!lastPosition) {
        try {
          await requestUserLocation({
            label: 'Getting your location for direct distance...',
            routeIfSelected: true
          });
          routedDuringLocationRequest = true;
        } catch (_err) {
          return;
        }
      }
      if (!directionsVisible && !routedDuringLocationRequest) {
        findRoute({ coords: { latitude: lastPosition[0], longitude: lastPosition[1] } });
      }
      setDirectionsVisible(!directionsVisible);
    });

    document.getElementById('selection-center-btn').addEventListener('click', () => {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null || !map) return;
      focusDestinationOnMap(selectedIndex, {
        minZoom: isCompactMobileLayout() ? 15 : 16,
        animate: true,
        duration: 0.45
      });
    });

    document.getElementById('selection-add-stop-btn').addEventListener('click', () => {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null || !locations[selectedIndex]) {
        setControlsVisible(true, { collapsed: false });
        setJourneyStatus('Choose a place first, then add it to the route.', 'warn');
        return;
      }
      toggleJourneyStopByIndex(selectedIndex);
      setControlsVisible(true, { collapsed: false });
    });

    document.getElementById('selection-move-up-btn').addEventListener('click', () => {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null || !locations[selectedIndex]) return;
      moveJourneyStopByLocationIndex(selectedIndex, 'up', { fit: true });
      setControlsVisible(true, { collapsed: false });
    });

    document.getElementById('selection-move-down-btn').addEventListener('click', () => {
      const selectedIndex = getSelectedDestinationIndex();
      if (selectedIndex === null || !locations[selectedIndex]) return;
      moveJourneyStopByLocationIndex(selectedIndex, 'down', { fit: true });
      setControlsVisible(true, { collapsed: false });
    });

    document.getElementById('mobile-hide-controls').addEventListener('click', e => {
      e.stopPropagation();
      if (isCompactMobileLayout()) {
        setControlsVisible(false);
        return;
      }
      setControlsVisible(false);
    });

    const heroBannerCloseBtn = document.getElementById('hero-banner-close');
    if (heroBannerCloseBtn) {
      heroBannerCloseBtn.addEventListener('click', e => {
        e.stopPropagation();
        dismissHeroPopup();
      });
    }

    document.getElementById('controls-header').addEventListener('click', e => {
      if (e.target.closest('button')) return;
      if (controlsVisible && isCompactMobileLayout()) {
        setControlsCollapsed(!controlsCollapsed);
      }
    });

    document.getElementById('controls-header-toggle').addEventListener('click', () => {
      if (controlsVisible && isCompactMobileLayout()) {
        setControlsCollapsed(!controlsCollapsed);
      }
    });

    document.getElementById('display-name-input').addEventListener('input', e => {
      const nextName = (e.target.value || '').toString().replace(/\s+/g, ' ').trim().slice(0, 24);
      personalisation.displayName = nextName;
      savePersonalisation();
      applyPersonalisation();
      renderJourneyPlanner();
      updateControlsSummary();
    });

    document.getElementById('settings-default-city-select').addEventListener('change', e => {
      const selectedPath = canonicalCsvPath(e.target.value);
      if (!selectedPath) return;
      personalisation.defaultCity = csvFileNameFromPath(selectedPath);
      savePersonalisation();
      if (selectedPath === currentCsvPath) return;
      switchMapViewArea(selectedPath, { explicitSelection: true });
    });

    document.getElementById('settings-distance-unit-select').addEventListener('change', e => {
      personalisation.distanceUnit = e.target.value === 'miles' ? 'miles' : 'metric';
      savePersonalisation();
      updateDistanceInfo();
      refreshDestinationCards();
      renderJourneyPlanner();
      updateControlsSummary();
    });

    document.getElementById('settings-reduce-motion-input').addEventListener('change', e => {
      personalisation.reduceMotion = e.target.checked === true;
      savePersonalisation();
      applyPersonalisation();
    });

    window.addEventListener('storage', event => {
      if (!event || !PERSONALISATION_STORAGE_KEYS.includes(event.key)) return;
      loadPersonalisation();
      applyPersonalisation();
      renderJourneyPlanner();
      updateControlsSummary();
    });

    if (!window.BudfinderTheme) {
      document.getElementById('accent-select').addEventListener('change', e => {
        const nextAccent = (e.target.value || '').toString();
        if (!accentThemes[nextAccent]) return;
        personalisation.accent = nextAccent;
        savePersonalisation();
        applyPersonalisation();
        updateControlsSummary();
      });
    }

    window.addEventListener('budfinder:vibechange', e => {
      const nextAccent = normaliseAccentThemeKey(e && e.detail ? e.detail.accent : '');
      if (!accentThemes[nextAccent] || personalisation.accent === nextAccent) return;
      personalisation.accent = nextAccent;
      savePersonalisation();
      applyPersonalisation();
      updateControlsSummary();
    });

    document.addEventListener('DOMContentLoaded', () => {
      applyPersonalisation();
      updateControlsSummary();
    }, { once: true });

    document.getElementById('reset-personalisation-btn').addEventListener('click', () => {
      resetPersonalisation();
    });

    document.getElementById('reset-filters-btn').addEventListener('click', () => {
      resetMapFilters();
    });

    document.getElementById('clear-saved-data-btn').addEventListener('click', () => {
      setSavedDataConfirmationVisible(true);
    });

    document.getElementById('confirm-clear-saved-data-btn').addEventListener('click', () => {
      clearSavedDataFromBrowser();
    });

    document.getElementById('cancel-clear-saved-data-btn').addEventListener('click', () => {
      setSavedDataConfirmationVisible(false);
    });

    document.addEventListener('pointerdown', e => {
      if (!heroPopupVisible) return;
      if (e.target.closest('#hero-banner')) return;
      dismissHeroPopup();
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && guideVisible) {
        setGuideVisible(false);
        return;
      }
      if (e.key === 'Escape' && heroPopupVisible) {
        dismissHeroPopup();
      }
      if (e.key !== '/' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || (target && target.isContentEditable)) return;

      const searchInput = document.getElementById('destination-search');
      if (!searchInput) return;

      e.preventDefault();
      dismissHeroPopup();
      if (!controlsVisible) {
        setControlsVisible(true, { collapsed: false });
      } else if (controlsCollapsed) {
        setControlsCollapsed(false);
      }

      searchInput.focus();
      searchInput.select();
    });

    function handleViewportResize() {
      syncViewportCssVars();
      syncCompactLayoutState();
      if (directionsVisible) {
        setDirectionsVisible(true);
      } else {
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
          mapDiv.style.right = isCompactMobileLayout() ? '12px' : '24px';
          mapDiv.style.bottom = isCompactMobileLayout() ? '14px' : '24px';
        }
      }
      syncControlsChrome();
      invalidateMapSizeSettled([0, 120, 260]);
    }

    function scheduleViewportResync(delays = [0, 120, 360]) {
      viewportResyncTimers.forEach(timerId => window.clearTimeout(timerId));
      viewportResyncTimers = [];
      delays.forEach(delay => {
        const timerId = window.setTimeout(() => {
          handleViewportResize();
        }, delay);
        viewportResyncTimers.push(timerId);
      });
    }

    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', () => scheduleViewportResync([0, 160, 420]));
    window.addEventListener('pageshow', () => scheduleViewportResync([0, 120, 360]));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        scheduleViewportResync([0, 120, 360]);
      } else {
        persistMapSessionNow();
      }
    });
    document.addEventListener('change', () => schedulePersistMapSession(), true);
    document.addEventListener('input', event => {
      if (event.target && event.target.closest && event.target.closest('.controls')) {
        schedulePersistMapSession(520);
      }
    }, true);
    document.addEventListener('click', event => {
      if (event.target && event.target.closest && event.target.closest('button, a, .leaflet-container')) {
        schedulePersistMapSession(650);
      }
    }, true);
    window.addEventListener('pagehide', persistMapSessionNow);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    loadPersonalisation();
    savePersonalisation();
    applyPersonalisation();
    syncHowGuidePreferenceUi();
    syncViewportCssVars();
    syncCompactLayoutState();
    syncControlsChrome();
    scheduleViewportResync([160, 420]);
    applyInitialWorkflowIntent();
    openSettingsFromHash();
    bootstrapInitialCsvLoad();

    // Optional: probe DB routes early so status is visible before CSV upload.
    ensureDbIntegration();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

  
