import * as PIXI from 'pixi.js';
import { AtlasAllocator, registerAtlasUploader } from './atlas/AtlasAllocator.js';


/**
 * PixiTextures does the work of managing the textures.
 * The goal is to use common spritesheets to avoid extensive texture swapping
 *
 * Properties you can access:
 *   `loaded`   `true` after the spritesheets and textures have finished loading
 */
export class PixiTextures {

  /**
   * @constructor
   * @param  context  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.loaded = false;

    const assets = context.systems.assets;

    // Before using the atlases, we need to register the upload function with the renderer.
    // This will choose the correct function for either webGL or webGPU renderer type.
    const renderer = context.pixi.renderer;
    registerAtlasUploader(renderer);

    // We store textures in 3 atlases, each one is for holding similar sized things.
    // Each "atlas" manages its own store of "TextureSources" - real textures that upload to the GPU.
    // This helps pack them efficiently and avoids swapping textures frequently as WebGL draws the scene.

    this._atlas = {
      symbol: new AtlasAllocator('symbol'),  // small graphics - markers, pins, symbols
      text: new AtlasAllocator('text'),      // text labels
      tile: new AtlasAllocator('tile')       // 256 or 512px square imagery tiles
    };

    this._debugTexture = {};


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
   * @param   textureID
   * @return  A PIXI.Texture (or null if not found)
   */
  get(textureID) {
    return this.getTexture('symbol', textureID);
  }


  /**
   * getTexture
   * @param   atlasID     One of 'symbol', 'text', or 'tile'
   * @param   textureID   e.g. 'boldPin', 'Main Street', 'Bing-0,1,2'
   * @return  A PIXI.Texture (or null if not found)
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
   * @param   textureID   e.g. 'bushes'
   * @return  A PIXI.Texture (or null if not found)
   */
  getPatternTexture(textureID) {
    const tdata = this._textureData.get(textureID);
    return tdata?.texture;
  }


  /**
   * getDebugTexture
   * @param   atlasID     One of 'symbol', 'text', or 'tile'
   * @return  {PIXI.Textures} Texture for the specifiec atlas
   */
  getDebugTexture(atlasID) {
    if (this._debugTexture[atlasID]) {
      return this._debugTexture[atlasID];
    }

    const atlas = this._atlas[atlasID];
    if (!atlas) return null;

    const source = atlas.slabs[0];
    if (!source) return null;

    this._debugTexture[atlasID] = new PIXI.Texture({ source: source });
    return this._debugTexture[atlasID];
  }


  /**
   * allocate
   * This packs an asset into one of the atlases and tracks it in the textureData map
   * The asset can be one of: HTMLImageElement | HTMLCanvasElement | ImageBitmap | ImageData | ArrayBufferView
   * @param   atlasID     One of 'symbol', 'text', or 'tile'
   * @param   textureID   e.g. 'boldPin', 'Main Street', 'Bing-0,1,2'
   * @param   width       width in pixels
   * @param   height      height in pixels
   * @param   asset       The thing to pack
   * @return  A PIXI.Texture (or null if it couldn't be packed)
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

// no longer needed in v8?  this code introduces seams instead of closing them.
// maybe we are just doing a better job of linear sampling / antialiasing disabled?
//    // For tiles we want to preserve their power of 2 dimensions - so no padding!
//    // But we also want to prevent their colors from spilling into an adjacent tile in the atlas.
//    // Shrink texture coords by half pixel to avoid this.
//    // https://gamedev.stackexchange.com/a/49585
//    if (atlasID === 'tile') {
//      const rect = texture.frame.clone().pad(-0.5);
//      texture.frame = rect;  // `.frame` setter will call updateUvs() automatically
//      texture.update();   // maybe not in pixi v8?  I'm still seeing tile seams?
//    }

    this._textureData.set(key, { texture: texture, refcount: 1 });

    return texture;
  }


  /**
   * free
   * Unpacks a texture from the atlas and frees its resources
   * @param   atlasID     One of 'symbol', 'text', or 'tile'
   * @param   textureID   e.g. 'boldPin', 'Main Street', 'Bing-0,1,2'
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
   * _graphicToTexture
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
   * @param  textureID   Texture identifier (e.g. 'boldPin')
   * @param  graphic     A PIXI.Graphic to convert to a texture
   * @param  options     Options passed to `renderer.generateTexture`
   */
  _graphicToTexture(textureID, graphic, options) {
return PIXI.Texture.WHITE;
    const renderer = this.context.pixi.renderer;
    // options.multisample = MSAA_QUALITY.NONE;  // disable multisampling so we can use gl.readPixels
    options.antialias = false;

// https://github.com/pixijs/pixijs/issues/10836
//    options.format = 'rgba32float';
//const renderTexture = PIXI.RenderTexture.create(options);
//renderTexture.source.uploadMethodId = "buffer"; // this line is important after you create the renderTexture
//renderer.render({ target: renderTexture, container: graphic });
    const renderTexture = renderer.generateTexture(graphic, options);
    const baseTexture = renderTexture.source;

    if (baseTexture.format !== 'RGBA6408') return;       // we could handle other values
    if (baseTexture.type !== '5121') return;  // but probably don't need to.

    const framebuffer = baseTexture.framebuffer;
    // If we can't get framebuffer, just return the rendertexture
    // Maybe we are running in a test/ci environment?
    if (!framebuffer) return renderTexture;

    const w = framebuffer.width;
    const h = framebuffer.height;
    const pixels = new Uint8Array(w * h * 4);

    const gl = renderer.context.gl;
    const glfb = framebuffer.glFramebuffers[1];
    const fb = glfb?.framebuffer;

    // If we can't get glcontext or glframebuffer, just return the rendertexture
    // Maybe we are running in a test/ci environment?
    if (!gl || !fb) return renderTexture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);   // should be bound already, but couldn't hurt?
    gl.readPixels(0, 0, w, h, baseTexture.format, baseTexture.type, pixels);

    // Store the texture in the symbol atlas
    const texture = this.allocate('symbol', textureID, w, h, pixels);
    // These textures are overscaled, but `orig` Rectangle stores the original width/height
    // (i.e. the dimensions that a PIXI.Sprite using this texture will want to make itself)
    texture.orig = renderTexture.orig.clone();

    renderTexture.destroy(true);  // safe to destroy, the texture is copied to the atlas
  }


  /**
   * addSvgIcon
   * Because SVGs take some time to rasterize, store a placeholder and only rasterize when needed
   * @param  {string}            textureID   Icon identifier (e.g. 'temaki-school')
   * @param  {SVGSymbolElement}  symbol      The SVG Symbol element for the icon
   */
  addSvgIcon(textureID, symbol) {
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

    const iconID = symbol.getAttribute('id');
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
      const texture = this.allocate('symbol', textureID, w, h, image);
      this._svgIcons.delete(textureID);
      this.context.deferredRedraw();
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
//     const renderer = this.context.pixi.renderer;
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
//    this.context.deferredRedraw();
  }


  /**
   * _cacheGraphics
   * Convert frequently used graphics to textures/sprites for performance
   * https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
   * For example, rather than drawing a pin, we draw a square with a pin texture on it.
   * This is much more performant than drawing the graphcs.
   */
  _cacheGraphics() {
    const options = { resolution: 2 };

    //
    // Viewfields
    //
    const viewfieldRect = new PIXI.Rectangle(-13, 0, 26, 52);
    const viewfieldOptions = {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3           // oversample a bit so it looks pretty when rotated
    };

    const viewfield = new PIXI.Graphics()       //   [-2,26]  ,---,  [2,26]
      .moveTo(-2, 26)                           //           /     \
      .lineTo(2, 26)                            //          /       \
      .lineTo(12, 4)                            //         /         \
      .bezierCurveTo(12, 0, -12, 0, -12, 4)     //        /           \
      .closePath()                              //       /             \
      .fill({ color: 0xffffff, alpha: 1 })      //       ""--_______--""         +y
      .stroke({ width: 1, color: 0x444444 });   // [-12,4]              [12,4]    |
                                                //            [0,0]               +-- +x

    const viewfieldDark = new PIXI.Graphics()
      .moveTo(-2, 26)
      .lineTo(2, 26)
      .lineTo(12, 4)
      .bezierCurveTo(12, 0, -12, 0, -12, 4)
      .closePath()                              // same viewfield, but outline light gray
      .fill({ color: 0x333333, alpha: 1 })      // and fill dark gray (not intended to be tinted)
      .stroke({ width: 1, color: 0xcccccc });

    const viewfieldOutline = new PIXI.Graphics()
      .moveTo(-2, 26)
      .lineTo(2, 26)
      .lineTo(12, 4)
      .bezierCurveTo(12, 0, -12, 0, -12, 4)
      .closePath()
      .fill({ color: 0xffffff, alpha: 0 })
      .stroke({ width: 1, color: 0xcccccc });

    this._graphicToTexture('viewfield', viewfield, viewfieldOptions);
    this._graphicToTexture('viewfieldDark', viewfieldDark, viewfieldOptions);
    this._graphicToTexture('viewfieldOutline', viewfieldOutline, viewfieldOptions);


    const pano = new PIXI.Graphics()  // just a full circle - for panoramic / 360° images
      .circle(0, 0, 20)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 1, color: 0x444444 });

    const panoDark = new PIXI.Graphics()
      .circle(0, 0, 20)
      .fill({ color: 0x333333, alpha: 1 })
      .stroke({ width: 1, color: 0xcccccc });

    const panoOutline = new PIXI.Graphics()
      .circle(0, 0, 20)
      .fill({ color: 0xffffff, alpha: 0 })
      .stroke({ width: 1, color: 0xcccccc });

    this._graphicToTexture('pano', pano, options);
    this._graphicToTexture('panoDark', panoDark, options);
    this._graphicToTexture('panoOutline', panoOutline, options);


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
      .stroke({ width: 1, color: 0x444444 });   //               \   /      -y
                                                //                `+`        |
                                                //               [0,0]       +-- +x
    const boldPin = new PIXI.Graphics()
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .stroke({ width: 1.5, color: 0x666666 })     // same pin, bolder line stroke
      .fill({ color: 0xdddddd, alpha: 1 });

    const xlargeSquare = new PIXI.Graphics()   // used as an "unknown" street sign
      .rect(-12, -12, 24, 24)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 2, color: 0x444444 });

    const largeSquare = new PIXI.Graphics()    // suitable to display an icon inside
      .rect(-8, -8, 16, 16)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 2, color: 0x444444 });

    const xlargeCircle = new PIXI.Graphics()   // used as an "unknown" detection
      .circle(0, 0, 12)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 2, color: 0x444444 });

    const largeCircle = new PIXI.Graphics()    // suitable to display an icon inside
      .circle(0, 0, 8)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 1, color: 0x444444 });

    const mediumCircle = new PIXI.Graphics()   // suitable for a streetview photo marker
      .circle(0, 0, 6)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 1, color: 0x444444 });

    const smallCircle = new PIXI.Graphics()    // suitable for a plain vertex
      .circle(0, 0, 4.5)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 1, color: 0x444444 });

    const taggedCircle = new PIXI.Graphics()   // a small circle with a dot inside
      .circle(0, 0, 4.5)
      .fill({ color: 0x000000, alpha: 1 })
      .circle(0, 0, 1.5)
      .fill({ color: 0xffffff, alpha: 1 })
      .stroke({ width: 1, color: 0x444444 });

    this._graphicToTexture('pin', pin, options);
    this._graphicToTexture('boldPin', boldPin, options);
    this._graphicToTexture('xlargeSquare', xlargeSquare, options);
    this._graphicToTexture('largeSquare', largeSquare, options);
    this._graphicToTexture('xlargeCircle', xlargeCircle, options);
    this._graphicToTexture('largeCircle', largeCircle, options);
    this._graphicToTexture('mediumCircle', mediumCircle, options);
    this._graphicToTexture('smallCircle', smallCircle, options);
    this._graphicToTexture('taggedCircle', taggedCircle, options);


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
      .stroke({ width: 1, color: 0x333333 })
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
      .stroke({ width: 1.5, color: 0x333333 })
      .fill({ color:0xffffff, alpha: 1 });

    const osmose = new PIXI.Graphics()
      .poly([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .closePath()
      .fill({ color: 0xffffff })
      .stroke({ width: 1, color: 0x333333 });

    this._graphicToTexture('keepright', keepright, options);
    this._graphicToTexture('osmnote', osmnote, options);
    this._graphicToTexture('osmose', osmose, options);


    //
    // Line markers
    //
    const midpoint = new PIXI.Graphics()        // [-3, 4]  ._                +y
      .poly([-3,4, 7,0, -3,-4])                 //          | "-._             |
      .fill({ color:0xffffff, alpha: 1 })       //          |    _:>  [7,0]    +-- +x
      .stroke({ width: 1, color: 0x444444 });   //          |_,-"
                                                // [-3,-4]  '
    const oneway = new PIXI.Graphics()
      .poly([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
      .stroke({ width: 1, color: 0xffffff });

    const sided = new PIXI.Graphics()
      .poly([0,5, 5,0, 0,-5])
      .stroke({ width: 1, color: 0xffffff });

    this._graphicToTexture('midpoint', midpoint, options);
    this._graphicToTexture('oneway', oneway, options);
    this._graphicToTexture('sided', sided, options);


    //
    // Low-res areas
    // We can replace areas with these sprites when they are very small
    // They are all sized to 10x10 (would look fine scaled down but not up)
    //
    const lowresSquare = new PIXI.Graphics()
      .rect(-5, -5, 10, 10)
      .fill({ color:0xffffff, alpha: 0.6 })
      .stroke({ width: 1, color: 0xffffff });

    const lowresEll = new PIXI.Graphics()
      .poly([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .fill({ color:0xffffff, alpha: 0.6 })
      .stroke({ width: 1, color: 0xffffff });

    const lowresCircle = new PIXI.Graphics()
      .circle(0, 0, 5)
      .fill({ color:0xffffff, alpha: 0.6 })
      .stroke({ width: 1, color: 0xffffff });

    this._graphicToTexture('lowres-square', lowresSquare, options);
    this._graphicToTexture('lowres-ell', lowresEll, options);
    this._graphicToTexture('lowres-circle', lowresCircle, options);

    //
    // Low-res unfilled areas
    // For wireframe mode rendering (no fills at all)
    //
    const lowresUnfilledSquare = new PIXI.Graphics()
      .rect(-5, -5, 10, 10)
      .fill({ color: 0, alpha: 0})
      .stroke({ width: 1, color: 0xffffff });

    const lowresUnfilledEll = new PIXI.Graphics()
      .poly([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .fill({ color: 0, alpha: 0})
      .stroke({ width: 1, color: 0xffffff });

    const lowresUnfilledCircle = new PIXI.Graphics()
      .circle(0, 0, 5)
      .fill({ color: 0, alpha: 0})
      .stroke({ width: 1, color: 0xffffff });

    this._graphicToTexture('lowres-unfilled-square', lowresUnfilledSquare, options);
    this._graphicToTexture('lowres-unfilled-ell', lowresUnfilledEll, options);
    this._graphicToTexture('lowres-unfilled-circle', lowresUnfilledCircle, options);
  }

}
