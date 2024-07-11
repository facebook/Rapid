describe('operationExtract', () => {
  let _graph;

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: _graph }; }
  }

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockContext {
    constructor() {
      this.viewport = new Rapid.sdk.Viewport();
      this.systems = {
        editor:   new MockEditSystem(),
        l10n:     new MockLocalizationSystem(),
        presets:  new Rapid.PresetSystem(this),
        storage:  new Rapid.StorageSystem(this)
      };
    }
    hasHiddenConnections()  { return false; }
  }

  const context = new MockContext();


  describe('available', () => {
    beforeEach(() => {
      // a - node with tags & parent way
      // b - node with tags & 2 parent ways
      // c - node with no tags, parent way
      // d - node with no tags, 2 parent ways
      // e - node with tags, no parent way
      // f - node with no tags, no parent way
      _graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'b', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'c', loc: [0, 0] }),
        Rapid.osmNode({ id: 'd', loc: [0, 0] }),
        Rapid.osmNode({ id: 'e', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'f', loc: [0, 0] }),
        Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c', 'd'] }),
        Rapid.osmWay({ id: 'y', nodes: ['b', 'd'] })
      ]);
    });

    it('is not available for no selected ids', () => {
      const result = Rapid.operationExtract(context, []).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for unknown selected id', () => {
      const result = Rapid.operationExtract(context, ['z']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected way', () => {
      const result = Rapid.operationExtract(context, ['x']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with tags, no parent way', () => {
      const result = Rapid.operationExtract(context, ['e']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with no tags, no parent way', () => {
      const result = Rapid.operationExtract(context, ['f']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with no tags, parent way', () => {
      const result = Rapid.operationExtract(context, ['c']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with no tags, two parent ways', () => {
      const result = Rapid.operationExtract(context, ['d']).available();
      expect(result).to.be.not.ok;
    });

    it('is available for selected node with tags, parent way', () => {
      const result = Rapid.operationExtract(context, ['a']).available();
      expect(result).to.be.ok;
    });

    it('is available for selected node with tags, two parent ways', () => {
      const result = Rapid.operationExtract(context, ['b']).available();
      expect(result).to.be.ok;
    });

    it('is available for two selected nodes with tags and parent ways', () => {
      const result = Rapid.operationExtract(context, ['a', 'b']).available();
      expect(result).to.be.ok;
    });
  });


  describe('disabled', () => {
    it('returns enabled for non-related node', () => {
      _graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'c', loc: [0, 0] }),
        Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c'] })
      ]);

      const result = Rapid.operationExtract(context, ['b']).disabled();
      expect(result).to.be.not.ok;
    });

    it('returns enabled for non-restriction related node', () => {
      _graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'c', loc: [0, 0] }),
        Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c'] }),
        Rapid.osmRelation({ id: 'r', members: [{ id: 'b', role: 'label' }] })
      ]);
      const result = Rapid.operationExtract(context, ['b']).disabled();
      expect(result).to.be.not.ok;
    });

    it('returns enabled for via node in restriction', () => {
      // https://wiki.openstreetmap.org/wiki/Relation:restriction indicates that
      // from and to roles are only appropriate for Ways
      _graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 0] }),
        Rapid.osmNode({ id: 'c', loc: [0, 0] }),
        Rapid.osmNode({ id: 'd', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'e', loc: [0, 0] }),
        Rapid.osmNode({ id: 'f', loc: [0, 0] }),
        Rapid.osmNode({ id: 'g', loc: [0, 0] }),
        Rapid.osmWay({ id: 'x', nodes: ['a', 'b', 'c'] }),
        Rapid.osmWay({ id: 'y', nodes: ['e', 'f', 'g'] }),
        Rapid.osmRelation({id: 'r', tags: { type: 'restriction', restriction: 'no_right_turn' },
          members: [
            { id: 'x', type: 'way', role: 'from' },
            { id: 'd', type: 'node', role: 'via' },
            { id: 'z', type: 'way', role: 'to' }
          ]
        })
      ]);
      const result = Rapid.operationExtract(context, ['d']).disabled();
      expect(result).to.be.not.ok;
    });

    it('returns enabled for location_hint node in restriction', () => {
      // https://wiki.openstreetmap.org/wiki/Relation:restriction indicates that
      // from and to roles are only appropriate for Ways
      _graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 0] }),
        Rapid.osmNode({ id: 'c', loc: [0, 0] }),
        Rapid.osmNode({ id: 'd', loc: [0, 0], tags: { 'name': 'fake' } }),
        Rapid.osmNode({ id: 'e', loc: [0, 0] }),
        Rapid.osmNode({ id: 'f', loc: [0, 0] }),
        Rapid.osmNode({ id: 'g', loc: [0, 0] }),
        Rapid.osmWay({ id: 'x', nodes: ['a', 'b'] }),
        Rapid.osmWay({ id: 'y', nodes: ['e', 'f', 'g'] }),
        Rapid.osmRelation({id: 'r', tags: {type: 'restriction', restriction: 'no_right_turn'},
          members: [
            { id: 'x', type: 'way', role: 'from' },
            { id: 'c', type: 'node', role: 'via' },
            { id: 'd', type: 'node', role: 'location_hint' },
            { id: 'z', type: 'way', role: 'to' }
          ]
        })
      ]);
      const result = Rapid.operationExtract(context, ['d']).disabled();
      expect(result).to.be.not.ok;
    });
  });

});
