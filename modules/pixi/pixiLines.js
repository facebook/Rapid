import * as PIXI from 'pixi.js';
import { DashLine } from 'pixi-dashed-line';
import { geoScaleToZoom } from '@id-sdk/math';

import { osmPavedTags } from '../osm/tags';
import { getLineSegments } from './pixiHelpers';


export function pixiLines(context, featureCache) {
  const ONEWAY_SPACING = 35;
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  //
  function init(layer) {
    const midpoint = new PIXI.Graphics()
      .lineStyle(1, 0x000000)
      .beginFill(0xffffff, 1)
      .drawPolygon([-3,4, 5,0, -3,-4])
      .endFill();

    const oneway = new PIXI.Graphics()
      .beginFill(0x030303, 1)
      .drawPolygon([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.midpoint = renderer.generateTexture(midpoint, options);
    _textures.oneway = renderer.generateTexture(oneway, options);

    // initialize levels (bridge/tunnel/etc)
    for (let i = -10; i <= 10; i++) {
      const lvl = new PIXI.Container();
      lvl.name = i.toString();
      lvl.zIndex = i;
      lvl.sortableChildren = true;
      layer.addChild(lvl);
    }

    _didInit = true;
  }


  //
  // render
  //
  function renderLines(layer, projection, entities) {
    if (!_didInit) init(layer);

    const graph = context.graph();
    const k = projection.scale();
    const zoom = geoScaleToZoom(k);
    const SHOWBBOX = false;

    function isUntaggedMultipolygonRing(entity) {
      if (entity.hasInterestingTags()) return false;
      return graph.parentRelations(entity)
        .some(relation => relation.isMultipolygon());
    }


    function isLine(entity) {
      return entity.type === 'way' &&
        entity.geometry(graph) === 'line' &&
        !isUntaggedMultipolygonRing(entity);
    }

    // enter/update
    entities
      .filter(isLine)
      .forEach(function prepareLine(entity) {
        let feature = featureCache.get(entity.id);

        if (!feature) {   // make line if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = geojson.coordinates;

          // Place this line on the correct level (bridge/tunnel/etc)
          const lvl = entity.layer().toString();
          const level = layer.getChildByName(lvl);

          const container = new PIXI.Container();
          container.name = entity.id;
          container.zIndex = getzIndex(entity.tags);
          level.addChild(container);

          const casing = new PIXI.Graphics();
          casing.name = entity.id + '-casing';
          container.addChild(casing);

          const stroke = new PIXI.Graphics();
          stroke.name = entity.id + '-stroke';
          container.addChild(stroke);

          const style = styleMatch(entity.tags);

          const bounds = new PIXI.Rectangle();

          const bbox = new PIXI.Graphics();
          bbox.name = entity.id + '-bbox';
          bbox.visible = SHOWBBOX;
          container.addChild(bbox);

          feature = {
            type: 'line',
            displayObject: container,
            bounds: bounds,
            coords: coords,
            casing: casing,
            stroke: stroke,
            bbox: bbox,
            style: style
          };

          if (entity.isOneWay()) {
            const oneways = new PIXI.Container();
            oneways.name = entity.id + '-oneways';
            container.addChild(oneways);
            feature.oneways = oneways;
          }

          featureCache.set(entity.id, feature);
        }

        // Remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;

        // Reproject and recalculate the bounding box
        let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
        let points = [];

        feature.coords.forEach(coord => {
          const [x, y] = projection.project(coord);
          points.push([x, y]);

          [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
          [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
        });
        if (entity.tags.oneway === '-1') {
          points.reverse();
        }

        const [w, h] = [maxX - minX, maxY - minY];
        feature.bounds.x = minX;
        feature.bounds.y = minY;
        feature.bounds.width = w;
        feature.bounds.height = h;

        updateGraphic('casing', feature.casing);
        updateGraphic('stroke', feature.stroke);


        if (feature.oneways) {
          const segments = getLineSegments(points, ONEWAY_SPACING);
          feature.oneways.removeChildren();

          segments.forEach(segment => {
            segment.coords.forEach(([x, y]) => {
              const arrow = new PIXI.Sprite(_textures.oneway);
              arrow.anchor.set(0.5, 0.5);  // middle, middle
              arrow.x = x;
              arrow.y = y;
              arrow.rotation = segment.angle;
              feature.oneways.addChild(arrow);
            });
          });
        }

        if (SHOWBBOX) {
          feature.bbox
            .clear()
            .lineStyle(1, 0x66ff66)
            .drawShape(feature.bounds);
        }

        function updateGraphic(which, graphic) {
          const minwidth = (which === 'casing' ? 3 : 2);
          let width = feature.style[which].width;
          if (zoom < 17) width -= 2;
          if (zoom < 15) width -= 2;
          if (width < minwidth) width = minwidth;

          let g = graphic.clear();
          if (feature.style[which].alpha === 0) return;

          if (feature.style[which].dash) {
            g = new DashLine(g, {
              dash: feature.style[which].dash,
              color: feature.style[which].color,
              width: width,
              alpha: feature.style[which].alpha || 1.0,
              join: feature.style[which].join || PIXI.LINE_JOIN.ROUND,
              cap: feature.style[which].cap || PIXI.LINE_CAP.ROUND
            });
          } else {
            g = g.lineStyle({
              color: feature.style[which].color,
              width: width,
              alpha: feature.style[which].alpha || 1.0,
              join: feature.style[which].join || PIXI.LINE_JOIN.ROUND,
              cap: feature.style[which].cap || PIXI.LINE_CAP.ROUND
            });
          }

          points.forEach(([x, y], i) => {
            if (i === 0) {
              g.moveTo(x, y);
            } else {
              g.lineTo(x, y);
            }
          });
        }
      });
  }

  return renderLines;
}




const STYLES = {
  default: {
    casing: {
      width: 5,
      color: 0x444444
    },
    stroke: {
      width: 3,
      color: 0xcccccc
    }
  },

  motorway: {
    casing: {
      width: 10,
      color: 0x70372f
    },
    stroke: {
      width: 8,
      color: 0xcf2081
    }
  },
  trunk: {
    casing: {
      width: 10,
      color: 0x70372f
    },
    stroke: {
      width: 8,
      color: 0xdd2f22
    }
  },
  primary: {
    casing: {
      width: 10,
      color: 0x70372f
    },
    stroke: {
      width: 8,
      color: 0xf99806
    }
  },
  secondary: {
    casing: {
      width: 10,
      color: 0x70372f
    },
    stroke: {
      width: 8,
      color: 0xf3f312
    }
  },
  tertiary: {
    casing: {
      width: 10,
      color: 0x70372f
    },
    stroke: {
      width: 8,
      color: 0xfff9b3
    }
  },
  unclassified: {
    casing: {
      width: 10,
      color: 0x444444
    },
    stroke: {
      width: 8,
      color: 0xddccaa
    }
  },
  residential: {
    casing: {
      width: 10,
      color: 0x444444
    },
    stroke: {
      width: 8,
      color: 0xffffff
    }
  },
  living_street: {
    casing: {
      width: 7,
      color: 0xffffff
    },
    stroke: {
      width: 5,
      color: 0xcccccc
    }
  },
  service: {
    casing: {
      width: 7,
      color: 0x444444
    },
    stroke: {
      width: 5,
      color: 0xffffff
    }
  },
  special_service: {
    casing: {
      width: 7,
      color: 0x444444
    },
    stroke: {
      width: 5,
      color: 0xddccaa
    }
  },
  track: {
    casing: {
      width: 7,
      color: 0x746f6f
    },
    stroke: {
      width: 5,
      color: 0xc5b59f
    }
  },

  pedestrian: {
    casing: {
      width: 7,
      color: 0xffffff
    },
    stroke: {
      dash: [8, 8],
      cap: PIXI.LINE_CAP.BUTT,
      width: 5,
      color: 0x998888
    }
  },
  path: {
    casing: {
      width: 5,
      color: 0xffffff
    },
    stroke: {
      dash: [6, 6],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x998888
    }
  },
  footway: {
    casing: {
      width: 5,
      color: 0xffffff
    },
    stroke: {
      dash: [6, 6],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x998888
    }
  },
  crossing_marked: {
    casing: {
      width: 5,
      color: 0xddccaa
    },
    stroke: {
      dash: [6, 3],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x4c4444
    }
  },
  crossing_unmarked: {
    casing: {
      width: 5,
      color: 0xddccaa
    },
    stroke: {
      dash: [6, 4],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x776a6a
    }
  },
  cycleway: {
    casing: {
      width: 5,
      color: 0xffffff
    },
    stroke: {
      dash: [6, 6],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x58a9ed
    }
  },
  bridleway: {
    casing: {
      width: 5,
      color: 0xffffff
    },
    stroke: {
      dash: [6, 6],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0xe06d5f
    }
  },
  corridor: {
    casing: {
      width: 5,
      color: 0xffffff
    },
    stroke: {
      dash: [2, 8],
      cap: PIXI.LINE_CAP.ROUND,
      width: 3,
      color: 0x8cd05f
    }
  },
  steps: {
    casing: {
      width: 5,
      color: 0xffffff
    },
    stroke: {
      dash: [3, 3],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x81d25c
    }
  },

  river: {
    casing: {
      width: 10,
      color: 0x444444
    },
    stroke: {
      width: 8,
      color: 0x77dddd
    }
  },
  stream: {
    casing: {
      width: 7,
      color: 0x444444
    },
    stroke: {
      width: 5,
      color: 0x77dddd
    }
  },

  runway: {
    casing: {
      cap: PIXI.LINE_CAP.BUTT,
      width: 10,
      color: 0x000000
    },
    stroke: {
      dash: [24, 48],
      cap: PIXI.LINE_CAP.BUTT,
      width: 8,
      color: 0xffffff
    }
  },
  taxiway: {
    casing: {
      width: 7,
      color: 0x444444
    },
    stroke: {
      width: 5,
      color: 0xffff00
    }
  },

  railway: {
    casing: {
      width: 7,
      cap: PIXI.LINE_CAP.BUTT,
      color: 0x555555
    },
    stroke: {
      dash: [12, 12],
      cap: PIXI.LINE_CAP.BUTT,
      width: 2,
      color: 0xeeeeee
    }
  },

  ferry: {
    casing: {
      alpha: 0,  // disable it
      width: 2,
      cap: PIXI.LINE_CAP.BUTT,
      color: 0x000000
    },
    stroke: {
      dash: [12, 8],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x58a9ed
    }
  },

  boundary: {
    casing: {
      width: 6,
      cap: PIXI.LINE_CAP.BUTT,
      color: 0x82b5fe
    },
    stroke: {
      dash: [20, 5, 5, 5],
      cap: PIXI.LINE_CAP.BUTT,
      width: 2,
      color: 0xffffff
    }
  },
  boundary_park: {
    casing: {
      width: 6,
      cap: PIXI.LINE_CAP.BUTT,
      color: 0x82b5fe
    },
    stroke: {
      dash: [20, 5, 5, 5],
      cap: PIXI.LINE_CAP.BUTT,
      width: 2,
      color: 0xb0e298
    }
  },

  barrier: {
    casing: {
      alpha: 0,  // disable it
      width: 2,
      cap: PIXI.LINE_CAP.ROUND,
      color: 0x000000
    },
    stroke: {
      dash: [15, 5, 1, 5],
      cap: PIXI.LINE_CAP.ROUND,
      width: 3,
      color: 0xdddddd
    }
  },
  barrier_wall: {
    casing: {
      alpha: 0,  // disable it
      width: 2,
      cap: PIXI.LINE_CAP.ROUND,
      color: 0x000000
    },
    stroke: {
      dash: [15, 5, 1, 5],
      cap: PIXI.LINE_CAP.ROUND,
      width: 3,
      color: 0xdddddd
    }
  },
  barrier_hedge: {
    casing: {
      alpha: 0,  // disable it
      width: 2,
      cap: PIXI.LINE_CAP.BUTT,
      color: 0x000000
    },
    stroke: {
      dash: [16, 3, 9, 3],
      cap: PIXI.LINE_CAP.BUTT,
      width: 3,
      color: 0x8cd05f
    }
  }

};

const TAGSTYLES = {
  aeroway: {
    runway: 'runway',
    taxiway: 'taxiway'
  },
  barrier: {
    hedge: 'barrier_hedge',
    retaining_wall: 'barrier_wall',
    city_wall: 'barrier_wall',
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
  highway: {
    motorway: 'motorway',
    motorway_link: 'motorway',
    trunk: 'trunk',
    trunk_link: 'trunk',
    primary: 'primary',
    primary_link: 'primary',
    secondary: 'secondary',
    secondary_link: 'secondary',
    tertiary: 'tertiary',
    tertiary_link: 'tertiary',
    unclassified: 'unclassified',
    unclassified_link: 'unclassified',
    residential: 'residential',
    residential_link: 'residential',
    living_street: 'living_street',
    living_street_link: 'living_street',
    service: 'service',
    service_link: 'service',
    bus_guideway: 'special_service',
    track: 'track',
    pedestrian: 'pedestrian',
    path: 'path',
    footway: 'footway',
    cycleway: 'cycleway',
    bridleway: 'bridleway',
    corridor: 'corridor',
    steps: 'steps'
  },
  man_made: {
    groyne: 'barrier_wall',
    breakwater: 'barrier_wall'
  },
  railway: {
    '*': 'railway'
  },
  route: {
    'ferry': 'ferry'
  },
  waterway: {
    river: 'river',
    dam: 'default',
    '*': 'stream'
  },
  service: {
    '*': 'special_service'
  }
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

const HIGHWAYSTACK = {
  motorway: 0,
  motorway_link: -1,
  trunk: -2,
  trunk_link: -3,
  primary: -4,
  primary_link: -5,
  secondary: -6,
  tertiary: -7,
  unclassified: -8,
  residential: -9,
  service: -10,
  track: -11,
  footway: -12
};


function getzIndex(tags) {
  return HIGHWAYSTACK[tags.highway] || 0;
}


function styleMatch(tags) {
  let style = STYLES.default;
  let selectivity = 999;

  for (const k in tags) {
    const v = tags[k];
    const group = TAGSTYLES[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    let groupsize = Object.keys(group).length;
    let stylename = group[v];
    if (!stylename) stylename = group['*'];  // fallback value

    if (stylename && groupsize <= selectivity) {
      style = STYLES[stylename];
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  style = JSON.parse(JSON.stringify(style));  // deep copy

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

  return style;
}
