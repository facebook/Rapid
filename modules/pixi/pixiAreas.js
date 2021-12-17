import * as PIXI from 'pixi.js';
import { utilArrayFlatten } from '@id-sdk/util';

export function pixiAreas(context) {
  let _cache = new Map();


  function renderAreas(graph, entities) {
    const pixi = context.pixi;

    let data = entities
      .filter(entity => entity.geometry(graph) === 'area');

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullAreas([id, datum]) {
      datum.graphics.visible = !!visible[id];
      // if (!visible[id]) {
      //   pixi.stage.removeChild(datum.graphics);
      //   _cache.delete(id);
      // }
    });

    // enter/update
    data
      .forEach(function prepareAreas(entity) {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make poly if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = geojson.coordinates[0];   // outer ring only

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
        const path = utilArrayFlatten(datum.coords.map(coord => context.projection(coord)));
        datum.graphics
          .clear()
          .lineStyle({ color: 0xff00ff, width: 3 })
          .beginFill(0xff00ff, 0.4)
          .drawPolygon(path)
          .endFill();

        datum.graphics.visible = true;
      });
  }

  return renderAreas;
}
