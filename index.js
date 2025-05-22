const express = require("express");
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/song/:id", async (req, res) => {
  const videoId = req.params.id;

  // Simple validation (YouTube video IDs are 11 characters)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "Invalid YouTube Video ID" });
  }

  try {
    const info = await ytdl.getInfo(videoId);

    const audioFormatHigh = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
      filter: "audioonly",
    });

    const audioFormatLow = ytdl.chooseFormat(info.formats, {
      quality: "lowestaudio",
      filter: "audioonly",
    });

    res.status(200).json({
      id: videoId,
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds,
      audioHigh: audioFormatHigh.url,
      audioLow: audioFormatLow.url,
      thumbnail: info.videoDetails.thumbnails.pop()?.url || null,
    });
  } catch (err) {
    console.error("Failed to fetch audio:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch audio", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
