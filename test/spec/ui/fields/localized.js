describe('uiFieldLocalized', function() {
    var context, selection, field;

    before(function() {
        Rapid.fileFetcher.cache().languages = {
          de: { nativeName: 'Deutsch' },
          en: { nativeName: 'English' }
        };
        Rapid.fileFetcher.cache().territory_languages = {};
    });

    after(function() {
        delete Rapid.fileFetcher.cache().languages;
        delete Rapid.fileFetcher.cache().territory_languages;
    });

    beforeEach(function() {
        context = Rapid.coreContext().assetPath('../dist/').init();
        selection = d3.select(document.createElement('div'));
        field = Rapid.presetField('name', { key: 'name', type: 'localized' });
        field.locked = function() { return false; };
    });


    it('adds a blank set of fields when the + button is clicked', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            happen.click(selection.selectAll('.localized-add').node());
            expect(selection.selectAll('.localized-lang').nodes().length).to.equal(1);
            expect(selection.selectAll('.localized-value').nodes().length).to.equal(1);
            done();
        }, 20);
    });

    it('doesn\'t create a tag when the value is empty', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            happen.click(selection.selectAll('.localized-add').node());

            localized.on('change', function(tags) {
                expect(tags).to.eql({});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'Deutsch');
            happen.once(selection.selectAll('.localized-lang').node(), {type: 'change'});
            happen.once(selection.selectAll('.localized-lang').node(), {type: 'blur'});
            done();
        }, 20);
    });

    it('doesn\'t create a tag when the name is empty', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            happen.click(selection.selectAll('.localized-add').node());

            localized.on('change', function(tags) {
                expect(tags).to.eql({});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-value'), 'Value');
            happen.once(selection.selectAll('.localized-value').node(), {type: 'change'});
            happen.once(selection.selectAll('.localized-value').node(), {type: 'blur'});
            done();
        }, 20);
    });

    it('creates a tag after setting language then value', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            happen.click(selection.selectAll('.localized-add').node());

            Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'Deutsch');
            happen.once(selection.selectAll('.localized-lang').node(), {type: 'change'});

            localized.on('change', function(tags) {
                expect(tags).to.eql({'name:de': 'Value'});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-value'), 'Value');
            happen.once(selection.selectAll('.localized-value').node(), {type: 'change'});
            done();
        }, 20);
    });

    it('creates a tag after setting value then language', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            happen.click(selection.selectAll('.localized-add').node());

            Rapid.utilGetSetValue(selection.selectAll('.localized-value'), 'Value');
            happen.once(selection.selectAll('.localized-value').node(), {type: 'change'});

            localized.on('change', function(tags) {
                expect(tags).to.eql({'name:de': 'Value'});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'Deutsch');
            happen.once(selection.selectAll('.localized-lang').node(), {type: 'change'});
            done();
        }, 20);
    });

    it('changes an existing language', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            localized.tags({'name:de': 'Value'});

            localized.on('change', function(tags) {
                expect(tags).to.eql({
                    'name:de': undefined,
                    'name:en': 'Value'});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), 'English');
            happen.once(selection.selectAll('.localized-lang').node(), {type: 'change'});
            done();
        }, 20);
    });

    it('ignores similar keys like `old_name`', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            localized.tags({'old_name:de': 'Value'});

            expect(selection.selectAll('.localized-lang').empty()).to.be.ok;
            expect(selection.selectAll('.localized-value').empty()).to.be.ok;
            done();
        }, 20);
    });

    it('removes the tag when the language is emptied', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            localized.tags({'name:de': 'Value'});

            localized.on('change', function(tags) {
                expect(tags).to.eql({'name:de': undefined});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-lang'), '');
            happen.once(selection.selectAll('.localized-lang').node(), {type: 'change'});
            done();
        }, 20);
    });

    it('removes the tag when the value is emptied', function(done) {
        var localized = Rapid.uiFieldLocalized(field, context);
        window.setTimeout(function() {   // async, so data will be available
            selection.call(localized);
            localized.tags({'name:de': 'Value'});

            localized.on('change', function(tags) {
                expect(tags).to.eql({'name:de': undefined});
            });

            Rapid.utilGetSetValue(selection.selectAll('.localized-value'), '');
            happen.once(selection.selectAll('.localized-value').node(), {type: 'change'});
            done();
        }, 20);
    });
});
