
/**
 * uiMap3dViewer sets up the container for the 3d map.
 * @param  context  Global shared application context
 */
export function uiMap3dViewer(context) {
  const map3d = context.systems.map3d;
  const containerID = map3d.containerID;

  function render(selection) {
    selection.selectAll(`#${containerID}`)
      .data([0])
      .enter()
      .append('div')
      .attr('id', containerID)
      .style('display', 'none');
  }

  return render;
}
