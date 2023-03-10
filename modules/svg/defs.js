import { svg as d3_svg } from 'd3-fetch';
import { select as d3_select } from 'd3-selection';

/*
 * A standalone SVG `defs` element that contains the icon spritesheets for the user interface
 */
export function svgDefs(context) {
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
        const url = context.imagePath(`${d}.svg`);
        const group = nodes[i];

        d3_svg(url)
          .then(svg => {
            group.appendChild(
              d3_select(svg.documentElement).attr('id', d).node()
            );
            if (d !== 'rapid-sprite') {   // allow icon fill colors to be overridden..
              d3_select(group).selectAll('path')
                .attr('fill', 'currentColor');
            }
          })
          .catch(e => console.error(e));  // eslint-disable-line
      });
  }

  return render;
}
