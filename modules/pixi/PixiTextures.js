import * as PIXI from 'pixi.js';
import { AtlasAllocator } from '@pixi-essentials/texture-allocator';


/**
 * PixiTextureManager does the work of managing the textures.
 * The goal is to use common spritesheets to avoid extensive texture swapping
 *
 * @class
 */
export class PixiTextures {

  /**
   * @constructor
   * @param  context
   */
  constructor(context) {
    this.context = context;
    this._atlasAllocator = new AtlasAllocator();

    // Map(String key -> PIXI.Texture)
    // important to make sure these keys don't conflict
    this.textures = new Map();
    // make it accessable this way (for now)
    context.pixi.rapidTextures = this.textures;

    // load spritesheets
    const loader = PIXI.Loader.shared;

    const distPath = context.assetPath();
    // During tests we might be reloading the map several times. If so, don't reload the resource spritesheets.
    if (!loader.resources[`${distPath}img/icons/maki-spritesheet.json`]) {
      loader.add(`${distPath}img/icons/maki-spritesheet.json`);
      loader.add(`${distPath}img/icons/temaki-spritesheet.json`);
      loader.add(`${distPath}img/icons/fontawesome-spritesheet.json`);
      loader.add(`${distPath}img/icons/mapillary-features-spritesheet.json`);
      loader.add(`${distPath}img/icons/mapillary-signs-spritesheet.json`);
      loader.load(loader => {
        context._makiSheet = loader.resources[`${distPath}img/icons/maki-spritesheet.json`];
        context._temakiSheet = loader.resources[`${distPath}img/icons/temaki-spritesheet.json`];
        context._fontAwesomeSheet = loader.resources[`${distPath}img/icons/fontawesome-spritesheet.json`];
        context._mapillarySheet = loader.resources[`${distPath}img/icons/mapillary-features-spritesheet.json`];
        context._mapillarySignSheet = loader.resources[`${distPath}img/icons/mapillary-signs-spritesheet.json`];
      });
    }

    // load patterns
    context.pixi.rapidTextureKeys = [
      'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
      'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
      'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
      'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
    ];
    context.pixi.rapidTextureKeys.forEach(key => {
      this.textures.set(key, new PIXI.Texture.from(`${distPath}img/pattern/${key}.png`));
    });


    // Convert frequently used graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const options = { resolution: 2 };

    //
    // Viewfields
    //
    const viewfieldRect = new PIXI.Rectangle(-13, 0, 26, 26);
    const viewfield = new PIXI.Graphics()
      .lineStyle(1, 0x444444)                    //  [-6,21]  ,-___-,  [6,21]
      .beginFill(0xffffff, 0.75)                 //          /       \
      .moveTo(-6, 21)                            //         /         \
      .bezierCurveTo(-5,19, 5,19, 6,21)          //        /           \
      .lineTo(12, 4)                             //       /             \
      .bezierCurveTo(12,0, -12,0, -12,4)         //       ""--_______--""         +y
      .closePath()                               // [-12,4]              [12,4]    |
      .endFill();                                //            [0,0]               +-- +x

    const viewfieldDark = new PIXI.Graphics()
      .lineStyle(1, 0xcccccc)         // same viewfield, but outline light gray
      .beginFill(0x333333, 0.75)      // and fill dark gray (not intended to be tinted)
      .moveTo(-6, 21)
      .bezierCurveTo(-5,19, 5,19, 6,21)
      .lineTo(12, 4)
      .bezierCurveTo(12,0, -12,0, -12,4)
      .closePath()
      .endFill();

    this.textures.set('viewfield', this.toAtlasTexture(viewfield, {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3           // oversample a bit so it looks pretty when rotated
    }));

    this.textures.set('viewfieldDark', this.toAtlasTexture(viewfieldDark, {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3           // oversample a bit so it looks pretty when rotated
    }));



    //
    // Markers
    //
    const pin = new PIXI.Graphics()              //              [0,-23]
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
    const boldPin = new PIXI.Graphics()
      .lineStyle(1.5, 0x666666)        // same pin, bolder line stroke
      .beginFill(0xdddddd, 1)
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .endFill();

    const largeCircle = new PIXI.Graphics()    // suitable to display an icon inside
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    const mediumCircle = new PIXI.Graphics()   // suitable for a streetview photo marker
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 6)
      .endFill();

    const smallCircle = new PIXI.Graphics()    // suitable for a plain vertex
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    const taggedCircle = new PIXI.Graphics()   // a small circle with a dot inside
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    this.textures.set('pin', this.toAtlasTexture(pin, options));
    this.textures.set('boldPin', this.toAtlasTexture(boldPin, options));
    this.textures.set('largeCircle', this.toAtlasTexture(largeCircle, options));
    this.textures.set('mediumCircle', this.toAtlasTexture(mediumCircle, options));
    this.textures.set('smallCircle', this.toAtlasTexture(smallCircle, options));
    this.textures.set('taggedCircle', this.toAtlasTexture(taggedCircle, options));


    // KeepRight
    const keepright = new PIXI.Graphics()
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
    const improveosm = new PIXI.Graphics()
      .lineStyle(1, 0x333333)
      .beginFill(0xffffff)
      .drawPolygon([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .endFill()
      .closePath();

    // OSM note
    const osmnote = new PIXI.Graphics()
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

    const osmose = new PIXI.Graphics()
      .lineStyle(1, 0x333333)
      .beginFill(0xffffff)
      .drawPolygon([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .endFill()
      .closePath();

    this.textures.set('keepright', this.toAtlasTexture(keepright, options));
    this.textures.set('improveosm', this.toAtlasTexture(improveosm, options));
    this.textures.set('osmnote', this.toAtlasTexture(osmnote, options));
    this.textures.set('osmose', this.toAtlasTexture(osmose, options));


    //
    // Line markers
    //
    const midpoint = new PIXI.Graphics()      // [-3, 4]  ._                +y
      .lineStyle(1, 0x444444)                 //          | "-._             |
      .beginFill(0xffffff, 1)                 //          |    _:>  [7,0]    +-- +x
      .drawPolygon([-3,4, 7,0, -3,-4])        //          |_,-"
      .endFill();                             // [-3,-4]  '

    const oneway = new PIXI.Graphics()
      .beginFill(0xffffff, 1)
      .drawPolygon([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
      .endFill();

    this.textures.set('midpoint', this.toAtlasTexture(midpoint, options));
    this.textures.set('oneway', this.toAtlasTexture(oneway, options));


    //
    // Stripe (experiment)
    // For drawing stripes on Rapid features
    //
    const stripe = new PIXI.Graphics()
      .lineStyle(2, 0xffffff)
      .moveTo(0, 0)
      .lineTo(4, 0);
    this.textures.set('stripe', this.toAtlasTexture(stripe, {
      region: new PIXI.Rectangle(0, 0, 4, 4),
      resolution: 2
    }));


    //
    // Low-res areas
    // We can replace areas with these sprites when they are very small
    // They are all sized to 10x10 (would look fine scaled down but not up)
    //
    const lowresSquare = new PIXI.Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.6)
      .drawRect(-5, -5, 10, 10)
      .endFill();

    const lowresEll = new PIXI.Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.6)
      .drawPolygon([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
      .endFill();

    const lowresCircle = new PIXI.Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.6)
      .drawCircle(0, 0, 5)
      .endFill();

    this.textures.set('lowres-square', this.toAtlasTexture(lowresSquare, options));
    this.textures.set('lowres-ell', this.toAtlasTexture(lowresEll, options));
    this.textures.set('lowres-circle', this.toAtlasTexture(lowresCircle, options));
  }


  /**
   * toAtlasTexture
   * @param  graphic   The graphic to turn into a texture
   * @param  options   Options passed to `renderer.generateTexture`
   */
  toAtlasTexture(graphic, options) {
    const renderer = this.context.pixi.renderer;
    const renderTexture = renderer.generateTexture(graphic, options);
    const baseTexture = renderTexture.baseTexture;

    if (baseTexture.format !== PIXI.FORMATS.RGBA) return;       // we could handle other values
    if (baseTexture.type !== PIXI.TYPES.UNSIGNED_BYTE) return;  // but probably don't need to.

    const framebuffer = baseTexture.framebuffer;
    // If we can't get framebuffer, just return the rendertexture
    // Maybe we are running in a test/ci environment?
    if (!framebuffer) return renderTexture;

    const w = framebuffer.width;
    const h = framebuffer.height;
    const pixels = new Uint8Array(w * h * 4);

    const gl = renderer.context.gl;
    const glfb = framebuffer.glFramebuffers[1];
    const fb = glfb && glfb.framebuffer;

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

