import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

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
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.context.services.osm;
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

    if (val) {
      this.dirtyLayer();
      this.context.services.osm.startAsync();
    }
  }


  /**
   * renderMarkers
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderMarkers(frame, viewport, zoom) {
    const service = this.context.services.osm;
    if (!service?.started) return;

    const parentContainer = this.scene.groups.get('qa');
    const notes = service.getNotes();

    for (const note of notes) {
      const featureID = `${this.layerID}-${note.id}`;
      const version = note.v || 0;

      // Create feature if necessary..
      let feature = this.features.get(featureID);
      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.parentContainer = parentContainer;
      }

      // If data has changed, replace it..
      if (feature.v !== version) {
        feature.v = version;
        feature.geometry.setCoords(note.loc);
        feature.setData(note.id, note);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        let color = 0xff3300;  // open (red)
        let iconName = 'rapid-icon-close';
        if (note.status === 'closed') {
          color = 0x55dd00;  // closed (green)
          iconName = 'rapid-icon-apply';
        }
        if (note.isNew()) {
          color = 0xffee00;  // new (yellow)
          iconName = 'rapid-icon-plus';
        }

        const style = {
          markerName: 'osmnote',
          markerTint: color,
          iconName: iconName,
          // override 'y' for better centering within the note balloon
          anchor: { y: 0.65 }
        };

        feature.style = style;
      }

      feature.update(viewport, zoom);
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
    const service = this.context.services.osm;
    if (!this.enabled || !service?.started || zoom < MINZOOM) return;

    service.loadNotes(this.context.viewport);  // note: context.viewport !== pixi viewport
    this.renderMarkers(frame, viewport, zoom);
  }

}

