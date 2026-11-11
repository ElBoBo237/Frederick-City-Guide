import { Router, type IRouter } from "express";
import { FEATURED_DISH } from "../agents/dishInspector";
import { PART_A_SETTINGS } from "../city";

const UNSPLASH_API = "https://api.unsplash.com";
const ATTRIBUTION_SOURCE = "frederick_city_guide";
const ATTRIBUTION_MEDIUM = "referral";

const router: IRouter = Router();

function getUnsplashAccessKey(): string | undefined {
  return process.env.UNSPLASH_ACCESS_KEY?.trim() || undefined;
}

function withAttribution(url: string): string {
  const attributedUrl = new URL(url);
  attributedUrl.searchParams.set("utm_source", ATTRIBUTION_SOURCE);
  attributedUrl.searchParams.set("utm_medium", ATTRIBUTION_MEDIUM);
  return attributedUrl.toString();
}

router.get("/unsplash/dish-inspiration", async (req, res): Promise<void> => {
  const accessKey = getUnsplashAccessKey();
  if (!accessKey) {
    res.status(503).json({
      error:
        "Unsplash inspiration is not configured yet. Add the UNSPLASH_ACCESS_KEY secret to enable it.",
    });
    return;
  }

  const city = PART_A_SETTINGS.cityName.split(",")[0]?.trim();
  const query = [city, FEATURED_DISH].filter(Boolean).join(" ");
  const searchUrl = new URL("/search/photos", UNSPLASH_API);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("per_page", "6");

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      req.log.warn(
        { statusCode: response.status },
        "Unsplash inspiration search failed",
      );
      res.status(502).json({
        error:
          "Unsplash inspiration is temporarily unavailable. Please try again.",
      });
      return;
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("results" in payload) ||
      !Array.isArray(payload.results)
    ) {
      throw new Error("Unsplash returned an invalid search response.");
    }

    const photos = payload.results.slice(0, 6).flatMap((photo: unknown) => {
      if (typeof photo !== "object" || photo === null) return [];
      if (!("id" in photo) || typeof photo.id !== "string") return [];
      if (
        !("urls" in photo) ||
        typeof photo.urls !== "object" ||
        photo.urls === null
      ) {
        return [];
      }
      if (
        !("user" in photo) ||
        typeof photo.user !== "object" ||
        photo.user === null
      ) {
        return [];
      }
      if (
        !("links" in photo) ||
        typeof photo.links !== "object" ||
        photo.links === null
      ) {
        return [];
      }

      const { urls, user, links } = photo;
      if (!("regular" in urls) || typeof urls.regular !== "string") return [];
      if (!("raw" in urls) || typeof urls.raw !== "string") return [];
      if (!("name" in user) || typeof user.name !== "string") return [];
      if (
        !("links" in user) ||
        typeof user.links !== "object" ||
        user.links === null
      ) {
        return [];
      }
      if (!("html" in user.links) || typeof user.links.html !== "string")
        return [];
      if (
        !("download_location" in links) ||
        typeof links.download_location !== "string"
      ) {
        return [];
      }

      const altText =
        "alt_description" in photo && typeof photo.alt_description === "string"
          ? photo.alt_description
          : "Food inspiration photo";

      return [
        {
          id: photo.id,
          imageUrl: urls.regular,
          rawUrl: urls.raw,
          altText,
          photographerName: user.name,
          photographerProfileUrl: withAttribution(user.links.html),
          downloadLocation: links.download_location,
        },
      ];
    });

    res.json(photos);
  } catch (error) {
    req.log.warn(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Unsplash inspiration search failed",
    );
    res.status(502).json({
      error:
        "Unsplash inspiration is temporarily unavailable. Please try again.",
    });
  }
});

router.post(
  "/unsplash/dish-inspiration/download",
  async (req, res): Promise<void> => {
    const accessKey = getUnsplashAccessKey();
    if (!accessKey) {
      res.status(503).json({
        error:
          "Unsplash inspiration is not configured yet. Add the UNSPLASH_ACCESS_KEY secret to enable it.",
      });
      return;
    }

    const { downloadLocation } = req.body ?? {};
    if (typeof downloadLocation !== "string") {
      res
        .status(400)
        .json({ error: "A valid Unsplash download location is required." });
      return;
    }

    let downloadUrl: URL;
    try {
      downloadUrl = new URL(downloadLocation);
    } catch {
      res
        .status(400)
        .json({ error: "A valid Unsplash download location is required." });
      return;
    }

    if (
      downloadUrl.protocol !== "https:" ||
      downloadUrl.hostname !== "api.unsplash.com" ||
      downloadUrl.port ||
      downloadUrl.username ||
      downloadUrl.password ||
      !/^\/photos\/[A-Za-z0-9_-]+\/download$/.test(downloadUrl.pathname)
    ) {
      res
        .status(400)
        .json({ error: "A valid Unsplash download location is required." });
      return;
    }

    try {
      const response = await fetch(
        new URL(downloadUrl.pathname, UNSPLASH_API),
        {
          headers: {
            Authorization: `Client-ID ${accessKey}`,
            "Accept-Version": "v1",
          },
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        req.log.warn(
          { statusCode: response.status },
          "Unsplash download tracking failed",
        );
        res.status(502).json({
          error: "We couldn't record this Unsplash view. Please try again.",
        });
        return;
      }

      res.status(204).end();
    } catch (error) {
      req.log.warn(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Unsplash download tracking failed",
      );
      res.status(502).json({
        error: "We couldn't record this Unsplash view. Please try again.",
      });
    }
  },
);

export default router;
