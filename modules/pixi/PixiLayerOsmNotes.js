import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const MINZOOM = 12;


/**
 * PixiLayerOsmNotes
 * @class
 */
export class PixiLayerOsmNotes extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    this._service = null;
    this.getService();

// might use these
//    const markerHighlight = new PIXI.Graphics()
//      .lineStyle(4, 0xcccccc, 0.6)
//      .moveTo(-1, -1)
//      .lineTo(-1, 17.25)
//      .lineTo(18.5, 17.25)
//      .lineTo(18.5, -1)
//      .closePath();
//
//    const ellipse = new PIXI.Graphics()
//      .lineStyle(1, 0x222222, 0.6)
//      .beginFill(0x222222, 0.6)
//      .drawEllipse(0.5, 1, 6.5, 3)
//      .endFill();
  }


  /**
   * Services are loosely coupled, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    const osm = this.context.services.get('osm');
    if (osm && !this._service) {
      osm.on('loadedNotes', () => this.context.mapSystem().deferredRedraw());
      this._service = osm;
    } else if (!osm && this._service) {
      this._service = null;
    }

    return this._service;
  }


  /**
   * renderMarkers
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderMarkers(frame, projection, zoom) {
    const osm = this.getService();
    if (!osm) return;

    const parentContainer = this.scene.groups.get('qa');
    const items = osm.notes(this.context.projection);

    for (const d of items) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        let color = 0xff3300;  // open (red)
        // let iconName = '#rapid-icon-close'
        if (d.status === 'closed') {
          color = 0x55dd00;  // closed (green)
          // iconName = '#rapid-icon-apply'
        }
        if (d.isNew()) {
          color = 0xffee00;  // new (yellow)
          // iconName = '#rapid-icon-plus'
        }

        const style = {
          markerName: 'osmnote',
          markerTint: color
          // iconName: iconName
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
    const osm = this.getService();
    if (!this.enabled || !osm || zoom < MINZOOM) return;

    osm.loadNotes(this.context.projection);  // note: context.projection !== pixi projection
    this.renderMarkers(frame, projection, zoom);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}

