import { LocalizationSystem } from "../../../modules/core/LocalizationSystem";

describe('LocalizationSystem', () => {
  const mockT = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('displayName', () => {
    test('retorna o nome do entity quando name existe', () => {
      const localizationSystem = new LocalizationSystem(mockT);
      const entity = { tags: { name: 'Ponte' } };
      const hideNetwork = false;
      const expectedResult = 'Ponte';

      const result = localizationSystem.displayName(entity, hideNetwork);

      expect(result).toBe(expectedResult);
      expect(mockT).not.toHaveBeenCalled();
    });

    test('retorna o nome do entity quando name existe e hideNetwork é verdadeiro', () => {
      const localizationSystem = new LocalizationSystem(mockT);
      const entity = { tags: { name: 'Ponte' } };
      const hideNetwork = true;
      const expectedResult = 'Ponte';

      const result = localizationSystem.displayName(entity, hideNetwork);

      expect(result).toBe(expectedResult);
      expect(mockT).not.toHaveBeenCalled();
    });

  });

});