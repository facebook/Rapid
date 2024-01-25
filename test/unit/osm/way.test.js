import { after, before, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('osmWay', () => {
    var _savedAreaKeys;

    before(() => {
        _savedAreaKeys = Rapid.osmAreaKeys;
        Rapid.osmSetAreaKeys({ building: {} });
    });


    after(() => {
        Rapid.osmSetAreaKeys(_savedAreaKeys);
    });


    it('returns a way', () => {
        var way = Rapid.osmWay();
        assert.ok(way instanceof Rapid.osmWay);
        assert.equal(way.type, 'way');
    });


    it('defaults nodes to an empty array', () => {
        var way = Rapid.osmWay();
        assert.deepEqual(way.nodes, []);
    });


    it('sets nodes as specified', () => {
        var way = Rapid.osmWay({nodes: ['n-1']});
        assert.deepEqual(way.nodes, ['n-1']);
    });


    it('defaults tags to an empty object', () => {
        var way = Rapid.osmWay();
        assert.deepEqual(way.tags, {});
    });


    it('sets tags as specified', () => {
        var way = Rapid.osmWay({tags: {foo: 'bar'}});
        assert.deepEqual(way.tags, {foo: 'bar'});
    });


    describe('#copy', () => {
        it('returns a new Way', () => {
            const w = Rapid.osmWay({id: 'w'}),
                result = w.copy(null, {});

            assert.ok(result instanceof Rapid.osmWay);
            assert.notEqual(result, w);
        });


        it('adds the new Way to input object', () => {
            const w = Rapid.osmWay({id: 'w'}),
                copies = {},
                result = w.copy(null, copies);
            assert.equal(Object.keys(copies).length, 1);
            assert.equal(copies.w, result);
        });


        it('returns an existing copy in input object', () => {
            const w = Rapid.osmWay({id: 'w'}),
                copies = {},
                result1 = w.copy(null, copies),
                result2 = w.copy(null, copies);
            assert.equal(Object.keys(copies).length, 1);
            assert.equal(result1, result2);
        });


        it('deep copies nodes', () => {
            const a = Rapid.osmNode({id: 'a'}),
                b = Rapid.osmNode({id: 'b'}),
                w = Rapid.osmWay({id: 'w', nodes: ['a', 'b']}),
                graph = new Rapid.Graph([a, b, w]),
                copies = {},
                result = w.copy(graph, copies);

            assert.equal(Object.keys(copies).length, 3);
            assert.ok(copies.a instanceof Rapid.osmNode);
            assert.ok(copies.b instanceof Rapid.osmNode);
            assert.notEqual(copies.a, w.nodes[0]);
            assert.notEqual(copies.b, w.nodes[1]);
            assert.deepEqual(result.nodes, [copies.a.id, copies.b.id]);
        });


        it('creates only one copy of shared nodes', () => {
            const a = Rapid.osmNode({id: 'a'}),
                w = Rapid.osmWay({id: 'w', nodes: ['a', 'a']}),
                graph = new Rapid.Graph([a, w]),
                copies = {},
                result = w.copy(graph, copies);

            assert.equal(result.nodes[0], result.nodes[1]);
        });
    });

    describe('#first', () => {
        it('returns the first node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.equal(way.first(), 'a');
        });
    });

    describe('#last', () => {
        it('returns the last node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.equal(way.last(), 'c');
        });
    });

    describe('#contains', () => {
        it('returns true if the way contains the given node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.ok(way.contains('b'));
        });


        it('returns false if the way does not contain the given node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.ok(!way.contains('d'));
        });
    });


    describe('#affix', () => {
        it('returns \'prefix\' if the way starts with the given node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.equal(way.affix('a'), 'prefix');
        });


        it('returns \'suffix\' if the way ends with the given node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.equal(way.affix('c'), 'suffix');
        });


        it('returns falsy if the way does not start or end with the given node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.ok(!way.affix('b'));
            assert.ok(!Rapid.osmWay({nodes: []}).affix('b'));
        });
    });

    describe('#extent', () => {
        it('returns the minimal Extent containing all member nodes', () => {
            const node1 = Rapid.osmNode({loc: [0, 0]});
            const node2 = Rapid.osmNode({loc: [5, 10]});
            var way = Rapid.osmWay({nodes: [node1.id, node2.id]});
            const graph = new Rapid.Graph([node1, node2, way]);
            const extent = way.extent(graph);
            assert.ok(extent.equals(new Rapid.sdk.Extent([0, 0], [5, 10])));
        });
    });


    describe('#isClosed', () => {
        it('returns false when the way contains no nodes', () => {
            var way = Rapid.osmWay();
            assert.equal(way.isClosed(), false);
        });


        it('returns false when the way contains a single node', () => {
            var way = Rapid.osmWay({ nodes: 'a'.split('') });
            assert.equal(way.isClosed(), false);
        });


        it('returns false when the way ends are not equal', () => {
            var way = Rapid.osmWay({ nodes: 'abc'.split('') });
            assert.equal(way.isClosed(), false);
        });


        it('returns true when the way ends are equal', () => {
            var way = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(way.isClosed(), true);
        });


        it('returns true when the way contains two of the same node', () => {
            var way = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(way.isClosed(), true);
        });
    });


    describe('#isConvex', () => {
        it('returns true for convex ways', () => {
            //    d -- e
            //    |     \
            //    |      a
            //    |     /
            //    c -- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [ 0.0003,  0.0000]}),
                Rapid.osmNode({id: 'b', loc: [ 0.0002, -0.0002]}),
                Rapid.osmNode({id: 'c', loc: [-0.0002, -0.0002]}),
                Rapid.osmNode({id: 'd', loc: [-0.0002,  0.0002]}),
                Rapid.osmNode({id: 'e', loc: [ 0.0002,  0.0002]}),
                Rapid.osmWay({id: 'w', nodes: ['a','b','c','d','e','a']})
            ]);
            assert.ok(graph.entity('w').isConvex(graph));
        });


        it('returns false for concave ways', () => {
            //    d -- e
            //    |   /
            //    |  a
            //    |   \
            //    c -- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [ 0.0000,  0.0000]}),
                Rapid.osmNode({id: 'b', loc: [ 0.0002, -0.0002]}),
                Rapid.osmNode({id: 'c', loc: [-0.0002, -0.0002]}),
                Rapid.osmNode({id: 'd', loc: [-0.0002,  0.0002]}),
                Rapid.osmNode({id: 'e', loc: [ 0.0002,  0.0002]}),
                Rapid.osmWay({id: 'w', nodes: ['a','b','c','d','e','a']})
            ]);
            assert.equal(graph.entity('w').isConvex(graph), false);
        });


        it('returns null for non-closed ways', () => {
            //    d -- e
            //    |
            //    |  a
            //    |   \
            //    c -- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [ 0.0000,  0.0000]}),
                Rapid.osmNode({id: 'b', loc: [ 0.0002, -0.0002]}),
                Rapid.osmNode({id: 'c', loc: [-0.0002, -0.0002]}),
                Rapid.osmNode({id: 'd', loc: [-0.0002,  0.0002]}),
                Rapid.osmNode({id: 'e', loc: [ 0.0002,  0.0002]}),
                Rapid.osmWay({id: 'w', nodes: ['a','b','c','d','e']})
            ]);
            assert.equal(graph.entity('w').isConvex(graph), null);
        });


        it('returns null for degenerate ways', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0.0000,  0.0000]}),
                Rapid.osmWay({id: 'w', nodes: ['a','a']})
            ]);
            assert.equal(graph.entity('w').isConvex(graph), null);
        });
    });


    describe('#layer', () => {
        it('returns 0 when the way has no tags', () => {
            var way = Rapid.osmWay();
            assert.equal(way.layer(), 0);
        });


        it('returns 0 when the way has a non numeric layer tag', () => {
            var way = Rapid.osmWay({tags: { layer: 'NaN' }});
            assert.equal(way.layer(), 0);
            way = Rapid.osmWay({tags: { layer: 'Infinity' }});
            assert.equal(way.layer(), 0);
            way = Rapid.osmWay({tags: { layer: 'Foo' }});
            assert.equal(way.layer(), 0);
        });


        it('returns the layer when the way has an explicit layer tag', () => {
            var way = Rapid.osmWay({tags: { layer: '2' }});
            assert.equal(way.layer(), 2);
            way = Rapid.osmWay({tags: { layer: '-5' }});
            assert.equal(way.layer(), -5);
        });


        it('clamps the layer to within -10, 10', () => {
            var way = Rapid.osmWay({tags: { layer: '12' }});
            assert.equal(way.layer(), 10);
            way = Rapid.osmWay({tags: { layer: '-15' }});
            assert.equal(way.layer(), -10);
        });


        it('returns 1 for location=overground', () => {
            var way = Rapid.osmWay({tags: { location: 'overground' }});
            assert.equal(way.layer(), 1);
        });


        it('returns -1 for covered=yes', () => {
            var way = Rapid.osmWay({tags: { covered: 'yes' }});
            assert.equal(way.layer(), -1);
        });


        it('returns -1 for location=underground', () => {
            var way = Rapid.osmWay({tags: { location: 'underground' }});
            assert.equal(way.layer(), -1);
        });


        it('returns -10 for location=underwater', () => {
            var way = Rapid.osmWay({tags: { location: 'underwater' }});
            assert.equal(way.layer(), -10);
        });


        it('returns 10 for power lines', () => {
            var way = Rapid.osmWay({tags: { power: 'line' }});
            assert.equal(way.layer(), 10);
            way = Rapid.osmWay({tags: { power: 'minor_line' }});
            assert.equal(way.layer(), 10);
        });


        it('returns 10 for aerialways', () => {
            var way = Rapid.osmWay({tags: { aerialway: 'cable_car' }});
            assert.equal(way.layer(), 10);
        });


        it('returns 1 for bridges', () => {
            var way = Rapid.osmWay({tags: { bridge: 'yes' }});
            assert.equal(way.layer(), 1);
        });


        it('returns -1 for cuttings', () => {
            var way = Rapid.osmWay({tags: { cutting: 'yes' }});
            assert.equal(way.layer(), -1);
        });


        it('returns -1 for tunnels', () => {
            var way = Rapid.osmWay({tags: { tunnel: 'yes' }});
            assert.equal(way.layer(), -1);
        });


        it('returns -1 for waterways', () => {
            var way = Rapid.osmWay({tags: { waterway: 'stream' }});
            assert.equal(way.layer(), -1);
        });


        it('returns -10 for boundaries', () => {
            var way = Rapid.osmWay({tags: { boundary: 'administrative' }});
            assert.equal(way.layer(), -10);
        });
    });


    describe('#isOneWay', () => {
        it('returns false when the way has no tags', () => {
            var way = Rapid.osmWay();
            assert.equal(way.isOneWay(), false);
        });


        it('returns false when the way has tag oneway=no', () => {
            var way = Rapid.osmWay({tags: { oneway: 'no' }});
            assert.equal(way.isOneWay(), false, 'oneway no');
            way = Rapid.osmWay({tags: { oneway: '0' }});
            assert.equal(way.isOneWay(), false, 'oneway 0');
        });


        it('returns true when the way has tag oneway=yes', () => {
            var way = Rapid.osmWay({tags: { oneway: 'yes' }});
            assert.equal(way.isOneWay(), true, 'oneway yes');
            way = Rapid.osmWay({tags: { oneway: '1' }});
            assert.equal(way.isOneWay(), true, 'oneway 1');
            way = Rapid.osmWay({tags: { oneway: '-1' }});
            assert.equal(way.isOneWay(), true, 'oneway -1');
        });


        it('returns true when the way has tag oneway=reversible', () => {
            var way = Rapid.osmWay({tags: { oneway: 'reversible' }});
            assert.equal(way.isOneWay(), true, 'oneway reversible');
        });


        it('returns true when the way has tag oneway=alternating', () => {
            var way = Rapid.osmWay({tags: { oneway: 'alternating' }});
            assert.equal(way.isOneWay(), true, 'oneway alternating');
        });


        it('returns true when the way has implied oneway tag (waterway=river, waterway=stream, etc)', () => {
            var way = Rapid.osmWay({tags: { waterway: 'river' }});
            assert.equal(way.isOneWay(), true, 'river');
            way = Rapid.osmWay({tags: { waterway: 'stream' }});
            assert.equal(way.isOneWay(), true, 'stream');
            way = Rapid.osmWay({tags: { highway: 'motorway' }});
            assert.equal(way.isOneWay(), true, 'motorway');
            way = Rapid.osmWay({tags: { junction: 'roundabout' }});
            assert.equal(way.isOneWay(), true, 'roundabout');
            way = Rapid.osmWay({tags: { junction: 'circular' }});
            assert.equal(way.isOneWay(), true, 'circular');
        });


        it('returns false when the way does not have implied oneway tag', () => {
            var way = Rapid.osmWay({tags: { highway: 'motorway_link' }});
            assert.equal(way.isOneWay(), false, 'motorway_link');
            way = Rapid.osmWay({tags: { highway: 'trunk' }});
            assert.equal(way.isOneWay(), false, 'trunk');
            way = Rapid.osmWay({tags: { highway: 'trunk_link' }});
            assert.equal(way.isOneWay(), false, 'trunk_link');
            way = Rapid.osmWay({tags: { highway: 'primary' }});
            assert.equal(way.isOneWay(), false, 'primary');
            way = Rapid.osmWay({tags: { highway: 'primary_link' }});
            assert.equal(way.isOneWay(), false, 'primary_link');
            way = Rapid.osmWay({tags: { highway: 'secondary' }});
            assert.equal(way.isOneWay(), false, 'secondary');
            way = Rapid.osmWay({tags: { highway: 'secondary_link' }});
            assert.equal(way.isOneWay(), false, 'secondary_link');
            way = Rapid.osmWay({tags: { highway: 'tertiary' }});
            assert.equal(way.isOneWay(), false, 'tertiary');
            way = Rapid.osmWay({tags: { highway: 'tertiary_link' }});
            assert.equal(way.isOneWay(), false, 'tertiary_link');
            way = Rapid.osmWay({tags: { highway: 'unclassified' }});
            assert.equal(way.isOneWay(), false, 'unclassified');
            way = Rapid.osmWay({tags: { highway: 'residential' }});
            assert.equal(way.isOneWay(), false, 'residential');
            way = Rapid.osmWay({tags: { highway: 'living_street' }});
            assert.equal(way.isOneWay(), false, 'living_street');
            way = Rapid.osmWay({tags: { highway: 'service' }});
            assert.equal(way.isOneWay(), false, 'service');
            way = Rapid.osmWay({tags: { highway: 'track' }});
            assert.equal(way.isOneWay(), false, 'track');
            way = Rapid.osmWay({tags: { highway: 'path' }});
            assert.equal(way.isOneWay(), false, 'path');
        });


        it('returns false when oneway=no overrides implied oneway tag', () => {
            var way = Rapid.osmWay({tags: { junction: 'roundabout', oneway: 'no' }});
            assert.equal(way.isOneWay(), false, 'roundabout');
            way = Rapid.osmWay({tags: { junction: 'circular', oneway: 'no' }});
            assert.equal(way.isOneWay(), false, 'circular');
            way = Rapid.osmWay({tags: { highway: 'motorway', oneway: 'no' }});
            assert.equal(way.isOneWay(), false, 'motorway');
        });
    });


    describe('#sidednessIdentifier', () => {
        it('returns tag when the tag has implied sidedness', () => {
            var way = Rapid.osmWay({tags: { natural: 'cliff' }});
            assert.equal(way.sidednessIdentifier(), 'natural');
            way = Rapid.osmWay({tags: { natural: 'coastline' }});
            assert.equal(way.sidednessIdentifier(), 'coastline');
            way = Rapid.osmWay({tags: { barrier: 'retaining_wall' }});
            assert.equal(way.sidednessIdentifier(), 'barrier');
            way = Rapid.osmWay({tags: { barrier: 'kerb' }});
            assert.equal(way.sidednessIdentifier(), 'barrier');
            way = Rapid.osmWay({tags: { barrier: 'guard_rail' }});
            assert.equal(way.sidednessIdentifier(), 'barrier');
            way = Rapid.osmWay({tags: { barrier: 'city_wall' }});
            assert.equal(way.sidednessIdentifier(), 'barrier');
            way = Rapid.osmWay({tags: { man_made: 'embankment' }});
            assert.equal(way.sidednessIdentifier(), 'man_made');
            way = Rapid.osmWay({tags: {'abandoned:barrier': 'guard_rail' }});
            assert.equal(way.sidednessIdentifier(), 'barrier');
        });


        it('returns null when tag does not have implied sidedness', () => {
            var way = Rapid.osmWay({tags: { natural: 'ridge' }});
            assert.equal(way.sidednessIdentifier(), null);
            way = Rapid.osmWay({tags: { barrier: 'fence' }});
            assert.equal(way.sidednessIdentifier(), null);
            way = Rapid.osmWay({tags: { man_made: 'dyke' }});
            assert.equal(way.sidednessIdentifier(), null);
            way = Rapid.osmWay({tags: { highway: 'motorway' }});
            assert.equal(way.sidednessIdentifier(), null);
            way = Rapid.osmWay({tags: {'demolished:highway': 'motorway' }});
            assert.equal(way.sidednessIdentifier(), null);
            way = Rapid.osmWay({tags: {'not:natural': 'cliff' }});
            assert.equal(way.sidednessIdentifier(), null);
        });
    });


    describe('#isSided', () => {
        it('returns false when the way has no tags', () => {
            var way = Rapid.osmWay();
            assert.equal(way.isSided(), false);
        });


        it('returns false when the way has two_sided=yes', () => {
            var way = Rapid.osmWay({tags: { two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
        });


        it('returns true when the tag has implied sidedness', () => {
            var way = Rapid.osmWay({tags: { natural: 'cliff' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { natural: 'coastline' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'retaining_wall' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'kerb' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'guard_rail' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'city_wall' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { man_made: 'embankment' }});
            assert.equal(way.isSided(), true);
        });


        it('returns false when two_sided=yes overrides tag with implied sidedness', () => {
            var way = Rapid.osmWay({tags: { natural: 'cliff', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { natural: 'coastline', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { barrier: 'retaining_wall', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { barrier: 'kerb', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { barrier: 'guard_rail', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { barrier: 'city_wall', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { man_made: 'embankment', two_sided: 'yes' }});
            assert.equal(way.isSided(), false);
        });


        it('returns true when two_sided=no is on tag with implied sidedness', () => {
            var way = Rapid.osmWay({tags: { natural: 'cliff', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { natural: 'coastline', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'retaining_wall', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'kerb', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'guard_rail', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { barrier: 'city_wall', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
            way = Rapid.osmWay({tags: { man_made: 'embankment', two_sided: 'no' }});
            assert.equal(way.isSided(), true);
        });


        it('returns false when the tag does not have implied sidedness', () => {
            var way = Rapid.osmWay({tags: { natural: 'ridge' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { barrier: 'fence' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { man_made: 'dyke' }});
            assert.equal(way.isSided(), false);
            way = Rapid.osmWay({tags: { highway: 'motorway' }});
            assert.equal(way.isSided(), false);
        });
    });


    describe('#isArea', () => {
        it('returns false when the way has no tags', () => {
            var way = Rapid.osmWay();
            assert.equal(way.isArea(), false);
        });


        it('returns true if the way has tag area=yes', () => {
            var way = Rapid.osmWay({tags: { area: 'yes' }});
            assert.equal(way.isArea(), true);
        });


        it('returns false if the way is closed and has no tags', () => {
            var way = Rapid.osmWay({nodes: ['n1', 'n1']});
            assert.equal(way.isArea(), false);
        });


        it('returns true if the way is closed and has a key in Rapid.osmAreaKeys', () => {
            var way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: {building: 'yes'}});
            assert.equal(way.isArea(), true);
        });


        it('returns true for some highway and railway exceptions', () => {
            var way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { highway: 'services' }});
            assert.equal(way.isArea(), true, 'highway=services');
            way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { highway: 'rest_area' }});
            assert.equal(way.isArea(), true, 'highway=rest_area');
            way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { railway: 'roundhouse' }});
            assert.equal(way.isArea(), true, 'railway=roundhouse');
            way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { railway: 'station' }});
            assert.equal(way.isArea(), true, 'railway=station');
            way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { railway: 'traverser' }});
            assert.equal(way.isArea(), true, 'railway=traverser');
            way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { railway: 'turntable' }});
            assert.equal(way.isArea(), true, 'railway=turntable');
            way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: { railway: 'wash' }});
            assert.equal(way.isArea(), true, 'railway=wash');
        });


        it('returns false if the way is closed and has no keys in Rapid.osmAreaKeys', () => {
            var way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: {a: 'b'}});
            assert.equal(way.isArea(), false);
        });


        it('returns false if the way is closed and has tag area=no', () => {
            var way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: {area: 'no', building: 'yes'}});
            assert.equal(way.isArea(), false);
        });


        it('returns false for coastline', () => {
            var way = Rapid.osmWay({nodes: ['n1', 'n1'], tags: {natural: 'coastline'}});
            assert.equal(way.isArea(), false);
        });
    });


    describe('#isDegenerate', () => {
        it('returns true for a linear way with zero or one nodes', () => {
            var way = Rapid.osmWay({nodes: []});
            assert.equal(way.isDegenerate(), true);
            way = Rapid.osmWay({nodes: ['a']});
            assert.equal(way.isDegenerate(), true);
        });


        it('returns true for a circular way with only one unique node', () => {
            var way = Rapid.osmWay({nodes: ['a', 'a']});
            assert.equal(way.isDegenerate(), true);
        });


        it('returns false for a linear way with two or more nodes', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b']});
            assert.equal(way.isDegenerate(), false);
        });


        it('returns true for a linear way that doubles back on itself', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'a']});
            assert.equal(way.isDegenerate(), true);
        });


        it('returns true for an area with zero, one, or two unique nodes', () => {
            var way = Rapid.osmWay({tags: {area: 'yes'}, nodes: []});
            assert.equal(way.isDegenerate(), true);
            way = Rapid.osmWay({tags: {area: 'yes'}, nodes: ['a', 'a']});
            assert.equal(way.isDegenerate(), true);
            way = Rapid.osmWay({tags: {area: 'yes'}, nodes: ['a', 'b', 'a']});
            assert.equal(way.isDegenerate(), true);
        });


        it('returns false for an area with three or more unique nodes', () => {
            var way = Rapid.osmWay({tags: {area: 'yes'}, nodes: ['a', 'b', 'c', 'a']});
            assert.equal(way.isDegenerate(), false);
        });
    });


    describe('#areAdjacent', () => {
        it('returns false for nodes not in the way', () => {
            var way = Rapid.osmWay();
            assert.equal(way.areAdjacent('a', 'b'), false);
        });


        it('returns false for non-adjacent nodes in the way', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c']});
            assert.equal(way.areAdjacent('a', 'c'), false);
        });


        it('returns true for adjacent nodes in the way (forward)', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c', 'd']});
            assert.equal(way.areAdjacent('a', 'b'), true);
            assert.equal(way.areAdjacent('b', 'c'), true);
            assert.equal(way.areAdjacent('c', 'd'), true);
        });


        it('returns true for adjacent nodes in the way (reverse)', () => {
            var way = Rapid.osmWay({nodes: ['a', 'b', 'c', 'd']});
            assert.equal(way.areAdjacent('b', 'a'), true);
            assert.equal(way.areAdjacent('c', 'b'), true);
            assert.equal(way.areAdjacent('d', 'c'), true);
        });
    });


    describe('#geometry', () => {
        it('returns \'line\' when the way is not an area', () => {
            const graph = new Rapid.Graph();
            var way = Rapid.osmWay();
            assert.equal(way.geometry(graph), 'line');
        });


        it('returns \'area\' when the way is an area', () => {
            const graph = new Rapid.Graph();
            var way = Rapid.osmWay({tags: { area: 'yes' }});
            assert.equal(way.geometry(graph), 'area');
        });
    });


    describe('#close', () => {
        it('returns self for empty way', () => {
            const w = Rapid.osmWay();
            assert.deepEqual(w.close(), w);
        });


        it('returns self for already closed way', () => {
            const w1 = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.deepEqual(w1.close(), w1);
            const w2 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.deepEqual(w2.close(), w2);
        });


        it('closes a way', () => {
            const w1 = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.equal(w1.close().nodes.join(''), 'aba', 'multiple');
            const w2 = Rapid.osmWay({ nodes: 'a'.split('') });
            assert.equal(w2.close().nodes.join(''), 'aa', 'single');
        });


        it('eliminates duplicate consecutive nodes when closing a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abb'.split('') });
            assert.equal(w1.close().nodes.join(''), 'aba', 'duplicate at end');
            const w2 = Rapid.osmWay({ nodes: 'abbc'.split('') });
            assert.equal(w2.close().nodes.join(''), 'abca', 'duplicate in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabc'.split('') });
            assert.equal(w3.close().nodes.join(''), 'abca', 'duplicate at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abbbcbb'.split('') });
            assert.equal(w4.close().nodes.join(''), 'abcba', 'duplicates multiple places');
        });
    });


    describe('#unclose', () => {
        it('returns self for empty way', () => {
            const w = Rapid.osmWay();
            assert.deepEqual(w.unclose(), w);
        });


        it('returns self for already unclosed way', () => {
            const w1 = Rapid.osmWay({ nodes: 'a'.split('') });
            assert.deepEqual(w1.unclose(), w1);
            const w2 = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.deepEqual(w2.unclose(), w2);
        });


        it('uncloses a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(w1.unclose().nodes.join(''), 'ab', 'multiple');
            const w2 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w2.unclose().nodes.join(''), 'a', 'single');
        });


        it('eliminates duplicate consecutive nodes when unclosing a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.unclose().nodes.join(''), 'abc', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.unclose().nodes.join(''), 'abc', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.unclose().nodes.join(''), 'abc', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.unclose().nodes.join(''), 'abc', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.unclose().nodes.join(''), 'abcb', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.unclose().nodes.join(''), 'a', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.unclose().nodes.join(''), 'a', 'single node circular with duplicates');
        });
    });


    describe('#addNode', () => {
        it('adds a node to an empty way', () => {
            const w = Rapid.osmWay();
            assert.deepEqual(w.addNode('a').nodes, ['a']);
        });


        it('adds a node to the end of a linear way when index is undefined', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.equal(w.addNode('c').nodes.join(''), 'abc');
        });


        it('adds a node before the end connector of a circular way when index is undefined', () => {
            const w1 = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(w1.addNode('c').nodes.join(''), 'abca', 'circular');
            const w2 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w2.addNode('c').nodes.join(''), 'aca', 'single node circular');
        });


        it('adds an internal node to a linear way at a positive index', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.equal(w.addNode('c', 1).nodes.join(''), 'acb');
        });


        it('adds an internal node to a circular way at a positive index', () => {
            const w1 = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(w1.addNode('c', 1).nodes.join(''), 'acba', 'circular');
            const w2 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w2.addNode('c', 1).nodes.join(''), 'aca', 'single node circular');
        });


        it('adds a leading node to a linear way at index 0', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.equal(w.addNode('c', 0).nodes.join(''), 'cab');
        });


        it('adds a leading node to a circular way at index 0, preserving circularity', () => {
            const w1 = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(w1.addNode('c', 0).nodes.join(''), 'cabc', 'circular');
            const w2 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w2.addNode('c', 0).nodes.join(''), 'cac', 'single node circular');
        });


        it('throws RangeError if index outside of array range for linear way', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.throws(() => w.addNode('c', 3), RangeError, /out of range 0\.\.2/, 'over range');
            assert.throws(() => w.addNode('c', -1), RangeError, /out of range 0\.\.2/, 'under range');
        });


        it('throws RangeError if index outside of array range for circular way', () => {
            const w = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.throws(() => w.addNode('c', 3), RangeError, /out of range 0\.\.2/, 'over range');
            assert.throws(() => w.addNode('c', -1), RangeError, /out of range 0\.\.2/, 'under range');
        });


        it('eliminates duplicate consecutive nodes when adding to the end of a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abb'.split('') });
            assert.equal(w1.addNode('b').nodes.join(''), 'ab', 'duplicate at end');
            const w2 = Rapid.osmWay({ nodes: 'abbc'.split('') });
            assert.equal(w2.addNode('c').nodes.join(''), 'abc', 'duplicate in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabc'.split('') });
            assert.equal(w3.addNode('c').nodes.join(''), 'abc', 'duplicate at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abbbcbb'.split('') });
            assert.equal(w4.addNode('b').nodes.join(''), 'abcb', 'duplicates multiple places');
        });


        it('eliminates duplicate consecutive nodes when adding same node before the end connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.addNode('c').nodes.join(''), 'abca', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.addNode('c').nodes.join(''), 'abca', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.addNode('c').nodes.join(''), 'abca', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.addNode('a').nodes.join(''), 'abca', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.addNode('b').nodes.join(''), 'abcba', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.addNode('a').nodes.join(''), 'aa', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.addNode('a').nodes.join(''), 'aa', 'single node circular with duplicates');
        });


        it('eliminates duplicate consecutive nodes when adding different node before the end connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.addNode('d').nodes.join(''), 'abcda', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.addNode('d').nodes.join(''), 'abcda', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.addNode('d').nodes.join(''), 'abcda', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.addNode('d').nodes.join(''), 'abcda', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.addNode('d').nodes.join(''), 'abcbda', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.addNode('d').nodes.join(''), 'ada', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.addNode('d').nodes.join(''), 'ada', 'single node circular with duplicates');
        });


        it('eliminates duplicate consecutive nodes when adding to the beginning of a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abb'.split('') });
            assert.equal(w1.addNode('a', 0).nodes.join(''), 'ab', 'duplicate at end');
            const w2 = Rapid.osmWay({ nodes: 'abbc'.split('') });
            assert.equal(w2.addNode('a', 0).nodes.join(''), 'abc', 'duplicate in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabc'.split('') });
            assert.equal(w3.addNode('a', 0).nodes.join(''), 'abc', 'duplicate at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abbbcbb'.split('') });
            assert.equal(w4.addNode('a', 0).nodes.join(''), 'abcb', 'duplicates multiple places');
        });


        it('eliminates duplicate consecutive nodes when adding same node as beginning connector a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.addNode('a', 0).nodes.join(''), 'abca', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.addNode('a', 0).nodes.join(''), 'abca', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.addNode('a', 0).nodes.join(''), 'abca', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.addNode('a', 0).nodes.join(''), 'abca', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.addNode('a', 0).nodes.join(''), 'abcba', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.addNode('a', 0).nodes.join(''), 'aa', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.addNode('a', 0).nodes.join(''), 'aa', 'single node circular with duplicates');
        });


        it('eliminates duplicate consecutive nodes when adding different node as beginning connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.addNode('d', 0).nodes.join(''), 'dabcd', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.addNode('d', 0).nodes.join(''), 'dabcd', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.addNode('d', 0).nodes.join(''), 'dabcd', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.addNode('d', 0).nodes.join(''), 'dabcd', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.addNode('d', 0).nodes.join(''), 'dabcbd', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.addNode('d', 0).nodes.join(''), 'dad', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.addNode('d', 0).nodes.join(''), 'dad', 'single node circular with duplicates');
        });
    });



    describe('#updateNode', () => {
        it('throws RangeError if empty way', () => {
            const w = Rapid.osmWay();
            assert.throws(() => w.updateNode('d', 0), RangeError, /out of range 0\.\.-1/);
        });


        it('updates an internal node on a linear way at a positive index', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.equal(w.updateNode('d', 1).nodes.join(''), 'ad');
        });


        it('updates an internal node on a circular way at a positive index', () => {
            const w = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(w.updateNode('d', 1).nodes.join(''), 'ada', 'circular');
        });


        it('updates a leading node on a linear way at index 0', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.equal(w.updateNode('d', 0).nodes.join(''), 'db');
        });


        it('updates a leading node on a circular way at index 0, preserving circularity', () => {
            const w1 = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.equal(w1.updateNode('d', 0).nodes.join(''), 'dbd', 'circular');
            const w2 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w2.updateNode('d', 0).nodes.join(''), 'dd', 'single node circular');
        });


        it('throws RangeError if index outside of array range for linear way', () => {
            const w = Rapid.osmWay({ nodes: 'ab'.split('') });
            assert.throws(() => w.updateNode('d', 2), RangeError, /out of range 0\.\.1/, 'over range');
            assert.throws(() => w.updateNode('d', -1), RangeError, /out of range 0\.\.1/, 'under range');
        });


        it('throws RangeError if index outside of array range for circular way', () => {
            const w = Rapid.osmWay({ nodes: 'aba'.split('') });
            assert.throws(() => w.updateNode('d', 3), RangeError, /out of range 0\.\.2/, 'over range');
            assert.throws(() => w.updateNode('d', -1), RangeError, /out of range 0\.\.2/, 'under range');
        });


        it('eliminates duplicate consecutive nodes when updating the end of a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcc'.split('') });
            assert.equal(w1.updateNode('c', 3).nodes.join(''), 'abc', 'duplicate at end');
            const w2 = Rapid.osmWay({ nodes: 'abbc'.split('') });
            assert.equal(w2.updateNode('c', 3).nodes.join(''), 'abc', 'duplicate in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabc'.split('') });
            assert.equal(w3.updateNode('c', 3).nodes.join(''), 'abc', 'duplicate at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abbbcbb'.split('') });
            assert.equal(w4.updateNode('b', 6).nodes.join(''), 'abcb', 'duplicates multiple places');
        });


        it('eliminates duplicate consecutive nodes when updating same node before the end connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.updateNode('c', 3).nodes.join(''), 'abca', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.updateNode('c', 3).nodes.join(''), 'abca', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.updateNode('c', 3).nodes.join(''), 'abca', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.updateNode('a', 3).nodes.join(''), 'abca', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.updateNode('b', 6).nodes.join(''), 'abcba', 'duplicates multiple places');
        });


        it('eliminates duplicate consecutive nodes when updating different node before the end connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.updateNode('d', 3).nodes.join(''), 'abcda', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.updateNode('d', 3).nodes.join(''), 'abda', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.updateNode('d', 3).nodes.join(''), 'abda', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.updateNode('d', 3).nodes.join(''), 'dbcd', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.updateNode('d', 6).nodes.join(''), 'abcbda', 'duplicates multiple places');
        });


        it('eliminates duplicate consecutive nodes when updating the beginning of a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abb'.split('') });
            assert.equal(w1.updateNode('b', 0).nodes.join(''), 'b', 'duplicate at end');
            const w2 = Rapid.osmWay({ nodes: 'abbc'.split('') });
            assert.equal(w2.updateNode('b', 0).nodes.join(''), 'bc', 'duplicate in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabc'.split('') });
            assert.equal(w3.updateNode('a', 0).nodes.join(''), 'abc', 'duplicate at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abbbcbb'.split('') });
            assert.equal(w4.updateNode('a', 0).nodes.join(''), 'abcb', 'duplicates multiple places');
        });


        it('eliminates duplicate consecutive nodes when updating same node as beginning connector a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.updateNode('a', 0).nodes.join(''), 'abca', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.updateNode('a', 0).nodes.join(''), 'abca', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.updateNode('a', 0).nodes.join(''), 'abca', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.updateNode('a', 0).nodes.join(''), 'abca', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.updateNode('a', 0).nodes.join(''), 'abcba', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.updateNode('a', 0).nodes.join(''), 'aa', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.updateNode('a', 0).nodes.join(''), 'aa', 'single node circular with duplicates');
        });


        it('eliminates duplicate consecutive nodes when updating different node as beginning connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.updateNode('d', 0).nodes.join(''), 'dbcd', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.updateNode('d', 0).nodes.join(''), 'dbcd', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.updateNode('d', 0).nodes.join(''), 'dbcd', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.updateNode('d', 0).nodes.join(''), 'dbcd', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.updateNode('d', 0).nodes.join(''), 'dbcbd', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.updateNode('d', 0).nodes.join(''), 'dd', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.updateNode('d', 0).nodes.join(''), 'dd', 'single node circular with duplicates');
        });


        it('eliminates duplicate consecutive nodes when updating different node as ending connector of a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcca'.split('') });
            assert.equal(w1.updateNode('d', 4).nodes.join(''), 'dbcd', 'duplicate internal node at end');
            const w2 = Rapid.osmWay({ nodes: 'abbca'.split('') });
            assert.equal(w2.updateNode('d', 4).nodes.join(''), 'dbcd', 'duplicate internal node in middle');
            const w3 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w3.updateNode('d', 4).nodes.join(''), 'dbcd', 'duplicate connector node at beginning');
            const w4 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w4.updateNode('d', 4).nodes.join(''), 'dbcd', 'duplicate connector node at end');
            const w5 = Rapid.osmWay({ nodes: 'abbbcbba'.split('') });
            assert.equal(w5.updateNode('d', 7).nodes.join(''), 'dbcbd', 'duplicates multiple places');
            const w6 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w6.updateNode('d', 1).nodes.join(''), 'dd', 'single node circular');
            const w7 = Rapid.osmWay({ nodes: 'aaa'.split('') });
            assert.equal(w7.updateNode('d', 2).nodes.join(''), 'dd', 'single node circular with duplicates');
        });
    });


    describe('#replaceNode', () => {
        it('replaces a node', () => {
            const w1 = Rapid.osmWay({ nodes: 'a'.split('') });
            assert.equal(w1.replaceNode('a','b').nodes.join(''), 'b', 'single replace, single node');
            const w2 = Rapid.osmWay({ nodes: 'abc'.split('') });
            assert.equal(w2.replaceNode('b','d').nodes.join(''), 'adc', 'single replace, linear');
            const w4 = Rapid.osmWay({ nodes: 'abca'.split('') });
            assert.equal(w4.replaceNode('b','d').nodes.join(''), 'adca', 'single replace, circular');
        });


        it('replaces multiply occurring nodes', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcb'.split('') });
            assert.equal(w1.replaceNode('b','d').nodes.join(''), 'adcd', 'multiple replace, linear');
            const w2 = Rapid.osmWay({ nodes: 'abca'.split('') });
            assert.equal(w2.replaceNode('a','d').nodes.join(''), 'dbcd', 'multiple replace, circular');
            const w3 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w3.replaceNode('a','d').nodes.join(''), 'dd', 'multiple replace, single node circular');
        });


        it('eliminates duplicate consecutive nodes when replacing along a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abbcd'.split('') });
            assert.equal(w1.replaceNode('c','b').nodes.join(''), 'abd', 'duplicate before');
            const w2 = Rapid.osmWay({ nodes: 'abcdd'.split('') });
            assert.equal(w2.replaceNode('c','d').nodes.join(''), 'abd', 'duplicate after');
            const w3 = Rapid.osmWay({ nodes: 'abbcbb'.split('')});
            assert.equal(w3.replaceNode('c','b').nodes.join(''), 'ab', 'duplicate before and after');
        });


        it('eliminates duplicate consecutive nodes when replacing internal nodes along a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abbcda'.split('') });
            assert.equal(w1.replaceNode('c','b').nodes.join(''), 'abda', 'duplicate before');
            const w2 = Rapid.osmWay({ nodes: 'abcdda'.split('') });
            assert.equal(w2.replaceNode('c','d').nodes.join(''), 'abda', 'duplicate after');
            const w3 = Rapid.osmWay({ nodes: 'abbcbba'.split('')});
            assert.equal(w3.replaceNode('c','b').nodes.join(''), 'aba', 'duplicate before and after');
        });


        it('eliminates duplicate consecutive nodes when replacing adjacent to connecting nodes along a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcda'.split('') });
            assert.equal(w1.replaceNode('d','a').nodes.join(''), 'abca', 'before single end connector');
            const w2 = Rapid.osmWay({ nodes: 'abcda'.split('') });
            assert.equal(w2.replaceNode('b','a').nodes.join(''), 'acda', 'after single beginning connector');
            const w3 = Rapid.osmWay({ nodes: 'abcdaa'.split('') });
            assert.equal(w3.replaceNode('d','a').nodes.join(''), 'abca', 'before duplicate end connector');
            const w4 = Rapid.osmWay({ nodes: 'aabcda'.split('') });
            assert.equal(w4.replaceNode('b','a').nodes.join(''), 'acda', 'after duplicate beginning connector');
        });


        it('eliminates duplicate consecutive nodes when replacing connecting nodes along a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w1.replaceNode('a','d').nodes.join(''), 'dbcd', 'duplicate end connector');
            const w2 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w2.replaceNode('a','d').nodes.join(''), 'dbcd', 'duplicate beginning connector');
            const w3 = Rapid.osmWay({ nodes: 'aabcaa'.split('') });
            assert.equal(w3.replaceNode('a','d').nodes.join(''), 'dbcd', 'duplicate beginning and end connectors');
            const w4 = Rapid.osmWay({ nodes: 'aabaacaa'.split('') });
            assert.equal(w4.replaceNode('a','d').nodes.join(''), 'dbdcd', 'duplicates multiple places');
        });
    });

    describe('#removeNode', () => {
        it('removes a node', () => {
            const w1 = Rapid.osmWay({ nodes: 'a'.split('') });
            assert.equal(w1.removeNode('a').nodes.join(''), '', 'single remove, single node');
            const w2 = Rapid.osmWay({ nodes: 'abc'.split('') });
            assert.equal(w2.removeNode('b').nodes.join(''), 'ac', 'single remove, linear');
            const w3 = Rapid.osmWay({ nodes: 'abca'.split('') });
            assert.equal(w3.removeNode('b').nodes.join(''), 'aca', 'single remove, circular');
            const w4 = Rapid.osmWay({ nodes: 'aa'.split('') });
            assert.equal(w4.removeNode('a').nodes.join(''), '', 'multiple remove, single node circular');
        });


        it('removes multiply occurring nodes', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcb'.split('') });
            assert.equal(w1.removeNode('b').nodes.join(''), 'ac', 'multiple remove, linear');
            const w2 = Rapid.osmWay({ nodes: 'abcba'.split('') });
            assert.equal(w2.removeNode('b').nodes.join(''), 'aca', 'multiple remove, circular');
        });


        it('eliminates duplicate consecutive nodes when removing along a linear way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abbcd'.split('') });
            assert.equal(w1.removeNode('c').nodes.join(''), 'abd', 'duplicate before');
            const w2 = Rapid.osmWay({ nodes: 'abcdd'.split('') });
            assert.equal(w2.removeNode('c').nodes.join(''), 'abd', 'duplicate after');
            const w3 = Rapid.osmWay({ nodes: 'abbcbb'.split('')});
            assert.equal(w3.removeNode('c').nodes.join(''), 'ab', 'duplicate before and after');
        });


        it('eliminates duplicate consecutive nodes when removing internal nodes along a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abbcda'.split('') });
            assert.equal(w1.removeNode('c').nodes.join(''), 'abda', 'duplicate before');
            const w2 = Rapid.osmWay({ nodes: 'abcdda'.split('') });
            assert.equal(w2.removeNode('c').nodes.join(''), 'abda', 'duplicate after');
            const w3 = Rapid.osmWay({ nodes: 'abbcbba'.split('')});
            assert.equal(w3.removeNode('c').nodes.join(''), 'aba', 'duplicate before and after');
        });


        it('eliminates duplicate consecutive nodes when removing adjacent to connecting nodes along a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcdaa'.split('') });
            assert.equal(w1.removeNode('d').nodes.join(''), 'abca', 'duplicate end connector');
            const w2 = Rapid.osmWay({ nodes: 'aabcda'.split('') });
            assert.equal(w2.removeNode('b').nodes.join(''), 'acda', 'duplicate beginning connector');
        });


        it('eliminates duplicate consecutive nodes when removing connecting nodes along a circular way', () => {
            const w1 = Rapid.osmWay({ nodes: 'abcaa'.split('') });
            assert.equal(w1.removeNode('a').nodes.join(''), 'bcb', 'duplicate end connector');
            const w2 = Rapid.osmWay({ nodes: 'aabca'.split('') });
            assert.equal(w2.removeNode('a').nodes.join(''), 'bcb', 'duplicate beginning connector');
            const w3 = Rapid.osmWay({ nodes: 'aabcaa'.split('') });
            assert.equal(w3.removeNode('a').nodes.join(''), 'bcb', 'duplicate beginning and end connectors');
            const w4 = Rapid.osmWay({ nodes: 'aabaacaa'.split('') });
            assert.equal(w4.removeNode('a').nodes.join(''), 'bcb', 'duplicates multiple places');
        });
    });


    describe('#asJXON', () => {
        it('converts a way to jxon', () => {
            const node = Rapid.osmWay({id: 'w-1', nodes: ['n1', 'n2'], tags: {highway: 'residential'}});
            assert.deepEqual(node.asJXON(), {way: {
                '@id': '-1',
                '@version': 0,
                nd: [{keyAttributes: {ref: '1'}}, {keyAttributes: {ref: '2'}}],
                tag: [{keyAttributes: {k: 'highway', v: 'residential'}}]}});
        });


        it('includes changeset if provided', () => {
            const jxon = Rapid.osmWay().asJXON('1234');
            assert.equal(jxon.way['@changeset'], '1234');
        });
    });


    describe('#asGeoJSON', () => {
        it('converts a line to a GeoJSON LineString geometry', () => {
            const a = Rapid.osmNode({loc: [1, 2]});
            const b = Rapid.osmNode({loc: [3, 4]});
            const w = Rapid.osmWay({tags: {highway: 'residential'}, nodes: [a.id, b.id]});
            const graph = new Rapid.Graph([a, b, w]);
            const json = w.asGeoJSON(graph);

            assert.equal(json.type, 'LineString');
            assert.deepEqual(json.coordinates, [a.loc, b.loc]);
        });


        it('converts an area to a GeoJSON Polygon geometry', () => {
            const a = Rapid.osmNode({loc: [1, 2]});
            const b = Rapid.osmNode({loc: [5, 6]});
            const c = Rapid.osmNode({loc: [3, 4]});
            const w = Rapid.osmWay({tags: {area: 'yes'}, nodes: [a.id, b.id, c.id, a.id]});
            const graph = new Rapid.Graph([a, b, c, w]);
            const json = w.asGeoJSON(graph);

            assert.equal(json.type, 'Polygon');
            assert.deepEqual(json.coordinates, [[a.loc, b.loc, c.loc, a.loc]]);
        });


        it('converts an unclosed area to a GeoJSON LineString geometry', () => {
            const a = Rapid.osmNode({loc: [1, 2]});
            const b = Rapid.osmNode({loc: [5, 6]});
            const c = Rapid.osmNode({loc: [3, 4]});
            const w = Rapid.osmWay({tags: {area: 'yes'}, nodes: [a.id, b.id, c.id]});
            const graph = new Rapid.Graph([a, b, c, w]);
            const json = w.asGeoJSON(graph);

            assert.equal(json.type, 'LineString');
            assert.deepEqual(json.coordinates, [a.loc, b.loc, c.loc]);
        });
    });


    describe('#area', () => {
        it('returns a relative measure of area', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [-0.0002,  0.0001]}),
                Rapid.osmNode({id: 'b', loc: [ 0.0002,  0.0001]}),
                Rapid.osmNode({id: 'c', loc: [ 0.0002, -0.0001]}),
                Rapid.osmNode({id: 'd', loc: [-0.0002, -0.0001]}),
                Rapid.osmNode({id: 'e', loc: [-0.0004,  0.0002]}),
                Rapid.osmNode({id: 'f', loc: [ 0.0004,  0.0002]}),
                Rapid.osmNode({id: 'g', loc: [ 0.0004, -0.0002]}),
                Rapid.osmNode({id: 'h', loc: [-0.0004, -0.0002]}),
                Rapid.osmWay({id: 's', tags: {area: 'yes'}, nodes: ['a', 'b', 'c', 'd', 'a']}),
                Rapid.osmWay({id: 'l', tags: {area: 'yes'}, nodes: ['e', 'f', 'g', 'h', 'e']})
            ]);

            const s = Math.abs(graph.entity('s').area(graph));
            const l = Math.abs(graph.entity('l').area(graph));

            assert.ok(s < l);
        });


        it('treats unclosed areas as if they were closed', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [-0.0002,  0.0001]}),
                Rapid.osmNode({id: 'b', loc: [ 0.0002,  0.0001]}),
                Rapid.osmNode({id: 'c', loc: [ 0.0002, -0.0001]}),
                Rapid.osmNode({id: 'd', loc: [-0.0002, -0.0001]}),
                Rapid.osmWay({id: 's', tags: {area: 'yes'}, nodes: ['a', 'b', 'c', 'd', 'a']}),
                Rapid.osmWay({id: 'l', tags: {area: 'yes'}, nodes: ['a', 'b', 'c', 'd']})
            ]);

            const s = graph.entity('s').area(graph);
            const l = graph.entity('l').area(graph);

            assert.equal(s, l);
        });


        it('returns 0 for degenerate areas', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [-0.0002,  0.0001]}),
                Rapid.osmNode({id: 'b', loc: [ 0.0002,  0.0001]}),
                Rapid.osmWay({id: '0', tags: {area: 'yes'}, nodes: []}),
                Rapid.osmWay({id: '1', tags: {area: 'yes'}, nodes: ['a']}),
                Rapid.osmWay({id: '2', tags: {area: 'yes'}, nodes: ['a', 'b']})
            ]);

            assert.equal(graph.entity('0').area(graph), 0);
            assert.equal(graph.entity('1').area(graph), 0);
            assert.equal(graph.entity('2').area(graph), 0);
        });
    });
});
