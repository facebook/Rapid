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

  function createSingleCrossing(w1tags = {}, w2tags = {}, n1tags = {}, n2tags = {}) {
    //
    //        n2  (w1 = the footway)
    //        |
    //  n3 -- n5 -- n4   (w2 = the road)
    //        |
    //        n1
    //
    const n1 = Rapid.osmNode({ id: 'n1', loc: [0, -1], tags: n1tags });
    const n2 = Rapid.osmNode({ id: 'n2', loc: [0,  1], tags: n2tags });
    const n3 = Rapid.osmNode({ id: 'n3', loc: [-1, 0] });
    const n4 = Rapid.osmNode({ id: 'n4', loc: [ 1, 0] });
    const n5 = Rapid.osmNode({ id: 'n5', loc: [0,  0] });   // road-crossing junction
    const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n5', 'n2'], tags: w1tags });
    const w2 = Rapid.osmWay({ id: 'w2', nodes: ['n3', 'n5', 'n4'], tags: w2tags });
    const entities = [n1, n2, n3, n4, n5, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }

  function verifySingleCurbNodeIssue(issues) {
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('curb_nodes');
    expect(issue.severity).to.eql('suggestion');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql('w1');
  }

  it('has no errors on init', () => {
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores untagged line crossing untagged line', () => {
    createSingleCrossing();  // no tags
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  for (const type of ['primary', 'secondary', 'tertiary', 'residential']) {
    it(`flags missing curb nodes on a crossing way and ${type} road`, () => {
      createSingleCrossing(
        { highway: 'footway', footway: 'crossing' },
        { highway: type }
      );
      const issues = validate();
      verifySingleCurbNodeIssue(issues);
    });
  }

  it('ignores a crossing way with `barrier=kerb` tags at both ends', () => {
    createSingleCrossing(
      { highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { barrier: 'kerb' },
      { barrier: 'kerb' }
    );
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores a crossing way with `kerb=*` tags at both ends', () => {
    createSingleCrossing(
      { highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { kerb: 'no' },
      { kerb: 'maybe' }
    );
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

});
