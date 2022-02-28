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
  loader.add('dist/img/icons/maki-spritesheet.json');
  loader.add('dist/img/icons/temaki-spritesheet.json');
  loader.add('dist/img/icons/fontawesome-spritesheet.json');
  loader.add('dist/img/icons/mapillary-features-spritesheet.json');
  loader.add('dist/img/icons/mapillary-signs-spritesheet.json');
  loader.load(loader => {
    context._makiSheet = loader.resources['dist/img/icons/maki-spritesheet.json'];
    context._temakiSheet = loader.resources['dist/img/icons/temaki-spritesheet.json'];
    context._fontAwesomeSheet = loader.resources['dist/img/icons/fontawesome-spritesheet.json'];
    context._mapillarySheet = loader.resources['dist/img/icons/mapillary-features-spritesheet.json'];
    context._mapillarySignSheet = loader.resources['dist/img/icons/mapillary-signs-spritesheet.json'];
  });

  // load patterns
  context.pixi.rapidTextureKeys = [
    'bushes', 'cemetery', 'cemetery_buddhist', 'cemetery_christian', 'cemetery_jewish', 'cemetery_muslim',
    'construction', 'dots', 'farmland', 'farmyard', 'forest', 'forest_broadleaved', 'forest_leafless',
    'forest_needleleaved', 'grass', 'landfill', 'lines', 'orchard', 'pond', 'quarry', 'vineyard',
    'waves', 'wetland', 'wetland_bog', 'wetland_marsh', 'wetland_reedbed', 'wetland_swamp'
  ];
  context.pixi.rapidTextureKeys.forEach(key => {
    textures.set(key, new PIXI.Texture.from(`dist/img/pattern/${key}.png`));
  });


  // convert graphics to textures/sprites for performance
  // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
  const options = { resolution: 2 };

  //
  // viewfields
  //
  const viewfieldRect = new PIXI.Rectangle(-13, 0, 26, 26);
  const iconViewfield = new PIXI.Graphics()
    .lineStyle(1, 0xcccccc)                    //  [-6,21]  ,-___-,  [6,21]
    .beginFill(0xffffff, 0.75)                 //          /       \
    .moveTo(-6, 21)                            //         /         \
    .bezierCurveTo(-5,19, 5,19, 6,21)          //        /           \
    .lineTo(12, 4)                             //       /             \
    .bezierCurveTo(12,0, -12,0, -12,4)         //       ""--_______--""         +y
    .closePath()                               // [-12,4]              [12,4]    |
    .endFill();                                //            [0,0]               +-- +x

  textures.set('viewfield', renderer.generateTexture(iconViewfield, {
    region: viewfieldRect,  // texture the whole 26x26 region
    resolution: 3           // oversample a bit so it looks pretty when rotated
  }));


  //
  // markers
  //
  const marker = new PIXI.Graphics()           //              [0,-23]
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
  const wikidataMarker = new PIXI.Graphics()
    .lineStyle(2, 0x666666)
    .beginFill(0xdddddd, 1)
    .moveTo(0, 0)
    .bezierCurveTo(-2,-2, -8,-10, -8,-15)
    .bezierCurveTo(-8,-19, -4,-23, 0,-23)
    .bezierCurveTo(4,-23, 8,-19, 8,-15)
    .bezierCurveTo(8,-10, 2,-2, 0,0)
    .closePath()
    .endFill();

  const iconPlain = new PIXI.Graphics()
    .lineStyle(1, 0x666666)
    .beginFill(0xffffff, 1)
    .drawCircle(0, 0, 8)
    .endFill();

  const taggedPlain = new PIXI.Graphics()
    .lineStyle(1, 0x666666)
    .beginFill(0xffffff, 1)
    .drawCircle(0, 0, 4.5)
    .beginFill(0x000000, 1)
    .drawCircle(0, 0, 1.5)
    .endFill();

  const taggedWikidata = new PIXI.Graphics()
    .lineStyle(1, 0x666666)
    .beginFill(0xdddddd, 1)
    .drawCircle(0, 0, 4.5)
    .beginFill(0x333333, 1)
    .drawCircle(0, 0, 1.5)
    .endFill();

  textures.set('marker', renderer.generateTexture(marker, options));
  textures.set('wikidataMarker', renderer.generateTexture(wikidataMarker, options));
  textures.set('iconPlain', renderer.generateTexture(iconPlain, options));
  textures.set('taggedPlain', renderer.generateTexture(taggedPlain, options));
  textures.set('taggedWikidata', renderer.generateTexture(taggedWikidata, options));


  //
  // lowres areas
  //
  const square = new PIXI.Graphics()
    .lineStyle(1, 0xffffff)
    .beginFill(0xffffff, 0.3)
    .drawRect(-5, -5, 10, 10)
    .endFill();

  const ell = new PIXI.Graphics()
    .lineStyle(1, 0xffffff)
    .beginFill(0xffffff, 0.5)
    .drawPolygon([-5,-5, 5,-5, 5,5, 1,5, 1,1, -5,1, -5,-5])
    .endFill();

  textures.set('square', renderer.generateTexture(square, options));
  textures.set('ell', renderer.generateTexture(ell, options));

  // store them here
  context.pixi.rapidTextures = textures;
  return textures;
}


export function loadSprites(context) {

}
