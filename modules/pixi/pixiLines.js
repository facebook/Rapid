import * as PIXI from 'pixi.js';


export function pixiLines(context) {
  let _cache = new Map();


  function renderLines(graph, entities) {
    const pixi = context.pixi;
    const zoom = context.map().zoom();

    let data = entities
      .filter(entity => entity.geometry(graph) === 'line');

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullLines([id, datum]) {
      datum.container.visible = !!visible[id];
      // if (!visible[id]) {
      //   pixi.stage.removeChild(datum.container);
      //   _cache.delete(id);
      // }
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

          pixi.stage.addChild(container);

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
            .lineStyle({ color: color, width: width });

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
  }
};

const TAGSTYLES = {
  highway: {
    motorway: 'motorway',
    trunk: 'trunk',
    primary: 'primary',
    secondary: 'secondary',
    tertiary: 'tertiary',
    unclassified: 'unclassified',
    residential: 'residential',
    living_street: 'living_street',
    service: 'service',
    bus_guideway: 'special_service',
    track: 'track'
  },
  service: {
    '*': 'special_service'
  }
};


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

    if (stylename && groupsize < selectivity) {
      style = STYLES[stylename];
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  return style;
}
