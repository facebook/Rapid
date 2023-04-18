import { Assets, Graphics, Rectangle, FORMATS, TYPES } from 'pixi.js';
import { AtlasAllocator } from '@rapideditor/pixi-texture-allocator';


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

    this._atlasAllocator = new AtlasAllocator();

    // Important!  Make sure these textureIDs don't conflict
    this._textures = new Map();   // Map(textureID -> PIXI.Texture)

    // Load spritesheets
    const SHEETS = ['maki', 'temaki', 'fontawesome', 'mapillary-features', 'mapillary-signs'];
    let sheetBundle = {};
    for (const k of SHEETS) {
      sheetBundle[k] = context.asset(`img/icons/${k}-spritesheet.json`);
    }
    Assets.addBundle('spritesheets', sheetBundle);

    // Load patterns
    const PATTERNS = [
      'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
      'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
      'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
      'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
    ];
    let patternBundle = {};
    for (const k of PATTERNS) {
      patternBundle[k] = context.asset(`img/pattern/${k}.png`);
    }
    Assets.addBundle('patterns', patternBundle);

    Assets.loadBundle(['spritesheets', 'patterns'])
      .then(result => {
        // spritesheets - store in context for now :(
        context._makiSheet = result.spritesheets.maki;
        context._temakiSheet = result.spritesheets.temaki;
        context._fontAwesomeSheet = result.spritesheets.fontawesome;
        context._mapillarySheet = result.spritesheets['mapillary-features'];
        context._mapillarySignSheet = result.spritesheets['mapillary-signs'];

        // patterns - store textures into the Map to use elsewhere
        for (const [k, texture] of Object.entries(result.patterns)) {
          this._textures.set(k, texture);
        }

        this.loaded = true;
      })
      .catch(e => console.error(e));  // eslint-disable-line no-console


    // Convert frequently used graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const options = { resolution: 2 };

    //
    // Viewfields
    //
    const viewfieldRect = new Rectangle(-13, 0, 26, 52);
    const viewfield = new Graphics()            //   [-2,26]  ,---,  [2,26]
      .lineStyle(1, 0x444444)                   //           /     \
      .beginFill(0xffffff, 0.75)                //          /       \
      .moveTo(-2, 26)                           //         /         \
      .lineTo(2, 26)                            //        /           \
      .lineTo(12, 4)                            //       /             \
      .bezierCurveTo(12,0, -12,0, -12,4)        //       ""--_______--""         +y
      .closePath()                              // [-12,4]              [12,4]    |
      .endFill();                               //            [0,0]               +-- +x

    const viewfieldDark = new Graphics()
      .lineStyle(1, 0xcccccc)        // same viewfield, but outline light gray
      .beginFill(0x333333, 0.75)     // and fill dark gray (not intended to be tinted)
      .moveTo(-2, 26)
      .lineTo(2, 26)
      .lineTo(12, 4)
      .bezierCurveTo(12,0, -12,0, -12,4)
      .closePath()
      .endFill();

    const viewfieldOutline = new Graphics()
      .lineStyle(1, 0xcccccc)        // same viewfield, but with no fill for wireframe mode
      .beginFill(0xffffff, 0)
      .moveTo(-2, 26)
      .lineTo(2, 26)
      .lineTo(12, 4)
      .bezierCurveTo(12, 0, -12, 0, -12, 4)
      .closePath()
      .endFill();

    this._textures.set('viewfield', this.toAtlasTexture(viewfield, {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3           // oversample a bit so it looks pretty when rotated
    }));

    this._textures.set('viewfieldDark', this.toAtlasTexture(viewfieldDark, {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3           // oversample a bit so it looks pretty when rotated
    }));

    this._textures.set('viewfieldOutline', this.toAtlasTexture(viewfieldOutline, {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3,          // oversample a bit so it looks pretty when rotated
    }));

    const pano = new Graphics()    // just a full circle - for panoramic / 360° images
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 0.75)
      .drawCircle(0, 0, 20)
      .endFill();

    const panoDark = new Graphics()
      .lineStyle(1, 0xcccccc)
      .beginFill(0x333333, 0.75)
      .drawCircle(0, 0, 20)
      .endFill();

    const panoOutline = new Graphics()
      .lineStyle(1, 0xcccccc)
      .beginFill(0xffffff, 0)
      .drawCircle(0, 0, 20)
      .endFill();

    this._textures.set('pano', this.toAtlasTexture(pano, options));
    this._textures.set('panoDark', this.toAtlasTexture(panoDark, options));
    this._textures.set('panoOutline', this.toAtlasTexture(panoOutline, options));


    //
    // Markers
    //
    const pin = new Graphics()                   //              [0,-23]
      .lineStyle(1, 0x444444)                    //              _,-+-,_
      .beginFill(0xffffff, 1)                    //            /'       `\
      .moveTo(0, 0)                              //           :           :
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)      // [-8,-15]  :           :  [8,-15]
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)      //            \         /
      .bezierCurveTo(4,-23, 8,-19, 8,-15)        //             \       /
      .bezierCurveTo(8,-10, 2,-2, 0,0)           //              \     /
      .closePath()                               //               \   /      -y
      .endFill();                                //                `+`        |
                                                 //               [0,0]       +-- +x
    const boldPin = new Graphics()
      .lineStyle(1.5, 0x666666)        // same pin, bolder line stroke
      .beginFill(0xdddddd, 1)
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .endFill();

    const largeCircle = new Graphics()    // suitable to display an icon inside
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    const mediumCircle = new Graphics()   // suitable for a streetview photo marker
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 6)
      .endFill();

    const smallCircle = new Graphics()    // suitable for a plain vertex
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    const taggedCircle = new Graphics()   // a small circle with a dot inside
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    this._textures.set('pin', this.toAtlasTexture(pin, options));
    this._textures.set('boldPin', this.toAtlasTexture(boldPin, options));
    this._textures.set('largeCircle', this.toAtlasTexture(largeCircle, options));
    this._textures.set('mediumCircle', this.toAtlasTexture(mediumCircle, options));
    this._textures.set('smallCircle', this.toAtlasTexture(smallCircle, options));
    this._textures.set('taggedCircle', this.toAtlasTexture(taggedCircle, options));


    // KeepRight
    const keepright = new Graphics()
      .lineStyle(1, 0x333333)
      .beginFill(0xffffff)
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
      .endFill()
      .closePath();

    // ImproveOsm
    const improveosm = new Graphics()
      .lineStyle(1, 0x333333)
      .beginFill(0xffffff)
      .drawPolygon([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .endFill()
      .closePath();

    // OSM note
    const osmnote = new Graphics()
      .lineStyle(1.5, 0x333333)
      .beginFill(0xffffff, 1)
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
      .endFill();

    const osmose = new Graphics()
      .lineStyle(1, 0x333333)
      .beginFill(0xffffff)
      .drawPolygon([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .endFill()
      .closePath();

    this._textures.set('keepright', this.toAtlasTexture(keepright, options));
    this._textures.set('improveosm', this.toAtlasTexture(improveosm, options));
    this._textures.set('osmnote', this.toAtlasTexture(osmnote, options));
    this._textures.set('osmose', this.toAtlasTexture(osmose, options));


    //
    // Line markers
    //
    const midpoint = new Graphics()           // [-3, 4]  ._                +y
      .lineStyle(1, 0x444444)                 //          | "-._             |
      .beginFill(0xffffff, 1)                 //          |    _:>  [7,0]    +-- +x
      .drawPolygon([-3,4, 7,0, -3,-4])        //          |_,-"
      .endFill();                             // [-3,-4]  '

    const oneway = new Graphics()
      .beginFill(0xffffff, 1)
      .drawPolygon([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
      .endFill();

    const sided = new Graphics()
      .beginFill(0xffffff, 1)
      .drawPolygon([0,5, 5,0, 0,-5])
      .endFill();

    this._textures.set('midpoint', this.toAtlasTexture(midpoint, options));
    this._textures.set('oneway', this.toAtlasTexture(oneway, options));
    this._textures.set('sided', this.toAtlasTexture(sided, options));


    //
    // Stripe (experiment)
    // For drawing stripes on Rapid features
    //
    const stripe = new Graphics()
      .lineStyle(2, 0xffffff)
      .moveTo(0, 0)
      .lineTo(4, 0);
    this._textures.set('stripe', this.toAtlasTexture(stripe, {
      region: new Rectangle(0, 0, 4, 4),
      resolution: 2
    }));


    //
    // Low-res areas
    // We can replace areas with these sprites when they are very small
    // They are all sized to 10x10 (would look fine scaled down but not up)
    //
    const lowresSquare = new Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.6)
      .drawRect(-5, -5, 10, 10)
      .endFill();

    const lowresEll = new Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.6)
      .drawPolygon([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .endFill();

    const lowresCircle = new Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.6)
      .drawCircle(0, 0, 5)
      .endFill();

    this._textures.set('lowres-square', this.toAtlasTexture(lowresSquare, options));
    this._textures.set('lowres-ell', this.toAtlasTexture(lowresEll, options));
    this._textures.set('lowres-circle', this.toAtlasTexture(lowresCircle, options));


    //
    // Low-res unfilled areas
    // For wireframe mode rendering (no fills at all)
    //
    const lowresUnfilledSquare = new Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0, 0)
      .drawRect(-5, -5, 10, 10)
      .endFill();

    const lowresUnfilledEll = new Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0, 0)
      .drawPolygon([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .endFill();

    const lowresUnfilledCircle = new Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0, 0)
      .drawCircle(0, 0, 5)
      .endFill();

    this._textures.set('lowres-unfilled-square', this.toAtlasTexture(lowresUnfilledSquare, options));
    this._textures.set('lowres-unfilled-ell', this.toAtlasTexture(lowresUnfilledEll, options));
    this._textures.set('lowres-unfilled-circle', this.toAtlasTexture(lowresUnfilledCircle, options));
  }


  /**
   * get
   * @param   textureID
   * @return  A PIXI.Texture (or null if not found)
   */
  get(textureID) {
    return this._textures.get(textureID);
  }


  /**
   * toAtlasTexture
   * Convert frequently used graphics to textures/sprites for performance
   * https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
   *
   * For example, rather than drawing a pin, we draw a square with a pin texture on it.
   * This is much more performant than drawing the graphcs.
   *
   * We also pack these graphics into a "texture atlas" so that they all live in the same
   * BaseTexture.  This texture gets sent to the GPU once then reused, so WebGL isn't constantly
   * swapping between textures as it draws things.
   *
   * @param  graphic   A PIXI.Graphic to convert to a texture
   * @param  options   Options passed to `renderer.generateTexture`
   * @return A PIXI.Texture reference that has been packed into the atlas
   */
  toAtlasTexture(graphic, options) {
    const renderer = this.context.pixi.renderer;
    const renderTexture = renderer.generateTexture(graphic, options);
    const baseTexture = renderTexture.baseTexture;

    if (baseTexture.format !== FORMATS.RGBA) return;       // we could handle other values
    if (baseTexture.type !== TYPES.UNSIGNED_BYTE) return;  // but probably don't need to.

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

    // Copy the texture to the atlas
    const PADDING = 1;
    const texture = this._atlasAllocator.allocate(w, h, PADDING, pixels);
    // These textures are overscaled, but `orig` Rectangle stores the original width/height
    // (i.e. the dimensions that a PIXI.Sprite using this texture will want to make itself)
    texture.orig = renderTexture.orig.clone();

    renderTexture.destroy(true);  // safe to destroy, the texture is copied to the atlas

    return texture;
  }

}

