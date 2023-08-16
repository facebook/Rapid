describe('LocationSystem', () => {
  let _locationSystem;

  const colorado = {
    type: 'Feature',
    id: 'colorado.geojson',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-107.9197, 41.0039],
          [-102.0539, 41.0039],
          [-102.043, 36.9948],
          [-109.0425, 37.0003],
          [-109.048, 40.9984],
          [-107.9197, 41.0039]
        ]
      ]
    }
  };

  const fc = { type: 'FeatureCollection', features: [colorado] };


  beforeEach(() => {
    _locationSystem = new Rapid.LocationSystem();
  });


  describe('#mergeCustomGeoJSON', () => {
    it('merges geojson into lococation-conflation cache', () => {
      _locationSystem.mergeCustomGeoJSON(fc);
      expect(_locationSystem.loco()._cache['colorado.geojson']).to.be.eql(colorado);
    });
  });


  describe('#mergeLocationSets', () => {
    it('returns a promise rejected if not passed an array', done => {
      const prom = _locationSystem.mergeLocationSets({});
      expect(prom).to.be.an.instanceof(Promise);
      prom
        .then(() => {
          done(new Error('This was supposed to fail, but somehow succeeded.'));
        })
        .catch(err => {
          expect(/^nothing to do/.test(err)).to.be.true;
          done();
        });
    });

    it('resolves locationSets, assigning locationSetID', () => {
      const data = [
        { id: 'world', locationSet: { include: ['001'] } },
        { id: 'usa',   locationSet: { include: ['usa'] } }
      ];

      return _locationSystem.mergeLocationSets(data)
        .then(data => {
          expect(data).to.be.a('array');
          expect(data[0].locationSetID).to.eql('+[Q2]');
          expect(data[1].locationSetID).to.eql('+[Q30]');
        });
    });

    it('resolves locationSets, falls back to world locationSetID on errror', () => {
      const data = [
        { id: 'bogus1', locationSet: { foo: 'bar' } },
        { id: 'bogus2', locationSet: { include: ['fake.geojson'] } }
      ];

      return _locationSystem.mergeLocationSets(data)
        .then(data => {
          expect(data).to.be.a('array');
          expect(data[0].locationSetID).to.eql('+[Q2]');
          expect(data[1].locationSetID).to.eql('+[Q2]');
        });
    });
  });


  describe('#locationSetID', () => {
    it('calculates a locationSetID for a locationSet', () => {
      expect(_locationSystem.locationSetID({ include: ['usa'] })).to.be.eql('+[Q30]');
    });

    it('falls back to the world locationSetID in case of errors', () => {
      expect(_locationSystem.locationSetID({ foo: 'bar' })).to.be.eql('+[Q2]');
      expect(_locationSystem.locationSetID({ include: ['fake.geojson'] })).to.be.eql('+[Q2]');
    });
  });


  describe('#feature', () => {
    it('has the world locationSet pre-resolved', () => {
      const result = _locationSystem.feature('+[Q2]');
      expect(result).to.include({ type: 'Feature', id: '+[Q2]' });
    });

    it('falls back to the world locationSetID in case of errors', () => {
      const result = _locationSystem.feature('fake');
      expect(result).to.include({ type: 'Feature', id: '+[Q2]' });
    });
  });


  describe('#locationSetsAt', () => {
    it('has the world locationSet pre-resolved', () => {
      const result1 = _locationSystem.locationSetsAt([-108.557, 39.065]);  // Grand Junction
      expect(result1).to.be.an('object').that.has.all.keys('+[Q2]');
      const result2 = _locationSystem.locationSetsAt([-74.481, 40.797]);   // Morristown
      expect(result2).to.be.an('object').that.has.all.keys('+[Q2]');
      const result3 = _locationSystem.locationSetsAt([13.575, 41.207,]);   // Gaeta
      expect(result3).to.be.an('object').that.has.all.keys('+[Q2]');
    });

    it('returns valid locationSets at a given lon,lat', () => {
      // setup, load colorado.geojson and resolve some locationSets
      _locationSystem.mergeCustomGeoJSON(fc);
      const data = [
        { id: 'OSM-World', locationSet: { include: ['001'] } },
        { id: 'OSM-USA', locationSet: { include: ['us'] } },
        { id: 'OSM-Colorado', locationSet: { include: ['colorado.geojson'] } }
      ];
      return _locationSystem.mergeLocationSets(data)
        .then(() => {
          const result1 = _locationSystem.locationSetsAt([-108.557, 39.065]);  // Grand Junction
          expect(result1).to.be.an('object').that.has.all.keys('+[Q2]', '+[Q30]', '+[colorado.geojson]');
          const result2 = _locationSystem.locationSetsAt([-74.481, 40.797]);   // Morristown
          expect(result2).to.be.an('object').that.has.all.keys('+[Q2]', '+[Q30]');
          const result3 = _locationSystem.locationSetsAt([13.575, 41.207,]);   // Gaeta
          expect(result3).to.be.an('object').that.has.all.keys('+[Q2]');
        });
    });
  });

});
