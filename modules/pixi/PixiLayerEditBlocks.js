import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';
import { locationManager } from '../core/LocationManager';

const LAYERID = 'edit-blocks';
const MINZOOM = 4;


/**
 * PixiLayerEditBlocks
 * @class
 */
export class PixiLayerEditBlocks extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerZ   z-index to assign to this Layer's container
   */
  constructor(scene, layerZ) {
    super(scene, LAYERID, layerZ);
    this._enabled = true;   // this layer should always be enabled

    this._oldk = 0;
  }

  /**
   * enabled
   * This layer should always be enabled
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    // noop
  }


  /**
   * render
   * Render any edit blocking polygons that are visible in the viewport
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    let blocks;

    if (zoom >= MINZOOM) {
      this.visible = true;

      const viewport = this.context.map().extent().rectangle();
      blocks = locationManager.wpblocks().bbox(viewport);
      this.renderEditBlocks(frame, projection, zoom, blocks);

    } else {
      this.visible = false;
      blocks = [];
    }

    // setup the explanation
    // add a special 'api-status' line to the map footer explain the block
    const explanationRow = this.context.container().select('.main-content > .map-footer')
      .selectAll('.api-status.blocks')
      .data(blocks, d => d.id);

    explanationRow.exit()
      .remove();

    const explanationRowEnter = explanationRow.enter()
      .insert('div', '.api-status')   // before any existing
      .attr('class', 'api-status blocks error');

    explanationRowEnter
      .append('span')
      .attr('class', 'explanation-item')
      .text(d => d.text);

    explanationRowEnter
      .append('a')
      .attr('target', '_blank')
      .attr('href', d => d.url)
      .text('More Info');
  }


  /**
   * renderEditBlocks
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  blocks       Array of block data visible in the view
   */
  renderEditBlocks(frame, projection, zoom, blocks) {
    const scene = this.scene;

    blocks.forEach(block => {
      const featureID = block.locationSetID;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        const geojson = locationManager.feature(featureID).geometry;
        const geometry = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

        const style = {
          requireFill: true,    // no partial fill option - must fill fully
          fill: { pattern: 'construction', color: 0x000001, alpha: 0.7 }
        };

        feature = new PixiFeatureMultipolygon(this, featureID, this.container, null, geometry, style);
        feature.container.cursor = 'not-allowed';
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.updateFeature(feature);
      }

      if (feature.lod > 0) {
        feature.visible = true;
        scene.retainFeature(feature, frame);
      }
    });

  }
}
