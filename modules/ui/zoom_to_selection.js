import { uiTooltip } from './tooltip';
import { uiIcon } from './icon';


export function uiZoomToSelection(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const ui = context.systems.ui;

  const shortcutKey = l10n.t('inspector.zoom_to.key');
  let _lastPointerUpType;
  let _lastTransform;


  return function render(selection) {
    let tooltip = uiTooltip(context)
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(() => isDisabled() ? l10n.t('inspector.zoom_to.no_selection') : l10n.t('inspector.zoom_to.title'))
      .shortcut(shortcutKey);

    let button = selection
      .append('button')
      .on('pointerup', d3_event => _lastPointerUpType = d3_event.pointerType)
      .on('click', onClick)
      .call(uiIcon('#rapid-icon-framed-dot', 'light'))
      .call(tooltip);

    context.keybinding().on(shortcutKey, onClick);
    context.on('modechange', onModeChange);

    onModeChange();


    function isDisabled() {
      return !_lastTransform && !context.mode?.extent;
    }


    function onClick(e) {
      if (e) e.preventDefault();

      const extent = context.mode?.extent;

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
          ui.flash
            .duration(2000)
            .iconName('#rapid-icon-framed-dot')
            .iconClass('disabled')
            .label(l10n.t('inspector.zoom_to.no_selection'))();
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
