describe('uiFieldLocalized', () => {
  let selection, field;

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: new Rapid.Graph() }; }
  }

  class MockLocalizationSystem {
    constructor() { }
    localeCode()     { return 'en-US'; }
    languageCode()   { return 'en'; }
    t(id)            { return id; }
    tHtml(id)        { return id; }
    languageName(code) {
      const langs = {
        de: { nativeName: 'Deutsch' },
        en: { nativeName: 'English' }
      };
      return langs[code]?.nativeName;
    }
  }

  class MockContext {
    constructor()   {
      this.services = {};
      this.systems = {
        assets:  new Rapid.AssetSystem(this),
        editor:  new MockEditSystem(this),
        l10n:    new MockLocalizationSystem(this)
      };
    }
    cleanTagKey(val)   { return val; }
    cleanTagValue(val) { return val; }
    container()        { return selection; }
  }

  const context = new MockContext();


  beforeEach(() => {
    selection = d3.select(document.createElement('div'));
    field = new Rapid.Field(context, 'name', { key: 'name', type: 'localized' });
    field.locked = () => { return false; };
  });


  it('adds a blank set of fields when the + button is clicked', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      happen.click(selection.selectAll('.localized-add').node());
      expect(selection.selectAll('.localized-lang').nodes().length).to.equal(1);
      expect(selection.selectAll('.localized-value').nodes().length).to.equal(1);
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('doesn\'t create a tag when the value is empty', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      happen.click(selection.selectAll('.localized-add').node());

      localized.on('change', tags => {
        expect(tags).to.eql({});
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'Deutsch');
      happen.once(selection.selectAll('.localized-lang').node(), { type: 'change' });
      happen.once(selection.selectAll('.localized-lang').node(), { type: 'blur' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('doesn\'t create a tag when the name is empty', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      happen.click(selection.selectAll('.localized-add').node());

      localized.on('change', tags => {
        expect(tags).to.eql({});
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-value'), 'Value');
      happen.once(selection.selectAll('.localized-value').node(), { type: 'change' });
      happen.once(selection.selectAll('.localized-value').node(), { type: 'blur' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('creates a tag after setting language then value', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      happen.click(selection.selectAll('.localized-add').node());

      Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'Deutsch');
      happen.once(selection.selectAll('.localized-lang').node(), { type: 'change' });

      localized.on('change', tags => {
        expect(tags).to.eql({ 'name:de': 'Value' });
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-value'), 'Value');
      happen.once(selection.selectAll('.localized-value').node(), { type: 'change' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('creates a tag after setting value then language', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      happen.click(selection.selectAll('.localized-add').node());

      Rapid.utilGetSetValue(selection.selectAll('.localized-value'), 'Value');
      happen.once(selection.selectAll('.localized-value').node(), { type: 'change' });

      localized.on('change', tags => {
        expect(tags).to.eql({ 'name:de': 'Value' });
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'Deutsch');
      happen.once(selection.selectAll('.localized-lang').node(), { type: 'change' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('changes an existing language', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      localized.tags({ 'name:de': 'Value' });

      localized.on('change', tags => {
        expect(tags).to.eql({ 'name:de': undefined, 'name:en': 'Value' });
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'English');
      happen.once(selection.selectAll('.localized-lang').node(), { type: 'change' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('ignores similar keys like `old_name`', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      localized.tags({ 'old_name:de': 'Value' });

      expect(selection.selectAll('.localized-lang').empty()).to.be.ok;
      expect(selection.selectAll('.localized-value').empty()).to.be.ok;
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('removes the tag when the language is emptied', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      localized.tags({ 'name:de': 'Value' });

      localized.on('change', tags => {
        expect(tags).to.eql({ 'name:de': undefined });
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), '');
      happen.once(selection.selectAll('.localized-lang').node(), { type: 'change' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });


  it('removes the tag when the value is emptied', done => {
    const localized = Rapid.uiFieldLocalized(context, field);
    window.setTimeout(() => {
      selection.call(localized);
      localized.tags({ 'name:de': 'Value' });

      localized.on('change', tags => {
          expect(tags).to.eql({'name:de': undefined });
      });

      Rapid.utilGetSetValue(selection.selectAll('.localized-value'), '');
      happen.once(selection.selectAll('.localized-value').node(), { type: 'change' });
      done();
    }, 1);  // async, so AssetSystem promise will have settled
  });
});
