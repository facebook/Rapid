describe('OsmService', () => {
  let _osm, spy;

  class MockContext {
    constructor() {
      this.systems = {
        locations: new Rapid.LocationSystem(this)
      };
      this.viewport = new sdk.Viewport();
      this.viewport.transform = { x: -116508, y: 0, k: sdk.geoZoomToScale(14) };  // [10°, 0°]
      this.viewport.dimensions = [64, 64];
    }
    deferredRedraw()  { }
  }


  beforeEach(() => {
    spy = sinon.spy();
    fetchMock.reset();

    const capabilitiesJSON =
`{
  "version": "0.6",
  "generator": "OpenStreetMap server",
  "copyright": "OpenStreetMap and contributors",
  "attribution": "http://www.openstreetmap.org/copyright",
  "license": "http://opendatacommons.org/licenses/odbl/1-0/",
  "api": {
    "version": { "minimum": "0.6", "maximum": "0.6" },
    "area": { "maximum": 0.25 },
    "note_area": { "maximum": 25 },
    "tracepoints": { "per_page": 5000 },
    "waynodes": { "maximum": 2000 },
    "relationmembers": { "maximum": 32000 },
    "changesets": { "maximum_elements": 10000, "default_query_limit": 100, "maximum_query_limit": 100 },
    "notes": { "default_query_limit": 100, "maximum_query_limit": 10000 },
    "timeout": { "seconds": 300 },
    "status": { "database": "online", "api": "online", "gpx": "online" }
  },
  "policy": {
    "imagery": {
      "blacklist": [
        { "regex": "\.foo\.com" },
        { "regex": "\.bar\.org" }
      ]
    }
  }
}`;

    const capabilitiesXML =
`<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OpenStreetMap server" copyright="OpenStreetMap and contributors" attribution="http://www.openstreetmap.org/copyright" license="http://opendatacommons.org/licenses/odbl/1-0/">
  <api>
    <version minimum="0.6" maximum="0.6"/>
    <area maximum="0.25"/>
    <note_area maximum="25"/>
    <tracepoints per_page="5000"/>
    <waynodes maximum="2000"/>
    <changesets maximum_elements="10000"/>
    <timeout seconds="300"/>
    <status database="online" api="online" gpx="online"/>
  </api>
  <policy>
    <imagery>
      <blacklist regex="\.foo\.com"/>
      <blacklist regex="\.bar\.org"/>
    </imagery>
  </policy>
</osm>`;

    const userJSON =
`{
  "version": "0.6",
  "generator": "OpenStreetMap server",
  "copyright": "OpenStreetMap and contributors",
  "attribution": "http://www.openstreetmap.org/copyright",
  "license": "http://opendatacommons.org/licenses/odbl/1-0/",
  "user": {
    "id": 584325,
    "display_name": "bhousel",
    "account_created": "2010-01-01T00:00:00Z",
    "description": "Hi",
    "contributor_terms": { "agreed": true, "pd": true },
    "img": {"href": "https://www.gravatar.com/avatar/test.png"},
    "roles": [],
    "changesets": {"count": 999 },
    "traces": {"count": 999},
    "blocks": {"received": {"count": 0, "active": 0 } },
    "home": {"lat": 40, "lon": -74, "zoom": 3 },
    "languages": ["en", "en-US"],
    "messages": {
      "received": {"count": 99, "unread": 1 },
      "sent": {"count": 99 }
    }
  }
}`;

    const changesetJSON =
`{
  "version": "0.6",
  "generator": "OpenStreetMap server",
  "copyright": "OpenStreetMap and contributors",
  "attribution": "http://www.openstreetmap.org/copyright",
  "license": "http://opendatacommons.org/licenses/odbl/1-0/",
  "changesets": [
    {
      "id": 137842015,
      "created_at": "2023-06-01T00:00:00Z",
      "open": false,
      "comments_count": 0,
      "changes_count": 10,
      "closed_at": "2023-06-01T00:00:01Z",
      "min_lat": 40.060883,
      "min_lon": -75.2392873,
      "max_lat": 40.060993,
      "max_lon": -75.2391612,
      "uid": 584325,
      "user": "bhousel",
      "tags": {
        "comment": "Fix unsquare corners",
        "created_by": "Rapid 2.1.0",
        "host": "http://127.0.0.1:8080/",
        "locale": "en-US",
        "imagery_used": "Bing Maps Aerial"
      }
    },
    {
      "id": 137842016,
      "created_at": "2023-06-02T00:00:00Z",
      "open": false,
      "comments_count": 0,
      "changes_count": 10,
      "closed_at": "2023-06-02T00:00:01Z",
      "min_lat": 40.060883,
      "min_lon": -75.2392873,
      "max_lat": 40.060993,
      "max_lon": -75.2391612,
      "uid": 584325,
      "user": "bhousel",
      "tags": {
        "comment": "",
        "created_by": "Rapid 2.1.0",
        "host": "http://127.0.0.1:8080/",
        "locale": "en-US",
        "imagery_used": "Bing Maps Aerial"
      }
    },
    {
      "id": 137842017,
      "created_at": "2023-06-03T00:00:00Z",
      "open": false,
      "comments_count": 0,
      "changes_count": 10,
      "closed_at": "2023-06-02T00:00:01Z",
      "min_lat": 40.060883,
      "min_lon": -75.2392873,
      "max_lat": 40.060993,
      "max_lon": -75.2391612,
      "uid": 584325,
      "user": "bhousel",
      "tags": {
        "created_by": "Rapid 2.1.0",
        "host": "http://127.0.0.1:8080/",
        "locale": "en-US",
        "imagery_used": "Bing Maps Aerial"
      }
    }
  ]
}`;

    fetchMock
      .mock(/api\/capabilities\.json/, { status: 200, body: capabilitiesJSON, headers: { 'Content-Type': 'application/json' } })
      .mock(/api\/capabilities(?!\.json)/, { status: 200, body: capabilitiesXML, headers: { 'Content-Type': 'application/xml' } })
      .mock(/user\/details\.json/, { status: 200, body: userJSON, headers: { 'Content-Type': 'application/json' } })
      .mock(/changesets\.json/, { status: 200, body: changesetJSON, headers: { 'Content-Type': 'application/json' } });


    _osm = new Rapid.OsmService(new MockContext());
    return _osm.initAsync();
//why?
//      .then(() => _osm.switchAsync({ url: 'https://www.openstreetmap.org' }));
  });

  afterEach(() => {
    _osm.throttledReloadApiStatus.cancel();
    fetchMock.reset();
  });


  function loginAsync() {
    return _osm.switchAsync({
      url: 'https://www.openstreetmap.org',
      apiUrl: 'https://api.openstreetmap.org',
      client_id: 'O3g0mOUuA2WY5Fs826j5tP260qR3DDX7cIIE2R2WWSc',
      client_secret: 'b4aeHD1cNeapPPQTrvpPoExqQRjybit6JBlNnxh62uE',
      access_token: 'foo'  // preauth
    });
  }


  describe('#connectionID', () => {
    it('changes the connectionID every time service is reset', () => {
      const originalID = _osm.connectionID;
      return _osm.resetAsync()
        .then(() => expect(_osm.connectionID).to.be.above(originalID));
    });

    it('changes the connectionID every time service is switched', () => {
      const originalID = _osm.connectionID;
      const newOpts = {
        url: 'https://api06.dev.openstreetmap.org',
        apiUrl: 'https://api06.dev.openstreetmap.org'
      };
      return _osm.switchAsync(newOpts)
        .then(() => expect(_osm.connectionID).to.be.above(originalID) );
    });
  });

  describe('#changesetURL', () => {
    it('provides a changeset url based on wwwroot', () => {
      expect(_osm.changesetURL(2)).to.eql('https://www.openstreetmap.org/changeset/2');
    });
  });

  describe('#changesetsURL', () => {
    it('provides a local changesets url based on wwwroot', () => {
      const center = [-74.65, 40.65];
      const zoom = 17;
      expect(_osm.changesetsURL(center, zoom)).to.eql('https://www.openstreetmap.org/history#map=17/40.65000/-74.65000');
    });
  });

  describe('#entityURL', () => {
    it('provides an entity url for a node based on wwwroot', () => {
      const e = Rapid.osmNode({ id: 'n1' });
      expect(_osm.entityURL(e)).to.eql('https://www.openstreetmap.org/node/1');
    });

    it('provides an entity url for a way based on wwwroot', () => {
      const e = Rapid.osmWay({ id: 'w1' });
      expect(_osm.entityURL(e)).to.eql('https://www.openstreetmap.org/way/1');
    });

    it('provides an entity url for a relation based on wwwroot', () => {
      const e = Rapid.osmRelation({ id: 'r1' });
      expect(_osm.entityURL(e)).to.eql('https://www.openstreetmap.org/relation/1');
    });
  });

  describe('#historyURL', () => {
    it('provides a history url for a node based on wwwroot', () => {
      const e = Rapid.osmNode({ id: 'n1' });
      expect(_osm.historyURL(e)).to.eql('https://www.openstreetmap.org/node/1/history');
    });

    it('provides a history url for a way based on wwwroot', () => {
      const e = Rapid.osmWay({ id: 'w1' });
      expect(_osm.historyURL(e)).to.eql('https://www.openstreetmap.org/way/1/history');
    });

    it('provides a history url for a relation based on wwwroot', () => {
      const e = Rapid.osmRelation({ id: 'r1' });
      expect(_osm.historyURL(e)).to.eql('https://www.openstreetmap.org/relation/1/history');
    });
  });

  describe('#userURL', () => {
    it('provides a user url based on wwwroot', () => {
      expect(_osm.userURL('bob')).to.eql('https://www.openstreetmap.org/user/bob');
    });
  });


  describe('#resetAsync', () => {
    it('resets cache', () => {
      _osm._tileCache.loaded['0,0,0'] = true;
      return _osm.resetAsync()
        .then(() => expect(_osm._tileCache.loaded).to.not.have.property('0,0,0'));
    });
  });


  describe('#switchAsync', () => {
    it('changes the wwwroot', () => {
      const newOpts = {
        url: 'https://www.example.com',
        apiUrl: 'https://api.example.com'
      };
      return _osm.switchAsync(newOpts)
        .then(() => expect(_osm.changesetURL(1)).to.equal('https://www.example.com/changeset/1'));
    });

    it('emits a change event', () => {
      _osm.on('authchange', spy);
      const newOpts = {
        url: 'https://www.example.com',
        apiUrl: 'https://api.example.com'
      };
      return _osm.switchAsync(newOpts)
        .then(() => expect(spy.calledOnce).to.be.ok);
    });
  });

  describe('#loadFromAPI', () => {
    const path = '/api/0.6/map.json?bbox=-74.542,40.655,-74.541,40.656';
    const body =
`{
  "version":"0.6",
  "bounds":{"minlat":40.6550000,"minlon":-74.5420000,"maxlat":40.6560000,"maxlon":-74.5410000},
  "elements":[
    {"type":"node","id":"105340439","visible":true,"version":2,"changeset":2880013,"timestamp":"2009-10-18T07:47:39Z","user":"woodpeck_fixbot","uid":147510,"lat":40.6555,"lon":-74.5415},
    {"type":"node","id":"105340442","visible":true,"version":2,"changeset":2880013,"timestamp":"2009-10-18T07:47:39Z","user":"woodpeck_fixbot","uid":147510,"lat":40.6556,"lon":-74.5416},
    {"type":"way","id":"40376199","visible":true,"version":1,"changeset":2403012,"timestamp":"2009-09-07T16:01:13Z","user":"NJDataUploads","uid":148169,"nodes":[105340439,105340442],"tags":{"highway":"residential","name":"Potomac Drive"}}
  ]
}`;
    const okResponse = { status: 200, body: body, headers: { 'Content-Type': 'application/json' } };

    it('returns an object', done => {
      fetchMock.mock(/map\.json/, okResponse);

      _osm.loadFromAPI(path, (err, result) => {
        expect(err).to.not.be.ok;
        expect(typeof result).to.eql('object');
        done();
      });
    });


    it('retries an authenticated call unauthenticated if 400 Bad Request', done => {
      const badResponse = { status: 400, body: 'Bad Request', headers: { 'Content-Type': 'text/plain' } };

      fetchMock
        .mock((url, { headers }) => /map\.json/.test(url) && !!headers?.Authorization, badResponse)
        .mock((url, { headers }) => /map\.json/.test(url) && !headers?.Authorization,  okResponse);

      loginAsync()
        .then(() => {
          fetchMock.resetHistory();
          _osm.loadFromAPI(path, (err, result) => {
            expect(err).to.be.not.ok;
            expect(typeof result).to.eql('object');
            expect(_osm.authenticated()).to.be.not.ok;

            const calls = fetchMock.calls();
            expect(calls).to.have.lengthOf.at.least(2);   // auth, unauth, capabilities
            expect(calls[0][1]).to.have.nested.property('headers.Authorization');
            expect(calls[1][1]).to.not.have.nested.property('headers.Authorization');
            done();
          });
        });
    });


    it('retries an authenticated call unauthenticated if 401 Unauthorized', done => {
      const badResponse = { status: 401, body: 'Unauthorized', headers: { 'Content-Type': 'text/plain' } };

      fetchMock
        .mock((url, { headers }) => /map\.json/.test(url) && !!headers?.Authorization, badResponse)
        .mock((url, { headers }) => /map\.json/.test(url) && !headers?.Authorization,  okResponse);

      loginAsync()
        .then(() => {
          fetchMock.resetHistory();
          _osm.loadFromAPI(path, (err, result) => {
            expect(err).to.be.not.ok;
            expect(typeof result).to.eql('object');
            expect(_osm.authenticated()).to.be.not.ok;

            const calls = fetchMock.calls();
            expect(calls).to.have.lengthOf.at.least(2);   // auth, unauth, capabilities
            expect(calls[0][1]).to.have.nested.property('headers.Authorization');
            expect(calls[1][1]).to.not.have.nested.property('headers.Authorization');
            done();
          });
        });
    });

    it('retries an authenticated call unauthenticated if 403 Forbidden', done => {
      const badResponse = { status: 403, body: 'Forbidden', headers: { 'Content-Type': 'text/plain' } };

      fetchMock
        .mock((url, { headers }) => /map\.json/.test(url) && !!headers?.Authorization, badResponse)
        .mock((url, { headers }) => /map\.json/.test(url) && !headers?.Authorization,  okResponse);

      loginAsync()
        .then(() => {
          fetchMock.resetHistory();
          _osm.loadFromAPI(path, (err, result) => {
            expect(err).to.be.not.ok;
            expect(typeof result).to.eql('object');
            expect(_osm.authenticated()).to.be.not.ok;

            const calls = fetchMock.calls();
            expect(calls).to.have.lengthOf.at.least(2);   // auth, unauth, capabilities
            expect(calls[0][1]).to.have.nested.property('headers.Authorization');
            expect(calls[1][1]).to.not.have.nested.property('headers.Authorization');
            done();
          });
        });
    });
  });


  describe('#loadFromAPIWithErrors', () => {
    const path = '/api/0.6/map.json?bbox=-74.542,40.655,-74.541,40.656';
    const partialBody =
`{
  "version":"0.6",
  "bounds":{"minlat":40.6550000,"minlon":-74.5420000,"maxlat":40.6560000,"maxlon":-74.5410000},
  "elements":[
    {"type":"node","id":"105340439","visible":true,"version":2,"changeset":2880013,"timestamp":"2009-10-18T07:47:39Z","user":"woodpeck_fixbot","uid":147510,"lat":40.6555,"lon":-74.5415},
    {"type":"node","id":"105340442","visible":true,"version":2,"changeset":2880013,"timestamp":"2009-10-18T07:47:39Z","user":"woodpeck_fixbot","uid":147510,"lat":40.6556,"lon":-74.5416},
    {"type":"error", "message":"something went wrong loading postgres"},
    {"type":"way","id":"40376199","visible":true,"version":1,"changeset":2403012,"timestamp":"2009-09-07T16:01:13Z","user":"NJDataUploads","uid":148169,"nodes":[105340439,105340442],"tags":{"highway":"residential","name":"Potomac Drive"}}
  ]
}`;
    const partialResponse = { status: 200, body: partialBody, headers: { 'Content-Type': 'application/json' } };

    it('returns a partial JSON error', done => {
      fetchMock.mock(/map\.json/, partialResponse);

      _osm.loadFromAPI(path, err => {
        expect(err.message).to.eql('Partial JSON');
        done();
      });
    });
  });


  describe('#loadTiles', () => {
    const tileBody =
`{
  "version":"0.6",
  "bounds":{"minlat":40.6681396,"minlon":-74.0478516,"maxlat":40.6723060,"maxlon":-74.0423584},
  "elements":[
    {"type":"node","id":"368395606","visible":true,"version":3,"changeset":28924294,"timestamp":"2015-02-18T04:25:04Z","user":"peace2","uid":119748,"lat":40.6694299,"lon":-74.0444216,"tags":{"addr:state":"NJ","ele":"0","gnis:county_name":"Hudson","gnis:feature_id":"881377","gnis:feature_type":"Bay","name":"Upper Bay","natural":"bay"}}
  ]
}`;
    beforeEach(() => {
      const v = _osm.context.viewport;
      v.transform.zoom = 20;
      v.transform.translation = [55212042.434589595, 33248879.510193843];  // -74.0444216, 40.6694299
      v.dimensions = [64, 64];
    });

    it('calls callback when data tiles are loaded', done => {
      fetchMock.mock(/map\.json/, {
        body: tileBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const spy = sinon.spy();
      _osm.loadTiles(spy);

      window.setTimeout(() => {
        // was: calledOnce, now called multiple times as we fetch margin tiles
        expect(spy.called).to.be.ok;
        done();
      }, 50);
    });


    it('#isDataLoaded', () => {
      expect(_osm.isDataLoaded([-74.0444216, 40.6694299])).to.be.false;

      const bbox = { minX: -75, minY: 40, maxX: -74, maxY: 41, id: 'fake' };
      _osm._tileCache.rtree.insert(bbox);

      expect(_osm.isDataLoaded([-74.0444216, 40.6694299])).to.be.true;
    });
  });


  describe('#loadEntity', () => {
    const nodeBody =
`{
  "version":"0.6",
  "elements":[
    {"type":"node","id":1,"visible":true,"version":1,"changeset":28924294,"timestamp":"2009-03-07T03:26:33Z","user":"peace2","uid":119748,"lat":0,"lon":0}
  ]
}`;

    const wayBody =
`{
  "version":"0.6",
  "elements":[
    {"type":"node","id":1,"visible":true,"version":1,"changeset":2817006,"timestamp":"2009-10-11T18:03:23Z","user":"peace2","uid":119748,"lat":0,"lon":0},
    {"type":"way","id":1,"visible":true,"version":1,"changeset":522559,"timestamp":"2008-01-03T05:24:43Z","user":"peace2","uid":119748,"nodes":[1]}
  ]
}`;

    it('loads a node', done => {
      fetchMock.mock(/node\/1\.json/, {
        body: nodeBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const id = 'n1';
      _osm.loadEntity(id, (err, result) => {
        const entity = result.data.find(e => e.id === id);
        expect(entity).to.be.an.instanceof(Rapid.osmNode);
        done();
      });
    });


    it('loads a way', done => {
      fetchMock.mock(/way\/1\/full\.json/, {
        body: wayBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const id = 'w1';
      _osm.loadEntity(id, (err, result) => {
        const entity = result.data.find(e => e.id === id);
        expect(entity).to.be.an.instanceof(Rapid.osmWay);
        done();
      });
    });


    it('does not ignore repeat requests', done => {
      fetchMock.mock(/node\/1\.json/, {
        body: nodeBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const id = 'n1';
      _osm.loadEntity(id, (err1, result1) => {
        const entity1 = result1.data.find(e1 => e1.id === id);
        expect(entity1).to.be.an.instanceof(Rapid.osmNode);

        _osm.loadEntity(id, (err2, result2) => {
          const entity2 = result2.data.find(e2 => e2.id === id);
          expect(entity2).to.be.an.instanceof(Rapid.osmNode);
          done();
        });
      });
    });
  });


  describe('#loadEntityVersion', () => {
    const nodeBody =
`{
  "version":"0.6",
  "elements":[
    {"type":"node","id":1,"visible":true,"version":1,"changeset":28924294,"timestamp":"2009-03-07T03:26:33Z","user":"peace2","uid":119748,"lat":0,"lon":0}
  ]
}`;
    const wayBody =
`{
  "version":"0.6",
  "elements":[
    {"type":"node","id":1,"visible":true,"version":1,"changeset":2817006,"timestamp":"2009-10-11T18:03:23Z","user":"peace2","uid":119748,"lat":0,"lon":0},
    {"type":"way","id":1,"visible":true,"version":1,"changeset":522559,"timestamp":"2008-01-03T05:24:43Z","user":"peace2","uid":119748,"nodes":[1]}
  ]
}`;

    it('loads a node', done => {
      fetchMock.mock(/node\/1\/1\.json/, {
        body: nodeBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const id = 'n1';
      _osm.loadEntityVersion(id, 1, (err, result) => {
        const entity = result.data.find(e => e.id === id);
        expect(entity).to.be.an.instanceof(Rapid.osmNode);
        done();
      });
    });


    it('loads a way', done => {
      fetchMock.mock(/way\/1\/1\.json/, {
        body: wayBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const id = 'w1';
      _osm.loadEntityVersion(id, 1, (err, result) => {
        const entity = result.data.find(e => e.id === id);
        expect(entity).to.be.an.instanceof(Rapid.osmWay);
        done();
      });
    });


    it('does not ignore repeat requests', done => {
      fetchMock.mock(/node\/1\/1\.json/, {
        body: nodeBody,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const id = 'n1';
      _osm.loadEntityVersion(id, 1, (err1, result1) => {
        const entity1 = result1.data.find(e1 => e1.id === id);
        expect(entity1).to.be.an.instanceof(Rapid.osmNode);

        _osm.loadEntityVersion(id, 1, (err2, result2) => {
          const entity2 = result2.data.find(e2 => e2.id === id);
          expect(entity2).to.be.an.instanceof(Rapid.osmNode);
          done();
        });
      });
    });

  });


  describe('#userDetails', () => {
    it('retrieves user details', done => {
      loginAsync()
        .then(() => {
          _osm.userDetails((err, user) => {
            expect(user.id).to.eql('584325');
            done();
          });
        });
    });
  });


  describe('#userChangesets', () => {
    it('retrieves user changesets', done => {
      loginAsync()
        .then(() => {
          _osm.userChangesets((err, changesets) => {
            // ignore changesets with empty or missing comment
            expect(changesets).to.have.lengthOf(1);

            const changeset = changesets[0];
            expect(changeset.id).to.eql(137842015);
            expect(changeset.tags.comment).to.eql('Fix unsquare corners');
            done();
          });
        });
    });
  });


  describe('#caches', () => {
    it('loads reset caches', () => {
      const caches = _osm.caches();
      expect(caches.tile).to.have.all.keys(['lastv','toLoad','loaded','inflight','seen','rtree']);
      expect(caches.note).to.have.all.keys(['lastv','toLoad','loaded','inflight','inflightPost','note','closed','rtree']);
      expect(caches.user).to.have.all.keys(['toLoad','user']);
    });

    describe('sets/gets caches', () => {
      it('sets/gets a tile', () => {
        const obj = {
          tile: { loaded: new Set(['1,2,16', '3,4,16']) }
        };
        _osm.caches(obj);
        expect(_osm.caches().tile.loaded.has('1,2,16')).to.eql(true);
        expect(_osm.caches().tile.loaded.size).to.eql(2);
      });

      it('sets/gets a note', () => {
        const note = new Rapid.QAItem(_osm, null, '1', { loc: [0, 0] });
        const note2 = new Rapid.QAItem(_osm, null, '2', { loc: [0, 0] });
        const obj = {
          note: { note: { '1': note, '2': note2 } }
        };
        _osm.caches(obj);
        expect(_osm.caches().note.note[note.id]).to.eql(note);
        expect(Object.keys(_osm.caches().note.note).length).to.eql(2);
      });

      it('sets/gets a user', () => {
        const user = { id: '1', display_name: 'Name' };
        const user2 = { id: '2', display_name: 'Name' };
        const obj = {
          user: { user: { '1': user, '2': user2 } }
        };
        _osm.caches(obj);
        expect(_osm.caches().user.user[user.id]).to.eql(user);
        expect(Object.keys(_osm.caches().user.user).length).to.eql(2);
      });
    });
  });


  describe('#loadNotes', () => {
    const notesBody =
`<?xml version="1.0" encoding="UTF-8"?>
<osm>
<note lon="10" lat="0">
  <id>1</id>
  <url>https://www.openstreetmap.org/api/0.6/notes/1</url>
  <comment_url>https://api.openstreetmap.org/api/0.6/notes/1/comment</comment_url>
  <close_url>https://api.openstreetmap.org/api/0.6/notes/1/close</close_url>
  <date_created>2019-01-01 00:00:00 UTC</date_created>
  <status>open</status>
  <comments>
    <comment>
      <date>2019-01-01 00:00:00 UTC</date>
      <uid>584325</uid>
      <user>bhousel</user>
      <user_url>https://www.openstreetmap.org/user/bhousel</user_url>
      <action>opened</action>
      <text>This is a note</text>
      <html>&lt;p&gt;This is a note&lt;/p&gt;</html>
    </comment>
  </comments>
</note>
</osm>`;

    it('fires loadedNotes when notes are loaded', done => {
      fetchMock.mock(/notes\?/, {
        body: notesBody,
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
      });

      _osm.on('loadedNotes', spy);
      _osm.loadNotes({ /*no options*/ });

      window.setTimeout(() => {
        // was: calledOnce, now called multiple times as we fetch margin tiles
        expect(spy.called).to.be.ok;
        done();
      }, 50);
    });
  });


  describe('#notes', () => {
    it('returns notes in the visible map area', () => {
      const notes = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { key: '0', loc: [10,0] } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { key: '1', loc: [10,0] } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { key: '2', loc: [10,1] } }
      ];

      _osm.caches('get').note.rtree.load(notes);
      const result = _osm.getNotes();
      expect(result).to.deep.eql([
        { key: '0', loc: [10,0] },
        { key: '1', loc: [10,0] }
      ]);
    });
  });


  describe('#getNote', () => {
    it('returns a note', () => {
      const note = new Rapid.QAItem(_osm, null, '1', { loc: [0, 0] });
      const obj = {
        note: { note: { '1': note } }
      };
      _osm.caches(obj);
      const result = _osm.getNote('1');
      expect(result).to.deep.equal(note);
    });
  });

  describe('#removeNote', () => {
    it('removes a note that is new', () => {
      const note = new Rapid.QAItem(_osm, null, '-1', { loc: [0, 0] });
      _osm.replaceNote(note);
      _osm.removeNote(note);
      const result = _osm.getNote('-1');
      expect(result).to.eql(undefined);
    });
  });


  describe('#replaceNote', () => {
    it('returns a new note', () => {
      const note = new Rapid.QAItem(_osm, null, '2', { loc: [0, 0] });
      const result = _osm.replaceNote(note);
      expect(result.id).to.eql('2');
      expect(_osm.caches().note.note['2']).to.eql(note);
      const rtree = _osm.caches().note.rtree;
      const result_rtree = rtree.search({ 'minX': -1, 'minY': -1, 'maxX': 1, 'maxY': 1 });
      expect(result_rtree.length).to.eql(1);
      expect(result_rtree[0].data).to.eql(note);
    });

    it('replaces a note', () => {
      const note = new Rapid.QAItem(_osm, null, '2', { loc: [0, 0] });
      _osm.replaceNote(note);
      note.status = 'closed';
      const result = _osm.replaceNote(note);
      expect(result.status).to.eql('closed');

      const rtree = _osm.caches().note.rtree;
      const result_rtree = rtree.search({ 'minX': -1, 'minY': -1, 'maxX': 1, 'maxY': 1 });
      expect(result_rtree.length).to.eql(1);
      expect(result_rtree[0].data.status).to.eql('closed');
    });
  });


  describe('API capabilities', () => {
    describe('#status', () => {
      it('gets API status', done => {
        _osm.status((err, result) => {
          expect(result).to.eql('online');
          done();
        });
      });
    });

    describe('#imageryBlocklists', () => {
      it('updates imagery blocklists', done => {
        _osm.status(() => {
          const blocklists = _osm.imageryBlocklists;
          expect(blocklists).to.deep.equal([new RegExp('\.foo\.com'), new RegExp('\.bar\.org')]);
          done();
        });
      });
    });

  });
});
