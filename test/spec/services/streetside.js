describe('iD.serviceStreetside', () => {
  const dimensions = [64, 64];
  let context, streetside;

  before(() => {
    iD.services.streetside = iD.serviceStreetside;
  });

  after(() => {
    delete iD.services.streetside;
  });

  beforeEach(() => {
    context = iD.coreContext()
      .assetPath('../dist/')
      .init();
    context.projection
      .scale(sdk.geoZoomToScale(14))
      .translate([-116508, 0])  // 10,0
      .dimensions([[0,0], dimensions]);

    streetside = iD.services.streetside;
    streetside.reset();
  });

  afterEach(() => {
    window.JSONP_FIX = undefined;
  });


  describe('#init', () => {
    it('Initializes cache one time', () => {
      const cache = streetside.cache();
      expect(cache).to.have.property('bubbles');
      expect(cache).to.have.property('sequences');

      streetside.init();
      const cache2 = streetside.cache();
      expect(cache).to.equal(cache2);
    });
  });

  describe('#reset', () => {
    it('resets cache', () => {
      streetside.cache().foo = 'bar';
      streetside.reset();
      expect(streetside.cache()).to.not.have.property('foo');
    });
  });

  describe('#loadBubbles', () => {
    it('fires loadedImages when bubbles are loaded', done => {
      // adjust projection so that only one tile is fetched
      // (JSONP hack will return the same data for every fetch)
      context.projection
        .scale(sdk.geoZoomToScale(18))
        .translate([-1863988.9381333336, 762.8270222954452])  // 10.002,0.002
        .dimensions([[0,0], dimensions]);

      const spy = sinon.spy();
      streetside.on('loadedImages', spy);

      window.JSONP_DELAY = 0;
      window.JSONP_FIX = [{
          elapsed: 0.001
        }, {
          id: 1, la: 0, lo: 10.001, al: 0, ro: 0, pi: 0, he: 0, bl: '',
          cd: '1/1/2018 12:00:00 PM', ml: 3, nbn: [], pbn: [], rn: [],
          pr: undefined, ne: 2
        }, {
          id: 2, la: 0, lo: 10.002, al: 0, ro: 0, pi: 0, he: 0, bl: '',
          cd: '1/1/2018 12:00:01 PM', ml: 3, nbn: [], pbn: [], rn: [],
          pr: 1, ne: 3
        }, {
          id: 3, la: 0, lo: 10.003, al: 0, ro: 0, pi: 0, he: 0, bl: '',
          cd: '1/1/2018 12:00:02 PM', ml: 3, nbn: [], pbn: [], rn: [],
          pr: 2, ne: undefined
        }
      ];

      streetside.loadBubbles(context.projection, 0);  // 0 = don't fetch margin tiles

      window.setTimeout(() => {
        expect(spy).to.have.been.calledOnce;
        done();
      }, 200);
    });

    it('does not load bubbles around null island', done => {
      context.projection
        .scale(sdk.geoZoomToScale(18))
        .translate([0, 0])
        .dimensions([[0,0], dimensions]);

      const spy = sinon.spy();
      streetside.on('loadedImages', spy);

      window.JSONP_DELAY = 0;
      window.JSONP_FIX = [{
          elapsed: 0.001
        }, {
          id: 1, la: 0, lo: 0, al: 0, ro: 0, pi: 0, he: 0, bl: '',
          cd: '1/1/2018 12:00:00 PM', ml: 3, nbn: [], pbn: [], rn: [],
          pr: undefined, ne: 2
        }, {
          id: 2, la: 0, lo: 0, al: 0, ro: 0, pi: 0, he: 0, bl: '',
          cd: '1/1/2018 12:00:01 PM', ml: 3, nbn: [], pbn: [], rn: [],
          pr: 1, ne: 3
        }, {
          id: 3, la: 0, lo: 0, al: 0, ro: 0, pi: 0, he: 0, bl: '',
          cd: '1/1/2018 12:00:02 PM', ml: 3, nbn: [], pbn: [], rn: [],
          pr: 2, ne: undefined
        }
      ];

      streetside.loadBubbles(context.projection, 0);  // 0 = don't fetch margin tiles

      window.setTimeout(() => {
        expect(spy).to.have.been.not.called;
        done();
      }, 200);
    });
  });


  describe('#bubbles', () => {
    it('returns bubbles in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: 1, loc: [10, 0], ca: 90, pr: undefined, ne: 2, isPano: true, sequenceID: 1 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: 2, loc: [10, 0], ca: 90, pr: 1, ne: 3, isPano: true, sequenceID: 1 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: 3, loc: [10, 1], ca: 90, pr: 2, ne: undefined, isPano: true, sequenceID: 1 } }
      ];

      streetside.cache().rtree.load(data);

      const result = streetside.bubbles(context.projection);
      expect(result).to.deep.eql([
        { id: 1, loc: [10, 0], ca: 90, pr: undefined, ne: 2, isPano: true, sequenceID: 1 },
        { id: 2, loc: [10, 0], ca: 90, pr: 1, ne: 3, isPano: true, sequenceID: 1 }
      ]);
    });
  });


  describe('#sequences', () => {
    it('returns sequence linestrings in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: 1, loc: [10, 0], ca: 90, pr: undefined, ne: 2, isPano: true, sequenceID: 1 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: 2, loc: [10, 0], ca: 90, pr: 1, ne: 3, isPano: true, sequenceID: 1 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: 3, loc: [10, 1], ca: 90, pr: 2, ne: undefined, isPano: true, sequenceID: 1 } }
      ];

      const sequence = {
        id: 1,
        bubbles: data.map(d => d.data),
        geojson: {
          type: 'LineString',
          properties: { id: 1 },
          coordinates: data.map(d => d.data.loc),
        }
      };

      streetside.cache().rtree.load(data);
      streetside.cache().sequences.set(1, sequence);

      const result = streetside.sequences(context.projection);
      expect(result).to.deep.eql([sequence.geojson]);
    });
  });

});
