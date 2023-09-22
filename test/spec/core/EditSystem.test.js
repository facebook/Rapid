describe('EditSystem', () => {
  let _editor, spy;

  const actionNoop = function() {
    return (graph) => graph;
  };
  const actionAddNode = function (nodeID) {
    return (graph) => graph.replace(Rapid.osmNode({ id: nodeID }));
  };


  class MockSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    on()          { return this; }
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
      this.projection = new sdk.Projection();
      this.systems = {
        imagery:  new MockImagerySystem(),
        map:      new MockSystem(),
        photos:   new MockPhotoSystem(),
        rapid:    new MockSystem(),
        storage:  new MockStorageSystem()
      };
    }
    selectedIDs() { return []; }
    scene()       { return { layers: new Map() }; }
  }

  const context = new MockContext();


  beforeEach(() => {
    spy = sinon.spy();
    _editor = new Rapid.EditSystem(context);
    return _editor.initAsync();
  });


  describe('#reset', () => {
    it('clears the version stack', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.perform(actionNoop(), 'annotation1');
      _editor.undo();
      _editor.reset();
      expect(_editor.undoAnnotation()).to.be.undefined;
      expect(_editor.redoAnnotation()).to.be.undefined;
    });
  });


  describe('#current', () => {
    it('returns the current edit', () => {
      expect(_editor.current.graph).to.be.an.instanceOf(Rapid.Graph);
    });
  });

  describe('#base', () => {
    it('returns the base edit', () => {
      expect(_editor.current.graph).to.be.an.instanceOf(Rapid.Graph);
    });
  });


  describe('#merge', () => {
    it('merges the entities into all graph versions', () => {
      const n = Rapid.osmNode({id: 'n'});
      _editor.merge([n]);
      expect(_editor.current.graph.entity('n')).to.equal(n);
    });

    it('emits a merge event with the new entities', () => {
      const n = Rapid.osmNode({id: 'n'});
      _editor.on('merge', spy);
      _editor.merge([n]);
      expect(spy).to.have.been.calledWith(new Set([n.id]));
    });
  });


  describe('#perform', () => {
    it('returns a difference', () => {
      expect(_editor.perform(actionNoop()).changes).to.be.empty;
    });

    it('updates the graph', () => {
      const node = Rapid.osmNode();
      _editor.perform(graph => { return graph.replace(node); });
      expect(_editor.current.graph.entity(node.id)).to.equal(node);
    });

    it('pushes an undo annotation', () => {
      _editor.perform(actionNoop(), 'annotation1');
      expect(_editor.undoAnnotation()).to.equal('annotation1');
    });

    it('emits a change event', () => {
      _editor.on('change', spy);
      const difference = _editor.perform(actionNoop());
      expect(spy).to.have.been.calledWith(difference);
      expect(spy.callCount).to.eql(1);
    });

    it('performs multiple actions', () => {
      const action1 = sinon.stub().returns(new Rapid.Graph());
      const action2 = sinon.stub().returns(new Rapid.Graph());
      _editor.perform(action1, action2, 'annotation1');
      expect(action1).to.have.been.called;
      expect(action2).to.have.been.called;
      expect(_editor.undoAnnotation()).to.equal('annotation1');
    });

    it('performs transitionable actions in a transition', done => {
      const action1 = () => { return new Rapid.Graph(); };
      action1.transitionable = true;
      _editor.on('change', spy);
      _editor.perform(action1);
      window.setTimeout(() => {
        expect(spy.callCount).to.be.above(2);
        done();
      }, 300);
    });
  });


  describe('#replace', () => {
    it('returns a difference', () => {
      expect(_editor.replace(actionNoop()).changes).to.be.empty;
    });

    it('updates the graph', () => {
      const node = Rapid.osmNode();
      const action = (graph) => graph.replace(node);
      _editor.replace(action);
      expect(_editor.current.graph.entity(node.id)).to.equal(node);
    });

    it('replaces the undo annotation', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.replace(actionNoop(), 'annotation2');
      expect(_editor.undoAnnotation()).to.equal('annotation2');
    });

    it('emits a change event', () => {
      _editor.on('change', spy);
      const difference = _editor.replace(actionNoop());
      expect(spy).to.have.been.calledWith(difference);
    });

    it('performs multiple actions', () => {
      const action1 = sinon.stub().returns(new Rapid.Graph());
      const action2 = sinon.stub().returns(new Rapid.Graph());
      _editor.replace(action1, action2, 'annotation1');
      expect(action1).to.have.been.called;
      expect(action2).to.have.been.called;
      expect(_editor.undoAnnotation()).to.equal('annotation1');
    });
  });


  describe('#pop', () => {
    it('returns a difference', () => {
      _editor.perform(actionNoop(), 'annotation1');
      expect(_editor.pop().changes).to.be.empty;
    });

    it('updates the graph', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.pop();
      expect(_editor.undoAnnotation()).to.be.undefined;
    });

    it('does not push the redo stack', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.pop();
      expect(_editor.redoAnnotation()).to.be.undefined;
    });

    it('emits a change event', () => {
      _editor.perform(actionNoop());
      _editor.on('change', spy);
      const difference = _editor.pop();
      expect(spy).to.have.been.calledWith(difference);
    });

    it('pops n times', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.perform(actionNoop(), 'annotation2');
      _editor.perform(actionNoop(), 'annotation3');
      _editor.pop(2);
      expect(_editor.undoAnnotation()).to.equal('annotation1');
    });

    it('pops 0 times', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.perform(actionNoop(), 'annotation2');
      _editor.perform(actionNoop(), 'annotation3');
      _editor.pop(0);
      expect(_editor.undoAnnotation()).to.equal('annotation3');
    });

    it('pops 1 time if argument is invalid', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.perform(actionNoop(), 'annotation2');
      _editor.perform(actionNoop(), 'annotation3');
      _editor.pop('foo');
      expect(_editor.undoAnnotation()).to.equal('annotation2');
      _editor.pop(-1);
      expect(_editor.undoAnnotation()).to.equal('annotation1');
    });
  });


  describe('#overwrite', () => {
    it('returns a difference', () => {
      _editor.perform(actionNoop(), 'annotation1');
      expect(_editor.overwrite(actionNoop()).changes).to.be.empty;
    });

    it('updates the graph', () => {
      _editor.perform(actionNoop(), 'annotation1');
      const node = Rapid.osmNode();
      _editor.overwrite(graph => { return graph.replace(node); });
      expect(_editor.current.graph.entity(node.id)).to.equal(node);
    });

    it('replaces the undo annotation', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.overwrite(actionNoop(), 'annotation2');
      expect(_editor.undoAnnotation()).to.equal('annotation2');
    });

    it('does not push the redo stack', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.overwrite(actionNoop(), 'annotation2');
      expect(_editor.redoAnnotation()).to.be.undefined;
    });

    it('emits a change event', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.on('change', spy);
      const difference = _editor.overwrite(actionNoop(), 'annotation2');
      expect(spy).to.have.been.calledWith(difference);
    });

    it('performs multiple actions', () => {
      const action1 = sinon.stub().returns(new Rapid.Graph());
      const action2 = sinon.stub().returns(new Rapid.Graph());
      _editor.perform(actionNoop(), 'annotation1');
      _editor.overwrite(action1, action2, 'annotation2');
      expect(action1).to.have.been.called;
      expect(action2).to.have.been.called;
      expect(_editor.undoAnnotation()).to.equal('annotation2');
    });
  });


  describe('#undo', () => {
    it('returns a difference', () => {
      expect(_editor.undo().changes).to.be.empty;
    });

    it('pops the undo stack', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.undo();
      expect(_editor.undoAnnotation()).to.be.undefined;
    });

    it('pushes the redo stack', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.undo();
      expect(_editor.redoAnnotation()).to.equal('annotation1');
    });

    it('emits an undone event', () => {
      _editor.perform(actionNoop());
      _editor.on('undone', spy);
      _editor.undo();
      expect(spy).to.have.been.called;
    });

    it('emits a change event', () => {
      _editor.perform(actionNoop());
      _editor.on('change', spy);
      const difference = _editor.undo();
      expect(spy).to.have.been.calledWith(difference);
    });
  });

  describe('#redo', () => {
    it('returns a difference', () => {
      expect(_editor.redo().changes).to.be.empty;
    });

    it('does redo into an annotated state', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.on('redone', spy);
      _editor.undo();
      _editor.redo();
      expect(_editor.undoAnnotation()).to.equal('annotation1');
      expect(spy).to.have.been.called;
    });

    it('does not redo into a non-annotated state', () => {
      _editor.perform(actionNoop());
      _editor.on('redone', spy);
      _editor.undo();
      _editor.redo();
      expect(spy).not.to.have.been.called;
    });

    it('emits a change event', () => {
      _editor.perform(actionNoop());
      _editor.undo();
      _editor.on('change', spy);
      const difference = _editor.redo();
      expect(spy).to.have.been.calledWith(difference);
    });
  });


  describe('#beginTransaction / #endTransaction', () => {
    it('prevents change events from getting dispatched', () => {
      _editor.perform(actionNoop(), 'base');
      _editor.on('change', spy);

      _editor.beginTransaction();

      _editor.perform(actionNoop(), 'perform');
      expect(spy).to.have.not.been.called;
      _editor.replace(actionNoop(), 'replace');
      expect(spy).to.have.not.been.called;
      _editor.overwrite(actionNoop(), 'replace');
      expect(spy).to.have.not.been.called;
      _editor.undo();
      expect(spy).to.have.not.been.called;
      _editor.redo();
      expect(spy).to.have.not.been.called;
      _editor.pop();
      expect(spy).to.have.not.been.called;

      const diff = _editor.endTransaction();
      expect(spy).to.have.been.calledOnceWith(diff);
    });

    it('does nothing if resume called before pause', () => {
      _editor.perform(actionNoop(), 'base');
      _editor.on('change', spy);

      _editor.endTransaction();
      expect(spy).to.have.not.been.called;
    });

    it('uses earliest difference if pause called multiple times', () => {
      _editor.perform(actionNoop(), 'base');
      _editor.on('change', spy);

      _editor.beginTransaction();
      _editor.perform(actionAddNode('a'), 'perform');

      _editor.beginTransaction();
      _editor.perform(actionAddNode('b'), 'perform');

      const diff = _editor.endTransaction();
      expect(spy).to.have.been.calledOnceWith(diff);
      expect(diff.changes).to.have.all.keys('a', 'b');
    });
  });


  describe('#changes', () => {
    it('includes created entities', () => {
      const node = Rapid.osmNode();
      _editor.perform(graph => { return graph.replace(node); });
      expect(_editor.changes().created).to.eql([node]);
    });

    it('includes modified entities', () => {
      const node1 = Rapid.osmNode({id: 'n1'});
      const node2 = node1.update({ tags: { yes: 'no' } });
      _editor.merge([node1]);
      _editor.perform(graph => { return graph.replace(node2); });
      expect(_editor.changes().modified).to.eql([node2]);
    });

    it('includes deleted entities', () => {
      const node = Rapid.osmNode({id: 'n1'});
      _editor.merge([node]);
      _editor.perform(graph => { return graph.remove(node); });
      expect(_editor.changes().deleted).to.eql([node]);
    });
  });


  describe('#hasChanges', () => {
    it('is true when any of change\'s values are nonempty', () => {
      const node = Rapid.osmNode();
      _editor.perform(graph => { return graph.replace(node); });
      expect(_editor.hasChanges()).to.eql(true);
    });

    it('is false when all of change\'s values are empty', () => {
      expect(_editor.hasChanges()).to.eql(false);
    });
  });


  describe('checkpoints', () => {
    it('saves and resets to checkpoints', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.perform(actionNoop(), 'annotation2');
      _editor.perform(actionNoop(), 'annotation3');
      _editor.setCheckpoint('check1');
      _editor.perform(actionNoop(), 'annotation4');
      _editor.perform(actionNoop(), 'annotation5');
      _editor.setCheckpoint('check2');
      _editor.perform(actionNoop(), 'annotation6');
      _editor.perform(actionNoop(), 'annotation7');
      _editor.perform(actionNoop(), 'annotation8');

      _editor.resetToCheckpoint('check1');
      expect(_editor.undoAnnotation()).to.equal('annotation3');

      _editor.resetToCheckpoint('check2');
      expect(_editor.undoAnnotation()).to.equal('annotation5');

      _editor.resetToCheckpoint('check1');
      expect(_editor.undoAnnotation()).to.equal('annotation3');
    });

    it('emits a change event', () => {
      _editor.perform(actionNoop(), 'annotation1');
      _editor.setCheckpoint('check1');
      _editor.perform(actionNoop(), 'annotation2');

      _editor.on('change', spy);
      _editor.resetToCheckpoint('check1');
      expect(spy).to.have.been.called;
    });
  });


  describe('#toJSON', () => {
    it('doesn\'t generate unsaveable changes', () => {
      _editor.perform(actionAddNode('n-1'));
      _editor.perform(Rapid.actionDeleteNode('n-1'));
      expect(_editor.toJSON()).to.be.not.ok;
    });

    it('generates v3 JSON', () => {
      const node_1 = Rapid.osmNode({ id: 'n-1' });
      const node1 = Rapid.osmNode({ id: 'n1' });
      const node2 = Rapid.osmNode({ id: 'n2' });
      const node3 = Rapid.osmNode({ id: 'n3' });

      const node_1_json = { id: 'n-1' };  // without `visible: true`
      const node1_json = { id: 'n1' };
      const node2_json = { id: 'n2' };
      const node3_json = { id: 'n3' };

      _editor.merge([node1, node2, node3]);                     // merge base entities
      _editor.perform(Rapid.actionAddEntity(node_1));           // add n-1
      _editor.perform(Rapid.actionChangeTags('n2', {k: 'v'}));  // update n2
      const node2upd = _editor.current.graph.entity('n2');
      const node2upd_json = { id: 'n2', tags: { k: 'v'}, v: node2upd.v };
      _editor.perform(Rapid.actionDeleteNode('n3'));            // delete n3

      const json = JSON.parse(_editor.toJSON());
      expect(json.version).to.eql(3);

      expect(json.entities).to.deep.include(node_1_json);     // n-1 was added
      expect(json.entities).to.deep.include(node2upd_json);   // n2 was updated
      expect(json.entities).to.not.include(node1_json);       // n1 was never updated
      expect(json.entities).to.not.include(node2_json);       // n2?
      expect(json.entities).to.not.include(node3_json);       // n3 is now deleted

      // base entities - before all edits
      expect(json.baseEntities).to.not.include(node_1_json);
      expect(json.baseEntities).to.not.include(node1_json);     // n1 was never updated
      expect(json.baseEntities).to.deep.include(node2_json);    // n2 is in base
      expect(json.baseEntities).to.deep.include(node3_json);    // n3 is in base
      expect(json.baseEntities).to.not.include(node2upd_json);
    });
  });


  describe('#fromJSON', () => {
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
      _editor.fromJSON(JSON.stringify(json));
      expect(_editor.current.graph.entity('n-1')).to.eql(Rapid.osmNode({id: 'n-1', loc: [1, 2]}));
      expect(_editor.undoAnnotation()).to.eql('Added a point.');
      expect(_editor.sourcesUsed().imagery).to.include('Bing');
      expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
      expect(_editor.difference().created().length).to.eql(1);
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
      _editor.fromJSON(JSON.stringify(json));
      expect(_editor.current.graph.entity('n1')).to.eql(Rapid.osmNode({ id: 'n1', loc: [2, 3], v: 1 }));
      expect(_editor.undoAnnotation()).to.eql('Moved a point.');
      expect(_editor.sourcesUsed().imagery).to.include('Bing');
      expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
      expect(_editor.difference().modified().length).to.eql(1);
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
      _editor.fromJSON(JSON.stringify(json));
      expect(_editor.current.graph.hasEntity('n1')).to.be.undefined;
      expect(_editor.undoAnnotation()).to.eql('Deleted a point.');
      expect(_editor.sourcesUsed().imagery).to.include('Bing');
      expect(Rapid.osmEntity.id.next).to.eql({ node: -1, way: -2, relation: -3 });
      expect(_editor.difference().deleted().length).to.eql(1);
    });
  });
});
