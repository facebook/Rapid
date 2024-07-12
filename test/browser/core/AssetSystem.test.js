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


  describe('#fileMap', () => {
    it('gets the fileMap', () => {
      const fileMap = _assets.fileMap;
      expect(fileMap).to.be.an.instanceof(Map);
    });
  });


  describe('#getDataAsync', () => {
    it('returns a promise resolved if we already have the data', () => {
      _assets._cache.test = { hello: 'world' };

      const prom = _assets.getDataAsync('test');
      expect(prom).to.be.an.instanceof(Promise);
      return prom
        .then(data => {
          expect(data).to.be.a('object');
          expect(data.hello).to.eql('world');
        });
    });

    it('returns a promise rejected if we can not get the data', done => {
      const prom = _assets.getDataAsync('wat');
      expect(prom).to.be.an.instanceof(Promise);
      prom
        .then(data => {
          done(new Error(`We were not supposed to get data but did: ${data}`));
        })
        .catch(err => {
          expect(/^Unknown data file/.test(err)).to.be.true;
          done();
        });
    });

    it('returns a promise to fetch data if we do not already have the data', () => {
      fetchMock.mock('/data/intro_graph.min.json', {
        body: JSON.stringify({ value: 'success' }),
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const prom = _assets.getDataAsync('intro_graph');
      expect(prom).to.be.an.instanceof(Promise);
      return prom
        .then(data => {
          expect(data).to.be.a('object');
          expect(data.value).to.eql('success');
          fetchMock.resetHistory();
        });
    });

  });
});
