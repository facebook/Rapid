import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('osmEntity', () => {
  it('returns a subclass of the appropriate type', () => {
    assert.ok(Rapid.osmEntity({type: 'node'}) instanceof Rapid.osmNode);
    assert.ok(Rapid.osmEntity({type: 'way'}) instanceof Rapid.osmWay);
    assert.ok(Rapid.osmEntity({type: 'relation'}) instanceof Rapid.osmRelation);
    assert.ok(Rapid.osmEntity({id: 'n1'}) instanceof Rapid.osmNode);
    assert.ok(Rapid.osmEntity({id: 'w1'}) instanceof Rapid.osmWay);
    assert.ok(Rapid.osmEntity({id: 'r1'}) instanceof Rapid.osmRelation);
  });

  describe('.id', () => {
    it('generates unique IDs', () => {
      assert.notEqual(Rapid.osmEntity.id('node'), Rapid.osmEntity.id('node'));
    });

    describe('.fromOSM', () => {
      it('returns a ID string unique across entity types', () => {
        assert.equal(Rapid.osmEntity.id.fromOSM('node', '1'), 'n1');
      });
    });

    describe('.toOSM', () => {
      it('reverses fromOSM', () => {
        const id = Rapid.osmEntity.id.fromOSM('node', '1');
        assert.equal(Rapid.osmEntity.id.toOSM(id), '1');
      });
    });
  });

  describe('#copy', () => {
    it('returns a new Entity', () => {
      const n = Rapid.osmEntity({id: 'n'});
      const result = n.copy(null, {});
      assert.ok(result instanceof Rapid.osmEntity);
      assert.notEqual(result, n);
    });

    it('adds the new Entity to input object', () => {
      const n = Rapid.osmEntity({id: 'n'});
      const copies = {};
      const result = n.copy(null, copies);
      assert.equal(Object.keys(copies).length, 1);
      assert.deepEqual(copies.n, result);
    });

    it('returns an existing copy in input object', () => {
      const n = Rapid.osmEntity({id: 'n'});
      const copies = {};
      const result1 = n.copy(null, copies);
      const result2 = n.copy(null, copies);
      assert.equal(Object.keys(copies).length, 1);
      assert.equal(result1, result2);
    });

    it('resets \'id\', \'user\', \'version\', and \'v\' properties', () => {
      const n = Rapid.osmEntity({ id: 'n', user: 'user', version: 10, v: 100 });
      const copies = {};
      n.copy(null, copies);
      assert.ok(copies.n.isNew());
      assert.equal(copies.n.user, undefined);
      assert.equal(copies.n.version, undefined);
      assert.equal(copies.n.v, undefined);
    });

    it('copies tags', () => {
      const n = Rapid.osmEntity({id: 'n', tags: {foo: 'foo'}});
      const copies = {};
      n.copy(null, copies);
      assert.equal(copies.n.tags, n.tags);
    });
  });


  describe('#update', () => {
    it('returns a new Entity', () => {
      const a = Rapid.osmEntity();
      const b = a.update({});
      assert.ok(b instanceof Rapid.osmEntity);
      assert.notEqual(a, b);
    });

    it('updates the specified attributes', () => {
      const tags = {foo: 'bar'};
      const result = Rapid.osmEntity().update({tags: tags});
      assert.equal(result.tags, tags);
    });

    it('preserves existing attributes', () => {
      const result = Rapid.osmEntity({id: 'w1'}).update({});
      assert.equal(result.id, 'w1');
    });

    it('doesn\'t modify the input', () => {
      const attrs = {tags: {foo: 'bar'}};
      Rapid.osmEntity().update(attrs);
      assert.deepEqual(attrs, {tags: {foo: 'bar'}});
    });

    it('doesn\'t copy prototype properties', () => {
      const result = Rapid.osmEntity().update({});
      assert.ok(!result.hasOwnProperty('update'));
    });

    it('sets v if undefined', () => {
      const a = Rapid.osmEntity();
      const b = a.update({});
      assert.equal(typeof b.v, 'number');
    });

    it('updates v if already defined', () => {
      const a = Rapid.osmEntity({v: 100});
      const b = a.update({});
      assert.equal(typeof b.v, 'number');
      assert.notEqual(b.v, 100);
    });
  });


  describe('#touch', () => {
    it('updates v in place', () => {
      const a = Rapid.osmEntity();
      assert.equal(a.v, undefined);

      const b = a.touch();
      const bv = b.v;
      assert.equal(b, a);
      assert.equal(typeof bv, 'number');

      const c = b.touch();
      const cv = c.v;
      assert.equal(c, b);
      assert.equal(typeof cv, 'number');
      assert.notEqual(cv, bv);
    });
 });

  describe('#mergeTags', () => {
    it('returns self if unchanged', () => {
      const a = Rapid.osmEntity({tags: {a: 'a'}});
      const b = a.mergeTags({a: 'a'});
      assert.equal(a, b);
    });

    it('returns a new Entity if changed', () => {
      const a = Rapid.osmEntity({tags: {a: 'a'}});
      const b = a.mergeTags({a: 'b'});
      assert.ok(b instanceof Rapid.osmEntity);
      assert.notEqual(a, b);
    });

    it('merges tags', () => {
      const a = Rapid.osmEntity({tags: {a: 'a'}});
      const b = a.mergeTags({b: 'b'});
      assert.deepEqual(b.tags, {a: 'a', b: 'b'});
    });

    it('combines non-conflicting tags', () => {
      const a = Rapid.osmEntity({tags: {a: 'a'}});
      const b = a.mergeTags({a: 'a'});
      assert.deepEqual(b.tags, {a: 'a'});
    });

    it('combines conflicting tags with semicolons', () => {
      const a = Rapid.osmEntity({tags: {a: 'a'}});
      const b = a.mergeTags({a: 'b'});
      assert.deepEqual(b.tags, {a: 'a;b'});
    });

    it('combines combined tags', () => {
      const a = Rapid.osmEntity({tags: {a: 'a;b'}});
      const b = Rapid.osmEntity({tags: {a: 'b'}});
      assert.deepEqual(a.mergeTags(b.tags).tags, {a: 'a;b'});
      assert.deepEqual(b.mergeTags(a.tags).tags, {a: 'b;a'});
    });

    it('combines combined tags with whitespace', () => {
      const a = Rapid.osmEntity({tags: {a: 'a; b'}});
      const b = Rapid.osmEntity({tags: {a: 'b'}});
      assert.deepEqual(a.mergeTags(b.tags).tags, {a: 'a;b'});
      assert.deepEqual(b.mergeTags(a.tags).tags, {a: 'b;a'});
    });

    it('does NOT combine building tags for new tag: building=yes', () => {
      const a = Rapid.osmEntity({tags: {building: 'residential'}});
      const b = a.mergeTags({building: 'yes'});
      assert.deepEqual(b.tags, {building: 'residential'});
    });

    it('does combine building tags if existing tag is building=yes', () => {
      const a = Rapid.osmEntity({tags: {building: 'yes'}});
      const b = a.mergeTags({building: 'residential'});
      assert.deepEqual(b.tags, {building: 'residential'});
    });

    it('keeps the existing building tag if the new tag is not building=yes', () => {
      const a = Rapid.osmEntity({tags: {building: 'residential'}});
      const b = a.mergeTags({building: 'house'});
      assert.deepEqual(b.tags, {building: 'residential'});
    });
  });


  describe('#osmId', () => {
    it('returns an OSM ID as a string', () => {
      assert.equal(Rapid.osmEntity({id: 'w1234'}).osmId(), '1234');
      assert.equal(Rapid.osmEntity({id: 'n1234'}).osmId(), '1234');
      assert.equal(Rapid.osmEntity({id: 'r1234'}).osmId(), '1234');
    });
  });


  describe('#intersects', () => {
    it('returns true for a way with a node within the given extent', () => {
      const node = Rapid.osmNode({loc: [0, 0]});
      const way = Rapid.osmWay({nodes: [node.id]});
      const graph = new Rapid.Graph([node, way]);
      const result = way.intersects(new Rapid.sdk.Extent([-5, -5], [5, 5]), graph);
      assert.equal(result, true);
    });

    it('returns false for way with no nodes within the given extent', () => {
      const node = Rapid.osmNode({loc: [6, 6]});
      const way = Rapid.osmWay({nodes: [node.id]});
      const graph = new Rapid.Graph([node, way]);
      const result = way.intersects(new Rapid.sdk.Extent([-5, -5], [5, 5]), graph);
      assert.equal(result, false);
    });
  });


  describe('#hasNonGeometryTags', () => {
    it('returns false for an entity without tags', () => {
      const node = Rapid.osmNode();
      assert.equal(node.hasNonGeometryTags(), false);
    });

    it('returns true for an entity with tags', () => {
      const node = Rapid.osmNode({tags: {foo: 'bar'}});
      assert.equal(node.hasNonGeometryTags(), true);
    });

    it('returns false for an entity with only an area=yes tag', () => {
      const node = Rapid.osmNode({tags: {area: 'yes'}});
      assert.equal(node.hasNonGeometryTags(), false);
    });
  });


  describe('#hasParentRelations', () => {
    it('returns true for an entity that is a relation member', () => {
      const node = Rapid.osmNode();
      const relation = Rapid.osmRelation({members: [{id: node.id}]});
      const graph = new Rapid.Graph([node, relation]);
      assert.equal(node.hasParentRelations(graph), true);
    });

    it('returns false for an entity that is not a relation member', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      assert.equal(node.hasParentRelations(graph), false);
    });
  });


  describe('#deprecatedTags', () => {
    const deprecated = [
      { old: { highway: 'no' } },
      { old: { amenity: 'toilet' }, replace: { amenity: 'toilets' } },
      { old: { speedlimit: '*' }, replace: { maxspeed: '$1' } },
      { old: { man_made: 'water_tank' }, replace: { man_made: 'storage_tank', content: 'water' } },
      { old: { amenity: 'gambling', gambling: 'casino' }, replace: { amenity: 'casino' } }
    ];

    it('returns none if entity has no tags', () => {
      const e = Rapid.osmEntity();
      assert.deepEqual(e.deprecatedTags(deprecated), []);
    });

    it('returns none when no tags are deprecated', () => {
      const e = Rapid.osmEntity({ tags: { amenity: 'toilets' } });
      assert.deepEqual(e.deprecatedTags(deprecated), []);
    });

    it('returns 1:0 replacement', () => {
      const e = Rapid.osmEntity({ tags: { highway: 'no' } });
      assert.deepEqual(
        e.deprecatedTags(deprecated),
        [{ old: { highway: 'no' }}]
      );
    });

    it('returns 1:1 replacement', () => {
      const e = Rapid.osmEntity({ tags: { amenity: 'toilet' } });
      assert.deepEqual(
        e.deprecatedTags(deprecated),
        [{ old: { amenity: 'toilet' }, replace: { amenity: 'toilets' } }]
      );
    });

    it('returns 1:1 wildcard', () => {
      const e = Rapid.osmEntity({ tags: { speedlimit: '50' } });
      assert.deepEqual(
        e.deprecatedTags(deprecated),
        [{ old: { speedlimit: '*' }, replace: { maxspeed: '$1' } }]
      );
    });

    it('returns 1:2 total replacement', () => {
      const e = Rapid.osmEntity({ tags: { man_made: 'water_tank' } });
      assert.deepEqual(
        e.deprecatedTags(deprecated),
        [{ old: { man_made: 'water_tank' }, replace: { man_made: 'storage_tank', content: 'water' } }]
      );
    });

    it('returns 1:2 partial replacement', () => {
      const e = Rapid.osmEntity({ tags: { man_made: 'water_tank', content: 'water' } });
      assert.deepEqual(
        e.deprecatedTags(deprecated),
        [{ old: { man_made: 'water_tank' }, replace: { man_made: 'storage_tank', content: 'water' } }]
      );
    });

    it('returns 2:1 replacement', () => {
      const e = Rapid.osmEntity({ tags: { amenity: 'gambling', gambling: 'casino' } });
      assert.deepEqual(
        e.deprecatedTags(deprecated),
        [{ old: { amenity: 'gambling', gambling: 'casino' }, replace: { amenity: 'casino' } }]
      );
    });
  });


  describe('#hasInterestingTags', () => {
    it('returns false if the entity has no tags', () => {
      const e = Rapid.osmEntity();
      assert.equal(e.hasInterestingTags(), false);
    });

    it('returns true if the entity has tags other than \'attribution\', \'created_by\', \'source\', \'odbl\' and tiger tags', () => {
      const e = Rapid.osmEntity({tags: {foo: 'bar'}});
      assert.equal(e.hasInterestingTags(), true);
    });

    it('return false if the entity has only uninteresting tags', () => {
      const e = Rapid.osmEntity({tags: {source: 'Bing'}});
      assert.equal(e.hasInterestingTags(), false);
    });

    it('return false if the entity has only tiger tags', () => {
      const e = Rapid.osmEntity({tags: {'tiger:source': 'blah', 'tiger:foo': 'bar'}});
      assert.equal(e.hasInterestingTags(), false);
    });
  });


  describe('#isHighwayIntersection', () => {
    it('returns false', () => {
      assert.equal(Rapid.osmEntity().isHighwayIntersection(), false);
    });
  });

  describe('#isDegenerate', () => {
    it('returns true', () => {
      assert.equal(Rapid.osmEntity().isDegenerate(), true);
    });
  });

});
