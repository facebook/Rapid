describe('uiFieldWikipedia', () => {
  let graph, entity, selection, field;

  class MockWikidataService {
    constructor() { }
    itemsByTitle(lang, title, callback) {
      callback({ Q216353: { id: 'Q216353' }} );
    }
  }

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: graph }; }
  }

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockContext {
    constructor()   {
      this.services = {
        wikidata:    new MockWikidataService(this)
      };
      this.systems = {
        assets:  new Rapid.AssetSystem(this),
        editor:  new MockEditSystem(this),
        l10n:    new MockLocalizationSystem(this)
      };
    }
    cleanTagKey(val)    { return val; }
    cleanTagValue(val)  { return val; }
    container()         { return selection; }
  }

  const context = new MockContext();


  beforeEach(() => {
    entity = Rapid.osmNode({ id: 'n-1', tags: {} });
    graph = new Rapid.Graph([entity]);

    selection = d3.select(document.createElement('div'));
    field = new Rapid.Field(context, 'wikipedia', {
      key: 'wikipedia',
      keys: ['wikipedia', 'wikidata'],
      type: 'wikipedia'
    });
  });


  function changeTags(changed) {
    let tags = JSON.parse(JSON.stringify(entity.tags));   // deep copy
    for (const [k, v] of Object.entries(changed)) {
      tags[k] = v;
    }
    entity = entity.update({ tags: tags });
    graph = graph.replace(entity);
  }


  it('recognizes lang:title format', done => {
    const wikipedia = Rapid.uiFieldWikipedia(context, field);
    window.setTimeout(() => {   // async, so data will be available
      selection.call(wikipedia);
      wikipedia.tags({ wikipedia: 'en:Title' });

      expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'))).to.equal('English');
      expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-title'))).to.equal('Title');
      done();
    }, 20);
  });


  it('sets language, value', done => {
    const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
    window.setTimeout(() => {   // async, so data will be available
      wikipedia.on('change', changeTags);
      selection.call(wikipedia);

      const spy = sinon.spy();
      wikipedia.on('change.spy', spy);

      Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'), 'Deutsch');
      happen.once(selection.selectAll('.wiki-lang').node(), { type: 'change' });
      happen.once(selection.selectAll('.wiki-lang').node(), { type: 'blur' });

      Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'Title');
      happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });
      happen.once(selection.selectAll('.wiki-title').node(), { type: 'blur' });

      expect(spy.callCount).to.equal(4);
      expect(spy.getCall(0).args[0]).to.deep.equal({ wikipedia: undefined});  // lang on change
      expect(spy.getCall(1).args[0]).to.deep.equal({ wikipedia: undefined});  // lang on blur
      expect(spy.getCall(2).args[0]).to.deep.equal({ wikipedia: 'de:Title' });   // title on change
      expect(spy.getCall(3).args[0]).to.deep.equal({ wikipedia: 'de:Title' });   // title on blur
      done();
    }, 20);
  });


  it('recognizes pasted URLs', done => {
    const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
    window.setTimeout(() => {   // async, so data will be available
      wikipedia.on('change', changeTags);
      selection.call(wikipedia);

      Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'http://de.wikipedia.org/wiki/Title');
      happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });

      expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'))).to.equal('Deutsch');
      expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-title'))).to.equal('Title');
      done();
    }, 20);
  });


  describe('encodePath', () => {
    it('returns an encoded URI component that contains the title with spaces replaced by underscores', done => {
      const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
      expect(wikipedia.encodePath('? (film)', undefined)).to.equal('%3F_(film)');
      done();
    });

    it('returns an encoded URI component that includes an anchor fragment', done => {
      const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
      // this can be tested manually by entering '? (film)#Themes and style in the search box before focusing out'
      expect(wikipedia.encodePath('? (film)', 'Themes and style')).to.equal('%3F_(film)#Themes_and_style');
      done();
    });
  });


  describe('encodeURIAnchorFragment', () => {
    it('returns an encoded URI anchor fragment', done => {
      const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
      // this can be similarly tested by entering 'Section#Arts, entertainment and media' in the search box before focusing out'
      expect(wikipedia.encodeURIAnchorFragment('Theme?')).to.equal('#Theme%3F');
      done();
    });

    it('replaces all whitespace characters with underscore', done => {
      const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
      expect(wikipedia.encodeURIAnchorFragment('Themes And Styles')).to.equal('#Themes_And_Styles');
      done();
    });

    it('encodes % characters, does not replace them with a dot', done => {
      const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
      expect(wikipedia.encodeURIAnchorFragment('Is%this_100% correct')).to.equal('#Is%25this_100%25_correct');
      done();
    });

    it('encodes characters that are URI encoded characters', done => {
      const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
      expect(wikipedia.encodeURIAnchorFragment('Section %20%25')).to.equal('#Section_%2520%2525');
      done();
    });
  });


  it('preserves existing language', done => {
    const wikipedia1 = Rapid.uiFieldWikipedia(context, field);
    window.setTimeout(() => {   // async, so data will be available
      selection.call(wikipedia1);
      Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'), 'Deutsch');

      const wikipedia2 = Rapid.uiFieldWikipedia(context, field);
      window.setTimeout(() => {   // async, so data will be available
        selection.call(wikipedia2);
        wikipedia2.tags({});
        expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'))).to.equal('Deutsch');
        done();
      }, 20);
    }, 20);
  });


  it.skip('does not set delayed wikidata tag if graph has changed', done => {
    const wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
    const editor = context.systems.editor;
    wikipedia.on('change', changeTags);
    selection.call(wikipedia);

    const spy = sinon.spy();
    wikipedia.on('change.spy', spy);

    // Set title to "Skip"
    Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'), 'Deutsch');
    Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'Skip');
    happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });
    happen.once(selection.selectAll('.wiki-title').node(), { type: 'blur' });

    // t0
    const graph = editor.staging.graph;
    expect(graph.entity(entity.id).tags.wikidata).to.be.undefined;

    // t30:  graph change - Set title to "Title"
    window.setTimeout(() => {
      Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'Title');
      happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });
      happen.once(selection.selectAll('.wiki-title').node(), { type: 'blur' });
    }, 30);

    // t60:  at t0 + 60ms (delay), wikidata SHOULD NOT be set because graph has changed.

    // t70:  check that wikidata unchanged
    window.setTimeout(() => {
      const graph = editor.staging.graph;
      expect(graph.entity(entity.id).tags.wikidata).to.be.undefined;
    }, 70);

    // t90:  at t30 + 60ms (delay), wikidata SHOULD be set because graph is unchanged.

    // t100:  check that wikidata has changed
    window.setTimeout(() => {
      const graph = editor.staging.graph;
      expect(graph.entity(entity.id).tags.wikidata).to.equal('Q216353');

      expect(spy.callCount).to.equal(4);
      expect(spy.getCall(0)).to.have.been.calledWith({ wikipedia: 'de:Skip' });   // 'Skip' on change
      expect(spy.getCall(1)).to.have.been.calledWith({ wikipedia: 'de:Skip' });   // 'Skip' on blur
      expect(spy.getCall(2)).to.have.been.calledWith({ wikipedia: 'de:Title' });  // 'Title' on change +10ms
      expect(spy.getCall(3)).to.have.been.calledWith({ wikipedia: 'de:Title' });  // 'Title' on blur   +10ms
      done();
    }, 100);

  });
});
