import { t, localizer } from '../core/localizer';
import { uiTooltip } from './tooltip';
import { uiIcon } from './icon';


export function uiZoomToSelection(context) {
  const KEY = t('inspector.zoom_to.key');
  let _lastPointerUpType;
  let _lastTransform;

  return function(selection) {
    let tooltip = uiTooltip()
      .placement((localizer.textDirection() === 'rtl') ? 'right' : 'left')
      .title(() => isDisabled() ? t('inspector.zoom_to.no_selection') : t('inspector.zoom_to.title'))
      .keys([KEY]);

    let button = selection
      .append('button')
      .on('pointerup', d3_event => _lastPointerUpType = d3_event.pointerType)
      .on('click', onClick)
      .call(uiIcon('#rapid-icon-framed-dot', 'light'))
      .call(tooltip);

    context.keybinding().on(KEY, onClick);
    context.on('enter.uiZoomToSelection', onModeChange);

    onModeChange();


    function isDisabled() {
      const mode = context.mode();
      return !_lastTransform && !mode?.extent;
    }


    function onClick(e) {
      if (e) e.preventDefault();

      const mode = context.mode();
      const extent = mode?.extent;
      const map = context.map();

      if (_lastTransform) {   // pop back out
        map.transformEase(_lastTransform);
        _lastTransform = null;

      } else if (extent) {   // zoom in on extent
        _lastTransform = map.transform();
        const [w, h] = map.dimensions;
        const z = map.extentZoom(extent, [w/2, h/2]);
        map.centerZoomEase(extent.center(), z);

      } else {   // tool disabled
        if (_lastPointerUpType === 'touch' || _lastPointerUpType === 'pen') {
          context.ui().flash
            .duration(2000)
            .iconName('#rapid-icon-framed-dot')
            .iconClass('disabled')
            .label(t('inspector.zoom_to.no_selection'))();
        }
      }

      _lastPointerUpType = null;
    }


    function onModeChange() {
      _lastTransform = null;
      button.classed('disabled', isDisabled());
      if (!button.select('.tooltip.in').empty()) {
        button.call(tooltip.updateContent);
      }
    }

  };
}
