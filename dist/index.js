import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { auth } from "./lib/auth.js";
import * as dotenv from "dotenv";
dotenv.config();
const app = new Hono();
app.get("/", (c) => {
    return c.text("Hello Hono!");
});
app.on(["POST", "GET"], "/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
});
serve({
    fetch: app.fetch,
    port: Number(process.env.PORT) || 3000,
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
