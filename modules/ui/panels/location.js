import _debounce from 'lodash-es/debounce';

import { decimalCoordinatePair, dmsCoordinatePair } from '../../util/units';
import { t } from '../../core/localizer';
import { services } from '../../services';


export function uiPanelLocation(context) {
  let _currLocation = '';

  const debouncedGetLocation = _debounce(getLocation, 250);


  function getLocation(selection, coord) {
    if (!services.geocoder) {
      _currLocation = t('info_panels.location.unknown_location');
      selection.selectAll('.location-info')
        .html(_currLocation);
    } else {
      services.geocoder.reverse(coord, (err, result) => {
        _currLocation = result ? result.display_name : t('info_panels.location.unknown_location');
        selection.selectAll('.location-info')
          .html(_currLocation);
      });
    }
  }


  function redraw(selection) {
    selection.html('');

    let list = selection
      .append('ul');

    // Mouse coordinates
    let coord = context.map().mouseCoordinates();
    if (coord.some(isNaN)) {
      coord = context.map().center();
    }

    list
      .append('li')
      .html(dmsCoordinatePair(coord))
      .append('li')
      .html(decimalCoordinatePair(coord));

    // Location Info
    selection
      .append('div')
      .attr('class', 'location-info')
      .html(_currLocation || ' ');

    debouncedGetLocation(selection, coord);
  }


  let panel = function(selection) {
    selection.call(redraw);

    context.surface()
      .on('pointermove.info-location', () => selection.call(redraw));
  };

  panel.off = function() {
    debouncedGetLocation.cancel();
    context.surface().on('pointermove.info-location', null);
  };

  panel.id = 'location';
  panel.label = t.html('info_panels.location.title');
  panel.key = t('info_panels.location.key');


  return panel;
}
