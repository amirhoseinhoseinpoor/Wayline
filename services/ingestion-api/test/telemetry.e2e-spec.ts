import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.setup';
import { TelemetryModule } from '../src/telemetry/telemetry.module';

/**
 * Exercises the HTTP API against a real (in-memory) MongoDB. The AMQP consumer
 * is left out; its decision logic has its own unit tests.
 */
describe('Telemetry API (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;

  const http = () => request(app.getHttpServer());

  const batch = (overrides: Record<string, unknown> = {}) => ({
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    deviceId: 'vehicle-001',
    recordedAt: '2026-11-17T09:30:00.000Z',
    readings: [
      { offsetMs: 1000, lat: 52.5209, lng: 13.405, speedMps: 10 },
      { offsetMs: 0, lat: 52.52, lng: 13.405, speedMps: 6 },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongo.getUri('wayline-test')), TelemetryModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { swagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('stores a batch with computed route stats and sorted readings', async () => {
    const created = await http().post('/api/v1/telemetry').send(batch()).expect(201);
    expect(created.body).toEqual({ id: expect.any(String), status: 'created' });

    const fetched = await http().get(`/api/v1/telemetry/${created.body.id}`).expect(200);
    expect(fetched.body.readings.map((r: { offsetMs: number }) => r.offsetMs)).toEqual([0, 1000]);
    expect(fetched.body.stats).toMatchObject({
      readingCount: 2,
      durationMs: 1000,
      maxSpeedMps: 10,
      avgSpeedMps: 8,
    });
    expect(fetched.body.stats.distanceMeters).toBeCloseTo(100.08, 0);
  });

  it('is idempotent on messageId', async () => {
    const payload = batch({ messageId: 'replayed-1' });
    const first = await http().post('/api/v1/telemetry').send(payload).expect(201);
    const second = await http().post('/api/v1/telemetry').send(payload).expect(200);

    expect(second.body).toEqual({ id: first.body.id, status: 'duplicate' });
  });

  it.each([
    ['missing readings', { readings: undefined }],
    ['empty readings', { readings: [] }],
    ['bad latitude', { readings: [{ offsetMs: 0, lat: 91, lng: 0, speedMps: 0 }] }],
    ['bad device id', { deviceId: 'has spaces' }],
    ['bad timestamp', { recordedAt: 'yesterday' }],
    ['unknown field', { firmware: '1.2.3' }],
  ])('rejects invalid payloads: %s', async (_name, overrides) => {
    await http().post('/api/v1/telemetry').send(batch(overrides)).expect(400);
  });

  it('lists batches newest first, filtered and paginated, without raw readings', async () => {
    const seed: Array<[string, number]> = [
      ['truck-a', 1],
      ['truck-a', 2],
      ['truck-a', 3],
      ['truck-b', 4],
    ];
    for (const [deviceId, minute] of seed) {
      await http()
        .post('/api/v1/telemetry')
        .send(batch({ deviceId, recordedAt: `2026-11-18T10:0${minute}:00.000Z` }))
        .expect(201);
    }

    const page = await http()
      .get('/api/v1/telemetry')
      .query({ deviceId: 'truck-a', limit: 2, page: 1 })
      .expect(200);
    expect(page.body.total).toBe(3);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.items[0].recordedAt).toBe('2026-11-18T10:03:00.000Z');
    expect(page.body.items[0].readings).toBeUndefined();

    const ranged = await http()
      .get('/api/v1/telemetry')
      .query({ deviceId: 'truck-a', from: '2026-11-18T10:02:00Z', to: '2026-11-18T10:02:59Z' })
      .expect(200);
    expect(ranged.body.total).toBe(1);
  });

  it('rejects an oversized page', async () => {
    await http().get('/api/v1/telemetry').query({ limit: 1000 }).expect(400);
  });

  it('summarises devices with their last position', async () => {
    const devices = await http().get('/api/v1/devices').expect(200);
    const truckA = devices.body.find((d: { deviceId: string }) => d.deviceId === 'truck-a');

    expect(truckA).toMatchObject({
      batchCount: 3,
      lastSeenAt: '2026-11-18T10:03:00.000Z',
      maxSpeedMps: 10,
      lastPosition: { lat: 52.5209, lng: 13.405 },
    });
  });

  it('returns 404 for unknown or malformed ids, and deletes existing ones', async () => {
    await http().get('/api/v1/telemetry/not-an-id').expect(404);
    await http().get('/api/v1/telemetry/64b7f0000000000000000000').expect(404);

    const created = await http().post('/api/v1/telemetry').send(batch()).expect(201);
    await http().delete(`/api/v1/telemetry/${created.body.id}`).expect(204);
    await http().get(`/api/v1/telemetry/${created.body.id}`).expect(404);
  });
});
