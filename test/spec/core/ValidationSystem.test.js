describe('ValidationSystem', () => {
  let _validator;

  class MockStorageSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    getItem() { return ''; }
    hasItem() { return false; }
    setItem() { }
  }

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t()           { return ''; }
    tHtml()       { return ''; }
  }

  class MockPresetSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
  }

  class MockMapSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    extent()      { return new sdk.Extent(); }
  }

  class MockContext {
    constructor()   {
      this.initialHashParams = {};
      this.projection = new sdk.Projection();

      this._localizationSystem = new MockLocalizationSystem();
      this._mapSystem = new MockMapSystem();
      this._presetSystem = new MockPresetSystem();
      this._storageSystem = new MockStorageSystem();
      this._dataLoaderSystem = new Rapid.DataLoaderSystem(this);
      this._editSystem = new Rapid.EditSystem(this);
      this.graph = this._editSystem.graph;
      this.hasEntity = (id) => this._editSystem.graph().hasEntity(id);
     }

    dataLoaderSystem()    { return this._dataLoaderSystem; }
    editSystem()          { return this._editSystem; }
    localizationSystem()  { return this._localizationSystem; }
    mapSystem()           { return this._mapSystem; }
    presetSystem()        { return this._presetSystem; }
    storageSystem()       { return this._storageSystem; }
    selectedIDs()         { return []; }
    on() {}
  }

  const context = new MockContext();

  before(() => {
    const editSystem = context.editSystem();
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
    context.editSystem().perform( Rapid.actionAddEntity(n1) );

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
