import type {QStashConfig} from "@api/config";
import {
  type ProjectionRefreshJobInput,
  buildProjectionRefreshJobPayload,
} from "@api/projections/refresh-jobs";
import {Client, Receiver} from "@upstash/qstash";

const qstashProjectionRefreshPath = "/internal/projections/rebuild-async";

type PublishRequest = Parameters<Client["publish"]>[0];
type VerifyRequest = Parameters<Receiver["verify"]>[0];

type ProjectionRefreshPublisher = {
  publish: (request: PublishRequest) => Promise<unknown>;
};

type ProjectionRefreshReceiver = {
  verify: (request: VerifyRequest) => Promise<boolean> | boolean;
};

type PublishDependencies = {
  createPublisher?: (token: string) => ProjectionRefreshPublisher;
  createReceiver?: (config: QStashConfig) => ProjectionRefreshReceiver;
};

const defaultDependencies: Required<PublishDependencies> = {
  createPublisher: (token) => new Client({token}),
  createReceiver: (config) =>
    new Receiver({
      currentSigningKey: config.currentSigningKey,
      nextSigningKey: config.nextSigningKey,
    }),
};

export function buildQStashProjectionRefreshUrl(publicApiBaseUrl: string): string {
  return new URL(qstashProjectionRefreshPath, publicApiBaseUrl).toString();
}

export async function publishProjectionRefreshJobs(
  config: QStashConfig,
  jobs: ReadonlyArray<ProjectionRefreshJobInput>,
  dependencies: PublishDependencies = defaultDependencies,
): Promise<void> {
  if (jobs.length === 0) {
    return;
  }

  const publisher = (dependencies.createPublisher ?? defaultDependencies.createPublisher)(
    config.token,
  );
  const url = buildQStashProjectionRefreshUrl(config.publicApiBaseUrl);

  await Promise.all(
    jobs.map(async (job) => {
      await publisher.publish({
        body: JSON.stringify(buildProjectionRefreshJobPayload(job)),
        contentBasedDeduplication: true,
        headers: {
          "content-type": "application/qstash+json",
        },
        retries: 5,
        timeout: "30s",
        url,
      });
    }),
  );
}

export async function verifyQStashRequest(
  config: QStashConfig,
  input: {
    body: string;
    signature: string;
    url: string;
  },
  dependencies: PublishDependencies = defaultDependencies,
): Promise<void> {
  const receiver = (dependencies.createReceiver ?? defaultDependencies.createReceiver)(config);

  await receiver.verify({
    body: input.body,
    signature: input.signature,
    url: input.url,
  });
}
