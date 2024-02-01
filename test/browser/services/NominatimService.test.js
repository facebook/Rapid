describe('NominatimService', () => {
  let nominatim;

  class MockLocalizationSystem {
    constructor() {}
    localeCodes() { return ['en']; }
  }

  class MockContext {
    constructor() {
      this.systems = {
        l10n: new MockLocalizationSystem(this)
      };
    }
  }

  beforeEach(() => {
    fetchMock.reset();
    fetchMock.mock(/reverse\?.*lat=48&lon=16/, {
      body: '{"address":{"country_code":"at"}}',
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    fetchMock.mock(/reverse\?.*lat=49&lon=17/, {
      body: '{"address":{"country_code":"cz"}}',
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    fetchMock.mock(/reverse\?.*lat=1000&lon=1000/, {
      body: '{"error":"Unable to geocode"}',
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    nominatim = new Rapid.NominatimService(new MockContext());
    return nominatim.initAsync();
  });


  function parseQueryString(url) {
    return sdk.utilStringQs(url.substring(url.indexOf('?')));
  }


  describe('#countryCode', () => {
    it('calls the given callback with the results of the country code query', done => {
      const callback = sinon.spy();
      nominatim.countryCode([16, 48], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '48', lon: '16' }
        );
        expect(callback.calledOnceWithExactly(null, 'at')).to.be.ok;
        done();
      }, 20);
    });
  });


  describe('#reverse', () => {
    it('should not cache distant result', done => {
      let callback = sinon.spy();
      nominatim.reverse([16, 48], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '48', lon: '16' }
        );
        expect(callback.calledOnceWithExactly(null, { address: { country_code:'at' }})).to.be.ok;

        fetchMock.resetHistory();
        callback = sinon.spy();
        nominatim.reverse([17, 49], callback);

        window.setTimeout(() => {
          expect(parseQueryString(fetchMock.lastUrl())).to.eql(
            { zoom: '13', format: 'json', addressdetails: '1', lat: '49', lon: '17' }
          );
          expect(callback.calledOnceWithExactly(null, { address: { country_code:'cz' }})).to.be.ok;
          done();
        }, 50);
      }, 50);
    });

    it('should cache nearby result', done => {
      let callback = sinon.spy();
      nominatim.reverse([16, 48], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '48', lon: '16' }
        );
        expect(callback.calledOnceWithExactly(null, { address: { country_code:'at' }})).to.be.ok;

        fetchMock.resetHistory();

        callback = sinon.spy();
        nominatim.reverse([16.000001, 48.000001], callback);

        window.setTimeout(() => {
          expect(callback.calledOnceWithExactly(null, { address: { country_code:'at' }})).to.be.ok;
          done();
        }, 50);
      }, 50);
    });


    it('handles "unable to geocode" result as an error', done => {
      const callback = sinon.spy();
      nominatim.reverse([1000, 1000], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '1000', lon: '1000' }
        );
        expect(callback.calledOnceWithExactly('Unable to geocode')).to.be.ok;
        done();
      }, 50);
    });
  });


  describe('#search', () => {
    it('calls the given callback with the results of the search query', done => {
      const callback = sinon.spy();
      fetchMock.mock(/search/, {
        body: '[{"place_id":"158484588","osm_type":"relation","osm_id":"188022","boundingbox":["39.867005","40.1379593","-75.2802976","-74.9558313"],"lat":"39.9523993","lon":"-75.1635898","display_name":"Philadelphia, Philadelphia County, Pennsylvania, United States of America","class":"place","type":"city","importance":0.83238050437778}]',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      nominatim.search('philadelphia', callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql({q: 'philadelphia', format: 'json', limit: '10' });
        expect(callback.calledOnce).to.be.ok;
        done();
      }, 50);
    });
  });

});
