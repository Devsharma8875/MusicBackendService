const express = require("express");
const cors = require("cors");
const axios = require("axios");
const ytdl = require("@distube/ytdl-core");

const app = express();
app.use(cors());

const API_KEY = "AIzaSyAWLThp1erO5-sRBtT84RcWsy8_0EqQBM4"; // Replace with your API key

// Route: Get YouTube metadata using YouTube Data API
app.get("/song/:id", async (req, res) => {
  const videoId = req.params.id;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "Invalid YouTube Video ID" });
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${API_KEY}`;
    const response = await axios.get(url);
    const items = response.data.items;

    if (!items || items.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = items[0];
    const { title, thumbnails } = video.snippet;
    const durationISO = video.contentDetails.duration;

    const durationSeconds = iso8601DurationToSeconds(durationISO);

    res.status(200).json({
      id: videoId,
      title,
      duration: durationSeconds,
      thumbnails,
    });
  } catch (error) {
    console.error("Failed to fetch video metadata:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route: Get YouTube audio URLs using ytdl-core
app.get("/audio/:id", async (req, res) => {
  const videoId = req.params.id;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "Invalid YouTube Video ID" });
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(url);

    const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
    console.log("Audio formats found:", audioFormats.length);

    const high = audioFormats.find(
      (f) => f.audioBitrate >= 128 && f.mimeType.includes("audio/webm")
    )?.url;

    const low = audioFormats.find(
      (f) => f.audioBitrate < 128 && f.mimeType.includes("audio/webm")
    )?.url;

    if (!high && !low) {
      console.log("No suitable audio formats found.");
      return res.status(404).json({ error: "No suitable audio formats found" });
    }

    res.json({
      audioFormatHigh: high,
      audioFormatLow: low || high,
    });
  } catch (error) {
    console.error("Error fetching audio:", error); // full error object
    res.status(500).json({ error: "Failed to fetch audio" });
  }
});

// Helper: Convert ISO 8601 to seconds
function iso8601DurationToSeconds(duration) {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);

  const hours = parseInt(matches[1] || 0, 10);
  const minutes = parseInt(matches[2] || 0, 10);
  const seconds = parseInt(matches[3] || 0, 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
