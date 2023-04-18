describe('uiIcon', () => {
  let selection;

  beforeEach(() => {
    selection = d3.select(document.createElement('div'));
  });

  it('creates a generic SVG icon', () => {
    selection.call(Rapid.uiIcon('#rapid-icon-bug'));
    expect(selection.select('svg').classed('icon')).to.be.true;
    expect(selection.select('use').attr('xlink:href')).to.eql('#rapid-icon-bug');
  });

  it('sets class attribute', () => {
    selection.call(Rapid.uiIcon('#rapid-icon-bug', 'svg-class'));
    expect(selection.select('svg').classed('icon svg-class')).to.be.true;
  });
});
