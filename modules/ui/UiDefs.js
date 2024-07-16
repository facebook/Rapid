import { select as d3_select } from 'd3-selection';

import { utilFetchResponse } from '../util/index.js';


/**
 * UiDefs
 * A standalone SVG `defs` element that contains the icon spritesheets for the user interface
 */
export class UiDefs {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.parent = d3_select(null);

    this.spritesheetIDs = [
      'rapid', 'maki', 'temaki', 'fa', 'roentgen', 'community', 'mapillary-object', 'mapillary'
    ];

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._spritesheetLoaded = this._spritesheetLoaded.bind(this);
  }


  /**
   * render
   * @param  `selection`  A d3-selection to a `svg` element that the `defs` should render itself into
   */
  render(selection) {
    const context = this.context;
    const assets = context.systems.assets;

    this.parent = selection;

    const defs = selection.selectAll('defs')
      .data([0]);

    const enter = defs.enter()
      .append('defs');

    // update
    defs.merge(enter)
      .selectAll('.spritesheet')
      .data(this.spritesheetIDs, d => d)
      .enter()
      .append('g')
      .attr('class', d => `spritesheet spritesheet-${d}`)
      .each((d, i, nodes) => {
        const group = d3_select(nodes[i]);
        const url = assets.getFileURL(`img/${d}-sprite.svg`);
        fetch(url)
          .then(utilFetchResponse)
          .then(svg => group.call(this._spritesheetLoaded, d, svg))
          .catch(e => console.error(e));  // eslint-disable-line
      });
  }


  /**
   * _spritesheetLoaded
   * @param  `selection`       A d3-selection to a `g` element that the icons should render themselves into
   * @param  `spritesheetID`   String spritesheet id
   * @param  `spritesheetSvg`  SVGDocument containting the fetched spritesheet
   */
  _spritesheetLoaded(selection, spritesheetID, spritesheetSvg) {
    const group = selection.node();
    const element = spritesheetSvg.documentElement;

    element.setAttribute('id', spritesheetID);
    group.appendChild(element);

    // For some spritesheets, allow icon fill colors to be overridden..
    if (['maki', 'temaki', 'fa', 'roentgen', 'community'].includes(spritesheetID)) {
      selection.selectAll('path')
        .attr('fill', 'currentColor');
    }

    // Notify Pixi about the icons so they can be used by WebGL - see Rapid#925
    // Note: We believe that by the time `_spritesheetLoaded` is called,
    // Pixi's textureManager should be set up, throw if we're wrong about this.
    const textureManager = this.context.systems.map.renderer?.textures;
    if (!textureManager) {
      throw new Error(`TextureManager not ready to pack icons for ${spritesheetID}`);
    }

    selection.selectAll('symbol')
      .each((d, i, nodes) => {
        const symbol = nodes[i];
        const iconID = symbol.getAttribute('id');
        const viewBox = symbol.getAttribute('viewBox');
        const size = 32;
        const color = '#fff';   // white will apply to `currentColor`, so we can tint them
        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" height="${size}" width="${size}" color="${color}" viewBox="${viewBox}">${symbol.innerHTML}</svg>`;

        textureManager.addSvgIcon(iconID, svgStr);
     });
  }

}
