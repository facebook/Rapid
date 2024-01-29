describe('validationDisconnectedWay', () => {
  let graph;

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockContext {
    constructor() {
      this.services = {};
      this.systems = {
        l10n:  new MockLocalizationSystem()
      };
    }
  }

  const context = new MockContext();
  const validator = Rapid.validationDisconnectedWay(context);

  beforeEach(() => {
    graph = new Rapid.Graph();     // reset
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


  //
  //  n-1  *
  //
  function createDisconnectedNode(n1tags = {}) {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, 0], tags: n1tags });
    const entities = [n1];
    graph = new Rapid.Graph(entities);
  }

  it('ignores non-routable node', () => {
    createDisconnectedNode({ amenity: 'bench' });
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('flags disconnected routable node', () => {
    createDisconnectedNode({ highway: 'elevator' });
    const issues = validate();
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('disconnected_way');
    expect(issue.subtype).to.eql('highway');
    expect(issue.severity).to.eql('warning');
    expect(issue.entityIds).to.eql(['n-1']);
  });


  //
  //  n-2  *
  //       |
  //  n-1  *
  //
  function createDisconnectedWay(w1tags = {}) {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, 0] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0, 1] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'], tags: w1tags });

    const entities = [n1, n2, w1];
    graph = new Rapid.Graph(entities);
  }

  it('ignores non-routable way', () => {
    createDisconnectedWay({ amenity: 'bench' });
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores non-routable highway', () => {
    createDisconnectedWay({ highway: 'services' });
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('flags disconnected routable highway', () => {
    createDisconnectedWay({ highway: 'unclassified' });
    const issues = validate();
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('disconnected_way');
    expect(issue.subtype).to.eql('highway');
    expect(issue.severity).to.eql('warning');
    expect(issue.entityIds).to.eql(['w-1']);
  });


  //
  //  n-2  *
  //       |
  //  n-1  *---*  n-3
  //
  function createConnectedWays(tags = {}) {
    const w1tags = tags.w1 ?? {};
    const w2tags = tags.w2 ?? {};
    const n1tags = tags.n1 ?? {};

    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, 0], tags: n1tags });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0, 1] });
    const n3 = Rapid.osmNode({ id: 'n-3', loc: [1, 0] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-2'], tags: w1tags });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-1', 'n-3'], tags: w2tags });

    const entities = [n1, n2, n3, w1, w2];
    graph = new Rapid.Graph(entities);
  }

  it('flags highway connected only to service area', () => {
    createConnectedWays({
      w1: { highway: 'unclassified' },
      w2: { highway: 'services' }
    });
    const issues = validate();
    expect(issues).to.have.lengthOf(1);

    const issue = issues[0];
    expect(issue.type).to.eql('disconnected_way');
    expect(issue.subtype).to.eql('highway');
    expect(issue.severity).to.eql('warning');
    expect(issue.entityIds).to.eql(['w-1']);
  });

  it('ignores highway connected to entrance vertex', () => {
    createConnectedWays({
      w1: { highway: 'unclassified' },
      n1: { entrance: 'yes' }
    });
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores highway connected to parking entrance vertex', () => {
    createConnectedWays({
      w1: { highway: 'unclassified' },
      n1: { amenity: 'parking_entrance' }
    });
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

});
