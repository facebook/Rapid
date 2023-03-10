describe('geo - geometry', function() {

    describe('geoChooseEdge', function() {
        var projection = function (l) { return l; };
        projection.invert = projection;
        projection.project = projection;

        it('returns null for a degenerate way (no nodes)', function() {
            expect(Rapid.geoChooseEdge([], [0, 0], projection)).to.be.null;
        });

        it('returns null for a degenerate way (single node)', function() {
            expect(Rapid.geoChooseEdge([Rapid.osmNode({loc: [0, 0]})], [0, 0], projection)).to.be.null;
        });

        it('calculates the orthogonal projection of a point onto a segment', function() {
            // a --*--- b
            //     |
            //     c
            //
            // * = [2, 0]
            var a = [0, 0];
            var b = [5, 0];
            var c = [2, 1];
            var nodes = [ Rapid.osmNode({loc: a}), Rapid.osmNode({loc: b}) ];
            var choice = Rapid.geoChooseEdge(nodes, c, projection);
            expect(choice.index).to.eql(1);
            expect(choice.distance).to.eql(1);
            expect(choice.loc).to.eql([2, 0]);
        });

        it('returns the starting vertex when the orthogonal projection is < 0', function() {
            var a = [0, 0];
            var b = [5, 0];
            var c = [-3, 4];
            var nodes = [ Rapid.osmNode({loc: a}), Rapid.osmNode({loc: b}) ];
            var choice = Rapid.geoChooseEdge(nodes, c, projection);
            expect(choice.index).to.eql(1);
            expect(choice.distance).to.eql(5);
            expect(choice.loc).to.eql([0, 0]);
        });

        it('returns the ending vertex when the orthogonal projection is > 1', function() {
            var a = [0, 0];
            var b = [5, 0];
            var c = [8, 4];
            var nodes = [ Rapid.osmNode({loc: a}), Rapid.osmNode({loc: b}) ];
            var choice = Rapid.geoChooseEdge(nodes, c, projection);
            expect(choice.index).to.eql(1);
            expect(choice.distance).to.eql(5);
            expect(choice.loc).to.eql([5, 0]);
        });

        it('skips the given nodeID at end of way', function() {
            //
            // a --*-- b
            //     e   |
            //     |   |
            //     d - c
            //
            // * = [2, 0]
            var a = [0, 0];
            var b = [5, 0];
            var c = [5, 5];
            var d = [2, 5];
            var e = [2, 0.1];  // e.g. user is dragging e onto ab
            var nodes = [
                Rapid.osmNode({id: 'a', loc: a}),
                Rapid.osmNode({id: 'b', loc: b}),
                Rapid.osmNode({id: 'c', loc: c}),
                Rapid.osmNode({id: 'd', loc: d}),
                Rapid.osmNode({id: 'e', loc: e})
            ];
            var choice = Rapid.geoChooseEdge(nodes, e, projection, 'e');
            expect(choice.index).to.eql(1);
            expect(choice.distance).to.eql(0.1);
            expect(choice.loc).to.eql([2, 0]);
        });

        it('skips the given nodeID in middle of way', function() {
            //
            // a --*-- b
            //     d   |
            //   /   \ |
            // e       c
            //
            // * = [2, 0]
            var a = [0, 0];
            var b = [5, 0];
            var c = [5, 5];
            var d = [2, 0.1];  // e.g. user is dragging d onto ab
            var e = [0, 5];
            var nodes = [
                Rapid.osmNode({id: 'a', loc: a}),
                Rapid.osmNode({id: 'b', loc: b}),
                Rapid.osmNode({id: 'c', loc: c}),
                Rapid.osmNode({id: 'd', loc: d}),
                Rapid.osmNode({id: 'e', loc: e})
            ];
            var choice = Rapid.geoChooseEdge(nodes, d, projection, 'd');
            expect(choice.index).to.eql(1);
            expect(choice.distance).to.eql(0.1);
            expect(choice.loc).to.eql([2, 0]);
        });

        it('returns null if all nodes are skipped', function() {
            var nodes = [
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [5, 0]}),
            ];
            var choice = Rapid.geoChooseEdge(nodes, [2, 2], projection, 'a');
            expect(choice).to.be.null;
        });
    });

    describe('geoHasLineIntersections', function() {
        it('returns false for a degenerate way (no nodes)', function() {
            expect(Rapid.geoHasLineIntersections([], '')).to.be.false;
        });

        it('returns false if no activeID', function() {
            var a = Rapid.osmNode({id: 'a', loc: [2, 2]});
            var b = Rapid.osmNode({id: 'b', loc: [4, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [4, 4]});
            var d = Rapid.osmNode({id: 'd', loc: [2, 4]});
            var nodes = [a, b, c, d, a];
            expect(Rapid.geoHasLineIntersections(nodes, '')).to.be.false;
        });

        it('returns false if there are no intersections', function() {
            //  e --------- f
            //  |           |
            //  |  a --- b  |
            //  |  |     |  |
            //  |  |     |  |
            //  |  d --- c  |
            //  |           |
            //  h --------- g
            var a = Rapid.osmNode({id: 'a', loc: [2, 2]});
            var b = Rapid.osmNode({id: 'b', loc: [4, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [4, 4]});
            var d = Rapid.osmNode({id: 'd', loc: [2, 4]});
            var e = Rapid.osmNode({id: 'e', loc: [0, 0]});
            var f = Rapid.osmNode({id: 'f', loc: [8, 0]});
            var g = Rapid.osmNode({id: 'g', loc: [8, 8]});
            var h = Rapid.osmNode({id: 'h', loc: [0, 8]});
            var inner = [a, b, c, d, a];
            var outer = [e, f, g, h, e];
            expect(Rapid.geoHasLineIntersections(inner, outer, 'a')).to.be.false;
            expect(Rapid.geoHasLineIntersections(inner, outer, 'b')).to.be.false;
            expect(Rapid.geoHasLineIntersections(inner, outer, 'c')).to.be.false;
            expect(Rapid.geoHasLineIntersections(inner, outer, 'd')).to.be.false;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'e')).to.be.false;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'f')).to.be.false;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'g')).to.be.false;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'h')).to.be.false;
        });

        it('returns true if the activeID is causing intersections', function() {
            //  e --------- f
            //  |           |
            //  |  a --------- b
            //  |  |        |/
            //  |  |       /|
            //  |  d --- c  |
            //  |           |
            //  h --------- g
            var a = Rapid.osmNode({id: 'a', loc: [2, 2]});
            var b = Rapid.osmNode({id: 'b', loc: [10, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [4, 4]});
            var d = Rapid.osmNode({id: 'd', loc: [2, 4]});
            var e = Rapid.osmNode({id: 'e', loc: [0, 0]});
            var f = Rapid.osmNode({id: 'f', loc: [8, 0]});
            var g = Rapid.osmNode({id: 'g', loc: [8, 8]});
            var h = Rapid.osmNode({id: 'h', loc: [0, 8]});
            var inner = [a, b, c, d, a];
            var outer = [e, f, g, h, e];
            expect(Rapid.geoHasLineIntersections(inner, outer, 'a')).to.be.true;
            expect(Rapid.geoHasLineIntersections(inner, outer, 'b')).to.be.true;
            expect(Rapid.geoHasLineIntersections(inner, outer, 'c')).to.be.true;
            expect(Rapid.geoHasLineIntersections(inner, outer, 'd')).to.be.false;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'e')).to.be.false;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'f')).to.be.true;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'g')).to.be.true;
            expect(Rapid.geoHasLineIntersections(outer, inner, 'h')).to.be.false;
        });
    });

    describe('geoHasSelfIntersections', function() {
        it('returns false for a degenerate way (no nodes)', function() {
            expect(Rapid.geoHasSelfIntersections([], '')).to.be.false;
        });

        it('returns false if no activeID', function() {
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 0]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 2]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var nodes = [a, b, c, d, a];
            expect(Rapid.geoHasSelfIntersections(nodes, '')).to.be.false;
        });

        it('returns false if there are no self intersections (closed way)', function() {
            //  a --- b
            //  |     |
            //  |     |
            //  d --- c
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 0]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 2]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var nodes = [a, b, c, d, a];
            expect(Rapid.geoHasSelfIntersections(nodes, 'a')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'b')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'c')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'd')).to.be.false;
        });

        it('returns true if there are self intersections without a junction (closed way)', function() {
            //  a     c
            //  | \ / |
            //  |  /  |
            //  | / \ |
            //  d     b
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var nodes = [a, b, c, d, a];
            expect(Rapid.geoHasSelfIntersections(nodes, 'a')).to.be.true;
            expect(Rapid.geoHasSelfIntersections(nodes, 'b')).to.be.true;
            expect(Rapid.geoHasSelfIntersections(nodes, 'c')).to.be.true;
            expect(Rapid.geoHasSelfIntersections(nodes, 'd')).to.be.true;
        });

        it('returns false if there are self intersections with a junction (closed way)', function() {
            //  a     c
            //  | \ / |
            //  |  x  |
            //  | / \ |
            //  d     b
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var x = Rapid.osmNode({id: 'x', loc: [1, 1]});
            var nodes = [a, x, b, c, x, d, a];
            expect(Rapid.geoHasSelfIntersections(nodes, 'a')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'b')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'c')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'd')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'x')).to.be.false;
        });

        it('returns false if there are no self intersections (open way)', function() {
            //  a --- b
            //        |
            //        |
            //  d --- c
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 0]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 2]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var nodes = [a, b, c, d];
            expect(Rapid.geoHasSelfIntersections(nodes, 'a')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'b')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'c')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'd')).to.be.false;
        });

        it('returns true if there are self intersections without a junction (open way)', function() {
            //  a     c
            //    \ / |
            //     /  |
            //    / \ |
            //  d     b
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var nodes = [a, b, c, d];
            expect(Rapid.geoHasSelfIntersections(nodes, 'a')).to.be.true;
            expect(Rapid.geoHasSelfIntersections(nodes, 'b')).to.be.true;
            expect(Rapid.geoHasSelfIntersections(nodes, 'c')).to.be.true;
            expect(Rapid.geoHasSelfIntersections(nodes, 'd')).to.be.true;
        });

        it('returns false if there are self intersections with a junction (open way)', function() {
            //  a     c
            //    \ / |
            //     x  |
            //    / \ |
            //  d     b
            var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            var b = Rapid.osmNode({id: 'b', loc: [2, 2]});
            var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
            var d = Rapid.osmNode({id: 'd', loc: [0, 2]});
            var x = Rapid.osmNode({id: 'x', loc: [1, 1]});
            var nodes = [a, x, b, c, x, d];
            expect(Rapid.geoHasSelfIntersections(nodes, 'a')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'b')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'c')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'd')).to.be.false;
            expect(Rapid.geoHasSelfIntersections(nodes, 'x')).to.be.false;
        });
    });
});
