import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Please ensure the database is provisioned.",
  );
}

const client = postgres(DATABASE_URL, {
  prepare: false,
});

export const db = drizzle(client, { schema });
