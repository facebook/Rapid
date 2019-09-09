export function uiSnowflakes(context) {

    uiSnowflakes.renderPane = function(selection) {

        var _pane = selection.append('div')
            .attr('class', 'snowflake-wrap fillL')
            .attr('pane', 'snowflakes');


    var snowflakeSlowDiv = _pane
      .append('div')
      .attr('id', 'snowflakes-slow')
      .attr('aria-hidden', 'true')
      .attr('class', 'pane-heading hide');

    for (var i = 0; i < 18; i++) {
        snowflakeSlowDiv
            .append('div')
            .attr('class', 'snowflake slow ')
            .text('❅');
    }

       var snowflakeDiv =  _pane
            .append('div')
            .attr('id', 'snowflakes')
            .attr('aria-hidden', 'true')
            .attr('class', 'pane-heading');

        for (var i=0; i < 12; i++)
        {
            snowflakeDiv
            .append('div')
            .attr('class', 'snowflake')
            .text('❅');
        }


        var snowflakeFastDiv = _pane
          .append('div')
          .attr('id', 'snowflakes-fast')
          .attr('aria-hidden', 'true')
          .attr('class', 'pane-heading');

        for (var j = 0; j < 12; j++) {
          snowflakeFastDiv
            .append('div')
            .attr('class', 'snowflake fast')
            .text('❅');
        }
    };

    return uiSnowflakes;
}
