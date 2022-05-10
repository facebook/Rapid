describe('iD.pixiMapUILayer', () => {
  let context, map;

  beforeEach(() => {
    const container = d3.select('body').append('div');
    context = iD.coreContext().assetPath('../dist/').init().container(container);
    map = context.map();
    container.call(map);
  });

  afterEach(() => {});

  it('is part of the pixi layers', () => {
    const mapUI = map.layers().getLayer('map-ui');
    expect(mapUI).not.to.be.an('undefined');
  });

  it('is enabled and visible by default', () => {
    const mapUI = map.layers().getLayer('map-ui');
    expect(mapUI.enabled).to.be.true;
    expect(mapUI.visible).to.be.true;
  });

  it('stays enabled and visible even if somoene tries disabling it', () => {
    map.layers().disable('map-ui');
    const mapUI = map.layers().getLayer('map-ui');
    expect(mapUI.enabled).to.be.true;
    expect(mapUI.visible).to.be.true;
  });

  it('has the highest z-index of any other layer', () => {
    const zIndex = map.layers().getLayer('map-ui').zIndex;
    expect(map.layers().getLayers().every(layer => layer.zIndex <= zIndex)).to.be.true;
  });

});
