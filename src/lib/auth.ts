import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";

import db from "./db.js";

export const auth = betterAuth({
  plugins: [expo()],
  trustedOrigins: ["myapp://"],
  database: prismaAdapter(db, {
    provider: "mongodb",
  }),
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      phoneNumber: {
        type: "string",
      },
      referralCode: {
        type: "string",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
});
