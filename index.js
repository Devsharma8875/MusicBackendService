require("dotenv").config();
const express = require("express");
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cache = require("memory-cache");
const { HttpsProxyAgent } = require("https-proxy-agent");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const config = {
  userAgents: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  ],
  maxRetries: 3,
  retryDelay: 2000,
  cookieRefreshThreshold: 3,
};

// State management
let authFailures = 0;
let lastCookieRefresh = Date.now();

// Security middleware
app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  })
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
});

// Enhanced cache middleware
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = `__express__${req.originalUrl}`;
    const cachedBody = cache.get(key);

    if (cachedBody) {
      res.send(cachedBody);
      return;
    }

    res.sendResponse = res.send;
    res.send = (body) => {
      if (res.statusCode < 400) {
        cache.put(key, body, duration * 1000);
      }
      res.sendResponse(body);
    };
    next();
  };
};

// Validate YouTube ID middleware
const validateYouTubeId = (req, res, next) => {
  const videoId = req.params.id;
  if (!ytdl.validateID(videoId)) {
    return res.status(400).json({
      error: "Invalid YouTube Video ID",
      message: "ID must be exactly 11 alphanumeric characters",
    });
  }
  next();
};

// Helper functions
const getRandomUserAgent = () =>
  config.userAgents[Math.floor(Math.random() * config.userAgents.length)];

const fetchWithRetry = async (fn, retries = config.maxRetries) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
    return fetchWithRetry(fn, retries - 1);
  }
};

// Cookie management
const parseCookies = () => {
  if (!process.env.YOUTUBE_COOKIES) return [];

  return process.env.YOUTUBE_COOKIES.split(";").map((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    return {
      name: name.trim(),
      value: rest.join("=").trim(),
      domain: ".youtube.com",
      path: "/",
      expires: Math.floor((Date.now() + 86400 * 1000) / 1000), // 1 day from now
      httpOnly: true,
      secure: true,
    };
  });
};

const getYouTubeInfo = async (videoId) => {
  const cookies = parseCookies();

  const options = {
    lang: "en",
    requestOptions: {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "X-Origin": "https://www.youtube.com",
        Referer: "https://www.youtube.com/",
        Origin: "https://www.youtube.com",
      },
      timeout: 15000,
    },
  };

  if (cookies.length > 0) {
    options.requestOptions.headers.Cookie = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  if (process.env.HTTP_PROXY) {
    options.requestOptions.agent = new HttpsProxyAgent(process.env.HTTP_PROXY);
  }

  return ytdl.getInfo(videoId, options);
};

// Audio streaming endpoint
app.get(
  "/song/:id",
  validateYouTubeId,
  apiLimiter,
  cacheMiddleware(300),
  async (req, res) => {
    const videoId = req.params.id;

    try {
      const info = await fetchWithRetry(() => getYouTubeInfo(videoId));

      const audioFormats = ytdl
        .filterFormats(info.formats, "audioonly")
        .filter(
          (format) =>
            format.codecs &&
            format.bitrate &&
            format.contentLength > 0 &&
            format.url
        );

      if (audioFormats.length === 0) {
        return res.status(404).json({
          error: "No playable audio formats available",
          videoId,
        });
      }

      const selectFormat = (quality) => {
        const opusFormat = audioFormats.find(
          (f) =>
            f.codecs.includes("opus") &&
            (quality === "high" ? f.bitrate > 128000 : f.bitrate <= 128000)
        );
        return (
          opusFormat ||
          ytdl.chooseFormat(audioFormats, {
            quality: quality === "high" ? "highestaudio" : "lowestaudio",
          })
        );
      };

      const formatHigh = selectFormat("high");
      const formatLow = selectFormat("low");

      if (!formatHigh.url || !formatLow.url) {
        throw new Error("Failed to get valid stream URLs");
      }

      const response = {
        id: videoId,
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds),
        formats: {
          high: formatHigh.url,
          low: formatLow.url,
          highMeta: {
            bitrate: formatHigh.bitrate,
            codec: formatHigh.codecs,
            container: formatHigh.container,
          },
          lowMeta: {
            bitrate: formatLow.bitrate,
            codec: formatLow.codecs,
            container: formatLow.container,
          },
        },
        thumbnail: info.videoDetails.thumbnails?.slice(-1)[0]?.url || null,
        meta: {
          channel: info.videoDetails.author?.name,
          viewCount: info.videoDetails.viewCount,
          isLive: info.videoDetails.isLiveContent,
        },
      };

      res.json(response);
    } catch (err) {
      console.error(`Error processing ${videoId}:`, err.message);

      let statusCode = 500;
      let errorMessage = "Failed to process request";

      if (
        err.message.includes("unavailable") ||
        err.message.includes("private")
      ) {
        statusCode = 404;
        errorMessage = "Video is unavailable or private";
      } else if (
        err.message.includes("bot") ||
        err.message.includes("Sign in")
      ) {
        authFailures++;
        statusCode = 403;
        errorMessage =
          "YouTube blocked the request. Cookies may need refreshing.";

        if (authFailures >= config.cookieRefreshThreshold) {
          console.warn(
            "Multiple auth failures detected. Please refresh YouTube cookies."
          );
        }
      }

      res.status(statusCode).json({
        error: errorMessage,
        message: err.message,
        videoId,
        authFailures,
        suggestion:
          statusCode === 403
            ? "Refresh your YouTube cookies in the .env file"
            : undefined,
      });
    }
  }
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    authFailures,
    lastCookieRefresh: new Date(lastCookieRefresh).toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("Cookies loaded:", process.env.YOUTUBE_COOKIES ? "Yes" : "No");
  console.log("User agents available:", config.userAgents.length);
});
