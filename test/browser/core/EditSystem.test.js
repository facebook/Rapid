describe('EditSystem', () => {
  let _editor;

  function actionNoop() {
    return (graph) => graph;
  }

  function actionAddNode(nodeID) {
    return (graph) => graph.replace(Rapid.osmNode({ id: nodeID }));
  }

  function actionTransitionNoop() {
    const action = (graph, t) => graph;
    action.transitionable = true;
    return action;
  }

  // Some tests use this to prepare the EditSystem for testing add, update, remove, differences.
  // After calling this, the history will contain:
  //   Base graph contains "n1", "n2", "n3"
  //   Edit1:  "added n-1"
  //   Edit2:  "updated n2"
  //   Edit3:  "deleted n3"
  function prepareTestHistory() {
    const node_1 = Rapid.osmNode({ id: 'n-1' });
    const node1 = Rapid.osmNode({ id: 'n1' });
    const node2 = Rapid.osmNode({ id: 'n2' });
    const node3 = Rapid.osmNode({ id: 'n3' });

    _editor.merge([node1, node2, node3]);   // merge base entities

    _editor.perform(Rapid.actionAddEntity(node_1));
    _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });

    _editor.perform(Rapid.actionChangeTags('n2', { natural: 'tree' } ));
    _editor.commit({ annotation: 'updated n2', selectedIDs: ['n2'] });

    _editor.perform(Rapid.actionDeleteNode('n3'));
    _editor.commit({ annotation: 'deleted n3', selectedIDs: [] });
  }


  class MockSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    on()          { return this; }
    pause()       { }
    resume()      { }
  }

  class MockImagerySystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    imageryUsed() { return ''; }
  }

  class MockPhotoSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    photosUsed()  { return ''; }
  }

  class MockStorageSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    getItem()     { return ''; }
    hasItem()     { return false; }
    setItem()     { }
  }

  class MockContext {
    constructor()   {
      this.viewport = new Rapid.sdk.Viewport();
      this.systems = {
        imagery:  new MockImagerySystem(),
        map:      new MockSystem(),
        photos:   new MockPhotoSystem(),
        rapid:    new MockSystem(),
        storage:  new MockStorageSystem()
      };
      this.services = {};
    }
    selectedIDs() { return []; }
    scene()       { return { layers: new Map() }; }
  }

  const context = new MockContext();

  beforeEach(() => {
    _editor = new Rapid.EditSystem(context);
    return _editor.initAsync();
  });


  describe('#resetAsync', () => {
    it('clears the history stack', () => {
      _editor.commit({ annotation: 'one' });
      _editor.commit({ annotation: 'two' });
      _editor.undo();

      return _editor.resetAsync()
        .then(() => {
          expect(_editor._history).to.be.an.instanceOf(Array).with.lengthOf(1);
          expect(_editor._index).to.eql(0);
        });
    });

    it('emits events', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      const onHistoryJump = sinon.spy();
      const onBackupStatusChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);
      _editor.on('historyjump', onHistoryJump);
      _editor.on('backupstatuschange', onBackupStatusChange);

      return _editor.resetAsync()
        .then(() => {
          expect(onStagingChange.calledOnceWithExactly(_editor._fullDifference)).to.be.ok;
          expect(onStableChange.calledOnceWithExactly(_editor._fullDifference)).to.be.ok;
          expect(onHistoryJump.calledOnceWithExactly(0, 0)).to.be.ok;
          expect(onBackupStatusChange.calledOnceWithExactly(true)).to.be.ok;
        });
    });
  });


  describe('#base', () => {
    it('returns the base edit', () => {
      expect(_editor.base).to.be.an.instanceOf(Rapid.Edit);
      expect(_editor.base).to.equal(_editor._history[0]);
    });
  });

  describe('#stable', () => {
    it('returns the stable edit', () => {
      _editor.commit({ annotation: 'one' });
      expect(_editor.stable).to.be.an.instanceOf(Rapid.Edit);
      expect(_editor.stable).to.equal(_editor._history[1]);
    });
  });

  describe('#staging', () => {
    it('returns the staging edit', () => {
      _editor.commit({ annotation: 'one' });
      expect(_editor.staging).to.be.an.instanceOf(Rapid.Edit);
      expect(_editor.staging).to.not.equal(_editor.stable);
      expect(_editor.staging).to.not.equal(_editor.base);
    });
  });

  describe('#history', () => {
    it('returns the history', () => {
      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(1);
    });
  });

  describe('#index', () => {
    it('returns the index', () => {
      expect(_editor.index).to.eql(0);
    });
  });

  describe('#hasWorkInProgress', () => {
    it('returns true when work has been performed on the staging edit', () => {
      expect(_editor.hasWorkInProgress).to.be.false;
      _editor.perform(actionNoop());
      expect(_editor.hasWorkInProgress).to.be.true;
    });
  });


  describe('#merge', () => {
    it('merges the entities into all graph versions', () => {
      const n = Rapid.osmNode({ id: 'n1' });
      _editor.merge([n]);
      expect(_editor.base.graph.entity('n1')).to.equal(n);
      expect(_editor.stable.graph.entity('n1')).to.equal(n);
      expect(_editor.staging.graph.entity('n1')).to.equal(n);
    });

    it('emits a merge event with the new entities', () => {
      const n = Rapid.osmNode({ id: 'n1' });
      const onMerge = sinon.spy();
      _editor.on('merge', onMerge);
      _editor.merge([n]);
      expect(onMerge.calledOnceWith(new Set([n.id]))).to.be.ok;
    });
  });


  describe('#perform', () => {
    it('returns a Difference', () => {
      const diff = _editor.perform(actionNoop());
      expect(diff).to.be.an.instanceOf(Rapid.Difference);
      expect(diff.changes).to.be.an.instanceOf(Map).that.is.empty;
    });

    it('returns an empty Difference when passed no args', () => {
      const diff = _editor.perform();
      expect(diff).to.be.an.instanceOf(Rapid.Difference);
      expect(diff.changes).to.be.an.instanceOf(Map).that.is.empty;
    });

    it('updates the staging graph only', () => {
      const staging = _editor.staging.graph;
      const stable = _editor.stable.graph;

      _editor.perform(actionAddNode('n-1'));
      expect(_editor.base.graph.hasEntity('n-1')).to.be.not.ok;
      expect(_editor.stable.graph.hasEntity('n-1')).to.be.not.ok;
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.staging.graph).to.not.equal(staging);  // new staging
      expect(_editor.stable.graph).to.equal(stable);        // same stable
    });

    it('emits an stagingchange event only', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      const action = actionNoop();
      const difference = _editor.perform(action);
      expect(onStagingChange.calledOnceWithExactly(difference)).to.be.ok;
      expect(onStableChange.notCalled).to.be.ok;
    });

    it('performs multiple actions, emits a single stagingchange event', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      const action1 = actionAddNode('n-1');
      const action2 = actionAddNode('n-2');
      const difference = _editor.perform(action1, action2);
      expect(onStagingChange.calledOnceWithExactly(difference)).to.be.ok;
      expect(onStableChange.notCalled).to.be.ok;
    });
  });


  describe('#performAsync', () => {
    it('returns a rejected Promise when passed no args', () => {
      const prom = _editor.performAsync();
      expect(prom).to.be.an.instanceOf(Promise);
      return prom.then(
        () => {
          expect.fail('Promise was fulfilled but should have been rejected');
        },
        () => {
          expect(true).to.be.true;
        }
      );
    });

    it('returns a resolved Promise when passed a non-transitionable action', () => {
      const action = actionAddNode('n-1');
      const prom = _editor.performAsync(action);
      expect(prom).to.be.an.instanceOf(Promise);
      return prom.then(
        () => {
          expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
        },
        () => {
          expect.fail('Promise was rejected but should have been fulfilled');
        }
      );
    });

    it('returns a Promise to perform transitionable action, emits stagingchange events only', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      const action = actionTransitionNoop();
      const prom = _editor.performAsync(action);
      expect(prom).to.be.an.instanceOf(Promise);
      return prom.then(
        () => {
          expect(onStagingChange.callCount).to.be.above(2);
          expect(onStableChange.notCalled).to.be.ok;
        },
        () => {
          expect.fail('Promise was rejected but should have been fulfilled');
        }
      );
    });
  });


  describe('#revert', () => {
    it('replaces staging with a fresh copy of stable', () => {
      _editor.perform(actionAddNode('n-1'));
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.hasWorkInProgress).to.be.true;

      const staging = _editor.staging;
      const stable = _editor.stable;

      _editor.revert();
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.not.ok;
      expect(_editor.hasWorkInProgress).to.be.false;
      expect(_editor.staging).to.not.equal(staging);  // new staging
      expect(_editor.stable).to.equal(stable);        // same stable
    });

    it('emits stagingchange and stablechange events', () => {
      _editor.perform(actionAddNode('n-1'));

      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      _editor.revert();
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(0);
    });

    it('does nothing if no work in progress', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      const staging = _editor.staging;
      const stable = _editor.stable;

      _editor.revert();
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);
      expect(_editor.staging).to.equal(staging);   // same staging
      expect(_editor.stable).to.equal(stable);     // same stable
    });
  });


  describe('#commit', () => {
    it('commit work in progress to history', () => {
      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(1);
      expect(_editor.index).to.eql(0);
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.not.ok;
      expect(_editor.staging.graph.hasEntity('n-2')).to.be.not.ok;

      _editor.perform(actionAddNode('n-1'));
      _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });

      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(2);
      expect(_editor.index).to.eql(1);
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.staging.graph.hasEntity('n-2')).to.be.not.ok;

      _editor.perform(actionAddNode('n-2'));
      _editor.commit({ annotation: 'added a node', selectedIDs: ['n-2'] });

      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(3);
      expect(_editor.index).to.eql(2);
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.staging.graph.hasEntity('n-2')).to.be.ok;
    });

    it('emits stagingchange and stablechange events', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });
      expect(onStagingChange.callCount).to.eql(2);
      expect(onStableChange.callCount).to.eql(1);

      _editor.perform(actionAddNode('n-2'));
      expect(onStagingChange.callCount).to.eql(3);
      expect(onStableChange.callCount).to.eql(1);

      _editor.commit({ annotation: 'added a node', selectedIDs: ['n-2'] });
      expect(onStagingChange.callCount).to.eql(4);
      expect(onStableChange.callCount).to.eql(2);
    });
  });


  describe('#commitAppend', () => {
    it('throws if you try to commitAppend to the base edit', () => {
      _editor.perform(actionAddNode('n-1'));
      const fn = () => _editor.commitAppend('added a node');
      expect(fn).to.throw();
    });

    it('commitAppend work in progress to history', () => {
      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(1);
      expect(_editor.index).to.eql(0);
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.not.ok;
      expect(_editor.staging.graph.hasEntity('n-2')).to.be.not.ok;

      _editor.perform(actionAddNode('n-1'));
      _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });

      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(2);
      expect(_editor.index).to.eql(1);
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.staging.graph.hasEntity('n-2')).to.be.not.ok;

      _editor.perform(actionAddNode('n-2'));
      _editor.commitAppend({ annotation: 'added a node', selectedIDs: ['n-2'] });  // commitAppend

      expect(_editor.history).to.be.an.instanceOf(Array).with.lengthOf(2);         // still 2
      expect(_editor.index).to.eql(1);                                             // still 1
      expect(_editor.staging.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.staging.graph.hasEntity('n-2')).to.be.ok;
    });

    it('emits stagingchange and stablechange events', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });
      expect(onStagingChange.callCount).to.eql(2);
      expect(onStableChange.callCount).to.eql(1);

      _editor.perform(actionAddNode('n-2'));
      expect(onStagingChange.callCount).to.eql(3);
      expect(onStableChange.callCount).to.eql(1);

      _editor.commitAppend({ annotation: 'added a node', selectedIDs: ['n-2'] });  // commitAppend
      expect(onStagingChange.callCount).to.eql(4);
      expect(onStableChange.callCount).to.eql(2);
    });
  });


  describe('#undo / #redo', () => {
    it('can undo and redo edits', () => {
      _editor.perform(actionAddNode('n-1'));
      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      _editor.perform(actionAddNode('n-2'));
      _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
      _editor.perform(actionAddNode('n-3'));
      _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });

      expect(_editor.getUndoAnnotation()).to.eql('added n-3');
      expect(_editor.getRedoAnnotation()).to.be.undefined;
      expect(_editor.stable.graph.hasEntity('n-3')).to.be.ok;

      _editor.undo();

      expect(_editor.getUndoAnnotation()).to.eql('added n-2');
      expect(_editor.getRedoAnnotation()).to.eql('added n-3');
      expect(_editor.stable.graph.hasEntity('n-3')).to.be.not.ok;

      _editor.redo();

      expect(_editor.getUndoAnnotation()).to.eql('added n-3');
      expect(_editor.getRedoAnnotation()).to.be.undefined;
      expect(_editor.stable.graph.hasEntity('n-3')).to.be.ok;
    });

    it('emits stagingchange, stablechange, and historyjump events', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      const onHistoryJump = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);
      _editor.on('historyjump', onHistoryJump);

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(0);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      expect(onStagingChange.callCount).to.eql(2);
      expect(onStableChange.callCount).to.eql(1);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.perform(actionAddNode('n-2'));
      expect(onStagingChange.callCount).to.eql(3);
      expect(onStableChange.callCount).to.eql(1);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
      expect(onStagingChange.callCount).to.eql(4);
      expect(onStableChange.callCount).to.eql(2);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.perform(actionAddNode('n-3'));
      expect(onStagingChange.callCount).to.eql(5);
      expect(onStableChange.callCount).to.eql(2);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });
      expect(onStagingChange.callCount).to.eql(6);
      expect(onStableChange.callCount).to.eql(3);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.undo();
      expect(onStagingChange.callCount).to.eql(7);
      expect(onStableChange.callCount).to.eql(4);
      expect(onHistoryJump.callCount).to.eql(1);

      _editor.redo();
      expect(onStagingChange.callCount).to.eql(8);
      expect(onStableChange.callCount).to.eql(5);
      expect(onHistoryJump.callCount).to.eql(2);
    });

    it('does nothing if nothing to undo', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      const onHistoryJump = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);
      _editor.on('historyjump', onHistoryJump);

      _editor.undo();
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);
      expect(onHistoryJump.callCount).to.eql(0);
    });

    it('does nothing if nothing to redo', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      const onHistoryJump = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);
      _editor.on('historyjump', onHistoryJump);

      _editor.redo();
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);
      expect(onHistoryJump.callCount).to.eql(0);
    });
  });


  describe('#setCheckpoint / #restoreCheckpoint', () => {
    it('can set and restore checkpoints', () => {
      _editor.perform(actionAddNode('n-1'));
      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });

      _editor.setCheckpoint('checkpoint');

      _editor.perform(actionAddNode('n-2'));
      _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
      _editor.perform(actionAddNode('n-3'));
      _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });

      _editor.restoreCheckpoint('checkpoint');

      expect(_editor.getUndoAnnotation()).to.eql('added n-1');
      expect(_editor.getRedoAnnotation()).to.be.undefined;
      expect(_editor.stable.graph.hasEntity('n-1')).to.be.ok;
      expect(_editor.stable.graph.hasEntity('n-2')).to.be.not.ok;
      expect(_editor.stable.graph.hasEntity('n-3')).to.be.not.ok;
    });

    it('emits stagingchange, stablechange, and historyjump events', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      const onHistoryJump = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);
      _editor.on('historyjump', onHistoryJump);

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(0);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      _editor.setCheckpoint('checkpoint');
      expect(onStagingChange.callCount).to.eql(2);
      expect(onStableChange.callCount).to.eql(1);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.perform(actionAddNode('n-2'));
      expect(onStagingChange.callCount).to.eql(3);
      expect(onStableChange.callCount).to.eql(1);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
      expect(onStagingChange.callCount).to.eql(4);
      expect(onStableChange.callCount).to.eql(2);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.perform(actionAddNode('n-3'));
      expect(onStagingChange.callCount).to.eql(5);
      expect(onStableChange.callCount).to.eql(2);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });
      expect(onStagingChange.callCount).to.eql(6);
      expect(onStableChange.callCount).to.eql(3);
      expect(onHistoryJump.callCount).to.eql(0);

      _editor.restoreCheckpoint('checkpoint');
      expect(onStagingChange.callCount).to.eql(7);
      expect(onStableChange.callCount).to.eql(4);
      expect(onHistoryJump.callCount).to.eql(1);
    });

    it('does nothing if checkpointID is missing or invalid', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      const onHistoryJump = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);
      _editor.on('historyjump', onHistoryJump);

      _editor.restoreCheckpoint();
      _editor.restoreCheckpoint('fake');
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);
      expect(onHistoryJump.callCount).to.eql(0);
    });
  });


  describe('#beginTransaction / #endTransaction', () => {
    it('prevents change events from getting dispatched in a transaction', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      _editor.beginTransaction();

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.perform(actionAddNode('n-2'));
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.endTransaction();   // events emit here
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(1);

      // diff should contain all things changed during the transaction
      const diff = onStagingChange.lastCall.firstArg;
      expect(diff).to.be.an.instanceOf(Rapid.Difference);
      expect(diff.changes).to.be.an.instanceOf(Map).that.has.all.keys(['n-1', 'n-2']);
    });

    it('does nothing if endTransaction called without beginTransaction', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      _editor.endTransaction();

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      expect(onStagingChange.callCount).to.eql(2);
      expect(onStableChange.callCount).to.eql(1);
    });

    it('uses earliest difference if beginTransaction called multiple times', () => {
      const onStagingChange = sinon.spy();
      const onStableChange = sinon.spy();
      _editor.on('stagingchange', onStagingChange);
      _editor.on('stablechange', onStableChange);

      _editor.beginTransaction();

      _editor.perform(actionAddNode('n-1'));
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      // This beginTransaction has no effect - we are already in a transaction
      _editor.beginTransaction();

      _editor.perform(actionAddNode('n-2'));
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
      expect(onStagingChange.callCount).to.eql(0);
      expect(onStableChange.callCount).to.eql(0);

      _editor.endTransaction();   // events emit here
      expect(onStagingChange.callCount).to.eql(1);
      expect(onStableChange.callCount).to.eql(1);

      // diff should contain all things changed during the transaction
      const diff = onStagingChange.lastCall.firstArg;
      expect(diff).to.be.an.instanceOf(Rapid.Difference);
      expect(diff.changes).to.be.an.instanceOf(Map).that.has.all.keys(['n-1', 'n-2']);
    });
  });


  describe('#difference / #hasChanges / #changes', () => {
    it('returns the difference between base -> stable', () => {
      prepareTestHistory();

      expect(_editor.hasChanges()).to.be.true;

      const diff = _editor.difference();
      expect(diff).to.be.an.instanceOf(Rapid.Difference);
      expect(diff.changes).to.be.an.instanceOf(Map).that.has.all.keys(['n-1', 'n2', 'n3']);

      const detail = _editor.changes();
      expect(detail).to.be.an.instanceOf(Object).that.has.all.keys(['created', 'modified', 'deleted']);

      const stable = _editor.stable.graph;
      const base = _editor.base.graph;
      expect(detail.created).to.eql([ stable.entity('n-1') ]);
      expect(detail.modified).to.eql([ stable.entity('n2') ]);
      expect(detail.deleted).to.eql([ base.entity('n3') ]);
    });
  });


  describe('#toJSON', () => {
    it('doesn\'t generate unsaveable changes', () => {
      _editor.perform(actionAddNode('n-1'));
      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
      _editor.perform(Rapid.actionDeleteNode('n-1'));
      _editor.commit({ annotation: 'deleted n-1', selectedIDs: [] });

      expect(_editor.toJSON()).to.be.undefined;
    });

    it('generates v3 JSON', () => {
      prepareTestHistory();

      const node_1_json = { id: 'n-1' };  // without `visible: true`
      const node1_json = { id: 'n1' };
      const node2_json = { id: 'n2' };
      const node3_json = { id: 'n3' };
      const node2upd = _editor.stable.graph.entity('n2');
      const node2upd_json = { id: 'n2', tags: { natural: 'tree' }, v: node2upd.v };

      const json = JSON.parse(_editor.toJSON());
      expect(json.version).to.eql(3);

      // base entities - before all edits
      expect(json.baseEntities).to.not.include(node_1_json);    // n-1 was not in the base
      expect(json.baseEntities).to.not.include(node1_json);     // n1 was never edited
      expect(json.baseEntities).to.deep.include(node2_json);    // n2 is in base and was edited
      expect(json.baseEntities).to.deep.include(node3_json);    // n3 is in base and was edited
      expect(json.baseEntities).to.not.include(node2upd_json);

      // edited entities
      expect(json.entities).to.deep.include(node_1_json);     // n-1 was added
      expect(json.entities).to.deep.include(node2upd_json);   // n2 was updated
      expect(json.entities).to.not.include(node1_json);       // n1 was never updated
      expect(json.entities).to.not.include(node2_json);       // n2 is in the base, not here
      expect(json.entities).to.not.include(node3_json);       // n3 is now deleted
    });
  });


  describe('#fromJSONAsync', () => {
    it('restores from v3 JSON (creation)', () => {
      const json = {
        version: 3,
        entities: [{ loc: [1, 2], id: 'n-1' }],
        baseEntities: [],
        stack: [
          { },
          { modified: ['n-1v0'], imageryUsed: ['Bing'], annotation: 'Added a point.' }
        ],
        nextIDs: { node: -2, way: -1, relation: -1 },
        index: 1
      };
      return _editor.fromJSONAsync(JSON.stringify(json))
        .then(() => {
          expect(_editor.staging.graph.entity('n-1')).to.eql(Rapid.osmNode({id: 'n-1', loc: [1, 2]}));
          expect(_editor.getUndoAnnotation()).to.eql('Added a point.');
          expect(_editor.sourcesUsed().imagery).to.include('Bing');
          expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
          expect(_editor.difference().created().length).to.eql(1);
        });
    });

    it('restores from v3 JSON (modification)', () => {
      const json = {
        version: 3,
        entities: [{ loc: [2, 3], id: 'n1', v: 1 }],
        baseEntities: [{ loc: [1, 2], id: 'n1' }],
        stack: [
          { },
          { modified: ['n1v1'], imageryUsed: ['Bing'], annotation: 'Moved a point.' }
        ],
        nextIDs: { node: -2, way: -1, relation: -1 },
        index: 1
      };
      return _editor.fromJSONAsync(JSON.stringify(json))
        .then(() => {
          expect(_editor.staging.graph.entity('n1')).to.eql(Rapid.osmNode({ id: 'n1', loc: [2, 3], v: 1 }));
          expect(_editor.getUndoAnnotation()).to.eql('Moved a point.');
          expect(_editor.sourcesUsed().imagery).to.include('Bing');
          expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
          expect(_editor.difference().modified().length).to.eql(1);
        });
    });

    it('restores from v3 JSON (deletion)', () => {
      const json = {
        version: 3,
        entities: [],
        baseEntities: [{ loc: [1, 2], id: 'n1' }],
        stack: [
          { },
          { deleted: ['n1'], imageryUsed: ['Bing'], annotation: 'Deleted a point.' }
        ],
        nextIDs: { node: -1, way: -2, relation: -3 },
        index: 1
      };
      return _editor.fromJSONAsync(JSON.stringify(json))
        .then(() => {
          expect(_editor.staging.graph.hasEntity('n1')).to.be.undefined;
          expect(_editor.getUndoAnnotation()).to.eql('Deleted a point.');
          expect(_editor.sourcesUsed().imagery).to.include('Bing');
          expect(Rapid.osmEntity.id.next).to.eql({ node: -1, way: -2, relation: -3 });
          expect(_editor.difference().deleted().length).to.eql(1);
        });
    });
  });
});
