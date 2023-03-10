describe('actionMergeNodes', function () {

    describe('#disabled', function () {
        it('enabled for both internal and endpoint nodes', function() {
            //
            // a --- b --- c
            //
            //       d
            //       |
            //       e
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [-2,  2] }),
                Rapid.osmNode({ id: 'b', loc: [ 0,  2] }),
                Rapid.osmNode({ id: 'c', loc: [ 2,  2] }),
                Rapid.osmNode({ id: 'd', loc: [ 0,  0] }),
                Rapid.osmNode({ id: 'e', loc: [ 0, -2] }),
                Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
                Rapid.osmWay({ id: '|', nodes: ['d', 'e'] })
            ]);

            expect(Rapid.actionMergeNodes(['b', 'e']).disabled(graph)).to.be.not.ok;
        });
    });


    it('merges two isolated nodes, averaging loc', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [4, 4] })
        ]);

        graph = Rapid.actionMergeNodes(['a', 'b'])(graph);

        expect(graph.hasEntity('a')).to.be.undefined;

        var survivor = graph.hasEntity('b');
        expect(survivor).to.be.an.instanceof(Rapid.osmNode);
        expect(survivor.loc).to.eql([2, 2], 'average loc');
    });


    it('merges two isolated nodes, merging tags, and keeping loc of the interesting node', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0], tags: { highway: 'traffic_signals' }}),
            Rapid.osmNode({ id: 'b', loc: [4, 4] })
        ]);

        graph = Rapid.actionMergeNodes(['a', 'b'])(graph);

        expect(graph.hasEntity('a')).to.be.undefined;

        var survivor = graph.hasEntity('b');
        expect(survivor).to.be.an.instanceof(Rapid.osmNode);
        expect(survivor.tags).to.eql({ highway: 'traffic_signals' }, 'merge all tags');
        expect(survivor.loc).to.eql([0, 0], 'use loc of interesting node');
    });


    it('merges two isolated nodes, merging tags, and averaging loc of both interesting nodes', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, -2], tags: { highway: 'traffic_signals' } }),
            Rapid.osmNode({ id: 'b', loc: [0,  2], tags: { crossing: 'marked' } })
        ]);
        graph = Rapid.actionMergeNodes(['a', 'b'])(graph);

        expect(graph.hasEntity('a')).to.be.undefined;

        var survivor = graph.hasEntity('b');
        expect(survivor.tags).to.eql({ highway: 'traffic_signals', crossing: 'marked' }, 'merge all tags');
        expect(survivor.loc).to.eql([0, 0], 'average loc of both interesting nodes');
    });


    it('merges two nodes along a single way', function() {
        //
        //  scenerio:         merge b,c:
        //
        //  a -- b -- c       a ---- c
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [-2,  2] }),
            Rapid.osmNode({ id: 'b', loc: [ 0,  2] }),
            Rapid.osmNode({ id: 'c', loc: [ 2,  2] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] })
        ]);

        graph = Rapid.actionMergeNodes(['b', 'c'])(graph);

        expect(graph.hasEntity('b')).to.be.undefined;

        var survivor = graph.hasEntity('c');
        expect(survivor).to.be.an.instanceof(Rapid.osmNode);
        expect(survivor.loc).to.eql([1, 2]);
        expect(graph.parentWays(survivor).length).to.equal(1);
    });


    it('merges two nodes from two ways', function() {
        //
        //  scenerio:        merge b,d:
        //
        //  a -- b -- c      a -_   _- c
        //                        d
        //       d                |
        //       |                |
        //       e                e
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [-2,  2] }),
            Rapid.osmNode({ id: 'b', loc: [ 0,  2] }),
            Rapid.osmNode({ id: 'c', loc: [ 2,  2] }),
            Rapid.osmNode({ id: 'd', loc: [ 0,  0] }),
            Rapid.osmNode({ id: 'e', loc: [ 0, -2] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmWay({ id: '|', nodes: ['d', 'e'] })
        ]);

        graph = Rapid.actionMergeNodes(['b', 'd'])(graph);

        expect(graph.hasEntity('b')).to.be.undefined;

        var survivor = graph.hasEntity('d');
        expect(survivor).to.be.an.instanceof(Rapid.osmNode);
        expect(survivor.loc).to.eql([0, 1]);
        expect(graph.parentWays(survivor).length).to.equal(2);
    });


    it('merges three nodes from three ways', function () {
        //
        //  scenerio:        merge b,d:
        //
        //        c                c
        //        |                |
        //        d                |
        //                         |
        //  a --- b          a --- e
        //                         ‖
        //        e                ‖
        //        ‖                ‖
        //        f                f
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [-2,  0] }),
            Rapid.osmNode({ id: 'b', loc: [ 0,  0] }),
            Rapid.osmNode({ id: 'c', loc: [ 0,  4] }),
            Rapid.osmNode({ id: 'd', loc: [ 0,  2] }),
            Rapid.osmNode({ id: 'e', loc: [ 0, -2] }),
            Rapid.osmNode({ id: 'f', loc: [ 0, -4] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b'] }),
            Rapid.osmWay({ id: '|', nodes: ['c', 'd'] }),
            Rapid.osmWay({ id: '‖', nodes: ['e', 'f'] })
        ]);

        graph = Rapid.actionMergeNodes(['b', 'd', 'e'])(graph);

        expect(graph.hasEntity('b')).to.be.undefined;
        expect(graph.hasEntity('d')).to.be.undefined;

        var survivor = graph.hasEntity('e');
        expect(survivor).to.be.an.instanceof(Rapid.osmNode);
        expect(survivor.loc).to.eql([0, 0]);
        expect(graph.parentWays(survivor).length).to.equal(3);
    });

});
