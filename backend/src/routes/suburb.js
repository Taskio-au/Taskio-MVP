'use strict';

const express = require('express');
const { searchMelbournePilotLocations } = require('../../../shared/auLocations');

const router = express.Router();

// Suburb search for the current Melbourne launch area.
router.get('/api/suburb-search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).send({ message: 'A search query is required.' });

  try {
    const results = searchMelbournePilotLocations(q, 10).map((item) => ({
      name: item.suburb,
      postcode: item.postcode,
      label: item.label,
      coordinates: {
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
      },
      country: 'AU',
      state: {
        abbreviation: item.state,
      },
    }));
    return res.status(200).send(results);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Suburb search failed:', error.message);
    return res.status(500).send({ message: 'Failed to fetch suburb data.' });
  }
});

module.exports = router;


