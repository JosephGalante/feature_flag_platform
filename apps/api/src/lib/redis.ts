import net from "node:net";

type RedisReply =
  | {kind: "bulk_string"; value: string}
  | {kind: "error"; value: string}
  | {kind: "integer"; value: number}
  | {kind: "null_bulk_string"}
  | {kind: "simple_string"; value: string};

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

function readRedisConnection(redisUrl: string): {host: string; port: number} {
  const url = new URL(redisUrl);

  if (url.protocol !== "redis:") {
    throw new Error(`Unsupported Redis protocol: ${url.protocol}`);
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("Redis auth is not supported by the lightweight Redis client.");
  }

  if (url.pathname.length > 0 && url.pathname !== "/" && url.pathname !== "/0") {
    throw new Error(`Unsupported Redis database path: ${url.pathname}`);
  }

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
  };
}

export async function sendRedisCommand(
  redisUrl: string,
  argumentsList: ReadonlyArray<string>,
  timeoutMs = 1000,
): Promise<RedisReply> {
  const {host, port} = readRedisConnection(redisUrl);
  const command = encodeRedisCommand(argumentsList);

  return await new Promise<RedisReply>((resolve, reject) => {
    const socket = net.createConnection({host, port});
    let responseBuffer = Buffer.alloc(0);

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to Redis at ${host}:${port}`));
    }, timeoutMs);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.on("data", (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      const parsedReply = parseRedisReply(responseBuffer);

      if (!parsedReply) {
        return;
      }

      clearTimeout(timeout);
      socket.end();

      if (parsedReply.reply.kind === "error") {
        reject(new Error(`Redis command failed: ${parsedReply.reply.value}`));
        return;
      }

      resolve(parsedReply.reply);
    });

    socket.once("connect", () => {
      socket.write(command);
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
