describe.skip('UrlHashSystem', () => {
  mocha.globals('__onhashchange.hash');

  let hash, context;

  beforeEach(() => {
    window.location.hash = '#background=none';   // Try not to load imagery
    const container = d3.select(document.createElement('div'));

    context = Rapid.coreContext();
    window.context = context;  // lol
    let cache = context.dataLoaderSystem()._cachedData;  // cache empty data so we dont try loading anything
    cache.imagery = [];
    cache.languages = { en: { nativeName: 'English'} };
    cache.locales = { en: { rtl: false, pct: 1 } };
    cache.locales_index_general = { en: { rtl: false, pct: 1 } };
    cache.locales_index_tagging = { en: { rtl: false, pct: 1 } };
    cache.locale_general_en = { en: {} };
    cache.locale_tagging_en = { en: {} };
    cache.preset_categories = {};
    cache.preset_defaults = {};
    cache.preset_fields = {};
    cache.preset_presets = {};
    cache.deprecated = [];
    cache.discarded = {};
    context.init();
    context.container(container);
    container.call(context.map().render);
    hash = new Rapid.UrlHash(context);
  });

  afterEach(() => {
    hash.disable();
    window.location.hash = '#background=none';   // Try not to load imagery
  });


  it('centerZooms map to requested level', () => {
    window.location.hash = '#background=none&map=20.00/38.87952/-77.02405';
    hash.enable();
    expect(context.map().center()[0]).to.be.closeTo(-77.02405, 0.1);
    expect(context.map().center()[1]).to.be.closeTo(38.87952, 0.1);
    expect(context.map().zoom()).to.equal(20.0);
  });

  it('centerZooms map at requested coordinates on hashchange', done => {
    hash.enable();
    d3.select(window).on('hashchange', () => {
      expect(context.map().center()[0]).to.be.closeTo(-77.02405, 0.1);
      expect(context.map().center()[1]).to.be.closeTo(38.87952, 0.1);
      expect(context.map().zoom()).to.equal(20.0);
      d3.select(window).on('hashchange', null);
      done();
    });
    window.location.hash = '#background=none&map=20.00/38.87952/-77.02405';
  });

  it('stores the current zoom and coordinates in window.location.hash on map move events', done => {
    hash.enable();
    context.map().center([-77.0, 38.9]);
    context.map().zoom(2.0);
    window.setTimeout(() => {
      expect(window.location.hash).to.equal('#background=none&map=2.00/38.9/-77.0');
      done();
    }, 300);
  });
});