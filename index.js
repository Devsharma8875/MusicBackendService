const express = require("express");
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/song/:id", async (req, res) => {
  const videoId = req.params.id;

  if (!ytdl.validateID(videoId)) {
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
      audioFormatHigh: audioFormatHigh.url,
      audioFormatLow: audioFormatLow.url,
    });
  } catch (error) {
    console.error("Failed to fetch audio:", error.message);
    res.status(500).send(`Internal server error: "${error.message}"`);
  }
});

app.listen(3000, () => {
  console.log("Server is running at http://localhost:3000");
});
