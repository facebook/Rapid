describe('ValidationSystem', () => {
  let _validator;

  class MockSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    on()          { return this; }
  }

  class MockStorageSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    getItem()     { return ''; }
    hasItem()     { return false; }
    setItem()     { }
  }

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t()           { return ''; }
    tHtml()       { return ''; }
  }

  class MockMapSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    extent()      { return new sdk.Extent(); }
  }

  class MockUrlSystem {
    constructor() {
      this.initialHashParams = new Map();
    }
    initAsync()   { return Promise.resolve(); }
    on()          { return this; }
  }

  class MockContext {
    constructor()   {
      this.projection = new sdk.Projection();
      this.systems = {
        data:     new Rapid.DataLoaderSystem(this),
        edits:    new Rapid.EditSystem(this),
        l10n:     new MockLocalizationSystem(),
        map:      new MockMapSystem(),
        presets:  new MockSystem(),
        rapid:    new MockSystem(),
        storage:  new MockStorageSystem(),
        urlhash:  new MockUrlSystem()
      };
      this.graph = this.systems.edits.graph;
      this.hasEntity = (id) => this.systems.edits.graph().hasEntity(id);
     }
    selectedIDs() { return []; }
    on() {}
  }

  const context = new MockContext();

  before(() => {
    const editSystem = context.systems.edits;
    _validator = new Rapid.ValidationSystem(context);

    return editSystem.initAsync()
      .then(() => _validator.initAsync())
      .then(() => {
        // For now just run the one rule we are testing.
        // Otherwise we need to mock out anything used by any validator.
        for (const ruleID of _validator._rules.keys()) {
          if (ruleID !== 'private_data') {
            _validator._rules.delete(ruleID);
          }
        }
      });
  });


  it('has no issues on init', () => {
    const issues = _validator.getIssues({ what: 'all', where: 'all' });
    expect(issues).to.have.lengthOf(0);
  });


  it('validateAsync returns a Promise, fulfilled when the validation has completed', () => {
    const n1 = Rapid.osmNode({ id: 'n-1', loc: [0, 0], tags: { building: 'house', phone: '555-1212' } });
    context.systems.edits.perform( Rapid.actionAddEntity(n1) );

    const prom = _validator.validateAsync();
    expect(prom).to.be.a('promise');

    return prom
      .then(() => {
        const issues = _validator.getIssues({ what: 'all', where: 'all' });
        expect(issues).to.have.lengthOf(1);
        const issue = issues[0];
        expect(issue.type).to.eql('private_data');
        expect(issue.entityIds).to.have.lengthOf(1);
        expect(issue.entityIds[0]).to.eql('n-1');
      });
  });

});
