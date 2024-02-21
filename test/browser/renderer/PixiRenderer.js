describe('PixiRenderer', () => {
  const timestamp = 1649012524130;
  let context;
  let map;
  let renderData;
  let graphEntities;
  let viewport;
  let zoom;
  let content;

  // Converts a list of json OSM entities to osm objects
  function jsonToOSM(renderData) {
    // Entity data is already split into points, vertices, lines, and polygons.
    const osmRenderData = {};
    const points = renderData.points.map(point => Rapid.osmNode(point));
    const vertices = renderData.vertices.map(vertex => Rapid.osmNode(vertex));
    const lines = renderData.lines.map(line => Rapid.osmWay(line));
    const polygons = renderData.polygons.map(polygon => Rapid.osmWay(polygon));

    osmRenderData.points = points;
    osmRenderData.vertices = vertices;
    osmRenderData.lines = lines;
    osmRenderData.polygons = polygons;

    return osmRenderData;
  }


  // Converts a list of json OSM entities to osm objects
  function castEntities(entities) {
    const osmEntities = [];
    for (const entity of entities) {
      if (entity.id.charAt(0) === 'w') osmEntities.push(new Rapid.osmWay(entity));
      if (entity.id.charAt(0) === 'n') osmEntities.push(new Rapid.osmNode(entity));
    }

    return osmEntities;
  }


  before(done => {
    // See the commented section near the top of the Pixi OSM Layer renderer
    // for details of how to obtain one of these canned data files.
    const staticData = window.__fixtures__['test/spec/renderer/canned_osm_data'];

    // Reload the parsed json data back into osm objects.
    renderData = jsonToOSM(staticData.data);
    graphEntities = castEntities(staticData.entities);
    viewport = new Rapid.sdk.Viewport({ x: staticData.projection._x, y: staticData.projection._y, k: staticData.projection._k });
    zoom = staticData.zoom;
    done();
  });


  beforeEach(() => {
    content = d3.select('body').append('div');
    context = Rapid.coreContext().assetPath('../dist/').init().container(content);

    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    graph.rebase(graphEntities, [graph], false);
    map = context.systems.map;
    content.call(map);
  });


  afterEach(() => content.remove());


  describe('#osmRenderer', () => {
    it('renders the canned data scene', () => {
      const osmLayer = context.scene().layers.get('osm');
      osmLayer.drawPoints(timestamp, viewport, zoom, renderData.points);
      osmLayer.drawVertices(timestamp, viewport, zoom, renderData.vertices);
      osmLayer.drawLines(timestamp, viewport, zoom, renderData.lines);
      osmLayer.drawPolygons(timestamp, viewport, zoom, renderData.polygons);
    });
  });

});
