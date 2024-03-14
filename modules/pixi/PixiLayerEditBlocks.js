import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeaturePolygon } from './PixiFeaturePolygon.js';

const MINZOOM = 4;


/**
 * PixiLayerEditBlocks
 * @class
 */
export class PixiLayerEditBlocks extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this.enabled = true;   // this layer should always be enabled
  }


  /**
   * enabled
   * This layer should always be enabled
   */
  get enabled() {
    return true;
  }
  set enabled(val) {
    this._enabled = true;
  }


  /**
   * render
   * Render any edit blocking polygons that are visible in the viewport
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    const context = this.context;
    let blocks = [];

    if (zoom >= MINZOOM) {
      const locations = context.systems.locations;
      const searchRect = context.viewport.visibleExtent().rectangle();  // context viewport !== pixi viewport
      blocks = locations.wpblocks().bbox(searchRect);
      this.renderEditBlocks(frame, viewport, zoom, blocks);
    }

    // setup the explanation
    // add a special 'api-status' line to the map footer explain the block
    const explanationRow = context.container().select('.main-content > .map-footer')
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
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  blocks     Array of block data visible in the view
   */
  renderEditBlocks(frame, viewport, zoom, blocks) {
    const locationSystem = this.context.systems.locations;
    const parentContainer = this.scene.groups.get('blocks');
    const BLOCK_STYLE = {
      requireFill: true,    // no partial fill option - must fill fully
      fill: { pattern: 'construction', color: 0x000001, alpha: 0.7 }
    };

    for (const d of blocks) {
      const geometry = locationSystem.feature(d.locationSetID).geometry;  // get GeoJSON
      if (!geometry) continue;

      const parts = (geometry.type === 'Polygon') ? [geometry.coordinates]
        : (geometry.type === 'MultiPolygon') ? geometry.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${d.locationSetID}-${i}`;
        let feature = this.features.get(featureID);

        if (!feature) {
          feature = new PixiFeaturePolygon(this, featureID);
          feature.geometry.setCoords(coords);
          feature.style = BLOCK_STYLE;
          feature.parentContainer = parentContainer;
          feature.container.cursor = 'not-allowed';
          feature.setData(d.locationSetID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }
}
