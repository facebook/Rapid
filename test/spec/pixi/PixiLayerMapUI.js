describe('PixiLayerMapUI', () => {
  let context, container, map;

  beforeEach(() => {
    container = d3.select('body').append('div');
    context = Rapid.coreContext().assetPath('../dist/').init().container(container);
    map = context.systems.map;
    map.render(container);
  });

  afterEach(() => { container.remove(); });

  it('is part of the pixi layers', () => {
    const scene = context.scene();
    const mapUI = scene.layers.get('map-ui');
    expect(mapUI).not.to.be.an('undefined');
  });

  it('is enabled and visible by default', () => {
    const scene = context.scene();
    const mapUI = scene.layers.get('map-ui');
    expect(mapUI.enabled).to.be.true;
  });

  it('stays enabled and visible even if somoene tries disabling it', () => {
    const scene = context.scene();
    scene.disableLayers(['map-ui']);
    const mapUI = scene.layers.get('map-ui');
    expect(mapUI.enabled).to.be.true;
  });

});
