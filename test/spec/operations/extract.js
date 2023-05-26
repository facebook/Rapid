describe('operationExtract', () => {
  let _context;
  let _graph;

  class MockMap {
    constructor() { }
    extent() { return new sdk.Extent([-180, -90], [180, 90]); }
  }

  class MockContext {
    constructor()           {
      this._map = new MockMap();
      this._storageSystem = new Rapid.StorageSystem(this);
      this._presetSystem = new Rapid.PresetSystem(this);
    }
    map()                   { return this._map; }
    storageSystem()         { return this._storageSystem; }
    presetSystem()          { return this._presetSystem; }
    graph()                 { return _graph; }
    entity(id)              { return _graph.entity(id); }
    hasEntity(id)           { return _graph.hasEntity(id); }
    hasHiddenConnections()  { return false; }
    inIntro()               { return false; }
    keyBinding()            { return false; }
    t(id)                   { return id; }
    tHtml(id)               { return id; }
  }


  beforeEach(() => {
    _context = new MockContext();
  });


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
      const result = Rapid.operationExtract(_context, []).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for unknown selected id', () => {
      const result = Rapid.operationExtract(_context, ['z']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected way', () => {
      const result = Rapid.operationExtract(_context, ['x']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with tags, no parent way', () => {
      const result = Rapid.operationExtract(_context, ['e']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with no tags, no parent way', () => {
      const result = Rapid.operationExtract(_context, ['f']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with no tags, parent way', () => {
      const result = Rapid.operationExtract(_context, ['c']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for selected node with no tags, two parent ways', () => {
      const result = Rapid.operationExtract(_context, ['d']).available();
      expect(result).to.be.not.ok;
    });

    it('is available for selected node with tags, parent way', () => {
      const result = Rapid.operationExtract(_context, ['a']).available();
      expect(result).to.be.ok;
    });

    it('is available for selected node with tags, two parent ways', () => {
      const result = Rapid.operationExtract(_context, ['b']).available();
      expect(result).to.be.ok;
    });

    it('is available for two selected nodes with tags and parent ways', () => {
      const result = Rapid.operationExtract(_context, ['a', 'b']).available();
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

      const result = Rapid.operationExtract(_context, ['b']).disabled();
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
      const result = Rapid.operationExtract(_context, ['b']).disabled();
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
      const result = Rapid.operationExtract(_context, ['d']).disabled();
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
      const result = Rapid.operationExtract(_context, ['d']).disabled();
      expect(result).to.be.not.ok;
    });
  });

});
