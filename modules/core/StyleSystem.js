import { AbstractSystem } from './AbstractSystem.js';
import { osmPavedTags } from '../osm/tags.js';


const roadVals = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'unclassified', 'road', 'service', 'track', 'living_street', 'bus_guideway', 'busway',
]);

const lifecycleVals = new Set([
  'abandoned', 'construction', 'demolished', 'destroyed', 'dismantled', 'disused',
  'intermittent', 'obliterated', 'planned', 'proposed', 'razed', 'removed', 'was'
]);

// matches these things as a tag prefix
const lifecycleRegex = new RegExp('^(' + Array.from(lifecycleVals).join('|') + '):');


/**
 * `StyleSystem` maintains the the rules about how map data should look.
 *
 * Events available:
 *   `stylechange`  Fires on any change in style
 */
export class StyleSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'styles';
    this.context = context;
    this.dependencies = new Set(['assets']);
    this.autoStart = true;

    // Experiment, see Rapid#1230
    // matrix values from https://github.com/maputnik/editor
    this.protanopiaMatrix = [
      0.567,  0.433,  0,     0,  0,
      0.558,  0.442,  0,     0,  0,
      0,      0.242,  0.758, 0,  0,
      0,      0,      0,     1,  0
    ];

    this.deuteranopiaMatrix = [
      0.625,  0.375,  0,     0,  0,
      0.7,    0.3,    0,     0,  0,
      0,      0.3,    0.7,   0,  0,
      0,      0,      0,     1,  0
    ];

    this.tritanopiaMatrix = [
      0.95,   0.05,   0,     0,  0,
      0,      0.433,  0.567, 0,  0,
      0,      0.475,  0.525, 0,  0,
      0,      0,      0,     1,  0
    ];


    // A "Style Declaration" contains properties that describe how features should look.
    // Each style declaration looks like this:
    //
    // styleID: {
    //   fill:   { fill props… },
    //   casing: { casing props… },
    //   stroke: { stroke props… }
    // }
    //
    // Available property groups:
    //   `fill`   - properties used when drawing fill (fill draws at the bottom)
    //   `casing` - properties used when drawing line (casing draws above fill)
    //   `stroke` - properties used when drawing line (stroke draws above casing)
    //
    // Available properties:
    //   `width` - line width in pixel (for fills, this is the width of the outline)
    //   `color` - the color
    //   `alpha` - 0 = transparent/invisible, 1 = filled
    //   `cap`   - one of 'butt', 'round', or 'square'  (see https://pixijs.download/dev/docs/PIXI.html#LINE_CAP)
    //   `join`  - one of 'bevel', 'miter', or 'round', (see https://pixijs.download/dev/docs/PIXI.html#LINE_JOIN)
    //   `dash`  - array of pixels on/off - e.g. `[20, 5, 5, 5]`
    //
    // The fill group also supports:
    //   `pattern` - supported pattern (see dist/img/pattern/* for these)
    //

    this.STYLE_DECLARATIONS = {
      DEFAULTS: {
        fill:   { width: 2, color: 0xaaaaaa, alpha: 0.3 },
        casing: { width: 5, color: 0x444444, alpha: 1, cap: 'round', join: 'round' },
        stroke: { width: 3, color: 0xcccccc, alpha: 1, cap: 'round', join: 'round' }
      },

      LIFECYCLE: {   // e.g. planned, proposed, abandoned, disused, razed
        casing: { alpha: 0 },  // disable
        stroke: { dash: [7, 3], cap: 'butt' }
      },

      red: {
        fill: { color: 0xe06e5f, alpha: 0.3 }   // rgb(224, 110, 95)
      },
      green: {
        fill: { color: 0x8cd05f, alpha: 0.3 }   // rgb(140, 208, 95)
      },
      blue: {
        fill: { color: 0x77d4de, alpha: 0.3 }   // rgb(119, 211, 222)
      },
      yellow: {
        fill: { color: 0xffff94, alpha: 0.25 }  // rgb(255, 255, 148)
      },
      gold: {
        fill: { color: 0xc4be19, alpha: 0.3 }   // rgb(196, 189, 25)
      },
      orange: {
        fill: { color: 0xd6881a, alpha: 0.3 }   // rgb(214, 136, 26)
      },
      pink: {
        fill: { color: 0xe3a4f5, alpha: 0.3 }   // rgb(228, 164, 245)
      },
      teal: {
        fill: { color: 0x99e1aa, alpha: 0.3 }   // rgb(153, 225, 170)
      },
      lightgreen: {
        fill: { color: 0xbee83f, alpha: 0.3 }   // rgb(191, 232, 63)
      },
      tan: {
        fill: { color: 0xf5dcba, alpha: 0.3 }   // rgb(245, 220, 186)
      },
      darkgray: {
        fill: { color: 0x8c8c8c, alpha: 0.5 }   // rgb(140, 140, 140)
      },
      lightgray: {
        fill: { color: 0xaaaaaa, alpha: 0.3 }   // rgb(170, 170, 170)
      },

      motorway: {
        casing: { width: 10, color: 0x70372f },
        stroke: { width: 8, color: 0xcf2081 }
      },
      trunk: {
        casing: { width: 10, color: 0x70372f },
        stroke: { width: 8, color: 0xdd2f22 }
      },
      primary: {
        casing: { width: 10, color: 0x70372f },
        stroke: { width: 8, color: 0xf99806 }
      },
      secondary: {
        casing: { width: 10, color: 0x70372f },
        stroke: { width: 8, color: 0xf3f312 }
      },
      tertiary: {
        casing: { width: 10, color: 0x70372f },
        stroke: { width: 8, color: 0xfff9b3 }
      },
      unclassified: {
        casing: { width: 10, color: 0x444444 },
        stroke: { width: 8, color: 0xddccaa }
      },
      residential: {
        casing: { width: 10, color: 0x444444 },
        stroke: { width: 8, color: 0xffffff }
      },
      living_street: {
        casing: { width: 7, color: 0xffffff },
        stroke: { width: 5, color: 0xcccccc }
      },
      service: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xffffff }
      },
      special_service: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xddccaa }
      },
      track: {
        casing: { width: 7, color: 0x746f6f },
        stroke: { width: 5, color: 0xc5b59f }
      },
      pedestrian: {
        casing: { width: 7, color: 0xffffff },
        stroke: { width: 5, color: 0x998888, dash: [8, 8], cap: 'butt' }
      },
      path: {
        casing: { width: 5, color: 0xddccaa },
        stroke: { width: 3, color: 0x998888, dash: [6, 6], cap: 'butt' }
      },
      footway: {
        casing: { width: 5, color: 0xffffff },
        stroke: { width: 3, color: 0x998888, dash: [6, 6], cap: 'butt' }
      },
      crossing_marked: {
        casing: { width: 5, color: 0xddccaa },
        stroke: { width: 3, color: 0x4c4444, dash: [6, 3], cap: 'butt' }
      },
      crossing_unmarked: {
        casing: { width: 5, color: 0xddccaa },
        stroke: { width: 3, color: 0x776a6a, dash: [6, 4], cap: 'butt' }
      },
      cycleway: {
        casing: { width: 5, color: 0xffffff },
        stroke: { width: 3, color: 0x58a9ed, dash: [6, 6], cap: 'butt' }
      },
      bridleway: {
        casing: { width: 5, color: 0xffffff },
        stroke: { width: 3, color: 0xe06d5f, dash: [6, 6], cap: 'butt' }
      },
      corridor: {
        casing: { width: 5, color: 0xffffff },
        stroke: { width: 3, color: 0x8cd05f, dash: [2, 8], cap: 'round' }
      },
      steps: {
        casing: { width: 5, color: 0xffffff },
        stroke: { width: 3, color: 0x81d25c, dash: [3, 3], cap: 'butt' }
      },
      river: {
        fill:   { color: 0x77d4de, alpha: 0.3 },   // rgb(119, 211, 222)
        casing: { width: 10, color: 0x444444 },
        stroke: { width: 8, color: 0x77dddd }
      },
      stream: {
        fill:   { color: 0x77d4de, alpha: 0.3 },   // rgb(119, 211, 222)
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0x77dddd }
      },
      ridge: {
        stroke: { width: 2, color: 0x8cd05f}  // rgb(140, 208, 95)
      },
      runway: {
        casing: { width: 10, color: 0x000000, cap: 'butt' },
        stroke: { width: 8, color: 0xffffff, dash: [24, 48], cap: 'butt' }
      },
      taxiway: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xffff00 }
      },
      railway: {
        casing: { width: 7, color: 0x555555, cap: 'butt' },
        stroke: { width: 2, color: 0xeeeeee, dash: [12, 12], cap: 'butt' }
      },
      ferry: {
        casing: { alpha: 0 },  // disable
        stroke: { width: 3, color: 0x58a9ed, dash: [12, 8], cap: 'butt' }
      },
      boundary: {
        casing: { width: 6, color: 0x82b5fe, cap: 'butt' },
        stroke: { width: 2, color: 0xffffff, dash: [20, 5, 5, 5], cap: 'butt' }
      },
      boundary_park: {
        casing: { width: 6, color: 0x82b5fe, cap: 'butt' },
        stroke: { width: 2, color: 0xb0e298, dash: [20, 5, 5, 5], cap: 'butt' }
      },
      barrier: {
        casing: { alpha: 0 },  // disable
        stroke: { width: 3, color: 0xdddddd, dash: [10, 5, 2, 5], cap: 'round' }
      },
      barrier_wall: {
        casing: { alpha: 0 },  // disable
        stroke: { width: 3, color: 0xdddddd, dash: [10, 5, 2, 5], cap: 'round' }
      },
      barrier_hedge: {
        fill:   { color: 0x8cd05f, alpha: 0.3 },   // rgb(140, 208, 95)
        casing: { alpha: 0 },  // disable
        stroke: { width: 3, color: 0x8cd05f, dash: [10, 5, 2, 5], cap: 'round' }
      },
      tree_row: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0x8cd05f }
      },
      construction: {
        casing: { width: 10, color: 0xffffff},
        stroke: { width: 8, color: 0xfc6c14, dash: [10, 10], cap: 'butt' }
      },
      pipeline: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xdddddd, dash: [80, 2], cap: 'butt' }
      },
      roller_coaster: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xdddddd, dash: [10, 1], cap: 'butt' }
      }
    };

    //
    // A "Style Selector" contains OSM key/value tags to match to a style declaration.
    // Each style selector looks like this:
    //
    // osmkey: {
    //   osmvalue: styleID
    // }
    //
    // Can use the value '*' to match any osmvalue.
    //
    // Important: The fewer rules in the selector, the more selective it is.
    // For example:
    //   The `amenity` selector has 8 rules in it
    //   The `building` selector has 1 rule in it
    //
    // So a feature with both `amenity=kindergarden` and `building=yes` tags
    // will be styled with the `building` rule.
    //

    this.STYLE_SELECTORS = {
      aeroway: {
        runway: 'runway',
        taxiway: 'taxiway'
      },
      amenity: {
        childcare: 'yellow',
        college: 'yellow',
        fountain: 'blue',
        kindergarten: 'yellow',
        parking: 'darkgray',
        research_institute: 'yellow',
        school: 'yellow',
        university: 'yellow'
      },
      building: {
        '*': 'red'
      },
      barrier: {
        city_wall: 'barrier_wall',
        hedge: 'barrier_hedge',
        retaining_wall: 'barrier_wall',
        wall: 'barrier_wall',
        '*': 'barrier'
      },
      boundary: {
        protected_area: 'boundary_park',
        national_park: 'boundary_park',
        '*': 'boundary'
      },
      crossing: {
        marked: 'crossing_marked',
        traffic_signals: 'crossing_marked',
        uncontrolled: 'crossing_marked',
        zebra: 'crossing_marked',
        '*': 'crossing_unmarked'
      },
      golf: {
        green: 'lightgreen'
      },
      highway: {
        bridleway: 'bridleway',
        bus_guideway: 'railway',
        busway: 'special_service',
        corridor: 'corridor',
        construction: 'construction',
        cycleway: 'cycleway',
        footway: 'footway',
        living_street: 'living_street',
        living_street_link: 'living_street',
        motorway: 'motorway',
        motorway_link: 'motorway',
        path: 'path',
        pedestrian: 'pedestrian',
        primary: 'primary',
        primary_link: 'primary',
        residential: 'residential',
        residential_link: 'residential',
        secondary: 'secondary',
        secondary_link: 'secondary',
        service: 'service',
        service_link: 'service',
        steps: 'steps',
        tertiary: 'tertiary',
        tertiary_link: 'tertiary',
        track: 'track',
        trunk: 'trunk',
        trunk_link: 'trunk',
        unclassified: 'unclassified',
        unclassified_link: 'unclassified'
      },
      landuse: {
        cemetery: 'lightgreen',
        commercial: 'orange',
        construction: 'gold',
        farmland: 'lightgreen',
        farmyard: 'tan',
        flowerbed: 'green',
        forest: 'green',
        grass: 'green',
        industrial: 'pink',
        landfill: 'orange',
        meadow: 'lightgreen',
        military: 'orange',
        orchard: 'lightgreen',
        quarry: 'darkgray',
        railway: 'darkgray',
        recreation_ground: 'green',
        residential: 'gold',
        retail: 'orange',
        village_green: 'green',
        vineyard: 'lightgreen'
      },
      leisure: {
        garden: 'green',
        golf_course: 'green',
        nature_reserve: 'green',
        park: 'green',
        pitch: 'green',
        swimming_pool: 'blue',
        track: 'yellow'
      },
      man_made: {
        adit: 'darkgray',
        breakwater: 'barrier_wall',
        groyne: 'barrier_wall',
        pipeline: 'pipeline'
      },
      military: {
        '*': 'orange'
      },
      natural: {
        bare_rock: 'darkgray',
        bay: 'blue',
        beach: 'yellow',
        cave_entrance: 'darkgray',
        cliff: 'darkgray',
        glacier: 'lightgray',
        ridge: 'ridge',
        rock: 'darkgray',
        sand: 'yellow',
        scree: 'darkgray',
        scrub: 'yellow',
        shingle: 'darkgray',
        stone: 'darkgray',
        strait: 'blue',
        tree_row: 'tree_row',
        water: 'blue',
        wetland: 'teal',
        '*': 'green'
      },
      power: {
        plant: 'pink'
      },
      railway: {
        platform: 'footway',
        '*': 'railway'
      },
      roller_coaster: {
        track: 'roller_coaster'
      },
      route: {
        ferry: 'ferry'
      },
      sport: {
        baseball: 'yellow',
        basketball: 'darkgray',
        beachvolleyball: 'yellow',
        skateboard: 'darkgray',
        softball: 'yellow'
      },
      type: {
        waterway: 'river'
      },
      waterway: {
        river: 'river',
        dam: 'DEFAULTS',
        weir: 'DEFAULTS',
        '*': 'stream'
      },
      service: {
        alley: 'special_service',
        driveway: 'special_service',
        'drive-through': 'special_service',
        parking_aisle: 'special_service',
        '*': 'special_service'
      }
    };


    //
    // "Pattern Declarations" is just the list of supported `patternIDs`
    // This needs to match the list of patterns loaded by `PixiTextures.js`
    //
    this.PATTERN_DECLARATIONS = [
      'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
      'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
      'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
      'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
    ];

    //
    // "Pattern Selectors" work like style selectors.
    // They contain OSM key/value tags to match to a `patternID`.
    //
    // osmkey: {
    //   osmvalue: patternID
    // }
    //
    this.PATTERN_SELECTORS = {
      amenity: {
        fountain: 'pond',
        grave_yard: 'cemetery'
      },
      golf: {
        green: 'grass'
      },
      landuse: {
        cemetery: 'cemetery',
        construction: 'construction',
        farmland: 'farmland',
        farmyard: 'farmyard',
        forest: 'forest',
        grass: 'grass',
        grave_yard: 'cemetery',
        landfill: 'landfill',
        meadow: 'grass',
        military: 'construction',
        orchard: 'orchard',
        quarry: 'quarry',
        vineyard: 'vineyard'
      },
      leaf_type: {
        broadleaved: 'forest_broadleaved',
        leafless: 'forest_leafless',
        needleleaved: 'forest_needleleaved'
      },
      natural: {
        bay: 'waves',
        beach: 'dots',
        grassland: 'grass',
        sand: 'dots',
        scrub: 'bushes',
        strait: 'waves',
        water: 'waves',
        wetland: 'wetland',
        wood: 'forest'
      },
      religion: {
        buddhist: 'cemetery_buddhist',
        christian: 'cemetery_christian',
        jewish: 'cemetery_jewish',
        muslim: 'cemetery_muslim'
      },
      surface: {
        grass: 'grass'
      },
      water: {
        pond: 'pond',
        reservoir: 'lines'
      },
      wetland: {
        bog: 'wetland_bog',
        marsh: 'wetland_marsh',
        reedbed: 'wetland_reedbed',
        swamp: 'wetland_swamp'
      },
    };


    this.styleMatch = this.styleMatch.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync(){
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
          return Promise.reject(`Cannot init: ${this.id} requires ${id}`);
      }
    }
    return Promise.resolve();
  }

  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }


  /**
   * styleMatch
   * @param  {Object}  tags - OSM tags to match to a display style
   * @return {Object}  Styling info for the given tags
   */
  styleMatch(tags) {
    const defaults = this.STYLE_DECLARATIONS.DEFAULTS;

    let matched = defaults;
    let styleScore = 999;   // lower numbers are better
// eventually expose this to the caller?
// it may be useful to know what `k=v` pair matched
    let styleKey;           // the key controlling the styling, if any
//    let styleVal;           // the value controlling the styling, if any

    // First, match the tags to the best matching `styleID`..
    for (const [k, v] of Object.entries(tags)) {
      const selector = this.STYLE_SELECTORS[k];
      if (!selector || !v) continue;

      // Exception: only consider 'service' when a 'highway' tag is present (not 'railway'), see Rapid#1252
      if (k === 'service' && getTag(tags, 'highway') === undefined) continue;

      const styleID = selector[v] ?? selector['*'];  // '*' = fallback value
      let score = Object.keys(selector).length;      // smaller groups are more selective
      if (lifecycleVals.has(v)) score = 999;         // exception: lifecycle values

      if (styleID && score <= styleScore) {
        const declaration = this.STYLE_DECLARATIONS[styleID];
        if (!declaration) {
          console.error(`invalid styleID: ${styleID}`);  // eslint-disable-line
          continue;
        }

        matched = declaration;
        styleScore = score;
        styleKey = k;
//        styleVal = v;

        if (styleScore === 1) break;  // no need to keep looking at tags
      }
    }

    // Also scan for lifecycle keywords in any of their various forms.
    // The feature will be drawn with dashed lines.
    // see Rapid#1312, Rapid#1199, Rapid#791, Rapid #535
    let hasLifecycleTag = false;
    for (const [k, v] of Object.entries(tags)) {
      // Lifecycle key, e.g. `demolished=yes`
      // (applies to all tags, styleKey doesn't matter)
      if (lifecycleVals.has(k) && v !== 'no') {
        hasLifecycleTag = true;
        break;

      // Lifecycle value, e.g. `railway=demolished`
      // (applies only if `k` is styleKey or there is no styleKey controlling styling)
      } else if ((!styleKey || k === styleKey) && lifecycleVals.has(v)) {
        hasLifecycleTag = true;
        break;

      // Lifecycle key prefix, e.g. `demolished:railway=rail`
      // (applies only if there is no styleKey controlling the styling)
      } else if (!styleKey && lifecycleRegex.test(k) && v !== 'no') {
        hasLifecycleTag = true;
        break;
      }
    }


    // Copy style properties from the matched style declaration, fallback to defaults as needed..
    const style = {};   // this will be our return value
    for (const group of ['fill', 'casing', 'stroke']) {
      style[group] = {};
      for (const prop of ['width', 'color', 'alpha', 'cap', 'dash']) {
        const value = matched[group] && matched[group][prop];
        if (value !== undefined) {
          style[group][prop] = value;
        } else {
          const fallback = defaults[group] && defaults[group][prop];
          if (fallback !== undefined) {
            style[group][prop] = fallback;
          }
        }
      }
    }

    // Apply casing/stroke overrides
    const bridge = getTag(tags, 'bridge');
    const building = getTag(tags, 'building');
    const cutting = getTag(tags, 'cutting');
    const embankment = getTag(tags, 'embankment');
    const highway = getTag(tags, 'highway');
    const tracktype = getTag(tags, 'tracktype');
    const tunnel = getTag(tags, 'tunnel');
    let surface = getTag(tags, 'surface');
    if (highway === 'track' && tracktype !== 'grade1') {
      surface = surface || 'dirt';   // assume unimproved (non-grade1) tracks have 'dirt' surface
    }

    if (bridge || embankment || cutting) {
      style.casing.width += 7;
      style.casing.color = 0x000000;
      style.casing.cap = 'butt';
      if (embankment || cutting) {
        style.casing.dash = [2, 4];
      }
    }
    if (tunnel) {
      style.stroke.alpha = 0.5;
    }

    // Bumpy casing for roads with unpaved surface
    if (surface && roadVals.has(highway) && !osmPavedTags.surface[surface]) {
      if (!bridge) style.casing.color = 0xcccccc;
      style.casing.cap = 'butt';
      style.casing.dash = [4, 4];
    }

    // After applying all other styling rules and overrides, perform lifecycle overrides.
    // (This is for features that are not really existing - "abandoned", "proposed", etc.)
    if (hasLifecycleTag) {
      const lifecycle = this.STYLE_DECLARATIONS.LIFECYCLE;
      for (const group of ['fill', 'casing', 'stroke']) {
        for (const prop of ['width', 'color', 'alpha', 'cap', 'dash']) {
          const value = lifecycle[group] && lifecycle[group][prop];
          if (value !== undefined) {
            style[group][prop] = value;
          }
        }
      }
    }


    // Finally look for fill pattern..
    if (building) return style;   // exception: don't apply patterns to buildings

    // If the style declaration already contains a valid pattern, we can stop here
    if (style.fill.pattern) {
      if (!this.PATTERN_DECLARATIONS.includes(style.fill.pattern)) {
        console.error(`invalid patternID: ${patternID}`);  // eslint-disable-line
      } else {
        return style;
      }
    }

    // Match the tags to the best matching `patternID`..
    let patternScore = 999;
    for (const [k, v] of Object.entries(tags)) {
      const selector = this.PATTERN_SELECTORS[k];
      if (!selector || !v) continue;

      const patternID = selector[v] ?? selector['*'];  // '*' = fallback value
      let score = Object.keys(selector).length;        // smaller groups are more selective
      if (lifecycleVals.has(v)) score = 999;           // exception: lifecycle values

      if (patternID && score <= patternScore) {
        if (!this.PATTERN_DECLARATIONS.includes(patternID)) {
          console.error(`invalid patternID: ${patternID}`);  // eslint-disable-line
          continue;
        }
        style.fill.pattern = patternID;
        patternScore = score;
        if (patternScore === 1) break;  // no need to keep looking at tags
      }
    }

    return style;


    // This just returns the value of the tag, but ignores 'no' values
    function getTag(tags, key) {
      return tags[key] === 'no' ? undefined : tags[key];
    }
  }
}
