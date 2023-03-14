describe('coreContext', function() {
    var assets = {
        'test/img/loader.gif': '/assets/test/img/loader-b66184b5c4afbccc25f.gif'
    };

    describe('#assetPath', function() {
        it('sets and gets assetPath', function() {
            var context = Rapid.coreContext();
            expect(context.assetPath()).to.eql('');

            context.assetPath('test/');
            expect(context.assetPath()).to.eql('test/');
        });
    });

    describe('#assetMap', function() {
        it('sets and gets assetMap', function() {
            var context = Rapid.coreContext();
            expect(context.assetMap()).to.eql({});

            context.assetMap(assets);
            expect(context.assetMap()).to.eql(assets);
        });
    });

    describe('#asset', function() {
        var context;
        beforeEach(function() {
            context = Rapid.coreContext().assetPath('test/').assetMap(assets);
        });

        it('ignores absolute urls', function() {
            expect(context.asset('HTTP://hello')).to.eql('HTTP://hello');
            expect(context.asset('https://world')).to.eql('https://world');
        });
        it('looks first in assetMap', function() {
            expect(context.asset('img/loader.gif')).to.eql('/assets/test/img/loader-b66184b5c4afbccc25f.gif');
        });
        it('falls back to prepending assetPath', function() {
            expect(context.asset('img/spinner.gif')).to.eql('test/img/spinner.gif');
        });
    });

    describe('#imagePath', function() {
        var context;
        beforeEach(function() {
            context = Rapid.coreContext().assetPath('test/').assetMap(assets);
        });

        it('looks first in assetMap', function() {
            expect(context.imagePath('loader.gif')).to.eql('/assets/test/img/loader-b66184b5c4afbccc25f.gif');
        });
        it('falls back to prepending assetPath', function() {
            expect(context.imagePath('spinner.gif')).to.eql('test/img/spinner.gif');
        });
    });

    describe('#debug', function() {
        it('sets and gets debug flags', function() {
            var context = Rapid.coreContext();
            var flags = {
                tile: false,
                label: false,
                imagery: false,
                target: false,
                downloaded: false
            };

            expect(context.debugFlags()).to.eql(flags);

            context.setDebug('tile', true);
            expect(context.getDebug('tile')).to.be.true;

            context.setDebug('label');
            expect(context.getDebug('label')).to.be.true;

            context.setDebug('tile', false);
            expect(context.getDebug('tile')).to.be.false;
        });
    });

});
