import * as PIXI from 'pixi.js';
import { osmPavedTags } from '../osm/tags';

//
// A "style" is a bundle of properties to say how things should look.
// Each "style" looks like this:
//
// stylename: {
//   fill:   { props },
//   casing: { props },
//   stroke: { props }
// }
//
// Available property groups:
//   `fill`   - properties used when drawing feature as a filled area
//   `casing` - properties used when drawing feature as a line (casing draws below stroke)
//   `stroke` - properties used when drawing feature as a line
//
// Available properties:
//   `width` - line width in pixel (for fills, this is the width of the outline)
//   `color` - the color
//   `alpha` - 0 = transparent/invisible, 1 = filled
//   `cap`   - `PIXI.LINE_CAP.` `BUTT`, `SQUARE`, or `ROUND`
//   `join`  - `PIXI.LINE_JOIN.` `BEVEL`, `MITER`, or `ROUND`
//   `dash`  - array of pixels on/off - e.g. `[20, 5, 5, 5]`
//
// The fill group also supports:
//   `pattern` - supported pattern (see dist/img/pattern/* for these)
//
//  Anything missing will just be pulled from the DEFAULT style.
//

const STYLES = {
  DEFAULT: {
    fill:   { width: 2, color: 0xaaaaaa, alpha: 0.3 },
    casing: { width: 5, color: 0x444444, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND },
    stroke: { width: 3, color: 0xcccccc, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND }
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
    stroke: { width: 5, color: 0x998888, dash: [8, 8], cap: PIXI.LINE_CAP.BUTT }
  },
  path: {
    casing: { width: 5, color: 0xffffff },
    stroke: { width: 3, color: 0x998888, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  footway: {
    casing: { width: 5, color: 0xffffff },
    stroke: { width: 3, color: 0x998888, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  crossing_marked: {
    casing: { width: 5, color: 0xddccaa },
    stroke: { width: 3, color: 0x4c4444, dash: [6, 3], cap: PIXI.LINE_CAP.BUTT }
  },
  crossing_unmarked: {
    casing: { width: 5, color: 0xddccaa },
    stroke: { width: 3, color: 0x776a6a, dash: [6, 4], cap: PIXI.LINE_CAP.BUTT }
  },
  cycleway: {
    casing: { width: 5, color: 0xffffff },
    stroke: { width: 3, color: 0x58a9ed, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  bridleway: {
    casing: { width: 5, color: 0xffffff },
    stroke: { width: 3, color: 0xe06d5f, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  corridor: {
    casing: { width: 5, color: 0xffffff },
    stroke: { width: 3, color: 0x8cd05f, dash: [2, 8], cap: PIXI.LINE_CAP.ROUND }
  },
  steps: {
    casing: { width: 5, color: 0xffffff },
    stroke: { width: 3, color: 0x81d25c, dash: [3, 3], cap: PIXI.LINE_CAP.BUTT }
  },

  river: {
    casing: { width: 10, color: 0x444444 },
    stroke: { width: 8, color: 0x77dddd }
  },
  stream: {
    casing: { width: 7, color: 0x444444 },
    stroke: { width: 5, color: 0x77dddd }
  },

  runway: {
    casing: { width: 10, color: 0x000000, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 8, color: 0xffffff, dash: [24, 48], cap: PIXI.LINE_CAP.BUTT }
  },
  taxiway: {
    casing: { width: 7, color: 0x444444 },
    stroke: { width: 5, color: 0xffff00 }
  },

  railway: {
    casing: { width: 7, color: 0x555555, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: 0xeeeeee, dash: [12, 12], cap: PIXI.LINE_CAP.BUTT,  }
  },

  railway_narrow: {
    casing: { width: 5, color: 0x555555, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: 0xeeeeee, dash: [12, 12], cap: PIXI.LINE_CAP.BUTT,  }
  },

  railway_deemphasized: {
    casing: { alpha: 0 },
    stroke: { width: 2, color: 0xaaaaaa, dash: [12, 12], cap: PIXI.LINE_CAP.BUTT,  }
  },

  ferry: {
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: 0x58a9ed, dash: [12, 8], cap: PIXI.LINE_CAP.BUTT }
  },

  boundary: {
    casing: { width: 6, color: 0x82b5fe, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: 0xffffff, dash: [20, 5, 5, 5], cap: PIXI.LINE_CAP.BUTT }
  },
  boundary_park: {
    casing: { width: 6, color: 0x82b5fe, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: 0xb0e298, dash: [20, 5, 5, 5], cap: PIXI.LINE_CAP.BUTT }
  },

  barrier: {
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: 0xdddddd, dash: [10, 5, 1, 5], cap: PIXI.LINE_CAP.ROUND }
  },
  barrier_wall: {
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: 0xdddddd, dash: [10, 5, 1, 5], cap: PIXI.LINE_CAP.ROUND }
  },
  barrier_hedge: {
    fill:   { color: 0x8cd05f, alpha: 0.3 },   // rgb(140, 208, 95)
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: 0x8cd05f, dash: [10, 5, 1, 5], cap: PIXI.LINE_CAP.ROUND }
  },

  tree_row: {
    casing: { width: 7, color: 0x444444 },
    stroke: { width: 5, color: 0x8cd05f }
  }
};


//
// A "style selector" contains OSM key/value tags to match to a style.
// Each "style selector" looks like this:
//
// osmkey: {
//   osmvalue: stylename
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

const STYLE_SELECTORS = {
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
    groyne: 'barrier_wall'
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
    rock: 'darkgray',
    sand: 'yellow',
    scree: 'darkgray',
    scrub: 'yellow',
    shingle: 'darkgray',
    stone: 'darkgray',
    tree_row: 'tree_row',
    water: 'blue',
    wetland: 'teal',
    '*': 'green'
  },
  power: {
    'plant': 'pink'
  },
  railway: {
    platform: 'footway',
    // Main rail lines include preserved lines
    // TODO perhaps separate these out
    'rail': 'railway',
    'preserved': 'railway',
    // Narrow gauge and tram lines rendered with smaller casing
    'narrow_gauge': 'railway_narrow',
    'tram': 'railway_narrow',
    'light_rail': 'railway_narrow',
    // construction, abandoned, disused, razed and historic are all treated the same
    // because they are either not there yet or no longer there.
    // there is evidence on the ground in all of these cases.
    'construction': 'railway_deemphasized',
    'proposed': 'railway_deemphasized',
    'abandoned': 'railway_deemphasized',
    'razed': 'railway_deemphasized',
    'historic': 'railway_deemphasized',
    'disused': 'railway_deemphasized',
    // catch-all for all other railway types
    // '*': 'railway',
    // dummy rules to make railway be lower priority than highway
    // TODO: remove this when we have a better way to do this
    'dummy1': 'railway',
    'dummy2': 'railway',
    'dummy3': 'railway',
    'dummy4': 'railway',
    'dummy5': 'railway',
    'dummy6': 'railway',
    'dummy7': 'railway',
    'dummy8': 'railway',
    'dummy9': 'railway',
    'dummy10': 'railway',
    'dummy11': 'railway',
    'dummy12': 'railway',
    'dummy13': 'railway',
    'dummy14': 'railway',
    'dummy15': 'railway',
    'dummy16': 'railway',
    'dummy17': 'railway',
    'dummy18': 'railway',
    'dummy19': 'railway',
    'dummy20': 'railway',
    'dummy21': 'railway',
    'dummy22': 'railway',
    'dummy23': 'railway',
    'dummy24': 'railway',
    'dummy25': 'railway',
    'dummy26': 'railway',
    'dummy27': 'railway',
    'dummy28': 'railway',
    'dummy29': 'railway',
    'dummy30': 'railway',
  },

  route: {
    'ferry': 'ferry'
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
    dam: 'DEFAULT',
    weir: 'DEFAULT',
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
// "pattern selectors" work exactly like style selectors.
// They contain OSM key/value tags to match to a pattern.
//
// osmkey: {
//   osmvalue: patternname
// }
//

const PATTERN_SELECTORS = {
  amenity: {
    fountain: 'water_standing',
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
    beach: 'dots',
    grassland: 'grass',
    sand: 'dots',
    scrub: 'bushes',
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


const ROADS = {
  motorway: true,
  motorway_link: true,
  trunk: true,
  trunk_link: true,
  primary: true,
  primary_link: true,
  secondary: true,
  secondary_link: true,
  tertiary: true,
  tertiary_link: true,
  unclassified: true,
  unclassified_link: true,
  residential: true,
  residential_link: true,
  living_street: true,
  living_street_link: true,
  service: true,
  service_link: true,
  bus_guideway: true,
  track: true
};


export function styleMatch(tags) {
  let matched = STYLES.DEFAULT;
  let selectivity = 999;

  for (const k in tags) {
    const v = tags[k];
    const group = STYLE_SELECTORS[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    let groupsize = Object.keys(group).length;
    let stylename = group[v];
    if (!stylename) stylename = group['*'];  // fallback value

    if (stylename && groupsize <= selectivity) {
      if (!STYLES[stylename]) {
        console.error(`invalid stylename: ${stylename}`);  // eslint-disable-line
        continue;
      }
      matched = STYLES[stylename];
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  // copy style, filling in defaults
  let style = {};
  for (const group of ['fill', 'casing', 'stroke']) {
    style[group] = {};
    for (const prop of ['width', 'color', 'alpha', 'cap', 'dash']) {
      let value = matched[group] && matched[group][prop];
      if (value !== undefined) {
        style[group][prop] = value;
        continue;
      }
      let fallback = STYLES.DEFAULT[group] && STYLES.DEFAULT[group][prop];
      if (fallback !== undefined) {
        style[group][prop] = fallback;
      }
    }
  }

  // overrides
  if (tags.bridge) {
    style.casing.width += 7;
    style.casing.color = 0x000000;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
  }
  if (tags.tunnel) {
    style.stroke.alpha = 0.5;
  }

  // determine surface for paved/unpaved
  let surface = tags.surface;
  let highway = tags.highway;
  if (highway === 'track' && tags.tracktype !== 'grade1') {
    surface = surface || 'dirt';
  }
  if (surface && ROADS[highway] && !osmPavedTags.surface[surface]) {
    if (!tags.bridge) style.casing.color = 0xcccccc;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
    style.casing.dash = [4, 4];
  }

  if (style.fill.pattern) return style;  // already has a pattern defined by the style
  if (tags.building) return style;       // don't apply patterns to buildings

  // Otherwise, look for a matching fill pattern.
  selectivity = 999;
  for (const k in tags) {
    const v = tags[k];
    const group = PATTERN_SELECTORS[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    let groupsize = Object.keys(group).length;
    let patternname = group[v];
    if (!patternname) patternname = group['*'];  // fallback value

    if (patternname && groupsize <= selectivity) {
      style.fill.pattern = patternname;
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  return style;
}
