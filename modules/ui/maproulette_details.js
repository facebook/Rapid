export function uiMapRouletteDetails(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;

  let _qaitem;


  function render(selection) {
    let details = selection.selectAll('.error-details')
      .data(_qaitem ? [_qaitem] : [], d => `${d.id}-${d.status || 0}`);

    details.exit()
      .remove();

    const detailsEnter = details.enter()
      .append('div')
      .attr('class', 'error-details qa-details-container');

    detailsEnter
      .append('div')
      .attr('class', 'qa-details-subsection')
      .text(l10n.t('map_data.layers.maproulette.loading_task_details'));

    // update
    details = details.merge(detailsEnter);


    maproulette.loadTaskDetailAsync(_qaitem)
      .then(task => {
        // Do nothing if _qaitem has changed by the time Promise resolves
        if (_qaitem.id !== task.id) return;

        const selection = details.selectAll('.qa-details-subsection');
        selection.html('');   // replace contents

        // Things like keys and values are dynamically added to a subtitle string
        if (task.id) {
          selection
            .append('h4')
            .text(l10n.t('map_data.layers.maproulette.id_title'));

          selection
            .append('p')
            .text(`${task.parentId} / ${task.id}`)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }

        if (task.description && !task.description.includes('Lorem')) {
          selection
            .append('h4')
            .text(l10n.t('map_data.layers.maproulette.detail_title'));

          selection
            .append('p')
            .html(task.description)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }

        if (task.instruction && !task.instruction.includes('Lorem') && task.instruction !== task.description) {
          selection
            .append('h4')
            .text(l10n.t('map_data.layers.maproulette.instruction_title'));

          selection
            .append('p')
            .html(task.instruction)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  render.task = function(val) {
    if (!arguments.length) return _qaitem;
    _qaitem = val;
    return render;
  };


  return render;
}
