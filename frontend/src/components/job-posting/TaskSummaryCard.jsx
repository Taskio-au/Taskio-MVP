import React from 'react';
import {
  getCanonicalJobTypeLabel,
  getTopLevelCategoryLabelForJobType,
} from '../../constants/taskTaxonomy';

const durationLabelMap = {
  under_1_hour: 'Under 1 hour',
  one_to_two_hours: '1 to 2 hours',
};

const budgetLabelMap = {
  under_150: 'Under $150',
  '150_to_300': '$150 - $300',
  not_sure_under_300: 'Not sure, but under $300',
};

const propertyTypeLabelMap = {
  apartment_unit: 'Apartment / unit',
  house_townhouse: 'House / townhouse',
};

const EMPTY_JOB_TYPE = '—';

export default function TaskSummaryCard({ formData, categoryLabel }) {
  const resolvedCategory =
    (categoryLabel && String(categoryLabel).trim()) ||
    getTopLevelCategoryLabelForJobType(formData.jobType);
  const hasCategoryBlock = Boolean(resolvedCategory);

  const jobTypeDisplayValue = formData.jobType
    ? getCanonicalJobTypeLabel(formData.jobType) || EMPTY_JOB_TYPE
    : EMPTY_JOB_TYPE;

  const isEmpty =
    !hasCategoryBlock &&
    !formData.jobType &&
    !formData.timeline &&
    !formData.budget &&
    !formData.location;

  const locationLabel = formData.location && typeof formData.location === 'object'
    ? `${formData.location.suburb}, ${formData.location.state} ${formData.location.postcode}`
    : (formData.location || '');

  const summaryItems = [
    hasCategoryBlock ? { label: 'Task', value: resolvedCategory } : null,
    hasCategoryBlock ? { label: 'Job type', value: jobTypeDisplayValue } : null,
    (formData.timeline || formData.specificDate)
      ? { label: 'Timeline', value: formData.timeline === 'On a specific date' ? formData.specificDate : formData.timeline }
      : null,
    formData.estimatedDuration ? { label: 'Estimated duration', value: durationLabelMap[formData.estimatedDuration] } : null,
    formData.budget ? { label: 'Budget', value: budgetLabelMap[formData.budget] } : null,
    locationLabel ? { label: 'Location', value: locationLabel } : null,
    formData.propertyType ? { label: 'Property type', value: propertyTypeLabelMap[formData.propertyType] || formData.propertyType } : null,
    (formData.liftAvailable && formData.stairs && formData.parking)
      ? { label: 'Access', value: `Lift: ${formData.liftAvailable} • Stairs: ${formData.stairs} • Parking: ${formData.parking}` }
      : null,
  ].filter(Boolean);

  return (
    <div className="taskio-summaryCard">
      <h3 className="taskio-summaryCardTitle">Your Task</h3>
      <p className="taskio-summaryCardSubtitle">
        {isEmpty ? 'Choose a category to start' : 'Live preview as you fill it in'}
      </p>

      {summaryItems.map((item, index) => (
        <div
          key={item.label}
          className={`taskio-summaryCardRow${index === summaryItems.length - 1 ? ' taskio-summaryCardRow--last' : ''}`}
        >
          <span className="taskio-summaryCardLabel">{item.label}</span>
          <span className="taskio-summaryCardValue">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
