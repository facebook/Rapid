import * as PIXI from 'pixi.js';

export function getIconSpriteHelper(context, picon) {
  const isMaki = /^maki-/.test(picon);
  const isTemaki = /^temaki-/.test(picon);

  let spritesheet;
  let spriteName;
  if (isMaki) {
    spritesheet = context._makiSheet;
    spriteName = picon.slice('maki-'.length);
  } else if (isTemaki) {
    spritesheet = context._temakiSheet;
    spriteName = picon.slice('temaki-'.length);
  }
  else {
    spritesheet = context._fontAwesomeSheet;
    spriteName = picon;
  }

  spriteName = spriteName + (isMaki ? '-11' : '') + '.svg';

  let sprite = new PIXI.Sprite(spritesheet.textures[spriteName]);
  sprite.name = spriteName;
  return sprite
}
