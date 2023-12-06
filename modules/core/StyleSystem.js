import * as PIXI from 'pixi.js';
import { osmPavedTags } from '../osm/tags';
import { AbstractSystem } from './AbstractSystem';

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

export class StyleSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
  */
  constructor(context) {
    super(context);
    this.id = 'styles';
    this.context = context;
    this.dependencies = new Set(['dataloader', 'colors']);
    this.autoStart = true;
    this._started = false;

    this.DEFAULTS = {
      fill:   { width: 2, color: 0xaaaaaa, alpha: 0.3 },
      casing: { width: 5, color: 0x444444, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND },
      stroke: { width: 3, color: 0xcccccc, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND }
    };

    this.WAYS = {
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
      proposed: {
        stroke: { width: 8, color: 0xcccccc, dash: [7, 3], cap: PIXI.LINE_CAP.BUTT }
      },
      pedestrian: {
        casing: { width: 7, color: 0xffffff },
        stroke: { width: 5, color: 0x998888, dash: [8, 8], cap: PIXI.LINE_CAP.BUTT }
      },
      path: {
        casing: { width: 5, color: 0xddccaa },
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
      stream_intermittent: {
        casing: { width: 7, color: 0x444444, cap: PIXI.LINE_CAP.BUTT },
        stroke: { width: 5, color: 0x77dddd, dash: [7, 3], cap: PIXI.LINE_CAP.BUTT, }
      },
      ridge: {
        stroke: { width: 2, color: 0x8cd05f}  // rgb(140, 208, 95)
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
      railway_abandoned: {
        stroke: { dash: [7, 3], cap: PIXI.LINE_CAP.BUTT }
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
      },
      construction: {
        casing: { width: 10, color: 0xffffff},
        stroke: { width: 8, color: 0xfc6c14, dash: [10, 10], cap: PIXI.LINE_CAP.BUTT },
      },
      pipeline: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xdddddd, dash: [80, 2], cap: PIXI.LINE_CAP.BUTT }
      },
      roller_coaster: {
        casing: { width: 7, color: 0x444444 },
        stroke: { width: 5, color: 0xdddddd, dash: [10, 1], cap: PIXI.LINE_CAP.BUTT }
      },
      abandoned: {
        stroke: { width: 27, color: 0xcbd0d8, dash: [7, 3], cap: PIXI.LINE_CAP.BUTT }
      },
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

    this.STYLE_SELECTORS = {
      aeroway: {
        planned: 'proposed',
        proposed: 'proposed',
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
        abandoned: 'abandoned',
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
        planned: 'proposed',
        primary: 'primary',
        primary_link: 'primary',
        proposed: 'proposed',
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
        abandoned: 'railway_abandoned',
        planned: 'proposed',
        platform: 'footway',
        proposed: 'proposed',
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
        dam: 'default',
        weir: 'default',
        '*': 'stream'
      },
      service: {
        alley: 'special_service',
        driveway: 'special_service',
        'drive-through': 'special_service',
        parking_aisle: 'special_service',
        '*': 'special_service'
      },
      intermittent: {
        yes: 'stream_intermittent',
      },
      proposed: {
        yes: 'proposed',
      },
    };


    //
    // "pattern selectors" work exactly like style selectors.
    // They contain OSM key/value tags to match to a pattern.
    //
    // osmkey: {
    //   osmvalue: patternname
    // }
    //

    this.PATTERN_SELECTORS = {
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


    this.ROADS = {
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

    this.styleMatch = this.styleMatch.bind(this);
  }

  initAsync(){
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
          return Promise.reject(`Cannot init: ${this.id} requires ${id}`);
      }
    }
    return Promise.resolve();
  }

  startAsync() {
    this._started = true;
    return Promise.resolve();
  }

  resetAsync() {
    return Promise.resolve();
  }

  styleMatch(tags) {
    let matched = this.DEFAULTS;
    let selectivity = 999;
    let context = this.context;
    let colors = context.systems.colors.getColorScheme();

    for (const [k, v] of Object.entries(tags)) {
      const group = this.STYLE_SELECTORS[k];
      if (!group || !v) continue;

      // smaller groups are more selective
      const groupsize = Object.keys(group).length;
      const stylename = group[v] || group['*'];  // fallback value

      if (stylename && groupsize <= selectivity) {
        if (!colors[stylename] && !this.WAYS[stylename]) {
          console.error(`invalid stylename: ${stylename}`);  // eslint-disable-line
          continue;
        }
        matched = !colors[stylename] ? this.WAYS[stylename] : colors[stylename];
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
        let fallback = this.DEFAULTS[group] && this.DEFAULTS[group][prop];
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

    if (surface && this.ROADS[highway] && !osmPavedTags.surface[surface]) {
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
      const group = this.PATTERN_SELECTORS[k];
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
}
