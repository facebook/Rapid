import { geoLonToMeters, geoMetersToLon } from '@rapid-sdk/math';


export function uiScale(context) {
  const MAXLENGTH = 180;
  const TICKHEIGHT = 8;
  const l10n = context.systems.l10n;
  const viewport = context.viewport;

  let _isImperial = !l10n.isMetric();


  function scaleDefs(loc1, loc2) {
    const lat = (loc2[1] + loc1[1]) / 2;
    const conversion = (_isImperial ? 3.28084 : 1);
    const dist = geoLonToMeters(loc2[0] - loc1[0], lat) * conversion;
    const scale = { dist: 0, px: 0, text: '' };

    let buckets;
    if (_isImperial) {
      buckets = [5280000, 528000, 52800, 5280, 500, 50, 5, 1];
    } else {
      buckets = [5000000, 500000, 50000, 5000, 500, 50, 5, 1];
    }

    // determine a user-friendly endpoint for the scale
    for (let i = 0; i < buckets.length; i++) {
      let val = buckets[i];
      if (dist >= val) {
        scale.dist = Math.floor(dist / val) * val;
        break;
      } else {
        scale.dist = +dist.toFixed(2);
      }
    }

    const dLon = geoMetersToLon(scale.dist / conversion, lat);
    scale.px = Math.round(viewport.project([loc1[0] + dLon, loc1[1]])[0]);
    scale.text = l10n.displayLength(scale.dist / conversion, _isImperial);
    return scale;
  }


  function update(selection) {
    // choose loc1, loc2 along bottom of viewport (near where the scale will be drawn)
    const h = viewport.dimensions[1];  // height
    const loc1 = viewport.unproject([0, h]);
    const loc2 = viewport.unproject([MAXLENGTH, h]);
    const scale = scaleDefs(loc1, loc2);
    const isRTL = l10n.isRTL();

    selection.select('.scale-path')
      .attr('d', 'M0.5,0.5v' + TICKHEIGHT + 'h' + scale.px + 'v-' + TICKHEIGHT);

    selection.select('.scale-text')
      .style(isRTL ? 'right' : 'left', (scale.px + 16) + 'px')
      .text(scale.text);
  }


  return function(selection) {
    function switchUnits() {
      _isImperial = !_isImperial;
      selection.call(update);
    }

    let scalegroup = selection.append('svg')
      .attr('class', 'scale')
      .on('click', switchUnits)
      .append('g')
      .attr('transform', 'translate(10,11)');

    scalegroup
      .append('path')
      .attr('class', 'scale-path');

    selection
      .append('div')
      .attr('class', 'scale-text');

    context.systems.map.on('draw', () => {
      window.requestIdleCallback(() => update(selection));
    });
  };
}
