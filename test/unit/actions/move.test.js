import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionMove', () => {

    // This was moved to operationMove.  We should test operations and move this test there.
    // it('#disabled', function() {
    //     it('returns falsy by default', function() {
    //         const node  = Rapid.osmNode({loc: [0, 0]}),
    //             action = Rapid.actionMove([node.id], [0, 0], viewport),
    //             graph = new Rapid.Graph([node]);
    //         expect(action.disabled(graph)).not.to.be.ok;
    //     });
    //     it('returns \'incomplete_relation\' for an incomplete relation', function() {
    //         const relation = Rapid.osmRelation({members: [{id: 1}]}),
    //             action = Rapid.actionMove([relation.id], [0, 0], viewport),
    //             graph = new Rapid.Graph([relation]);
    //         expect(action.disabled(graph)).to.equal('incomplete_relation');
    //     });
    //     it('returns falsy for a complete relation', function() {
    //         const node  = Rapid.osmNode({loc: [0, 0]}),
    //             relation = Rapid.osmRelation({members: [{id: node.id}]}),
    //             action = Rapid.actionMove([relation.id], [0, 0], viewport),
    //             graph = new Rapid.Graph([node, relation]);
    //         expect(action.disabled(graph)).not.to.be.ok;
    //     });
    // });

    const viewport = new Rapid.sdk.Viewport({ k: 250 / Math.PI });

    it('moves all nodes in a way by the given amount', () => {
        const node1  = Rapid.osmNode({loc: [0, 0]}),
            node2  = Rapid.osmNode({loc: [5, 10]}),
            way    = Rapid.osmWay({nodes: [node1.id, node2.id]}),
            delta  = [2, 3],
            graph  = Rapid.actionMove([way.id], delta, viewport)(new Rapid.Graph([node1, node2, way])),
            loc1   = graph.entity(node1.id).loc,
            loc2   = graph.entity(node2.id).loc;
        assert(loc1[0].toFixed(3) === (1.440).toFixed(3));
        assert(loc1[1].toFixed(3) === (-2.159).toFixed(3));
        assert(loc2[0].toFixed(3) === (6.440).toFixed(3));
        assert(loc2[1].toFixed(3) === (7.866).toFixed(3));
    });


    it('moves repeated nodes only once', () => {
        const node   = Rapid.osmNode({loc: [0, 0]}),
            way    = Rapid.osmWay({nodes: [node.id, node.id]}),
            delta  = [2, 3],
            graph  = Rapid.actionMove([way.id], delta, viewport)(new Rapid.Graph([node, way])),
            loc    = graph.entity(node.id).loc;
        assert(loc[0].toFixed(3) === (1.440).toFixed(3));
        assert(loc[1].toFixed(3) === (-2.159).toFixed(3));
    });


    it('moves multiple ways', () => {
        const node   = Rapid.osmNode({loc: [0, 0]}),
            way1   = Rapid.osmWay({nodes: [node.id]}),
            way2   = Rapid.osmWay({nodes: [node.id]}),
            delta  = [2, 3],
            graph  = Rapid.actionMove([way1.id, way2.id], delta, viewport)(new Rapid.Graph([node, way1, way2])),
            loc    = graph.entity(node.id).loc;
        assert(loc[0].toFixed(3) === (1.440).toFixed(3));
        assert(loc[1].toFixed(3) === (-2.159).toFixed(3));
    });


    it('moves leaf nodes of a relation', () => {
        const node     = Rapid.osmNode({loc: [0, 0]}),
            way      = Rapid.osmWay({nodes: [node.id]}),
            relation = Rapid.osmRelation({members: [{id: way.id}]}),
            delta    = [2, 3],
            graph    = Rapid.actionMove([relation.id], delta, viewport)(new Rapid.Graph([node, way, relation])),
            loc      = graph.entity(node.id).loc;
        assert(loc[0].toFixed(3) === (1.440).toFixed(3));
        assert(loc[1].toFixed(3) === (-2.159).toFixed(3));
    });
});
