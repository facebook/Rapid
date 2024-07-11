describe('MapSystem', () => {
  let _container, _mapSystem;

  class MockSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    on()          { return this; }
    off()         { return this; }
  }

  class MockStorageSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    getItem()     { return ''; }
  }

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockRenderer {
    constructor(context) {
      this.context = context;
      this.scene = new MockSystem();
    }
    resize() {}
    render() {}
    on() { return this; }
    deferredRender() {}
    setTransformAsync(t) {
      this.context.viewport.transform = t;
      return Promise.resolve(t);
    }
  }

  class MockContext {
    constructor()   {
      this.services = {};
      this.systems = {
        editor:  new MockSystem(),
        filters: new MockSystem(),
        imagery: new MockSystem(),
        photos:  new MockSystem(),
        l10n:    new MockLocalizationSystem(),
        storage: new MockStorageSystem(),
        urlhash: new MockSystem(),
        styles:  new MockSystem()
      };
      this.viewport = new sdk.Viewport(undefined, [100, 100]);
    }
    container()   { return _container; }
    keybinding()  { return new MockSystem(); }
  }


  beforeEach(() => {
    _container = d3.select('body').append('div');
    const context = new MockContext();  // get a fresh viewport each time
    _mapSystem = new Rapid.MapSystem(context);
    _mapSystem._renderer = new MockRenderer(context);

    return _mapSystem.initAsync()
      .then(() => _mapSystem.render(_container));
  });

  afterEach(() => {
    _container.remove();
  });


  describe('#zoom', () => {
    it('gets and sets zoom level', () => {
      expect(_mapSystem.zoom(4)).to.equal(_mapSystem);
      expect(_mapSystem.zoom()).to.equal(4);
    });

    it('respects minzoom', () => {
      _mapSystem.zoom(1);
      expect(_mapSystem.zoom()).to.equal(2);
    });
  });


  describe('#zoomIn', () => {
    it('increments zoom', done => {
      expect(_mapSystem.zoom(4)).to.equal(_mapSystem);
      _mapSystem.zoomIn();
      window.setTimeout(() => {
        expect(_mapSystem.zoom()).to.be.closeTo(5, 1e-6);
        done();
      }, 1);
    });
  });

  describe('#zoomOut', () => {
    it('decrements zoom', done => {
      expect(_mapSystem.zoom(4)).to.equal(_mapSystem);
      _mapSystem.zoomOut();
      window.setTimeout(() => {
        expect(_mapSystem.zoom()).to.be.closeTo(3, 1e-6);
        done();
      }, 1);
    });
  });

  describe('#center', () => {
    it('gets and sets center', () => {
      expect(_mapSystem.center([0, 0])).to.equal(_mapSystem);
      expect(_mapSystem.center()[0]).to.be.closeTo(0, 1e-6);
      expect(_mapSystem.center()[1]).to.be.closeTo(0, 1e-6);
      expect(_mapSystem.center([10, 15])).to.equal(_mapSystem);
      expect(_mapSystem.center()[0]).to.be.closeTo(10, 1e-6);
      expect(_mapSystem.center()[1]).to.be.closeTo(15, 1e-6);
    });
  });

  describe('#centerEase', () => {
    it('sets center', done => {
      expect(_mapSystem.center([10, 10])).to.equal(_mapSystem);
      expect(_mapSystem.centerEase([20, 20], 1)).to.equal(_mapSystem);
      window.setTimeout(() => {
        expect(_mapSystem.center()[0]).to.be.closeTo(20, 1e-6);
        expect(_mapSystem.center()[1]).to.be.closeTo(20, 1e-6);
        done();
      }, 1);
    });
  });

  describe('#centerZoom', () => {
    it('gets and sets center and zoom', () => {
      expect(_mapSystem.centerZoom([20, 25], 4)).to.equal(_mapSystem);
      expect(_mapSystem.center()[0]).to.be.closeTo(20, 1e-6);
      expect(_mapSystem.center()[1]).to.be.closeTo(25, 1e-6);
      expect(_mapSystem.zoom()).to.be.equal(4);
    });
  });

  describe('#extent', () => {
    it('gets and sets extent', () => {
      _mapSystem.center([0, 0]);
      let extent;

      // get
      extent = new sdk.Extent(_mapSystem.extent());
      expect(extent.min[0]).to.be.closeTo(-17.5, 0.1);
      expect(extent.min[1]).to.be.closeTo(-17.3, 0.1);
      expect(extent.max[0]).to.be.closeTo(17.5, 0.1);
      expect(extent.max[1]).to.be.closeTo(17.3, 0.1);

      // set
      _mapSystem.extent( new sdk.Extent([10, 1], [30, 1]) );

      // get
      extent = new sdk.Extent(_mapSystem.extent());
      expect(extent.min[0]).to.be.closeTo(10, 0.1);
      expect(extent.min[1]).to.be.closeTo(-9, 0.1);
      expect(extent.max[0]).to.be.closeTo(30, 0.1);
      expect(extent.max[1]).to.be.closeTo(11, 0.1);

      // set
      _mapSystem.extent( new sdk.Extent([-1, -40], [1, -20]) );

      // get
      extent = new sdk.Extent(_mapSystem.extent());
      expect(extent.min[0]).to.be.closeTo(-11.6, 0.1);
      expect(extent.min[1]).to.be.closeTo(-39.5, 0.1);
      expect(extent.max[0]).to.be.closeTo(11.6, 0.1);
      expect(extent.max[1]).to.be.closeTo(-19.4, 0.1);
    });
  });

});
