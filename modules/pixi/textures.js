import * as PIXI from 'pixi.js';


/**
 *  This is going to be pretty hacky for today,
 *  but it will get the job done
 */
export function prepareTextures(context, renderer) {
  let textures = context.pixi.rapidTextures;
  if (textures) return textures;    // they were made already

  textures = new Map();

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
    textures.set(key, new PIXI.Texture.from(`${distPath}img/pattern/${key}.png`));
  });


  // convert graphics to textures/sprites for performance
  // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
  const options = { resolution: 2 };

  //
  // Viewfields
  //
  const viewfieldRect = new PIXI.Rectangle(-13, 0, 26, 26);
  const viewfield = new PIXI.Graphics()
    .lineStyle(1, 0xcccccc)                    //  [-6,21]  ,-___-,  [6,21]
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

  textures.set('viewfield', renderer.generateTexture(viewfield, {
    region: viewfieldRect,  // texture the whole 26x26 region
    resolution: 3           // oversample a bit so it looks pretty when rotated
  }));
  textures.set('viewfieldDark', renderer.generateTexture(viewfieldDark, {
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
    .lineStyle(1, 0x666666)
    .beginFill(0xffffff, 1)
    .drawCircle(0, 0, 8)
    .endFill();

  const mediumCircle = new PIXI.Graphics()   // suitable for a streetview photo marker
    .lineStyle(1, 0x666666)
    .beginFill(0xffffff, 1)
    .drawCircle(0, 0, 6)
    .endFill();

  const smallCircle = new PIXI.Graphics()    // suitable for a plain vertex
    .lineStyle(1, 0x666666)
    .beginFill(0xffffff, 1)
    .drawCircle(0, 0, 4.5)
    .endFill();

  const taggedCircle = new PIXI.Graphics()   // a small circle with a dot inside
    .lineStyle(1, 0x666666)
    .beginFill(0xffffff, 1)
    .drawCircle(0, 0, 4.5)
    .beginFill(0x000000, 1)
    .drawCircle(0, 0, 1.5)
    .endFill();

  textures.set('pin', renderer.generateTexture(pin, options));
  textures.set('boldPin', renderer.generateTexture(boldPin, options));
  textures.set('largeCircle', renderer.generateTexture(largeCircle, options));
  textures.set('mediumCircle', renderer.generateTexture(mediumCircle, options));
  textures.set('smallCircle', renderer.generateTexture(smallCircle, options));
  textures.set('taggedCircle', renderer.generateTexture(taggedCircle, options));


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

  textures.set('keepright', renderer.generateTexture(keepright, options));
  textures.set('improveosm', renderer.generateTexture(improveosm, options));
  textures.set('osmnote', renderer.generateTexture(osmnote, options));
  textures.set('osmose', renderer.generateTexture(osmose, options));


  //
  // Line markers
  //
  const midpoint = new PIXI.Graphics()      // [-3, 4]  ._                +y
    .lineStyle(1, 0x000000)                 //          | "-._             |
    .beginFill(0xffffff, 1)                 //          |    _:>  [5,0]    +-- +x
    .drawPolygon([-3,4, 5,0, -3,-4])        //          |_,-"
    .endFill();                             // [-3,-4]  '

  const oneway = new PIXI.Graphics()
    .beginFill(0xffffff, 1)
    .drawPolygon([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
    .endFill();

  textures.set('midpoint', renderer.generateTexture(midpoint, options));
  textures.set('oneway', renderer.generateTexture(oneway, options));


  //
  // Stripe
  // For drawing stripes on Rapid features
  //
  const stripe = new PIXI.Graphics()
    .lineStyle(2, 0xffffff)
    .moveTo(0, 0)
    .lineTo(4, 0);

  let t = renderer.generateTexture(stripe, {
    region: new PIXI.Rectangle(0, 0, 4, 4),
    resolution: 2
  });
  textures.set('stripe', t);

  //
  // Low-res areas
  // We can replace areas with these sprites when they are very small
  // They are all sized to 10x10 (would look fine scaled down but not up)
  //
  const lowresSquare = new PIXI.Graphics()
    .lineStyle(1, 0xffffff)
    .beginFill(0xffffff, 0.3)
    .drawRect(-5, -5, 10, 10)
    .endFill();

  const lowresEll = new PIXI.Graphics()
    .lineStyle(1, 0xffffff)
    .beginFill(0xffffff, 0.3)
    .drawPolygon([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
    .endFill();

  const lowresCircle = new PIXI.Graphics()    // suitable to display an icon inside
    .lineStyle(1, 0xffffff)
    .beginFill(0xffffff, 0.3)
    .drawCircle(0, 0, 5)
    .endFill();

  textures.set('lowres-square', renderer.generateTexture(lowresSquare, options));
  textures.set('lowres-ell', renderer.generateTexture(lowresEll, options));
  textures.set('lowres-circle', renderer.generateTexture(lowresCircle, options));

  // store them here
  context.pixi.rapidTextures = textures;
  return textures;
}

