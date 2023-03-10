describe('operationExtract', function () {
    var graph;

    // Set up the fake context
    var fakeMap = {};
    fakeMap.extent = function() { return new sdk.Extent([-180, -90], [180, 90]); };

    var fakeContext = {};
    fakeContext.graph = function() { return graph; };
    fakeContext.entity = function(id) { return graph.entity(id); };
    fakeContext.hasEntity = function(id) { return graph.hasEntity(id); };
    fakeContext.hasHiddenConnections = function() { return false; };
    fakeContext.inIntro = function() { return false; };
    fakeContext.keyBinding = function() { return false; };
    fakeContext.map = function() { return fakeMap; };

    var fakeTags = { 'name': 'fake' };

    // Set up graph
    var createFakeNode = function (id, hasTags) {
        return hasTags
            ? { id: id, type: 'node', loc: [0, 0], tags: fakeTags }
            : { id: id, type: 'node', loc: [0, 0] };
    };

    describe('available', function () {
        beforeEach(function () {
            // a - node with tags & parent way
            // b - node with tags & 2 parent ways
            // c - node with no tags, parent way
            // d - node with no tags, 2 parent ways
            // e - node with tags, no parent way
            // f - node with no tags, no parent way
            graph = new Rapid.Graph([
                Rapid.osmNode(createFakeNode('a', true)),
                Rapid.osmNode(createFakeNode('b', true)),
                Rapid.osmNode(createFakeNode('c', false)),
                Rapid.osmNode(createFakeNode('d', false)),
                Rapid.osmNode(createFakeNode('e', true)),
                Rapid.osmNode(createFakeNode('f', false)),
                Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c', 'd'] }),
                Rapid.osmWay({ id: 'y', nodes: ['b', 'd'] })
            ]);
        });

        it('is not available for no selected ids', function () {
            var result = Rapid.operationExtract(fakeContext, []).available();
            expect(result).to.be.not.ok;
        });

        it('is not available for unknown selected id', function () {
            var result = Rapid.operationExtract(fakeContext, ['z']).available();
            expect(result).to.be.not.ok;
        });

        it('is not available for selected way', function () {
            var result = Rapid.operationExtract(fakeContext, ['x']).available();
            expect(result).to.be.not.ok;
        });

        it('is not available for selected node with tags, no parent way', function () {
            var result = Rapid.operationExtract(fakeContext, ['e']).available();
            expect(result).to.be.not.ok;
        });

        it('is not available for selected node with no tags, no parent way', function () {
            var result = Rapid.operationExtract(fakeContext, ['f']).available();
            expect(result).to.be.not.ok;
        });

        it('is not available for selected node with no tags, parent way', function () {
            var result = Rapid.operationExtract(fakeContext, ['c']).available();
            expect(result).to.be.not.ok;
        });

        it('is not available for selected node with no tags, two parent ways', function () {
            var result = Rapid.operationExtract(fakeContext, ['d']).available();
            expect(result).to.be.not.ok;
        });

        it('is available for selected node with tags, parent way', function () {
            var result = Rapid.operationExtract(fakeContext, ['a']).available();
            expect(result).to.be.ok;
        });

        it('is available for selected node with tags, two parent ways', function () {
            var result = Rapid.operationExtract(fakeContext, ['b']).available();
            expect(result).to.be.ok;
        });

        it('is available for two selected nodes with tags and parent ways', function () {
            var result = Rapid.operationExtract(fakeContext, ['a', 'b']).available();
            expect(result).to.be.ok;
        });
    });


    describe('disabled', function () {
        it('returns enabled for non-related node', function () {
            graph = new Rapid.Graph([
                Rapid.osmNode(createFakeNode('a', false)),
                Rapid.osmNode(createFakeNode('b', true)),
                Rapid.osmNode(createFakeNode('c', false)),
                Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c'] })
            ]);
            var result = Rapid.operationExtract(fakeContext, ['b']).disabled();
            expect(result).to.be.not.ok;
        });

        it('returns enabled for non-restriction related node', function () {
            graph = new Rapid.Graph([
                Rapid.osmNode(createFakeNode('a', false)),
                Rapid.osmNode(createFakeNode('b', true)),
                Rapid.osmNode(createFakeNode('c', false)),
                Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c'] }),
                Rapid.osmRelation({ id: 'r', members: [{ id: 'b', role: 'label' }] })
            ]);
            var result = Rapid.operationExtract(fakeContext, ['b']).disabled();
            expect(result).to.be.not.ok;
        });

        it('returns enabled for via node in restriction', function () {
            // https://wiki.openstreetmap.org/wiki/Relation:restriction indicates that
            // from & to roles are only appropriate for Ways
            graph = new Rapid.Graph([
                Rapid.osmNode(createFakeNode('a', false)),
                Rapid.osmNode(createFakeNode('b', false)),
                Rapid.osmNode(createFakeNode('c', false)),
                Rapid.osmNode(createFakeNode('d', true)),
                Rapid.osmNode(createFakeNode('e', false)),
                Rapid.osmNode(createFakeNode('f', false)),
                Rapid.osmNode(createFakeNode('g', false)),
                Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c'] }),
                Rapid.osmWay({ id: 'y', nodes: ['e', 'f', 'g'] }),
                Rapid.osmRelation({id: 'r', tags: {type: 'restriction', restriction: 'no_right_turn'},
                    members: [
                        { id: 'x', type: 'way', role: 'from' },
                        { id: 'd', type: 'node', role: 'via' },
                        { id: 'z', type: 'way', role: 'to' }
                    ]
                })
            ]);
            var result = Rapid.operationExtract(fakeContext, ['d']).disabled();
            expect(result).to.be.not.ok;
        });

        it('returns enabled for location_hint node in restriction', function () {
            // https://wiki.openstreetmap.org/wiki/Relation:restriction indicates that
            // from & to roles are only appropriate for Ways
            graph = new Rapid.Graph([
                Rapid.osmNode(createFakeNode('a', false)),
                Rapid.osmNode(createFakeNode('b', false)),
                Rapid.osmNode(createFakeNode('c', false)),
                Rapid.osmNode(createFakeNode('d', true)),
                Rapid.osmNode(createFakeNode('e', false)),
                Rapid.osmNode(createFakeNode('f', false)),
                Rapid.osmNode(createFakeNode('g', false)),
                Rapid.osmWay({ id: 'x', nodes: ['a', 'b'] }),
                Rapid.osmWay({ id: 'y', nodes: ['e', 'f', 'g'] }),
                Rapid.osmRelation({id: 'r', tags: {type: 'restriction', restriction: 'no_right_turn'},
                    members: [
                        { id: 'x', type: 'way', role: 'from' },
                        { id: 'c', type: 'node', role: 'via' },
                        { id: 'd', type: 'node', role: 'location_hint' },
                        { id: 'z', type: 'way', role: 'to' }
                    ]
                })
            ]);
            var result = Rapid.operationExtract(fakeContext, ['d']).disabled();
            expect(result).to.be.not.ok;
        });
    });
});
