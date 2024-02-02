describe('validationAlmostJunction', () => {
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
  const validator = Rapid.validationAlmostJunction(context);

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


  function horizontalVertialCloserThanThreshold() {
    // horizontal road
    const n1 = Rapid.osmNode({id: 'n-1', loc: [22.42357, 0]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [22.42367, 0]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' }});

    // vertical road to the west of w1 by 0.00001 longitude degree
    // 5th digit after decimal point has a resolution of ~1 meter
    const n3 = Rapid.osmNode({id: 'n-3', loc: [22.42356, 0.001]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [22.42356, -0.001]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'residential' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function horizontalTiltedCloserThanThreshold() {
    // horizontal road
    const n1 = Rapid.osmNode({id: 'n-1', loc: [22.42357, 0]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [22.42367, 0]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' }});

    // tilted road to the west of w1 by 0.00001 longitude degree
    const n3 = Rapid.osmNode({id: 'n-3', loc: [22.423555, 0.001]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [22.423565, -0.001]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'residential' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function horizontalVertialFurtherThanThreshold() {
    // horizontal road
    const n1 = Rapid.osmNode({id: 'n-1', loc: [22.42357, 0]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [22.42367, 0]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' }});

    // vertical road to the west of w1 by 0.00007 longitude degree
    const n3 = Rapid.osmNode({id: 'n-3', loc: [22.42350, 0.001]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [22.42350, -0.001]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'residential' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function twoHorizontalCloserThanThreshold() {
    // horizontal road
    const n1 = Rapid.osmNode({id: 'n-1', loc: [22.42357, 0]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [22.42367, 0]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' }});

    // another horizontal road to the north of w1 by 0.0001 latitude degree
    const n3 = Rapid.osmNode({id: 'n-3', loc: [22.42357, 0.00001]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [22.42367, 0.00001]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'residential' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }

  function horizontalVertialWithNoExit() {
    // horizontal road
    const n1 = Rapid.osmNode({id: 'n-1', loc: [22.42357, 0], tags: { noexit: 'yes' }});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [22.42367, 0]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' }});

    // vertical road to the west of w1 by 0.00001 longitude degree
    const n3 = Rapid.osmNode({id: 'n-3', loc: [22.42356, 0.001]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [22.42356, -0.001]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'residential' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function closeEndNodesSmallAngle() {
    // Vertical path
    const n1 = Rapid.osmNode({id: 'n-1', loc: [0.0003247, 22.4423866]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [0.0003060, 22.4432671]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'path' }});

    // Angled path with end node within 4.25m and change of angle <9°
    const n3 = Rapid.osmNode({id: 'n-3', loc: [0.0003379, 22.4423861]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [0.0004354, 22.4421312]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'path' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function closeEndNodesBigAngle() {
    // Vertical path
    const n1 = Rapid.osmNode({id: 'n-1', loc: [0, 22.4427453]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [0, 22.4429806]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'path' }});

    // Horizontal path with end node within 4.25m and change of angle >9°
    const n3 = Rapid.osmNode({id: 'n-3', loc: [0.0000199, 22.4427801]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [0.0002038, 22.4427801]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-3', 'n-4'], tags: { highway: 'path' }});

    const entities = [n1, n2, n3, n4, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function closeEndNodesSmallAngleSelf() {
    // Square path that ends within 4.25m of itself and change of angle <9°
    const n1 = Rapid.osmNode({id: 'n-1', loc: [0, 22.4427453]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [0, 22.4429811]});
    const n3 = Rapid.osmNode({id: 'n-3', loc: [0.0001923, 22.4429811]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [0.0001923, 22.4427523]});
    const n5 = Rapid.osmNode({id: 'n-5', loc: [0.0000134, 22.4427523]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3', 'n-4', 'n-5'], tags: { highway: 'path' }});

    const entities = [n1, n2, n3, n4, n5, w1];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  function closeEndNodesBothSmallAngle() {
    // Square path with both endpoints near each other
    const n1 = Rapid.osmNode({id: 'n-1', loc: [0, 22.4427453]});
    const n2 = Rapid.osmNode({id: 'n-2', loc: [0, 22.4429810]});
    const n3 = Rapid.osmNode({id: 'n-3', loc: [0.0000063, 22.4429810]});
    const n4 = Rapid.osmNode({id: 'n-4', loc: [0.0000063, 22.4427483]});
    const w1 = Rapid.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3', 'n-4'], tags: { highway: 'path' }});

    // Horizontal path with end node within 4.25m and change of angle >9° (to both endpoints)
    const n5 = Rapid.osmNode({id: 'n-5', loc: [0.0000124, 22.4427458]});
    const n6 = Rapid.osmNode({id: 'n-6', loc: [0.0000445, 22.4427449]});
    const w2 = Rapid.osmWay({id: 'w-2', nodes: ['n-5', 'n-6'], tags: { highway: 'path' }});

    const entities = [n1, n2, n3, n4, n5, n6, w1, w2];
    graph = new Rapid.Graph(entities);
    tree = new Rapid.Tree(graph);
    tree.rebase(entities, true);
  }


  it('flags horizontal and vertical road closer than threshold', () => {
    horizontalVertialCloserThanThreshold();
    const issues = validate();
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('almost_junction');
    expect(issue.subtype).to.eql('highway-highway');
    expect(issue.entityIds).to.eql(['w-1', 'n-1', 'w-2']);
    expect(issue.loc).to.eql([22.42357, 0]);
    expect(issue.data.edge).to.eql(['n-3', 'n-4']);
    expect(issue.data.cross_loc).to.eql([22.42356, 0]);
  });


  it('flags horizontal and tilted road closer than threshold', () => {
    horizontalTiltedCloserThanThreshold();
    const issues = validate();
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('almost_junction');
    expect(issue.subtype).to.eql('highway-highway');
    expect(issue.entityIds).to.eql(['w-1', 'n-1', 'w-2']);
    expect(issue.loc).to.eql([22.42357, 0]);
    expect(issue.data.edge).to.eql(['n-3', 'n-4']);
    expect(issue.data.cross_loc).to.eql([22.42356, 0]);
  });


  it('ignores horizontal and vertical road further than threshold', () => {
    horizontalVertialFurtherThanThreshold();
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });


  it('ignores horizontal and vertical road closer than threshold, but with noexit tag', () => {
    horizontalVertialWithNoExit();
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });


  it('ignores two horizontal roads closer than threshold', () => {
    twoHorizontalCloserThanThreshold();
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });


  it('joins close endpoints if insignificant angle change', () => {
    closeEndNodesSmallAngle();
    const issues = validate();
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('almost_junction');
    expect(issue.subtype).to.eql('highway-highway');
    expect(issue.entityIds).to.eql(['w-2', 'n-3', 'w-1']);
  });


  it('won\'t join close endpoints if significant angle change', () => {
    closeEndNodesBigAngle();
    const issues = validate();
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('almost_junction');
    expect(issue.subtype).to.eql('highway-highway');
    expect(issue.entityIds).to.eql(['w-2', 'n-3', 'w-1']);
  });


  it('joins close endpoints of the same way', () => {
    closeEndNodesSmallAngleSelf();
    const issues = validate();
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('almost_junction');
    expect(issue.subtype).to.eql('highway-highway');
    expect(issue.entityIds).to.eql(['w-1', 'n-5', 'w-1']);
  });


  it('joins to close endpoint with smaller angle change', () => {
    closeEndNodesBothSmallAngle();
    const issues = validate();
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('almost_junction');
    expect(issue.subtype).to.eql('highway-highway');
    expect(issue.entityIds).to.eql(['w-2', 'n-5', 'w-1']);
  });
});
