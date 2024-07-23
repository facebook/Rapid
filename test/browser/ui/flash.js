describe('uiFlash', () => {
  let body, container;

  class MockContext {
    constructor() { }
    container()   { return container; }
  }

  const context = new MockContext();

  beforeEach(() => {
    body = d3.select('body');
    container = body.append('div');
    container
      .append('div')
      .attr('class', 'flash-wrap')
      .append('div')
      .attr('class', 'map-footer-wrap');
  });

  afterEach(() => {
    container.remove();
  });


  it('flash is shown', () => {
    Rapid.uiFlash(context).duration(10)();
    const flashWrap = d3.selectAll('.flash-wrap');
    const footerWrap = d3.selectAll('.map-footer-wrap');
    expect(flashWrap.classed('map-footer-show')).to.be.ok;
    expect(footerWrap.classed('map-footer-hide')).to.be.ok;
  });

  it('flash goes away', done => {
    Rapid.uiFlash(context).duration(10)();
    window.setTimeout(() => {
      d3.timerFlush();
      const flashWrap = d3.selectAll('.flash-wrap');
      const footerWrap = d3.selectAll('.map-footer-wrap');
      expect(flashWrap.classed('map-footer-hide')).to.be.ok;
      expect(footerWrap.classed('map-footer-show')).to.be.ok;
      done();
    }, 20);
  });

});
