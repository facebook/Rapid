describe('validationAmbiguousCrossingTags', () => {
  let graph;

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: graph }; }
  }

  class MockContext {
    constructor() {
      this.services = {};
      this.systems = {
        editor:   new MockEditSystem(),
        l10n:     new MockLocalizationSystem(),
        presets:  new Rapid.PresetSystem(this)
      };
    }
  }

  const context = new MockContext();
  const validator = Rapid.validationAmbiguousCrossingTags(context);

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
  //         n-2
  //          *
  //          |
  // n-3 *-- n-5 --* n-4
  //          |
  //          *
  //         n-1
  //
  function createJunction(tags = {}) {
    const w1Tags = tags.w1 ?? {};
    const w2Tags = tags.w2 ?? {};
    const nTags  = tags.n  ?? {};

    const n5 = Rapid.osmNode({ id: 'n-5', loc: [0,  0], tags: nTags} );

    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, -1] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0,  1] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-5', 'n-2'], tags: w1Tags });

    const n3 = Rapid.osmNode({ id: 'n-3', loc: [-1, 0] });
    const n4 = Rapid.osmNode({ id: 'n-4', loc: [ 1, 0] });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-3', 'n-5',  'n-4'], tags: w2Tags });

    const entities = [n1, n2, n3, n4, n5, w1, w2];
    graph = new Rapid.Graph(entities);
  }


  function verifySingleCrossingWarning(issues) {
    expect(issues).to.have.lengthOf(1);

    for (const issue of issues) {
      expect(issue.type).to.eql('ambiguous_crossing');
      expect(issue.severity).to.eql('warning');
      expect(issue.entityIds).to.have.lengthOf(2);
    }
  }


  it('ignores untagged lines that share an untagged crossing node', () => {
    createJunction();
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('flags unmarked lines that share a marked crossing node', () => {
    createJunction({
      w1: { crossing: 'unmarked', highway: 'footway', footway: 'crossing' },
      w2: { highway: 'residential' },
      n:  { 'crossing:markings' : 'yes' }
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags unmarked lines that share a zebra-marked crossing node', () => {
    createJunction({
      w1: { crossing: 'unmarked', highway: 'footway', footway: 'crossing' },
      w2: { highway: 'residential' },
      n:  { crossing: 'zebra' }
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags marked lines that share an unmarked crossing node', () => {
    createJunction({
      w1: { crossing: 'marked', highway: 'footway', footway: 'crossing' },
      w2: { highway: 'residential' },
      n:  { 'crossing:markings': 'no' }
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags marked lines and nodes that have a different crossing marking type', () => {
    createJunction({
      w1: { crossing: 'marked', 'crossing:markings': 'zebra', highway: 'footway', footway: 'crossing' },
      w2: { highway: 'residential' },
      n:  { 'highway': 'crossing', 'crossing':'marked', 'crossing:markings': 'lines' }
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags an informal line and marked node', () => {
    createJunction({
      w1: { crossing: 'informal', highway: 'footway', footway: 'crossing' },
      w2: { highway: 'residential' },
      n:  { 'crossing:markings': 'lines' }
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags a marked line and informal ladder node', () => {
    createJunction({
      w1: { crossing: 'marked', highway: 'footway', footway: 'crossing'},
      w2: { highway: 'residential' },
      n:  { 'highway':'crossing', 'crossing':'informal'}
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags a marked line with bare crossing candidate node', () => {
    createJunction({
      w1: { crossing: 'marked', highway: 'footway', footway: 'crossing'},
      w2: { highway: 'residential' },
      n: {}
    });
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

});
