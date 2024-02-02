describe('validationIncompatibleSource', () => {

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockContext {
    constructor() {
      this.systems = {
        l10n:  new MockLocalizationSystem()
      };
    }
  }

  const validator = Rapid.validationIncompatibleSource(new MockContext());


  it('ignores way with no source tag', () => {
    const n = Rapid.osmNode({ tags: { amenity: 'cafe', building: 'yes', name: 'Key Largo Café' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores way with okay source tag', () => {
    const n = Rapid.osmNode({ tags: { amenity: 'cafe', building: 'yes', name: 'Key Largo Café', source: 'survey' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores way with excepted source tag', () => {
    const n = Rapid.osmNode({ tags: { amenity: 'cafe', building: 'yes', name: 'Key Largo Café', source: 'Google drive' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('flags way with incompatible source tag', () => {
    const n = Rapid.osmNode({ tags: { amenity: 'cafe', building: 'yes', name: 'Key Largo Café', source: 'Google Maps' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('incompatible_source');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(n.id);
  });

  it('does not flag buildings in the google-africa-buildings dataset', () => {
    const n = Rapid.osmNode({ tags: { building: 'yes', source: 'esri/Google_Africa_Buildings' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('does not flag buildings in one of the many the google-open-buildings datasets', () => {
    const n = Rapid.osmNode({ tags: { building: 'yes', source: 'esri/Google_Open_Buildings' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

});
