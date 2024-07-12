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

  class MockImagerySystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    imageryUsed() { return ''; }
  }

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockPhotoSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    photosUsed()  { return ''; }
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
      this.viewport = new Rapid.sdk.Viewport();
      this.systems = {
        assets:   new Rapid.AssetSystem(this),
        editor:   new Rapid.EditSystem(this),
        imagery:  new MockImagerySystem(),
        l10n:     new MockLocalizationSystem(),
        map:      new MockSystem(),
        photos:   new MockPhotoSystem(),
        presets:  new MockSystem(),
        rapid:    new MockSystem(),
        storage:  new MockStorageSystem(),
        urlhash:  new MockUrlSystem()
      };
    }
    scene()       { return { layers: new Map() }; }
    selectedIDs() { return []; }
    on() {}
  }

  const context = new MockContext();

  before(() => {
    const editSystem = context.systems.editor;
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
    expect(issues).to.be.an.instanceOf(Array).with.lengthOf(0);
  });


  it('validateAsync returns a Promise, fulfilled when the validation has completed', () => {
    const n_1 = Rapid.osmNode({ id: 'n-1', loc: [0, 0], tags: { building: 'house', phone: '555-1212' } });

    const editor = context.systems.editor;
    editor.perform(Rapid.actionAddEntity(n_1));
    editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });

    const prom = _validator.validateAsync();
    expect(prom).to.be.an.instanceOf(Promise);

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
