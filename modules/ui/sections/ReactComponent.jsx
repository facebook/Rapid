import React, { useState } from 'react';
import * as PropTypes from 'prop-types';

const ReactComponent = ({reRenderCount, sources, selectSourceHandler}) => {
  const [selected, setSelected] = useState('');

  const handle = (e) => {
    setSelected(e.target.value);
    const source = sources.find(s => s.id === e.target.value);
    selectSourceHandler(source);
  };

  const listItems = sources.map((source) =>
    <li key={source.id}>
      <label>
        <input
          type="radio"
          name="react-layers"
          value={source.id}
          checked={source.id === selected}
          onChange={handle}
        />
        <span className="background-name">{source.name}</span>
      </label>
    </li>
  );

  return (
    <div style={{paddingLeft: '1.5rem'}}>
      <div>(I&apos;ve been reRendered {reRenderCount} times)</div>
      <ul>{listItems}</ul>
    </div>
  );
};

ReactComponent.propTypes = {
  reRenderCount: PropTypes.number,
  sources: PropTypes.array,
  selectSourceHandler: PropTypes.func
};

export default ReactComponent;