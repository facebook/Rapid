
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
// Anything missing will just be pulled from the DEFAULT style.
//

export const COLORS = {
  fill: 0xf2a65a,
  casing: 0xc75a48,
  stroke: 0xf58549,

  red: 0x6e3144,
  green: 0x8b9216,   // rgb(140, 208, 95)
  blue: 0x77d4de,   // rgb(119, 211, 222)
  yellow: 0xfdc534,  // rgb(255, 255, 148)
  gold: 0xfbab34,   // rgb(196, 189, 25)
  orange: 0xeb8947,   // rgb(214, 136, 26)
  pink: 0xe3a4f5,   // rgb(228, 164, 245)
  teal: 0x99e1aa,   // rgb(153, 225, 170)
  lightgreen: 0xbee83f,   // rgb(191, 232, 63)
  tan: 0xf5dcba,   // rgb(245, 220, 186)
  darkgray: 0x8c8c8c,   // rgb(140, 140, 140)
  lightgray: 0xaaaaaa,   // rgb(170, 170, 170)


  motorway: {
    casing: 0x70372f,
    stroke: 0xcf2081
  },
  trunk: {
    casing: 0x70372f,
    stroke: 0xdd2f22
  },
  primary: {
    casing: 0x70372f,
    stroke: 0xf99806
  },
  secondary: {
    casing: 0x70372f,
    stroke: 0xf3f312
  },
  tertiary: {
    casing: 0x70372f,
    stroke: 0xfff9b3
  },
  unclassified: {
    casing: 0x444444,
    stroke: 0xddccaa
  },
  residential: {
    casing: 0x444444,
    stroke: 0xffffff
  },
  living_street: {
    casing: 0xffffff,
    stroke: 0xcccccc
  },
  service: {
    casing: 0x444444,
    stroke: 0xffffff
  },
  special_service: {
    casing: 0x444444,
    stroke: 0xddccaa
  },
  track: {
    casing: 0x746f6f,
    stroke: 0xc5b59f
  },

  pedestrian: {
    casing: 0xffffff,
    stroke: 0x998888
  },
  path: {
    casing: 0xddccaa,
    stroke: 0x998888
  },
  footway: {
    casing: 0xffffff,
    stroke: 0x998888
  },
  crossing_marked: {
    casing: 0xddccaa,
    stroke: 0x4c4444
  },
  crossing_unmarked: {
    casing: 0xddccaa,
    stroke: 0x776a6a
  },
  cycleway: {
    casing: 0xffffff,
    stroke: 0x58a9ed
  },
  bridleway: {
    casing: 0xffffff,
    stroke: 0xe06d5f
  },
  corridor: {
    casing: 0xffffff,
    stroke: 0x8cd05f
  },
  steps: {
    casing: 0xffffff,
    stroke: 0x81d25c
  },

  river: {
    casing: 0x444444,
    stroke: 0x77dddd
  },
  stream: {
    casing: 0x444444,
    stroke: 0x77dddd
  },
  ridge: {
    stroke: {
      color: 0x8cd05f
    }
  },

  runway: {
    casing: 0x000000,
    stroke: 0xffffff
  },
  taxiway: {
    casing: 0x444444,
    stroke: 0xffff00
  },

  railway: {
    casing: 0x555555,
    stroke: 0xeeeeee,
  },

  ferry: {
    stroke: 0x58a9ed
  },

  boundary: {
    casing: 0x82b5fe,
    stroke: 0xffffff
  },
  boundary_park: {
    casing: 0x82b5fe,
    stroke: 0xb0e298
  },

  barrier: {
    casing: { alpha: 0 },  // disable
    stroke: 0xdddddd,
  },
  barrier_wall: {
    casing: { alpha: 0 },  // disable
    stroke: 0xdddddd,
  },
  barrier_hedge: {
    fill:   0x8cd05f,
    stroke: 0x8cd05f,
  },

  tree_row: {
    casing: 0x444444,
    stroke: 0x8cd05f
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
    ridge: 'ridge',
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
    '*': 'railway'
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

  for (const [k, v] of Object.entries(tags)) {
    const group = STYLE_SELECTORS[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    const groupsize = Object.keys(group).length;
    const stylename = group[v] || group['*'];  // fallback value

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
    surface = surface || 'dirt';   // default unimproved (non-grade1) tracks to 'dirt' surface
  }

  if (bridge || embankment || cutting) {
    style.casing.width += 7;
    style.casing.color = 0x000000;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
    if (embankment || cutting) {
      style.casing.dash = [2, 4];
    }
  }
  if (tunnel) {
    style.stroke.alpha = 0.5;
  }

  if (surface && ROADS[highway] && !osmPavedTags.surface[surface]) {
    if (!bridge) style.casing.color = 0xcccccc;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
    style.casing.dash = [4, 4];
  }

  // Look for fill pattern
  if (style.fill.pattern) return style;   // already has a pattern defined by the style
  if (building) return style;             // don't apply patterns to buildings

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


  // This just returns the value of the tag, but ignores 'no' values
  function getTag(tags, key) {
    return tags[key] === 'no' ? undefined : tags[key];
  }

}
