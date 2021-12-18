import * as PIXI from 'pixi.js';


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
          const color = (index === 0) ? datum.style.casingColor : datum.style.strokeColor;
          let width = (index === 0) ? datum.style.casingWidth : datum.style.strokeWidth;
          if (zoom < 17) width -= 2;
          if (zoom < 15) width -= 2;
          if (width < 0) width = 0;

          graphic
            .clear()
            .lineStyle({
              color: color,
              width: width,
              alpha: datum.style.alpha,
              join: datum.style.join,
              cap: datum.style.cap
            });

          points.forEach(([x, y], i) => {
            if (i === 0) {
              graphic.moveTo(x, y);
            } else {
              graphic.lineTo(x, y);
            }
          });
        });

      });
  }

  return renderLines;
}


const STYLES = {
  default: {
    casingWidth: 5,
    casingColor: 0x444444,
    strokeWidth: 3,
    strokeColor: 0xcccccc
  },
  motorway: {
    casingWidth: 10,
    casingColor: 0x70372f,
    strokeWidth: 8,
    strokeColor: 0xcf2081
  },
  trunk: {
    casingWidth: 10,
    casingColor: 0x70372f,
    strokeWidth: 8,
    strokeColor: 0xdd2f22
  },
  primary: {
    casingWidth: 10,
    casingColor: 0x70372f,
    strokeWidth: 8,
    strokeColor: 0xf99806
  },
  secondary: {
    casingWidth: 10,
    casingColor: 0x70372f,
    strokeWidth: 8,
    strokeColor: 0xf3f312
  },
  tertiary: {
    casingWidth: 10,
    casingColor: 0x70372f,
    strokeWidth: 8,
    strokeColor: 0xfff9b3
  },
  unclassified: {
    casingWidth: 10,
    casingColor: 0x444444,
    strokeWidth: 8,
    strokeColor: 0xddccaa
  },
  residential: {
    casingWidth: 10,
    casingColor: 0x444444,
    strokeWidth: 8,
    strokeColor: 0xffffff
  },
  living_street: {
    casingWidth: 7,
    casingColor: 0xffffff,
    strokeWidth: 5,
    strokeColor: 0xcccccc
  },
  service: {
    casingWidth: 7,
    casingColor: 0x444444,
    strokeWidth: 5,
    strokeColor: 0xffffff
  },
  special_service: {
    casingWidth: 7,
    casingColor: 0x444444,
    strokeWidth: 5,
    strokeColor: 0xfff6e4
  },
  track: {
    casingWidth: 7,
    casingColor: 0x746f6f,
    strokeWidth: 5,
    strokeColor: 0xc5b59f
  },
  river: {
    casingWidth: 10,
    casingColor: 0x444444,
    strokeWidth: 8,
    strokeColor: 0x77dddd
  },
  stream: {
    casingWidth: 7,
    casingColor: 0x444444,
    strokeWidth: 5,
    strokeColor: 0x77dddd
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

  let hasBridge = false;
  let hasTunnel = false;

  for (const k in tags) {
    if (k === 'bridge') {
      hasBridge = true;
      continue;
    }
    if (k === 'tunnel') {
      hasTunnel = true;
      continue;
    }
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

  style = Object.assign({}, style);  // shallow copy
  style.join= PIXI.LINE_JOIN.ROUND;
  style.cap = PIXI.LINE_CAP.ROUND;
  style.alpha = 1.0;

  if (hasBridge) {
    style.casingWidth += 7;
    style.casingColor = 0x000000;
    style.cap = PIXI.LINE_CAP.BUTT;
  }
  if (hasTunnel) {
    style.alpha = 0.5;
  }



  return style;
}
