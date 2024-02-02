import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('osmChangeset', () => {

  describe('constructor', () => {
    it('returns a changeset', () => {
      const changeset = Rapid.osmChangeset();
      assert.ok(changeset instanceof Rapid.osmChangeset);
      assert.equal(changeset.type, 'changeset');
      assert.deepEqual(changeset.tags, {});
    });

    it('returns a changeset with provided tags', () => {
      const changeset = Rapid.osmChangeset({tags: {foo: 'bar'}});
      assert.ok(changeset instanceof Rapid.osmChangeset);
      assert.equal(changeset.type, 'changeset');
      assert.deepEqual(changeset.tags, {foo: 'bar'});
    });
  });


  describe('#asJXON', () => {
    it('converts a changeset to jxon', () => {
      const expected = {
        osm: {
          changeset: {
            tag: [{ '@k': 'comment', '@v': 'hello' }],
            '@version': 0.6,
            '@generator': 'Rapid'
          }
        }
      };

      const changeset = Rapid.osmChangeset({tags: {'comment': 'hello'}});
      const jxon = changeset.asJXON();
      assert.deepEqual(jxon, expected);
    });
  });


  describe('#osmChangeJXON', () => {
    it('converts change data to JXON', () => {
      const expected = {
        osmChange: {
          '@version': 0.6,
          '@generator': 'Rapid',
          'create': {},
          'modify': {},
          'delete': { '@if-unused': true }
        }
      };

      const changeset = Rapid.osmChangeset();
      const jxon = changeset.osmChangeJXON({ created: [], modified: [], deleted: [] });
      assert.deepEqual(jxon, expected);
    });

    it('includes creations ordered by nodes, ways, relations', () => {
      const n = Rapid.osmNode({ loc: [0, 0] });
      const w = Rapid.osmWay();
      const r = Rapid.osmRelation();
      const c = Rapid.osmChangeset({ id: '1234' });
      const changes = { created: [r, w, n], modified: [], deleted: [] };
      const jxon = c.osmChangeJXON(changes);

      const result = jxon.osmChange.create;
      assert.deepEqual(result.node, [n.asJXON('1234').node]);
      assert.deepEqual(result.way, [w.asJXON('1234').way]);
      assert.deepEqual(result.relation, [r.asJXON('1234').relation]);
  });

    it('includes creations ordered by dependencies', () => {
      const n = Rapid.osmNode({ loc: [0, 0] });
      const w = Rapid.osmWay({nodes: [n.id]});
      const r1 = Rapid.osmRelation({ members: [{ id: w.id, type: 'way' }] });
      const r2 = Rapid.osmRelation({ members: [{ id: r1.id, type: 'relation' }] });
      const c = Rapid.osmChangeset({ id: '1234' });
      const changes = { created: [r2, r1, w, n], modified: [], deleted: [] };
      const jxon = c.osmChangeJXON(changes);

      const result = jxon.osmChange.create;
      assert.deepEqual(result.node, [n.asJXON('1234').node]);
      assert.deepEqual(result.way, [w.asJXON('1234').way]);
      assert.deepEqual(result.relation, [r1.asJXON('1234').relation, r2.asJXON('1234').relation]);
    });

    it('includes creations ignoring circular dependencies', () => {
      const r1 = Rapid.osmRelation();
      const r2 = Rapid.osmRelation();
      const c = Rapid.osmChangeset({ id: '1234' });
      r1.addMember({ id: r2.id, type: 'relation' });
      r2.addMember({ id: r1.id, type: 'relation' });
      const changes = { created: [r1, r2], modified: [], deleted: [] };
      const jxon = c.osmChangeJXON(changes);

      const result = jxon.osmChange.create;
      assert.deepEqual(result, {
        relation: [r1.asJXON('1234').relation, r2.asJXON('1234').relation]
      });
    });

    it('includes modifications', () => {
      const n = Rapid.osmNode({ loc: [0, 0] });
      const w = Rapid.osmWay();
      const r = Rapid.osmRelation();
      const c = Rapid.osmChangeset({ id: '1234' });
      const changes = { created: [], modified: [r, w, n], deleted: [] };
      const jxon = c.osmChangeJXON(changes);

      const result = jxon.osmChange.modify;
      assert.deepEqual(result, {
        node: [n.asJXON('1234').node],
        way: [w.asJXON('1234').way],
        relation: [r.asJXON('1234').relation]
      });
    });

    it('includes deletions ordered by relations, ways, nodes', () => {
      const n = Rapid.osmNode({ loc: [0, 0] });
      const w = Rapid.osmWay();
      const r = Rapid.osmRelation();
      const c = Rapid.osmChangeset({ id: '1234' });
      const changes = { created: [], modified: [], deleted: [n, w, r] };
      const jxon = c.osmChangeJXON(changes);

      const result = jxon.osmChange.delete;
      assert.deepEqual(result, {
        node: [n.asJXON('1234').node],
        way: [w.asJXON('1234').way],
        relation: [r.asJXON('1234').relation],
        '@if-unused': true
      });
    });
  });

});
