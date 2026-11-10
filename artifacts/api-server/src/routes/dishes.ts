import { db, dishPhotosTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageMimeType = (typeof IMAGE_TYPES)[number];

const router: IRouter = Router();

function isImageMimeType(value: string): value is ImageMimeType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function hasExpectedSignature(bytes: Buffer, mimeType: ImageMimeType): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

function parseImageDataUrl(value: unknown):
  | { bytes: Buffer; mimeType: ImageMimeType }
  | { error: string } {
  if (typeof value !== "string") {
    return { error: "Choose a JPEG, PNG, or WebP image to upload." };
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) {
    return { error: "Choose a valid JPEG, PNG, or WebP image." };
  }

  const mimeType = match[1];
  if (!mimeType || !isImageMimeType(mimeType)) {
    return { error: "Only JPEG, PNG, and WebP images are accepted." };
  }

  const encoded = match[2];
  if (!encoded || encoded.length % 4 !== 0) {
    return { error: "The image data is invalid." };
  }

  const decodedSize = (encoded.length / 4) * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (decodedSize > MAX_IMAGE_BYTES) {
    return { error: "Images must be 3 MB or smaller." };
  }

  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0 ||
    bytes.length !== decodedSize ||
    !hasExpectedSignature(bytes, mimeType)
  ) {
    return { error: "The uploaded file is not a valid image of the selected type." };
  }

  return { bytes, mimeType };
}

function publicDishPhoto(dish: {
  id: number;
  title: string;
  caption: string;
  mimeType: string;
  createdAt: Date;
}) {
  return {
    id: dish.id,
    title: dish.title,
    caption: dish.caption,
    mimeType: dish.mimeType,
    createdAt: dish.createdAt,
    imageUrl: `/api/dishes/${dish.id}/image`,
  };
}

router.get("/dishes", async (_req, res): Promise<void> => {
  const dishes = await db
    .select({
      id: dishPhotosTable.id,
      title: dishPhotosTable.title,
      caption: dishPhotosTable.caption,
      mimeType: dishPhotosTable.mimeType,
      createdAt: dishPhotosTable.createdAt,
    })
    .from(dishPhotosTable)
    .orderBy(desc(dishPhotosTable.createdAt), desc(dishPhotosTable.id));

  res.json(dishes.map(publicDishPhoto));
});

router.post("/dishes", async (req, res): Promise<void> => {
  const { title, caption, image } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Enter a title for the dish." });
    return;
  }
  if (title.trim().length > 120) {
    res.status(400).json({ error: "Dish titles must be 120 characters or fewer." });
    return;
  }
  if (caption !== undefined && typeof caption !== "string") {
    res.status(400).json({ error: "The caption must be text." });
    return;
  }
  if (typeof caption === "string" && caption.length > 500) {
    res.status(400).json({ error: "Captions must be 500 characters or fewer." });
    return;
  }

  const parsedImage = parseImageDataUrl(image);
  if ("error" in parsedImage) {
    res.status(400).json({ error: parsedImage.error });
    return;
  }

  const [dish] = await db
    .insert(dishPhotosTable)
    .values({
      title: title.trim(),
      caption: typeof caption === "string" ? caption.trim() : "",
      mimeType: parsedImage.mimeType,
      imageBase64: parsedImage.bytes.toString("base64"),
    })
    .returning({
      id: dishPhotosTable.id,
      title: dishPhotosTable.title,
      caption: dishPhotosTable.caption,
      mimeType: dishPhotosTable.mimeType,
      createdAt: dishPhotosTable.createdAt,
    });

  if (!dish) {
    throw new Error("The inserted dish photo was not returned by the database.");
  }

  res.status(201).json(publicDishPhoto(dish));
});

router.get("/dishes/:id/image", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(404).json({ error: "Dish photo not found." });
    return;
  }

  const [dish] = await db
    .select({
      mimeType: dishPhotosTable.mimeType,
      imageBase64: dishPhotosTable.imageBase64,
    })
    .from(dishPhotosTable)
    .where(eq(dishPhotosTable.id, id))
    .limit(1);

  if (!dish) {
    res.status(404).json({ error: "Dish photo not found." });
    return;
  }

  res
    .status(200)
    .set({
      "Content-Type": dish.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400",
    })
    .send(Buffer.from(dish.imageBase64, "base64"));
});

export default router;
