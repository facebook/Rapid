describe('utilSanitizeHTML', () => {
  const utilSanitizeHTML = Rapid.utilSanitizeHTML;

  it('returns empty string for falsy input', () => {
    expect(utilSanitizeHTML('')).to.eql('');
    expect(utilSanitizeHTML(null)).to.eql('');
    expect(utilSanitizeHTML(undefined)).to.eql('');
  });

  it('strips script tags', () => {
    expect(utilSanitizeHTML('<script>alert("xss")</script>')).to.eql('');
  });

  it('strips iframe tags', () => {
    expect(utilSanitizeHTML('<iframe src="evil.com"></iframe>')).to.eql('');
  });

  it('strips form and input tags', () => {
    expect(utilSanitizeHTML('<form><input type="text"></form>')).to.eql('');
  });

  it('strips event handler attributes', () => {
    expect(utilSanitizeHTML('<img src="x" onerror="alert(1)">')).to.eql('<img src="x">');
  });

  it('strips style attributes', () => {
    expect(utilSanitizeHTML('<span style="color:red">text</span>')).to.eql('<span>text</span>');
  });

  it('allows safe inline tags', () => {
    expect(utilSanitizeHTML('<b>bold</b> <em>em</em> <mark>mark</mark>')).to.eql('<b>bold</b> <em>em</em> <mark>mark</mark>');
  });

  it('preserves lang attribute', () => {
    expect(utilSanitizeHTML('<span lang="de">Straße</span>')).to.eql('<span lang="de">Straße</span>');
  });

  it('preserves class and href attributes', () => {
    expect(utilSanitizeHTML('<a href="https://example.com" class="link">click</a>')).to.eql('<a href="https://example.com" class="link">click</a>');
  });

  it('preserves data-osm-id and data-osm-type attributes', () => {
    expect(utilSanitizeHTML('<span data-osm-id="123" data-osm-type="node">test</span>')).to.eql('<span data-osm-id="123" data-osm-type="node">test</span>');
  });
});
