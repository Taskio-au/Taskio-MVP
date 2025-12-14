import React from 'react';

const VerificationBadge = ({ verified }) => {
  const style = {
    backgroundColor: verified ? '#52d68a' : '#BDBDBD',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '10px',
    fontWeight: '500',
    marginLeft: '8px',
    textTransform: 'uppercase',
  };

  return <span style={style}>{verified ? 'Verified' : 'Unverified'}</span>;
};

export default VerificationBadge;
