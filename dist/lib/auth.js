import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import db from "./db.js";
export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "mongodb",
    }),
});
