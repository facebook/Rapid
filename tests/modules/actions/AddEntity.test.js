import { actionAddEntity } from "../../../modules/actions/add_entity";

describe( 'actionAddEntity', () => {

  test('substitui corretamente o valor "way" em um gráfico vazio', () => {
    const way = 'caminho';
    const graph = '';
    const expectedResult = '';

    const action = actionAddEntity(way);
    const result = action(graph);

    expect(result).toBe(expectedResult);
  });

});