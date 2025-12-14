import React from 'react';

const StatusTag = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'open':
        return '#42A5F5'; // Light Blue
      case 'assigned':
        return '#28A745'; // Success Green
      case 'completed':
        return '#28A745'; // Success Green
      case 'cancelled':
        return '#DC3545'; // Warning Red
      default:
        return '#BDBDBD'; // Disabled Grey
    }
  };

  const style = {
    backgroundColor: getStatusColor(),
    color: 'white',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    textTransform: 'capitalize',
    minWidth: '80px',      // --- NEW ---
    display: 'inline-block', // --- NEW ---
    textAlign: 'center'    // --- NEW ---
  };

  return <span style={style}>{status.replace('_', ' ')}</span>;
};

export default StatusTag;