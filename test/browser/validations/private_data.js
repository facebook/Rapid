describe('validationPrivateData', () => {

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

  const validator = Rapid.validationPrivateData(new MockContext());


  it('ignores way with no tags', () => {
    const n = Rapid.osmNode({ tags: {} });
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores way with phone tag', () => {
    const n = Rapid.osmNode({ tags: { phone: '123-456-7890' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores generic building with phone tag', () => {
    const n = Rapid.osmNode({ tags: { building: 'yes', phone: '123-456-7890' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores guest house with phone tag', () => {
    const n = Rapid.osmNode({ tags: { building: 'house', phone: '123-456-7890', tourism: 'guest_house' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(0);
  });

  it('flags house with phone tag', () => {
    const n = Rapid.osmNode({ tags: { building: 'house', phone: '123-456-7890' }});
    const issues = validator(n);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('private_data');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(n.id);
  });

});
