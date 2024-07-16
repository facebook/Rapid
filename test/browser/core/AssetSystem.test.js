describe('AssetSystem', () => {
  let _assets;

  class MockContext {
    constructor() {}
    asset(d) { return d; }
  }

  const context = new MockContext();


  beforeEach(() => {
    _assets = new Rapid.AssetSystem(context);
    return _assets.initAsync();
  });


  describe('#origin', () => {
    it('sets and gets origin', () => {
      expect(_assets.origin).to.eql('latest');

      _assets.origin = 'local';
      expect(_assets.origin).to.eql('local');
    });
  });


  describe('#filePath', () => {
    it('sets and gets filePath', () => {
      expect(_assets.filePath).to.eql('');

      _assets.filePath = 'test/';
      expect(_assets.filePath).to.eql('test/');
    });
  });


  describe('#fileReplacements', () => {
    const TESTMAP = { 'test/img/loader.gif': '/assets/test/img/loader-b66184b5c4afbccc25f.gif' };

    it('sets and gets fileReplacements', () => {
      expect(_assets.fileReplacements).to.be.an('object').that.is.empty;

      _assets.fileReplacements = TESTMAP;
      expect(_assets.fileReplacements).to.eql(TESTMAP);
    });
  });


  describe('#sources', () => {
    it('gets the sources', () => {
      const sources = _assets.sources;
      expect(sources).to.be.an('object').that.has.all.keys(['latest', 'local']);
    });
  });


  describe('#getFileURL', () => {
    const TESTMAP = { 'test/img/loader.gif': '/assets/test/img/loader-b66184b5c4afbccc25f.gif' };

    beforeEach(() => {
      _assets.filePath = 'test/';
      _assets.fileReplacements = TESTMAP;
    });

    it('ignores urls', () => {
      expect(_assets.getFileURL('HTTP://hello')).to.eql('HTTP://hello');
      expect(_assets.getFileURL('https://world')).to.eql('https://world');
    });

    it('looks first in fileReplacements', () => {
      expect(_assets.getFileURL('img/loader.gif')).to.eql('/assets/test/img/loader-b66184b5c4afbccc25f.gif');
    });

    it('falls back to prepending assetPath', () => {
      expect(_assets.getFileURL('img/spinner.gif')).to.eql('test/img/spinner.gif');
    });
  });


  describe('#getAssetURL', () => {
    it('ignores urls', () => {
      expect(_assets.getAssetURL('HTTP://hello')).to.eql('HTTP://hello');
      expect(_assets.getAssetURL('https://world')).to.eql('https://world');
    });

    it('throws if origin is invalid', () => {
      _assets.origin = 'nope';
      expect(() => _assets.getAssetURL('intro_graph')).to.throw(/Unknown origin/);
    });

    it('throws if key is invalid', () => {
      _assets.origin = 'latest';
      expect(() => _assets.getAssetURL('nope')).to.throw(/Unknown asset key/);
    });

    it('returns the URL if the key is valid', () => {
      _assets.origin = 'latest';
      expect(_assets.getAssetURL('intro_graph')).to.eql('data/intro_graph.min.json');
    });
  });


  describe('#loadAssetAsync', () => {
    it('returns a promise resolved if we already have the data', () => {
      _assets._cache.test = { hello: 'world' };

      const prom = _assets.loadAssetAsync('test');
      expect(prom).to.be.an.instanceof(Promise);
      return prom
        .then(data => {
          expect(data).to.be.a('object');
          expect(data.hello).to.eql('world');
        });
    });

    it('returns a promise rejected if we can not get the data', done => {
      const prom = _assets.loadAssetAsync('wat');
      expect(prom).to.be.an.instanceof(Promise);
      prom
        .then(data => {
          done(new Error(`We were not supposed to get data but did: ${data}`));
        })
        .catch(err => {
          expect(/^Unknown asset/.test(err)).to.be.true;
          done();
        });
    });

    it('returns a promise to fetch data if we do not already have the data', () => {
      fetchMock.mock('/data/intro_graph.min.json', {
        body: JSON.stringify({ value: 'success' }),
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const prom = _assets.loadAssetAsync('intro_graph');
      expect(prom).to.be.an.instanceof(Promise);
      return prom
        .then(data => {
          expect(data).to.be.an('object');
          expect(data.value).to.eql('success');
          fetchMock.resetHistory();
        });
    });

  });
});
