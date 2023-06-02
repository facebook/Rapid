describe('uiFieldWikipedia', function() {
    var entity, context, selection, field;

    beforeEach(function() {
        entity = Rapid.osmNode({id: 'n12345'});
        context = Rapid.coreContext().assetPath('../dist/').init();
        context.editSystem().merge([entity]);
        selection = d3.select(document.createElement('div'));
        field = new Rapid.Field(context, 'wikipedia', {
            key: 'wikipedia',
            keys: ['wikipedia', 'wikidata'],
            type: 'wikipedia'
        });
        fetchMock.resetHistory();
        fetchMock.mock(new RegExp('\/w\/api\.php.*action=wbgetentities'), {
            body: '{"entities":{"Q216353":{"id":"Q216353"}}}',
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    });

    afterEach(function() {
        fetchMock.resetHistory();
    });


    function changeTags(changed) {
        var e = context.entity(entity.id);
        var annotation = 'Changed tags.';
        var tags = JSON.parse(JSON.stringify(e.tags));   // deep copy
        var didChange = false;

        for (var k in changed) {
            if (changed.hasOwnProperty(k)) {
                var v = changed[k];
                if (tags[k] !== v && (v !== undefined || tags.hasOwnProperty(k))) {
                    tags[k] = v;
                    didChange = true;
                }
            }
        }

        if (didChange) {
            context.perform(Rapid.actionChangeTags(e.id, tags), annotation);
        }
    }

    it('recognizes lang:title format', function(done) {
        var wikipedia = Rapid.uiFieldWikipedia(context, field);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(wikipedia);
            wikipedia.tags({wikipedia: 'en:Title'});

            expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'))).to.equal('English');
            expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-title'))).to.equal('Title');
            done();
        }, 20);
    });

    it('sets language, value', function(done) {
        var wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
        window.setTimeout(function() {   // async, so data will be available
            wikipedia.on('change', changeTags);
            selection.call(wikipedia);

            var spy = sinon.spy();
            wikipedia.on('change.spy', spy);

            Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'), 'Deutsch');
            happen.once(selection.selectAll('.wiki-lang').node(), { type: 'change' });
            happen.once(selection.selectAll('.wiki-lang').node(), { type: 'blur' });

            Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'Title');
            happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });
            happen.once(selection.selectAll('.wiki-title').node(), { type: 'blur' });

            expect(spy.callCount).to.equal(4);
            expect(spy.getCall(0)).to.have.been.calledWith({ wikipedia: undefined});  // lang on change
            expect(spy.getCall(1)).to.have.been.calledWith({ wikipedia: undefined});  // lang on blur
            expect(spy.getCall(2)).to.have.been.calledWith({ wikipedia: 'de:Title' });   // title on change
            expect(spy.getCall(3)).to.have.been.calledWith({ wikipedia: 'de:Title' });   // title on blur
            done();
        }, 20);
    });

    it('recognizes pasted URLs', function(done) {
        var wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
        window.setTimeout(function() {   // async, so data will be available
            wikipedia.on('change', changeTags);
            selection.call(wikipedia);

            Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'http://de.wikipedia.org/wiki/Title');
            happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });

            expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'))).to.equal('Deutsch');
            expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-title'))).to.equal('Title');
            done();
        }, 20);
    });

    // note - currently skipping the tests that use `options` to delay responses
    it('preserves existing language', function(done) {
        var wikipedia1 = Rapid.uiFieldWikipedia(context, field);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(wikipedia1);
            Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'), 'Deutsch');

            var wikipedia2 = Rapid.uiFieldWikipedia(context, field);
            window.setTimeout(function() {   // async, so data will be available
                selection.call(wikipedia2);
                wikipedia2.tags({});
                expect(Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'))).to.equal('Deutsch');
                done();
            }, 20);
        }, 20);
    });

    it.skip('does not set delayed wikidata tag if graph has changed', function(done) {
        var wikipedia = Rapid.uiFieldWikipedia(context, field).entityIDs([entity.id]);
        wikipedia.on('change', changeTags);
        selection.call(wikipedia);

        var spy = sinon.spy();
        wikipedia.on('change.spy', spy);

        // Create an XHR server that will respond after 60ms
        fetchMock.resetHistory();
        fetchMock.mock(new RegExp('\/w\/api\.php.*action=wbgetentities'), {
            body: '{"entities":{"Q216353":{"id":"Q216353"}}}',
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }, {
            delay: 60
        });

        // Set title to "Skip"
        Rapid.utilGetSetValue(selection.selectAll('.wiki-lang'), 'Deutsch');
        Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'Skip');
        happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });
        happen.once(selection.selectAll('.wiki-title').node(), { type: 'blur' });

        // t0
        expect(context.entity(entity.id).tags.wikidata).to.be.undefined;

        // Create a new XHR server that will respond after 60ms to
        // separate requests after this point from those before
        fetchMock.resetHistory();
        fetchMock.mock(new RegExp('\/w\/api\.php.*action=wbgetentities'), {
            body: '{"entities":{"Q216353":{"id":"Q216353"}}}',
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }, {
            delay: 60
        });

        // t30:  graph change - Set title to "Title"
        window.setTimeout(function() {
            Rapid.utilGetSetValue(selection.selectAll('.wiki-title'), 'Title');
            happen.once(selection.selectAll('.wiki-title').node(), { type: 'change' });
            happen.once(selection.selectAll('.wiki-title').node(), { type: 'blur' });
        }, 30);

        // t60:  at t0 + 60ms (delay), wikidata SHOULD NOT be set because graph has changed.

        // t70:  check that wikidata unchanged
        window.setTimeout(function() {
            expect(context.entity(entity.id).tags.wikidata).to.be.undefined;
        }, 70);

        // t90:  at t30 + 60ms (delay), wikidata SHOULD be set because graph is unchanged.

        // t100:  check that wikidata has changed
        window.setTimeout(function() {
            expect(context.entity(entity.id).tags.wikidata).to.equal('Q216353');

            expect(spy.callCount).to.equal(4);
            expect(spy.getCall(0)).to.have.been.calledWith({ wikipedia: 'de:Skip' });   // 'Skip' on change
            expect(spy.getCall(1)).to.have.been.calledWith({ wikipedia: 'de:Skip' });   // 'Skip' on blur
            expect(spy.getCall(2)).to.have.been.calledWith({ wikipedia: 'de:Title' });  // 'Title' on change +10ms
            expect(spy.getCall(3)).to.have.been.calledWith({ wikipedia: 'de:Title' });  // 'Title' on blur   +10ms
            done();
        }, 100);

    });
});
