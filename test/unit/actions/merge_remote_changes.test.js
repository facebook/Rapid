import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionMergeRemoteChanges', () => {
  const discardTags = { created_by: true };

  const base = new Rapid.Graph([
    Rapid.osmNode({ id: 'n1', loc: [1, 1], version: '1', tags: { foo: 'foo' }}),

    Rapid.osmNode({ id: 'n10', loc: [ 10,  10], version: '1' }),
    Rapid.osmNode({ id: 'n11', loc: [ 10, -10], version: '1' }),
    Rapid.osmNode({ id: 'n12', loc: [-10, -10], version: '1' }),
    Rapid.osmNode({ id: 'n13', loc: [-10,  10], version: '1' }),
    Rapid.osmWay({
      id: 'w10',
      nodes: ['n10', 'n11', 'n12', 'n13', 'n10'],
      version: '1',
      tags: { foo: 'foo', area: 'yes' }
    }),

    Rapid.osmNode({ id: 'n20', loc: [ 5,  5], version: '1' }),
    Rapid.osmNode({ id: 'n21', loc: [ 5, -5], version: '1' }),
    Rapid.osmNode({ id: 'n22', loc: [-5, -5], version: '1' }),
    Rapid.osmNode({ id: 'n23', loc: [-5,  5], version: '1' }),
    Rapid.osmWay({
      id: 'w20',
      nodes: ['n20', 'n21', 'n22', 'n23', 'n20'],
      version: '1',
      tags: { foo: 'foo', area: 'yes' }
    }),

    Rapid.osmRelation({
      id: 'r',
      members: [{ id: 'w10', role: 'outer' }, { id: 'w20', role: 'inner' }],
      version: '1',
      tags: { type: 'multipolygon', foo: 'foo' }
    })
  ]);

  // some new objects not in the graph yet..
  const n30 = Rapid.osmNode({ id: 'n30', loc: [ 12,  12], version: '1' });
  const n31 = Rapid.osmNode({ id: 'n31', loc: [ 12, -12], version: '1' });
  const n32 = Rapid.osmNode({ id: 'n32', loc: [-12, -12], version: '1' });
  const n33 = Rapid.osmNode({ id: 'n33', loc: [-12,  12], version: '1' });
  const w30 = Rapid.osmWay({
    id: 'w30',
    nodes: ['n30', 'n31', 'n32', 'n33', 'n30'],
    version: '1',
    tags: { foo: 'foo_new', area: 'yes' }
  });

  const n40 = Rapid.osmNode({ id: 'n40', loc: [ 6,  6], version: '1' });
  const n41 = Rapid.osmNode({ id: 'n41', loc: [ 6, -6], version: '1' });
  const n42 = Rapid.osmNode({ id: 'n42', loc: [-6, -6], version: '1' });
  const n43 = Rapid.osmNode({ id: 'n43', loc: [-6,  6], version: '1' });
  const w40 = Rapid.osmWay({
    id: 'w40',
    nodes: ['n40', 'n41', 'n42', 'n43', 'n40'],
    version: '1',
    tags: { foo: 'foo_new', area: 'yes' }
  });


  function makeGraph(entities) {
    return entities.reduce((graph, entity) => graph.replace(entity), new Rapid.Graph(base));
  }


  describe('non-destuctive merging', () => {
    describe('tags', () => {
      it('doesn\'t merge tags if conflict (local change, remote change)', () => {
        const localTags = { foo: 'foo_local' };      // changed foo
        const remoteTags = { foo: 'foo_remote' };    // changed foo
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('doesn\'t merge tags if conflict (local change, remote delete)', () => {
        var localTags = { foo: 'foo_local' };     // changed foo
        const remoteTags = {};                    // deleted foo
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('doesn\'t merge tags if conflict (local delete, remote change)', () => {
        const localTags = {};                       // deleted foo
        const remoteTags = { foo: 'foo_remote' };   // changed foo
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('doesn\'t merge tags if conflict (local add, remote add)', () => {
        const localTags = { foo: 'foo', bar: 'bar_local' };    // same foo, added bar
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('merges tags if no conflict (remote delete)', () => {
        const localTags = { foo: 'foo', bar: 'bar_local' };   // same foo, added bar
        const remoteTags = {};                                // deleted foo
        const mergedTags = { bar: 'bar_local' };
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n1');
        assert.equal(n.version, '2');
        assert.deepEqual(n.tags, mergedTags);
      });

      it('merges tags if no conflict (local delete)', () => {
        const localTags = {};                                   // deleted foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };   // same foo, added bar
        const mergedTags = { bar: 'bar_remote' };
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n1');
        assert.equal(n.version, '2');
        assert.deepEqual(n.tags, mergedTags);
      });
    });

    describe('nodes', () => {
      it('doesn\'t merge nodes if location is different', () => {
        const localTags = { foo: 'foo_local' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const localLoc = [2, 2];                               // moved node
        const remoteLoc = [3, 3];                              // moved node
        const local = base.entity('n1').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('n1').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('merges nodes if location is same', () => {
        const localTags = { foo: 'foo_local' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote' };
        const localLoc = [2, 2];                               // moved node
        const remoteLoc = [2, 2];                              // moved node
        const local = base.entity('n1').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('n1').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n1');
        assert.equal(n.version, '2');
        assert.deepEqual(n.tags, mergedTags);
        assert.deepEqual(n.loc, [2, 2]);
      });
    });

    describe('ways', () => {
      it('merges ways if nodelist is same', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const local = base.entity('w10').update({ tags: localTags });
        const remote = base.entity('w10').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const w = result.entity('w10');
        assert.equal(w.version, '2');
        assert.deepEqual(w.tags, mergedTags);
      });

      it('merges ways if nodelist changed only remotely', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const localNodes = ['n10', 'n11', 'n12', 'n13', 'n10'];             // didn't change nodes
        const remoteNodes = ['n10', 'n31', 'n32', 'n13', 'n10'];            // changed nodes
        const local = base.entity('w10').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w10').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote, n31, n32]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const w = result.entity('w10');
        assert.equal(w.version, '2');
        assert.deepEqual(w.tags, mergedTags);
        assert.deepEqual(w.nodes, remoteNodes);
        assert.equal(result.hasEntity('n31'), n31);  // remote node added to local
        assert.equal(result.hasEntity('n32'), n32);  // remote node added to local
      });

      it('merges ways if nodelist changed only locally', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const localNodes = ['n10', 'n31', 'n32', 'n13', 'n10'];             // changed nodes
        const remoteNodes = ['n10', 'n11', 'n12', 'n13', 'n10'];            // didn't change nodes
        const local = base.entity('w10').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w10').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, n31, n32]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const w = result.entity('w10');
        assert.equal(w.version, '2');
        assert.deepEqual(w.tags, mergedTags);
        assert.deepEqual(w.nodes, localNodes);
      });

      it('merges ways if nodelist changes don\'t overlap', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };               // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags  = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const localNodes  = ['n10', 'n30', 'n31',  'n12',     'n13',      'n10'];   // changed n11 -> n30, n31
        const remoteNodes = ['n10',    'n11',      'n12',  'n32', 'n33',  'n10'];   // changed n13 -> n32, n33
        const mergedNodes = ['n10', 'n30', 'n31',  'n12',  'n32', 'n33',  'n10'];
        const local = base.entity('w10').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w10').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, n30, n31]);
        const remoteGraph = makeGraph([remote, n32, n33]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const w = result.entity('w10');
        assert.equal(w.version, '2');
        assert.deepEqual(w.tags, mergedTags);
        assert.deepEqual(w.nodes, mergedNodes);
        assert.equal(result.hasEntity('n32'), n32);  // remote node added to local
        assert.equal(result.hasEntity('n33'), n33);  // remote node added to local
      });

      it('doesn\'t merge ways if nodelist changes overlap', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', area: 'yes' };   // same foo, added bar
        const localNodes  = ['n10', 'n30', 'n31', 'n12', 'n13', 'n10'];       // changed n11 -> n30, n31
        const remoteNodes = ['n10', 'n32', 'n33', 'n12', 'n13', 'n10'];       // changed n11 -> n32, n33
        const local = base.entity('w10').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w10').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, n30, n31]);
        const remoteGraph = makeGraph([remote, n32, n33]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('merges ways if childNode location is same', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [12, 12];    // moved node
        const local = base.entity('n10').update({ loc: localLoc });
        const remote = base.entity('n10').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n10');
        assert.equal(n.version, '2');
        assert.deepEqual(n.loc, remoteLoc);
      });

      it('doesn\'t merge ways if childNode location is different', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('n10').update({ loc: localLoc });
        const remote = base.entity('n10').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });
    });

    describe('relations', () => {
      it('doesn\'t merge relations if members have changed', () => {
        const localTags   = { foo: 'foo_local', type: 'multipolygon' };                    // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', type: 'multipolygon' };       // same foo, added bar
        const localMembers = [{ id: 'w10', role: 'outer' }, { id: 'w20', role: 'inner' }];   // same members
        const remoteMembers = [{ id: 'w10', role: 'outer' }, { id: 'w40', role: 'inner' }];  // changed inner to w40
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote, n40, n41, n42, n43, w40]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('r', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);
      });

      it('merges relations if members are same and changed tags don\'t conflict', () => {
        const localTags   = { foo: 'foo_local', type: 'multipolygon' };                    // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', type: 'multipolygon' };       // same foo, added bar
        const mergedTags  = { foo: 'foo_local', bar: 'bar_remote', type: 'multipolygon' };
        const localMembers = [{ id: 'w10', role: 'outer' }, { id: 'w20', role: 'inner' }];   // same members
        const remoteMembers = [{ id: 'w10', role: 'outer' }, { id: 'w20', role: 'inner' }];  // same members
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('r', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const r = result.entity('r');
        assert.equal(r.version, '2');
        assert.deepEqual(r.tags, mergedTags);
      });
    });

    describe('#conflicts', () => {
      it('returns conflict details', () => {
        const localTags = { foo: 'foo_local' };                 // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };   // same foo, added bar
        const remoteLoc = [2, 2];                               // moved node
        const local = base.entity('n1').update({ tags: localTags });
        const remote = base.entity('n1').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.equal(result, localGraph);

        const conflicts = action.conflicts();
        assert.ok(conflicts instanceof Array);
        assert.ok(conflicts.length > 0);
      });
    });
  });


  describe('destuctive merging', () => {
    describe('nodes', () => {
      it('merges nodes with \'force_local\' option', () => {
        const localTags = { foo: 'foo_local' };     // changed foo
        const remoteTags = { foo: 'foo_remote' };   // changed foo
        const localLoc = [2, 2];                    // moved node
        const remoteLoc = [3, 3];                   // moved node
        const local = base.entity('n1').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('n1').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_local'
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n1');
        assert.equal(n.version, '2');
        assert.deepEqual(n.tags, localTags);
        assert.deepEqual(n.loc, localLoc);
      });

      it('merges nodes with \'force_remote\' option', () => {
        const localTags = { foo: 'foo_local' };     // changed foo
        const remoteTags = { foo: 'foo_remote' };   // changed foo
        const localLoc = [2, 2];                    // moved node
        const remoteLoc = [3, 3];                   // moved node
        const local = base.entity('n1').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('n1').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_remote'
        };
        const action = Rapid.actionMergeRemoteChanges('n1', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n1');
        assert.equal(n.version, '2');
        assert.deepEqual(n.tags, remoteTags);
        assert.deepEqual(n.loc, remoteLoc);
      });
    });

    describe('ways', () => {
      it('merges ways with \'force_local\' option', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };      // changed foo
        const remoteTags  = { foo: 'foo_remote', area: 'yes' };     // changed foo
        const localNodes  = ['n10', 'n30', 'n31', 'n12', 'n13', 'n10'];   // changed n11 -> n30, n31
        const remoteNodes = ['n10', 'n32', 'n33', 'n12', 'n13', 'n10'];   // changed n11 -> n32, n33
        const local = base.entity('w10').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w10').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, n30, n31]);
        const remoteGraph = makeGraph([remote, n32, n33]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_local'
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const w = result.entity('w10');
        assert.equal(w.version, '2');
        assert.deepEqual(w.tags, localTags);
        assert.deepEqual(w.nodes, localNodes);
      });

      it('merges ways with \'force_remote\' option', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };      // changed foo
        const remoteTags  = { foo: 'foo_remote', area: 'yes' };     // changed foo
        const localNodes  = ['n10', 'n30', 'n31', 'n12', 'n13', 'n10'];   // changed n11 -> n30, n31
        const remoteNodes = ['n10', 'n32', 'n33', 'n12', 'n13', 'n10'];   // changed n11 -> n32, n33
        const local = base.entity('w10').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w10').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, n30, n31]);
        const remoteGraph = makeGraph([remote, n32, n33]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_remote'
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const w = result.entity('w10');
        assert.equal(w.version, '2');
        assert.deepEqual(w.tags, remoteTags);
        assert.deepEqual(w.nodes, remoteNodes);
        assert.equal(result.hasEntity('n32'), n32);  // remote node added to local
        assert.equal(result.hasEntity('n33'), n33);  // remote node added to local
      });

      it('merges way childNodes with \'force_local\' option', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('n10').update({ loc: localLoc });
        const remote = base.entity('n10').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_local'
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n10');
        assert.equal(n.version, '2');
        assert.deepEqual(n.loc, localLoc);
      });

      it('merges way childNodes with \'force_remote\' option', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('n10').update({ loc: localLoc });
        const remote = base.entity('n10').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_remote'
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const n = result.entity('n10');
        assert.equal(n.version, '2');
        assert.deepEqual(n.loc, remoteLoc);
      });

      it('keeps only important childNodes when merging', () => {
        const localNodes  = ['n10', 'n30', 'n31', 'n12', 'n13', 'n10'];  // changed n11 -> n30, n31
        const remoteNodes = ['n10', 'n32', 'n33', 'n12', 'n13', 'n10'];  // changed n11 -> n32, n33
        const localn30 = n30.update({ tags: { highway: 'traffic_signals' }});  // n30 has interesting tags
        const local = base.entity('w10').update({ nodes: localNodes });
        const remote = base.entity('w10').update({ nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, localn30, n31]);
        const remoteGraph = makeGraph([remote, n32, n33]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_remote'
        };
        const action = Rapid.actionMergeRemoteChanges('w10', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        assert.deepEqual(result.entity('w10').nodes, remoteNodes);
        assert.equal(result.hasEntity('n30'), localn30);
        assert.ok(!result.hasEntity('n31'));
      });
    });

    describe('relations', () => {
      it('merges relations with \'force_local\' option', () => {
        const localTags = { foo: 'foo_local', type: 'multipolygon' };    // changed foo
        const remoteTags = { foo: 'foo_remote', type: 'multipolygon' };  // changed foo
        const localMembers = [{ id: 'w30', role: 'outer' }, { id: 'w20', role: 'inner' }];   // changed outer to w30
        const remoteMembers = [{ id: 'w10', role: 'outer' }, { id: 'w40', role: 'inner' }];  // changed inner to w40
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local, n30, n31, n32, n33, w30]);
        const remoteGraph = makeGraph([remote, n40, n41, n42, n43, w40]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_local'
        };
        const action = Rapid.actionMergeRemoteChanges('r', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const r = result.entity('r');
        assert.equal(r.version, '2');
        assert.deepEqual(r.tags, localTags);
        assert.deepEqual(r.members, localMembers);
      });

      it('merges relations with \'force_remote\' option', () => {
        const localTags = { foo: 'foo_local', type: 'multipolygon' };      // changed foo
        const remoteTags = { foo: 'foo_remote', type: 'multipolygon' };    // changed foo
        const localMembers = [{ id: 'w30', role: 'outer' }, { id: 'w20', role: 'inner' }];   // changed outer to w30
        const remoteMembers = [{ id: 'w10', role: 'outer' }, { id: 'w40', role: 'inner' }];  // changed inner to w40
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local, n30, n31, n32, n33, w30]);
        const remoteGraph = makeGraph([remote, n40, n41, n42, n43, w40]);
        const opts = {
          localGraph: localGraph,
          remoteGraph: remoteGraph,
          discardTags: discardTags,
          strategy: 'force_remote'
        };
        const action = Rapid.actionMergeRemoteChanges('r', opts);
        const result = action(localGraph);
        assert.ok(result instanceof Rapid.Graph);

        const r = result.entity('r');
        assert.equal(r.version, '2');
        assert.deepEqual(r.tags, remoteTags);
        assert.deepEqual(r.members, remoteMembers);
      });
    });
  });

});
