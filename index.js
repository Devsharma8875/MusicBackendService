const express = require("express");
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cache = require("memory-cache");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  })
);

// Rate limiting (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Cache middleware (5 minute TTL)
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = "__express__" + req.originalUrl;
    const cachedBody = cache.get(key);

    if (cachedBody) {
      res.send(cachedBody);
      return;
    } else {
      res.sendResponse = res.send;
      res.send = (body) => {
        cache.put(key, body, duration * 1000);
        res.sendResponse(body);
      };
      next();
    }
  };
};

// Validate YouTube ID middleware
const validateYouTubeId = (req, res, next) => {
  const videoId = req.params.id;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({
      error: "Invalid YouTube Video ID",
      message: "ID must be exactly 11 alphanumeric characters",
    });
  }
  next();
};

// Audio streaming endpoint
// app.get(
//   "/song/:id",
//   validateYouTubeId,
//   cacheMiddleware(300),
//   async (req, res) => {
//     const videoId = req.params.id;

//     try {
//       const info = await ytdl.getInfo(videoId, {
//         lang: "en",
//         requestOptions: {
//           headers: {
//             "User-Agent":
//               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
//             "Accept-Language": "en-US,en;q=0.9",
//           },
//         },
//       });

//       // Get audio formats
//       const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
//       if (audioFormats.length === 0) {
//         return res.status(404).json({ error: "No audio formats available" });
//       }

//       // Select formats
//       const formatHigh = ytdl.chooseFormat(audioFormats, {
//         quality: "highestaudio",
//       });
//       const formatLow = ytdl.chooseFormat(audioFormats, {
//         quality: "lowestaudio",
//       });

//       // Safely handle thumbnails
//       const thumbnails = info.videoDetails.thumbnails || [];
//       const maxresThumbnail = thumbnails.find((t) => t.width >= 1280);
//       const defaultThumbnail = thumbnails[thumbnails.length - 1];

//       // Response data
//       const response = {
//         id: videoId,
//         title: info.videoDetails.title,
//         duration: parseInt(info.videoDetails.lengthSeconds),
//         formats: {
//           high: formatHigh.url,
//           low: formatLow.url,
//         },
//         thumbnail: {
//           default: defaultThumbnail?.url,
//           high: thumbnails.find((t) => t.height >= 360)?.url,
//           maxres: maxresThumbnail?.url,
//         },
//         meta: {
//           channel: info.videoDetails.author?.name || "Unknown",
//           viewCount: info.videoDetails.viewCount || 0,
//           isLive: info.videoDetails.isLiveContent || false,
//         },
//       };

//       res.json(response);
//     } catch (err) {
//       console.error(`Error processing ${videoId}:`, err.message);

//       const statusCode = err.message.includes("Video unavailable") ? 404 : 500;
//       res.status(statusCode).json({
//         error: "Failed to process request",
//         message: err.message,
//         videoId,
//       });
//     }
//   }
// );
app.get(
  "/song/:id",
  validateYouTubeId,
  cacheMiddleware(300),
  async (req, res) => {
    const videoId = req.params.id;

    try {
      const info = await ytdl.getInfo(videoId, {
        lang: "en",
        requestOptions: {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        },
      });

      // Get only supported audio formats
      const audioFormats = ytdl
        .filterFormats(info.formats, "audioonly")
        .filter((f) =>
          ["audio/mp4", "audio/webm"].some((type) => f.mimeType?.includes(type))
        );

      if (audioFormats.length === 0) {
        return res
          .status(404)
          .json({ error: "No supported audio formats available" });
      }

      const formatHigh = ytdl.chooseFormat(audioFormats, {
        quality: "highestaudio",
      });
      const formatLow = ytdl.chooseFormat(audioFormats, {
        quality: "lowestaudio",
      });

      // Safely handle thumbnails
      const thumbnails = info.videoDetails.thumbnails || [];
      const maxresThumbnail = thumbnails.find((t) => t.width >= 1280);
      const defaultThumbnail = thumbnails[thumbnails.length - 1];

      // Response
      const response = {
        id: videoId,
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds),
        formats: {
          high: formatHigh.url,
          low: formatLow.url,
        },
        thumbnail: {
          default: defaultThumbnail?.url,
          high: thumbnails.find((t) => t.height >= 360)?.url,
          maxres: maxresThumbnail?.url,
        },
        meta: {
          channel: info.videoDetails.author?.name || "Unknown",
          viewCount: info.videoDetails.viewCount || 0,
          isLive: info.videoDetails.isLiveContent || false,
        },
      };

      res.json(response);
    } catch (err) {
      console.error(`Error processing ${videoId}:`, err.message);
      const statusCode = err.message.includes("Video unavailable") ? 404 : 500;
      res.status(statusCode).json({
        error: "Failed to process request",
        message: err.message,
        videoId,
      });
    }
  }
);
app.get(
  "/related/:id",
  validateYouTubeId,
  cacheMiddleware(300),
  async (req, res) => {
    const videoId = req.params.id;

    try {
      const info = await ytdl.getInfo(videoId);
      const related = info.related_videos?.slice(0, 15).map((video) => ({
        id: video.id,
        title: video.title,
        author: video.author?.name,
        thumbnail: video.thumbnails?.[0]?.url,
        duration: video.length_seconds,
      }));

      res.json({ videoId, related });
    } catch (err) {
      console.error(
        `Failed to fetch related videos for ${videoId}:`,
        err.message
      );
      res.status(500).json({
        error: "Failed to fetch related videos",
        message: err.message,
      });
    }
  }
);
app.get("/download/:id", validateYouTubeId, async (req, res) => {
  const videoId = req.params.id;

  try {
    const info = await ytdl.getInfo(videoId);
    const title = info.videoDetails.title.replace(/[^\w\s-]/gi, "");

    const format = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });

    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    ytdl(videoId, { format: format }).pipe(res);
  } catch (err) {
    console.error(`Error in /download/${videoId}:`, err.message);
    res.status(500).json({
      error: "Failed to process download request",
      message: err.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
