import { select as d3_select } from 'd3-selection';


export function uiSourceSwitch(context) {
  let keys;

  function click(d3_event) {
    d3_event.preventDefault();

    const osm = context.services.get('osm');
    if (!osm) return;

    if (context.inIntro()) return;
    if (context.editSystem().hasChanges() && !window.confirm(context.t('source_switch.lose_changes'))) return;

    let isLive = d3_select(this)
      .classed('live');

    isLive = !isLive;
    context.enter('browse');
    context.editSystem().clearSaved();   // remove saved history
    context.flush();                     // remove stored data

    d3_select(this)
      .html(isLive ? context.tHtml('source_switch.live') : context.tHtml('source_switch.dev'))
      .classed('live', isLive)
      .classed('chip', isLive);

    osm.switch(isLive ? keys[0] : keys[1]);  // switch connection (warning: dispatches 'change' event)
  }

  let sourceSwitch = function(selection) {
    selection
      .append('a')
      .attr('href', '#')
      .html(context.tHtml('source_switch.live'))
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
