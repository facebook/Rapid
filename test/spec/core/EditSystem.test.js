describe('EditSystem', () => {
  let _context, _editSystem, spy;

  const actionNoop = function() {
    return (graph) => graph;
  };
  const actionAddNode = function (nodeID) {
    return (graph) => graph.replace(Rapid.osmNode({ id: nodeID }));
  };


  beforeEach(() => {
    _context = Rapid.coreContext();
    window._context = _context;  // lol
    _context.init();

    _editSystem = _context.editSystem();
    spy = sinon.spy();
  });


  describe('#reset', () => {
    it('clears the version stack', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.undo();
      _editSystem.reset();
      expect(_editSystem.undoAnnotation()).to.be.undefined;
      expect(_editSystem.redoAnnotation()).to.be.undefined;
    });
  });


  describe('#graph', () => {
    it('returns the current graph', () => {
      expect(_editSystem.graph()).to.be.an.instanceOf(Rapid.Graph);
    });
  });


  describe('#merge', () => {
    it('merges the entities into all graph versions', () => {
      const n = Rapid.osmNode({id: 'n'});
      _editSystem.merge([n]);
      expect(_editSystem.graph().entity('n')).to.equal(n);
    });

    it('emits a merge event with the new entities', () => {
      const n = Rapid.osmNode({id: 'n'});
      _editSystem.on('merge', spy);
      _editSystem.merge([n]);
      expect(spy).to.have.been.calledWith(new Set([n.id]));
    });
  });


  describe('#perform', () => {
    it('returns a difference', () => {
      expect(_editSystem.perform(actionNoop()).changes).to.be.empty;
    });

    it('updates the graph', () => {
      const node = Rapid.osmNode();
      _editSystem.perform(graph => { return graph.replace(node); });
      expect(_editSystem.graph().entity(node.id)).to.equal(node);
    });

    it('pushes an undo annotation', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      expect(_editSystem.undoAnnotation()).to.equal('annotation1');
    });

    it('emits a change event', () => {
      _editSystem.on('change', spy);
      const difference = _editSystem.perform(actionNoop());
      expect(spy).to.have.been.calledWith(difference);
      expect(spy.callCount).to.eql(1);
    });

    it('performs multiple actions', () => {
      const action1 = sinon.stub().returns(new Rapid.Graph());
      const action2 = sinon.stub().returns(new Rapid.Graph());
      _editSystem.perform(action1, action2, 'annotation1');
      expect(action1).to.have.been.called;
      expect(action2).to.have.been.called;
      expect(_editSystem.undoAnnotation()).to.equal('annotation1');
    });

    it('performs transitionable actions in a transition', done => {
      const action1 = () => { return new Rapid.Graph(); };
      action1.transitionable = true;
      _editSystem.on('change', spy);
      _editSystem.perform(action1);
      window.setTimeout(() => {
        expect(spy.callCount).to.be.above(2);
        done();
      }, 300);
    });
  });


  describe('#replace', () => {
    it('returns a difference', () => {
      expect(_editSystem.replace(actionNoop()).changes).to.be.empty;
    });

    it('updates the graph', () => {
      const node = Rapid.osmNode();
      const action = (graph) => graph.replace(node);
      _editSystem.replace(action);
      expect(_editSystem.graph().entity(node.id)).to.equal(node);
    });

    it('replaces the undo annotation', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.replace(actionNoop(), 'annotation2');
      expect(_editSystem.undoAnnotation()).to.equal('annotation2');
    });

    it('emits a change event', () => {
      _editSystem.on('change', spy);
      const difference = _editSystem.replace(actionNoop());
      expect(spy).to.have.been.calledWith(difference);
    });

    it('performs multiple actions', () => {
      const action1 = sinon.stub().returns(new Rapid.Graph());
      const action2 = sinon.stub().returns(new Rapid.Graph());
      _editSystem.replace(action1, action2, 'annotation1');
      expect(action1).to.have.been.called;
      expect(action2).to.have.been.called;
      expect(_editSystem.undoAnnotation()).to.equal('annotation1');
    });
  });


  describe('#pop', () => {
    it('returns a difference', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      expect(_editSystem.pop().changes).to.be.empty;
    });

    it('updates the graph', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.pop();
      expect(_editSystem.undoAnnotation()).to.be.undefined;
    });

    it('does not push the redo stack', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.pop();
      expect(_editSystem.redoAnnotation()).to.be.undefined;
    });

    it('emits a change event', () => {
      _editSystem.perform(actionNoop());
      _editSystem.on('change', spy);
      const difference = _editSystem.pop();
      expect(spy).to.have.been.calledWith(difference);
    });

    it('pops n times', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.perform(actionNoop(), 'annotation2');
      _editSystem.perform(actionNoop(), 'annotation3');
      _editSystem.pop(2);
      expect(_editSystem.undoAnnotation()).to.equal('annotation1');
    });

    it('pops 0 times', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.perform(actionNoop(), 'annotation2');
      _editSystem.perform(actionNoop(), 'annotation3');
      _editSystem.pop(0);
      expect(_editSystem.undoAnnotation()).to.equal('annotation3');
    });

    it('pops 1 time if argument is invalid', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.perform(actionNoop(), 'annotation2');
      _editSystem.perform(actionNoop(), 'annotation3');
      _editSystem.pop('foo');
      expect(_editSystem.undoAnnotation()).to.equal('annotation2');
      _editSystem.pop(-1);
      expect(_editSystem.undoAnnotation()).to.equal('annotation1');
    });
  });


  describe('#overwrite', () => {
    it('returns a difference', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      expect(_editSystem.overwrite(actionNoop()).changes).to.be.empty;
    });

    it('updates the graph', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      const node = Rapid.osmNode();
      _editSystem.overwrite(graph => { return graph.replace(node); });
      expect(_editSystem.graph().entity(node.id)).to.equal(node);
    });

    it('replaces the undo annotation', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.overwrite(actionNoop(), 'annotation2');
      expect(_editSystem.undoAnnotation()).to.equal('annotation2');
    });

    it('does not push the redo stack', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.overwrite(actionNoop(), 'annotation2');
      expect(_editSystem.redoAnnotation()).to.be.undefined;
    });

    it('emits a change event', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.on('change', spy);
      const difference = _editSystem.overwrite(actionNoop(), 'annotation2');
      expect(spy).to.have.been.calledWith(difference);
    });

    it('performs multiple actions', () => {
      const action1 = sinon.stub().returns(new Rapid.Graph());
      const action2 = sinon.stub().returns(new Rapid.Graph());
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.overwrite(action1, action2, 'annotation2');
      expect(action1).to.have.been.called;
      expect(action2).to.have.been.called;
      expect(_editSystem.undoAnnotation()).to.equal('annotation2');
    });
  });


  describe('#undo', () => {
    it('returns a difference', () => {
      expect(_editSystem.undo().changes).to.be.empty;
    });

    it('pops the undo stack', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.undo();
      expect(_editSystem.undoAnnotation()).to.be.undefined;
    });

    it('pushes the redo stack', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.undo();
      expect(_editSystem.redoAnnotation()).to.equal('annotation1');
    });

    it('emits an undone event', () => {
      _editSystem.perform(actionNoop());
      _editSystem.on('undone', spy);
      _editSystem.undo();
      expect(spy).to.have.been.called;
    });

    it('emits a change event', () => {
      _editSystem.perform(actionNoop());
      _editSystem.on('change', spy);
      const difference = _editSystem.undo();
      expect(spy).to.have.been.calledWith(difference);
    });
  });

  describe('#redo', () => {
    it('returns a difference', () => {
      expect(_editSystem.redo().changes).to.be.empty;
    });

    it('does redo into an annotated state', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.on('redone', spy);
      _editSystem.undo();
      _editSystem.redo();
      expect(_editSystem.undoAnnotation()).to.equal('annotation1');
      expect(spy).to.have.been.called;
    });

    it('does not redo into a non-annotated state', () => {
      _editSystem.perform(actionNoop());
      _editSystem.on('redone', spy);
      _editSystem.undo();
      _editSystem.redo();
      expect(spy).not.to.have.been.called;
    });

    it('emits a change event', () => {
      _editSystem.perform(actionNoop());
      _editSystem.undo();
      _editSystem.on('change', spy);
      const difference = _editSystem.redo();
      expect(spy).to.have.been.calledWith(difference);
    });
  });


  describe('#pauseChangeDispatch / #resumeChangeDispatch', () => {
    it('prevents change events from getting dispatched', () => {
      _editSystem.perform(actionNoop(), 'base');
      _editSystem.on('change', spy);

      _editSystem.pauseChangeDispatch();

      _editSystem.perform(actionNoop(), 'perform');
      expect(spy).to.have.not.been.called;
      _editSystem.replace(actionNoop(), 'replace');
      expect(spy).to.have.not.been.called;
      _editSystem.overwrite(actionNoop(), 'replace');
      expect(spy).to.have.not.been.called;
      _editSystem.undo();
      expect(spy).to.have.not.been.called;
      _editSystem.redo();
      expect(spy).to.have.not.been.called;
      _editSystem.pop();
      expect(spy).to.have.not.been.called;

      const diff = _editSystem.resumeChangeDispatch();
      expect(spy).to.have.been.calledOnceWith(diff);
    });

    it('does nothing if resume called before pause', () => {
      _editSystem.perform(actionNoop(), 'base');
      _editSystem.on('change', spy);

      _editSystem.resumeChangeDispatch();
      expect(spy).to.have.not.been.called;
    });

    it('uses earliest difference if pause called multiple times', () => {
      _editSystem.perform(actionNoop(), 'base');
      _editSystem.on('change', spy);

      _editSystem.pauseChangeDispatch();
      _editSystem.perform(actionAddNode('a'), 'perform');

      _editSystem.pauseChangeDispatch();
      _editSystem.perform(actionAddNode('b'), 'perform');

      const diff = _editSystem.resumeChangeDispatch();
      expect(spy).to.have.been.calledOnceWith(diff);
      expect(diff.changes).to.have.all.keys('a', 'b');
    });
  });


  describe('#changes', () => {
    it('includes created entities', () => {
      const node = Rapid.osmNode();
      _editSystem.perform(graph => { return graph.replace(node); });
      expect(_editSystem.changes().created).to.eql([node]);
    });

    it('includes modified entities', () => {
      const node1 = Rapid.osmNode({id: 'n1'});
      const node2 = node1.update({ tags: { yes: 'no' } });
      _editSystem.merge([node1]);
      _editSystem.perform(graph => { return graph.replace(node2); });
      expect(_editSystem.changes().modified).to.eql([node2]);
    });

    it('includes deleted entities', () => {
      const node = Rapid.osmNode({id: 'n1'});
      _editSystem.merge([node]);
      _editSystem.perform(graph => { return graph.remove(node); });
      expect(_editSystem.changes().deleted).to.eql([node]);
    });
  });


  describe('#hasChanges', () => {
    it('is true when any of change\'s values are nonempty', () => {
      const node = Rapid.osmNode();
      _editSystem.perform(graph => { return graph.replace(node); });
      expect(_editSystem.hasChanges()).to.eql(true);
    });

    it('is false when all of change\'s values are empty', () => {
      expect(_editSystem.hasChanges()).to.eql(false);
    });
  });


  describe('checkpoints', () => {
    it('saves and resets to checkpoints', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.perform(actionNoop(), 'annotation2');
      _editSystem.perform(actionNoop(), 'annotation3');
      _editSystem.setCheckpoint('check1');
      _editSystem.perform(actionNoop(), 'annotation4');
      _editSystem.perform(actionNoop(), 'annotation5');
      _editSystem.setCheckpoint('check2');
      _editSystem.perform(actionNoop(), 'annotation6');
      _editSystem.perform(actionNoop(), 'annotation7');
      _editSystem.perform(actionNoop(), 'annotation8');

      _editSystem.resetToCheckpoint('check1');
      expect(_editSystem.undoAnnotation()).to.equal('annotation3');

      _editSystem.resetToCheckpoint('check2');
      expect(_editSystem.undoAnnotation()).to.equal('annotation5');

      _editSystem.resetToCheckpoint('check1');
      expect(_editSystem.undoAnnotation()).to.equal('annotation3');
    });

    it('emits a change event', () => {
      _editSystem.perform(actionNoop(), 'annotation1');
      _editSystem.setCheckpoint('check1');
      _editSystem.perform(actionNoop(), 'annotation2');

      _editSystem.on('change', spy);
      _editSystem.resetToCheckpoint('check1');
      expect(spy).to.have.been.called;
    });
  });


  describe('#toJSON', () => {
    it('doesn\'t generate unsaveable changes', () => {
      _editSystem.perform(actionAddNode('n-1'));
      _editSystem.perform(Rapid.actionDeleteNode('n-1'));
      expect(_editSystem.toJSON()).to.be.not.ok;
    });

    it('generates v3 JSON', () => {
      const node_1 = Rapid.osmNode({id: 'n-1'});
      const node1 = Rapid.osmNode({id: 'n1'});
      const node2 = Rapid.osmNode({id: 'n2'});
      const node3 = Rapid.osmNode({id: 'n3'});

      const node_1_json = JSON.parse(JSON.stringify(node_1));
      const node1_json = JSON.parse(JSON.stringify(node1));
      const node2_json = JSON.parse(JSON.stringify(node2));
      const node3_json = JSON.parse(JSON.stringify(node3));

      _editSystem.merge([node1, node2, node3]);                  // merge base entities
      _editSystem.perform(Rapid.actionAddEntity(node_1));           // add n-1
      _editSystem.perform(Rapid.actionChangeTags('n2', {k: 'v'}));  // update n2
      const node2upd = _editSystem.graph().entity('n2');
      const node2upd_json = JSON.parse(JSON.stringify(node2upd));
      _editSystem.perform(Rapid.actionDeleteNode('n3'));            // delete n3

      const json = JSON.parse(_editSystem.toJSON());
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
    it('restores from v2 JSON (creation)', () => {
      const json = {
        version: 2,
        entities: [{ loc: [1, 2], id: 'n-1' }],
        stack: [
          { },
          { modified: ['n-1v0'], imageryUsed: ['Bing'], annotation: 'Added a point.' }
        ],
        nextIDs: { node: -2, way: -1, relation: -1 },
        index: 1
      };
      _editSystem.fromJSON(JSON.stringify(json));
      expect(_editSystem.graph().entity('n-1')).to.eql(Rapid.osmNode({id: 'n-1', loc: [1, 2]}));
      expect(_editSystem.undoAnnotation()).to.eql('Added a point.');
      expect(_editSystem.imageryUsed()).to.eql(['Bing']);
      expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
      expect(_editSystem.difference().created().length).to.eql(1);
    });

    it('restores from v2 JSON (modification)', () => {
      const json = {
        version: 2,
        entities: [ { loc: [2, 3], id: 'n1', v: 1 }],
        stack: [
          { },
          { modified: ['n1v1'], imageryUsed: ['Bing'], annotation: 'Moved a point.' }
        ],
        nextIDs: { node: -2, way: -1, relation: -1 },
        index: 1
      };
      _editSystem.fromJSON(JSON.stringify(json));
      _editSystem.merge([Rapid.osmNode({id: 'n1'})]); // Shouldn't be necessary; flaw in v2 format (see iD#2135)
      expect(_editSystem.graph().entity('n1')).to.eql(Rapid.osmNode({ id: 'n1', loc: [2, 3], v: 1 }));
      expect(_editSystem.undoAnnotation()).to.eql('Moved a point.');
      expect(_editSystem.imageryUsed()).to.eql(['Bing']);
      expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
      expect(_editSystem.difference().modified().length).to.eql(1);
    });

    it('restores from v2 JSON (deletion)', () => {
      const json = {
        version: 2,
        entities: [],
        stack: [
          { },
          { deleted: ['n1'], imageryUsed: ['Bing'], annotation: 'Deleted a point.' }
        ],
        nextIDs: { node: -1, way: -2, relation: -3 },
        index: 1
      };
      _editSystem.fromJSON(JSON.stringify(json));
      _editSystem.merge([Rapid.osmNode({id: 'n1'})]); // Shouldn't be necessary; flaw in v2 format (see iD#2135)
      expect(_editSystem.graph().hasEntity('n1')).to.be.undefined;
      expect(_editSystem.undoAnnotation()).to.eql('Deleted a point.');
      expect(_editSystem.imageryUsed()).to.eql(['Bing']);
      expect(Rapid.osmEntity.id.next).to.eql({ node: -1, way: -2, relation: -3 });
      expect(_editSystem.difference().deleted().length).to.eql(1);
    });

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
      _editSystem.fromJSON(JSON.stringify(json));
      expect(_editSystem.graph().entity('n-1')).to.eql(Rapid.osmNode({id: 'n-1', loc: [1, 2]}));
      expect(_editSystem.undoAnnotation()).to.eql('Added a point.');
      expect(_editSystem.imageryUsed()).to.eql(['Bing']);
      expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
      expect(_editSystem.difference().created().length).to.eql(1);
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
      _editSystem.fromJSON(JSON.stringify(json));
      expect(_editSystem.graph().entity('n1')).to.eql(Rapid.osmNode({ id: 'n1', loc: [2, 3], v: 1 }));
      expect(_editSystem.undoAnnotation()).to.eql('Moved a point.');
      expect(_editSystem.imageryUsed()).to.eql(['Bing']);
      expect(Rapid.osmEntity.id.next).to.eql({ node: -2, way: -1, relation: -1 });
      expect(_editSystem.difference().modified().length).to.eql(1);
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
      _editSystem.fromJSON(JSON.stringify(json));
      expect(_editSystem.graph().hasEntity('n1')).to.be.undefined;
      expect(_editSystem.undoAnnotation()).to.eql('Deleted a point.');
      expect(_editSystem.imageryUsed()).to.eql(['Bing']);
      expect(Rapid.osmEntity.id.next).to.eql({ node: -1, way: -2, relation: -3 });
      expect(_editSystem.difference().deleted().length).to.eql(1);
    });
  });
});
