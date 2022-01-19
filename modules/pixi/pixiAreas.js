import * as PIXI from 'pixi.js';
import { svgTagPattern } from '../svg/tag_pattern';

const _innerStrokeWidth = 32;

export function pixiAreas(context) {
  let _didInit = false;
  let _initAreas = false;
  let _textures = new Map();
  let _patternKeys = [];

  function initAreas(context) {
    _patternKeys =    ['bushes', 'cemetery_christian', 'construction', 'farmyard', 'forest_leafless', 'landfill', 'pond', 'waves', 'wetland_marsh',
      'cemetery', 'cemetery_jewish', 'dots', 'forest', 'forest_needleleaved', 'lines', 'quarry', 'wetland', 'wetland_reedbed',
      'cemetery_buddhist', 'cemetery_muslim', 'farmland', 'forest_broadleaved', 'grass', 'orchard', 'vineyard', 'wetland_bog', 'wetland_swamp'];

    _patternKeys.forEach(key => {
      _textures.set(key, new PIXI.Texture.from(`dist/img/pattern/${key}.png`));
    });
    _didInit = true;
  }



  function getPixiTagPatternKey(tags) {

    let svgPattern = svgTagPattern(tags);
    if (svgPattern) {
      let key = svgPattern.split('-')[1];

      if (_patternKeys.includes(key)) {
        return key;
      }
    }
    return null;
  }

  let _cache = new Map();

  //
  // render
  //
  function renderAreas(layer, projection, entities) {

    if (!_initAreas) {
      initAreas(context);
      _initAreas = true;
    }

    const graph = context.graph();
    const k = projection.scale();

    function isPolygon(entity) {
      return (entity.type === 'way' || entity.type === 'relation') && entity.geometry(graph) === 'area';
    }

    const data = entities.filter(isPolygon);

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullAreas([id, datum]) {
      datum.areaContainer.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareAreas(entity) {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make poly if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = (geojson.type === 'Polygon') ? geojson.coordinates[0]
            : (geojson.type === 'MultiPolygon') ? geojson.coordinates[0][0] : [];   // outer ring only
          if (!coords.length) return;

          const areaContainer = new PIXI.Container();
          const fillContainer = new PIXI.Container();
          fillContainer.name = 'fill';
          const outlineGraphics = new PIXI.Graphics();
          const textureGraphics = new PIXI.Graphics();
           textureGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;

          const fillGraphics = new PIXI.Graphics();

          const mask = new PIXI.Graphics();
          mask.isMask = true;

          mask.name = entity.id - '-mask';
          outlineGraphics.name = entity.id + '-outline';
          textureGraphics.name = 'texture';
          fillGraphics.name = 'fill';
          fillGraphics.mask = mask;
          textureGraphics.mask = mask;
          areaContainer.addChild(outlineGraphics);
          areaContainer.addChild(fillContainer);
          layer.addChild(areaContainer);

          fillContainer.addChild(fillGraphics);
          fillContainer.addChild(textureGraphics);
          fillContainer.addChild(mask);

          const colorMatrix = new PIXI.filters.AlphaFilter(0.25);
          fillContainer.filters = [colorMatrix];

          let patternKey = getPixiTagPatternKey(entity.tags);
          const style = styleMatch(entity.tags);

          datum = {
            coords: coords,
            areaContainer: areaContainer,
            outlineGraphics: outlineGraphics,
            textureGraphics: textureGraphics,
            fillContainer: fillContainer,
            fillGraphics: fillGraphics,
            patternKey: patternKey,
            mask: mask,
            style: style,
          };

          _cache.set(entity.id, datum);
        }

        // remember scale and reproject only when it changes
        if (k === datum.k) return;
        datum.k = k;

        let path = [];
        datum.coords.forEach(coord => {
          const p = projection.project(coord);
          path.push(p[0], p[1]);
        });

        var isBuilding = (entity.tags.building && entity.tags.building !== 'no') ||
          (entity.tags['building:part'] && entity.tags['building:part'] !== 'no');


        // Inner stroke width refers to the masked 'stroke' that fills the interior pixels of an area,
        // leaving an empty 'center' portion if the area is large enough.
        // Buildings get special treatment and are filled completely.
        if (!isBuilding) {
          datum.mask
            .clear()
            .lineStyle(1, datum.style.color)
            .beginFill(datum.style.color, 1.0)
            .drawPolygon(path)
            .endFill();

          datum.mask.isMask = true;
        }



        datum.fillGraphics
          .clear()
          .lineStyle({
            width: isBuilding ? datum.style.width : _innerStrokeWidth * 2,
            color: datum.style.color,
          })
          .beginFill(datum.style.color, isBuilding ? datum.style.alpha : 0.0)
          .drawPolygon(path)
          .endFill();

        if (datum.patternKey) {

          datum.textureGraphics
            .clear()
            .lineTextureStyle({
              width: _innerStrokeWidth * 2,
               color: datum.style.color,
              texture: _textures.get(datum.patternKey),
            })
            .drawPolygon(path);

        }

        datum.outlineGraphics
          .clear()
           .lineStyle(datum.style.width, datum.style.color)
          .drawPolygon(path);


      });
  }

  return renderAreas;
}


const STYLES = {
  red: {
    width: 2,
    color: 0xe06e5f,  // rgba(224, 110, 95)
    alpha: 0.3
  },
  green: {
    width: 2,
    color: 0x8cd05f,  // rgb(140, 208, 95)
    alpha: 0.3
  },
  blue: {
    width: 2,
    color: 0x77d4de,  // rgb(119, 211, 222)
    alpha: 0.3
  },
  yellow: {
    width: 2,
    color: 0xffff94,  // rgb(255, 255, 148)
    alpha: 0.25
  },
  gold: {
    width: 2,
    color: 0xc4be19,  // rgb(196, 189, 25)
    alpha: 0.3
  },
  orange: {
    width: 2,
    color: 0xd6881a,  // rgb(214, 136, 26)
    alpha: 0.3
  },
  pink: {
    width: 2,
    color: 0xe3a4f5,  // rgb(228, 164, 245)
    alpha: 0.3
  },
  teal: {
    width: 2,
    color: 0x99e1aa,  // rgb(153, 225, 170)
    alpha: 0.3
  },
  lightgreen: {
    width: 2,
    color: 0xbee83f,  // rgb(191, 232, 63)
    alpha: 0.3
  },
  tan: {
    width: 2,
    color: 0xf5dcba,  // rgb(245, 220, 186)
    alpha: 0.3
  },
  darkgray: {
    width: 2,
    color: 0x8c8c8c,  // rgb(140, 140, 140)
    alpha: 0.5
  },
  lightgray: {
    width: 2,
    color: 0xaaaaaa,  // rgb(170, 170, 170)
    alpha: 0.3
  }
};

const TAGSTYLES = {
  amenity: {
    fountain: 'blue',
    childcare: 'yellow',
    kindergarten: 'yellow',
    school: 'yellow',
    college: 'yellow',
    university: 'yellow',
    research_institute: 'yellow',
    parking: 'darkgray'
  },
  building: {
    '*': 'red'
  },
  construction: {
    '*': 'gold'
  },
  barrier: {
    hedge: 'green'
  },
  golf: {
    'green': 'lightgreen'
  },
  landuse: {
    flowerbed: 'green',
    forest: 'green',
    grass: 'green',
    recreation_ground: 'green',
    village_green: 'green',
    residential: 'gold',
    retail: 'orange',
    commercial: 'orange',
    landfill: 'orange',
    military: 'orange',
    industrial: 'pink',
    cemetery: 'lightgreen',
    farmland: 'lightgreen',
    meadow: 'lightgreen',
    orchard: 'lightgreen',
    vineyard: 'lightgreen',
    farmyard: 'tan',
    railway: 'darkgray',
    quarry: 'darkgray'
  },
  leisure: {
    garden: 'green',
    golf_course: 'green',
    nature_reserve: 'green',
    park: 'green',
    pitch: 'green',
    track: 'yellow',
    swimming_pool: 'blue'
  },
  man_made: {
    adit: 'darkgray',
    groyne: 'darkgray',
    breakwater: 'darkgray'
  },
  military: {
    '*': 'orange'
  },
  natural: {
    bay: 'blue',
    water: 'blue',
    beach: 'yellow',
    sand: 'yellow',
    scrub: 'yellow',
    wetland: 'teal',
    bare_rock: 'darkgray',
    cave_entrance: 'darkgray',
    cliff: 'darkgray',
    rock: 'darkgray',
    scree: 'darkgray',
    stone: 'darkgray',
    shingle: 'darkgray',
    glacier: 'lightgray',
    '*': 'green'
  },
  power: {
    'plant': 'pink'
  },
  sport: {
    beachvolleyball: 'yellow',
    baseball: 'yellow',
    softball: 'yellow',
    basketball: 'darkgray',
    skateboard: 'darkgray'
  },
  waterway: {
    dam: 'darkgray',
    weir: 'darkgray'
  }
};


function styleMatch(tags) {
  let style = STYLES.lightgray;  // default
  let selectivity = 999;

  for (const k in tags) {
    const v = tags[k];
    const group = TAGSTYLES[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    let groupsize = Object.keys(group).length;
    let stylename = group[v];
    if (!stylename) stylename = group['*'];  // fallback value

    if (stylename && groupsize < selectivity) {
      style = STYLES[stylename];
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  return style;
}
