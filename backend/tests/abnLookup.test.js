'use strict';

const axios = require('axios');

jest.mock('axios');

const {
  lookupAbnDetails,
  normalizeAbrResponse,
  isAbnCurrentlyActive,
  summarizeAbnLookupError,
} = require('../src/services/abnLookup');

const VALID_ABN = '51824753556';
const LEAK_GUID = 'leak-guid-SECRETVALUE-do-not-log';

describe('ABN lookup helpers', () => {
  const originalGuid = process.env.ABN_LOOKUP_GUID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ABN_LOOKUP_GUID = 'test-placeholder-guid';
  });

  afterAll(() => {
    if (originalGuid === undefined) delete process.env.ABN_LOOKUP_GUID;
    else process.env.ABN_LOOKUP_GUID = originalGuid;
  });

  it('maps ABR AbnStatus onto entityStatus', () => {
    expect(normalizeAbrResponse({
      Abn: VALID_ABN,
      AbnStatus: 'Active',
      EntityName: 'Example Pty Ltd',
      EntityTypeName: 'Australian Private Company',
      Gst: '',
    })).toMatchObject({
      abn: VALID_ABN,
      entityStatus: 'Active',
      entityName: 'Example Pty Ltd',
      gst: '',
    });
  });

  it('treats only currently Active ABR status as active', () => {
    expect(isAbnCurrentlyActive('Active')).toBe(true);
    expect(isAbnCurrentlyActive('active')).toBe(true);
    expect(isAbnCurrentlyActive('Cancelled')).toBe(false);
    expect(isAbnCurrentlyActive('Inactive')).toBe(false);
    expect(isAbnCurrentlyActive('')).toBe(false);
    expect(isAbnCurrentlyActive('Active (Cancelled from 2020-01-01)')).toBe(false);
  });

  it('does not treat GST as part of the active check', () => {
    expect(isAbnCurrentlyActive('Active')).toBe(true);
  });

  it('redacts GUID, query params, and axios config from lookup error summaries', () => {
    const error = new Error('Request failed');
    error.code = 'ECONNABORTED';
    error.config = {
      url: `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${VALID_ABN}&guid=${LEAK_GUID}`,
      params: { abn: VALID_ABN, guid: LEAK_GUID, callback: 'taskio' },
      headers: { Authorization: 'Bearer should-not-log' },
    };
    error.response = { status: 500 };

    const summary = summarizeAbnLookupError(error);
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual({
      code: 'ECONNABORTED',
      httpStatus: 500,
      category: 'timeout',
    });
    expect(serialized).not.toContain(LEAK_GUID);
    expect(serialized).not.toMatch(/guid/i);
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain(VALID_ABN);
    expect(serialized).not.toContain('abr.business.gov.au');
  });

  it('returns Active ABR JSON without requiring GST', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: JSON.stringify({
        Abn: VALID_ABN,
        AbnStatus: 'Active',
        EntityName: 'Example Pty Ltd',
        EntityTypeName: 'Australian Private Company',
        Gst: '',
        Message: '',
      }),
    });

    await expect(lookupAbnDetails(VALID_ABN)).resolves.toMatchObject({
      abn: VALID_ABN,
      entityStatus: 'Active',
      gst: '',
    });
  });

  it('throws ABN_NOT_FOUND when ABR reports not found', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: JSON.stringify({
        Message: 'No records found',
      }),
    });

    await expect(lookupAbnDetails(VALID_ABN)).rejects.toMatchObject({
      code: 'ABN_NOT_FOUND',
    });
  });

  it('throws a sanitized error when axios rejects with GUID in config', async () => {
    const axiosError = new Error(`timeout of 12000ms exceeded GET https://abr.business.gov.au/json/AbnDetails.aspx?guid=${LEAK_GUID}`);
    axiosError.code = 'ECONNABORTED';
    axiosError.config = {
      url: `https://abr.business.gov.au/json/AbnDetails.aspx?guid=${LEAK_GUID}`,
      params: { guid: LEAK_GUID, abn: VALID_ABN },
    };
    axios.get.mockRejectedValue(axiosError);

    let thrown;
    try {
      await lookupAbnDetails(VALID_ABN);
    } catch (e) {
      thrown = e;
    }

    expect(thrown.code).toBe('ABN_LOOKUP_REQUEST_FAILED');
    expect(thrown.config).toBeUndefined();
    expect(JSON.stringify(thrown)).not.toContain(LEAK_GUID);
    expect(summarizeAbnLookupError(thrown)).toEqual({
      code: 'ABN_LOOKUP_REQUEST_FAILED',
      httpStatus: null,
      category: 'http_error',
    });
  });

  it('throws ABN_LOOKUP_PARSE_ERROR for malformed ABR bodies', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: 'taskio(not-json);',
    });

    await expect(lookupAbnDetails(VALID_ABN)).rejects.toMatchObject({
      code: 'ABN_LOOKUP_PARSE_ERROR',
    });
  });
});
