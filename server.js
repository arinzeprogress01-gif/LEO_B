import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LEO API is running.",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "LEO backend is healthy.",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LEO API running on port ${PORT}`);
});