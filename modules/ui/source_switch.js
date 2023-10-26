import { select as d3_select } from 'd3-selection';


export function uiSourceSwitch(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  let keys;

  function click(d3_event) {
    d3_event.preventDefault();

    const osm = context.services.osm;
    if (!osm) return;
    if (context.inIntro) return;
    if (context.mode?.id === 'save') return;

    if (editor.hasChanges() && !window.confirm(l10n.t('source_switch.lose_changes'))) return;

    let isLive = d3_select(this)
      .classed('live');

    isLive = !isLive;
    context.enter('browse');
    editor.clearBackup();  // remove saved history

    context.resetAsync()   // remove downloaded data
      .then(() => {
        d3_select(this)
          .html(isLive ? l10n.tHtml('source_switch.live') : l10n.tHtml('source_switch.dev'))
          .classed('live', isLive)
          .classed('chip', isLive);

        return osm.switchAsync(isLive ? keys[0] : keys[1]);  // switch connection (warning: dispatches 'change' event)
      });
  }

  let sourceSwitch = function(selection) {
    selection
      .append('a')
      .attr('href', '#')
      .html(l10n.tHtml('source_switch.live'))
      .attr('class', 'live chip')
      .on('click', click);
  };


  sourceSwitch.keys = function(val) {
    if (!arguments.length) return keys;
    keys = val;
    return sourceSwitch;
  };


  return sourceSwitch;
}
