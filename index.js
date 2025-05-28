const express = require("express");
const cors = require("cors");
const ytdl = require("@distube/ytdl-core");
require('dotenv').config(); // Load environment variables

const app = express();

// Configure CORS with allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));

// Helper function to format video details
const formatVideoDetails = (videoDetails) => ({
  id: videoDetails.videoId,
  title: videoDetails.title,
  author: videoDetails.author.name,
  duration: parseInt(videoDetails.lengthSeconds),
  thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url,
  viewCount: videoDetails.viewCount,
  uploadDate: videoDetails.uploadDate,
  keywords: videoDetails.keywords || [],
});

app.get("/", (req, res) => {
  res.send("🎵 YouTube Audio Stream & Download API");
});

// Audio stream endpoint
app.get("/song/:id", async (req, res) => {
  try {
    const info = await ytdl.getInfo(req.params.id);
    const audioFormatHigh = ytdl.chooseFormat(info.formats, {
      quality: "highest",
      filter: "audioonly",
    });
    const audioFormatLow = ytdl.chooseFormat(info.formats, {
      quality: "lowest",
      filter: "audioonly",
    });

    res.status(200).json({
      audioFormatHigh: audioFormatHigh.url,
      audioFormatLow: audioFormatLow.url,
    });
  } catch (err) {
    res.status(500).send(`Internal Server Error: "${err.message}"`);
  }
});

// Song information endpoint
app.get("/stream/:id", async (req, res) => {
  try {
    const info = await ytdl.getInfo(req.params.id);
    res.status(200).json(formatVideoDetails(info.videoDetails));
  } catch (err) {
    res.status(500).send(`Internal Server Error: "${err.message}"`);
  }
});

// Enhanced related songs endpoint
app.get("/related/:id", async (req, res) => {
  try {
    const info = await ytdl.getInfo(req.params.id);
    const relatedVideos = info.related_videos;

    const formattedRelated = relatedVideos
      .map((video) => ({
        id: video.id || null,
        title: video.title || null,
        author: video.author || null,
        length_seconds: video.length_seconds || null,
        thumbnails: video.thumbnails || null,
      }))
      .filter((video) => video.id); // Filter out invalid entries

    res.status(200).json(formattedRelated);
  } catch (err) {
    if (err instanceof Error)
      res.status(500).send(`Internal Server Error: "${err.message}"`);
  }
});

// New download endpoint
app.get("/download/:id", async (req, res) => {
  try {
    const videoId = req.params.id;
    const info = await ytdl.getInfo(videoId);

    // Encode filename for RFC 5987 (UTF-8)
    const filename = encodeRFC5987ValueChars(info.videoDetails.title) + ".mp3";

    // Set proper headers
    res.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${filename}`
    );
    res.header("Content-Type", "audio/mpeg");

    // Stream the audio
    ytdl(videoId, {
      quality: "highestaudio",
      filter: "audioonly",
    }).pipe(res);
  } catch (err) {
    res.status(500).send(`Download failed: ${err.message}`);
  }
});

// Helper function to encode RFC 5987 (UTF-8) filenames
function encodeRFC5987ValueChars(str) {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape) // i.e., %27 %28 %29
    .replace(/\*/g, "%2A")
    .replace(/%(?:7C|60|5E)/g, unescape);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 Server running in ${process.env.NODE_ENV || 'development'} mode at http://localhost:${PORT}`);
});
