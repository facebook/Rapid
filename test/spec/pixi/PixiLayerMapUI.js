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
    const scene = context.scene();
    const mapUI = scene.getLayer('map-ui');
    expect(mapUI).not.to.be.an('undefined');
  });

  it('is enabled and visible by default', () => {
    const scene = context.scene();
    const mapUI = scene.getLayer('map-ui');
    expect(mapUI.enabled).to.be.true;
    expect(mapUI.visible).to.be.true;
  });

  it('stays enabled and visible even if somoene tries disabling it', () => {
    const scene = context.scene();
    scene.disableLayers(['map-ui']);
    const mapUI = scene.getLayer('map-ui');
    expect(mapUI.enabled).to.be.true;
    expect(mapUI.visible).to.be.true;
  });

  it('has the highest z-index of any other layer', () => {
    const scene = context.scene();
    const zIndex = scene.getLayer('map-ui').zIndex;
    expect(scene.layers.every(layer => layer.zIndex <= zIndex)).to.be.true;
  });

});
