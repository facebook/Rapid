import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionReverse', async t => {
    it('reverses the order of nodes in the way', function () {
        var node1 = Rapid.osmNode();
        var node2 = Rapid.osmNode();
        var way = Rapid.osmWay({nodes: [node1.id, node2.id]});
        var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, way]));
        expect(graph.entity(way.id).nodes).to.eql([node2.id, node1.id]);
    });

    it('preserves non-directional tags', function () {
        var way = Rapid.osmWay({tags: {'highway': 'residential'}});
        var graph = new Rapid.Graph([way]);

        graph = Rapid.actionReverse(way.id)(graph);
        expect(graph.entity(way.id).tags).to.eql({'highway': 'residential'});
    });

    it('reverses directional tags on nodes', function () {
        it('reverses relative directions', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': 'forward' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': 'backward' });
        });

        it('reverses relative directions for arbitrary direction tags', function () {
            var node1 = Rapid.osmNode({ tags: { 'traffic_sign:direction': 'forward' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'traffic_sign:direction': 'backward' });
        });

        it('reverses absolute directions, cardinal compass points', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': 'E' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': 'W' });
        });

        it('reverses absolute directions, intercardinal compass points', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': 'SE' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': 'NW' });
        });

        it('reverses absolute directions, secondary intercardinal compass points', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': 'NNE' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': 'SSW' });
        });

        it('reverses absolute directions, 0 degrees', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': '0' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': '180' });
        });

        it('reverses absolute directions, positive degrees', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': '85.5' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': '265.5' });
        });

        it('reverses absolute directions, positive degrees > 360', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': '385.5' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': '205.5' });
        });

        it('reverses absolute directions, negative degrees', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': '-85.5' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': '94.5' });
        });

        it('preserves non-directional tags', function () {
            var node1 = Rapid.osmNode({ tags: { 'traffic_sign': 'maxspeed' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'traffic_sign': 'maxspeed' });
        });

        it('preserves non-reversible direction tags', function () {
            var node1 = Rapid.osmNode({ tags: { 'direction': 'both' } });
            var graph = Rapid.actionReverse(node1.id)(new Rapid.Graph([node1]));
            expect(graph.entity(node1.id).tags).to.eql({ 'direction': 'both' });
        });
    });

    it('reverses oneway', function () {
        it('preserves oneway tags', function () {
            var way = Rapid.osmWay({tags: {'oneway': 'yes'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'oneway': 'yes'});
        });

        it('reverses oneway tags if reverseOneway: true is provided', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'yes', tags: {oneway: 'yes'}}),
                Rapid.osmWay({id: 'no', tags: {oneway: 'no'}}),
                Rapid.osmWay({id: '1', tags: {oneway: '1'}}),
                Rapid.osmWay({id: '-1', tags: {oneway: '-1'}})
            ]);

            expect(Rapid.actionReverse('yes', {reverseOneway: true})(graph)
                .entity('yes').tags).to.eql({oneway: '-1'}, 'yes');
            expect(Rapid.actionReverse('no', {reverseOneway: true})(graph)
                .entity('no').tags).to.eql({oneway: 'no'}, 'no');
            expect(Rapid.actionReverse('1', {reverseOneway: true})(graph)
                .entity('1').tags).to.eql({oneway: '-1'}, '1');
            expect(Rapid.actionReverse('-1', {reverseOneway: true})(graph)
                .entity('-1').tags).to.eql({oneway: 'yes'}, '-1');
        });

        it('ignores other oneway tags', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'alternating', tags: {oneway: 'alternating'}}),
                Rapid.osmWay({id: 'reversible', tags: {oneway: 'reversible'}}),
                Rapid.osmWay({id: 'dummy', tags: {oneway: 'dummy'}})
            ]);

            expect(Rapid.actionReverse('alternating', {reverseOneway: true})(graph)
                .entity('alternating').tags).to.eql({oneway: 'alternating'}, 'alternating');
            expect(Rapid.actionReverse('reversible', {reverseOneway: true})(graph)
                .entity('reversible').tags).to.eql({oneway: 'reversible'}, 'reversible');
            expect(Rapid.actionReverse('dummy', {reverseOneway: true})(graph)
                .entity('dummy').tags).to.eql({oneway: 'dummy'}, 'dummy');
        });
    });


    it('reverses incline', function () {
        it('transforms incline=up ⟺ incline=down', function () {
            var way = Rapid.osmWay({tags: {'incline': 'up'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'incline': 'down'});

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'incline': 'up'});
        });

        it('negates numeric-valued incline tags', function () {
            var way = Rapid.osmWay({tags: {'incline': '5%'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'incline': '-5%'});

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'incline': '5%'});

            way = Rapid.osmWay({tags: {'incline': '.8°'}});
            graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'incline': '-.8°'});
        });
    });


    it('reverses directional keys on ways', function () {
        it('transforms *:right=* ⟺ *:left=*', function () {
            var way = Rapid.osmWay({tags: {'cycleway:right': 'lane'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'cycleway:left': 'lane'});

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'cycleway:right': 'lane'});
        });

        it('transforms *:right:*=* ⟺ *:left:*=*', function () {
            var way = Rapid.osmWay({tags: {'cycleway:right:surface': 'paved'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'cycleway:left:surface': 'paved'});

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'cycleway:right:surface': 'paved'});
        });

        it('transforms *:forward=* ⟺ *:backward=*', function () {
            var way = Rapid.osmWay({tags: {'maxspeed:forward': '25'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'maxspeed:backward': '25'});

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'maxspeed:forward': '25'});
        });

        it('transforms multiple directional tags', function () {
            var way = Rapid.osmWay({tags: {'maxspeed:forward': '25', 'maxspeed:backward': '30'}});
            var graph = new Rapid.Graph([way]);

            graph = Rapid.actionReverse(way.id)(graph);
            expect(graph.entity(way.id).tags).to.eql({'maxspeed:backward': '25', 'maxspeed:forward': '30'});
        });
    });


    it('reverses directional values on ways', function () {
        it('transforms *=up ⟺ *=down', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'inclineU', tags: {incline: 'up'}}),
                Rapid.osmWay({id: 'directionU', tags: {direction: 'up'}}),
                Rapid.osmWay({id: 'inclineD', tags: {incline: 'down'}}),
                Rapid.osmWay({id: 'directionD', tags: {direction: 'down'}})
            ]);

            expect(Rapid.actionReverse('inclineU')(graph)
                .entity('inclineU').tags).to.eql({incline: 'down'}, 'inclineU');
            expect(Rapid.actionReverse('directionU')(graph)
                .entity('directionU').tags).to.eql({direction: 'down'}, 'directionU');

            expect(Rapid.actionReverse('inclineD')(graph)
                .entity('inclineD').tags).to.eql({incline: 'up'}, 'inclineD');
            expect(Rapid.actionReverse('directionD')(graph)
                .entity('directionD').tags).to.eql({direction: 'up'}, 'directionD');
        });

        it('skips *=up ⟺ *=down for ignored tags', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'name', tags: {name: 'up'}}),
                Rapid.osmWay({id: 'note', tags: {note: 'up'}}),
                Rapid.osmWay({id: 'ref', tags: {ref: 'down'}}),
                Rapid.osmWay({id: 'description', tags: {description: 'down'}})
            ]);

            expect(Rapid.actionReverse('name')(graph)
                .entity('name').tags).to.eql({name: 'up'}, 'name');
            expect(Rapid.actionReverse('note')(graph)
                .entity('note').tags).to.eql({note: 'up'}, 'note');
            expect(Rapid.actionReverse('ref')(graph)
                .entity('ref').tags).to.eql({ref: 'down'}, 'ref');
            expect(Rapid.actionReverse('description')(graph)
                .entity('description').tags).to.eql({description: 'down'}, 'description');
        });

        it('transforms *=forward ⟺ *=backward', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'conveyingF', tags: {conveying: 'forward'}}),
                Rapid.osmWay({id: 'directionF', tags: {direction: 'forward'}}),
                Rapid.osmWay({id: 'priorityF', tags: {priority: 'forward'}}),
                Rapid.osmWay({id: 'trolley_wireF', tags: {trolley_wire: 'forward'}}),
                Rapid.osmWay({id: 'conveyingB', tags: {conveying: 'backward'}}),
                Rapid.osmWay({id: 'directionB', tags: {direction: 'backward'}}),
                Rapid.osmWay({id: 'priorityB', tags: {priority: 'backward'}}),
                Rapid.osmWay({id: 'trolley_wireB', tags: {trolley_wire: 'backward'}})
            ]);

            expect(Rapid.actionReverse('conveyingF')(graph)
                .entity('conveyingF').tags).to.eql({conveying: 'backward'}, 'conveyingF');
            expect(Rapid.actionReverse('directionF')(graph)
                .entity('directionF').tags).to.eql({direction: 'backward'}, 'directionF');
            expect(Rapid.actionReverse('priorityF')(graph)
                .entity('priorityF').tags).to.eql({priority: 'backward'}, 'priorityF');
            expect(Rapid.actionReverse('trolley_wireF')(graph)
                .entity('trolley_wireF').tags).to.eql({trolley_wire: 'backward'}, 'trolley_wireF');

            expect(Rapid.actionReverse('conveyingB')(graph)
                .entity('conveyingB').tags).to.eql({conveying: 'forward'}, 'conveyingB');
            expect(Rapid.actionReverse('directionB')(graph)
                .entity('directionB').tags).to.eql({direction: 'forward'}, 'directionB');
            expect(Rapid.actionReverse('priorityB')(graph)
                .entity('priorityB').tags).to.eql({priority: 'forward'}, 'priorityB');
            expect(Rapid.actionReverse('trolley_wireB')(graph)
                .entity('trolley_wireB').tags).to.eql({trolley_wire: 'forward'}, 'trolley_wireB');
        });

        it('drops "s" from forwards/backwards when reversing', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'conveyingF', tags: {conveying: 'forwards'}}),
                Rapid.osmWay({id: 'conveyingB', tags: {conveying: 'backwards'}})
            ]);

            expect(Rapid.actionReverse('conveyingF')(graph)
                .entity('conveyingF').tags).to.eql({conveying: 'backward'}, 'conveyingF');
            expect(Rapid.actionReverse('conveyingB')(graph)
                .entity('conveyingB').tags).to.eql({conveying: 'forward'}, 'conveyingB');
        });

        it('skips *=forward ⟺ *=backward for ignored tags', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'name', tags: {name: 'forward'}}),
                Rapid.osmWay({id: 'note', tags: {note: 'forwards'}}),
                Rapid.osmWay({id: 'ref', tags: {ref: 'backward'}}),
                Rapid.osmWay({id: 'description', tags: {description: 'backwards'}})
            ]);

            expect(Rapid.actionReverse('name')(graph)
                .entity('name').tags).to.eql({name: 'forward'}, 'name');
            expect(Rapid.actionReverse('note')(graph)
                .entity('note').tags).to.eql({note: 'forwards'}, 'note');
            expect(Rapid.actionReverse('ref')(graph)
                .entity('ref').tags).to.eql({ref: 'backward'}, 'ref');
            expect(Rapid.actionReverse('description')(graph)
                .entity('description').tags).to.eql({description: 'backwards'}, 'description');
        });

        it('transforms *=right ⟺ *=left', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'sidewalkR', tags: {sidewalk: 'right'}}),
                Rapid.osmWay({id: 'sidewalkL', tags: {sidewalk: 'left'}})
            ]);

            expect(Rapid.actionReverse('sidewalkR')(graph)
                .entity('sidewalkR').tags).to.eql({sidewalk: 'left'}, 'sidewalkR');
            expect(Rapid.actionReverse('sidewalkL')(graph)
                .entity('sidewalkL').tags).to.eql({sidewalk: 'right'}, 'sidewalkL');
        });

        it('skips *=right ⟺ *=left for ignored tags', function () {
            var graph = new Rapid.Graph([
                Rapid.osmWay({id: 'name', tags: {name: 'right'}}),
                Rapid.osmWay({id: 'note', tags: {note: 'right'}}),
                Rapid.osmWay({id: 'ref', tags: {ref: 'left'}}),
                Rapid.osmWay({id: 'description', tags: {description: 'left'}})
            ]);

            expect(Rapid.actionReverse('name')(graph)
                .entity('name').tags).to.eql({name: 'right'}, 'name');
            expect(Rapid.actionReverse('note')(graph)
                .entity('note').tags).to.eql({note: 'right'}, 'note');
            expect(Rapid.actionReverse('ref')(graph)
                .entity('ref').tags).to.eql({ref: 'left'}, 'ref');
            expect(Rapid.actionReverse('description')(graph)
                .entity('description').tags).to.eql({description: 'left'}, 'description');
        });
    });


    it('reverses relation roles', function () {
        it('transforms role=forward ⟺ role=backward in member relations', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'n1'}),
                Rapid.osmNode({id: 'n2'}),
                Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2'], tags: {highway: 'residential'}}),
                Rapid.osmRelation({id: 'forward', members: [{type: 'way', id: 'w1', role: 'forward'}]}),
                Rapid.osmRelation({id: 'backward', members: [{type: 'way', id: 'w1', role: 'backward'}]})
            ]);

            expect(Rapid.actionReverse('w1')(graph)
                .entity('forward').members[0].role).to.eql('backward', 'forward');
            expect(Rapid.actionReverse('w1')(graph)
                .entity('backward').members[0].role).to.eql('forward', 'backward');
        });

        it('drops "s" from forwards/backwards when reversing', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'n1'}),
                Rapid.osmNode({id: 'n2'}),
                Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2'], tags: {highway: 'residential'}}),
                Rapid.osmRelation({id: 'forwards', members: [{type: 'way', id: 'w1', role: 'forwards'}]}),
                Rapid.osmRelation({id: 'backwards', members: [{type: 'way', id: 'w1', role: 'backwards'}]})
            ]);

            expect(Rapid.actionReverse('w1')(graph)
                .entity('forwards').members[0].role).to.eql('backward', 'forwards');
            expect(Rapid.actionReverse('w1')(graph)
                .entity('backwards').members[0].role).to.eql('forward', 'backwards');
        });

        it('doesn\'t transform role=north ⟺ role=south in member relations', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'n1'}),
                Rapid.osmNode({id: 'n2'}),
                Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2'], tags: {highway: 'residential'}}),
                Rapid.osmRelation({id: 'north', members: [{type: 'way', id: 'w1', role: 'north'}]}),
                Rapid.osmRelation({id: 'south', members: [{type: 'way', id: 'w1', role: 'south'}]})
            ]);

            expect(Rapid.actionReverse('w1')(graph)
                .entity('north').members[0].role).to.eql('north', 'north');
            expect(Rapid.actionReverse('w1')(graph)
                .entity('south').members[0].role).to.eql('south', 'south');
        });

        it('doesn\'t transform role=east ⟺ role=west in member relations', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'n1'}),
                Rapid.osmNode({id: 'n2'}),
                Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2'], tags: {highway: 'residential'}}),
                Rapid.osmRelation({id: 'east', members: [{type: 'way', id: 'w1', role: 'east'}]}),
                Rapid.osmRelation({id: 'west', members: [{type: 'way', id: 'w1', role: 'west'}]})
            ]);

            expect(Rapid.actionReverse('w1')(graph)
                .entity('east').members[0].role).to.eql('east', 'east');
            expect(Rapid.actionReverse('w1')(graph)
                .entity('west').members[0].role).to.eql('west', 'west');
        });

        it('ignores directionless roles in member relations', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'n1'}),
                Rapid.osmNode({id: 'n2'}),
                Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2'], tags: {highway: 'residential'}}),
                Rapid.osmRelation({id: 'ignore', members: [{type: 'way', id: 'w1', role: 'ignore'}]}),
                Rapid.osmRelation({id: 'empty', members: [{type: 'way', id: 'w1', role: ''}]})
            ]);

            expect(Rapid.actionReverse('w1')(graph)
                .entity('ignore').members[0].role).to.eql('ignore', 'ignore');
            expect(Rapid.actionReverse('w1')(graph)
                .entity('empty').members[0].role).to.eql('', 'empty');
        });
    });


    it('reverses directional values on childnodes', function () {
        // For issue #3076
        it('reverses the direction of a forward facing stop sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'direction': 'forward', 'highway': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags.direction).to.eql('backward');
        });

        it('reverses the direction of a backward facing stop sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'direction': 'backward', 'highway': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags.direction).to.eql('forward');
        });

       it('reverses the direction of a left facing stop sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'direction': 'left', 'highway': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags.direction).to.eql('right');
        });

        it('reverses the direction of a right facing stop sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'direction': 'right', 'highway': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags.direction).to.eql('left');
        });

        it('does not assign a direction to a directionless stop sign on the way during a reverse', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'highway': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags.direction).to.be.undefined;
        });

        it('ignores directions other than forward or backward on attached stop sign during a reverse', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'direction': 'empty', 'highway': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags.direction).to.eql('empty');
        });
    });


    it('reverses directional keys on childnodes', function () {
        it('reverses the direction of a forward facing traffic sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'traffic_sign:forward': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_sign:backward']).to.eql('stop');
        });

        it('reverses the direction of a backward facing stop sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'traffic_sign:backward': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_sign:forward']).to.eql('stop');
        });

        it('reverses the direction of a left facing traffic sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'traffic_sign:left': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_sign:right']).to.eql('stop');
        });

        it('reverses the direction of a right facing stop sign on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: {'traffic_sign:right': 'stop'}});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_sign:left']).to.eql('stop');
        });

        // For issue #4595
        it('reverses the direction of a forward facing traffic_signals on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: { 'traffic_signals:direction': 'forward', 'highway': 'traffic_signals' }});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_signals:direction']).to.eql('backward');
        });

        it('reverses the direction of a backward facing traffic_signals on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: { 'traffic_signals:direction': 'backward', 'highway': 'traffic_signals' }});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_signals:direction']).to.eql('forward');
        });

       it('reverses the direction of a left facing traffic_signals on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: { 'traffic_signals:direction': 'left', 'highway': 'traffic_signals' }});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_signals:direction']).to.eql('right');
        });

        it('reverses the direction of a right facing traffic_signals on the way', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: { 'traffic_signals:direction': 'right', 'highway': 'traffic_signals' }});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_signals:direction']).to.eql('left');
        });

        it('does not assign a direction to a directionless traffic_signals on the way during a reverse', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: { 'highway': 'traffic_signals' }});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_signals:direction']).to.be.undefined;
        });

        it('ignores directions other than forward or backward on attached traffic_signals during a reverse', function () {
            var node1 = Rapid.osmNode();
            var node2 = Rapid.osmNode({tags: { 'traffic_signals:direction': 'empty', 'highway': 'traffic_signals' }});
            var node3 = Rapid.osmNode();
            var way = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]});
            var graph = Rapid.actionReverse(way.id)(new Rapid.Graph([node1, node2, node3, way]));
            var target = graph.entity(node2.id);
            expect(target.tags['traffic_signals:direction']).to.eql('empty');
        });
    });

});
