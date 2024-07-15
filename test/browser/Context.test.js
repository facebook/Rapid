describe('Context', () => {

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
