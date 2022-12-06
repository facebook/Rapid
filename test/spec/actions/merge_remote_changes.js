describe('iD.actionMergeRemoteChanges', () => {
  const discardTags = { created_by: true };

  const base = new iD.Graph([
    iD.osmNode({ id: 'a', loc: [1, 1], version: '1', tags: { foo: 'foo' }}),

    iD.osmNode({ id: 'p1', loc: [ 10,  10], version: '1' }),
    iD.osmNode({ id: 'p2', loc: [ 10, -10], version: '1' }),
    iD.osmNode({ id: 'p3', loc: [-10, -10], version: '1' }),
    iD.osmNode({ id: 'p4', loc: [-10,  10], version: '1' }),
    iD.osmWay({
      id: 'w1',
      nodes: ['p1', 'p2', 'p3', 'p4', 'p1'],
      version: '1',
      tags: { foo: 'foo', area: 'yes' }
    }),

    iD.osmNode({ id: 'q1', loc: [ 5,  5], version: '1' }),
    iD.osmNode({ id: 'q2', loc: [ 5, -5], version: '1' }),
    iD.osmNode({ id: 'q3', loc: [-5, -5], version: '1' }),
    iD.osmNode({ id: 'q4', loc: [-5,  5], version: '1' }),
    iD.osmWay({
      id: 'w2',
      nodes: ['q1', 'q2', 'q3', 'q4', 'q1'],
      version: '1',
      tags: { foo: 'foo', area: 'yes' }
    }),

    iD.osmRelation({
      id: 'r',
      members: [{ id: 'w1', role: 'outer' }, { id: 'w2', role: 'inner' }],
      version: '1',
      tags: { type: 'multipolygon', foo: 'foo' }
    })
  ]);

  // some new objects not in the graph yet..
  const r1 = iD.osmNode({ id: 'r1', loc: [ 12,  12], version: '1' });
  const r2 = iD.osmNode({ id: 'r2', loc: [ 12, -12], version: '1' });
  const r3 = iD.osmNode({ id: 'r3', loc: [-12, -12], version: '1' });
  const r4 = iD.osmNode({ id: 'r4', loc: [-12,  12], version: '1' });
  const w3 = iD.osmWay({
    id: 'w3',
    nodes: ['r1', 'r2', 'r3', 'r4', 'r1'],
    version: '1',
    tags: { foo: 'foo_new', area: 'yes' }
  });

  const s1 = iD.osmNode({ id: 's1', loc: [ 6,  6], version: '1' });
  const s2 = iD.osmNode({ id: 's2', loc: [ 6, -6], version: '1' });
  const s3 = iD.osmNode({ id: 's3', loc: [-6, -6], version: '1' });
  const s4 = iD.osmNode({ id: 's4', loc: [-6,  6], version: '1' });
  const w4 = iD.osmWay({
    id: 'w4',
    nodes: ['s1', 's2', 's3', 's4', 's1'],
    version: '1',
    tags: { foo: 'foo_new', area: 'yes' }
  });


  function makeGraph(entities) {
    return entities.reduce((graph, entity) => graph.replace(entity), new iD.Graph(base));
  }


  describe('non-destuctive merging', () => {
    describe('tags', () => {
      it('doesn\'t merge tags if conflict (local change, remote change)', () => {
        const localTags = { foo: 'foo_local' };      // changed foo
        const remoteTags = { foo: 'foo_remote' };    // changed foo
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('doesn\'t merge tags if conflict (local change, remote delete)', () => {
        var localTags = { foo: 'foo_local' };     // changed foo
        const remoteTags = {};                    // deleted foo
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('doesn\'t merge tags if conflict (local delete, remote change)', () => {
        const localTags = {};                       // deleted foo
        const remoteTags = { foo: 'foo_remote' };   // changed foo
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('doesn\'t merge tags if conflict (local add, remote add)', () => {
        const localTags = { foo: 'foo', bar: 'bar_local' };    // same foo, added bar
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('merges tags if no conflict (remote delete)', () => {
        const localTags = { foo: 'foo', bar: 'bar_local' };   // same foo, added bar
        const remoteTags = {};                                // deleted foo
        const mergedTags = { bar: 'bar_local' };
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('a').version).to.eql('2');
        expect(result.entity('a').tags).to.eql(mergedTags);
      });

      it('merges tags if no conflict (local delete)', () => {
        const localTags = {};                                   // deleted foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };   // same foo, added bar
        const mergedTags = { bar: 'bar_remote' };
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('a').version).to.eql('2');
        expect(result.entity('a').tags).to.eql(mergedTags);
      });
    });

    describe('nodes', () => {
      it('doesn\'t merge nodes if location is different', () => {
        const localTags = { foo: 'foo_local' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const localLoc = [2, 2];                               // moved node
        const remoteLoc = [3, 3];                              // moved node
        const local = base.entity('a').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('a').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('merges nodes if location is same', () => {
        const localTags = { foo: 'foo_local' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote' };
        const localLoc = [2, 2];                               // moved node
        const remoteLoc = [2, 2];                              // moved node
        const local = base.entity('a').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('a').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('a').version).to.eql('2');
        expect(result.entity('a').tags).to.eql(mergedTags);
        expect(result.entity('a').loc).to.eql([2, 2]);
      });
    });

    describe('ways', () => {
      it('merges ways if nodelist is same', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const local = base.entity('w1').update({ tags: localTags });
        const remote = base.entity('w1').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('w1').version).to.eql('2');
        expect(result.entity('w1').tags).to.eql(mergedTags);
      });

      it('merges ways if nodelist changed only remotely', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const localNodes = ['p1', 'p2', 'p3', 'p4', 'p1'];                  // didn't change nodes
        const remoteNodes = ['p1', 'r2', 'r3', 'p4', 'p1'];                 // changed nodes
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote, r2, r3]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('w1').version).to.eql('2');
        expect(result.entity('w1').tags).to.eql(mergedTags);
        expect(result.entity('w1').nodes).to.eql(remoteNodes);
        expect(result.hasEntity('r2')).to.eql(r2);
        expect(result.hasEntity('r3')).to.eql(r3);
      });

      it('merges ways if nodelist changed only locally', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const localNodes = ['p1', 'r2', 'r3', 'p4', 'p1'];                  // changed nodes
        const remoteNodes = ['p1', 'p2', 'p3', 'p4', 'p1'];                 // didn't change nodes
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, r2, r3]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('w1').version).to.eql('2');
        expect(result.entity('w1').tags).to.eql(mergedTags);
        expect(result.entity('w1').nodes).to.eql(localNodes);
      });

      it('merges ways if nodelist changes don\'t overlap', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };               // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', area: 'yes' };  // same foo, added bar
        const mergedTags  = { foo: 'foo_local', bar: 'bar_remote', area: 'yes' };
        const localNodes  = ['p1', 'r1', 'r2',  'p3',     'p4',     'p1'];   // changed p2 -> r1, r2
        const remoteNodes = ['p1',    'p2',     'p3',  'r3', 'r4',  'p1'];   // changed p4 -> r3, r4
        const mergedNodes = ['p1', 'r1', 'r2',  'p3',  'r3', 'r4',  'p1'];
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, r1, r2]);
        const remoteGraph = makeGraph([remote, r3, r4]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);

        expect(result.entity('w1').version).to.eql('2');
        expect(result.entity('w1').tags).to.eql(mergedTags);
        expect(result.entity('w1').nodes).to.eql(mergedNodes);
        expect(result.hasEntity('r3')).to.eql(r3);
        expect(result.hasEntity('r4')).to.eql(r4);
      });

      it('doesn\'t merge ways if nodelist changes overlap', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', area: 'yes' };   // same foo, added bar
        const localNodes  = ['p1', 'r1', 'r2', 'p3', 'p4', 'p1'];             // changed p2 -> r1, r2
        const remoteNodes = ['p1', 'r3', 'r4', 'p3', 'p4', 'p1'];             // changed p2 -> r3, r4
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, r1, r2]);
        const remoteGraph = makeGraph([remote, r3, r4]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('merges ways if childNode location is same', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [12, 12];    // moved node
        const local = base.entity('p1').update({ loc: localLoc });
        const remote = base.entity('p1').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('p1').version).to.eql('2');
        expect(result.entity('p1').loc).to.eql(remoteLoc);
      });

      it('doesn\'t merge ways if childNode location is different', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('p1').update({ loc: localLoc });
        const remote = base.entity('p1').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });
    });

    describe('relations', () => {
      it('doesn\'t merge relations if members have changed', () => {
        const localTags   = { foo: 'foo_local', type: 'multipolygon' };                    // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', type: 'multipolygon' };       // same foo, added bar
        const localMembers = [{ id: 'w1', role: 'outer' }, { id: 'w2', role: 'inner' }];   // same members
        const remoteMembers = [{ id: 'w1', role: 'outer' }, { id: 'w4', role: 'inner' }];  // changed inner to w4
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote, s1, s2, s3, s4, w4]);
        const action = iD.actionMergeRemoteChanges('r', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result).to.eql(localGraph);
      });

      it('merges relations if members are same and changed tags don\'t conflict', () => {
        const localTags   = { foo: 'foo_local', type: 'multipolygon' };                    // changed foo
        const remoteTags  = { foo: 'foo', bar: 'bar_remote', type: 'multipolygon' };       // same foo, added bar
        const mergedTags  = { foo: 'foo_local', bar: 'bar_remote', type: 'multipolygon' };
        const localMembers = [{ id: 'w1', role: 'outer' }, { id: 'w2', role: 'inner' }];   // same members
        const remoteMembers = [{ id: 'w1', role: 'outer' }, { id: 'w2', role: 'inner' }];  // same members
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('r', localGraph, remoteGraph, discardTags);
        const result = action(localGraph);
        expect(result.entity('r').version).to.eql('2');
        expect(result.entity('r').tags).to.eql(mergedTags);
      });
    });

    describe('#conflicts', () => {
      it('returns conflict details', () => {
        const localTags = { foo: 'foo_local' };                 // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };   // same foo, added bar
        const remoteLoc = [2, 2];                               // moved node
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags);
        action(localGraph);
        expect(action.conflicts()).not.to.be.empty;
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
        const local = base.entity('a').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('a').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags).withOption('force_local');
        const result = action(localGraph);
        expect(result.entity('a').version).to.eql('2');
        expect(result.entity('a').tags).to.eql(localTags);
        expect(result.entity('a').loc).to.eql(localLoc);
      });

      it('merges nodes with \'force_remote\' option', () => {
        const localTags = { foo: 'foo_local' };     // changed foo
        const remoteTags = { foo: 'foo_remote' };   // changed foo
        const localLoc = [2, 2];                    // moved node
        const remoteLoc = [3, 3];                   // moved node
        const local = base.entity('a').update({ tags: localTags, loc: localLoc });
        const remote = base.entity('a').update({ tags: remoteTags, loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('a', localGraph, remoteGraph, discardTags).withOption('force_remote');
        const result = action(localGraph);
        expect(result.entity('a').version).to.eql('2');
        expect(result.entity('a').tags).to.eql(remoteTags);
        expect(result.entity('a').loc).to.eql(remoteLoc);
      });
    });

    describe('ways', () => {
      it('merges ways with \'force_local\' option', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };      // changed foo
        const remoteTags  = { foo: 'foo_remote', area: 'yes' };     // changed foo
        const localNodes  = ['p1', 'r1', 'r2', 'p3', 'p4', 'p1'];   // changed p2 -> r1, r2
        const remoteNodes = ['p1', 'r3', 'r4', 'p3', 'p4', 'p1'];   // changed p2 -> r3, r4
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, r1, r2]);
        const remoteGraph = makeGraph([remote, r3, r4]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags).withOption('force_local');
        const result = action(localGraph);
        expect(result.entity('w1').version).to.eql('2');
        expect(result.entity('w1').tags).to.eql(localTags);
        expect(result.entity('w1').nodes).to.eql(localNodes);
      });

      it('merges ways with \'force_remote\' option', () => {
        const localTags   = { foo: 'foo_local', area: 'yes' };      // changed foo
        const remoteTags  = { foo: 'foo_remote', area: 'yes' };     // changed foo
        const localNodes  = ['p1', 'r1', 'r2', 'p3', 'p4', 'p1'];   // changed p2 -> r1, r2
        const remoteNodes = ['p1', 'r3', 'r4', 'p3', 'p4', 'p1'];   // changed p2 -> r3, r4
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, r1, r2]);
        const remoteGraph = makeGraph([remote, r3, r4]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags).withOption('force_remote');
        const result = action(localGraph);
        expect(result.entity('w1').version).to.eql('2');
        expect(result.entity('w1').tags).to.eql(remoteTags);
        expect(result.entity('w1').nodes).to.eql(remoteNodes);
        expect(result.hasEntity('r3')).to.eql(r3);
        expect(result.hasEntity('r4')).to.eql(r4);
      });

      it('merges way childNodes with \'force_local\' option', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('p1').update({ loc: localLoc });
        const remote = base.entity('p1').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags).withOption('force_local');
        const result = action(localGraph);
        expect(result.entity('p1').version).to.eql('2');
        expect(result.entity('p1').loc).to.eql(localLoc);
      });

      it('merges way childNodes with \'force_remote\' option', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('p1').update({ loc: localLoc });
        const remote = base.entity('p1').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags).withOption('force_remote');
        const result = action(localGraph);
        expect(result.entity('p1').version).to.eql('2');
        expect(result.entity('p1').loc).to.eql(remoteLoc);
      });

      it('keeps only important childNodes when merging', () => {
        const localNodes  = ['p1', 'r1', 'r2', 'p3', 'p4', 'p1'];  // changed p2 -> r1, r2
        const remoteNodes = ['p1', 'r3', 'r4', 'p3', 'p4', 'p1'];  // changed p2 -> r3, r4
        const localr1 = r1.update({ tags: { highway: 'traffic_signals' }});  // r1 has interesting tags
        const local = base.entity('w1').update({ nodes: localNodes });
        const remote = base.entity('w1').update({ nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, localr1, r2]);
        const remoteGraph = makeGraph([remote, r3, r4]);
        const action = iD.actionMergeRemoteChanges('w1', localGraph, remoteGraph, discardTags).withOption('force_remote');
        const result = action(localGraph);
        expect(result.entity('w1').nodes).to.eql(remoteNodes);
        expect(result.hasEntity('r1')).to.eql(localr1);
        expect(result.hasEntity('r2')).to.be.not.ok;
      });
    });

    describe('relations', () => {
      it('merges relations with \'force_local\' option', () => {
        const localTags = { foo: 'foo_local', type: 'multipolygon' };    // changed foo
        const remoteTags = { foo: 'foo_remote', type: 'multipolygon' };  // changed foo
        const localMembers = [{ id: 'w3', role: 'outer' }, { id: 'w2', role: 'inner' }];   // changed outer to w3
        const remoteMembers = [{ id: 'w1', role: 'outer' }, { id: 'w4', role: 'inner' }];  // changed inner to w4
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local, r1, r2, r3, r4, w3]);
        const remoteGraph = makeGraph([remote, s1, s2, s3, s4, w4]);
        const action = iD.actionMergeRemoteChanges('r', localGraph, remoteGraph, discardTags).withOption('force_local');
        const result = action(localGraph);
        expect(result.entity('r').version).to.eql('2');
        expect(result.entity('r').tags).to.eql(localTags);
        expect(result.entity('r').members).to.eql(localMembers);
      });

      it('merges relations with \'force_remote\' option', () => {
        const localTags = { foo: 'foo_local', type: 'multipolygon' };      // changed foo
        const remoteTags = { foo: 'foo_remote', type: 'multipolygon' };    // changed foo
        const localMembers = [{ id: 'w3', role: 'outer' }, { id: 'w2', role: 'inner' }];   // changed outer to w3
        const remoteMembers = [{ id: 'w1', role: 'outer' }, { id: 'w4', role: 'inner' }];  // changed inner to w4
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local, r1, r2, r3, r4, w3]);
        const remoteGraph = makeGraph([remote, s1, s2, s3, s4, w4]);
        const action = iD.actionMergeRemoteChanges('r', localGraph, remoteGraph, discardTags).withOption('force_remote');
        const result = action(localGraph);
        expect(result.entity('r').version).to.eql('2');
        expect(result.entity('r').tags).to.eql(remoteTags);
        expect(result.entity('r').members).to.eql(remoteMembers);
      });
    });
  });

});
