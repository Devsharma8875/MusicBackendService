const express = require("express");
const app = express();
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  })
);

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

app.listen(PORT, () => {
  console.log("server is running on port 5000");
});
