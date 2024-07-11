import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';


export function uiZoomToSelection(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const ui = context.systems.ui;
  const viewport = context.viewport;

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
      .attr('class', 'zoom-to-selection')
      .on('pointerup', d3_event => _lastPointerUpType = d3_event.pointerType)
      .on('click', onClick)
      .call(uiIcon('#rapid-icon-framed-dot', 'light'))
      .call(tooltip);

    context.keybinding().off(shortcutKey);
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
        _lastTransform = viewport.transform.props;
        const z = map.extentZoom(extent, viewport.center());
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
