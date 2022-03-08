import { PixiFeaturePoint } from './PixiFeaturePoint';
import { vecAngle, vecInterp } from '@id-sdk/math';

/**
 * PixiOsmMidpoints
 * @class
 */
export class PixiOsmMidpoints {

  /**
   * @constructor
   * @param context
   * @param scene
   */
  constructor(context, scene) {
    this.context = context;
    this.scene = scene;
  }


  /**
   * render
   * @param container   parent PIXI.Container
   * @param projection  a pixi projection
   * @param zoom        the effective zoom to use for rendering
   * @param entities    Array of OSM entities
   */
  render(container, projection, zoom, entities) {
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    function isLine(entity) {
      return (entity.type === 'way' || entity.type === 'relation') &&
        (entity.geometry(graph) === 'line' || entity.geometry(graph) === 'area');
    }

    // Gather midpoints
    const ways = entities.filter(isLine);
    let midpoints = [];

    ways.forEach(way => {
      let nodeData = way.nodes.map(node => {
        return {
          id: node.id,
          point: projection.project(node.loc)
        };
      });

      if (way.tags.oneway === '-1') {
        nodeData.reverse();
      }

      nodeData.slice(0, -1).forEach((_, i) => {
        const a = nodeData[i];
        const b = nodeData[i + 1];
        const id = [a.id, b.id].sort().join('-');
        const pos = vecInterp(a.point, b.point, 0.5);
        const rot = vecAngle(a.point, b.point);

        midpoints.push({
          id: id,
          a: a,
          b: b,
          way: way,
          loc: projection.invert(pos),
          rot: rot
        });
      });
    });


    midpoints
      .forEach(function prepareMidpoints(midpoint) {
        let featureID = midpoint.id;
        let feature = scene.get(featureID);

        if (!feature) {
          const markerStyle = { markerName: 'midpoint' };
          feature = new PixiFeaturePoint(context, featureID, midpoint.loc, [], markerStyle);

          // bind data and add to scene
          const dObj = feature.displayObject;
          dObj.__data__ = midpoint;
          dObj.rotation = midpoint.rot;  // remember to apply rotation
          container.addChild(dObj);
        }

        if (feature.needsUpdate(projection)) {
          feature.update(projection, zoom);
          scene.update(feature);
        }
      });
  }
}
