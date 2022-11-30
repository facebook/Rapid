import * as PIXI from 'pixi.js';

import { prefs } from '../core/preferences';
import { styleMatch } from '../pixi/styles';
import { svgIcon } from '../svg/icon';


export function uiPresetIcon() {
  let _preset;
  let _geometry;


  function getIcon(p, geom) {
    if (p.icon) return p.icon;
    if (geom === 'line') return 'iD-other-line';
    if (geom === 'vertex') return p.isFallback() ? '' : 'temaki-vertex';
    return 'maki-marker-stroked';
  }


  //
  // Category border looks like a folder
  //
  function renderCategoryBorder(container, style) {
    const px = 60;
    const color = PIXI.utils.hex2string(style.fill.color);
    const alpha = style.fill.alpha;
    const FOLDER_PATH = 'M9.5,7.5 L25.5,7.5 L28.5,12.5 L49.5,12.5 C51.709139,12.5 53.5,14.290861 53.5,16.5 L53.5,43.5 C53.5,45.709139 51.709139,47.5 49.5,47.5 L10.5,47.5 C8.290861,47.5 6.5,45.709139 6.5,43.5 L6.5,12.5 L9.5,7.5 Z';

    container
      .append('svg')
      .attr('class', 'preset-icon-category-border')
      .attr('width', `${px}px`)
      .attr('height', `${px}px`)
      .attr('viewBox', `0 0 ${px} ${px}`)
      .append('path')
      .attr('fill', color)
      .attr('fill-opacity', alpha)
      .attr('stroke', color)
      .attr('d', FOLDER_PATH);
  }


  //
  // Point border is a map pin
  //
  function renderPointBorder(container) {
    const px = 60;
    const PIN_PATH = 'M 0,0 C -2,-2 -8,-10 -8,-15 C -8,-19 -4,-23 0,-23 C 4,-23 8,-19 8,-15 C 8,-10 2,-2 0,0 Z';

    container
      .append('svg')
      .attr('class', 'preset-icon-point-border')
      .attr('width', `${px}px`)
      .attr('height', `${px}px`)
      .attr('viewBox', '-10 -27 20 30')
      .append('path')
      .attr('d', PIN_PATH);
  }


  //
  // Vertex border is just a circle
  //
  function renderVertexBorder(container) {
    const px = 60;
    const mid = px / 2;
    const d = px * 2/3;

    container
      .append('svg')
      .attr('class', 'preset-icon-vertex-border')
      .attr('width', `${px}px`)
      .attr('height', `${px}px`)
      .attr('viewBox', `0 0 ${px} ${px}`)
      .append('circle')
      .attr('cx', mid)
      .attr('cy', mid)
      .attr('r', d / 2);
  }


  //
  // Area border is just a square with tiny endpoints/midpoints
  //
  function renderAreaBorder(container, style) {
    const px = 60;
    const mid = px / 2;
    const len = px * 2/3;
    const c1 = (px-len) / 2;
    const c2 = c1 + len;
    const color = PIXI.utils.hex2string(style.fill.color);
    const alpha = style.fill.alpha;

    let svg = container
      .append('svg')
      .attr('class', 'preset-icon-area-border')
      .attr('width', `${px}px`)
      .attr('height', `${px}px`)
      .attr('viewBox', `0 0 ${px} ${px}`);

    svg
      .append('path')
      .attr('fill', color)
      .attr('fill-opacity', alpha)
      .attr('stroke', color)
      .attr('d', `M${c1} ${c1} L${c1} ${c2} L${c2} ${c2} L${c2} ${c1} Z`);

    const rVertex = 2.5;
    [[c1, c1], [c1, c2], [c2, c2], [c2, c1]].forEach(([cx, cy]) => {
      svg
        .append('circle')
        .attr('class', 'vertex')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', rVertex);
    });

    const rMidpoint = 1.25;
    [[c1, mid], [c2, mid], [mid, c1], [mid, c2]].forEach(([cx, cy]) => {
      svg
        .append('circle')
        .attr('class', 'midpoint')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', rMidpoint);
    });
  }


  //
  // Line shows a line beneath the icon
  //
  function renderLine(container, style) {
    const px = 60;
    const y = Math.round(px * 0.72);
    const l = Math.round(px * 0.6);
    const x1 = (px - l) / 2;
    const x2 = x1 + l;
    const casingColor = PIXI.utils.hex2string(style.casing.color);
    const strokeColor = PIXI.utils.hex2string(style.stroke.color);
    const dash = style.stroke.dash;
    const hasDash = Array.isArray(dash);

    let svg = container
      .append('svg')
      .attr('class', 'preset-icon-line')
      .attr('width', `${px}px`)
      .attr('height', `${px}px`)
      .attr('viewBox', `0 0 ${px} ${px}`);

    svg
      .append('path')
      .attr('class', 'casing')
      .attr('stroke', casingColor)
      .attr('stroke-opacity', (hasDash ? 1 : 0.5))  // lighten casing, unless it's used to make the dash work
      .attr('d', `M${x1} ${y} L${x2} ${y}`);

    svg
      .append('path')
      .attr('class', 'stroke')
      .attr('stroke', strokeColor)
      .attr('stroke-dasharray', (hasDash ? dash.map(v => v * 0.75).join(' ') : null))
      .attr('d', `M${x1} ${y} L${x2} ${y}`);

    const rVertex = 3;
    [[x1-1, y], [x2+1, y]].forEach(([cx, cy]) => {
      svg
        .append('circle')
        .attr('class', 'vertex')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', rVertex);
    });
  }


  //
  // Route shows a zig-zag line beneath the icon
  //
  function renderRoute(container) {
    container
      .append('div')
      .attr('class', 'preset-icon-route')
      .call(svgIcon('#iD-route', 'idicon lowered'));
  }


  //
  // Renders the icon at correct size and placement
  //
  function renderSvgIcon(container, picon, klass, color) {
    container
      .append('div')
      .attr('class', 'preset-icon')
      .call(svgIcon(`#${picon}`, klass.join(' ')));

    container.selectAll('.preset-icon svg.icon')
      .attr('color', color);
  }


  //
  // Renders an image icon
  //
  function renderImageIcon(container, imageURL) {
    container.selectAll('img.image-icon')
      .data([imageURL])
      .enter()
      .append('img')
      .attr('class', 'image-icon')
      .attr('src', imageURL)
      .on('load', () => container.classed('showing-img', true) )
      .on('error', () => container.classed('showing-img', false) );
  }


  //
  //
  //
  function render(selection) {
    let container = selection.selectAll('.preset-icon-container')
      .data([0]);

    container = container.enter()
      .append('div')
      .attr('class', 'preset-icon-container')
      .merge(container)
      .html('');   // Empty out any existing content and rebuild from scratch..

    let p = _preset;
    let geom = _geometry;
    if (!p || !geom) return;  // nothing to display

    // 'p' is either a preset or a category
    const isPreset = (typeof p.setTags === 'function');
    const isCategory = !isPreset;

    let tags = isPreset ? p.setTags({}, geom) : {};
    for (let k in tags) {
      if (tags[k] === '*') {
        tags[k] = 'yes';
      }
    }

    if (geom === 'relation' && (tags.type === 'route' || tags.type === 'waterway')) {
      geom = 'route';
    }

    const showThirdPartyIcons = (prefs('preferences.privacy.thirdpartyicons') ?? 'true') === 'true';
    const imageURL = showThirdPartyIcons && p.imageURL;
    const picon = getIcon(p, geom);
    // const showPoint = isPreset && (geom === 'point');     // not actually used
    const showVertex = isPreset && (geom === 'vertex');
    const showLine = isPreset && (geom === 'line');
    const showArea = isPreset && (geom === 'area');
    const showRoute = isPreset && (geom === 'route') && (p.id !== 'type/route');
    const style = styleMatch(tags);

    container
      .classed('showing-img', !!imageURL);

    // Render outline shape, if any
    if (isCategory)   renderCategoryBorder(container, style);
    // if (showPoint)    renderPointBorder(container);        // not actually used
    if (showVertex)   renderVertexBorder(container);
    if (showArea)     renderAreaBorder(container, style);
    if (showLine)     renderLine(container, style);
    if (showRoute)    renderRoute(container);

    // Render Icon
    if (picon)  {
      const isRaised = showLine || showRoute;                 // move the icon up a little
      const isShrunk = isCategory || showLine || showRoute;   // make it smaller
      const isidicon = /^iD-/.test(picon);

      let klass = [];
      if (isidicon) klass.push('idicon');
      if (isShrunk) klass.push('shrunk');
      if (isRaised) klass.push('raised');

      let color = '#333';
      if (showLine || showRoute) {
        if (isidicon) {
          color = PIXI.utils.hex2string(style.stroke.color);
        }
      }

      renderSvgIcon(container, picon, klass, color);
    }

    // If we have an image/logo url, it may display over the other content
    if (imageURL) {
      renderImageIcon(container, imageURL);
    }
  }


  presetIcon.preset = function(val) {
    if (!arguments.length) return _preset;
    _preset = val;
    return presetIcon;
  };


  presetIcon.geometry = function(val) {
    if (!arguments.length) return _geometry;
    _geometry = val;
    return presetIcon;
  };


  function presetIcon(selection) {
    selection.call(render);
  }

  return presetIcon;
}
