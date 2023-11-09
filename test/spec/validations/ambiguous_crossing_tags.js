describe('validationAmbiguousCrossingTags', () => {
  let graph;

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
    tHtml(id)             { return id; }
  }

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: graph }; }
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
  function createWaysWithOneCrossingNode(w1tags = {}, w2tags = {}, nodeTags={}) {
    const n5 = Rapid.osmNode({ id: 'n-5', loc: [0,  0], tags: nodeTags} );

    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, -1] });
    const n2 = Rapid.osmNode({ id: 'n-2', loc: [0,  1] });
    const w1 = Rapid.osmWay({ id: 'w-1', nodes: ['n-1', 'n-5', 'n-2'], tags: w1tags });

    const n3 = Rapid.osmNode({ id: 'n-3', loc: [-1, 0] });
    const n4 = Rapid.osmNode({ id: 'n-4', loc: [ 1, 0] });
    const w2 = Rapid.osmWay({ id: 'w-2', nodes: ['n-3', 'n-5',  'n-4'], tags: w2tags });

    const entities = [n1, n2, n3, n4, n5, w1, w2];
    graph = new Rapid.Graph(entities);
  }


  function verifySingleCrossingWarning(issues) {
    // each entity must produce an identical issue
    expect(issues).to.have.lengthOf(1);

    for (const issue of issues) {
      expect(issue.type).to.eql('ambiguous_crossing_tags');
      expect(issue.severity).to.eql('warning');

      expect(issue.entityIds).to.have.lengthOf(2);
      expect(issue.loc).to.eql([0, 0]);
    }
  }


  function verifySingleCrossingError(issues) {
    // each entity must produce an identical issue
    expect(issues).to.have.lengthOf(1);

    for (const issue of issues) {
      expect(issue.type).to.eql('ambiguous_crossing_tags');
      expect(issue.severity).to.eql('error');

      expect(issue.entityIds).to.have.lengthOf(2);
      expect(issue.loc).to.eql([0, 0]);
    }
  }


  it('ignores untagged lines that share an untagged crossing node', () => {
    createWaysWithOneCrossingNode();
    const issues = validate();
    expect(issues).to.have.lengthOf(0);
  });

  it('flags unmarked lines that share a marked crossing node', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'unmarked', highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { 'crossing:markings' : 'yes' }
    );
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags unmarked lines that share a zebra-marked crossing node', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'unmarked', highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { MARKING_TAG: 'zebra' }
    );
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags marked lines that share an unmarked crossing node', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'marked', highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { 'crossing:markings': 'no' }
    );
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags marked lines and nodes that have a different crossing marking type', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'marked', 'crossing:markings': 'zebra', highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { 'highway': 'crossing', 'crossing':'marked', 'crossing:markings': 'lines' }
    );
    const issues = validate();
    verifySingleCrossingError(issues);
  });

  it('flags an informal line and marked node', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'informal', highway: 'footway', footway: 'crossing' },
      { highway: 'residential' },
      { 'crossing:markings': 'lines' }
    );
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags a marked line and informal ladder node', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'marked', highway: 'footway', footway: 'crossing'},
      { highway: 'residential' },
      { 'highway':'crossing', 'crossing':'informal'}
    );
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

  it('flags a marked line with potential unmarked crossing nodes', () => {
    createWaysWithOneCrossingNode(
      { crossing: 'marked', highway: 'footway', footway: 'crossing'},
      { highway: 'residential' },
      {}
    );
    const issues = validate();
    verifySingleCrossingWarning(issues);
  });

});
