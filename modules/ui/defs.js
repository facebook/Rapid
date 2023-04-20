import { svg as d3_svg } from 'd3-fetch';
import { select as d3_select } from 'd3-selection';


/*
 * A standalone SVG `defs` element that contains the icon spritesheets for the user interface
 */
export function uiDefs(context) {
  const spritesheetIDs = ['rapid-sprite', 'maki-sprite', 'temaki-sprite', 'fa-sprite', 'community-sprite'];

  function render(selection) {
    const defs = selection.selectAll('defs')
      .data([0])
      .enter()
      .append('defs');

    defs.selectAll('.spritesheet')
      .data(spritesheetIDs)
      .enter()
      .append('g')
      .attr('class', d => `spritesheet spritesheet-${d}`)
      .each((d, i, nodes) => {
        const group = d3_select(nodes[i]);
        const url = context.asset(`img/${d}.svg`);

        d3_svg(url)
          .then(svg => group.call(loadIcons, d, svg))
          .catch(e => console.error(e));  // eslint-disable-line
      });
  }


  function loadIcons(selection, spritesheetID, svg) {
    const group = selection.node();
    const element = svg.documentElement;

    element.setAttribute('id', spritesheetID);
    group.appendChild(element);

    // Allow icon fill colors to be overridden..
    if (spritesheetID !== 'rapid-sprite') {
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

  return render;
}
