
describe('osmEntity', function () {
    it('returns a subclass of the appropriate type', function () {
        expect(Rapid.osmEntity({type: 'node'})).be.an.instanceOf(Rapid.osmNode);
        expect(Rapid.osmEntity({type: 'way'})).be.an.instanceOf(Rapid.osmWay);
        expect(Rapid.osmEntity({type: 'relation'})).be.an.instanceOf(Rapid.osmRelation);
        expect(Rapid.osmEntity({id: 'n1'})).be.an.instanceOf(Rapid.osmNode);
        expect(Rapid.osmEntity({id: 'w1'})).be.an.instanceOf(Rapid.osmWay);
        expect(Rapid.osmEntity({id: 'r1'})).be.an.instanceOf(Rapid.osmRelation);
    });

    describe('.id', function () {
        it('generates unique IDs', function () {
            expect(Rapid.osmEntity.id('node')).not.to.equal(Rapid.osmEntity.id('node'));
        });

        describe('.fromOSM', function () {
            it('returns a ID string unique across entity types', function () {
                expect(Rapid.osmEntity.id.fromOSM('node', '1')).to.equal('n1');
            });
        });

        describe('.toOSM', function () {
            it('reverses fromOSM', function () {
                expect(Rapid.osmEntity.id.toOSM(Rapid.osmEntity.id.fromOSM('node', '1'))).to.equal('1');
            });
        });
    });

    describe('#copy', function () {
        it('returns a new Entity', function () {
            var n = Rapid.osmEntity({id: 'n'});
            var result = n.copy(null, {});
            expect(result).to.be.an.instanceof(Rapid.osmEntity);
            expect(result).not.to.equal(n);
        });

        it('adds the new Entity to input object', function () {
            var n = Rapid.osmEntity({id: 'n'});
            var copies = {};
            var result = n.copy(null, copies);
            expect(Object.keys(copies)).to.have.length(1);
            expect(copies.n).to.equal(result);
        });

        it('returns an existing copy in input object', function () {
            var n = Rapid.osmEntity({id: 'n'});
            var copies = {};
            var result1 = n.copy(null, copies);
            var result2 = n.copy(null, copies);
            expect(Object.keys(copies)).to.have.length(1);
            expect(result1).to.equal(result2);
        });

        it('resets \'id\', \'user\', \'version\', and \'v\' properties', function () {
            var n = Rapid.osmEntity({ id: 'n', user: 'user', version: 10, v: 100 });
            var copies = {};
            n.copy(null, copies);
            expect(copies.n.isNew()).to.be.ok;
            expect(copies.n.user).to.be.undefined;
            expect(copies.n.version).to.be.undefined;
            expect(copies.n.v).to.be.undefined;
        });

        it('copies tags', function () {
            var n = Rapid.osmEntity({id: 'n', tags: {foo: 'foo'}});
            var copies = {};
            n.copy(null, copies);
            expect(copies.n.tags).to.equal(n.tags);
        });
    });

    describe('#update', function () {
        it('returns a new Entity', function () {
            var a = Rapid.osmEntity();
            var b = a.update({});
            expect(b instanceof Rapid.osmEntity).to.be.true;
            expect(a).not.to.equal(b);
        });

        it('updates the specified attributes', function () {
            var tags = {foo: 'bar'};
            var e = Rapid.osmEntity().update({tags: tags});
            expect(e.tags).to.equal(tags);
        });

        it('preserves existing attributes', function () {
            var e = Rapid.osmEntity({id: 'w1'}).update({});
            expect(e.id).to.equal('w1');
        });

        it('doesn\'t modify the input', function () {
            var attrs = {tags: {foo: 'bar'}};
            Rapid.osmEntity().update(attrs);
            expect(attrs).to.eql({tags: {foo: 'bar'}});
        });

        it('doesn\'t copy prototype properties', function () {
            expect(Rapid.osmEntity().update({})).not.to.have.ownProperty('update');
        });

        it('sets v if undefined', function() {
            const a = Rapid.osmEntity();
            const b = a.update({});
            const bv = b.v;
            expect(bv).to.be.a('number');
        });

        it('updates v if already defined', function() {
            const a = Rapid.osmEntity({v: 100});
            const b = a.update({});
            const bv = b.v;
            expect(bv).to.be.a('number');
            expect(bv).to.be.not.equal(100);
        });
    });

    describe('#touch', function () {
        it('updates v in place', function () {
            const a = Rapid.osmEntity();
            expect(a.v).to.be.undefined;

            const b = a.touch();
            const bv = b.v;
            expect(a).to.equal(b);
            expect(bv).to.be.a('number');

            const c = b.touch();
            const cv = c.v;
            expect(c).to.equal(b);
            expect(cv).to.be.a('number');
            expect(cv).to.not.equal(bv);
        });
   });

    describe('#mergeTags', function () {
        it('returns self if unchanged', function () {
            var a = Rapid.osmEntity({tags: {a: 'a'}});
            var b = a.mergeTags({a: 'a'});
            expect(a).to.equal(b);
        });

        it('returns a new Entity if changed', function () {
            var a = Rapid.osmEntity({tags: {a: 'a'}});
            var b = a.mergeTags({a: 'b'});
            expect(b instanceof Rapid.osmEntity).to.be.true;
            expect(a).not.to.equal(b);
        });

        it('merges tags', function () {
            var a = Rapid.osmEntity({tags: {a: 'a'}});
            var b = a.mergeTags({b: 'b'});
            expect(b.tags).to.eql({a: 'a', b: 'b'});
        });

        it('combines non-conflicting tags', function () {
            var a = Rapid.osmEntity({tags: {a: 'a'}});
            var b = a.mergeTags({a: 'a'});
            expect(b.tags).to.eql({a: 'a'});
        });

        it('combines conflicting tags with semicolons', function () {
            var a = Rapid.osmEntity({tags: {a: 'a'}});
            var b = a.mergeTags({a: 'b'});
            expect(b.tags).to.eql({a: 'a;b'});
        });

        it('combines combined tags', function () {
            var a = Rapid.osmEntity({tags: {a: 'a;b'}});
            var b = Rapid.osmEntity({tags: {a: 'b'}});

            expect(a.mergeTags(b.tags).tags).to.eql({a: 'a;b'});
            expect(b.mergeTags(a.tags).tags).to.eql({a: 'b;a'});
        });

        it('combines combined tags with whitespace', function () {
            var a = Rapid.osmEntity({tags: {a: 'a; b'}});
            var b = Rapid.osmEntity({tags: {a: 'b'}});

            expect(a.mergeTags(b.tags).tags).to.eql({a: 'a;b'});
            expect(b.mergeTags(a.tags).tags).to.eql({a: 'b;a'});
        });

        it('does NOT combine building tags for new tag: building=yes', function () {
            var a = Rapid.osmEntity({tags: {building: 'residential'}});
            var b = a.mergeTags({building: 'yes'});
            expect(b.tags).to.eql({building: 'residential'});
        });

        it('does combine building tags if existing tag is building=yes', function () {
            var a = Rapid.osmEntity({tags: {building: 'yes'}});
            var b = a.mergeTags({building: 'residential'});
            expect(b.tags).to.eql({building: 'residential'});
        });

        it('keeps the existing building tag if the new tag is not building=yes', function () {
            var a = Rapid.osmEntity({tags: {building: 'residential'}});
            var b = a.mergeTags({building: 'house'});
            expect(b.tags).to.eql({building: 'residential'});
        });


    });

    describe('#osmId', function () {
        it('returns an OSM ID as a string', function () {
            expect(Rapid.osmEntity({id: 'w1234'}).osmId()).to.eql('1234');
            expect(Rapid.osmEntity({id: 'n1234'}).osmId()).to.eql('1234');
            expect(Rapid.osmEntity({id: 'r1234'}).osmId()).to.eql('1234');
        });
    });

    describe('#intersects', function () {
        it('returns true for a way with a node within the given extent', function () {
            var node  = Rapid.osmNode({loc: [0, 0]});
            var way   = Rapid.osmWay({nodes: [node.id]});
            var graph = new Rapid.Graph([node, way]);
            expect(way.intersects(new sdk.Extent([-5, -5], [5, 5]), graph)).to.equal(true);
        });

        it('returns false for way with no nodes within the given extent', function () {
            var node  = Rapid.osmNode({loc: [6, 6]});
            var way   = Rapid.osmWay({nodes: [node.id]});
            var graph = new Rapid.Graph([node, way]);
            expect(way.intersects(new sdk.Extent([-5, -5], [5, 5]), graph)).to.equal(false);
        });
    });

    describe('#hasNonGeometryTags', function () {
        it('returns false for an entity without tags', function () {
            var node = Rapid.osmNode();
            expect(node.hasNonGeometryTags()).to.equal(false);
        });

        it('returns true for an entity with tags', function () {
            var node = Rapid.osmNode({tags: {foo: 'bar'}});
            expect(node.hasNonGeometryTags()).to.equal(true);
        });

        it('returns false for an entity with only an area=yes tag', function () {
            var node = Rapid.osmNode({tags: {area: 'yes'}});
            expect(node.hasNonGeometryTags()).to.equal(false);
        });
    });

    describe('#hasParentRelations', function () {
        it('returns true for an entity that is a relation member', function () {
            var node = Rapid.osmNode();
            var relation = Rapid.osmRelation({members: [{id: node.id}]});
            var graph = new Rapid.Graph([node, relation]);
            expect(node.hasParentRelations(graph)).to.equal(true);
        });

        it('returns false for an entity that is not a relation member', function () {
            var node = Rapid.osmNode();
            var graph = new Rapid.Graph([node]);
            expect(node.hasParentRelations(graph)).to.equal(false);
        });
    });

    describe('#deprecatedTags', function () {
        var deprecated = [
          { old: { highway: 'no' } },
          { old: { amenity: 'toilet' }, replace: { amenity: 'toilets' } },
          { old: { speedlimit: '*' }, replace: { maxspeed: '$1' } },
          { old: { man_made: 'water_tank' }, replace: { man_made: 'storage_tank', content: 'water' } },
          { old: { amenity: 'gambling', gambling: 'casino' }, replace: { amenity: 'casino' } }
        ];

        it('returns none if entity has no tags', function () {
            expect(Rapid.osmEntity().deprecatedTags(deprecated)).to.eql([]);
        });

        it('returns none when no tags are deprecated', function () {
            expect(Rapid.osmEntity({ tags: { amenity: 'toilets' } }).deprecatedTags(deprecated)).to.eql([]);
        });

        it('returns 1:0 replacement', function () {
            expect(Rapid.osmEntity({ tags: { highway: 'no' } }).deprecatedTags(deprecated)).to.eql(
                [{ old: { highway: 'no' } }]
            );
        });

        it('returns 1:1 replacement', function () {
            expect(Rapid.osmEntity({ tags: { amenity: 'toilet' } }).deprecatedTags(deprecated)).to.eql(
                [{ old: { amenity: 'toilet' }, replace: { amenity: 'toilets' } }]
            );
        });

        it('returns 1:1 wildcard', function () {
            expect(Rapid.osmEntity({ tags: { speedlimit: '50' } }).deprecatedTags(deprecated)).to.eql(
                [{ old: { speedlimit: '*' }, replace: { maxspeed: '$1' } }]
            );
        });

        it('returns 1:2 total replacement', function () {
            expect(Rapid.osmEntity({ tags: { man_made: 'water_tank' } }).deprecatedTags(deprecated)).to.eql(
                [{ old: { man_made: 'water_tank' }, replace: { man_made: 'storage_tank', content: 'water' } }]
            );
        });

        it('returns 1:2 partial replacement', function () {
            expect(Rapid.osmEntity({ tags: { man_made: 'water_tank', content: 'water' } }).deprecatedTags(deprecated)).to.eql(
                [{ old: { man_made: 'water_tank' }, replace: { man_made: 'storage_tank', content: 'water' } }]
            );
        });

        it('returns 2:1 replacement', function () {
            expect(Rapid.osmEntity({ tags: { amenity: 'gambling', gambling: 'casino' } }).deprecatedTags(deprecated)).to.eql(
                [{ old: { amenity: 'gambling', gambling: 'casino' }, replace: { amenity: 'casino' } }]
            );
        });
    });

    describe('#hasInterestingTags', function () {
        it('returns false if the entity has no tags', function () {
            expect(Rapid.osmEntity().hasInterestingTags()).to.equal(false);
        });

        it('returns true if the entity has tags other than \'attribution\', \'created_by\', \'source\', \'odbl\' and tiger tags', function () {
            expect(Rapid.osmEntity({tags: {foo: 'bar'}}).hasInterestingTags()).to.equal(true);
        });

        it('return false if the entity has only uninteresting tags', function () {
            expect(Rapid.osmEntity({tags: {source: 'Bing'}}).hasInterestingTags()).to.equal(false);
        });

        it('return false if the entity has only tiger tags', function () {
            expect(Rapid.osmEntity({tags: {'tiger:source': 'blah', 'tiger:foo': 'bar'}}).hasInterestingTags()).to.equal(false);
        });
    });

    describe('#isHighwayIntersection', function () {
        it('returns false', function () {
            expect(Rapid.osmEntity().isHighwayIntersection()).to.be.false;
        });
    });

    describe('#isDegenerate', function () {
        it('returns true', function () {
            expect(Rapid.osmEntity().isDegenerate()).to.be.true;
        });
    });

});
