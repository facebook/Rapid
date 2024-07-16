export function uiSpinner(context) {
  const assets = context.systems.assets;
  const osm = context.services.osm;

  return function(selection) {
    const img = selection
      .append('img')
      .attr('src', assets.getFileURL('img/loader-black.gif'))
      .style('opacity', 0);

    if (osm) {
      osm
        .on('loading.spinner', function() {
          img.transition().style('opacity', 1);
        })
        .on('loaded.spinner', function() {
          img.transition().style('opacity', 0);
        });
    }
  };
}
