export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export * from "./database.js";
