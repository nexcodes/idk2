import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { logger } from "hono/logger";
import { auth } from "./lib/auth.js";

import fs from "fs";
import { serveStatic } from "hono/serve-static";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import * as dotenv from "dotenv";
import db from "./lib/db.js";

dotenv.config();

// Create upload directory if it doesn't exist
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = new Hono();

if (process.env.NODE_ENV !== "PRODUCTION") {
  app.use(etag(), logger());
}

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.use(
  "*",
  cors({
    origin: "*",
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Serve static files from the uploads directory
app.use(
  "/uploads/*",
  serveStatic({
    root: "./",
    getContent: async (filePath, c) => {
      try {
        const data = await fs.promises.readFile(filePath);
        return new Response(data);
      } catch (error) {
        return null;
      }
    },
  })
);

// ------- BANK DETAILS ENDPOINTS -------

// GET bank details
app.get("/api/bank-details", async (c) => {
  try {
    // Find the first bank details record, or create a default one if none exists
    let bankDetails = await db.bankDetails.findFirst();

    if (!bankDetails) {
      // Return empty object if no record exists
      return c.json({
        bankName: "",
        accountName: "",
        accountNo: "",
        ifscCode: "",
      });
    }

    return c.json(bankDetails);
  } catch (error) {
    console.error("Error fetching bank details:", error);
    return c.json({ error: "Failed to fetch bank details" }, 500);
  }
});

// Create or update bank details
app.patch("/api/bank-details", async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    if (
      !body.bankName ||
      !body.accountName ||
      !body.accountNo ||
      !body.ifscCode
    ) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Find existing record
    const existingDetails = await db.bankDetails.findFirst();

    // Update or create bank details
    let bankDetails;

    if (existingDetails) {
      // Update existing record
      bankDetails = await db.bankDetails.update({
        where: { id: existingDetails.id },
        data: {
          bankName: body.bankName,
          accountName: body.accountName,
          accountNo: body.accountNo,
          ifscCode: body.ifscCode,
        },
      });
    } else {
      // Create new record
      bankDetails = await db.bankDetails.create({
        data: {
          bankName: body.bankName,
          accountName: body.accountName,
          accountNo: body.accountNo,
          ifscCode: body.ifscCode,
        },
      });
    }

    return c.json(bankDetails);
  } catch (error) {
    console.error("Error updating bank details:", error);
    return c.json({ error: "Failed to update bank details" }, 500);
  }
});

// ------- CRYPTO DETAILS ENDPOINTS -------

// GET crypto details
app.get("/api/crypto-details", async (c) => {
  try {
    // Find the first crypto details record, or create a default one if none exists
    let cryptoDetails = await db.cryptoDetails.findFirst();

    if (!cryptoDetails) {
      // Return empty object if no record exists
      return c.json({
        walletAddress: "",
        currencyName: "",
      });
    }

    return c.json(cryptoDetails);
  } catch (error) {
    console.error("Error fetching crypto details:", error);
    return c.json({ error: "Failed to fetch crypto details" }, 500);
  }
});

// Create or update crypto details
app.patch("/api/crypto-details", async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    if (!body.walletAddress || !body.currencyName) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Find existing record
    const existingDetails = await db.cryptoDetails.findFirst();

    // Update or create crypto details
    let cryptoDetails;

    if (existingDetails) {
      // Update existing record
      cryptoDetails = await db.cryptoDetails.update({
        where: { id: existingDetails.id },
        data: {
          walletAddress: body.walletAddress,
          currencyName: body.currencyName,
        },
      });
    } else {
      // Create new record
      cryptoDetails = await db.cryptoDetails.create({
        data: {
          walletAddress: body.walletAddress,
          currencyName: body.currencyName,
        },
      });
    }

    return c.json(cryptoDetails);
  } catch (error) {
    console.error("Error updating crypto details:", error);
    return c.json({ error: "Failed to update crypto details" }, 500);
  }
});

// ------- QR IMAGE ENDPOINTS -------

// GET QR image
app.get("/api/qr-image", async (c) => {
  try {
    // Find the first QR image record
    const qrImage = await db.qrImage.findFirst();

    if (!qrImage) {
      return c.json({
        exists: false,
        message: "No QR image has been uploaded yet",
      });
    }

    return c.json({
      exists: true,
      id: qrImage.id,
      filename: qrImage.filename,
      imageUrl: qrImage.filepath,
      size: qrImage.size,
    });
  } catch (error) {
    console.error("Error fetching QR image:", error);
    return c.json({ error: "Failed to fetch QR image" }, 500);
  }
});

// Upload or update QR image
app.patch("/api/qr-image", async (c) => {
  try {
    const formData = await c.req.formData();
    const qrImage = formData.get("qrImage");

    if (!qrImage || !(qrImage instanceof File)) {
      return c.json({ error: "QR image file is required" }, 400);
    }

    // Find existing record
    const existingImage = await db.qrImage.findFirst();

    // Generate a unique filename
    const fileExtension = path.extname(qrImage.name) || ".png";
    const fileName = `qr-code${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);
    const relativePath = `/uploads/${fileName}`;

    // Save the file
    const arrayBuffer = await qrImage.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Delete existing file if it exists
    if (existingImage) {
      const oldFilePath = path.join(process.cwd(), existingImage.filepath);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Write new file
    fs.writeFileSync(filePath, buffer);

    // Update or create database record
    let qrImageRecord;

    if (existingImage) {
      // Update existing record
      qrImageRecord = await db.qrImage.update({
        where: { id: existingImage.id },
        data: {
          filename: fileName,
          filepath: relativePath,
          mimetype: qrImage.type,
          size: buffer.length,
        },
      });
    } else {
      // Create new record
      qrImageRecord = await db.qrImage.create({
        data: {
          filename: fileName,
          filepath: relativePath,
          mimetype: qrImage.type,
          size: buffer.length,
        },
      });
    }

    return c.json({
      id: qrImageRecord.id,
      filename: qrImageRecord.filename,
      imageUrl: qrImageRecord.filepath,
      size: qrImageRecord.size,
    });
  } catch (error) {
    console.error("Error updating QR image:", error);
    return c.json({ error: "Failed to update QR image" }, 500);
  }
});

// ------- PRICE ENDPOINTS -------
// GET price information
app.get("/api/price", async (c) => {
  try {
    // Get the most recent price
    const price = await db.price.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!price) {
      // Return empty object with default price if no record exists
      return c.json({
        price: 0,
      });
    }

    return c.json(price);
  } catch (error) {
    console.error("Error fetching price:", error);
    return c.json({ error: "Failed to fetch price" }, 500);
  }
});

// Create or update price
app.patch("/api/price", async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    if (body.price === undefined || typeof body.price !== "number") {
      return c.json({ error: "Price is required and must be a number" }, 400);
    }

    // Find the most recent price record
    const existingPrice = await db.price.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    });

    let priceRecord;

    if (existingPrice) {
      // Update existing record
      priceRecord = await db.price.update({
        where: { id: existingPrice.id },
        data: {
          price: body.price,
        },
      });
    } else {
      // Create new record if none exists
      priceRecord = await db.price.create({
        data: {
          price: body.price,
        },
      });
    }

    return c.json(priceRecord);
  } catch (error) {
    console.error("Error updating price:", error);
    return c.json({ error: "Failed to update price" }, 500);
  }
});

// ------- USER ENDPOINTS -------
// GET all users
app.get("/api/users", async (c) => {
  try {
    // Get all users
    const users = await db.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return c.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

// PATCH endpoint to update user balance
app.patch("/api/users/:id/balance", async (c) => {
  try {
    const userId = c.req.param("id");
    const body = await c.req.json();

    // Validate input
    if (body.balance === undefined || typeof body.balance !== "number") {
      return c.json({ error: "Balance is required and must be a number" }, 400);
    }

    // Find the user
    const existingUser = await db.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Update user balance
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        balance: body.balance,
        updatedAt: new Date(), // This happens automatically with @updatedAt
      },
    });

    return c.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      balance: updatedUser.balance,
    });
  } catch (error) {
    console.error("Error updating user balance:", error);
    return c.json({ error: "Failed to update user balance" }, 500);
  }
});

// ------- WITHDRAWS ENDPOINTS -------
// GET all withdraws
app.get("/api/withdraws", async (c) => {
  try {
    // Get all withdraws ordered by most recent first
    const withdraws = await db.withdraws.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return c.json(withdraws);
  } catch (error) {
    console.error("Error fetching withdraws:", error);
    return c.json({ error: "Failed to fetch withdraws" }, 500);
  }
});

// Create a new withdraw
app.post("/api/withdraws", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();

    // Validate required fields
    const requiredFields = [
      "amount",
      "bankName",
      "accountName",
      "accountNo",
      "ifscCode",
    ];
    for (const field of requiredFields) {
      if (body[field] === undefined) {
        return c.json({ error: `Missing required field: ${field}` }, 400);
      }
    }

    // Type validation
    if (typeof body.amount !== "number") {
      return c.json({ error: "Amount must be numbers" }, 400);
    }

    if (
      typeof body.bankName !== "string" ||
      typeof body.accountName !== "string" ||
      typeof body.accountNo !== "string" ||
      typeof body.ifscCode !== "string"
    ) {
      return c.json({ error: "Bank details must be strings" }, 400);
    }

    const BMCPrice = await db.price.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!BMCPrice) {
      return c.json({ error: "No price data found" }, 500);
    }

    // Create new withdraw record
    const newWithdraw = await db.withdraws.create({
      data: {
        amount: body.amount,
        BMCPrice: BMCPrice.price,
        bankName: body.bankName,
        accountName: body.accountName,
        accountNo: body.accountNo,
        ifscCode: body.ifscCode,
      },
    });

    await db.user.update({
      where: { id: session.user.id },
      data: {
        balance: {
          decrement: body.amount,
        },
      },
    });

    return c.json(newWithdraw, 201); // 201 Created status
  } catch (error) {
    console.error("Error creating withdraw:", error);
    return c.json({ error: "Failed to create withdraw" }, 500);
  }
});

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT) || 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
