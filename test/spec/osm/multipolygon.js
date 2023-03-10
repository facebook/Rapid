describe('osmIsOldMultipolygonOuterMember', function() {
    it('returns the parent relation of a simple multipolygon outer', function() {
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: outer.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.equal(relation);
    });

    it('returns the parent relation of a simple multipolygon outer, assuming role outer if unspecified', function() {
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: outer.id}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.equal(relation);
    });

    it('returns false if entity is not a way', function() {
        var outer = Rapid.osmNode({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: outer.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.be.false;
    });

    it('returns false if entity does not have interesting tags', function() {
        var outer = Rapid.osmWay({tags: {'tiger:reviewed':'no'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: outer.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.be.false;
    });

    it('returns false if entity does not have a parent relation', function() {
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var graph = new Rapid.Graph([outer]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.be.false;
    });

    it('returns false if the parent is not a multipolygon', function() {
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'route'}, members: [{id: outer.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.be.false;
    });

    it('returns false if the parent has interesting tags', function() {
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {natural: 'wood', type: 'multipolygon'}, members: [{id: outer.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.be.false;
    });

    it('returns the parent relation of a simple multipolygon outer, ignoring uninteresting parent tags', function() {
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {'tiger:reviewed':'no', type: 'multipolygon'}, members: [{id: outer.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer, graph)).to.equal(relation);
    });

    it('returns false if the parent has multiple outer ways', function() {
        var outer1 = Rapid.osmWay({tags: {'natural':'wood'}});
        var outer2 = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: outer1.id, role: 'outer'}, {id: outer2.id, role: 'outer'}]}
        );
        var graph = new Rapid.Graph([outer1, outer2, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer1, graph)).to.be.false;
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer2, graph)).to.be.false;
    });

    it('returns false if the parent has multiple outer ways, assuming role outer if unspecified', function() {
        var outer1 = Rapid.osmWay({tags: {'natural':'wood'}});
        var outer2 = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: outer1.id}, {id: outer2.id}]}
        );
        var graph = new Rapid.Graph([outer1, outer2, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer1, graph)).to.be.false;
        expect(Rapid.osmIsOldMultipolygonOuterMember(outer2, graph)).to.be.false;
    });

    it('returns false if the entity is not an outer', function() {
        var inner = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation(
            {tags: {type: 'multipolygon'}, members: [{id: inner.id, role: 'inner'}]}
        );
        var graph = new Rapid.Graph([inner, relation]);
        expect(Rapid.osmIsOldMultipolygonOuterMember(inner, graph)).to.be.false;
    });
});


describe('osmOldMultipolygonOuterMember', function() {
    it('returns the outer member of a simple multipolygon', function() {
        var inner = Rapid.osmWay();
        var outer = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation({tags: {type: 'multipolygon'}, members: [
            {id: outer.id, role: 'outer'},
            {id: inner.id, role: 'inner'}]
        });
        var graph = new Rapid.Graph([inner, outer, relation]);

        expect(Rapid.osmOldMultipolygonOuterMember(inner, graph)).to.equal(outer);
        expect(Rapid.osmOldMultipolygonOuterMember(outer, graph)).to.equal(outer);
    });

    it('returns falsy for a complex multipolygon', function() {
        var inner = Rapid.osmWay();
        var outer1 = Rapid.osmWay({tags: {'natural':'wood'}});
        var outer2 = Rapid.osmWay({tags: {'natural':'wood'}});
        var relation = Rapid.osmRelation({tags: {type: 'multipolygon'}, members: [
            {id: outer1.id, role: 'outer'},
            {id: outer2.id, role: 'outer'},
            {id: inner.id, role: 'inner'}]
        });
        var graph = new Rapid.Graph([inner, outer1, outer2, relation]);

        expect(Rapid.osmOldMultipolygonOuterMember(inner, graph)).not.to.be.ok;
        expect(Rapid.osmOldMultipolygonOuterMember(outer1, graph)).not.to.be.ok;
        expect(Rapid.osmOldMultipolygonOuterMember(outer2, graph)).not.to.be.ok;
    });

    it('handles incomplete relations', function() {
        var way = Rapid.osmWay({id: 'w'});
        var relation = Rapid.osmRelation({id: 'r', tags: {type: 'multipolygon'}, members: [
            {id: 'o', role: 'outer'},
            {id: 'w', role: 'inner'}]
        });
        var graph = new Rapid.Graph([way, relation]);

        expect(Rapid.osmOldMultipolygonOuterMember(way, graph)).not.to.be.ok;
    });
});


describe('osmJoinWays', function() {
    function getIDs(objects) {
        return objects.map(function(node) { return node.id; });
    }

    it('returns an array of members with nodes properties', function() {
        var node = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var way  = Rapid.osmWay({id: '-', nodes: ['a']});
        var member = {id: '-', type: 'way'};
        var graph = new Rapid.Graph([node, way]);

        var result = Rapid.osmJoinWays([member], graph);

        expect(result.length).to.equal(1);
        expect(result.actions).to.eql([]);
        expect(getIDs(result[0].nodes)).to.eql(['a']);
        expect(result[0].length).to.equal(1);
        expect(result[0][0]).to.eql(member);
    });

    it('joins ways (ordered - w1, w2)', function() {
        //
        //  a ---> b ===> c
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '=', nodes: ['b', 'c']});
        var graph = new Rapid.Graph([a, b, c, w1, w2]);

        var result = Rapid.osmJoinWays([w1, w2], graph);
        expect(result.length).to.equal(1);
        expect(result.actions).to.eql([]);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0].length).to.equal(2);
        expect(result[0][0]).to.eql(w1);
        expect(result[0][1]).to.eql(w2);
    });

    it('joins ways (unordered - w2, w1)', function() {
        //
        //  a ---> b ===> c
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '=', nodes: ['b', 'c']});
        var graph = new Rapid.Graph([a, b, c, w1, w2]);

        var result = Rapid.osmJoinWays([w2, w1], graph);
        expect(result.length).to.equal(1);
        expect(result.actions).to.eql([]);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0].length).to.equal(2);
        expect(result[0][0]).to.eql(w1);
        expect(result[0][1]).to.eql(w2);
    });

    it('joins relation members (ordered -, =)', function() {
        //
        //  a ---> b ===> c
        //  r: ['-', '=']
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '=', nodes: ['b', 'c']});
        var r = Rapid.osmRelation({id: 'r', members: [
            {id: '-', type: 'way'},
            {id: '=', type: 'way'}
        ]});
        var graph = new Rapid.Graph([a, b, c, w1, w2, r]);

        var result = Rapid.osmJoinWays(r.members, graph);
        expect(result.length).to.equal(1);
        expect(result.actions).to.eql([]);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0].length).to.equal(2);
        expect(result[0][0]).to.eql({id: '-', type: 'way'});
        expect(result[0][1]).to.eql({id: '=', type: 'way'});
    });

    it('joins relation members (ordered =, -)', function() {
        //
        //  a ---> b ===> c
        //  r: ['=', '-']
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '=', nodes: ['b', 'c']});
        var r = Rapid.osmRelation({id: 'r', members: [
            {id: '=', type: 'way'},
            {id: '-', type: 'way'}
        ]});
        var graph = new Rapid.Graph([a, b, c, w1, w2, r]);

        var result = Rapid.osmJoinWays(r.members, graph);
        expect(result.length).to.equal(1);
        expect(result.actions.length).to.equal(2);
        expect(getIDs(result[0].nodes)).to.eql(['c', 'b', 'a']);
        expect(result[0].length).to.equal(2);
        expect(result[0][0]).to.eql({id: '=', type: 'way'});
        expect(result[0][1]).to.eql({id: '-', type: 'way'});
    });

    it('returns joined members in the correct order', function() {
        //
        //  a <=== b ---> c ~~~> d
        //  r: ['-', '~', '=']
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var d = Rapid.osmNode({id: 'd', loc: [3, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['b', 'c']});
        var w2 = Rapid.osmWay({id: '=', nodes: ['b', 'a']});
        var w3 = Rapid.osmWay({id: '~', nodes: ['c', 'd']});
        var r = Rapid.osmRelation({id: 'r', members: [
            {id: '-', type: 'way'},
            {id: '~', type: 'way'},
            {id: '=', type: 'way'}
        ]});
        var graph = new Rapid.Graph([a, b, c, d, w1, w2, w3, r]);

        var result = Rapid.osmJoinWays(r.members, graph);
        expect(result.length).to.equal(1);
        expect(result.actions.length).to.equal(1);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c', 'd']);
        expect(result[0].length).to.equal(3);
        expect(result[0][0]).to.eql({id: '=', type: 'way'});
        expect(result[0][1]).to.eql({id: '-', type: 'way'});
        expect(result[0][2]).to.eql({id: '~', type: 'way'});
    });

    it('reverses member tags of reversed segements', function() {
        //
        // Source:
        //   a ---> b <=== c
        // Result:
        //   a ---> b ===> c    (and tags on === reversed)
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'oneway': 'yes', 'lanes:forward': 2}});
        var graph = new Rapid.Graph([a, b, c, w1, w2]);

        var result = Rapid.osmJoinWays([w1, w2], graph);
        expect(result.length).to.equal(1);
        expect(result.actions.length).to.equal(1);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0].length).to.equal(2);
        expect(result[0][0]).to.be.an.instanceof(Rapid.osmWay);
        expect(result[0][0].nodes).to.eql(['a', 'b']);
        expect(result[0][1]).to.be.an.instanceof(Rapid.osmWay);
        expect(result[0][1].nodes).to.eql(['b', 'c']);
        expect(result[0][1].tags).to.eql({'oneway': '-1', 'lanes:backward': 2});
    });

    it('reverses the initial segment to preserve member order when joining relation members', function() {
        //
        // Source:
        //   a <--- b ===> c
        // Result:
        //   a ---> b ===> c   (and --- reversed)
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var w1 = Rapid.osmWay({id: '-', nodes: ['b', 'a'], tags: {'oneway': 'yes', 'lanes:forward': 2}});
        var w2 = Rapid.osmWay({id: '=', nodes: ['b', 'c']});
        var r = Rapid.osmRelation({id: 'r', members: [
            {id: '-', type: 'way'},
            {id: '=', type: 'way'}
        ]});
        var graph = new Rapid.Graph([a, b, c, w1, w2, r]);

        var result = Rapid.osmJoinWays(r.members, graph);
        expect(result.length).to.equal(1);
        expect(result.actions.length).to.equal(1);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0].length).to.equal(2);
        expect(result[0][0]).to.eql({id: '-', type: 'way'});
        expect(result[0][1]).to.eql({id: '=', type: 'way'});
    });

    it('ignores non-way members', function() {
        var node = Rapid.osmNode({loc: [0, 0]});
        var member = {id: 'n', type: 'node'};
        var graph = new Rapid.Graph([node]);
        expect(Rapid.osmJoinWays([member], graph)).to.eql([]);
    });

    it('ignores incomplete members', function() {
        var member = {id: 'w', type: 'way'};
        var graph = new Rapid.Graph();
        expect(Rapid.osmJoinWays([member], graph)).to.eql([]);
    });

    it('returns multiple arrays for disjoint ways', function() {
        //
        //     b
        //    / \
        //   a   c     d ---> e ===> f
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 1]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var d = Rapid.osmNode({id: 'd', loc: [5, 0]});
        var e = Rapid.osmNode({id: 'e', loc: [6, 0]});
        var f = Rapid.osmNode({id: 'f', loc: [7, 0]});
        var w1 = Rapid.osmWay({id: '/', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '\\', nodes: ['b', 'c']});
        var w3 = Rapid.osmWay({id: '-', nodes: ['d', 'e']});
        var w4 = Rapid.osmWay({id: '=', nodes: ['e', 'f']});
        var graph = new Rapid.Graph([a, b, c, d, e, f, w1, w2, w3, w4]);

        var result = Rapid.osmJoinWays([w1, w2, w3, w4], graph);

        expect(result.length).to.equal(2);
        expect(result.actions).to.eql([]);

        expect(result[0].length).to.equal(2);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0][0]).to.eql(w1);
        expect(result[0][1]).to.eql(w2);

        expect(result[1].length).to.equal(2);
        expect(getIDs(result[1].nodes)).to.eql(['d', 'e', 'f']);
        expect(result[1][0]).to.eql(w3);
        expect(result[1][1]).to.eql(w4);
    });

    it('returns multiple arrays for disjoint relations', function() {
        //
        //     b
        //    / \
        //   a   c     d ---> e ===> f
        //
        //   r: ['/', '\', '-', '=']
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 1]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var d = Rapid.osmNode({id: 'd', loc: [5, 0]});
        var e = Rapid.osmNode({id: 'e', loc: [6, 0]});
        var f = Rapid.osmNode({id: 'f', loc: [7, 0]});
        var w1 = Rapid.osmWay({id: '/', nodes: ['a', 'b']});
        var w2 = Rapid.osmWay({id: '\\', nodes: ['b', 'c']});
        var w3 = Rapid.osmWay({id: '-', nodes: ['d', 'e']});
        var w4 = Rapid.osmWay({id: '=', nodes: ['e', 'f']});
        var r = Rapid.osmRelation({id: 'r', members: [
            {id: '/', type: 'way'},
            {id: '\\', type: 'way'},
            {id: '-', type: 'way'},
            {id: '=', type: 'way'}
        ]});
        var graph = new Rapid.Graph([a, b, c, d, e, f, w1, w2, w3, w4, r]);
        var result = Rapid.osmJoinWays(r.members, graph);

        expect(result.length).to.equal(2);
        expect(result.actions).to.eql([]);

        expect(result[0].length).to.equal(2);
        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c']);
        expect(result[0][0]).to.eql({id: '/', type: 'way'});
        expect(result[0][1]).to.eql({id: '\\', type: 'way'});

        expect(result[1].length).to.equal(2);
        expect(getIDs(result[1].nodes)).to.eql(['d', 'e', 'f']);
        expect(result[1][0]).to.eql({id: '-', type: 'way'});
        expect(result[1][1]).to.eql({id: '=', type: 'way'});
    });

    it('understands doubled-back relation members', function() {
        //
        //                    e
        //                  /   \
        //   a <=== b ---> c ~~~> d
        //
        //   r: ['=', '-', '~', '\', '/', '-', '=']
        //
        var a = Rapid.osmNode({id: 'a', loc: [0, 0]});
        var b = Rapid.osmNode({id: 'b', loc: [1, 0]});
        var c = Rapid.osmNode({id: 'c', loc: [2, 0]});
        var d = Rapid.osmNode({id: 'd', loc: [4, 0]});
        var e = Rapid.osmNode({id: 'e', loc: [3, 1]});
        var w1 = Rapid.osmWay({id: '=', nodes: ['b', 'a']});
        var w2 = Rapid.osmWay({id: '-', nodes: ['b', 'c']});
        var w3 = Rapid.osmWay({id: '~', nodes: ['c', 'd']});
        var w4 = Rapid.osmWay({id: '\\', nodes: ['d', 'e']});
        var w5 = Rapid.osmWay({id: '/', nodes: ['c', 'e']});
        var r = Rapid.osmRelation({id: 'r', members: [
            {id: '=', type: 'way'},
            {id: '-', type: 'way'},
            {id: '~', type: 'way'},
            {id: '\\', type: 'way'},
            {id: '/', type: 'way'},
            {id: '-', type: 'way'},
            {id: '=', type: 'way'}
        ]});
        var graph = new Rapid.Graph([a, b, c, d, e, w1, w2, w3, w4, w5, r]);

        var result = Rapid.osmJoinWays(r.members, graph);
        expect(result.length).to.equal(1);
        expect(result.actions.length).to.equal(3);

        expect(getIDs(result[0].nodes)).to.eql(['a', 'b', 'c', 'd', 'e', 'c', 'b', 'a']);
        expect(result[0].length).to.equal(7);
        expect(result[0][0]).to.eql({id: '=', type: 'way'});
        expect(result[0][1]).to.eql({id: '-', type: 'way'});
        expect(result[0][2]).to.eql({id: '~', type: 'way'});
        expect(result[0][3]).to.eql({id: '\\', type: 'way'});
        expect(result[0][4]).to.eql({id: '/', type: 'way'});
        expect(result[0][5]).to.eql({id: '-', type: 'way'});
        expect(result[0][6]).to.eql({id: '=', type: 'way'});
    });

});
