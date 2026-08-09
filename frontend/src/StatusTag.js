import React from 'react';
import StatusPill from './design/components/StatusPill';
import { getStatusColors, getStatusLabel, normalizeStatus } from './constants/jobStatuses';

const StatusTag = ({ status }) => {
  const normalized = normalizeStatus(status);
  const colors = getStatusColors(normalized);

  return (
    <StatusPill
      status={normalized.toLowerCase()}
      label={getStatusLabel(normalized)}
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.text,
      }}
    />
  );
};

export default StatusTag;