describe('DataLoaderSystem', () => {
  let _dataLoader;

  class MockContext {
    constructor() {}
    asset(d) { return d; }
  }

  const context = new MockContext();


  beforeEach(() => {
    _dataLoader = new Rapid.DataLoaderSystem(context);
    return _dataLoader.initAsync();
  });


  describe('#fileMap', () => {
    it('gets the fileMap', () => {
      const fileMap = _dataLoader.fileMap;
      expect(fileMap).to.be.an.instanceof(Map);
    });
  });


  describe('#getDataAsync', () => {
    it('returns a promise resolved if we already have the data', () => {
      _dataLoader._cachedData.test = { hello: 'world' };

      const prom = _dataLoader.getDataAsync('test');
      expect(prom).to.be.an.instanceof(Promise);
      return prom
        .then(data => {
          expect(data).to.be.a('object');
          expect(data.hello).to.eql('world');
        });
    });

    it('returns a promise rejected if we can not get the data', done => {
      const prom = _dataLoader.getDataAsync('wat');
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

      const prom = _dataLoader.getDataAsync('intro_graph');
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
