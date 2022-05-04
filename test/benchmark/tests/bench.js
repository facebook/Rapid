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
let renderData = jsonToOSM(staticData.data);
let graphEntities = castEntities(staticData.entities);
let projection = new iD.sdk.Projection(staticData.projection._x, staticData.projection._y, staticData.projection._k);
let zoom = staticData.zoom;
const timestamp = 1649012524130;

//Now initialize context in a similar fashion to our unit tests.
//Benchmark.js doesn't have the concept of a 'before all' or 'before each', so we just do it all here at a single go.
let content = d3.select('body').append('div');
let context = iD.coreContext().assetPath('../../dist/').init().container(content);
let graph = context.graph();
graph.rebase(graphEntities, [graph], false);

let map = context.map();
content.call(map);

function some(list, predicate) {
    if (list === null) {
        return false;
    }

    for (let i = 0; i < list.length; i++) {
        if (predicate(list[i], i)) {
            return true;
        }
    }

    return false;
}

suite
    // .add('Array.prototype.some', () => {
    //     const processed = values.some(value => value > 990000);
    // })
    // .add('for loop', () => {
    //     const processed = some(values, value => value > 990000);
    // })
    .add('PixiLayerOsm Renderer Benchmark with canned OSM Data', () => {
        const osmLayer = map.layers().getLayer('osm');
        osmLayer.drawPoints(timestamp, projection, zoom, renderData.points);
        osmLayer.drawVertices(timestamp, projection, zoom, renderData.vertices);
        osmLayer.drawLines(timestamp, projection, zoom, renderData.lines);
        osmLayer.drawPolygons(timestamp, projection, zoom, renderData.polygons);
        let renderer = map.renderer();
        renderer.dirtyScene(); //Dirty the scene so that subsequent runs of this same test don't operate at warp speed
        renderer.render();
    })
    .on('cycle', event => {
        const benchmark = event.target;

        console.log('static Data Zoom: ' + staticData.zoom);
        console.log(benchmark.toString());
    })
    .on('complete', () => {
        console.log('Benchmark suite complete.');
    })
    .run();