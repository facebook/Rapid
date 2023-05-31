import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const MINZOOM = 12;


/**
 * PixiLayerKeepRight
 * @class
 */
export class PixiLayerKeepRight extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return this.context.services.has('keepRight');
  }


  /**
   * renderMarkers
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderMarkers(frame, projection, zoom) {
    const service = this.context.services.get('keepRight');
    if (!service) return;

    const parentContainer = this.scene.groups.get('qa');
    const items = service.getItems(this.context.projection);  // note: context.projection !== pixi projection

    for (const d of items) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const style = {
          markerName: 'keepright',
          markerTint: service.getColor(d.parentIssueType)
        };

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const service = this.context.services.get('keepRight');
    if (!this._enabled || !service || zoom < MINZOOM) return;

    service.loadIssues(this.context.projection);  // note: context.projection !== pixi projection
    this.renderMarkers(frame, projection, zoom);
  }

}
