describe('operationStraighten', () => {
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
        editor:  new MockEditSystem(),
        l10n:    new MockLocalizationSystem()
      };
    }
    hasHiddenConnections()  { return false; }
  }

  const context = new MockContext();


  describe('#available', () => {
    beforeEach(() => {
      // w1 - way with 2 nodes
      // w1-2 - way with 2 nodes connected to w1
      // w2 - way with 3 nodes connected to w1
      // w3 - way with 3 nodes connected to w2
      // w4 - way with 3 nodes connected to w3
      // w5 - way with 4 nodes not connected to any other nodes
      _graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'n1' }),
        Rapid.osmNode({ id: 'n2' }),
        Rapid.osmNode({ id: 'n2-1' }),
        Rapid.osmNode({ id: 'n3' }),
        Rapid.osmNode({ id: 'n4' }),
        Rapid.osmNode({ id: 'n5' }),
        Rapid.osmNode({ id: 'n6' }),
        Rapid.osmNode({ id: 'n7' }),
        Rapid.osmNode({ id: 'n8' }),
        Rapid.osmNode({ id: 'n9' }),
        Rapid.osmNode({ id: 'n10' }),
        Rapid.osmNode({ id: 'n11' }),
        Rapid.osmNode({ id: 'n12' }),
        Rapid.osmNode({ id: 'n13' }),
        Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] }),
        Rapid.osmWay({ id: 'w1-2', nodes: ['n2', 'n2-1'] }),
        Rapid.osmWay({ id: 'w2', nodes: ['n2', 'n3', 'n4'] }),
        Rapid.osmWay({ id: 'w2-2', nodes: ['n4', 'n13', 'n2'] }), // w-2 reversed
        Rapid.osmWay({ id: 'w3', nodes: ['n4', 'n5', 'n6'] }),
        Rapid.osmWay({ id: 'w4', nodes: ['n6', 'n7', 'n8'] }),
        Rapid.osmWay({ id: 'w5', nodes: ['n9', 'n10', 'n11', 'n12'] }),
      ]);
    });

    it('is not available for no selected ids', () => {
      const result = Rapid.operationStraighten(context, []).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for way with only 2 nodes', () => {
      const result = Rapid.operationStraighten(context, ['w1']).available();
      expect(result).to.be.not.ok;
    });

    it('is available for way with only 2 nodes connected to another 2-node way', () => {
      const result = Rapid.operationStraighten(context, ['w1', 'w1-2']).available();
      expect(result).to.be.ok;
    });

    it('is not available for non-continuous ways', () => {
      const result = Rapid.operationStraighten(context, ['w2', 'w4']).available();
      expect(result).to.be.not.ok;
    });

    it('is available for selected way with more than 2 nodes', () => {
      const result = Rapid.operationStraighten(context, ['w2']).available();
      expect(result).to.be.ok;
    });

    it('is available for selected, ordered, continuous ways', () => {
      const result = Rapid.operationStraighten(context, ['w1', 'w2', 'w3']).available();
      expect(result).to.be.ok;
    });

    it('is available for selected, un-ordered, continuous ways', () => {
      const result = Rapid.operationStraighten(context, ['w1', 'w3', 'w2']).available();
      expect(result).to.be.ok;
    });

    it('is available for selected, continuous ways with different way-directions', () => {
      const result = Rapid.operationStraighten(context, ['w1', 'w3', 'w2-2']).available();
      expect(result).to.be.ok;
    });

    it('is available for 2 selected nodes in the same way, more than one node apart', () => {
      const result = Rapid.operationStraighten(context, ['w5', 'n9', 'n11']).available();
      expect(result).to.be.ok;
    });

    it('is available for 2 selected nodes in adjacent ways, more than one node apart', () => {
      const result = Rapid.operationStraighten(context, ['w2', 'w3', 'n5', 'n3']).available();
      expect(result).to.be.ok;
    });

    it('is available for 2 selected nodes in non-adjacent ways, providing in between ways are selected', () => {
      const result = Rapid.operationStraighten(context, ['n2', 'n7', 'w4', 'w1', 'w3', 'w2']).available();
      expect(result).to.be.ok;
    });

    it('is available for 2 selected nodes in non-adjacent, non-same-directional ways, providing in between ways are selected', () => {
      const result = Rapid.operationStraighten(context, ['n2', 'n7', 'w4', 'w1', 'w3', 'w2-2']).available();
      expect(result).to.be.ok;
    });

    it('is not available for nodes not on selected ways', () => {
      const result = Rapid.operationStraighten(context, ['w5', 'n4', 'n11']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for one selected node', () => {
      const result = Rapid.operationStraighten(context, ['w5', 'n9']).available();
      expect(result).to.be.not.ok;
    });

    it('is not available for more than two selected nodes', () => {
      const result = Rapid.operationStraighten(context, ['w5', 'n9', 'n11', 'n12']).available();
      expect(result).to.be.not.ok;
    });
  });
});
