import net from "node:net";

type RedisReply =
  | {kind: "bulk_string"; value: string}
  | {kind: "error"; value: string}
  | {kind: "integer"; value: number}
  | {kind: "null_bulk_string"}
  | {kind: "simple_string"; value: string};

type RedisConnection = {
  authArguments: ReadonlyArray<string> | null;
  host: string;
  port: number;
};

function findLineTerminator(buffer: Buffer, start = 0): number {
  return buffer.indexOf("\r\n", start, "utf8");
}

function parseLineReply(
  buffer: Buffer,
  kind: "error" | "integer" | "simple_string",
): {bytesConsumed: number; reply: RedisReply} | null {
  const endIndex = findLineTerminator(buffer, 1);

  if (endIndex === -1) {
    return null;
  }

  const rawValue = buffer.toString("utf8", 1, endIndex);

  if (kind === "integer") {
    return {
      bytesConsumed: endIndex + 2,
      reply: {
        kind,
        value: Number.parseInt(rawValue, 10),
      },
    };
  }

  return {
    bytesConsumed: endIndex + 2,
    reply: {
      kind,
      value: rawValue,
    },
  };
}

export function encodeRedisCommand(argumentsList: ReadonlyArray<string>): Buffer {
  const encodedCommand = [
    `*${argumentsList.length}\r\n`,
    ...argumentsList.flatMap((value) => [
      `$${Buffer.byteLength(value, "utf8")}\r\n`,
      `${value}\r\n`,
    ]),
  ].join("");

  return Buffer.from(encodedCommand, "utf8");
}

export function parseRedisReply(buffer: Buffer): {bytesConsumed: number; reply: RedisReply} | null {
  if (buffer.length === 0) {
    return null;
  }

  const prefix = buffer.toString("utf8", 0, 1);

  if (prefix === "+") {
    return parseLineReply(buffer, "simple_string");
  }

  if (prefix === "-") {
    return parseLineReply(buffer, "error");
  }

  if (prefix === ":") {
    return parseLineReply(buffer, "integer");
  }

  if (prefix === "$") {
    const headerEndIndex = findLineTerminator(buffer, 1);

    if (headerEndIndex === -1) {
      return null;
    }

    const payloadLength = Number.parseInt(buffer.toString("utf8", 1, headerEndIndex), 10);

    if (payloadLength === -1) {
      return {
        bytesConsumed: headerEndIndex + 2,
        reply: {kind: "null_bulk_string"},
      };
    }

    const payloadStartIndex = headerEndIndex + 2;
    const payloadEndIndex = payloadStartIndex + payloadLength;

    if (buffer.length < payloadEndIndex + 2) {
      return null;
    }

    return {
      bytesConsumed: payloadEndIndex + 2,
      reply: {
        kind: "bulk_string",
        value: buffer.toString("utf8", payloadStartIndex, payloadEndIndex),
      },
    };
  }

  throw new Error(`Unsupported Redis reply prefix: ${prefix}`);
}

function decodeRedisUrlComponent(value: string): string {
  return decodeURIComponent(value);
}

function readRedisConnection(redisUrl: string): RedisConnection {
  const url = new URL(redisUrl);

  if (url.protocol !== "redis:") {
    throw new Error(`Unsupported Redis protocol: ${url.protocol}`);
  }

  if (url.pathname.length > 0 && url.pathname !== "/" && url.pathname !== "/0") {
    throw new Error(`Unsupported Redis database path: ${url.pathname}`);
  }

  const username = url.username.length > 0 ? decodeRedisUrlComponent(url.username) : "";
  const password = url.password.length > 0 ? decodeRedisUrlComponent(url.password) : "";

  if (username.length > 0 && password.length === 0) {
    throw new Error("Redis username requires a password.");
  }

  return {
    authArguments:
      password.length === 0
        ? null
        : username.length === 0
          ? ["AUTH", password]
          : ["AUTH", username, password],
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
  };
}

export async function sendRedisCommand(
  redisUrl: string,
  argumentsList: ReadonlyArray<string>,
  timeoutMs = 1000,
): Promise<RedisReply> {
  const {authArguments, host, port} = readRedisConnection(redisUrl);
  const command = encodeRedisCommand(argumentsList);

  return await new Promise<RedisReply>((resolve, reject) => {
    const socket = net.createConnection({host, port});
    let responseBuffer = Buffer.alloc(0);
    let settled = false;
    let stage: "auth" | "command" = authArguments ? "auth" : "command";

    const settleError = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      reject(error);
    };

    const settleReply = (reply: RedisReply): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.end();
      resolve(reply);
    };

    const processReplies = (): void => {
      while (true) {
        const parsedReply = parseRedisReply(responseBuffer);

        if (!parsedReply) {
          return;
        }

        responseBuffer = responseBuffer.subarray(parsedReply.bytesConsumed);

        if (parsedReply.reply.kind === "error") {
          settleError(new Error(`Redis command failed: ${parsedReply.reply.value}`));
          return;
        }

        if (stage === "auth") {
          if (parsedReply.reply.kind !== "simple_string" || parsedReply.reply.value !== "OK") {
            settleError(
              new Error(`Unexpected Redis AUTH response: ${JSON.stringify(parsedReply.reply)}`),
            );
            return;
          }

          stage = "command";
          socket.write(command);
          continue;
        }

        settleReply(parsedReply.reply);
        return;
      }
    };

    const timeout = setTimeout(() => {
      settleError(new Error(`Timed out connecting to Redis at ${host}:${port}`));
    }, timeoutMs);

    socket.once("error", (error) => {
      settleError(error);
    });

    socket.on("data", (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      processReplies();
    });

    socket.once("connect", () => {
      socket.write(authArguments ? encodeRedisCommand(authArguments) : command);
    });
  });
}

export async function pingRedis(redisUrl: string, timeoutMs = 1000): Promise<void> {
  const reply = await sendRedisCommand(redisUrl, ["PING"], timeoutMs);

  if (reply.kind === "simple_string" && reply.value === "PONG") {
    return;
  }

  throw new Error(`Unexpected Redis response: ${JSON.stringify(reply)}`);
}
