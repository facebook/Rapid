describe('utilCmd', () => {
  let _orig;
  let _userAgent = navigator.userAgent;
  const isPhantom = (navigator.userAgent.match(/PhantomJS/) !== null);
  const uaMock = () => _userAgent;

  beforeEach(() => {
    /* eslint-disable no-global-assign */
    /* mock userAgent */
    if (isPhantom) {
      _orig = navigator;
      navigator = Object.create(_orig, { userAgent: { get: uaMock }});
    } else {
      _orig = navigator.__lookupGetter__('userAgent');
      navigator.__defineGetter__('userAgent', uaMock);
    }
  });

  afterEach(() => {
    /* restore userAgent */
    if (isPhantom) {
      navigator = _orig;
    } else {
      navigator.__defineGetter__('userAgent', _orig);
    }
    /* eslint-enable no-global-assign */
  });


  it('does not overwrite mac keybindings', () => {
    _userAgent = 'Mac';
    Rapid.utilDetect(true);  // force redetection
    expect(Rapid.utilCmd('⌘A')).to.eql('⌘A');
  });


  it('changes keys to linux versions', () => {
    _userAgent = 'Linux';
    Rapid.utilDetect(true);  // force redetection
    expect(Rapid.utilCmd('⌘⌫')).to.eql('⌃⌫');
    expect(Rapid.utilCmd('⌘A')).to.eql('⌃A');
    expect(Rapid.utilCmd('⇧A')).to.eql('⇧A');
    expect(Rapid.utilCmd('⌘⇧A')).to.eql('⌃⇧A');
    expect(Rapid.utilCmd('⌘⇧Z')).to.eql('⌃⇧Z');
  });


  it('changes keys to win versions', () => {
    _userAgent = 'Win';
    Rapid.utilDetect(true);  // force redetection
    expect(Rapid.utilCmd('⌘⌫')).to.eql('⌃⌫');
    expect(Rapid.utilCmd('⌘A')).to.eql('⌃A');
    expect(Rapid.utilCmd('⇧A')).to.eql('⇧A');
    expect(Rapid.utilCmd('⌘⇧A')).to.eql('⌃⇧A');
    expect(Rapid.utilCmd('⌘⇧Z')).to.eql('⌃Y');  // special case
  });


  it('handles multi-character keys', () => {
    _userAgent = 'Win';
    Rapid.utilDetect(true);  // force redetection
    expect(Rapid.utilCmd('f11')).to.eql('f11');
    expect(Rapid.utilCmd('⌘plus')).to.eql('⌃plus');
  });

});
