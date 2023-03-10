describe('uiCmd', function () {
    var orig;
    var ua = navigator.userAgent;
    var isPhantom = (navigator.userAgent.match(/PhantomJS/) !== null);
    var uaMock = function () { return ua; };

    beforeEach(function() {
        /* eslint-disable no-global-assign */
        /* mock userAgent */
        if (isPhantom) {
            orig = navigator;
            navigator = Object.create(orig, { userAgent: { get: uaMock }});
        } else {
            orig = navigator.__lookupGetter__('userAgent');
            navigator.__defineGetter__('userAgent', uaMock);
        }
    });

    afterEach(function() {
        /* restore userAgent */
        if (isPhantom) {
            navigator = orig;
        } else {
            navigator.__defineGetter__('userAgent', orig);
        }
        /* eslint-enable no-global-assign */
    });

    it('does not overwrite mac keybindings', function () {
        ua = 'Mac';
        Rapid.utilDetect(true);  // force redetection
        expect(Rapid.uiCmd('⌘A')).to.eql('⌘A');
    });

    it('changes keys to linux versions', function () {
        ua = 'Linux';
        Rapid.utilDetect(true);  // force redetection
        expect(Rapid.uiCmd('⌘⌫')).to.eql('Ctrl+Backspace');
        expect(Rapid.uiCmd('⌘A')).to.eql('Ctrl+A');
        expect(Rapid.uiCmd('⇧A')).to.eql('Shift+A');
        expect(Rapid.uiCmd('⌘⇧A')).to.eql('Ctrl+Shift+A');
        expect(Rapid.uiCmd('⌘⇧Z')).to.eql('Ctrl+Shift+Z');
    });

    it('changes keys to win versions', function () {
        ua = 'Win';
        Rapid.utilDetect(true);  // force redetection
        expect(Rapid.uiCmd('⌘⌫')).to.eql('Ctrl+Backspace');
        expect(Rapid.uiCmd('⌘A')).to.eql('Ctrl+A');
        expect(Rapid.uiCmd('⇧A')).to.eql('Shift+A');
        expect(Rapid.uiCmd('⌘⇧A')).to.eql('Ctrl+Shift+A');
        expect(Rapid.uiCmd('⌘⇧Z')).to.eql('Ctrl+Y');  // special case
    });

    it('handles multi-character keys', function () {
        ua = 'Win';
        Rapid.utilDetect(true);  // force redetection
        expect(Rapid.uiCmd('f11')).to.eql('f11');
        expect(Rapid.uiCmd('⌘plus')).to.eql('Ctrl+plus');
    });

});
