import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnectionManager, connect } from 'amqp-connection-manager';

export const AMQP_CONNECTION = Symbol('AMQP_CONNECTION');

/**
 * A self-healing broker connection: amqp-connection-manager reconnects with
 * backoff whenever the broker restarts and re-runs channel setup afterwards,
 * so the consumer survives broker outages instead of only retrying at boot.
 */
export const amqpConnectionProvider: Provider = {
  provide: AMQP_CONNECTION,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AmqpConnectionManager => {
    const logger = new Logger('AmqpConnection');
    const connection = connect([config.getOrThrow<string>('AMQP_URL')], {
      reconnectTimeInSeconds: 5,
      heartbeatIntervalInSeconds: 15,
    });
    connection.on('connect', () => logger.log('Connected to RabbitMQ'));
    connection.on('disconnect', ({ err }) =>
      logger.warn(`Disconnected from RabbitMQ: ${err?.message ?? 'unknown reason'}`),
    );
    connection.on('connectFailed', ({ err }) =>
      logger.warn(`RabbitMQ connection attempt failed: ${err?.message ?? 'unknown reason'}`),
    );
    return connection;
  },
};
