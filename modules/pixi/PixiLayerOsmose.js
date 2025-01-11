import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;


/**
 * PixiLayerOsmose
 * @class
 */
export class PixiLayerOsmose extends AbstractLayer {

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
    return !!this.context.services.osmose;
  }


  /**
   * enabled
   * Whether the user has chosen to see the Layer
   * Make sure to start the service first.
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    if (!this.supported) {
      val = false;
    }

    if (val === this._enabled) return;  // no change
    this._enabled = val;

    const context = this.context;
    const gfx = context.systems.gfx;
    const osmose = context.services.osmose;
    if (val && osmose) {
      osmose.startAsync()
        .then(() => gfx.immediateRedraw());
    }
  }


  /**
   * reset
   * Every Layer should have a reset function to replace any Pixi objects and internal state.
   */
  reset() {
    super.reset();
  }


  /**
   * renderMarkers
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderMarkers(frame, viewport, zoom) {
    const osmose = this.context.services.osmose;
    if (!osmose?.started) return;

    const parentContainer = this.scene.groups.get('qa');
    const items = osmose.getData();

    for (const d of items) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const style = {
          markerName: 'osmose',
          markerTint: osmose.getColor(d.item),
          iconName: d.icon
        };

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);
      }

      this.syncFeatureClasses(feature);
      feature.update(viewport, zoom);
      if (!feature._isCircular) {  // offset the icon to fit better in the "osmose" pin
        feature.icon.position.set(0, -17);
      }

      this.retainFeature(feature, frame);
    }
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    const osmose = this.context.services.osmose;
    if (!this.enabled || !osmose?.started || zoom < MINZOOM) return;

    osmose.loadTiles();
    this.renderMarkers(frame, viewport, zoom);
  }

}
