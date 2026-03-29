import net from "node:net";

const REDIS_PING_COMMAND = "*1\r\n$4\r\nPING\r\n";

export async function pingRedis(redisUrl: string, timeoutMs = 1000): Promise<void> {
  const url = new URL(redisUrl);
  const host = url.hostname;
  const port = Number.parseInt(url.port || "6379", 10);

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({
      host,
      port,
    });

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to Redis at ${host}:${port}`));
    }, timeoutMs);

    socket.setEncoding("utf8");

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.once("data", (response: string) => {
      clearTimeout(timeout);
      socket.end();

      if (response.startsWith("+PONG")) {
        resolve();
        return;
      }

      reject(new Error(`Unexpected Redis response: ${response.trim()}`));
    });

    socket.once("connect", () => {
      socket.write(REDIS_PING_COMMAND);
    });
  });
}
