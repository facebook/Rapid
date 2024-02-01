describe('TaginfoService', () => {
  let taginfo;

  class MockLocalizationSystem {
    constructor()  { }
    languageCode() { return 'en'; }
  }

  class MockContext {
    constructor() {
      this.systems = {
        l10n: new MockLocalizationSystem(this)
      };
    }
  }


  beforeEach(() => {
//    fetchMock.reset();
//    fetchMock.mock(new RegExp('\/keys\/all.*sortname=values_all'), {
//      body: '{"data":[{"count_all":56136034,"key":"name","count_all_fraction":0.0132}]}',
//      status: 200,
//      headers: { 'Content-Type': 'application/json' }
//    });
// note - init() used to fetch these common values, this has been moved to startAsync().
    fetchMock.reset();
    taginfo = new Rapid.TaginfoService(new MockContext());
    return taginfo.initAsync();
  });


  function parseQueryString(url) {
    return sdk.utilStringQs(url.substring(url.indexOf('?')));
  }


  describe('#keys', () => {
    it('calls the given callback with the results of the keys query', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":5190337,"key":"amenity","count_all_fraction":1.0}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.keys({ query: 'amen' }, callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { query: 'amen', page: '1', rp: '10', sortname: 'count_all', sortorder: 'desc', lang: 'en' }
        );
        expect(callback.calledOnceWithExactly(null, [{ title: 'amenity', value: 'amenity' }] )).to.be.ok;
        done();
      }, 20);
    });

    it('includes popular keys', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":5190337,"count_nodes":500000,"key":"amenity","count_all_fraction":1.0, "count_nodes_fraction":1.0},'
          + '{"count_all":1,"key":"amenityother","count_all_fraction":0.0, "count_nodes":100}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.keys({ query: 'amen' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [{ title: 'amenity', value: 'amenity' }] )).to.be.ok;
        done();
      }, 20);
    });

    it('includes popular keys with an entity type filter', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":5190337,"count_nodes":500000,"key":"amenity","count_all_fraction":1.0, "count_nodes_fraction":1.0},'
          + '{"count_all":1,"key":"amenityother","count_all_fraction":0.0, "count_nodes":100}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.keys({ query: 'amen', filter: 'nodes' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [{ title: 'amenity', value: 'amenity' }] )).to.be.ok;
        done();
      }, 20);
    });

    it('includes unpopular keys with a wiki page', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":5190337,"key":"amenity","count_all_fraction":1.0, "count_nodes_fraction":1.0},'
          + '{"count_all":1,"key":"amenityother","count_all_fraction":0.0, "count_nodes_fraction":0.0, "in_wiki": true}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.keys({ query: 'amen' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [
          { title: 'amenity', value: 'amenity' },
          { title: 'amenityother', value: 'amenityother' }
        ])).to.be.ok;
        done();
      }, 20);
    });

    it('sorts keys with \':\' below keys without \':\'', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"key":"ref:bag","count_all":9790586,"count_all_fraction":0.0028},' +
          '{"key":"ref","count_all":7933528,"count_all_fraction":0.0023}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.keys({ query: 'ref' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(
          null, [{ title: 'ref', value: 'ref' }, { title: 'ref:bag', value: 'ref:bag' }]
        )).to.be.ok;
        done();
      }, 20);
    });
  });

  describe('#multikeys', () => {
    it('calls the given callback with the results of the multikeys query', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":69593,"key":"recycling:glass","count_all_fraction":0.0}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.multikeys({ query: 'recycling:' }, callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { query: 'recycling:', page: '1', rp: '25', sortname: 'count_all', sortorder: 'desc', lang: 'en' }
        );
        expect(callback.calledOnceWithExactly(
          null, [{ title: 'recycling:glass', value: 'recycling:glass' }]
        )).to.be.ok;
        done();
      }, 20);
    });

    it('excludes multikeys with extra colons', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":4426,"key":"service:bicycle:retail","count_all_fraction":0.0},' +
          '{"count_all":22,"key":"service:bicycle:retail:ebikes","count_all_fraction":0.0}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.multikeys({ query: 'service:bicycle:' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(
          null, [{ title: 'service:bicycle:retail', value: 'service:bicycle:retail' }]
        )).to.be.ok;
        done();
      }, 20);
    });

    it('excludes multikeys with wrong prefix', done => {
      fetchMock.mock(/\/keys\/all/, {
        body: '{"data":[{"count_all":4426,"key":"service:bicycle:retail","count_all_fraction":0.0},' +
          '{"count_all":22,"key":"disused:service:bicycle","count_all_fraction":0.0}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.multikeys({ query: 'service:bicycle:' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(
          null, [{ title: 'service:bicycle:retail', value: 'service:bicycle:retail' }]
        )).to.be.ok;
        done();
      }, 20);
    });
  });

  describe('#values', () => {
    it('calls the given callback with the results of the values query', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"parking","description":"A place for parking cars", "fraction":0.1}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'amenity', query: 'par' }, callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          {key: 'amenity', query: 'par', page: '1', rp: '25', sortname: 'count_all', sortorder: 'desc', lang: 'en'}
        );
        expect(callback.calledOnceWithExactly(
          null, [{ value: 'parking', title: 'A place for parking cars' }]
        )).to.be.ok;
        done();
      }, 20);
    });

    it('includes popular values', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"parking","description":"A place for parking cars", "fraction":1.0},' +
          '{"value":"party","description":"A place for partying", "fraction":0.0}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'amenity', query: 'par' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(
          null, [{ value: 'parking', title: 'A place for parking cars' }]
        )).to.be.ok;
        done();
      }, 20);
    });

    it('does not get values for extremely popular keys', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"Rue Pasteur","description":"", "fraction":0.0001},' +
          '{"value":"Via Trieste","description":"", "fraction":0.0001}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'full_name', query: 'ste' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [])).to.be.ok;
        done();
      }, 20);
    });

    it('excludes values with capital letters and some punctuation', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"parking","description":"A place for parking cars", "fraction":0.2},'
          + '{"value":"PArking","description":"A common misspelling", "fraction":0.2},'
          + '{"value":"parking;partying","description":"A place for parking cars *and* partying", "fraction":0.2},'
          + '{"value":"parking, partying","description":"A place for parking cars *and* partying", "fraction":0.2},'
          + '{"value":"*","description":"", "fraction":0.2}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'amenity', query: 'par' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(
          null, [{ value: 'parking', title: 'A place for parking cars' }]
        )).to.be.ok;
        done();
      }, 20);
    });

    it('includes network values with capital letters and some punctuation', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"US:TX:FM","description":"Farm to Market Roads in the U.S. state of Texas.", "fraction":0.34},'
          + '{"value":"US:KY","description":"Primary and secondary state highways in the U.S. state of Kentucky.", "fraction":0.31},'
          + '{"value":"US:US","description":"U.S. routes in the United States.", "fraction":0.19},'
          + '{"value":"US:I","description":"Interstate highways in the United States.", "fraction":0.11},'
          + '{"value":"US:MD","description":"State highways in the U.S. state of Maryland.", "fraction":0.06}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'network', query: 'us' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [
          { value: 'US:TX:FM', title: 'Farm to Market Roads in the U.S. state of Texas.' },
          { value: 'US:KY', title: 'Primary and secondary state highways in the U.S. state of Kentucky.' },
          { value: 'US:US', title: 'U.S. routes in the United States.' },
          { value: 'US:I', title: 'Interstate highways in the United States.' },
          { value: 'US:MD', title: 'State highways in the U.S. state of Maryland.' }
        ])).to.be.ok;
        done();
      }, 20);
    });

    it('includes biological genus values with capital letters', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"Quercus","description":"Oak", "fraction":0.5}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'genus', query: 'qu' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [{ value: 'Quercus', title: 'Oak' }] )).to.be.ok;
        done();
      }, 20);
    });

    it('includes biological taxon values with capital letters', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"Quercus robur","description":"Oak", "fraction":0.5}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'taxon', query: 'qu' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [{ value: 'Quercus robur', title: 'Oak' }] )).to.be.ok;
        done();
      }, 20);
    });

    it('includes biological species values with capital letters', done => {
      fetchMock.mock(/\/key\/values/, {
        body: '{"data":[{"value":"Quercus robur","description":"Oak", "fraction":0.5}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.values({ key: 'species', query: 'qu' }, callback);

      window.setTimeout(() => {
        expect(callback.calledOnceWithExactly(null, [{ value: 'Quercus robur', title: 'Oak' }] )).to.be.ok;
        done();
      }, 20);
    });
  });

  describe('#roles', () => {
    it('calls the given callback with the results of the roles query', done => {
      fetchMock.mock(/\/relation\/roles/, {
        body: '{"data":[{"role":"stop","count_relation_members_fraction":0.1757},' +
          '{"role":"south","count_relation_members_fraction":0.0035}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.roles({ rtype: 'route', query: 's', geometry: 'relation' }, callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql(
          { rtype: 'route', query: 's', page: '1', rp: '25', sortname: 'count_relation_members', sortorder: 'desc', lang: 'en' }
        );
        expect(callback.calledOnceWithExactly(null, [
          { value: 'stop', title: 'stop' },
          { value: 'south', title: 'south' }
        ])).to.be.ok;
        done();
      }, 20);
    });
  });

  describe('#docs', () => {
    it('calls the given callback with the results of the docs query', done => {
      fetchMock.mock(/\/tag\/wiki_page/, {
        body: '{"data":[{"on_way":false,"lang":"en","on_area":true,"image":"File:Car park2.jpg"}]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const callback = sinon.spy();
      taginfo.docs({ key: 'amenity', value: 'parking' }, callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.lastUrl())).to.eql({ key: 'amenity', value: 'parking' });
        expect(callback.calledOnceWithExactly(
          null, [{ on_way: false, lang: 'en', on_area: true, image: 'File:Car park2.jpg' }]
        )).to.be.ok;
        done();
      }, 20);
    });
  });

});
