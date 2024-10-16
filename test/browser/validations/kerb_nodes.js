describe('validationKerbNodes', () => {
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
  const validator = Rapid.validationKerbNodes(context);

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

  // TODO: Recall that this test was copied from crossing_ways, which tests overlapping ways that don't have any intersecting nodes. 
  // We'll need to rewrite the setup methods like this one to have an 'n-5' at the crossing point, and to evaluate *that* instead.


  //
  //        n-2
  //         *
  //         |
  // n-3 *---|---* n-4
  //         |
  //         *
  //        n-1
  //
  function createWaysWithOneCrossingPoint(w1tags = {}, w2tags = {}) {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, -1] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0,  1] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'], tags: w1tags });

    const n3 = Rapid.osmNode({ id: 'n-3', loc: [-1, 0] });
    const n4 = Rapid.osmNode({ id: 'n-4', loc: [ 1, 0] });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-3', 'n-4'], tags: w2tags });

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }

  // TODO: Logic here will need to be adjusted according to how you write the actual validation/fix code. 
  function verifySingleCrossingIssue(issues, connectionTags) {
    // each entity must produce an identical issue
    // TODO: Determine whether this will still be the case in the kerb_nodes validator
    expect(issues).to.have.lengthOf(2);
    expect(issues[0].id).to.eql(issues[1].id);

    for (const issue of issues) {
      expect(issue.type).to.eql('kerb_nodes');
      expect(issue.severity).to.eql('warning');
      expect(issue.entityIds).to.have.lengthOf(2);
      expect(issue.loc).to.eql([0, 0]);
      expect(issue.data.connectionTags).to.eql(connectionTags);
    }
  }

  // TODO: Come up with a list of other things this validation should ignore. 
  // Use the crossing_ways validations as an inspiration here: There are probably tons more test cases to check for like in that file.
  it('ignores untagged line crossing untagged line', () => {
    createWaysWithOneCrossingPoint({}, {});
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  // TODO: Once you've rewritten 'verifySingleCrossingIssue' make use of it for each positive test case
  it('flags a crossing way and residential street if the street has no kerb nodes', () => {
    createWaysWithOneCrossingPoint({highway: 'footway', footway: 'crossing'}, {highway: 'residential'});
    const issues = validate();
    expect(issues).to.have.lengthOf(1);
  });


  //
  //        n-2
  //         *
  //         |
  // n-3 *---|---* n-4
  //         |   |
  // n-6 *---|---* n-5
  //         |
  //         *
  //        n-1
  //
  function createWaysWithTwoCrossingPoints() {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, -2] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0,  2] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' }});

    const n3 = Rapid.osmNode({ id: 'n-3', loc: [-1,  1] });
    const n4 = Rapid.osmNode({ id: 'n-4', loc: [ 1,  1] });
    const n5 = Rapid.osmNode({ id: 'n-5', loc: [ 1, -1] });
    const n6 = Rapid.osmNode({ id: 'n-6', loc: [-1, -1] });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-3', 'n-4', 'n-5', 'n-6'], tags: { highway: 'footway', footway: 'crossing' }});

    const entities = [n1, n2, n3, n4, n5, n6, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }

  // TODO: Don't worry too much abou this sort of case *just* yet. but! Do think about cases where a crosswalk traverses a pedestrian island. 
  // Just worry about the single-node intersection case above and think about this once you've nailed that.
  it('flags road crossing road twice', () => {
    createWaysWithTwoCrossingPoints();
    const issues = validate();
    expect(issues).to.have.lengthOf(4);

    let issue = issues[0];
    expect(issue.type).to.eql('kerb_nodes');
    expect(issue.entityIds).to.eql(['w-1', 'w-2']);
    expect(issue.loc).to.eql([0, 1]);

    issue = issues[1];
    expect(issue.type).to.eql('kerb_nodes');
    expect(issue.entityIds).to.eql(['w-1', 'w-2']);
    expect(issue.loc).to.eql([0, -1]);

    issue = issues[2];
    expect(issue.type).to.eql('kerb_nodes');
    expect(issue.entityIds).to.eql(['w-2', 'w-1']);
    expect(issue.loc).to.eql([0, 1]);

    issue = issues[3];
    expect(issue.type).to.eql('kerb_nodes');
    expect(issue.entityIds).to.eql(['w-2', 'w-1']);
    expect(issue.loc).to.eql([0, -1]);
  });


});
