import { select as d3_select } from 'd3-selection';

import { utilFetchResponse } from '../util/index.js';


/**
 * UiDefs
 * A standalone `svg` and `defs` to contain the icon spritesheets for the user interface.
 * It is attached to the main rapid container so the icons can be used anywhere.
 *
 * @example
 *  <svg id='#rapid-defs'>
 *    <defs>
 *      <g class='spritesheet spritesheet-rapid'>…</g>
 *      <g class='spritesheet spritesheet-maki'>…</g>
 *      <g class='spritesheet spritesheet-temaki'>…</g>
 *      …
 *    </defs>
 *  </svg>
 */
export class UiDefs {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.spritesheetIDs = [
      'rapid', 'maki', 'temaki', 'fa', 'roentgen', 'community', /*'mapillary-object',*/ 'mapillary'
    ];

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._spritesheetLoaded = this._spritesheetLoaded.bind(this);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const assets = context.systems.assets;

    // create svg and defs if necessary
    $parent.selectAll('#rapid-defs')
      .data([0])
      .enter()
      .append('svg')
      .attr('id', 'rapid-defs')
      .append('defs');

    // update
    const $defs = $parent.selectAll('#rapid-defs > defs');

    $defs.selectAll('.spritesheet')
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
   * @param  {d3-selection}  $selection      - A d3-selection to a `g` element that the icons should render themselves into
   * @param  {string}        spritesheetID   - the spritesheet id to use
   * @param  {XMLDocument}   spritesheetSvg  - Document containing the fetched spritesheet
   */
  _spritesheetLoaded($selection, spritesheetID, spritesheetSvg) {
    const group = $selection.node();
    const element = spritesheetSvg.documentElement;

    element.setAttribute('id', spritesheetID);
    group.appendChild(element);

    // For some spritesheets, allow icon fill colors to be overridden..
    if (['maki', 'temaki', 'fa', 'roentgen', 'community'].includes(spritesheetID)) {
      $selection.selectAll('path')
        .attr('fill', 'currentColor');
    }

    // Notify Pixi about the icons so they can be used by WebGL/webGPU - see Rapid#925
    // Pixi's textureManager should be set up, throw if we're wrong about this.
    const textureManager = this.context.systems.gfx.textures;
    if (!textureManager) {
      throw new Error(`TextureManager not ready to pack icons for ${spritesheetID}`);
    }

    $selection.selectAll('symbol')
      .each((d, i, nodes) => {
        const symbol = nodes[i];
        const iconID = symbol.getAttribute('id');
        textureManager.registerSvgIcon(iconID, symbol);
     });
  }

}
