/* eslint-disable no-console */
import Benchmark from 'benchmark';
const suite = new Benchmark.Suite();

const values = [];
for (let i = 0; i < 1000000; i++) {
  values.push(i);
}

// Converts a list of json OSM entities to osm objects
function jsonToOSM(renderData) {
  //Entity data is already split into points, vertices, lines, and polygons.
  let osmRenderData = {};

  let points = renderData.points.map(point => Rapid.osmNode(point));
  let vertices = renderData.vertices.map(vertex => Rapid.osmNode(vertex));
  let lines = renderData.lines.map(line => Rapid.osmWay(line));
  let polygons = renderData.polygons.map(polygon => Rapid.osmWay(polygon));

  osmRenderData.points = points;
  osmRenderData.vertices = vertices;
  osmRenderData.lines = lines;
  osmRenderData.polygons = polygons;

  return osmRenderData;
}


// Converts a list of json OSM entities to osm objects
function instantiateEntities(data) {
  let entities = [];
  for (const props of data) {
    if (props.id.charAt(0) === 'w') entities.push(new Rapid.osmWay(props));
    if (props.id.charAt(0) === 'n') entities.push(new Rapid.osmNode(props));
  }
  return entities;
}


//This staticData variable looks like it's not declared anywhere, but it is a global var loaded by the <script src='canned_osm_data.js'> declaration in bench.html
let renderData;
let graphEntities;
let viewport;
let zoom;
let tokyo_15, tokyo_17, tokyo_19;
const timestamp = 1649012524130;

//Now initialize context in a similar fashion to our unit tests.
//Benchmark.js doesn't have the concept of a 'before all' or 'before each', so we just do it all here at a single go.
let content = d3.select('body').append('div');
let context = Rapid.coreContext().assetPath('../../dist/').init().container(content);
let editor = context.systems.editor;
let map = context.systems.map;
content.call(map);


function renderTest() {
  const scene = context.scene();
  const layer = scene.layers.get('osm');
  layer.drawPoints(timestamp, viewport, zoom, renderData.points);
  layer.drawVertices(timestamp, viewport, zoom, renderData.vertices);
  layer.drawLines(timestamp, viewport, zoom, renderData.lines);
  layer.drawPolygons(timestamp, viewport, zoom, renderData.polygons);
  scene.dirtyScene();  // Dirty the scene so that subsequent runs of this same test don't operate at warp speed
}

function setup(dataBlob) {
  //This dataBlob variable should be the json blob exported in bench.html from a <script src='canned_osm_data.js'> declaration
  renderData = jsonToOSM(dataBlob.data);
  graphEntities = instantiateEntities(dataBlob.entities);
  viewport = new Rapid.sdk.Viewport({ x: dataBlob.projection._x, y: dataBlob.projection._y, k: dataBlob.projection._k });
  zoom = dataBlob.zoom;
  const graph = editor.staging.graph;
  graph.rebase(graphEntities, [graph], false);
}

// Enable the cycle event if and only if we really need to print stuff every run.
// function cycle(event) {
//     const benchmark = event.target;
//     console.log(benchmark.toString());
// }

function complete(event) {
  const benchmark = event.target;
  let hz = benchmark.hz.toFixed(benchmark.hz < 100 ? 2 : 0);
  console.log(`benchmark placename: ${benchmark.placename}`);
  console.log(`benchmark zoom: ${benchmark.zoom}`);
  console.log(`benchmark ops/sec: ${hz}`);
}

suite.add({
  'name': 'PixiLayerOsm Renderer Benchmark with zoom 19 Tokyo data',
  'fn': renderTest,
  'placename': 'tokyo',
  'zoom': '19',
  'onStart': () => setup(tokyo_19),
  // 'onCycle': event => cycle(event),
  'onComplete': event => complete(event),
});
suite.add({
  'name': 'PixiLayerOsm Renderer Benchmark with zoom 17 Tokyo data',
  'fn': renderTest,
  'placename': 'tokyo',
  'zoom': '17',
  'onStart': () => setup(tokyo_17),
  // 'onCycle': event => cycle(event),
  'onComplete': event => complete(event),
});
suite.add({
  'name': 'PixiLayerOsm Renderer Benchmark with zoom 15 Tokyo data',
  'fn': renderTest,
  'placename': 'tokyo',
  'zoom': '15',
  'onStart': () => setup(tokyo_15),
  // 'onCycle': event => cycle(event),
  'onComplete': event => complete(event),
});

suite.run();
