import assert from "node:assert/strict";
import test from "node:test";
import {encodeRedisCommand, parseRedisReply} from "./redis";

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
