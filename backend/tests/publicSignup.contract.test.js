'use strict';

const express = require('express');
const request = require('supertest');

const {
  isPublicSignupEnabled,
  requirePublicSignupEnabled,
} = require('../src/config/publicSignup');

function buildGateApp() {
  const app = express();
  app.post('/signup', requirePublicSignupEnabled, (_req, res) => res.status(200).send({ ok: true }));
  return app;
}

describe('isPublicSignupEnabled', () => {
  it('disables signup in production when the flag is missing', () => {
    expect(isPublicSignupEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('disables signup in production when the flag is false', () => {
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'false',
    })).toBe(false);
  });

  it('disables signup in production when the flag is malformed', () => {
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'YES',
    })).toBe(false);
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      TASKIO_PUBLIC_SIGNUP_ENABLED: '1',
    })).toBe(false);
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'TRUE',
    })).toBe(false);
  });

  it('enables signup in production only for the exact value true', () => {
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'true',
    })).toBe(true);
  });

  it('allows signup in non-production when the flag is absent', () => {
    expect(isPublicSignupEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isPublicSignupEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('respects an explicit false flag in non-production', () => {
    expect(isPublicSignupEnabled({
      NODE_ENV: 'development',
      TASKIO_PUBLIC_SIGNUP_ENABLED: 'false',
    })).toBe(false);
  });
});

describe('requirePublicSignupEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) {
      delete process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;
    } else {
      process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = originalFlag;
    }
  });

  it('returns a stable 503 without exposing configuration when production signup is off', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TASKIO_PUBLIC_SIGNUP_ENABLED;

    const res = await request(buildGateApp()).post('/signup').send({});

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      message: 'Signup is temporarily unavailable.',
      code: 'signup_disabled',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/TASKIO_PUBLIC_SIGNUP_ENABLED|NODE_ENV|production/i);
  });

  it('allows the handler when production signup is explicitly true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TASKIO_PUBLIC_SIGNUP_ENABLED = 'true';

    const res = await request(buildGateApp()).post('/signup').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
