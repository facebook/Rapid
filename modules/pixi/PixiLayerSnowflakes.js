import * as PIXI from 'pixi.js';

import { AbstractLayer } from './AbstractLayer';
import  * as particles from 'particle-emitter';
import { snowflakesConfig } from './PixiLayerSnowflakesConfig';
/**
 * PixiLayerSnowflakes
 * This class has only one job- to fill the screen with snowflakes and holiday cheer.
 * It consists of a snowflake particle emitter drawn in a container above everything else in the map.
 * For performance, we use a ParticleContainer (this also makes it so the snowflakes don't intercept pointer events)
 *
 * @class
 */
export class PixiLayerSnowflakes extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    const container = new PIXI.ParticleContainer();
    container.setProperties({
      scale: true,
      position: true,
      rotation: true,
      uvs: true,
      alpha: true,
    });
    container.name = layerID;
    this.container = container;
    this.elapsed = Date.now();
    const groupContainer = this.scene.groups.get('ui');
    groupContainer.addChild(container);

    this._enabled = true;            // this layer should always be enabled
    this._oldk = 0;
    this.emitter = new particles.Emitter(container, snowflakesConfig);
    this.emitter.parent = container;
  }


  /**
   * enabled
   * This layer should always be enabled - it contains important UI stuff
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    // noop
  }


  /**
   * render
   * Render any of the child containers for UI that should float over the map.
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   */
  render(frame, projection) {

    const now = Date.now();
    if (this.emitter) {
        // update emitter (convert to seconds)
        this.emitter.update((now - this.elapsed) * 0.001);
    }

    // call update hook for specialist examples
    if (this.updateHook) {
        this.updateHook(now - this.elapsed);
    }

    // framerate.innerHTML = `${(1000 / (now - this.elapsed)).toFixed(2)} fps`;

    this.elapsed = now;

    // if (this.emitter && particleCount)
    // {
    //     particleCount.innerHTML = `${this.emitter.particleCount} particles`;
    // }

  }

}
