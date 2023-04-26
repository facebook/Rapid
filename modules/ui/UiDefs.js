import { svg as d3_svg } from 'd3-fetch';
import { select as d3_select } from 'd3-selection';


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

    this.spritesheetIDs = new Set(['rapid', 'maki', 'temaki', 'fa' /*, 'community'*/]);

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.loadSpritesheet = this.loadSpritesheet.bind(this);
    this._spritesheetLoaded = this._spritesheetLoaded.bind(this);
  }


  /**
   * render
   * @param  `selection`  A d3-selection to a `svg` element that the `defs` should render itself into
   */
  render(selection) {
    const context = this.context;
    this.parent = selection;

    const defs = selection.selectAll('defs')
      .data([0]);

    const enter = defs.enter()
      .append('defs');

    // update
    defs.merge(enter)
      .selectAll('.spritesheet')
      .data([...this.spritesheetIDs])
      .enter()
      .append('g')
      .attr('class', d => `spritesheet spritesheet-${d}`)
      .each((d, i, nodes) => {
        const group = d3_select(nodes[i]);
        const url = context.asset(`img/${d}-sprite.svg`);

        d3_svg(url)
          .then(svg => group.call(this._spritesheetLoaded, d, svg))
          .catch(e => console.error(e));  // eslint-disable-line
      });
  }


  /**
   * loadSpritesheet
   * @param  `spritesheetID`  String spritesheet id
   */
  loadSpritesheet(spritesheetID) {
    this.spritesheetIDs.add(spritesheetID);
    this.render(this.parent);
  }


  /**
   * _spritesheetLoaded
   * @param  `selection`      A d3-selection to a `g` element that the icons should render themselves into
   * @param  `spritesheetID`  String spritesheet id
   * @param  `svg`            The fetched svg document
   */
  _spritesheetLoaded(selection, spritesheetID, svg) {
    const group = selection.node();
    const element = svg.documentElement;

    element.setAttribute('id', spritesheetID);
    group.appendChild(element);

    // Allow icon fill colors to be overridden..
    if (spritesheetID !== 'rapid') {
      selection.selectAll('path')
        .attr('fill', 'currentColor');
    }

// WIP on #925
//    // Pack icons into Pixi texture atlas
//    selection.selectAll('symbol')
//      .each((d, i, nodes) => {
//        if (spritesheetID !== 'community-sprite') return;
//
//        const symbol = nodes[i];
//        const iconID = symbol.getAttribute('id');
//        const viewBox = symbol.getAttribute('viewBox');
//
//        // Make a new <svg> container
//        let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
//        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
//        svg.setAttribute('width', '32');
//        svg.setAttribute('height', '32');
//        svg.setAttribute('color', '#fff');   // white so we can tint them
//        svg.setAttribute('viewBox', viewBox);
//
//        // Clone children (this is essentially what <use> does)
//        for (const child of symbol.childNodes) {
//          svg.appendChild(child.cloneNode(true));  // true = deep clone
//        }
//
//        const svgStr = (new XMLSerializer()).serializeToString(svg);
//        svg = null;
//
//        const image = new Image();
//        image.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
//        image.onload = () => {
//          // something like this
//          const PADDING = 0;
//          const texture = this._atlasAllocator.allocate(w, h, PADDING, image);
//          this._textures.set(iconID, texture);
//        };
//      });
  }

}
