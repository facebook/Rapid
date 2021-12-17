import * as PIXI from 'pixi.js';


export function pixiLines(context) {
  let _cache = new Map();


  function renderLines(graph, entities) {
    const pixi = context.pixi;

    let data = entities
      .filter(entity => entity.geometry(graph) === 'line');

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullLines([id, datum]) {
      datum.graphics.visible = !!visible[id];
      // if (!visible[id]) {
      //   pixi.stage.removeChild(datum.graphics);
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

          const graphics = new PIXI.Graphics();
          graphics.name = entity.id;
          pixi.stage.addChild(graphics);

          datum = {
            coords: coords,
            graphics: graphics
          };

          _cache.set(entity.id, datum);
        }

        // update
        const points = datum.coords.map(coord => context.projection(coord));

        datum.graphics
          .clear()
          .lineStyle({ color: 0xff00ff, width: 3 });

        points.forEach(([x, y], i) => {
          if (i === 0) {
            datum.graphics.moveTo(x, y);
          } else {
            datum.graphics.lineTo(x, y);
          }
        });

        datum.graphics.visible = true;
      });
  }

  return renderLines;
}
