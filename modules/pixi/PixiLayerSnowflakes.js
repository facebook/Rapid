import * as PIXI from 'pixi.js';

import { AbstractLayer } from './AbstractLayer';
import  * as particles from '@pixi/particle-emitter';
import { snowflakesConfig } from './PixiLayerSnowflakesConfig';
import { config } from 'chai';
/**
 * PixiLayerSnowflakes
 * This class has only one job- to fill the screen with snowflakes and holiday cheer.
 * It consists of a snowflake particle emitter drawn in a container above everything else in the map.
 * For performance, we use a ParticleContainer (this also makes it so the snowflakes don't intercept pointer events)
 *
 * @class
 */
export class PixiLayerSnowflakes {

  /**
   * @constructor
   * @param  context    top-level context
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(context, layerID) {
    this.context = context;
    // Disable mipmapping, we always want textures near the resolution they are at.
    PIXI.settings.MIPMAP_TEXTURES = PIXI.MIPMAP_MODES.OFF;

    // Prefer WebGL 2.0 for now, this is to workaround issue #493 for now.
    PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2;

    const overlay = this.context.container().select('.snowflake-overlay');
    const surface = this.context.container().select('.snowflake-layer');

    // Create a Pixi application rendering to the given surface `canvas`
    // Which in this case is an entirely separate canvas from the main map supersurface
    this.pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      autoStart: false,        // don't start the ticker yet
      resizeTo: overlay.node(),
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
      sharedLoader: true,
      sharedTicker: true,
      view: surface.node(),
    });
    this.pixi.renderer.resize(window.innerWidth, window.innerHeight);

    //Debug circle code
    // const circle = new PIXI.Graphics()
    //  .lineStyle(1, 0xFFFFFF, 1.0)
    //  .beginFill(0xFFFFFF, 1.0)
    //  .drawEllipse(0, 0, 50, 100).
    //  endFill();

    //   circle.position.y = 400;
    //   circle.position.x = 400;

    // this.pixi.stage.addChild(circle);

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
    this.pixi.stage.addChild(container);
    this.pixi.renderer.resize(window.innerWidth, window.innerHeight);
    this._enabled = true;            // this layer should always be enabled
    this._oldk = 0;

    //Now we need to modify the particle emitter config at runtime, so that it includes the dist folder.
    //Otherwise, once we deploy to AWS this won't work.
    let distModifiedConfig = snowflakesConfig;
    // The 'textureRandom' behavior contains the texture path we need to reference.
    let snowflakeImagePath = distModifiedConfig.behaviors.filter(behavior => behavior.type === 'textureRandom')[0].config;
    // Modify each path by prepending the asset path.
    snowflakeImagePath.textures = snowflakeImagePath.textures.map(texture => texture = this.context.assetPath + texture);

    this.emitter = new particles.Emitter(container, distModifiedConfig);
    this.emitter.parent = container;


    const ticker = this.pixi.ticker; //Thank goodness for shared tickers
    ticker.add(this.render, this);
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
  render() {
    const now = Date.now();
    if (this.emitter) {
        // update emitter (convert to seconds)
      this.emitter.update((now - this.elapsed) * 0.001);
    }

    // call update hook for specialist examples
    if (this.updateHook) {
        this.updateHook(now - this.elapsed);
    }


     this.pixi.renderer.render(this.pixi.stage);
    this.elapsed = now;
//    let snowflakePosition = this.pixi.stage.children[0].children[0].position;

//    console.log(`snowflake position: [${snowflakePosition._x},${snowflakePosition._y}]`);

  }

}
