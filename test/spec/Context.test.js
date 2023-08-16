describe('Context', () => {
  const TESTMAP = {
    'test/img/loader.gif': '/assets/test/img/loader-b66184b5c4afbccc25f.gif'
  };


  describe('#assetPath', () => {
    it('sets and gets assetPath', () => {
      const context = new Rapid.Context();
      expect(context.assetPath).to.eql('');

      context.assetPath = 'test/';
      expect(context.assetPath).to.eql('test/');
    });
  });


  describe('#assetMap', () => {
    it('sets and gets assetMap', () => {
      const context = new Rapid.Context();
      expect(context.assetMap).to.eql({});

      context.assetMap = TESTMAP;
      expect(context.assetMap).to.eql(TESTMAP);
    });
  });


  describe('#asset', () => {
    let context;
    beforeEach(() => {
      context = new Rapid.Context();
      context.assetPath = 'test/';
      context.assetMap = TESTMAP;
    });

    it('ignores absolute urls', () => {
      expect(context.asset('HTTP://hello')).to.eql('HTTP://hello');
      expect(context.asset('https://world')).to.eql('https://world');
    });
    it('looks first in assetMap', () => {
      expect(context.asset('img/loader.gif')).to.eql('/assets/test/img/loader-b66184b5c4afbccc25f.gif');
    });
    it('falls back to prepending assetPath', () => {
      expect(context.asset('img/spinner.gif')).to.eql('test/img/spinner.gif');
    });
  });


  describe('#debug', () => {
    it('sets and gets debug flags', () => {
      const context = new Rapid.Context();
      const TESTFLAGS = {
        tile: false,
        label: false,
        imagery: false,
        target: false,
        downloaded: false
      };

      expect(context.debugFlags()).to.eql(TESTFLAGS);

      context.setDebug('tile', true);
      expect(context.getDebug('tile')).to.be.true;

      context.setDebug('label');
      expect(context.getDebug('label')).to.be.true;

      context.setDebug('tile', false);
      expect(context.getDebug('tile')).to.be.false;
    });
  });

});
