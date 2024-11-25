import * as PIXI from 'pixi.js';

import { AtlasAllocator, registerAtlasUploader } from './lib/AtlasAllocator.js';


/**
 * PixiTextures does the work of managing the textures.
 * We store most textures in 3 atlases, each one is for holding similar sized things.
 * Each "atlas" manages its own store of "TextureSources" - real textures that upload to the GPU.
 * This helps pack them efficiently and avoids swapping textures frequently as WebGL draws the scene.
 *
 * Properties you can access:
 *   `loaded`   `true` after the spritesheets and textures have finished loading
 */
export class PixiTextures {

  /**
   * @constructor
   * @param  gfx   The GraphicsSystem that owns this TextureManager
   */
  constructor(gfx) {
    this.gfx = gfx;
    this.context = gfx.context;
    this.loaded = false;

    const assets = this.context.systems.assets;

    // Before using the atlases, we need to register the upload function with the renderer.
    // This will choose the correct function for either webGL or webGPU renderer type.
    const renderer = gfx.pixi.renderer;
    registerAtlasUploader(renderer);

    // Try to get the max texture size.
    // We will prefer large atlas size of 8192 to avoid texture swapping, but can settle for less.
    let maxsize = 2048;   // a reasonable default
    if (renderer.type === PIXI.RendererType.WEBGL) {
      const gl = renderer.gl;
      maxsize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } else if (renderer.type === PIXI.RendererType.WEBGPU) {
      const gpu = renderer.gpu;
      maxsize = gpu.adapter.limits.maxTextureDimension2D;
    }

    const trysize = 8192;
    const size = Math.min(trysize, maxsize);

    // We store textures in 3 atlases, each one is for holding similar sized things.
    // Each "atlas" manages its own store of "TextureSources" - real textures that upload to the GPU.
    // This helps pack them efficiently and avoids swapping textures frequently as WebGL draws the scene.
    this._atlas = {
      symbol: new AtlasAllocator('symbol', size),  // small graphics - markers, pins, symbols
      text: new AtlasAllocator('text', size),      // text labels
      tile: new AtlasAllocator('tile', size)       // 256 or 512px square imagery tiles
    };


    // All the named textures we know about.
    // Each mapping is a unique identifying key to a PIXI.Texture
    // The Texture is not necessarily packed in an Atlas (but ideally it should be)
    // Important!  Make sure these texture keys don't conflict
    this._textureData = new Map();   // Map<key, { PIXI.Texture, refcount }>  (e.g. 'symbol-boldPin')

    // Because SVGs take some time to texturize, store the svg string and texturize only if needed
    this._svgIcons = new Map();   // Map<key, SVGSymbolElement>  (e.g. 'temaki-school')

    // Load patterns
    const PATTERNS = [
      'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
      'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
      'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
      'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
    ];
    let patternBundle = {};
    for (const k of PATTERNS) {
      patternBundle[k] = assets.getFileURL(`img/pattern/${k}.png`);
    }

    PIXI.Assets.addBundle('patterns', patternBundle);

    PIXI.Assets.loadBundle(['patterns'])
      .then(result => {
        // note that we can't pack patterns into an atlas yet - see PixiFeaturePolygon.js.
        for (const [textureID, texture] of Object.entries(result.patterns)) {
          this._textureData.set(textureID, { texture: texture, refcount: 1 });
        }
//        // if we could...
//        for (const [textureID, texture] of Object.entries(result.patterns)) {
//          const w = texture.baseTexture.width;
//          const h = texture.baseTexture.height;
//          const source = texture.baseTexture.resource.source;
//          this.allocate('symbol', textureID, w, h, source);
//        }

        this.loaded = true;
      })
      .catch(e => console.error(e));  // eslint-disable-line no-console

    this._cacheGraphics();
  }


  /**
   * get
   * a legacy accessor - we used to just expose the Map publicly
   * and other code would just call map.get(textureID) to get what they need
   *
   * @param   {string}        textureID
   * @return  {PIXI.Texture?} The texture (or `null` if not found)
   */
  get(textureID) {
    return this.getTexture('symbol', textureID);
  }


  /**
   * getTexture
   * @param   {string}  atlasID     One of 'symbol', 'text', or 'tile'
   * @param   {string}  textureID   e.g. 'boldPin', 'Main Street-normal', 'Bing-0,1,2'
   * @return  {PIXI.Texture?} The texture (or `null` if not found)
   */
  getTexture(atlasID, textureID) {
    const key = `${atlasID}-${textureID}`;
    const tdata = this._textureData.get(key);

    if (tdata) return tdata.texture;

    // Is this an svg icon that we haven't converted to a texture yet?
    if (this._svgIcons.has(textureID)) {
      this._svgIconToTexture(textureID);
      return PIXI.Texture.EMPTY;   // return a placeholder
    }

    return null;
  }


  /**
   * getPatternTexture
   * These are just like any other texture except that they can't live in an atlas.
   * PixiFeaturePolygon.js as some comments on it, maybe a Pixi bug or limitation.
   * @param   {string}        textureID   e.g. 'bushes'
   * @return  {PIXI.Texture?} The texture (or `null` if not found)
   */
  getPatternTexture(textureID) {
    const tdata = this._textureData.get(textureID);
    return tdata?.texture;
  }


  /**
   * getDebugTexture
   * @param   {string}         atlasID     One of 'symbol', 'text', or 'tile'
   * @return  {PIXI.Textures}  Texture for the specified atlas
   */
  getDebugTexture(atlasID) {
    const atlas = this._atlas[atlasID];
    if (!atlas) return null;

    const source = atlas.slabs[0];
    if (!source) return null;

    return new PIXI.Texture({ source: source });
  }


  /**
   * allocate
   * This packs an asset into one of the atlases and tracks it in the textureData map
   * The asset can be one of: HTMLImageElement | HTMLCanvasElement | ImageBitmap | ImageData | ArrayBufferView
   * @param   {string}  atlasID     One of 'symbol', 'text', or 'tile'
   * @param   {string}  textureID   e.g. 'boldPin', 'Main Street-normal', 'Bing-0,1,2'
   * @param   {number}  width       width in pixels
   * @param   {number}  height      height in pixels
   * @param   (*)       asset       The thing to pack
   * @return  {PIXI.Textures}       The newly allocated texture (or `null` if it couldn't be packed)
   */
  allocate(atlasID, textureID, width, height, asset) {
    const atlas = this._atlas[atlasID];
    if (!atlas) return null;

    const key = `${atlasID}-${textureID}`;
    const tdata = this._textureData.get(key);

    // We've already allocated this texture in an atlas..
    // Increment the refcount and return it.
    if (tdata) {
      tdata.refcount++;
      return tdata.texture;
    }

    const padding = atlasID === 'symbol' ? 1 : 0;
    const texture = atlas.allocate(width, height, padding, asset);
    if (!texture) {
      throw new Error(`Couldn't allocate texture ${key}`);
    }

    texture.label = key;

    // For tiles we want to preserve their power of 2 dimensions - so no padding!
    // But we also want to prevent their colors from spilling into an adjacent tile in the atlas.
    // Shrink texture coords by half pixel to avoid this.
    // https://gamedev.stackexchange.com/a/49585
    if (atlasID === 'tile') {
      const rect = texture.frame.clone().pad(-0.5);
      texture.frame = rect;  // `.frame` setter will call updateUvs() automatically
      texture.update();      // maybe not in pixi v8?  I'm still seeing tile seams?
    }

    this._textureData.set(key, { texture: texture, refcount: 1 });

    return texture;
  }


  /**
   * free
   * Unpacks a texture from the atlas and frees its resources
   * @param  {string}  atlasID     One of 'symbol', 'text', or 'tile'
   * @param  {string}  textureID   e.g. 'boldPin', 'Main Street-normal', 'Bing-0,1,2'
   */
  free(atlasID, textureID) {
    const atlas = this._atlas[atlasID];
    if (!atlas) return;

    const key = `${atlasID}-${textureID}`;
    const tdata = this._textureData.get(key);
    if (!tdata) return;  // free without allocate

    tdata.refcount--;

    if (tdata.refcount === 0) {
      atlas.free(tdata.texture);
      tdata.texture.destroy(false);   // false = don't destroy textureSource
      tdata.texture = null;
      this._textureData.delete(key);
    }
  }


  /**
   * graphicToTexture
   * Convert frequently used graphics to textures/sprites for performance
   * https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
   *
   * For example, rather than drawing a pin, we draw a square with a pin texture on it.
   * This is much more performant than drawing the graphcs.
   *
   * We also pack these graphics into a "texture atlas" so that they all live in the same
   * TextureSource.  This texture gets sent to the GPU once then reused, so WebGL isn't constantly
   * swapping between textures as it draws things.
   *
   * @param    {string}        textureID   Texture identifier (e.g. 'boldPin')
   * @param    {PIXI.Graphic}  graphic     A PIXI.Graphic to convert to a texture (will be destroyed)
   * @param    {Object}        options     Options passed to `renderer.generateTexture`
   * @returns  {PIXI.Texture}  Texture allocated from the text atlas
   */
  graphicToTexture(textureID, graphic, options = {}) {
    options.antialias = false;
    options.target = graphic;

    const renderer = this.gfx.pixi.renderer;
    const temp = renderer.generateTexture(options);
    const { pixels, width, height } = renderer.texture.getPixels(temp);
    const texture = this.allocate('symbol', textureID, width, height, pixels);

    // These textures are overscaled, but `orig` Rectangle stores the original width/height
    // (i.e. the dimensions that a PIXI.Sprite using this texture will want to make itself)
    texture.orig = temp.orig.clone();
    temp.destroy();
    graphic.destroy({ context: true });
    return texture;
  }


  /**
   * textToTexture
   * Convert frequently used text to textures/sprites for performance
   * @param    {string}          textureID   e.g. 'Main Street-normal'
   * @param    {string}          str         the string
   * @param    {PIXI.TextStyle}  textStyle
   * @returns  {PIXI.Texture}    Texture allocated from the text atlas
   */
  textToTexture(textureID, str, textStyle) {
    const options = {
      text: str,
      style: textStyle,
      resolution: 2
    };

    const renderer = this.gfx.pixi.renderer;
    const result = renderer.canvasText.createTextureAndCanvas(options);
    const canvas = result.canvasAndContext.canvas;
    const temp = result.texture;
    const w = temp.frame.width * temp.source.resolution;
    const h = temp.frame.height * temp.source.resolution;
    const texture = this.allocate('text', textureID, w, h, canvas);

    // These textures are overscaled, but `orig` Rectangle stores the original width/height
    // (i.e. the dimensions that a PIXI.Sprite using this texture will want to make itself)
    texture.orig = temp.orig.clone();

    temp.destroy();
    return texture;
  }


  /**
   * registerSvgIcon
   * Because SVGs take some time to rasterize, store a placeholder and only rasterize when needed
   * @param  {string}            textureID   Icon identifier (e.g. 'temaki-school')
   * @param  {SVGSymbolElement}  symbol      The SVG Symbol element for the icon
   */
  registerSvgIcon(textureID, symbol) {
    this._svgIcons.set(textureID, symbol);
  }


  /**
   * _svgIconToTexture
   * @param  textureID  Icon identifier (e.g. 'temaki-school')
   */
  _svgIconToTexture(textureID) {
    const symbol = this._svgIcons.get(textureID);
    if (!symbol) return;

    // Remove it to ensure that we only do this once.
    this._svgIcons.set(textureID, null);

// The old way, just put the SVG on an Image and pack that into the atlas.
// see https://github.com/facebook/Rapid/commit/dd24e912

    const viewBox = symbol.getAttribute('viewBox');

    // Make a new <svg> container
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('width', '32');
    svg.setAttribute('height', '32');
    svg.setAttribute('color', '#fff');   // white so we can tint them
    svg.setAttribute('viewBox', viewBox);

    // Clone children (this is essentially what <use> does)
    for (const child of symbol.childNodes) {
      svg.appendChild(child.cloneNode(true));  // true = deep clone
    }

    const svgStr = (new XMLSerializer()).serializeToString(svg);
    svg = null;

    let image = new Image();
    image.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
    image.onload = () => {
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      this.allocate('symbol', textureID, w, h, image);
      this._svgIcons.delete(textureID);
      this.gfx.deferredRedraw();
      image = null;
    };

// various approaches using the new Pixi SVG Parser and texture generation:
//    let svgString = this._svgIcons.get(textureID);
//    if (!svgString) return;
//
//     // Create a new graphics instance from the svg String,
//     // but first, sanitize the string to remove any 'currentColor', 'inherit', and 'url()' references.
//     svgString = svgString.replace(/(inherit|currentColor|url\(.*\))/gi, '#fff');
//     const size = 32;
//     const graphics = new PIXI.Graphics().svg(svgString);
//     graphics.setSize(size, size);
//
//     // Now, make a canvas and render the svg into it at higher resolution.
//     const renderer = this.gfx.pixi.renderer;
//     // const canvas = renderer.extract.canvas({ resolution: 2, target: svgGraphics });
//     const texture = renderer.textureGenerator.generateTexture({ resolution: 2, target: graphics });
// //    const canvas = renderer.texture.generateCanvas(texture);
// //    this.allocate('symbol', textureID, canvas.width, canvas.height, canvas);
//     const { pixels, width, height } = renderer.texture.getPixels(texture);
//     this.allocate('symbol', textureID, width, height, pixels);
//
//     texture.destroy();
//     graphics.destroy({ context: true });
//
//    this._svgIcons.delete(textureID);
//    this.gfx.deferredRedraw();
  }


  /**
   * _cacheGraphics
   * Convert frequently used graphics to textures/sprites for performance
   * https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
   * For example, rather than drawing a pin, we draw a square with a pin texture on it.
   * This is much more performant than drawing the graphcs.
   */
  _cacheGraphics() {

    //
    // Viewfields
    //
    const viewfieldRect = new PIXI.Rectangle(-13, 0, 26, 52);
    const viewfieldOptions = { frame: viewfieldRect };  // texture the whole 26x26 region

    const viewfield = new PIXI.Graphics()       //   [-2,26]  ,---,  [2,26]
      .moveTo(-2, 26)                           //           /     \
      .lineTo(2, 26)                            //          /       \
      .lineTo(12, 4)                            //         /         \
      .bezierCurveTo(12, 0, -12, 0, -12, 4)     //        /           \
      .closePath()                              //       /             \
      .fill({ color: 0xffffff, alpha: 1 })      //       ""--_______--""         +y
      .stroke({ color: 0x444444, width: 1 });   // [-12,4]              [12,4]    |
                                                //            [0,0]               +-- +x

    const viewfieldDark = new PIXI.Graphics()
      .moveTo(-2, 26)
      .lineTo(2, 26)
      .lineTo(12, 4)
      .bezierCurveTo(12, 0, -12, 0, -12, 4)
      .closePath()                              // same viewfield, but outline light gray
      .fill({ color: 0x333333, alpha: 1 })      // and fill dark gray (not intended to be tinted)
      .stroke({ color: 0xcccccc, width: 1 });

    const viewfieldOutline = new PIXI.Graphics()
      .moveTo(-2, 26)
      .lineTo(2, 26)
      .lineTo(12, 4)
      .bezierCurveTo(12, 0, -12, 0, -12, 4)
      .closePath()
      .stroke({ color: 0xcccccc, width: 1 });

    this.graphicToTexture('viewfield', viewfield, viewfieldOptions);
    this.graphicToTexture('viewfieldDark', viewfieldDark, viewfieldOptions);
    this.graphicToTexture('viewfieldOutline', viewfieldOutline, viewfieldOptions);


    const pano = new PIXI.Graphics()  // just a full circle - for panoramic / 360° images
      .circle(0, 0, 20)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 1 });

    const panoDark = new PIXI.Graphics()
      .circle(0, 0, 20)
      .fill({ color: 0x333333, alpha: 1 })
      .stroke({ color: 0xcccccc, width: 1 });

    const panoOutline = new PIXI.Graphics()
      .circle(0, 0, 20)
      .stroke({ color: 0xcccccc, width: 1 });

    this.graphicToTexture('pano', pano);
    this.graphicToTexture('panoDark', panoDark);
    this.graphicToTexture('panoOutline', panoOutline);


    //
    // Markers
    //
    const pin = new PIXI.Graphics()             //              [0,-23]
      .moveTo(0, 0)                             //              _,-+-,_
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)     //            /'       `\
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)     //           :           :
      .bezierCurveTo(4,-23, 8,-19, 8,-15)       // [-8,-15]  :           :  [8,-15]
      .bezierCurveTo(8,-10, 2,-2, 0,0)          //            \         /
      .closePath()                              //             \       /
      .fill({ color: 0xffffff, alpha: 1 })      //              \     /
      .stroke({ color: 0x444444, width: 1 });   //               \   /      -y
                                                //                `+`        |
                                                //               [0,0]       +-- +x
    const boldPin = new PIXI.Graphics()
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .fill({ color: 0xdddddd, alpha: 1 })
      .stroke({ color: 0x666666, width: 1.5 });    // same pin, bolder line stroke

    const xlargeSquare = new PIXI.Graphics()   // used as an "unknown" street sign
      .rect(-12, -12, 24, 24)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 2 });

    const largeSquare = new PIXI.Graphics()    // suitable to display an icon inside
      .rect(-8, -8, 16, 16)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 2 });

    const xlargeCircle = new PIXI.Graphics()   // used as an "unknown" detection
      .circle(0, 0, 12)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 2 });

    const largeCircle = new PIXI.Graphics()    // suitable to display an icon inside
      .circle(0, 0, 8)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 1 });

    const mediumCircle = new PIXI.Graphics()   // suitable for a streetview photo marker
      .circle(0, 0, 6)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 1 });

    const smallCircle = new PIXI.Graphics()    // suitable for a plain vertex
      .circle(0, 0, 4.5)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 1 });

    const taggedCircle = new PIXI.Graphics()   // a small circle with a dot inside
      .circle(0, 0, 4.5)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ color: 0x444444, width: 1 })
      .circle(0, 0, 2)
      .fill({ color: 0x000000, alpha: 1 });

    this.graphicToTexture('pin', pin);
    this.graphicToTexture('boldPin', boldPin);
    this.graphicToTexture('xlargeSquare', xlargeSquare);
    this.graphicToTexture('largeSquare', largeSquare);
    this.graphicToTexture('xlargeCircle', xlargeCircle);
    this.graphicToTexture('largeCircle', largeCircle);
    this.graphicToTexture('mediumCircle', mediumCircle);
    this.graphicToTexture('smallCircle', smallCircle);
    this.graphicToTexture('taggedCircle', taggedCircle);


    // KeepRight
    const keepright = new PIXI.Graphics()
      .moveTo(15, 6.5)
      .lineTo(10.8, 6.5)
      .bezierCurveTo(12.2, 1.3, 11.7, 0.8, 11.2, 0.8)
      .lineTo(6.2, 0.8)
      .bezierCurveTo(5.8, 0.7, 5.4, 1, 5.4, 1.5)
      .lineTo(4.2, 10.2)
      .bezierCurveTo(4.1, 10.8, 4.6, 11.2, 5, 11.2)
      .lineTo(9.3, 11.2)
      .lineTo(7.6, 18.3)
      .bezierCurveTo(7.5, 18.8, 8, 19.3, 8.5, 19.3)
      .bezierCurveTo(8.8, 19.3, 9.1, 19.1, 9.2, 18.8)
      .lineTo(15.6, 7.8)
      .bezierCurveTo(16, 7.2, 15.6, 6.5, 15, 6.5)
      .closePath()
      .stroke({ color: 0x333333, width: 1 })
      .fill({ color: 0xffffff });

    // OSM note
    const osmnote = new PIXI.Graphics()
      .moveTo(17.5, 0)
      .lineTo(2.5,0)
      .bezierCurveTo(1.13, 0, 0, 1.12, 0, 2.5)
      .lineTo(0, 13.75)
      .bezierCurveTo(0, 15.12, 1.12, 16.25, 2.5, 16.25)
      .lineTo(6.25, 16.25)
      .lineTo(6.25, 19.53)
      .bezierCurveTo(6.25, 19.91, 6.68, 20.13, 7, 19.9)
      .lineTo(11.87, 16.25)
      .lineTo(17.49, 16.25)
      .bezierCurveTo(18.86, 16.25, 20, 15.12, 20, 13.75)
      .lineTo(20, 2.5)
      .bezierCurveTo(20, 1.13, 18.87, 0, 17.5, 0)
      .closePath()
      .stroke({ color: 0x333333, width: 1.5 })
      .fill({ color:0xffffff, alpha: 1 });

    const osmose = new PIXI.Graphics()
      .poly([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .closePath()
      .fill({ color: 0xffffff })
      .stroke({ color: 0x333333, width: 1 });

    this.graphicToTexture('keepright', keepright);
    this.graphicToTexture('osmnote', osmnote);
    this.graphicToTexture('osmose', osmose);


    //
    // Line markers
    //
    const midpoint = new PIXI.Graphics()        // [-3, 4]  ._                +y
      .poly([-3,4, 7,0, -3,-4])                 //          | "-._             |
      .fill({ color: 0xffffff, alpha: 1 })      //          |    _:>  [7,0]    +-- +x
      .stroke({ color: 0x444444, width: 1 });   //          |_,-"
                                                // [-3,-4]  '
    const oneway = new PIXI.Graphics()
      .poly([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
      .fill({ color: 0xffffff, alpha: 1 });

    const sided = new PIXI.Graphics()
      .poly([0,5, 5,0, 0,-5])
      .fill({ color: 0xffffff, alpha: 1 });

    this.graphicToTexture('midpoint', midpoint);
    this.graphicToTexture('oneway', oneway);
    this.graphicToTexture('sided', sided);


    //
    // Low-res areas
    // We can replace areas with these sprites when they are very small
    // They are all sized to 10x10 (would look fine scaled down but not up)
    //
    const lowresSquare = new PIXI.Graphics()
      .rect(-5, -5, 10, 10)
      .fill({ color: 0xffffff, alpha: 0.6 })
      .stroke({ color: 0xffffff, width: 1 });

    const lowresEll = new PIXI.Graphics()
      .poly([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .fill({ color: 0xffffff, alpha: 0.6 })
      .stroke({ color: 0xffffff, width: 1 });

    const lowresCircle = new PIXI.Graphics()
      .circle(0, 0, 5)
      .fill({ color: 0xffffff, alpha: 0.6 })
      .stroke({ color: 0xffffff, width: 1 });

    this.graphicToTexture('lowres-square', lowresSquare);
    this.graphicToTexture('lowres-ell', lowresEll);
    this.graphicToTexture('lowres-circle', lowresCircle);

    //
    // Low-res unfilled areas
    // For wireframe mode rendering (no fills at all)
    //
    const lowresUnfilledSquare = new PIXI.Graphics()
      .rect(-5, -5, 10, 10)
      .stroke({ color: 0xffffff, width: 1 });

    const lowresUnfilledEll = new PIXI.Graphics()
      .poly([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .stroke({ color: 0xffffff, width: 1 });

    const lowresUnfilledCircle = new PIXI.Graphics()
      .circle(0, 0, 5)
      .stroke({ color: 0xffffff, width: 1 });

    this.graphicToTexture('lowres-unfilled-square', lowresUnfilledSquare);
    this.graphicToTexture('lowres-unfilled-ell', lowresUnfilledEll);
    this.graphicToTexture('lowres-unfilled-circle', lowresUnfilledCircle);
  }

}
