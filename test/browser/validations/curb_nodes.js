describe('validationCurbNodes', () => {
  let graph, tree;

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: graph }; }
    get tree()    { return tree; }
  }

  class MockContext {
    constructor() {
      this.services = {};
      this.systems = {
        editor: new MockEditSystem(),
        l10n:   new MockLocalizationSystem()
      };
    }
  }

  const context = new MockContext();
  const validator = Rapid.validationCurbNodes(context);

  beforeEach(() => {
    graph = new Rapid.Graph();     // reset
    tree = new Rapid.Tree(graph);  // reset
  });

  function validate() {
    const entities = [ ...graph.base.entities.values() ];

    let issues = [];
    for (const entity of entities) {
      issues = issues.concat(validator(entity, graph));
    }
    return issues;
  }

  it('has no errors on init', () => {
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  function createWaysWithOneCrossingPoint(w1tags = {}, w2tags = {}) {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, -1] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0,  1] });
    const n5 = Rapid.osmNode({ id: 'n-5', loc: [0,  0] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-5', 'n-2'], tags: w1tags });

    const n3 = Rapid.osmNode({ id: 'n-3', loc: [-1, 0] });
    const n4 = Rapid.osmNode({ id: 'n-4', loc: [ 1, 0] });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-3', 'n-5', 'n-4'], tags: w2tags });

    const entities = [n1, n2, n3, n4, n5, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }

  function verifySingleCurbNodeIssue(issues) {
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('curb_nodes');
    expect(issue.severity).to.eql('warning');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql('w-1');
  }

  it('ignores untagged line crossing untagged line', () => {
    createWaysWithOneCrossingPoint({}, {});
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('flags a crossing way and residential street if the street has no curb nodes', () => {
    createWaysWithOneCrossingPoint({highway: 'footway', footway: 'crossing'}, {highway: 'residential'});
    const issues = validate();
    verifySingleCurbNodeIssue(issues);
  });

  it('flags a crossing way with no curb nodes on a primary road', () => {
    createWaysWithOneCrossingPoint({highway: 'footway', footway: 'crossing'}, {highway: 'primary'});
    const issues = validate();
    verifySingleCurbNodeIssue(issues);
  });

  it('ignores a crossing way with existing curb nodes at both ends', () => {
    // Define nodes with curb tags at both ends
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, -1], tags: { barrier: 'kerb' } });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0,  1], tags: { barrier: 'kerb' } });
    const n5 = Rapid.osmNode({ id: 'n-5', loc: [0,  0] }); // Middle node without curb
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-5', 'n-2'], tags: { highway: 'footway', footway: 'crossing' } });

    const n3 = Rapid.osmNode({ id: 'n-3', loc: [-1, 0] });
    const n4 = Rapid.osmNode({ id: 'n-4', loc: [ 1, 0] });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-3', 'n-5', 'n-4'], tags: { highway: 'residential' } });

    const entities = [n1, n2, n3, n4, n5, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);

    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('flags a crossing way with a missing curb node on a secondary road', () => {
    createWaysWithOneCrossingPoint({highway: 'footway', footway: 'crossing'}, {highway: 'secondary'});
    const issues = validate();
    verifySingleCurbNodeIssue(issues);
  });

  it('flags a crossing way with no curb nodes on a tertiary road', () => {
    createWaysWithOneCrossingPoint({highway: 'footway', footway: 'crossing'}, {highway: 'tertiary'});
    const issues = validate();
    verifySingleCurbNodeIssue(issues);
  });
});