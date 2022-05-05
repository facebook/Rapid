// uncomment imports if running outside browser env!
// import Benchmark from 'benchmark';
const suite = new Benchmark.Suite();

const values = [];

for (let i = 0; i < 1000000; i++) {
    values.push(i);
}


// Converts a list of json OSM entities to osm objects
function jsonToOSM(renderData) {
    //Entity data is already split into points, vertices, lines, and polygons.

    let osmRenderData = {};

    let points = renderData.points.map(point => iD.osmNode(point));
    let vertices = renderData.vertices.map(vertex => iD.osmNode(vertex));
    let lines = renderData.lines.map(line => iD.osmWay(line));
    let polygons = renderData.polygons.map(polygon => iD.osmWay(polygon));

    osmRenderData.points = points;
    osmRenderData.vertices = vertices;
    osmRenderData.lines = lines;
    osmRenderData.polygons = polygons;

    return osmRenderData;
}

// Converts a list of json OSM entities to osm objects
function castEntities(entities) {

    let osmEntities = [];

    for (let entityKey in entities) {

        let entity = entities[entityKey];

        if (entity.id.charAt(0) === 'w') osmEntities.push(new iD.osmWay(entity));
        if (entity.id.charAt(0) === 'n') osmEntities.push(new iD.osmNode(entity));
    }

    return osmEntities;
}

//This staticData variable looks like it's not declared anywhere, but it is a global var loaded by the <script src='canned_osm_data.js'> declaration in bench.html
let renderData;
let graphEntities;
let projection;
let zoom;
const timestamp = 1649012524130;

//Now initialize context in a similar fashion to our unit tests.
//Benchmark.js doesn't have the concept of a 'before all' or 'before each', so we just do it all here at a single go.
let content = d3.select('body').append('div');
let context = iD.coreContext().assetPath('../../dist/').init().container(content);

let map = context.map();
content.call(map);


function renderTest() {
        const osmLayer = map.layers().getLayer('osm');
        osmLayer.drawPoints(timestamp, projection, zoom, renderData.points);
        osmLayer.drawVertices(timestamp, projection, zoom, renderData.vertices);
        osmLayer.drawLines(timestamp, projection, zoom, renderData.lines);
        osmLayer.drawPolygons(timestamp, projection, zoom, renderData.polygons);
        let renderer = map.renderer();
        renderer.dirtyScene(); //Dirty the scene so that subsequent runs of this same test don't operate at warp speed
        renderer.render();
}

function setup(dataBlob) {
    console.log('starting benchmark suite!');
    //This dataBlob variable should be the json blob exported in bench.html from a <script src='canned_osm_data.js'> declaration
    renderData = jsonToOSM(dataBlob.data);
    graphEntities = castEntities(dataBlob.entities);
    projection = new iD.sdk.Projection(dataBlob.projection._x, dataBlob.projection._y, dataBlob.projection._k);
    zoom = dataBlob.zoom;
    let graph = context.graph();
    graph.rebase(graphEntities, [graph], false);
}

function cycle(event) {
    const benchmark = event.target;
    console.log(benchmark.toString());
}

function complete() {
    console.log('Benchmark suite complete.');
}
// suite
//     .add('PixiLayerOsm Renderer Benchmark with canned OSM Data', renderTest)
//     .on('start', () => setup(staticData))
//     .on('cycle', event => cycle(event))
//     .on('complete', complete)
//     .run();

suite.add({
    'name': 'PixiLayerOsm Renderer Benchmark with canned OSM Data',
    'fn': renderTest,
    'onStart': () => setup(staticData),
    'onCycle': event => cycle(event),
    'onComplete': complete,
});
suite.add({
    'name': 'PixiLayerOsm Renderer Benchmark with zoom 19 Tokyo data',
    'fn': renderTest,
    'onStart': () => setup(tokyo_19),
    'onCycle': event => cycle(event),
    'onComplete': complete,
});
suite.add({
    'name': 'PixiLayerOsm Renderer Benchmark with zoom 17 Tokyo data',
    'fn': renderTest,
    'onStart': () => setup(tokyo_17),
    'onCycle': event => cycle(event),
    'onComplete': complete,
});
suite.add({
    'name': 'PixiLayerOsm Renderer Benchmark with zoom 17 Tokyo data',
    'fn': renderTest,
    'onStart': () => setup(tokyo_15),
    'onCycle': event => cycle(event),
    'onComplete': complete,
});

suite.run();
