import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {encodeRedisCommand, parseRedisReply, sendRedisCommand} from "./redis";

function parseRedisCommand(buffer: Buffer): {bytesConsumed: number; command: string[]} | null {
  if (buffer.length === 0 || buffer.toString("utf8", 0, 1) !== "*") {
    return null;
  }

  const headerEndIndex = buffer.indexOf("\r\n", 1, "utf8");

  if (headerEndIndex === -1) {
    return null;
  }

  const argumentCount = Number.parseInt(buffer.toString("utf8", 1, headerEndIndex), 10);
  const command: string[] = [];
  let cursor = headerEndIndex + 2;

  for (let index = 0; index < argumentCount; index += 1) {
    if (buffer.toString("utf8", cursor, cursor + 1) !== "$") {
      throw new Error("Expected bulk string argument.");
    }

    const lengthEndIndex = buffer.indexOf("\r\n", cursor + 1, "utf8");

    if (lengthEndIndex === -1) {
      return null;
    }

    const valueLength = Number.parseInt(buffer.toString("utf8", cursor + 1, lengthEndIndex), 10);
    const valueStartIndex = lengthEndIndex + 2;
    const valueEndIndex = valueStartIndex + valueLength;

    if (buffer.length < valueEndIndex + 2) {
      return null;
    }

    command.push(buffer.toString("utf8", valueStartIndex, valueEndIndex));
    cursor = valueEndIndex + 2;
  }

  return {
    bytesConsumed: cursor,
    command,
  };
}

async function withMockRedisServer(
  onCommand: (command: string[], socket: net.Socket) => void,
  run: (redisUrl: string) => Promise<void>,
): Promise<void> {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const parsedCommand = parseRedisCommand(buffer);

        if (!parsedCommand) {
          return;
        }

        buffer = buffer.subarray(parsedCommand.bytesConsumed);
        onCommand(parsedCommand.command, socket);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP server to expose an AddressInfo result.");
  }

  try {
    await run(`redis://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("encodes Redis commands using RESP", () => {
  const encoded = encodeRedisCommand(["SET", "ff:env_projection:env_staging", '{"ok":true}']);

  assert.equal(
    encoded.toString("utf8"),
    '*3\r\n$3\r\nSET\r\n$29\r\nff:env_projection:env_staging\r\n$11\r\n{"ok":true}\r\n',
  );
});

test("parses simple string replies", () => {
  assert.deepEqual(parseRedisReply(Buffer.from("+PONG\r\n", "utf8")), {
    bytesConsumed: 7,
    reply: {
      kind: "simple_string",
      value: "PONG",
    },
  });
});

test("parses bulk string replies", () => {
  assert.deepEqual(parseRedisReply(Buffer.from("$5\r\nhello\r\n", "utf8")), {
    bytesConsumed: 11,
    reply: {
      kind: "bulk_string",
      value: "hello",
    },
  });
});

test("parses null bulk string replies", () => {
  assert.deepEqual(parseRedisReply(Buffer.from("$-1\r\n", "utf8")), {
    bytesConsumed: 5,
    reply: {
      kind: "null_bulk_string",
    },
  });
});

test("parses error replies", () => {
  assert.deepEqual(parseRedisReply(Buffer.from("-ERR broken\r\n", "utf8")), {
    bytesConsumed: 13,
    reply: {
      kind: "error",
      value: "ERR broken",
    },
  });
});

test("returns null when a Redis reply is incomplete", () => {
  assert.equal(parseRedisReply(Buffer.from("$5\r\nhel", "utf8")), null);
});

test("sends commands without AUTH for local Redis URLs", async () => {
  const receivedCommands: string[][] = [];

  await withMockRedisServer(
    (command, socket) => {
      receivedCommands.push(command);
      socket.write("+PONG\r\n");
    },
    async (redisUrl) => {
      const reply = await sendRedisCommand(redisUrl, ["PING"]);

      assert.deepEqual(reply, {
        kind: "simple_string",
        value: "PONG",
      });
    },
  );

  assert.deepEqual(receivedCommands, [["PING"]]);
});

test("authenticates before sending commands for managed Redis URLs", async () => {
  const receivedCommands: string[][] = [];

  await withMockRedisServer(
    (command, socket) => {
      receivedCommands.push(command);
      socket.write(command[0] === "AUTH" ? "+OK\r\n" : "+PONG\r\n");
    },
    async (redisUrl) => {
      const authenticatedUrl = redisUrl.replace("redis://", "redis://default:upstash-token@");
      const reply = await sendRedisCommand(authenticatedUrl, ["PING"]);

      assert.deepEqual(reply, {
        kind: "simple_string",
        value: "PONG",
      });
    },
  );

  assert.deepEqual(receivedCommands, [["AUTH", "default", "upstash-token"], ["PING"]]);
});
