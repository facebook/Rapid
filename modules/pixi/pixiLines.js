import * as PIXI from 'pixi.js';
import { DashLine } from 'pixi-dashed-line';
import { osmPavedTags } from '../osm/tags';


export function pixiLines(context) {
  let _cache = new Map();


  function renderLines(layer, graph, entities) {
    const zoom = context.map().zoom();

    let data = entities
      .filter(entity => entity.geometry(graph) === 'line');

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullLines([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareLines(entity) {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make line if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = geojson.coordinates;

          const casing = new PIXI.Graphics();
          const stroke = new PIXI.Graphics();

          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(casing);
          container.addChild(stroke);

          layer.addChild(container);

          const style = styleMatch(entity.tags);

          datum = {
            coords: coords,
            container: container,
            style: style
          };

          _cache.set(entity.id, datum);
        }

        // update
        const points = datum.coords.map(coord => context.projection(coord));

        datum.container.children.forEach((graphic, index) => {
          const which = (index === 0 ? 'casing' : 'stroke');
          let width = datum.style[which].width;
          if (zoom < 17) width -= 2;
          if (zoom < 15) width -= 2;
          if (width < 0) width = 0;

          let g = graphic.clear();

          if (datum.style[which].dash) {
            g = new DashLine(g, {
              dash: datum.style[which].dash,
              color: datum.style[which].color,
              width: width,
              alpha: datum.style[which].alpha || 1.0,
              join: datum.style[which].join || PIXI.LINE_JOIN.ROUND,
              cap: datum.style[which].cap || PIXI.LINE_CAP.ROUND
            });
          } else {
            g = g.lineStyle({
              color: datum.style[which].color,
              width: width,
              alpha: datum.style[which].alpha || 1.0,
              join: datum.style[which].join || PIXI.LINE_JOIN.ROUND,
              cap: datum.style[which].cap || PIXI.LINE_CAP.ROUND
            });
          }

          points.forEach(([x, y], i) => {
            if (i === 0) {
              g.moveTo(x, y);
            } else {
              g.lineTo(x, y);
            }
          });
        });

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
      color: 0xfff6e4
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
  }
};

const TAGSTYLES = {
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
    track: 'track'
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


function styleMatch(tags) {
  let style = STYLES.default;
  let selectivity = 999;

  let isBridge = !!tags.bridge;
  let isTunnel = !!tags.tunnel;

  // determine surface for paved/unpaved
  let surface = tags.surface;
  if (tags.highway === 'track' && tags.tracktype !== 'grade1') {
    surface = surface || 'dirt';
  }

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

  style = JSON.parse(JSON.stringify(style));  // deep copy

  // overrides
  if (isBridge) {
    style.casing.width += 7;
    style.casing.color = 0x000000;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
  }
  if (isTunnel) {
    style.stroke.alpha = 0.5;
  }
  if (surface && !!tags.highway && !osmPavedTags.surface[surface]) {
    if (!isBridge) style.casing.color = 0xcccccc;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
    style.casing.dash = [4, 4];
  }

  return style;
}
