export function uiMapRouletteDetails(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const maproulette = context.services.maproulette;

  let _maprouletteTask;


  function taskString(d) {
    if (!maproulette || !d) return '';
  }


  function maprouletteDetails(selection) {
    const details = selection.selectAll('.error-details')
      .data(_maprouletteTask ? [_maprouletteTask] : [], d => `${d.id}-${d.status || 0}` );

    details.exit()
      .remove();

    const detailsEnter = details.enter()
      .append('div')
      .attr('class', 'error-details qa-details-container');


    // Description
    if (taskString(_maprouletteTask, 'detail')) {
      const div = detailsEnter
        .append('div')
        .attr('class', 'qa-details-subsection');

      div
        .append('h4')
        .html(l10n.tHtml('QA.keepRight.detail_description'));

      div
        .append('p')
        .attr('class', 'qa-details-description-text')
        .html(d => taskString(d, 'detail'))
        .selectAll('a')
        .attr('rel', 'noopener')
        .attr('target', '_blank');
    }

    // Elements (populated later as data is requested)
    const detailsDiv = detailsEnter
      .append('div')
      .attr('class', 'qa-details-subsection');

    // Suggested Fix (mustn't exist for every issue type)
    if (taskString(_maprouletteTask, 'fix')) {
      const div = detailsEnter
        .append('div')
        .attr('class', 'qa-details-subsection');

      div
        .append('h4')
        .html(l10n.tHtml('map_data.layers.maproulette.fix_title'));

      div
        .append('p')
        .html(d => taskString(d, 'fix'))
        .selectAll('a')
        .attr('rel', 'noopener')
        .attr('target', '_blank');
    }

    // Common Pitfalls (mustn't exist for every issue type)
    if (taskString(_maprouletteTask, 'trap')) {
      const div = detailsEnter
        .append('div')
        .attr('class', 'qa-details-subsection');

      div
        .append('h4')
        .html(l10n.tHtml('map_data.layers.maproulette.trap_title'));

      div
        .append('p')
        .html(d => taskString(d, 'trap'))
        .selectAll('a')
        .attr('rel', 'noopener')
        .attr('target', '_blank');
    }

    // Save current item to check if UI changed by time request resolves
    if (!maproulette) return;
    maproulette.loadTaskDetailAsync(_maprouletteTask)
      .then(d => {
        console.log('d', d);
        // Do nothing if _maprouletteTask has changed by the time Promise resolves
        if (_maprouletteTask.id !== d.id) return;

        // Things like keys and values are dynamically added to a subtitle string
        if (d.id) {
          const id = d.id;
          const parentId = d.task.parentId;

          detailsDiv
            .append('h4')
            .html(l10n.tHtml('map_data.layers.maproulette.id_title'));

          detailsDiv
            .append('p')
            .html(`${parentId} / ${id}`)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }

        if (d.details && !d.details.includes('Lorem')) {
          const details = d.details;

          detailsDiv
            .append('h4')
            .html(l10n.tHtml('map_data.layers.maproulette.detail_title'));

          detailsDiv
            .append('p')
            .html(details)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }

        if (d.instruction && !d.instruction.includes('Lorem')) {
          const instruction = d.instruction;

          detailsDiv
            .append('h4')
            .html(l10n.tHtml('map_data.layers.maproulette.instruction_title'));

          detailsDiv
            .append('p')
            .html(instruction)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }

        map.immediateRedraw();
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  maprouletteDetails.task = function(val) {
    if (!arguments.length) return _maprouletteTask;
    _maprouletteTask = val;
    return maprouletteDetails;
  };


  return maprouletteDetails;
}
